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
      const THREE = await import('three');
      const { createPetAnimator } = await import('./pet-anim.js');
      const { capsulePush } = await import('./pose-safety.js');
      const assert = (value, message) => { if (!value) throw new Error(message); };
      const out = new THREE.Vector3();
      assert(Math.abs(capsulePush(new THREE.Vector3(0.2, 0.5, 0), new THREE.Vector3(), new THREE.Vector3(0,1,0), 0.4, new THREE.Vector3(1,0,0), out) - 0.2) < 1e-8, 'capsule depth');
      assert(Math.abs(out.x - 0.4) < 1e-8, 'capsule projection');
      assert(capsulePush(new THREE.Vector3(2,0,0), new THREE.Vector3(), new THREE.Vector3(), 0.4, new THREE.Vector3(1,0,0), out) === 0, 'outside capsule');
      const rig = window.__pet.rig;
      window.__pet.animator.reset();
      const base = new Map();
      rig.root.traverse(b => { if (b.isBone) base.set(b, b.position.clone()); });
      const modes = [
        ['idle', {}], ['walk', { walking:true }], ['run', { walking:true, motion:'run' }],
        ['talk', { talking:true }], ['sleep', { sleeping:true }], ['pat', { pat:1 }],
        ['hand', { dragging:true }], ['waist', { dragging:true, heldStyle:'waist' }],
        ['fall', { falling:true }], ['crouch', { jumpPhase:'crouch',jumpT:0.12 }],
        ['air', { jumpPhase:'air',jumpT:0.2 }], ['land', { jumpPhase:'land',jumpT:0.07 }],
        ['front', { sitting:true }], ['curl', { sitting:true,sitStyle:'curl' }],
      ];
      let frames=0, rawDepth=0, safeDepth=0, rawFabric=0, safeFabric=0;
      const pos = n => rig.root.worldToLocal(rig.bones.get(n)[0].getWorldPosition(new THREE.Vector3()));
      for (const enabled of [false,true]) {
        const animator=createPetAnimator(rig,{model:window.__pet.model,poseSafety:enabled});
        animator.reset();
        const stature=Math.abs(pos('首').y-pos('左足首').y);
        for (const [name, ctx] of modes) {
          for (let f=0; f<150; f++) {
            const result=animator.update(1/30,{...ctx,walkPhase:f/30*6});
            assert(Number.isFinite(result.bob),name+': non-finite root');
            rig.root.updateMatrixWorld(true);
            for (const [b,p] of base) {
              assert(b.position.distanceTo(p)<1e-5,name+': bone translated '+b.name);
              assert(Math.abs(b.quaternion.length()-1)<1e-5,name+': invalid quaternion '+b.name);
            }
            const a=pos('左足').add(pos('右足')).multiplyScalar(0.5), b=pos('首');
            for (const side of ['左','右']) {
              const p=pos(side+'手首');
              const depth=capsulePush(p,a,b,stature*0.109,new THREE.Vector3(1,0,0),out);
              if (enabled) safeDepth+=depth; else rawDepth+=depth;
            }
            for (const [jointName, joints] of rig.bones) {
              if (!/^スカート_/.test(jointName)) continue;
              for (const joint of joints) {
                const child=joint.children.find(c=>c.isBone && /^スカート_/.test(c.name));
                if (!child) continue;
                for (const side of ['左','右']) {
                  const start=pos(side+'足'), end=pos(side+'ひざ');
                  const p=rig.root.worldToLocal(child.getWorldPosition(new THREE.Vector3()));
                  const q=rig.root.worldToLocal(joint.getWorldPosition(new THREE.Vector3()));
                  for (const fraction of [0.5,1]) {
                    const d=capsulePush(q.clone().lerp(p,fraction),start,end,stature*0.058,new THREE.Vector3(1,0,0),out);
                    if (enabled) safeFabric+=d; else rawFabric+=d;
                  }
                }
              }
            }
            frames++;
          }
        }
        animator.reset();
      }
      assert(safeDepth <= rawDepth + 1e-4,'collision solver increased total hand/torso penetration');
      assert(safeFabric <= rawFabric + 1e-4, 'fabric penetration increased');
      return {model:window.__pet.model,frames,rawDepth,safeDepth,rawFabric,safeFabric};
    })()`);
    console.log('PASS', JSON.stringify(result));
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
setTimeout(() => { console.error('Timed out'); app.exit(1); }, 120000).unref();
