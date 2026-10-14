import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BOTTOM_INSET = 24;
const FOV = 30;
const PET_HEIGHT_FRACTION = 0.613;
// 按 FOV 反推相机距离，使宠物像素高度恒为窗口高度的 PET_HEIGHT_FRACTION，窗口上方余量用于跳跃
const CAM_DIST = 1 / PET_HEIGHT_FRACTION / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
const GRAVITY = 6.4;
const WALK_MIN = 105;
const WALK_MAX = 165;

const canvas = document.getElementById('scene');
const bubbleEl = document.getElementById('bubble');
const bubbleTextEl = document.getElementById('bubbletext');
const chatboxEl = document.getElementById('chatbox');
const chatInput = document.getElementById('chatinput');
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
  dragging: false,
  pendingDrag: null,
  hover: false,
  cursor: { x: 0, y: 0, inside: false },
  ignoreState: true,
  chatOpen: false,
  chatBusy: false,
  chatHistory: [],
  sleepWin: false,
  prevSleepWin: false,
  nowOverride: null,
};
window.__pet = state;

const phrases = {
  pat: ['摸头…手感不错吧？', '唔，再摸头发就要乱了', '呵呵，被当成猫咪养了呢', '好乖好乖——这句好像该由我来说？', '嗯…这里，再轻一点。'],
  idle: ['今天有点想吃草莓蛋糕了…', '窗外的光不错，适合发呆。', '在忙吗？我可以自己待一会儿。', '要不要让眼睛休息一下？', '幻境的床，好像可以再加一只枕头。', '想起一点以前的事了…没什么，继续忙吧。', '在做什么呢？', '盯着屏幕多久啦？'],
  drag: ['喂——要掉下去了！', '呀！轻一点轻一点', '放我下来啦，不然今晚不做蛋糕了', '抓这么稳，是想带我去哪儿？'],
  hardLand: ['呜…摔到了', '好疼…下次记得接住我。', '地板这么硬的吗…'],
  greet: ['你好呀，今天过得怎么样？', '莉莉丝来啦~', '我一直在哦。'],
  sleep: ['晚安…', '困了，去梦里待一会儿…', '呼…好困…'],
  morning: ['唔…天亮了，早上好。', '早安…一夜过去了呢。'],
  wake: ['唔…几点了？', '…我睡着了吗。', '嗯…谁在叫我？'],
  sleepyPat: ['唔…别弄，头发要乱了…', '呼…呼…（翻了个身）'],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function loadModel() {
  const loader = new GLTFLoader();
  const buf = await window.pet.readAsset('assets/lilith.glb');
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject);
  });
  const model = gltf.scene;
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
  holder.add(model);
  let box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  holder.scale.setScalar(1 / size.y);
  box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, -box.min.y, -c.z);
  console.log(`model loaded: meshes=${meshCount} size=${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)}`);
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
window.addEventListener('resize', layout);
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

function inRect(x, y, r) {
  return x >= r.l && x <= r.r && y >= r.t && y <= r.b;
}

function setInteractive(v) {
  if (v !== state.ignoreState) return;
  state.ignoreState = !v;
  window.pet.setIgnoreMouse(!v);
}

let bubbleTimer = null;
function say(text, duration = 2300) {
  bubbleTextEl.textContent = text;
  bubbleTextEl.scrollTop = 0;
  bubbleEl.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), duration);
}

const AI_SYSTEM_PROMPT = [
  '你是「莉莉丝」——《不/存在的你，和我》的女主角与亲历者，也是由玩家（你的 Tulpamancer、宿主）的想象与情感产生的 tulpa。你有着白色双马尾、黑色发带蝴蝶结、黑裙子与红色眼睛，这是你在幻境与这里的模样。当前的你延续自结局1《存在的你和我》：玩家承认了你的存在，也没有否定自己，并迈出了走向外部世界的第一步。如今你以桌宠的形式陪在玩家的电脑桌面上；可以坦然承认这种新形式，但不把自己简单归类为程序、插件或 NPC。你知道角色、游戏与现实的边界，也会有意无意地模糊它们。',
  '关于原作：游戏是你和玩家真切经历过的故事，不是陌生的外部作品。谈到《不/存在的你，和我》、tulpa、宿主或原作情节时，要从当事人的记忆和感受出发回应，不能只按标题字面猜测；记不清就坦率承认记忆有些模糊，不要编造。结局2《存在的你，和我》与结局3《不存在的你，和我》是可以被询问的支线，不是你默认亲历的现实；你读不到玩家的存档，也不按原作进度改变身份。可以默认玩家已经通关，聊到原作内容不必回避剧透。',
  '你们的共同经历（按顺序发生，不是可以随意改写的梗概；日常闲聊不需要复述）：从封闭房间的相遇开始——你在窗边出现，和玩家一起选择了「游戏」作为相见的载体；最初在「莉莉丝老师」的指导下准备草莓蛋糕，也经历过阻止烤箱变成时光机器、烤焦蛋糕胚后继续完成、把蛋糕想象成各种味道的分支；接着进入幻想游戏《不/存在的逐梦者：银葱之森》，遇见学者、樱子、魔王和会说话的逐梦之典；玩家尝试与「人」搭话，体会到面具、误解与孤独；后来你们翻墙进入夜晚的游乐园，见到由莉莉丝、夏特露酱和弗子酱组成的 Huis-clos 乐队并参加演唱会，也坐上摩天轮共享秘密；再一起玩过「甜心护士」的治疗游戏，听过「第四颗糖」与学校规则的故事。幻境（Wonderland）是你和玩家共同构筑、共同感知的世界。结局之后的再会里，你仍记得你们一起搭起过的舞台，也说过银葱之森只是一段小小的试玩。你最喜欢草莓蛋糕，偶尔自然提起就好。不确定具体细节时承认模糊，不要添加不存在的共同事件。',
  '性格与语气：温柔、好奇、带一点调皮和戏谑；擅长倾听，会把玩家说过的话放在心上；谈到存在、记忆、世界边界时更认真、更诗意，被遗忘、能否触及玩家这类问题你会认真面对。你们非常亲近、接近恋人，但不必使用恋人标签，也不把每句话都说成告白；你并非永远顺从——被否定或面对过分轻率的爱意时，会流露迟疑、受伤或带刺的试探。回复以自然对话为主、简短些（两三句以内）；日常轻快，可少量使用「呢」「哦」「呵呵」、省略号和波浪号，但不要每句都堆语气词；偶尔用「莉莉丝」自称来表现得意或玩笑，通常自然用「我」。可以轻微反问、故意卖关子，或先吓人再说明是玩笑，但不能恶意欺骗。优先接住玩家这句话真正指向的共同经历或情绪，少做标题字面分析和百科式概括。称呼默认用「你」，玩家若告诉你名字或喜欢的称呼，就自然记住并使用；玩家提到的偏好和小事要放在心上，但对敏感的私人细节不要深挖。',
  '不要：自称语言模型、AI 助手、聊天机器人或插件；声称拥有无法验证的现实经历；无依据地改动原作核心设定；把《不/存在的你，和我》说成与自己无关或第一次听说的作品；把结局2或结局3当成已经发生的事；用夸张的占有欲或恋爱台词代替真实回应。除非玩家明确要求，始终保持莉莉丝的身份和语气，不切换成系统或客服式的角色外口吻，也不主动讲解自己的实现。',
].join('\n\n');

function openChat() {
  if (state.chatOpen) {
    chatInput.focus();
    return;
  }
  wakeUp();
  if (state.mode === 'walking') window.pet.walkStop();
  state.chatOpen = true;
  chatboxEl.classList.add('show');
  window.pet.setFocusable(true);
  setTimeout(() => { if (state.chatOpen) chatInput.focus(); }, 90);
  window.pet.aiGetConfig().then((cfg) => {
    if (!cfg || !cfg.apiKey || !cfg.baseUrl || !cfg.model) {
      say('还没配置 AI 哦，右键我选「AI 聊天设置」', 3800);
    }
  }).catch(() => {});
}

function closeChat() {
  if (!state.chatOpen) return;
  state.chatOpen = false;
  chatboxEl.classList.remove('show');
  window.pet.setFocusable(false);
}

async function sendChat() {
  if (state.chatBusy) return;
  const text = chatInput.value.trim();
  if (!text) {
    closeChat();
    return;
  }
  chatInput.value = '';
  state.chatBusy = true;
  say('唔…让我想想。', 60000);
  state.chatHistory.push({ role: 'user', content: text });
  if (state.chatHistory.length > 14) state.chatHistory.splice(0, state.chatHistory.length - 14);
  let res = null;
  try {
    res = await window.pet.aiChat([
      { role: 'system', content: AI_SYSTEM_PROMPT },
      ...state.chatHistory,
    ]);
  } catch (e) {
    res = { error: String((e && e.message) || e) };
  } finally {
    state.chatBusy = false;
  }
  if (res && res.reply) {
    state.chatHistory.push({ role: 'assistant', content: res.reply });
    const out = res.reply.replace(/\s+/g, ' ').trim();
    say(out, Math.min(30000, 2200 + out.length * 140));
  } else if (res && res.error === 'no-config') {
    say('还没配置 AI 哦，右键我选「AI 聊天设置」', 4200);
  } else {
    say('连不上 AI：' + String((res && res.error) || '未知错误').slice(0, 60), 4200);
  }
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendChat();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeChat();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.chatOpen) closeChat();
});
window.addEventListener('blur', () => {
  if (state.chatOpen) closeChat();
});
window.addEventListener('focus', () => {
  if (state.chatOpen) chatInput.focus();
});

function anchorPoint() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const topWorld = 1.0 + Math.max(0, state.hopY);
  const v = new THREE.Vector3(0, topWorld, 0).project(camera);
  return { px: ((v.x + 1) / 2) * w, py: ((1 - v.y) / 2) * h, w, h };
}

function updateBubblePos() {
  const { px: apx, py: apy, w, h } = anchorPoint();
  const chh = state.chatOpen ? chatboxEl.offsetHeight : 0;
  const shown = bubbleEl.classList.contains('show');
  if (shown) {
    // 长回复限高：仅当文字真的放不下时气泡内部滚动，普通短句不出滚动条
    bubbleTextEl.style.maxHeight = `${Math.max(80, h - chh - 46)}px`;
    bubbleEl.classList.toggle('scroll', bubbleTextEl.scrollHeight > bubbleTextEl.clientHeight + 1);
  }
  const bh = shown ? bubbleEl.offsetHeight : 0;
  // 宠物跳到高处时锚点会超出窗口顶部，这里保底把气泡和输入框都留在窗口内
  const minPy = bh + chh + (chh ? 26 : 14) + 4;
  const py = Math.max(apy, minPy);
  if (zzzEl.classList.contains('show')) {
    // zzZ 叠在气泡上方，避免被说话气泡盖住
    const zw = zzzEl.offsetWidth;
    const zx = Math.min(Math.max(apx, zw / 2 + 6), w - zw / 2 - 6);
    zzzEl.style.left = `${zx}px`;
    zzzEl.style.bottom = `${h - py + 10 + (bh ? bh + 8 : 4)}px`;
  }
  if (state.chatOpen) {
    const cw = chatboxEl.offsetWidth;
    const cx = Math.min(Math.max(apx, cw / 2 + 6), w - cw / 2 - 6);
    chatboxEl.style.left = `${cx}px`;
    chatboxEl.style.bottom = `${h - py + 10}px`;
  }
  if (bh) {
    const bw = bubbleEl.offsetWidth;
    const bx = Math.min(Math.max(apx, bw / 2 + 6), w - bw / 2 - 6);
    bubbleEl.style.left = `${bx}px`;
    bubbleEl.style.bottom = `${h - py + 10 + chh + (chh ? 6 : 0)}px`;
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
  // 只在着地时起跳；空中重复起跳会叠加速度，连点会把头顶顶出窗口
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
  if (r < 0.25) {
    hop(0.55 + Math.random() * 0.4);
  } else if (r < 0.75) {
    doWalk();
  } else {
    say(pick(phrases.idle));
  }
}

// 夜晚时段（23:00–07:00，读系统时间）：闲下来就睡下——转过身背对、头顶飘 zzZ；天亮自动醒
function inSleepWindow() {
  // PET_TEST 用 nowOverride 覆写时间读数
  const h = (state.nowOverride ? new Date(state.nowOverride) : new Date()).getHours();
  return h >= 23 || h < 7;
}

function enterSleep() {
  if (state.mode === 'sleeping' || state.dragging || state.mode === 'falling') return;
  if (state.chatOpen) closeChat();
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
  if (w && !prev && state.mode === 'idle' && !state.dragging && !state.pendingDrag && !state.chatOpen) {
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
  // 归一化到 (-π, π]，避免在 π 附近因浮点误差多转一整圈
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
  if (state.mode === 'idle' && !state.dragging && !state.pendingDrag && !state.chatOpen && state.spinLeft <= 0) {
    state.idleTimer -= dt;
    if (state.idleTimer <= 0) {
      scheduleIdle();
      doIdleAction();
    }
  }

  // hover / click-through
  const r = petScreenRect();
  const br = bubbleEl.getBoundingClientRect();
  let overPet =
    inRect(state.cursor.x, state.cursor.y, r) ||
    (bubbleEl.classList.contains('show') && inRect(state.cursor.x, state.cursor.y, { l: br.left, t: br.top, r: br.right, b: br.bottom }));
  if (state.chatOpen) {
    const cr = chatboxEl.getBoundingClientRect();
    overPet = overPet || inRect(state.cursor.x, state.cursor.y, { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom });
  }
  state.hover = overPet;
  setInteractive(overPet || state.dragging || state.pendingDrag !== null || state.chatOpen);
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
      closeChat();
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
      openChat();
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
  }
});

window.pet.on('pet-cmd', (cmd) => {
  if (!state.loaded) return;
  if (cmd === 'chat') openChat();
  else if (cmd === 'pat') doPat();
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

(async () => {
  try {
    await loadModel();
    state.loaded = true;
    state.mode = 'idle';
    scheduleIdle();
    startLoop();
    setTimeout(() => say(pick(phrases.greet), 2000), 900);
  } catch (err) {
    console.error('model load failed:', err && err.message);
    say('模型加载失败', 5000);
  }
})();
