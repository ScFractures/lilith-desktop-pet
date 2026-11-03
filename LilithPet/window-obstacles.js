'use strict';

const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'window-obstacles.jxa');

// Keep filtering window-specific: Electron utility/chat windows share the pet's
// main-process PID and must remain obstacles and possible perching targets.
function filterWindowObstacles(list, { excludePids = [], excludeWindowIds = [] } = {}) {
  const pids = new Set(excludePids.map(Number));
  const ids = new Set(excludeWindowIds.map(Number));
  const windows = [];
  for (const item of list) {
    if (!item || pids.has(Number(item.pid)) || ids.has(Number(item.id))) continue;
    const { x, y, width, height } = Object.fromEntries(
      ['x', 'y', 'width', 'height'].map(key => [key, Number(item[key])])
    );
    if (![x, y, width, height].every(Number.isFinite)) continue;
    if (width < 40 || height < 40) continue;
    windows.push({ id: item.id, x, y, width, height });
  }
  return windows;
}

// macOS only for now: CGWindowList gives current-Space, on-screen window bounds
// without needing Accessibility or capturing any window contents.
function createWindowObstacleWatcher({ excludePids = [], excludeWindowIds = () => [], onUpdate }) {
  if (process.platform !== 'darwin') return null;
  let child = null;
  let stopped = false;
  let restartTimer = null;
  let buffer = '';

  function publish(list) {
    if (!Array.isArray(list) || typeof onUpdate !== 'function') return;
    const ids = typeof excludeWindowIds === 'function' ? excludeWindowIds() : excludeWindowIds;
    onUpdate(filterWindowObstacles(list, { excludePids, excludeWindowIds: ids }));
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
  filterWindowObstacles,
  supported: process.platform === 'darwin',
};
