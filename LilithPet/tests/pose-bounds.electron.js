// Isolated real-model regression test; does not launch main.js or alter the pet.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { STRINGS } = require('../i18n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-pose-'));
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
  for (const model of ['lilith_v5', 'deepseek_v4', 'lilith', 'deepseek_m', 'deepseek_winter', 'deepseek']) {
    if (model !== 'lilith_v5') win.webContents.send('pet-model', model);
    const deadline = Date.now() + 30000;
    while (!await win.webContents.executeJavaScript(`!!(window.__pet.loaded && window.__pet.model === ${JSON.stringify(model)})`)) {
      if (Date.now() > deadline) throw new Error(`Loading ${model} timed out`);
      await sleep(100);
    }
    win.webContents.send('pet-visibility', false);
    await sleep(100);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const THREE = await import('three');
      const { createPoseBounds, fitPoseCamera } = await import('./pose-bounds.mjs');
      const state = window.__pet;
      const pet = state.rig ? state.rig.root.parent.parent : null;
      if (!pet) return { model: state.model, legacyLoaded: true };
      const bounds = createPoseBounds(pet);
      const actual = new THREE.Vector3();
      const projected = new THREE.Vector3();
      let samples = 0, minZoom = 1;
      for (const [width, height] of [[410,458],[520,560],[670,725]]) {
        const camera = new THREE.PerspectiveCamera(30, width/height, 0.1, 30);
        const cy = (height/2-48)/(height*0.613);
        camera.position.set(0, cy, 1/0.613/(2*Math.tan(Math.PI/12)));
        camera.lookAt(0, cy, 0);
        for (const mode of ['idle','hand','waist','falling','jump','extreme','front','curl']) {
          for (let frame = 0; frame < 18; frame++) {
            const motion = state.animator.update(1/30, {
              dragging: mode === 'hand' || mode === 'waist', heldStyle: mode,
              falling: mode === 'falling', sitting: mode === 'front' || mode === 'curl',
              sitStyle: mode, jumpPhase: mode === 'jump' ? 'air' : 'idle', jumpT: frame/30,
            });
            pet.rotation.set(0.13, mode === 'curl' ? Math.PI/2 : Math.sin(frame/9)*Math.PI, 0.21);
            pet.position.y = (motion?.bob || 0) + (mode === 'extreme' ? 1.8 : mode === 'jump' ? 0.52 : 0);
            const box = bounds();
            minZoom = Math.min(minZoom, fitPoseCamera(camera, box, width, height, 1/30));
            pet.traverse(mesh => {
              if (!mesh.isMesh) return;
              // Sample actual deformed vertices, not the same bound algorithm.
              const count = mesh.geometry.attributes.position.count;
              for (let i = 0; i < count; i += 113) {
                mesh.getVertexPosition(i, actual).applyMatrix4(mesh.matrixWorld);
                if (!box.clone().expandByScalar(1e-5).containsPoint(actual)) throw new Error(mode + ': animated vertex outside bounds');
              }
            });
            for (let i=0;i<8;i++) {
              projected.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);
              if (Math.abs(projected.x) > 1-19/width || Math.abs(projected.y) > 1-19/height) throw new Error(mode + ': viewport clipping');
            }
            samples++;
          }
        }
      }
      return { model: state.model, samples, minZoom };
    })()`);
    console.log('PASS', JSON.stringify(result));
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
setTimeout(() => { console.error('Timed out'); app.exit(1); }, 120000).unref();
