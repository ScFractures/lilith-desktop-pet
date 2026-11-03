import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRig, collectLookEntries, lookSet, prepareModelMaterials } from './rig.js';
import { createPetAnimator } from './pet-anim.js';
import { createPoseBounds, fitPoseCamera } from './pose-bounds.mjs';

const BOTTOM_INSET = 48;
const FOV = 30;
const PET_HEIGHT_FRACTION = 0.613;
// Keep model height unchanged; extra width is transparent animation space.
let poseBounds = null;
let framingZoom = 1;
// Camera distance derived from FOV so the pet's pixel height stays PET_HEIGHT_FRACTION of the
// window height; the headroom above is for jumping
const CAM_DIST = 1 / PET_HEIGHT_FRACTION / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
const GRAVITY = 6.4;
// Jump timeline: anticipation crouch, ballistic air, then landing absorption.
const JUMP_CROUCH = 0.16;
const JUMP_LAND = 0.22;
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
  jumpPhase: 'idle',
  jumpT: 0,
  jumpPower: 0,
  squash: { x: 0, v: 0 },
  idleTimer: 3.5,
  idleSayTimer: 600,
  dragging: false,
  pendingDrag: null,
  heldStyle: 'hand',
  sitStyle: 'front',
  sitElapsed: 0,
  sitReport: 0,
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
  rig: null,
  animator: null,
  talkLeft: 0,
  patLeft: 0,
};
window.__pet = state;

let L = null;
let phrases = {};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const PERSONA_BY_MODEL = { lilith: 'lilith', lilith_v5: 'lilith', deepseek_m: 'deepseek_m', deepseek_winter: 'deepseek_m', deepseek_v4: 'deepseek_m', deepseek: 'deepseek_m' };
// Some FBX exports aren't aligned to their local +X; nudge the winter model toward its left 10°
const MODEL_YAW_OFFSET = { deepseek_winter: (10 * Math.PI) / 180 };
// The rigged GLBs are exported facing +Z, while the older assets face +X
const MODEL_BASE_YAW = { lilith_v5: 0, deepseek_v4: 0 };
const RIGGED_MODELS = new Set(['lilith_v5', 'deepseek_v4']);
// Ground travel per full gait cycle, in body heights. Calibrated from the
// planted foot's backward drift during flat-foot stance, so the window moves
// exactly as far as the animation says the feet do and nothing skates.
const RIGGED_STRIDE = { lilith_v5: 0.432, deepseek_v4: 0.370 };

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
window.pet.on('look-changed', (look) => {
  savedLook = look;
  applyLook(look);
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
let lookEntries = null;
let savedLook = null;

function applyLook(look) {
  if (!state.rig || !lookEntries) return;
  const set = lookSet(state.model);
  const parts = {};
  const acc = {};
  for (const part of set.parts) parts[part.key] = !(look && look.parts && look.parts[part.key] === false);
  for (const def of set.accessories) acc[def.id] = !(look && look.acc && look.acc[def.id] === false);

  for (const part of set.parts) {
    const node = lookEntries.partNodes[part.key];
    if (node) node.visible = parts[part.key];
  }
  // The areola is a separate mesh layer that sits on top of the clothes. It
  // must stay hidden while the pet is dressed.
  for (const entry of state.rig.materials.get(set.areola.mats[0]) || []) entry.mesh.visible = !parts[set.areola.part];
  for (const def of set.accessories) {
    for (const entry of lookEntries.accEntries[def.id] || []) {
      entry.material.visible = acc[def.id] && (!entry.part || parts[entry.part]);
    }
  }
}

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
        if (RIGGED_MODELS.has(key)) {
          m.envMapIntensity = 0.9;
        } else {
          m.metalness = 0;
          m.envMapIntensity = 0.5;
        }
      }
    }
  });
  prepareModelMaterials(key, model);
  model.rotation.y = MODEL_BASE_YAW[key] ?? -Math.PI / 2;
  while (holder.children.length) {
    const old = holder.children[0];
    holder.remove(old);
    disposeObject(old);
  }
  // Box3.setFromObject measures world space, so measure with the pet's pose
  // neutralized: a yaw of π (sleeping) or ±π/2 (walking) would otherwise flip
  // the centering offset and push the model out of the window.
  const savedPetPos = pet.position.clone();
  const savedPetRot = pet.rotation.clone();
  pet.position.set(0, 0, 0);
  pet.rotation.set(0, 0, 0);
  pet.updateMatrixWorld(true);
  holder.scale.setScalar(1);
  holder.position.set(0, 0, 0);
  holder.add(model);
  let box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  // Normalize on the model itself: holder.scale is rewritten every frame by the
  // squash-and-stretch spring, so it cannot carry the model normalization.
  model.scale.setScalar(1 / size.y);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  holder.updateMatrixWorld(true);
  pet.position.copy(savedPetPos);
  pet.rotation.copy(savedPetRot);
  pet.updateMatrixWorld(true);

  state.animator = null;
  state.rig = null;
  lookEntries = null;
  state.model = key;
  if (RIGGED_MODELS.has(key)) {
    state.rig = createRig(model);
    state.animator = createPetAnimator(state.rig, { model: key });
    lookEntries = collectLookEntries(state.rig, key);
    applyLook(savedLook);
  }
  poseBounds = createPoseBounds(pet);
  framingZoom = 1;
  state.talkLeft = 0;
  state.patLeft = 0;

  console.log(`model loaded: ${key} meshes=${meshCount} size=${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)}`);
  return true;
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.zoom = 1;
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
  if (poseBounds) poseBounds(tmpBox);
  else tmpBox.setFromObject(pet);
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

function touchZoneAt(x, y) {
  const r = petScreenRect();
  if (!inRect(x, y, r)) return null;
  const h = Math.max(1, r.b - r.t);
  const w = Math.max(1, r.r - r.l);
  const f = (y - r.t) / h;
  const dx = Math.abs(x - (r.l + r.r) / 2) / w;
  if (f < 0.30) return 'head';
  if (f < 0.55 && dx < 0.28) return 'chest';
  if (f < 0.72 && dx < 0.26) return 'lower';
  return 'normal';
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
  state.talkLeft = Math.min(14, Math.max(1.4, ms / 1000));
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
  if (state.mode === 'sitting') { window.pet.leavePerch(); return; }
  // Only jump from the ground; re-jumping mid-air stacks velocity and rapid clicks push her head out of the window
  if (state.hopY > 0 || state.hopV > 0 || state.jumpPhase === 'crouch') return;
  state.jumpPhase = 'crouch';
  state.jumpT = 0;
  state.jumpPower = power;
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

function doPat() {
  if (state.mode === 'sleeping') {
    say(pick(phrases.sleepyPat));
    return;
  }
  state.patLeft = 1.6;
  say(pick(phrases.pat));
  const r = petScreenRect();
  spawnHeart((r.l + r.r) / 2 + (Math.random() - 0.5) * 40, r.t + 30);
  setTimeout(() => spawnHeart((r.l + r.r) / 2 + (Math.random() - 0.5) * 60, r.t + 10), 180);
}

function doTouch(zone) {
  // A gentle head pat uses the sleep-specific response without waking her.
  // Other touch zones retain their normal wake-up behavior.
  if (zone === 'head' && state.mode === 'sleeping') {
    doPat();
    return;
  }
  if (state.mode === 'sleeping') wakeUp();
  if (state.mode === 'walking') {
    window.pet.walkStop();
    state.mode = 'idle';
    scheduleIdle();
  }
  if (state.mode !== 'sitting') state.targetYaw = 0;
  if (zone === 'head') {
    doPat();
    return;
  }
  if (zone === 'normal') {
    say(pick(phrases.touch));
    hop(0.55);
    return;
  }
  const lines = (zone === 'chest' ? phrases.chest : phrases.lower) || phrases.pat;
  say(pick(lines));
  squashKick(zone === 'lower' ? -0.1 : 0.05);
  hop(zone === 'lower' ? 0.5 : 0.85);
  if (zone === 'chest') {
    const r = petScreenRect();
    spawnHeart((r.l + r.r) / 2 + (Math.random() - 0.5) * 30, r.t + (r.b - r.t) * 0.55);
  }
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

  if (state.talkLeft > 0) state.talkLeft -= dt;
  if (state.patLeft > 0) state.patLeft -= dt;

  // squash-spring
  const s = state.squash;
  s.v += (-420 * s.x - 24 * s.v) * dt;
  s.x += s.v * dt;

  // jump timeline: crouch, launch, ballistic air, then absorb the landing
  if (state.jumpPhase === 'crouch') {
    state.jumpT += dt;
    if (state.jumpT >= JUMP_CROUCH) {
      state.jumpPhase = 'air';
      state.jumpT = 0;
      state.hopV = 1.9 * state.jumpPower;
      squashKick(0.05 * state.jumpPower);
    }
  }

  // hop physics
  if (state.hopV !== 0 || state.hopY > 0) {
    state.hopV -= GRAVITY * dt;
    state.hopY += state.hopV * dt;
    if (state.hopY <= 0) {
      const impact = Math.abs(state.hopV);
      state.hopY = 0;
      state.hopV = 0;
      state.jumpPhase = 'land';
      state.jumpT = 0;
      squashKick(-0.05 - Math.min(0.18, impact * 0.06));
    }
  }

  if (state.jumpPhase === 'air') {
    state.jumpT += dt;
  } else if (state.jumpPhase === 'land') {
    state.jumpT += dt;
    if (state.jumpT >= JUMP_LAND) {
      state.jumpPhase = 'idle';
      state.jumpT = 0;
    }
  }

  const facing = state.targetYaw;
  state.yaw += shortestArc(state.yaw, facing) * Math.min(1, dt * 5.5);
  // Normalize to (-π, π] so float error near π can't add a full extra turn
  if (state.yaw > Math.PI) state.yaw -= Math.PI * 2;
  else if (state.yaw <= -Math.PI) state.yaw += Math.PI * 2;

  // walk bob
  let bobY = 0, walkRoll = 0, walkPitch = 0;
  if (state.mode === 'walking') {
    if (RIGGED_MODELS.has(state.model)) {
      // Match the leg cycle to the window's ground speed so the planted foot
      // does not slide across the desktop. The stride is the ground travel per
      // full cycle, calibrated from the stance foot's drift while flat on the
      // floor.
      const stridePx = RIGGED_STRIDE[state.model] * window.innerHeight * PET_HEIGHT_FRACTION;
      state.walkPhase += dt * (Math.PI * 2 * state.walkSpeed) / Math.max(40, stridePx);
    } else {
      state.walkPhase += dt * (6.2 + state.walkSpeed * 0.012);
      bobY = Math.abs(Math.sin(state.walkPhase)) * 0.032;
      walkRoll = Math.sin(state.walkPhase * 2) * 0.028;
      walkPitch = 0.065;
    }
  }

  // drag dangle: hoisted by one hand the body hangs away from the raised arm;
  // held around the waist it drops straight down with every limb loose.
  let dragRoll = 0, dragPitch = 0, stretch = 0;
  if (state.dragging) {
    if (RIGGED_MODELS.has(state.model)) {
      // The v5 rig hangs its left arm on the opposite screen side from the
      // DeepSeek rig, so its lean points the other way.
      const waist = state.heldStyle === 'waist';
      const lean = state.model === 'lilith_v5' ? -1 : 1;
      dragRoll = waist ? 0 : lean * 0.21;
      dragPitch = waist ? 0.06 : 0.13;
      stretch = 0; // Bone-driven carry: do not stretch the body or clothing.
    } else {
      dragRoll = Math.sin(t * 5.2) * 0.10;
      dragPitch = 0.10;
      stretch = 0.05;
    }
  } else if (state.mode === 'falling') {
    dragPitch = 0.05;
    stretch = RIGGED_MODELS.has(state.model) ? 0 : 0.06;
  }

  pet.rotation.y = state.yaw;
  pet.rotation.x = walkPitch + dragPitch;
  pet.rotation.z = walkRoll + dragRoll;

  const sleeping = state.mode === 'sleeping';
  const breath = state.mode === 'sitting' ? 0
    : Math.sin(t * (sleeping ? 1.05 : 1.7)) * (sleeping ? 0.017 : 0.011);
  const deformation = RIGGED_MODELS.has(state.model) ? 0 : s.x + breath + stretch;
  const sy = 1 + deformation;
  const sxz = 1 - deformation * 0.55;
  holder.scale.set(sxz, sy, sxz);

  // Skeletal life: breathing, walk cycle, talking gestures, sleep and drag poses
  if (state.animator) {
    const rootMotion = state.animator.update(dt, {
      walking: state.mode === 'walking',
      walkPhase: state.walkPhase,
      talking: state.talkLeft > 0 && !sleeping && !state.dragging && state.mode !== 'falling',
      sleeping,
      dragging: state.dragging,
      heldStyle: state.heldStyle,
      sitting: state.mode === 'sitting',
      sitStyle: state.sitStyle,
      falling: state.mode === 'falling',
      jumpPhase: state.jumpPhase,
      jumpT: state.jumpT,
      jumpPower: state.jumpPower,
      pat: state.patLeft > 0 ? Math.min(1, state.patLeft / 0.8) : 0,
    });
    if (RIGGED_MODELS.has(state.model) && rootMotion) bobY += rootMotion.bob;
  }
  pet.position.y = bobY + state.hopY;

  // Reset the reference projection before fitting this frame's animated pose.
  // This runs before hit testing, bubbles and seat anchors so all use the same
  // projection as rendering (no invisible limbs or stale clickable regions).
  if (poseBounds) {
    framingZoom = fitPoseCamera(camera, poseBounds(tmpBox), window.innerWidth, window.innerHeight, dt, framingZoom);
  }

  // blob shadow
  const lift = state.hopY;
  const bs = 1 + lift * 0.6;
  blob.visible = state.mode !== 'sitting';
  blob.scale.set(bs, bs, 1);
  blob.material.opacity = Math.max(0.08, 0.9 / (1 + lift * 2.6));

  // idle scheduler
  if (state.mode === 'idle' && !state.dragging && !state.pendingDrag) {
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

  if (state.mode === 'sitting') {
    state.sitElapsed += dt;
    state.sitReport += dt;
    if (state.sitElapsed > 0.8 && state.sitReport > 0.1 && state.rig) {
      state.sitReport = 0;
      pet.updateMatrixWorld(true);
      const hips = ['左足', '右足'].map(name => state.rig.bones.get(name)?.[0]).filter(Boolean);
      if (hips.length) {
        const anchor = new THREE.Vector3();
        for (const bone of hips) anchor.add(bone.getWorldPosition(new THREE.Vector3()));
        anchor.multiplyScalar(1 / hips.length);
        // The seat contact is just below the hip joints. In the curled pose
        // keep hips and tucked feet wholly above the window's inner bottom.
        if (state.sitStyle === 'curl') {
          // Use the lowest actual foot/toe as the inner-floor contact, not a
          // standing-height estimate: all three rigs have different leg ratios.
          for (const name of ['左足首', '右足首', '左つま先', '右つま先']) {
            const bone = state.rig.bones.get(name)?.[0];
            if (bone) anchor.y = Math.min(anchor.y, bone.getWorldPosition(new THREE.Vector3()).y);
          }
          anchor.y -= 0.025;
        } else anchor.y -= 0.025;
        anchor.project(camera);
        window.pet.perchReady({ x: (anchor.x + 1) * window.innerWidth / 2,
          y: (1 - anchor.y) * window.innerHeight / 2 });
      }
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
      if (state.jumpPhase === 'crouch') {
        state.jumpPhase = 'idle';
        state.jumpT = 0;
      }
      state.dragging = true;
      state.mode = 'drag';
      state.heldStyle = Math.random() < 0.5 ? 'hand' : 'waist';
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
    const px = e.clientX;
    const py = e.clientY;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      const zone = RIGGED_MODELS.has(state.model) ? touchZoneAt(px, py) : null;
      if (zone) {
        doTouch(zone);
      } else {
        wakeUp({ say: true });
        hop(0.75 + Math.random() * 0.3);
        state.targetYaw = 0;
      }
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
  if (name === 'perch-start') {
    if (!state.loaded || !state.animator || state.dragging || state.mode === 'sleeping') {
      window.pet.leavePerch();
      return;
    }
    state.mode = 'sitting';
    state.sitStyle = data.style;
    state.sitElapsed = state.sitReport = 0;
    state.targetYaw = data.style === 'curl' ? data.side * Math.PI / 2 : 0;
    state.hopY = state.hopV = 0;
    state.jumpPhase = 'idle';
    state.squash.x = state.squash.v = 0;
  } else if (name === 'perch-end') {
    if (state.mode === 'sitting') {
      state.mode = 'idle';
      state.targetYaw = 0;
      scheduleIdle();
    }
    scheduleBodyReport(1000);
  } else if (name === 'land') {
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
  else if (cmd === 'greet') {
    wakeUp();
    state.targetYaw = 0;
    say(pick(phrases.greet));
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
    if (typeof window.pet.getLook === 'function') {
      savedLook = await window.pet.getLook().catch(() => null);
    }
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
