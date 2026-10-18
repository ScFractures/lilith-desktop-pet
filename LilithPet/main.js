const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { STRINGS, normalizeLang, langFromLocale } = require('./i18n');

// Transparent windows crash the GPU process (0xC0000005) on a class of Windows
// graphics stacks; disabling DirectComposition was the verified fix on real
// hardware, and is harmless where it is not needed
if (process.platform === 'win32') app.commandLine.appendSwitch('disable-direct-composition');

// Window sizes include ~150-260px of transparent headroom above the pet so a jump never clips her head
const WINDOW_SIZES = { small: [270, 458], medium: [340, 560], large: [430, 725] };
// Model key -> i18n label key. The GLB files live in LilithPet/assets/.
const MODELS = { lilith: 'modelLilith', lilith_maou: 'modelMaou' };
const DEFAULT_MODEL = 'lilith';
const FLOOR_INSET = 24;
const GRAVITY = 2600;
const WALK_TICK = 16;

let win = null;
let tray = null;
let cfgFile = null;
const settings = { x: null, y: null, size: 'medium', lang: null, model: DEFAULT_MODEL };

const T = () => STRINGS[settings.lang] || STRINGS.zh;

let dragging = false;
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };
let dragLast = null;
let dragLastT = 0;
let releaseVel = { x: 0, y: 0 };
let fallTimer = null;

const TEST_MODE = !!process.env.PET_TEST;
// Test instance gets its own userData dir: no single-instance lock clash with the production
// instance, and the real config is never touched
if (TEST_MODE) {
  const testUserData = path.join(os.tmpdir(), 'lilith-pet-test');
  fs.mkdirSync(testUserData, { recursive: true });
  app.setPath('userData', testUserData);
}
let walkState = null;
let petSleeping = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function workArea(bounds) {
  return screen.getDisplayMatching(bounds).workArea;
}

function clampToScreen(x, y, w, h) {
  const wa = workArea({ x: Math.round(x), y: Math.round(y), width: w, height: h });
  return [
    Math.min(Math.max(x, wa.x), wa.x + wa.width - w),
    Math.min(Math.max(y, wa.y), wa.y + wa.height - h),
  ];
}

function loadCfg() {
  try {
    Object.assign(settings, JSON.parse(fs.readFileSync(cfgFile, 'utf8')));
  } catch {}
  if (!WINDOW_SIZES[settings.size]) settings.size = 'medium';
  if (!MODELS[settings.model]) settings.model = DEFAULT_MODEL;
  settings.lang = normalizeLang(settings.lang) || langFromLocale(app.getLocale());
}

let saveTimer = null;
function saveCfgSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(cfgFile, JSON.stringify(settings));
    } catch {}
  }, 400);
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// ---------------------------------------------------------------- AI chat
const aiConfigPath = () => path.join(app.getPath('userData'), 'ai-config.json');

function loadAiConfig() {
  try {
    return JSON.parse(fs.readFileSync(aiConfigPath(), 'utf8'));
  } catch {
    return null;
  }
}

function normalizedAiConfig(cfg) {
  if (!cfg) return null;
  const clean = {
    baseUrl: String(cfg.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(cfg.apiKey || '').trim(),
    model: String(cfg.model || '').trim(),
  };
  if (!/^https?:\/\//.test(clean.baseUrl) || !clean.apiKey || !clean.model) return null;
  return clean;
}

async function aiChatRequest(cfg, messages) {
  const url = /\/chat\/completions$/.test(cfg.baseUrl)
    ? cfg.baseUrl
    : `${cfg.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    // Short desktop-pet replies: cap at 400 tokens; if the cap is hit, trim back to the last sentence end below
    body: JSON.stringify({ model: cfg.model, messages, max_tokens: 400, temperature: 0.8, stream: false }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${t ? ': ' + t.slice(0, 180) : ''}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const reply = choice?.message?.content;
  if (!reply) throw new Error(T().errEmptyReply);
  let text = String(reply).trim();
  if (choice?.finish_reason === 'length') {
    // Truncated by the token cap: fall back to the nearest sentence end so half a sentence is never shown
    const m = text.match(/^[\s\S]*[。！？!?]/);
    if (m) text = m[0];
  }
  return text;
}

ipcMain.handle('ai-chat', async (_e, messages) => {
  const cfg = normalizedAiConfig(loadAiConfig());
  if (!cfg) return { error: 'no-config' };
  try {
    const list = Array.isArray(messages) ? messages : [];
    const trimmed = list[0] && list[0].role === 'system'
      ? [list[0], ...list.slice(1).slice(-13)]
      : list.slice(-14);
    return { reply: await aiChatRequest(cfg, trimmed) };
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? T().errTimeout : String(e.message || e) };
  }
});

ipcMain.handle('ai-get-config', () => loadAiConfig());

ipcMain.handle('ai-save-config', (_e, cfg) => {
  const clean = normalizedAiConfig(cfg);
  if (!clean) return { error: T().errConfigFormat };
  try {
    fs.writeFileSync(aiConfigPath(), JSON.stringify(clean, null, 2));
    return { ok: true };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

ipcMain.handle('ai-test', async (_e, cfg) => {
  const c = normalizedAiConfig(cfg) || normalizedAiConfig(loadAiConfig());
  if (!c) return { error: T().errConfigIncomplete };
  try {
    return { reply: await aiChatRequest(c, [{ role: 'user', content: T().aiTestProbe }]) };
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? T().errTimeout : String(e.message || e) };
  }
});

ipcMain.on('set-focusable', (_e, v) => {
  if (!win || win.isDestroyed()) return;
  if (v) {
    win.setFocusable(true);
    if (process.platform === 'darwin') app.focus({ steal: true });
    win.focus();
  } else {
    win.setFocusable(false);
  }
});

let settingsWin = null;
function openAiSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 460,
    height: 440,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: T().aiSettingsTitle,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

ipcMain.on('open-ai-settings', () => openAiSettings());

function setLanguage(lang) {
  if (!normalizeLang(lang) || settings.lang === lang || !cfgFile) return;
  settings.lang = lang;
  try { fs.writeFileSync(cfgFile, JSON.stringify(settings)); } catch {}
  const payload = { lang, dict: T() };
  send('i18n', payload);
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.setTitle(T().aiSettingsTitle);
    settingsWin.webContents.send('i18n', payload);
  }
  if (tray) refreshTrayMenu();
}

ipcMain.handle('i18n-get', () => ({ lang: settings.lang, dict: T() }));

function currentFloorY(height) {
  const b = win.getBounds();
  return workArea(b).y + workArea(b).height - height;
}

function createWindow() {
  const [w, h] = WINDOW_SIZES[settings.size];
  let x = settings.x;
  let y = settings.y;
  if (x == null || y == null) {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + wa.width - w - 80;
    y = wa.y + wa.height - h;
  }
  [x, y] = clampToScreen(Math.round(x), Math.round(y), w, h);

  win = new BrowserWindow({
    x: Math.round(x),
    y: Math.round(y),
    width: w,
    height: h,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  // Deliberately not calling setVisibleOnAllWorkspaces: on this macOS, an "All Spaces" window
  // floats above other apps' fullscreen Spaces. A plain window is auto-hidden while a fullscreen
  // Space is active and restored on exit — exactly the wanted "hidden in fullscreen" behavior.
  // (This machine has a single desktop Space, so omitting it changes nothing day to day.)
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('console-message', (_e, _level, message, line, source) => {
    console.log(`[renderer] ${message} (${path.basename(source || '')}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d.reason));
}

function stopDrag() {
  dragging = false;
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
}

function stopWalk() {
  if (walkState) clearInterval(walkState.timer);
  walkState = null;
}

function stopFall() {
  if (fallTimer) clearInterval(fallTimer);
  fallTimer = null;
}

function persistPos() {
  if (!win) return;
  const b = win.getBounds();
  settings.x = b.x;
  settings.y = b.y;
  saveCfgSoon();
}

function onDragTick() {
  if (!win || !dragging) return;
  if (TEST_MODE) return;
  const cur = screen.getCursorScreenPoint();
  const now = Date.now();
  const dt = Math.max(1, now - dragLastT);
  const nx = cur.x - dragOffset.x;
  const ny = cur.y - dragOffset.y;
  const b = win.getBounds();
  const [cx, cy] = clampToScreen(nx, ny, b.width, b.height);
  releaseVel.x = 0.75 * releaseVel.x + 0.25 * ((cx - b.x) / dt) * 16;
  releaseVel.y = 0.75 * releaseVel.y + 0.25 * ((cy - b.y) / dt) * 16;
  dragLastT = now;
  win.setPosition(Math.round(cx), Math.round(cy));
}

function startFall(vx, vy) {
  stopFall();
  let last = Date.now();
  let px = win.getBounds().x;
  fallTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return stopFall();
    const now = Date.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const b = win.getBounds();
    const wa = workArea(b);
    const floor = wa.y + wa.height - b.height;
    vy += GRAVITY * dt;
    let nx = b.x + vx * dt;
    let ny = b.y + vy * dt;
    vx *= Math.exp(-0.6 * dt);
    if (nx <= wa.x || nx >= wa.x + wa.width - b.width) {
      vx = -vx * 0.35;
      nx = Math.min(Math.max(nx, wa.x), wa.x + wa.width - b.width);
    }
    if (ny >= floor) {
      ny = floor;
      const speed = vy;
      win.setPosition(Math.round(nx), Math.round(ny));
      stopFall();
      px = Math.round(nx);
      persistPos();
      send('pet-event', 'land', { speed: Math.min(speed / 2200, 2.2) });
      if (speed > 2600) {
        // hard landing: little bounce
        setTimeout(() => {
          let v2 = 420;
          let last2 = Date.now();
          const t2 = setInterval(() => {
            const n2 = Date.now();
            const d2 = Math.min((n2 - last2) / 1000, 0.05);
            last2 = n2;
            const bb = win.getBounds();
            v2 -= GRAVITY * d2;
            let yy = bb.y + v2 * d2;
            const fl = workArea(bb).y + workArea(bb).height - bb.height;
            if (yy >= fl || v2 < 0) {
              clearInterval(t2);
              win.setPosition(bb.x, fl);
              return;
            }
            win.setPosition(bb.x, Math.round(yy));
          }, WALK_TICK);
        }, 90);
      }
      return;
    }
    win.setPosition(Math.round(nx), Math.round(ny));
    px = Math.round(nx);
  }, 10);
}

function startWalk(targetX, speed) {
  stopWalk();
  let last = Date.now();
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) return stopWalk();
    const now = Date.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const b = win.getBounds();
    const wa = workArea(b);
    const t = Math.min(Math.max(targetX, wa.x), wa.x + wa.width - b.width);
    const dx = t - b.x;
    const step = speed * dt;
    if (Math.abs(dx) <= step || step === 0) {
      win.setPosition(Math.round(t), b.y);
      stopWalk();
      persistPos();
      send('pet-event', 'walk-arrived', {});
      return;
    }
    win.setPosition(Math.round(b.x + Math.sign(dx) * step), b.y);
  }, WALK_TICK);
  walkState = { timer };
}

function applySize(size) {
  if (!WINDOW_SIZES[size]) return;
  settings.size = size;
  if (!win) return;
  const b = win.getBounds();
  const [w, h] = WINDOW_SIZES[size];
  const cx = b.x + b.width / 2;
  const bottom = b.y + b.height;
  let [x, y] = clampToScreen(Math.round(cx - w / 2), Math.round(bottom - h), w, h);
  win.setBounds({ x, y, width: w, height: h });
  persistPos();
}

function petVisible() {
  return win && !win.isDestroyed() && win.isVisible();
}

function toggleVisible(force) {
  if (!win) return false;
  const show = force != null ? force : !win.isVisible();
  if (show) {
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    send('pet-visibility', true);
  } else {
    win.hide();
    send('pet-visibility', false);
  }
  return show;
}

function resetPosition() {
  if (!win) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const b = win.getBounds();
  win.setPosition(Math.round(wa.x + wa.width - b.width - 80), Math.round(wa.y + wa.height - b.height));
  persistPos();
}

// --- Windows: hide the pet while another app is fullscreen -------------------
// Electron has no cross-platform API for "is another app fullscreen", so on
// Windows a small PowerShell loop watches the foreground window and reports
// 1/0 when it starts/ends covering its whole monitor. This matches the macOS
// behavior, where the pet is auto-hidden while a fullscreen Space is active.
let fsWatcher = null;
let fsHidden = false;

const FS_SCRIPT = `
Add-Type -Namespace PetFS -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
[DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
[StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
'@
[PetFS.Win]::SetProcessDPIAware() | Out-Null
$own = ${process.pid}
$prev = -1
while ($true) {
  if (-not (Get-Process -Id $own -ErrorAction SilentlyContinue)) { break }
  $fs = 0
  try {
    $h = [PetFS.Win]::GetForegroundWindow()
    $wpid = [uint32]0
    [PetFS.Win]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null
    if ($wpid -ne $own -and [PetFS.Win]::IsWindowVisible($h)) {
      $r = New-Object 'PetFS.Win+RECT'
      $m = New-Object 'PetFS.Win+MONITORINFO'
      $m.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($m)
      $hm = [PetFS.Win]::MonitorFromWindow($h, 2)
      if ([PetFS.Win]::GetWindowRect($h, [ref]$r) -and [PetFS.Win]::GetMonitorInfo($hm, [ref]$m)) {
        if ($r.L -le $m.rcMonitor.L + 1 -and $r.T -le $m.rcMonitor.T + 1 -and $r.R -ge $m.rcMonitor.R - 1 -and $r.B -ge $m.rcMonitor.B - 1) { $fs = 1 }
      }
    }
  } catch {}
  if ($fs -ne $prev) { [Console]::Out.WriteLine($fs); [Console]::Out.Flush(); $prev = $fs }
  Start-Sleep -Milliseconds 1500
}
`;

function startFullscreenWatcher() {
  if (fsWatcher) return;
  let p;
  try {
    p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', FS_SCRIPT], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return;
  }
  fsWatcher = p;
  p.on('error', () => { fsWatcher = null; });
  p.on('exit', () => { fsWatcher = null; });
  let buf = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      if (line === '1') setFullscreenHidden(true);
      else if (line === '0') setFullscreenHidden(false);
    }
  });
}

function setFullscreenHidden(on) {
  if (!win || win.isDestroyed()) return;
  if (on) {
    if (!petVisible()) return;
    fsHidden = true;
    win.hide();
  } else {
    if (!fsHidden) return;
    fsHidden = false;
    if (!petVisible()) {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  }
}

function trayIconPath(name) {
  return path.join(__dirname, 'assets', name);
}

function languageSubmenu(onPick) {
  const t = T();
  return {
    label: t.menuLanguage,
    submenu: [
      { code: 'zh', label: t.langZh },
      { code: 'en', label: t.langEn },
    ].map(({ code, label }) => ({
      label,
      type: 'radio',
      checked: settings.lang === code,
      click: () => { setLanguage(code); if (onPick) onPick(); },
    })),
  };
}

function selectModel(key) {
  if (!MODELS[key] || settings.model === key) return;
  settings.model = key;
  if (cfgFile) {
    try { fs.writeFileSync(cfgFile, JSON.stringify(settings)); } catch {}
  }
  send('pet-model', key);
  if (tray) refreshTrayMenu();
}

function modelSubmenu(onPick) {
  const t = T();
  return {
    label: t.menuModel,
    submenu: Object.entries(MODELS).map(([key, labelKey]) => ({
      label: t[labelKey],
      type: 'radio',
      checked: settings.model === key,
      click: () => { selectModel(key); if (onPick) onPick(); },
    })),
  };
}

function trayMenuTemplate() {
  const t = T();
  return [
    {
      label: petVisible() ? t.trayHide : t.trayShow,
      click: () => { toggleVisible(); refreshTrayMenu(); },
    },
    {
      label: t.menuSize,
      submenu: Object.entries({ small: t.sizeSmall, medium: t.sizeMedium, large: t.sizeLarge }).map(([k, v]) => ({
        label: v,
        type: 'radio',
        checked: settings.size === k,
        click: () => { applySize(k); refreshTrayMenu(); },
      })),
    },
    modelSubmenu(refreshTrayMenu),
    languageSubmenu(refreshTrayMenu),
    { label: t.trayReset, click: () => { toggleVisible(true); resetPosition(); } },
    { label: t.menuAiSettings, click: () => openAiSettings() },
    { type: 'separator' },
    { label: t.menuQuit, click: () => { persistPos(); app.quit(); } },
  ];
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate()));
}

function buildTray() {
  const img = nativeImage.createFromPath(trayIconPath('trayColor.png'));
  if (img.isEmpty()) return;
  tray = new Tray(img);
  tray.setToolTip('Lilith');
  refreshTrayMenu();
  tray.on('click', () => {
    toggleVisible();
    refreshTrayMenu();
  });
}

ipcMain.on('set-ignore-mouse', (_e, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on('pet-sleep', (_e, v) => { petSleeping = !!v; });

ipcMain.on('drag-start', (_e, { offsetX, offsetY }) => {
  if (!win) return;
  stopWalk();
  stopFall();
  dragging = true;
  dragOffset = { x: Math.round(offsetX), y: Math.round(offsetY) };
  dragLastT = Date.now();
  releaseVel = { x: 0, y: 0 };
  if (!dragTimer) dragTimer = setInterval(onDragTick, 8);
});

ipcMain.on('drag-end', () => {
  if (!dragging) return;
  stopDrag();
  persistPos();
  if (TEST_MODE) {
    send('pet-event', 'released', { vx: 0, vy: 0 });
    setTimeout(() => send('pet-event', 'land', { speed: 1.1 }), 700);
    return;
  }
  startFall(releaseVel.x, Math.max(releaseVel.y, 0));
  send('pet-event', 'released', { vx: releaseVel.x, vy: releaseVel.y });
});

ipcMain.on('walk-to', (_e, targetX, speed) => startWalk(targetX, speed));
ipcMain.on('walk-stop', () => { stopWalk(); persistPos(); send('pet-event', 'walk-arrived', {}); });

ipcMain.handle('get-info', () => {
  const b = win.getBounds();
  const wa = workArea(b);
  return { bounds: b, workArea: wa, size: settings.size, floorInset: FLOOR_INSET, model: settings.model };
});

ipcMain.handle('read-asset', (_e, relPath) => {
  const full = path.resolve(__dirname, relPath);
  if (!full.startsWith(path.resolve(__dirname) + path.sep)) throw new Error('bad path');
  return fs.readFileSync(full);
});

ipcMain.on('set-size', (_e, size) => applySize(size));

ipcMain.on('context-menu', (_e, at) => {
  if (!win) return;
  const t = T();
  const menu = Menu.buildFromTemplate([
    { label: t.menuChat, click: () => send('pet-cmd', 'chat') },
    { label: t.menuPat, click: () => send('pet-cmd', 'pat') },
    { label: t.menuWalk, click: () => send('pet-cmd', 'walk') },
    { label: t.menuSpin, click: () => send('pet-cmd', 'spin') },
    { label: t.menuJump, click: () => send('pet-cmd', 'jump') },
    { label: t.menuGreet, click: () => send('pet-cmd', 'greet') },
    { label: petSleeping ? t.menuWake : t.menuSleep, click: () => send('pet-cmd', 'sleep-toggle') },
    { type: 'separator' },
    { label: t.menuAiSettings, click: () => openAiSettings() },
    { type: 'separator' },
    {
      label: t.menuSize,
      submenu: Object.entries({ small: t.sizeSmall, medium: t.sizeMedium, large: t.sizeLarge }).map(([k, v]) => ({
        label: v,
        type: 'radio',
        checked: settings.size === k,
        click: () => applySize(k),
      })),
    },
    modelSubmenu(),
    languageSubmenu(),
    { label: t.menuHide, click: () => toggleVisible(false) },
    { type: 'separator' },
    { label: t.menuQuit, click: () => { persistPos(); app.quit(); } },
  ]);
  menu.popup({
    window: win,
    x: at && Number.isFinite(at.x) ? Math.round(at.x) : undefined,
    y: at && Number.isFinite(at.y) ? Math.round(at.y) : undefined,
  });
});

app.on('second-instance', () => toggleVisible(true));

function runInteractionTest() {
  const outDir = process.env.PET_TEST_DIR || '/tmp';
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `pet_test_${name}.png`), img.toPNG());
    console.log(`[test] shot ${name}`);
  };
  const js = (code) => win.webContents.executeJavaScript(code);
  const ev = (e) => win.webContents.sendInputEvent(e);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  (async () => {
    setLanguage('zh');
    await wait(2600);
    console.log('[test] state idle:', await js(`JSON.stringify({mode:window.__pet.mode, ign:window.__pet.ignoreState, hover:window.__pet.hover})`));
    await shot('a_idle');
    console.log('[test] greeting bubble:', await js(`JSON.stringify((() => { const b = document.getElementById('bubble'); const t = document.getElementById('bubbletext'); return { show: b.classList.contains('show'), text: t.textContent.slice(0, 12), scroll: b.classList.contains('scroll'), ch: t.clientHeight, sh: t.scrollHeight }; })())`));

    // --- model switch: hot-swap without restart + persisted choice ---
    selectModel('lilith');
    for (let i = 0; i < 30 && (await js(`window.__pet.model`)) !== 'lilith'; i++) await wait(200);
    selectModel('lilith_maou');
    let modelMao = false;
    for (let i = 0; i < 40; i++) {
      const s = JSON.parse(await js(`JSON.stringify({ model: window.__pet.model, loaded: window.__pet.loaded })`));
      if (s.model === 'lilith_maou' && s.loaded) { modelMao = true; break; }
      await wait(200);
    }
    await wait(600);
    await shot('m_model_maou');
    console.log('[test] model labels:', await js(`window.pet.i18nGet().then(p => JSON.stringify({ menu: p.dict.menuModel, classic: p.dict.modelLilith, maou: p.dict.modelMaou }))`));
    ev({ type: 'mouseMove', x: 170, y: 400 });
    await wait(300);
    console.log('[test] maou hover:', await js(`JSON.stringify({ ign: window.__pet.ignoreState, hover: window.__pet.hover })`));
    ev({ type: 'mouseMove', x: 10, y: 10 });
    await wait(200);
    let persistedModel = null;
    try { persistedModel = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'pet-state.json'), 'utf8')).model; } catch {}
    console.log('[test] model switch:', JSON.stringify({ switched: modelMao, model: await js(`window.__pet.model`), persisted: persistedModel }));
    selectModel('lilith');
    for (let i = 0; i < 40 && (await js(`window.__pet.model`)) !== 'lilith'; i++) await wait(200);
    console.log('[test] model restored:', await js(`window.__pet.model`));

    ev({ type: 'mouseMove', x: 170, y: 400 });
    await wait(300);
    console.log('[test] hover-over-pet:', await js(`JSON.stringify({ign:window.__pet.ignoreState, hover:window.__pet.hover, cursor:window.__pet.cursor})`));
    await shot('b_hover');

    ev({ type: 'mouseMove', x: 10, y: 10 });
    await wait(300);
    console.log('[test] hover-away:', await js(`JSON.stringify({ign:window.__pet.ignoreState, hover:window.__pet.hover})`));

    ev({ type: 'mouseMove', x: 170, y: 400 });
    await wait(200);
    ev({ type: 'mouseDown', x: 170, y: 400, button: 'left', clickCount: 1 });
    ev({ type: 'mouseMove', x: 178, y: 404 });
    ev({ type: 'mouseMove', x: 188, y: 408 });
    await wait(500);
    console.log('[test] dragging:', await js(`JSON.stringify({drag:window.__pet.dragging, mode:window.__pet.mode})`));
    await shot('c_drag');

    ev({ type: 'mouseUp', x: 188, y: 408, button: 'left', clickCount: 1 });
    await wait(400);
    console.log('[test] after release:', await js(`JSON.stringify({drag:window.__pet.dragging, mode:window.__pet.mode})`));
    await shot('d_falling');

    await wait(900);
    console.log('[test] after land:', await js(`JSON.stringify({mode:window.__pet.mode})`));
    await shot('e_landed');

    // --- menu commands: jump & spin ---
    const jumpProbe = js(`new Promise(res => { const st = window.__pet; let mx = 0; const t0 = performance.now(); const id = setInterval(() => { if (st.hopY > mx) mx = st.hopY; if (performance.now() - t0 > 1000) { clearInterval(id); res(mx); } }, 25); })`);
    send('pet-cmd', 'jump');
    await wait(390);
    await shot('i_jump_apex');
    const maxHopY = await jumpProbe;
    const innerH = await js(`window.innerHeight`);
    // 24 is BOTTOM_INSET and 0.613 is PET_HEIGHT_FRACTION, both matching renderer/app.js
    const petTopPx = 24 + innerH * 0.613 * (1 + maxHopY);
    console.log('[test] jump apex:', JSON.stringify({ maxHopY: Number(maxHopY.toFixed(3)), petTopPx: Math.round(petTopPx), innerH, fits: petTopPx <= innerH - 4 }));
    send('pet-cmd', 'spin');
    await wait(200);
    console.log('[test] spin:', await js(`JSON.stringify({spinLeft:window.__pet.spinLeft})`));
    await wait(1200);

    // --- auto walk must keep working ---
    send('pet-cmd', 'walk');
    await wait(300);
    const wx1 = await js(`window.pet.getInfo().then(i => i.bounds.x)`);
    const wmode1 = await js(`window.__pet.mode`);
    await wait(1200);
    const wx2 = await js(`window.pet.getInfo().then(i => i.bounds.x)`);
    console.log('[test] walk:', JSON.stringify({mode: wmode1, x1: wx1, x2: wx2, moved: wx1 !== wx2}));
    for (let i = 0; i < 30 && (await js(`window.__pet.mode`)) === 'walking'; i++) await wait(400);
    console.log('[test] walk-arrived mode:', await js(`window.__pet.mode`));

    // --- rapid clicks: no re-jump while airborne, otherwise stacked hops push her head out of the window ---
    const rapidProbe = js(`new Promise(res => { const st = window.__pet; let mx = 0; const t0 = performance.now(); const id = setInterval(() => { if (st.hopY > mx) mx = st.hopY; if (performance.now() - t0 > 3600) { clearInterval(id); res(mx); } }, 20); })`);
    await wait(150);
    await js(`(async () => {
      const c = document.getElementById('scene');
      const o = { bubbles: true, button: 0, clientX: 170, clientY: 420 };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let k = 0; k < 6; k++) {
        c.dispatchEvent(new MouseEvent('mousedown', o));
        await sleep(60);
        window.dispatchEvent(new MouseEvent('mouseup', o));
        c.dispatchEvent(new MouseEvent('click', o));
        await sleep(60);
        c.dispatchEvent(new MouseEvent('mousedown', o));
        await sleep(60);
        window.dispatchEvent(new MouseEvent('mouseup', o));
        c.dispatchEvent(new MouseEvent('click', o));
        c.dispatchEvent(new MouseEvent('dblclick', o));
        await sleep(120);
      }
      return 'burst-done';
    })()`);
    const maxRapidHopY = await rapidProbe;
    const rapidPetTopPx = 24 + innerH * 0.613 * (1 + maxRapidHopY);
    console.log('[test] rapid-click apex:', JSON.stringify({ maxHopY: Number(maxRapidHopY.toFixed(3)), petTopPx: Math.round(rapidPetTopPx), innerH, fits: rapidPetTopPx <= innerH - 4 }));

    // --- AI chat with local mock endpoint ---
    const http = require('http');
    const cutTail = '这段没有句号的尾巴会在达到长度上限时被剪掉';
    const longReply = '你好呀，我是测试回复~这是一段比较长的内容，用来验证气泡自动换行、多行显示是不是正常，'
      + Array.from({ length: 20 }, (_, i) => `这是第${i + 1}句补充，用来验证偏长的回复会被完整显示，而不是在中间被截断。`).join('')
      + cutTail;
    const expectedReply = longReply.slice(0, -cutTail.length);
    const mock = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const sys = (parsed.messages || []).find((m) => m.role === 'system');
          console.log('[test] system prompt:', sys ? `${sys.content.length} chars has莉莉丝:${sys.content.includes('莉莉丝')} hasLilith:${sys.content.includes('Lilith')} has银葱:${sys.content.includes('银葱之森')} hasScallion:${/scallion/i.test(sys.content)}` : 'MISSING');
          console.log('[test] max_tokens sent:', parsed.max_tokens);
        } catch {}
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: longReply }, finish_reason: 'length' }] }));
      });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    const mockPort = mock.address().port;
    let aiCfgBackup = null;
    try { aiCfgBackup = fs.readFileSync(aiConfigPath(), 'utf8'); } catch {}
    fs.writeFileSync(aiConfigPath(), JSON.stringify({ baseUrl: `http://127.0.0.1:${mockPort}/v1`, apiKey: 'test-key', model: 'test-model' }));

    ev({ type: 'mouseMove', x: 170, y: 400 });
    await wait(150);
    ev({ type: 'mouseDown', x: 170, y: 400, button: 'left', clickCount: 1 });
    ev({ type: 'mouseUp', x: 170, y: 400, button: 'left', clickCount: 1 });
    await wait(650);
    console.log('[test] chat opened:', await js(`JSON.stringify({open:window.__pet.chatOpen})`));
    await shot('f_chat_input');

    await js(`(() => { const i = document.getElementById('chatinput'); i.value = '你好'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'sent'; })()`);
    let replyText = '';
    for (let i = 0; i < 24; i++) {
      replyText = await js(`document.getElementById('bubble').textContent`);
      if (replyText && replyText.includes('测试回复')) break;
      await wait(250);
    }
    console.log('[test] chat reply:', JSON.stringify({
      len: replyText.length,
      expected: expectedReply.length,
      full: replyText === expectedReply,
      trimmedTail: !replyText.includes(cutTail),
      head: replyText.slice(0, 24),
      tail: replyText.slice(-24),
    }));
    await shot('g_chat_reply');
    console.log('[test] bubble overflow:', await js(`JSON.stringify({ scroll: document.getElementById('bubble').classList.contains('scroll'), h: document.getElementById('bubble').offsetHeight, sh: document.getElementById('bubbletext').scrollHeight, ch: document.getElementById('bubbletext').clientHeight, top: document.getElementById('bubble').getBoundingClientRect().top })`));
    console.log('[test] chat history:', await js(`JSON.stringify(window.__pet.chatHistory)`));

    await js(`(() => { const i = document.getElementById('chatinput'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'closed'; })()`);
    await wait(250);
    console.log('[test] chat closed:', await js(`JSON.stringify({open:window.__pet.chatOpen})`));

    openAiSettings();
    await wait(1000);
    if (settingsWin && !settingsWin.isDestroyed()) {
      const img = await settingsWin.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'h_settings.png'), img.toPNG());
      console.log('[test] settings window ok');
      await settingsWin.webContents.executeJavaScript(`document.getElementById('save').click()`);
      await wait(300);
      console.log('[test] settings save status:', JSON.stringify(await settingsWin.webContents.executeJavaScript(`document.getElementById('status').textContent`)));
      await settingsWin.webContents.executeJavaScript(`document.getElementById('test').click()`);
      await wait(900);
      console.log('[test] settings ai-test status:', JSON.stringify(await settingsWin.webContents.executeJavaScript(`document.getElementById('status').textContent`)));
      const img2 = await settingsWin.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'h_settings_tested.png'), img2.toPNG());
      settingsWin.close();
    } else {
      console.log('[test] settings window FAILED');
    }

    // --- sleep: system clock (overridden in PET_TEST) + turn away + zzZ + auto-wake + manual toggle ---
    await js(`window.__pet.nowOverride = new Date(2026, 0, 1, 3, 0, 0).getTime(); 'ok'`);
    let sleepMode = '';
    for (let i = 0; i < 20; i++) {
      const s = JSON.parse(await js(`JSON.stringify({ mode: window.__pet.mode, win: window.__pet.sleepWin })`));
      if (s.mode === 'sleeping' && s.win) { sleepMode = s.mode; break; }
      await wait(900);
    }
    await wait(1300);
    const sleepInfo = JSON.parse(await js(`JSON.stringify({
      yaw: Number(window.__pet.yaw.toFixed(3)),
      mode: window.__pet.mode,
      zzz: document.getElementById('zzz').classList.contains('show'),
      zzzOpacity: getComputedStyle(document.getElementById('zzz')).opacity,
      zzzAnim: getComputedStyle(document.querySelector('#zzz span')).animationName
    })`));
    console.log('[test] sleep(3am):', JSON.stringify({ entered: sleepMode === 'sleeping', ...sleepInfo, facingAway: Math.abs(Math.abs(sleepInfo.yaw) - Math.PI) < 0.15 }));
    await shot('j_sleep');

    await js(`window.__pet.nowOverride = new Date(2026, 0, 1, 10, 0, 0).getTime(); 'ok'`);
    let wakeMode = '';
    for (let i = 0; i < 20; i++) {
      wakeMode = await js(`window.__pet.mode`);
      if (wakeMode !== 'sleeping') break;
      await wait(900);
    }
    await wait(1300);
    const wakeInfo = JSON.parse(await js(`JSON.stringify({
      yaw: Number(window.__pet.yaw.toFixed(3)),
      zzz: document.getElementById('zzz').classList.contains('show')
    })`));
    console.log('[test] wake(10am):', JSON.stringify({ mode: wakeMode, ...wakeInfo, facingFront: Math.abs(wakeInfo.yaw) < 0.15 }));
    await shot('k_wake');

    send('pet-cmd', 'sleep-toggle');
    await wait(900);
    const manualSleep = await js(`window.__pet.mode`);
    send('pet-cmd', 'sleep-toggle');
    await wait(700);
    const manualWake = await js(`window.__pet.mode`);
    console.log('[test] manual sleep toggle:', JSON.stringify({ sleep: manualSleep, wake: manualWake }));
    await js(`window.__pet.nowOverride = null; 'ok'`);

    // --- language switch: live English mode ---
    setLanguage('en');
    await wait(400);
    console.log('[test] lang(en) renderer:', await js(`JSON.stringify({lang: window.__pet.lang, placeholder: document.getElementById('chatinput').placeholder, htmlLang: document.documentElement.lang})`));
    ev({ type: 'mouseMove', x: 170, y: 400 });
    await wait(150);
    ev({ type: 'mouseDown', x: 170, y: 400, button: 'left', clickCount: 1 });
    ev({ type: 'mouseUp', x: 170, y: 400, button: 'left', clickCount: 1 });
    await wait(650);
    await js(`(() => { const i = document.getElementById('chatinput'); i.value = 'Hello'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 'sent'; })()`);
    let enReply = '';
    for (let i = 0; i < 24; i++) {
      enReply = await js(`document.getElementById('bubble').textContent`);
      if (enReply && enReply.includes('测试回复')) break;
      await wait(250);
    }
    console.log('[test] lang(en) chat reply len:', enReply.length);
    await js(`(() => { const i = document.getElementById('chatinput'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'closed'; })()`);
    await wait(250);

    openAiSettings();
    await wait(800);
    if (settingsWin && !settingsWin.isDestroyed()) {
      console.log('[test] settings(en):', JSON.stringify(await settingsWin.webContents.executeJavaScript(`JSON.stringify({h1: document.getElementById('title').textContent, save: document.getElementById('save').textContent, modelPh: document.getElementById('model').placeholder})`)));
      const imgEn = await settingsWin.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'l_settings_en.png'), imgEn.toPNG());
      setLanguage('zh');
      await wait(400);
      console.log('[test] settings live switch(en->zh):', JSON.stringify(await settingsWin.webContents.executeJavaScript(`JSON.stringify({h1: document.getElementById('title').textContent})`)));
      settingsWin.close();
      await wait(200);
    } else {
      console.log('[test] settings(en) window FAILED');
    }

    if (aiCfgBackup != null) fs.writeFileSync(aiConfigPath(), aiCfgBackup);
    else { try { fs.unlinkSync(aiConfigPath()); } catch {} }
    mock.close();

    app.quit();
  })().catch((e) => {
    console.error('[test] error', e);
    app.quit();
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  cfgFile = path.join(app.getPath('userData'), 'pet-state.json');
  loadCfg();
  createWindow();
  buildTray();
  if (process.platform === 'win32' && !TEST_MODE) startFullscreenWatcher();
  startFall(0, 0);
  win.webContents.once('did-finish-load', () => {
    send('pet-event', 'land', { speed: 0.15 });
  });
  if (process.env.PET_SHOT && !TEST_MODE) {
    const [shotPath, delayMs] = process.env.PET_SHOT.split('@');
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(shotPath, img.toPNG());
        console.log(`[shot] saved ${shotPath}`);
      } catch (e) {
        console.error('[shot] failed', e.message);
      }
      app.quit();
    }, Number(delayMs) || 2500);
  }
  if (TEST_MODE) runInteractionTest();
  screen.on('display-metrics-changed', () => {
    if (!win) return;
    const b = win.getBounds();
    const [cx, cy] = clampToScreen(b.x, b.y, b.width, b.height);
    if (cx !== b.x || cy !== b.y) {
      win.setPosition(cx, cy);
      persistPos();
    }
  });
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  persistPos();
  if (fsWatcher) { fsWatcher.kill(); fsWatcher = null; }
});
