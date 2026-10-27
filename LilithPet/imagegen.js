const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_ORIGIN = 'https://image-generation.perchance.org';
const DEFAULT_PAGE = 'https://perchance.org/ai-text-to-image-generator';
const KEY_PARTITION = 'persist:perchance';
const MAX_PROMPT = 750;
const MAX_PER_DAY = 30;
const MIN_GAP_MS = 4000;
const REQUEST_TIMEOUT_MS = 30000;
const GENERATE_TIMEOUT_MS = 120000;
const KEY_TIMEOUT_MS = 210000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanPrompt(value) {
  return String(value || '')
    .replace(/[`\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROMPT);
}

// Cloudflare challenges plain Node requests, so API calls must reuse the browser
// session that already solved the challenge for the generator page.
function defaultFetch() {
  const { session } = require('electron');
  const ses = session.fromPartition(KEY_PARTITION);
  return (url, options) => ses.fetch(url, options);
}

async function readJson(res) {
  const type = String(res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text().catch(() => '');
  if (text.trimStart().startsWith('<') || type.includes('html')) return { challenge: true, data: null };
  try {
    return { challenge: false, data: JSON.parse(text) };
  } catch {
    return { challenge: false, data: null };
  }
}

const FILL_AND_CLICK = `(() => {
  const box = document.querySelector('textarea') || document.querySelector('[contenteditable]');
  if (box) {
    box.focus();
    const value = 'a detailed illustration';
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const desc = box.tagName === 'TEXTAREA' ? setter : inputSetter;
      if (desc && desc.set) desc.set.call(box, value); else box.value = value;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, value);
    }
  }
  const btn = document.getElementById('generateButtonEl')
    || Array.from(document.querySelectorAll('button')).find((x) => /generate/i.test(x.textContent || ''));
  if (!btn) return 'missing';
  btn.click();
  return 'clicked';
})()`;

async function defaultMintKey({ pageUrl = DEFAULT_PAGE, timeoutMs = KEY_TIMEOUT_MS } = {}) {
  const { BrowserWindow, session } = require('electron');
  const ses = session.fromPartition(KEY_PARTITION);
  return new Promise((resolve, reject) => {
    let settled = false;
    let key = null;
    let clicker = null;
    let timer = null;
    let attemptTimer = null;
    const win = new BrowserWindow({
      width: 560,
      height: 760,
      show: false,
      title: 'Perchance',
      autoHideMenuBar: true,
      webPreferences: {
        partition: KEY_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // A hidden window throttles timers by default, which stalls the page.
        backgroundThrottling: false,
      },
    });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(clicker);
      clearTimeout(timer);
      clearTimeout(attemptTimer);
      try { ses.webRequest.onBeforeRequest(null); } catch {}
      if (!win.isDestroyed()) win.close();
      if (error) reject(error);
      else resolve(key);
    };
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const match = /[?&]userKey=([a-f0-9]{64})/i.exec(details.url || '');
      // The callback must always run, otherwise the request stalls forever.
      callback({});
      if (match) {
        if (process.env.PERCHANCE_DEBUG) console.log('mint key captured');
        key = match[1];
        finish(null);
      }
    });
    // The key is minted when the generator page's button is pressed. Clicking opens
    // the image-generation embed, which takes a while to verify, so do not re-click
    // before it had a chance to emit its request. Never click before a page is loaded.
    let loaded = false;
    let lastClickAt = 0;
    win.webContents.on('did-finish-load', () => { loaded = true; });
    clicker = setInterval(() => {
      if (settled || win.isDestroyed() || !loaded) return;
      if (Date.now() - lastClickAt < 6000) return;
      lastClickAt = Date.now();
      for (const frame of win.webContents.mainFrame.framesInSubtree) {
        frame.executeJavaScript(FILL_AND_CLICK, false)
          .then((r) => { if (process.env.PERCHANCE_DEBUG) console.log('mint click', r, frame.url.slice(0, 60)); })
          .catch(() => {});
      }
    }, 1500);
    timer = setTimeout(() => finish(new Error('key-timeout')), timeoutMs);
    win.on('closed', () => finish(new Error('key-cancelled')));
    // The Cloudflare handshake sometimes stalls on proxied exits. Abort and reload
    // after a while; challenge cookies carry over between attempts. A challenge page
    // that reloads itself rejects the original loadURL promise with ERR_ABORTED, so
    // only an actual timeout (or a real net error) counts as a failed attempt.
    const ATTEMPT_MS = 30000;
    let attempts = 0;
    const retry = () => {
      if (settled || win.isDestroyed()) return;
      if (process.env.PERCHANCE_DEBUG) console.log('mint retry, attempts=' + attempts);
      if (attempts >= 6) finish(new Error('network'));
      else setTimeout(tryLoad, 2000);
    };
    const tryLoad = () => {
      if (settled || win.isDestroyed()) return;
      attempts += 1;
      if (process.env.PERCHANCE_DEBUG) console.log('mint load attempt ' + attempts);
      clearTimeout(attemptTimer);
      attemptTimer = setTimeout(() => {
        if (settled || win.isDestroyed()) return;
        try { win.webContents.stop(); } catch {}
        retry();
      }, ATTEMPT_MS);
      win.loadURL(pageUrl).catch(() => {});
    };
    win.webContents.on('did-finish-load', () => {
      if (process.env.PERCHANCE_DEBUG) console.log('mint load finished ' + win.webContents.getURL().slice(0, 80));
      // The challenge page itself finishes loading before the generator does; watch
      // for the real page and reload if nothing clickable shows up.
      clearTimeout(attemptTimer);
      attemptTimer = setTimeout(async () => {
        if (settled || win.isDestroyed()) return;
        let hasButton = false;
        for (const frame of win.webContents.mainFrame.framesInSubtree) {
          if (await frame.executeJavaScript("!!document.getElementById('generateButtonEl')").catch(() => false)) {
            hasButton = true;
            break;
          }
        }
        if (settled || win.isDestroyed() || hasButton) return;
        try { win.webContents.stop(); } catch {}
        retry();
      }, 60000);
    });
    win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (process.env.PERCHANCE_DEBUG) console.log('mint load fail', code, desc, isMainFrame, String(url).slice(0, 80));
      if (!isMainFrame || settled || code === -3) return;
      clearTimeout(attemptTimer);
      retry();
    });
    tryLoad();
  });
}

function createImagegen({
  dir,
  origin = process.env.PERCHANCE_ORIGIN || DEFAULT_ORIGIN,
  pageUrl = process.env.PERCHANCE_PAGE || DEFAULT_PAGE,
  mintKey = defaultMintKey,
  fetchImpl = null,
} = {}) {
  if (!dir) throw new Error('imagegen: dir is required');
  const storeFile = path.join(dir, 'perchance-key.json');
  let keyJob = null;
  let queue = Promise.resolve();
  let doFetch = fetchImpl;

  async function request(url, timeout = REQUEST_TIMEOUT_MS, options = {}) {
    if (!doFetch) doFetch = defaultFetch();
    try {
      return await doFetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        headers: { Accept: 'application/json' },
        ...options,
      });
    } catch {
      throw new Error('network');
    }
  }

  function readStore() {
    try {
      const value = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function writeStore(value) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${storeFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
      fs.renameSync(tmp, storeFile);
    } catch {}
  }

  async function verifyKey(userKey) {
    const url = `${origin}/api/checkUserVerificationStatus?userKey=${encodeURIComponent(userKey)}&cacheKey=${Math.random()}`;
    let res;
    try {
      res = await request(url, 15000);
    } catch {
      return false;
    }
    if (!res.ok) return false;
    const { data } = await readJson(res);
    return !!data && data.status === 'verified';
  }

  async function mintFreshKey() {
    const key = await mintKey({ pageUrl, timeoutMs: KEY_TIMEOUT_MS });
    if (!/^[a-f0-9]{64}$/i.test(String(key || ''))) throw new Error('key-invalid');
    const store = readStore();
    store.userKey = key;
    store.mintedAt = Date.now();
    writeStore(store);
    return key;
  }

  function ensureKey() {
    if (keyJob) return keyJob;
    keyJob = (async () => {
      const store = readStore();
      if (store.userKey) {
        if (await verifyKey(store.userKey)) return store.userKey;
      }
      return mintFreshKey();
    })().finally(() => {
      keyJob = null;
    });
    return keyJob;
  }

  function reserve() {
    const store = readStore();
    const day = today();
    const usage = store.usage && store.usage.date === day ? store.usage : { date: day, count: 0 };
    if (usage.count >= MAX_PER_DAY) throw new Error('daily-limit');
    usage.count += 1;
    store.usage = usage;
    writeStore(store);
    return store;
  }

  async function run(prompt) {
    const cleaned = cleanPrompt(prompt);
    if (!cleaned) throw new Error('prompt-empty');
    const previous = readStore();
    const gap = MIN_GAP_MS - (Date.now() - Number(previous.lastAt || 0));
    if (gap > 0) await sleep(gap);
    reserve();

    let userKey = await ensureKey();
    let reminted = false;
    let imageId = null;
    let extension = '';
    let lastError = null;
    const deadline = Date.now() + GENERATE_TIMEOUT_MS;
    const requestId = `0.${Math.random().toString().slice(2)}`;

    while (Date.now() < deadline) {
      const url = `${origin}/api/generate?userKey=${encodeURIComponent(userKey)}`
        + `&requestId=${requestId}&adAccessCode=&__cacheBust=${Math.random()}`;
      const payload = JSON.stringify({
        prompt: cleaned,
        negativePrompt: '',
        seed: -1,
        resolution: '512x768',
        guidanceScale: 7,
        channel: 'ai-text-to-image-generator',
        subChannel: 'public',
        userKey,
        adAccessCode: '',
        requestId,
      });
      let res;
      try {
        res = await request(url, REQUEST_TIMEOUT_MS, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: payload,
        });
      } catch (error) {
        lastError = error;
        await sleep(2500);
        continue;
      }
      const { challenge, data } = await readJson(res);
      const status = data && typeof data.status === 'string' ? data.status : '';
      if (challenge || status === 'invalid_key' || status === 'not_verified') {
        if (reminted) throw new Error('perchance-invalid-key');
        reminted = true;
        const store = readStore();
        delete store.userKey;
        writeStore(store);
        userKey = await mintFreshKey();
        continue;
      }
      if (data && typeof data.imageId === 'string' && data.imageId) {
        imageId = data.imageId;
        extension = typeof data.fileExtension === 'string' ? data.fileExtension : '';
        break;
      }
      if (status === 'invalid_parameter') throw new Error('perchance-parameter');
      if (!res.ok) lastError = new Error('perchance-http');
      // 'waiting_for_prev_request_to_finish' just means Perchance's queue is busy.
      await sleep(3000);
    }
    if (!imageId) throw lastError || new Error('perchance-busy');

    const download = await request(
      `${origin}/api/downloadTemporaryImage?imageId=${encodeURIComponent(imageId)}`,
      60000,
      { headers: { Accept: 'image/*' } }
    );
    if (!download.ok) throw new Error('perchance-download');
    const type = String(download.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) throw new Error('perchance-download');
    const bytes = Buffer.from(await download.arrayBuffer());
    if (!bytes.length) throw new Error('perchance-download');

    fs.mkdirSync(dir, { recursive: true });
    const safeId = String(imageId).replace(/[^a-z0-9]/gi, '').slice(0, 24) || crypto.randomUUID();
    const ext = extension === 'png' ? '.png' : extension === 'webp' ? '.webp'
      : type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
    const file = `${Date.now()}-${safeId}${ext}`;
    fs.writeFileSync(path.join(dir, file), bytes);

    const store = readStore();
    store.lastAt = Date.now();
    writeStore(store);
    return { file, prompt: cleaned };
  }

  function generate(prompt) {
    const job = queue.then(() => run(prompt), () => run(prompt));
    queue = job.catch(() => {});
    return job;
  }

  function filePath(file) {
    const name = path.basename(String(file || ''));
    if (!name || name !== file || !/^[\w.-]+$/.test(name)) return null;
    const full = path.join(dir, name);
    try {
      return fs.statSync(full).isFile() ? full : null;
    } catch {
      return null;
    }
  }

  function dataUrl(file) {
    const full = filePath(file);
    if (!full) return null;
    try {
      const bytes = fs.readFileSync(full);
      if (!bytes.length || bytes.length > 12 * 1024 * 1024) return null;
      const ext = path.extname(full).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      return null;
    }
  }

  return { generate, dataUrl, filePath };
}

module.exports = { createImagegen, cleanPrompt, MAX_PROMPT };
