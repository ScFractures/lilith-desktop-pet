const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const QODER_HOME = path.join(os.homedir(), '.qoder-cn');
const TIMEOUT_MS = 12000;

function findQoder() {
  const candidates = [
    process.env.QODERCN_CLI,
    path.join(QODER_HOME, 'entry', 'qoder-cn'),
    path.join(QODER_HOME, 'entry', 'qodercn'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeStatusline(data) {
  const credits = data && data.credits;
  if (!credits || typeof credits.total_remaining !== 'number') return null;
  const userQuota = credits.user_quota || {};
  const userRemaining = Number.isFinite(userQuota.remaining)
    ? userQuota.remaining
    : Number.isFinite(userQuota.total) && Number.isFinite(userQuota.used)
      ? userQuota.total - userQuota.used
      : null;
  // A cap:-1 org_resource_package is the "unlimited" placeholder and reports a
  // huge remaining; only fold real packages (e.g. the 2000 bonus credits) in.
  const org = credits.org_resource_package || {};
  const orgFinite = Number.isFinite(org.cap) && org.cap >= 0;
  const orgRemaining = orgFinite
    ? Number.isFinite(org.remaining)
      ? org.remaining
      : Number.isFinite(org.used) ? Math.max(0, org.cap - org.used) : null
    : null;
  const total = Number.isFinite(userQuota.total) || orgFinite
    ? (Number.isFinite(userQuota.total) ? userQuota.total : 0) + (orgFinite ? org.cap : 0)
    : null;
  const used = Number.isFinite(userQuota.used) || (orgFinite && Number.isFinite(org.used))
    ? (Number.isFinite(userQuota.used) ? userQuota.used : 0)
      + (orgFinite && Number.isFinite(org.used) ? org.used : 0)
    : null;
  return {
    remaining: userRemaining !== null || orgRemaining !== null
      ? (userRemaining ?? 0) + (orgRemaining ?? 0)
      : credits.total_remaining,
    total,
    used,
    usedPercentage: Number.isFinite(total) && total > 0 && Number.isFinite(used)
      ? (used / total) * 100
      : Number.isFinite(credits.total_usage_percentage)
        ? credits.total_usage_percentage
        : Number.isFinite(userQuota.percentage) ? userQuota.percentage : null,
    isQuotaExceeded: credits.is_quota_exceeded === true,
    expiresAt: Number.isFinite(credits.expires_at) ? credits.expires_at : null,
    unit: typeof credits.unit === 'string' && credits.unit ? credits.unit : 'credits',
    sessionId: typeof data.session_id === 'string' ? data.session_id : null,
    fetchedAt: Date.now(),
  };
}

function readStatusline(file) {
  try {
    return normalizeStatusline(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

function stopProcessGroup(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) return resolve();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once('close', finish);
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try { child.kill('SIGTERM'); } catch {}
    }
    setTimeout(() => {
      if (settled) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try { child.kill('SIGKILL'); } catch {}
      }
      setTimeout(finish, 250);
    }, 700);
    setTimeout(finish, 2500);
  });
}

function cleanupSession(sessionId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId || '')) return;
  const encodedHome = os.homedir().replace(/\//g, '-');
  const root = path.resolve(QODER_HOME) + path.sep;
  const targets = [
    path.join(QODER_HOME, 'projects', encodedHome, sessionId),
    path.join(QODER_HOME, 'logs', 'sessions', encodedHome, sessionId),
    path.join(QODER_HOME, 'tasks', sessionId),
    path.join(QODER_HOME, 'session-env', sessionId),
  ];
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(root)) continue;
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch {}
  }
}

async function queryQoderBalance({ timeoutMs = TIMEOUT_MS } = {}) {
  if (process.platform !== 'darwin') {
    const err = new Error('unsupported-platform');
    err.code = 'unsupported-platform';
    throw err;
  }
  const qoder = findQoder();
  if (!qoder) {
    const err = new Error('qoder-not-found');
    err.code = 'qoder-not-found';
    throw err;
  }
  if (!fs.existsSync('/usr/bin/script')) {
    const err = new Error('script-not-found');
    err.code = 'script-not-found';
    throw err;
  }

  const outFile = path.join(
    os.tmpdir(),
    `lilith-qoder-balance-${process.pid}-${crypto.randomBytes(6).toString('hex')}.json`,
  );
  const settings = JSON.stringify({
    statusLine: { type: 'command', command: `/bin/cat > ${shellQuote(outFile)}` },
  });

  let child = null;
  let output = '';
  let cleanupId = null;
  try {
    child = spawn('/usr/bin/script', ['-q', '/dev/null', qoder, '--settings', settings], {
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let spawnError = null;
    child.on('error', (err) => { spawnError = err; });
    const onData = (chunk) => {
      if (output.length < 20000) output += chunk.toString();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const started = Date.now();
    let balance = null;
    while (Date.now() - started < timeoutMs) {
      if (spawnError) break;
      balance = readStatusline(outFile);
      if (balance) break;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!balance) {
      let code = 'timeout';
      if (spawnError) code = 'spawn-failed';
      else if (!/Signed in|Personal Access Token/i.test(output)) code = 'logged-out';
      else if (child.exitCode !== null) code = 'no-data';
      const err = new Error(code);
      err.code = code;
      err.detail = spawnError ? spawnError.message : output.slice(-600);
      throw err;
    }

    cleanupId = balance.sessionId;
    delete balance.sessionId;
    return balance;
  } finally {
    if (child) await stopProcessGroup(child);
    if (cleanupId) cleanupSession(cleanupId);
    try { fs.rmSync(outFile, { force: true }); } catch {}
  }
}

module.exports = { queryQoderBalance };
