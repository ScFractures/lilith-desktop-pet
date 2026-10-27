import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BOTTOM_INSET = 24;
const FOV = 30;
const PET_HEIGHT_FRACTION = 0.613;
// Camera distance derived from FOV so the pet's pixel height stays PET_HEIGHT_FRACTION of the
// window height; the headroom above is for jumping
const CAM_DIST = 1 / PET_HEIGHT_FRACTION / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
const GRAVITY = 6.4;
const WALK_MIN = 105;
const WALK_MAX = 165;

const canvas = document.getElementById('scene');
const bubbleEl = document.getElementById('bubble');
const bubbleTextEl = document.getElementById('bubbletext');
const zzzEl = document.getElementById('zzz');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 30);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const hemi = new THREE.HemisphereLight(0xffffff, 0x99a0b5, 0.85);
const key = new THREE.DirectionalLight(0xfff7ec, 1.9);
key.position.set(1.3, 2.1, 2.3);
const rim = new THREE.DirectionalLight(0xcfdcff, 1.0);
rim.position.set(-1.7, 1.9, -1.5);
const fill = new THREE.DirectionalLight(0xffffff, 0.75);
fill.position.set(-1.6, 0.7, 1.9);
scene.add(hemi, key, rim, fill);

const pet = new THREE.Group();
pet.rotation.order = 'YXZ';
const holder = new THREE.Group();
pet.add(holder);
scene.add(pet);

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, 'rgba(20,16,26,0.55)');
  grad.addColorStop(0.55, 'rgba(20,16,26,0.34)');
  grad.addColorStop(1, 'rgba(20,16,26,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(0.82, 0.5),
  new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.002;
scene.add(blob);

const state = {
  mode: 'loading',
  running: false,
  loaded: false,
  targetYaw: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  walkDir: 1,
  walkPhase: 0,
  walkSpeed: 130,
  hopY: 0,
  hopV: 0,
  spinExtra: 0,
  spinLeft: 0,
  wiggleLeft: 0,
  squash: { x: 0, v: 0 },
  idleTimer: 3.5,
  idleSayTimer: 600,
  dragging: false,
  pendingDrag: null,
  hover: false,
  cursor: { x: 0, y: 0, inside: false },
  ignoreState: true,
  sleepWin: false,
  prevSleepWin: false,
  nowOverride: null,
  lang: 'zh',
  model: null,
  persona: null,
  sound: true,
};
window.__pet = state;

let L = null;
let phrases = {};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const PERSONA_BY_MODEL = { lilith: 'lilith', deepseek_m: 'deepseek_m', miku: 'miku' };

function applyPersona(model = state.model) {
  if (!L) return;
  const key = PERSONA_BY_MODEL[model] || 'lilith';
  const persona = (L.personas && L.personas[key]) || null;
  phrases = (persona && persona.phrases) || L.phrases;
  state.persona = key;
}

function applyDict(payload) {
  L = payload.dict;
  document.documentElement.lang = payload.lang === 'zh' ? 'zh-CN' : 'en';
  state.lang = payload.lang;
  applyPersona();
}
window.pet.on('i18n', (payload) => applyDict(payload));
window.pet.on('sound-state', (on) => {
  state.sound = !!on;
  if (!on && audioEl && !audioEl.paused) audioEl.pause();
});

function disposeObject(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const value of Object.values(m)) {
        if (value && value.isTexture) value.dispose();
      }
      m.dispose();
    }
  });
}

let modelLoadId = 0;

async function loadModel(key) {
  const loadId = ++modelLoadId;
  const loader = new GLTFLoader();
  const buf = await window.pet.readAsset(`assets/${key}.glb`);
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject);
  });
  const model = gltf.scene;
  if (loadId !== modelLoadId) {
    disposeObject(model);
    return false;
  }
  let meshCount = 0;
  model.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      o.frustumCulled = false;
      const m = o.material;
      if (m) {
        m.metalness = 0;
        m.envMapIntensity = 0.5;
      }
    }
  });
  model.rotation.y = -Math.PI / 2;
  while (holder.children.length) {
    const old = holder.children[0];
    holder.remove(old);
    disposeObject(old);
  }
  holder.scale.setScalar(1);
  holder.position.set(0, 0, 0);
  holder.add(model);
  let box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  holder.scale.setScalar(1 / size.y);
  box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, -box.min.y, -c.z);
  state.model = key;
  console.log(`model loaded: ${key} meshes=${meshCount} size=${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)}`);
  return true;
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const k = (h * PET_HEIGHT_FRACTION) / 1.0;
  const cy = (h / 2 - BOTTOM_INSET) / k;
  camera.position.set(0, cy, CAM_DIST);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  layout();
  scheduleBodyReport();
});
layout();

const tmpBox = new THREE.Box3();
const corner = new THREE.Vector3();
function petScreenRect() {
  tmpBox.setFromObject(pet);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? tmpBox.max.x : tmpBox.min.x,
      i & 2 ? tmpBox.max.y : tmpBox.min.y,
      i & 4 ? tmpBox.max.z : tmpBox.min.z
    );
    corner.project(camera);
    const px = ((corner.x + 1) / 2) * w;
    const py = ((1 - corner.y) / 2) * h;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  return { l: minX - 6, t: minY - 6, r: maxX + 6, b: maxY + 6 };
}

let bodyReportTimer = null;
function reportPetBody() {
  if (!state.loaded) return;
  const r = petScreenRect();
  window.pet.reportPetBody({ l: r.l, r: r.r, t: r.t, b: r.b });
}
function scheduleBodyReport(delay = 120) {
  clearTimeout(bodyReportTimer);
  bodyReportTimer = setTimeout(reportPetBody, delay);
}

function inRect(x, y, r) {
  return x >= r.l && x <= r.r && y >= r.t && y <= r.b;
}

function setInteractive(v) {
  if (v !== state.ignoreState) return;
  state.ignoreState = !v;
  window.pet.setIgnoreMouse(!v);
}

let bubbleTimer = null;
let bubbleToken = 0;
let audioEl = null;

function voicePath(text) {
  if (state.sound === false) return null;
  const data = window.VOICE_DATA;
  const lang = data && data[state.lang];
  const map = lang && lang[state.persona];
  return (map && map[text]) || null;
}

function playVoice(text) {
  const src = voicePath(text);
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.volume = 0.9;
  }
  if (!src) {
    if (!audioEl.paused) audioEl.pause();
    return null;
  }
  audioEl.src = src;
  try { audioEl.currentTime = 0; } catch {}
  audioEl.play().catch(() => {});
  return audioEl;
}

function showBubble(text, ms) {
  bubbleTextEl.textContent = text;
  bubbleTextEl.scrollTop = 0;
  bubbleEl.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), ms);
}

function say(text, duration = 2300) {
  let ms = duration;
  const token = ++bubbleToken;
  const audio = playVoice(text);
  if (audio) {
    const known = audio.duration;
    if (Number.isFinite(known) && known > 0) {
      ms = Math.max(ms, known * 1000 + 250);
    } else {
      audio.addEventListener('loadedmetadata', () => {
        if (token !== bubbleToken) return;
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0) showBubble(text, Math.max(ms, d * 1000 + 250));
      }, { once: true });
    }
  }
  showBubble(text, ms);
}

function anchorPoint() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const topWorld = 1.0 + Math.max(0, state.hopY);
  const v = new THREE.Vector3(0, topWorld, 0).project(camera);
  return { px: ((v.x + 1) / 2) * w, py: ((1 - v.y) / 2) * h, w, h };
}

function updateBubblePos() {
  const { px: apx, py: apy, w, h } = anchorPoint();
  const shown = bubbleEl.classList.contains('show');
  if (shown) {
    // Cap long replies: scroll inside the bubble only when the text really doesn't fit; short bubbles never show a scrollbar
    bubbleTextEl.style.maxHeight = `${Math.max(80, h - 46)}px`;
    bubbleEl.classList.toggle('scroll', bubbleTextEl.scrollHeight > bubbleTextEl.clientHeight + 1);
  }
  const bh = shown ? bubbleEl.offsetHeight : 0;
  // When she jumps high the anchor goes above the window top; clamp so the bubble stays inside
  const minPy = bh + 18;
  const py = Math.max(apy, minPy);
  if (zzzEl.classList.contains('show')) {
    // zzZ stacks above the bubble so the speech bubble can't cover it
    const zw = zzzEl.offsetWidth;
    const zx = Math.min(Math.max(apx, zw / 2 + 6), w - zw / 2 - 6);
    zzzEl.style.left = `${zx}px`;
    zzzEl.style.bottom = `${h - py + 10 + (bh ? bh + 8 : 4)}px`;
  }
  if (bh) {
    const bw = bubbleEl.offsetWidth;
    const bx = Math.min(Math.max(apx, bw / 2 + 6), w - bw / 2 - 6);
    bubbleEl.style.left = `${bx}px`;
    bubbleEl.style.bottom = `${h - py + 14}px`;
  }
}

function spawnHeart(x, y) {
  const el = document.createElement('span');
  el.className = 'heart';
  el.textContent = '♥';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function hop(power = 1) {
  // Only jump from the ground; re-jumping mid-air stacks velocity and rapid clicks push her head out of the window
  if (state.hopY > 0 || state.hopV > 0) return;
  state.hopV = 1.9 * power;
}

function squashKick(d) {
  state.squash.x = Math.min(Math.max(state.squash.x + d, -0.3), 0.22);
  state.squash.v = 0;
}

const yawTargets = { idle: 0 };
function shortestArc(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

async function doWalk() {
  const info = await window.pet.getInfo();
  const { bounds, workArea } = info;
  const margin = 50;
  const span = workArea.width - bounds.width - margin * 2;
  if (span <= 0) return;
  const targetX = workArea.x + margin + Math.random() * span;
  const dir = Math.sign(targetX - bounds.x) || 1;
  state.mode = 'walking';
  state.walkDir = dir;
  state.targetYaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  state.walkSpeed = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN);
  state.walkPhase = 0;
  window.pet.walkTo(targetX, state.walkSpeed);
}

function doSpin() {
  state.spinLeft = 1.1;
  state.mode = 'idle';
  hop(0.7);
  setTimeout(() => spawnHeart(window.innerWidth / 2, window.innerHeight * 0.42), 300);
}

function doJump() {
  hop(1.3);
}

function doPat() {
  if (state.mode === 'sleeping') {
    say(pick(phrases.sleepyPat));
    return;
  }
  hop(0.9);
  state.wiggleLeft = 0.8;
  say(pick(phrases.pat));
  const r = petScreenRect();
  spawnHeart((r.l + r.r) / 2 + (Math.random() - 0.5) * 40, r.t + 30);
  setTimeout(() => spawnHeart((r.l + r.r) / 2 + (Math.random() - 0.5) * 60, r.t + 10), 180);
}

function scheduleIdle() {
  state.idleTimer = 4.5 + Math.random() * 6.5;
}

function doIdleAction() {
  if (inSleepWindow()) {
    enterSleep();
    return;
  }
  const r = Math.random();
  if (r < 0.4) {
    hop(0.55 + Math.random() * 0.4);
  } else {
    doWalk();
  }
}

// Night window (23:00–07:00, system clock): when idle she lies down — turns away with zzZ overhead; wakes at dawn
function inSleepWindow() {
  // PET_TEST overrides the clock via nowOverride
  const h = (state.nowOverride ? new Date(state.nowOverride) : new Date()).getHours();
  return h >= 23 || h < 7;
}

function enterSleep() {
  if (state.mode === 'sleeping' || state.dragging || state.mode === 'falling') return;
  if (state.mode === 'walking') window.pet.walkStop();
  state.spinLeft = 0;
  state.spinExtra = 0;
  state.mode = 'sleeping';
  state.targetYaw = Math.PI;
  squashKick(-0.08);
  window.pet.setSleeping(true);
  if (Math.random() < 0.5) say(pick(phrases.sleep));
}

function wakeUp(opts = {}) {
  if (state.mode !== 'sleeping') return false;
  state.mode = 'idle';
  state.targetYaw = 0;
  scheduleIdle();
  window.pet.setSleeping(false);
  if (opts.say) say(pick(opts.morning ? phrases.morning : phrases.wake));
  return true;
}

function sleepTick() {
  const w = inSleepWindow();
  const prev = state.prevSleepWin;
  state.sleepWin = w;
  state.prevSleepWin = w;
  if (w && !prev && state.mode === 'idle' && !state.dragging && !state.pendingDrag) {
    enterSleep();
  } else if (!w && prev && state.mode === 'sleeping') {
    wakeUp({ morning: true, say: true });
  }
}

state.sleepWin = state.prevSleepWin = inSleepWindow();
setInterval(sleepTick, 10000);

function update(dt, t) {
  if (state.mode === 'loading' || !state.loaded) return;

  // squash-spring
  const s = state.squash;
  s.v += (-420 * s.x - 24 * s.v) * dt;
  s.x += s.v * dt;

  // hop physics
  if (state.hopV !== 0 || state.hopY > 0) {
    state.hopV -= GRAVITY * dt;
    state.hopY += state.hopV * dt;
    if (state.hopY <= 0) {
      const impact = Math.abs(state.hopV);
      state.hopY = 0;
      state.hopV = 0;
      squashKick(-0.05 - Math.min(0.18, impact * 0.06));
    }
  }

  // spin
  if (state.spinLeft > 0) {
    const step = Math.min(state.spinLeft, dt);
    state.spinExtra += (step / 1.1) * Math.PI * 2;
    state.spinLeft -= dt;
    if (state.spinLeft <= 0) state.spinExtra = 0;
  }

  const facing = state.targetYaw + state.spinExtra;
  state.yaw += shortestArc(state.yaw, facing) * Math.min(1, dt * 5.5);
  // Normalize to (-π, π] so float error near π can't add a full extra turn
  if (state.yaw > Math.PI) state.yaw -= Math.PI * 2;
  else if (state.yaw <= -Math.PI) state.yaw += Math.PI * 2;

  // walk bob
  let bobY = 0, walkRoll = 0, walkPitch = 0;
  if (state.mode === 'walking') {
    state.walkPhase += dt * (6.2 + state.walkSpeed * 0.012);
    bobY = Math.abs(Math.sin(state.walkPhase)) * 0.032;
    walkRoll = Math.sin(state.walkPhase * 2) * 0.028;
    walkPitch = 0.065;
  }

  // drag dangle
  let dragRoll = 0, dragPitch = 0, stretch = 0;
  if (state.dragging) {
    dragRoll = Math.sin(t * 5.2) * 0.10;
    dragPitch = 0.10;
    stretch = 0.05;
  } else if (state.mode === 'falling') {
    dragPitch = 0.05;
    stretch = 0.06;
  }

  // wiggle (pat)
  let wiggle = 0;
  if (state.wiggleLeft > 0) {
    wiggle = Math.sin(t * 15) * 0.05 * Math.min(1, state.wiggleLeft / 0.4);
    state.wiggleLeft -= dt;
  }

  pet.position.y = bobY + state.hopY;
  pet.rotation.y = state.yaw;
  pet.rotation.x = walkPitch + dragPitch;
  pet.rotation.z = walkRoll + dragRoll + wiggle;

  const sleeping = state.mode === 'sleeping';
  const breath = Math.sin(t * (sleeping ? 1.05 : 1.7)) * (sleeping ? 0.017 : 0.011);
  const sy = 1 + s.x + breath + stretch;
  const sxz = 1 - (s.x + breath + stretch) * 0.55;
  holder.scale.set(sxz, sy, sxz);

  // blob shadow
  const lift = state.hopY;
  const bs = 1 + lift * 0.6;
  blob.scale.set(bs, bs, 1);
  blob.material.opacity = Math.max(0.08, 0.9 / (1 + lift * 2.6));

  // idle scheduler
  if (state.mode === 'idle' && !state.dragging && !state.pendingDrag && state.spinLeft <= 0) {
    state.idleTimer -= dt;
    if (state.idleTimer <= 0) {
      scheduleIdle();
      doIdleAction();
    }
    state.idleSayTimer -= dt;
    if (state.idleSayTimer <= 0) {
      state.idleSayTimer = 540 + Math.random() * 120;
      say(pick(phrases.idle));
    }
  }

  // hover / click-through
  const r = petScreenRect();
  const br = bubbleEl.getBoundingClientRect();
  const overPet =
    inRect(state.cursor.x, state.cursor.y, r) ||
    (bubbleEl.classList.contains('show') && inRect(state.cursor.x, state.cursor.y, { l: br.left, t: br.top, r: br.right, b: br.bottom }));
  state.hover = overPet;
  setInteractive(overPet || state.dragging || state.pendingDrag !== null);
  canvas.style.cursor = state.dragging ? 'grabbing' : overPet ? 'grab' : 'default';

  zzzEl.classList.toggle('show', sleeping && state.hopY <= 0);
  updateBubblePos();
}

let last = performance.now();
function loop(now) {
  if (!state.running) return;
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;
  update(dt, t);
  renderer.render(scene, camera);
}

function startLoop() {
  if (state.running) return;
  state.running = true;
  last = performance.now();
  renderer.setAnimationLoop(loop);
}
function stopLoop() {
  state.running = false;
  renderer.setAnimationLoop(null);
}

// ---------------------------------------------------------------- input
canvas.addEventListener('mousemove', (e) => {
  state.cursor.x = e.clientX;
  state.cursor.y = e.clientY;
  state.cursor.inside = true;
  if (state.dragging && e.buttons === 0) {
    state.dragging = false;
    window.pet.dragEnd();
    return;
  }
  if (state.pendingDrag && !state.dragging) {
    const dx = e.clientX - state.pendingDrag.x;
    const dy = e.clientY - state.pendingDrag.y;
    if (Math.hypot(dx, dy) > 4) {
      wakeUp();
      state.dragging = true;
      state.mode = 'drag';
      window.pet.dragStart({ offsetX: e.clientX, offsetY: e.clientY });
      if (Math.random() < 0.5) say(pick(phrases.drag), 1400);
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (e.target !== canvas) {
    state.cursor.x = e.clientX;
    state.cursor.y = e.clientY;
    state.cursor.inside = true;
  }
});
window.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) state.cursor.inside = false;
});

let clickTimer = null;
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state.loaded && inRect(e.clientX, e.clientY, petScreenRect())) {
    state.pendingDrag = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) {
    state.pendingDrag = null;
    return;
  }
  if (state.dragging) {
    state.dragging = false;
    window.pet.dragEnd();
    state.pendingDrag = null;
    return;
  }
  if (state.pendingDrag) {
    state.pendingDrag = null;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      wakeUp({ say: true });
      hop(0.75 + Math.random() * 0.3);
      state.targetYaw = 0;
    }, 230);
  }
});
canvas.addEventListener('dblclick', (e) => {
  clearTimeout(clickTimer);
  state.pendingDrag = null;
  wakeUp();
  hop(1.35);
  const x = e.clientX, y = e.clientY;
  spawnHeart(x, y - 30);
  setTimeout(() => spawnHeart(x - 24, y - 46), 130);
  setTimeout(() => spawnHeart(x + 22, y - 40), 240);
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  state.pendingDrag = null;
  window.pet.showMenu({ x: e.clientX, y: e.clientY });
});

window.pet.on('pet-event', (name, data) => {
  if (name === 'land') {
    if (state.dragging) return;
    const speed = data && data.speed ? data.speed : 0;
    state.mode = 'idle';
    state.targetYaw = 0;
    if (speed > 0.05) {
      squashKick(-0.08 - Math.min(0.2, speed * 0.14));
      if (speed > 0.85) {
        say(pick(phrases.hardLand), 1800);
        state.roll = 0;
      }
    }
    scheduleIdle();
  } else if (name === 'released') {
    state.mode = 'falling';
  } else if (name === 'walk-arrived') {
    if (state.mode === 'walking') {
      state.mode = 'idle';
      state.targetYaw = 0;
      scheduleIdle();
    }
  } else if (name === 'avoid-walk') {
    if (state.mode === 'sleeping') {
      state.mode = 'idle';
      window.pet.setSleeping(false);
    }
    const speed = data && Number.isFinite(data.speed) ? data.speed : 180;
    const dir = data && data.dir < 0 ? -1 : 1;
    state.mode = 'walking';
    state.walkDir = dir;
    state.walkSpeed = speed;
    state.targetYaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    state.walkPhase = 0;
  }
});

window.pet.on('pet-cmd', (cmd) => {
  if (!state.loaded) return;
  if (cmd === 'pat') doPat();
  else if (cmd === 'walk') { wakeUp(); if (state.mode === 'idle') doWalk(); }
  else if (cmd === 'spin') { wakeUp(); doSpin(); }
  else if (cmd === 'jump') { wakeUp(); doJump(); }
  else if (cmd === 'greet') {
    wakeUp();
    state.targetYaw = 0;
    say(pick(phrases.greet));
    hop(0.8);
    scheduleIdle();
  } else if (cmd === 'sleep-toggle') {
    if (state.mode === 'sleeping') wakeUp({ say: true });
    else enterSleep();
  }
});

window.pet.on('pet-visibility', (visible) => {
  if (visible) startLoop();
  else stopLoop();
});

window.pet.on('pet-model', async (key) => {
  try {
    const loaded = await loadModel(key);
    if (!loaded) return;
    applyPersona(key);
    clearTimeout(bubbleTimer);
    bubbleEl.classList.remove('show', 'scroll');
    bubbleTextEl.textContent = '';
    scheduleBodyReport(250);
  } catch (err) {
    console.error('model switch failed:', err && err.message);
    say((L && L.modelLoadFail) || 'Failed to load the model', 5000);
  }
});

(async () => {
  try {
    applyDict(await window.pet.i18nGet());
  } catch (e) {
    console.error('i18n load failed:', e && e.message);
  }
  try {
    const info = await window.pet.getInfo().catch(() => null);
    if (info) state.sound = info.sound !== false;
    await loadModel((info && info.model) || 'lilith');
    applyPersona(state.model);
    state.loaded = true;
    state.mode = 'idle';
    scheduleIdle();
    startLoop();
    scheduleBodyReport(400);
    setTimeout(() => say(pick(phrases.greet), 2000), 900);
  } catch (err) {
    console.error('model load failed:', err && err.message);
    say((L && L.modelLoadFail) || 'Failed to load the model', 5000);
  }
})();
