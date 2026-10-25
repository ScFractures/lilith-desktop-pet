'use strict';

const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'window-obstacles.jxa');

// macOS only for now: CGWindowList gives current-Space, on-screen window bounds
// without needing Accessibility or capturing any window contents.
function createWindowObstacleWatcher({ excludePids = [], onUpdate }) {
  if (process.platform !== 'darwin') return null;
  const excluded = new Set(excludePids.map(Number));
  let child = null;
  let stopped = false;
  let restartTimer = null;
  let buffer = '';

  function publish(list) {
    if (!Array.isArray(list) || typeof onUpdate !== 'function') return;
    const windows = [];
    for (const item of list) {
      if (!item) continue;
      const pid = Number(item.pid);
      if (excluded.has(pid)) continue;
      const x = Number(item.x);
      const y = Number(item.y);
      const width = Number(item.width);
      const height = Number(item.height);
      if (![x, y, width, height].every(Number.isFinite)) continue;
      if (width < 40 || height < 40) continue;
      windows.push({ x, y, width, height });
    }
    onUpdate(windows);
  }

  function scheduleRestart() {
    if (stopped) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(spawnWatcher, 2000);
  }

  function spawnWatcher() {
    if (stopped) return;
    buffer = '';
    try {
      child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', SCRIPT], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      child = null;
      scheduleRestart();
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          publish(JSON.parse(line));
        } catch {}
      }
    });
    child.on('error', () => {});
    child.on('exit', () => {
      child = null;
      scheduleRestart();
    });
  }

  function stop() {
    stopped = true;
    clearTimeout(restartTimer);
    if (child) {
      child.kill();
      child = null;
    }
  }

  spawnWatcher();
  return { stop };
}

module.exports = {
  createWindowObstacleWatcher,
  supported: process.platform === 'darwin',
};
