// Isolated real-model regression test; does not launch main.js or alter the pet.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { STRINGS } = require('../i18n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-face-'));
app.setPath('userData', dir);
const base = path.resolve(__dirname, '..');
let win;
ipcMain.handle('get-info', () => ({ model: 'lilith_v5', sound: false }));
ipcMain.handle('look-get', () => null);
ipcMain.handle('i18n-get', () => ({ lang: 'zh', dict: STRINGS.zh }));
ipcMain.handle('read-asset', (_e, file) => fs.readFileSync(path.join(base, file)));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 520, height: 560, transparent: true, show: false,
    webPreferences: { preload: path.join(base, 'preload.js'), contextIsolation: true } });
  win.webContents.on('console-message', (_event, ...args) => console.log('[renderer]', ...args));
  await win.loadFile(path.join(base, 'renderer/index.html'));
  for (const model of ['lilith_v5', 'deepseek_v4']) {
    if (model !== 'lilith_v5') win.webContents.send('pet-model', model);
    const deadline = Date.now() + 30000;
    while (!await win.webContents.executeJavaScript(`!!(window.__pet.loaded && window.__pet.model === ${JSON.stringify(model)})`)) {
      if (Date.now() > deadline) throw new Error('Model load timeout');
      await sleep(100);
    }
    win.webContents.send('pet-visibility', false);
    await sleep(100);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const { createPetAnimator } = await import('./pet-anim.js');
      const { setMorph } = await import('./rig.js');
      const rig = window.__pet.rig;
      window.__pet.animator.reset();
      const animator = createPetAnimator(rig, { model: window.__pet.model });
      const mesh = rig.morphMeshes.find(m => m.morphTargetDictionary['まばたき'] !== undefined);
      const read = () => mesh.morphTargetInfluences[mesh.morphTargetDictionary['まばたき']];
      const assert = (ok, label) => { if (!ok) throw new Error(label); };
      animator.reset();
      animator.update(1/60, {});
      const idle = read();
      assert(Math.abs(idle - (window.__pet.model === 'deepseek_v4' ? -0.18 : 0)) < 1e-6, 'neutral eye opening');
      let peak = 0;
      for (let f=0; f<600; f++) { animator.update(1/60, {}); peak=Math.max(peak, read()); }
      assert(peak > 0.97, 'blink still closes eyes');
      for (let f=0; f<300; f++) animator.update(1/60, {sleeping:true});
      const sleep=read();
      assert(sleep > 0.97, 'sleep still closes eyes');
      animator.reset();
      for (let f=0; f<90; f++) animator.update(1/60, {pat:1});
      assert(read() >= -0.001, 'opening fades for smiling eyes');
      setMorph(rig, 'まばたき', -0.5);
      assert(read() === 0, 'default morph clamp unchanged');
      animator.reset();
      return {model:window.__pet.model,idle,blinkPeak:peak,sleep};
    })()`);
    console.log('PASS', JSON.stringify(result));
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
setTimeout(() => { console.error('Timed out'); app.exit(1); }, 120000).unref();
