// Isolated click-path smoke test; never launches or restarts the live pet.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { STRINGS } = require('../i18n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-sleep-touch-'));
app.setPath('userData', dir);
const base = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let body;
ipcMain.handle('get-info', () => ({ model: 'lilith_v5', sound: false }));
ipcMain.handle('look-get', () => null);
ipcMain.handle('i18n-get', () => ({ lang: 'en', dict: STRINGS.en }));
ipcMain.handle('read-asset', (_e, file) => fs.readFileSync(path.join(base, file)));
ipcMain.on('pet-body', (_e, rect) => { body = rect; });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 520, height: 560, show: false,
    webPreferences: { preload: path.join(base, 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
  await win.loadFile(path.join(base, 'renderer/index.html'));
  for (const model of ['lilith_v5', 'deepseek_v4']) {
    body = null;
    if (model !== 'lilith_v5') win.webContents.send('pet-model', model);
    const deadline = Date.now() + 30000;
    while (!body || !await win.webContents.executeJavaScript(`window.__pet.loaded && window.__pet.model === ${JSON.stringify(model)}`)) {
      if (Date.now() > deadline) throw new Error('Model/body load timeout');
      await sleep(100);
    }
    win.webContents.send('pet-visibility', false);
    await sleep(100);
    await win.webContents.executeJavaScript(`window.__pet.mode = 'idle'`);
    win.webContents.send('pet-cmd', 'sleep-toggle');
    await sleep(100);
    // The paused pose keeps the reported body rectangle stable for synthetic clicks.
    const x = (body.l + body.r) / 2;
    const y = body.t + (body.b - body.t) * 0.15;
    await win.webContents.executeJavaScript(`(() => {
      const canvas = document.getElementById('scene');
      canvas.dispatchEvent(new MouseEvent('mousedown', {button:0, clientX:${x}, clientY:${y}, bubbles:true}));
      window.dispatchEvent(new MouseEvent('mouseup', {button:0, clientX:${x}, clientY:${y}, bubbles:true}));
    })()`);
    await sleep(350);
    const result = await win.webContents.executeJavaScript(`({ mode:window.__pet.mode, text:document.getElementById('bubbletext').textContent, persona:window.__pet.persona })`);
    const persona = STRINGS.en.personas && STRINGS.en.personas[result.persona];
    const lines = persona && persona.phrases ? persona.phrases.sleepyPat : STRINGS.en.phrases.sleepyPat;
    if (result.mode !== 'sleeping' || !lines.includes(result.text)) throw new Error(JSON.stringify(result));
    console.log('PASS sleeping head click', model, JSON.stringify(result));
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
setTimeout(() => { console.error('Timed out'); app.exit(1); }, 90000).unref();
