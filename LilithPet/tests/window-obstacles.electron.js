// Standalone smoke test: never starts/restarts the user's pet or touches its profile.
'use strict';
const { app, BrowserWindow, screen } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWindowObstacleWatcher } = require('../window-obstacles');
const { chooseSite } = require('../window-perching');
const { blockedIntervals } = require('../window-avoidance');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-obstacles-'));
app.setPath('userData', dir);
let watcher;
let latest = [];
const idOf = win => Number(/^window:(\d+):/.exec(win.getMediaSourceId())[1]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${description}; windows=${JSON.stringify(latest)}`);
}
app.whenReady().then(async () => {
  assert.equal(process.platform, 'darwin');
  const a = screen.getPrimaryDisplay().workArea;
  const chat = new BrowserWindow({ x: a.x + 40, y: a.y + 40, width: 700, height: 500, title: 'Window obstacle smoke test', webPreferences: { sandbox: true } });
  const pet = new BrowserWindow({ x: a.x + 760, y: a.y + 100, width: 150, height: 250, webPreferences: { sandbox: true } });
  await Promise.all([chat.loadURL('data:text/html,Chat window test'), pet.loadURL('data:text/html,Pet window test')]);
  const petId = idOf(pet);
  const chatId = idOf(chat);
  console.log('Test window IDs:', { petId, chatId });
  watcher = createWindowObstacleWatcher({ excludeWindowIds: () => [petId], onUpdate: list => { latest = list; } });
  await until(() => latest.some(w => w.id === chatId), 'chat visible despite shared PID');
  assert.ok(!latest.some(w => w.id === petId), 'pet excluded');
  const rect = latest.find(w => w.id === chatId);
  // Restrict to our target here: unrelated desktop windows may obscure it.
  assert.equal(chooseSite([rect], screen.getAllDisplays(), {}, () => 0).id, chatId);
  assert.ok(blockedIntervals([rect], { y: rect.y + 100 }, { top: 0, bottom: 200, left: 0, right: 150 }).length);
  chat.setPosition(a.x + 80, a.y + 70);
  await until(() => latest.some(w => w.id === chatId && w.x === a.x + 80), 'moved chat updated');
  chat.hide();
  await until(() => !latest.some(w => w.id === chatId), 'hidden chat removed');
  chat.show();
  await until(() => latest.some(w => w.id === chatId), 'shown chat included');
  chat.destroy();
  await until(() => !latest.some(w => w.id === chatId), 'closed chat removed');
  console.log('PASS: shared-process chat detected; pet excluded; avoidance/perching geometry; move/hide/show/close');
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => { if (watcher) watcher.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
// app.exit does not emit will-quit.
process.on('exit', () => { if (watcher) watcher.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
setTimeout(() => { console.error('Smoke test timed out'); app.exit(1); }, 60000).unref();
