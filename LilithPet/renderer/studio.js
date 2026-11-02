import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createRig,
  applyBoneRotation,
  resetBone,
  resetAllBones,
  setMorph,
  resetMorphs,
  collectLookEntries,
  lookSet,
  prepareModelMaterials,
} from './rig.js';
import { createPetAnimator } from './pet-anim.js';

const DEG = Math.PI / 180;
const MODEL_HEIGHT = 1.8;
const ACCENT = 0xd97898;
const MODEL_DEFS = {
  lilith_v5: { brand: 'Lilith', ver: 'v5', asset: 'assets/lilith_v5.glb' },
  deepseek_v4: { brand: 'DeepSeek', ver: 'v4', asset: 'assets/deepseek_v4.glb' },
};
const MODEL_KEY = MODEL_DEFS[new URLSearchParams(location.search).get('model')]
  ? new URLSearchParams(location.search).get('model')
  : 'lilith_v5';
const MODEL = MODEL_DEFS[MODEL_KEY];

const LABELS = {
  zh: {
    brandSub: '四部件 · 569 骨骼 · 32 表情',
    hint: '拖拽旋转 · 滚轮缩放 · 右键平移',
    loading: '正在加载模型…',
    loadingSub: '18 MB · 4 部件 · 569 骨骼',
    fatalTitle: '模型加载失败',
    fatalText: '请确认 assets/lilith_v5.glb 存在，然后重试。',
    retry: '重试',
    tabParts: '部件',
    tabExpressions: '表情',
    tabBones: '骨骼',
    tabView: '视图',
    partsHeading: '部件',
    partsNote: '四件套可以单独隐藏，也可以一键全部脱下。',
    partsAll: '全部穿上',
    partsNone: '全部隐藏',
    partsUndress: '无服装',
    accHeading: '配饰',
    accNote: '发饰、手环、丝带、袜子与鞋子按材质单独控制。',
    accAll: '全部显示',
    accNone: '全部隐藏',
    accFootnote: '隐藏上衣时，丝带和丝带晶体会跟随上衣一起隐藏。',
    exprHeading: '表情',
    exprNote: '32 个顶点表情，0–100% 连续可调，可叠加。',
    exprReset: '全部归零',
    exprOther: '其它',
    bonesHeading: '骨骼',
    bonesNote: '569 根骨骼共用一个骨架，旋转会同步到四个部件。',
    bonesReset: '全部复位',
    boneSearch: '搜索骨骼…',
    boneCommon: '常用骨骼',
    boneResults: '搜索结果',
    boneUnselected: '未选择骨骼',
    boneSelectHint: '在列表中选择一根骨骼',
    boneReset: '复位',
    boneOriginal: '原名',
    boneSearchAll: '输入关键词可搜索全部 {n} 根骨骼',
    boneNoResult: '没有匹配的骨骼',
    viewHeading: '视图',
    viewNote: '相机、旋转与辅助显示。',
    optTurntable: '自动旋转',
    optSpeed: '旋转速度',
    optSkeleton: '显示骨骼线',
    optGround: '显示地台',
    camHeading: '机位',
    camFront: '正面',
    camThreeQuarter: '45°',
    camSide: '侧面',
    camBack: '背面',
    previewHeading: '动作预览',
    previewOff: '关闭',
    previewIdle: '待机',
    previewWalk: '行走',
    previewTalk: '说话',
    previewSleep: '睡觉',
    previewNote: '预览会临时接管骨骼和表情；点选骨骼或调整表情会自动停止预览。',
    statsHeading: '模型信息',
    statParts: '部件',
    statBones: '骨骼',
    statMorphs: '表情',
    statMaterials: '材质',
    statTris: '三角面',
    statCalls: '绘制调用',
    footReady: '就绪',
    footLoading: '加载中…',
    footPreview: '预览：{mode}',
    footError: '加载失败',
    lookApply: '应用到桌宠',
    lookApplied: '已应用到桌宠',
    lookApplyFail: '应用失败',
    resetAll: '全部重置',
    turntable: '自动旋转',
    cameraReset: '重置视角',
    parentHidden: '所属部件已隐藏',
    partVisibleCount: '{on} / {all}',
  },
  en: {
    brandSub: '4 parts · 569 bones · 32 expressions',
    hint: 'Drag to orbit · scroll to zoom · right-drag to pan',
    loading: 'Loading model…',
    loadingSub: '18 MB · 4 parts · 569 bones',
    fatalTitle: 'Model failed to load',
    fatalText: 'Make sure assets/lilith_v5.glb exists, then retry.',
    retry: 'Retry',
    tabParts: 'Parts',
    tabExpressions: 'Expressions',
    tabBones: 'Bones',
    tabView: 'View',
    partsHeading: 'Parts',
    partsNote: 'Hide any of the four parts, or take the whole outfit off at once.',
    partsAll: 'Wear all',
    partsNone: 'Hide all',
    partsUndress: 'No clothes',
    accHeading: 'Accessories',
    accNote: 'Hairpin, headband, bracelets, ribbons, socks and shoes are controlled by material.',
    accAll: 'Show all',
    accNone: 'Hide all',
    accFootnote: 'Hiding the top also hides its ribbons and ribbon crystals.',
    exprHeading: 'Expressions',
    exprNote: '32 vertex morphs, continuously adjustable from 0–100% and stackable.',
    exprReset: 'Reset all',
    exprOther: 'Other',
    bonesHeading: 'Bones',
    bonesNote: 'All 569 bones share one skeleton, so a rotation reaches every part.',
    bonesReset: 'Reset all',
    boneSearch: 'Search bones…',
    boneCommon: 'Common bones',
    boneResults: 'Results',
    boneUnselected: 'No bone selected',
    boneSelectHint: 'Pick a bone from the list',
    boneReset: 'Reset',
    boneOriginal: 'original',
    boneSearchAll: 'Type to search all {n} bones',
    boneNoResult: 'No matching bones',
    viewHeading: 'View',
    viewNote: 'Camera, rotation and helper display.',
    optTurntable: 'Turntable',
    optSpeed: 'Speed',
    optSkeleton: 'Skeleton lines',
    optGround: 'Platform',
    camHeading: 'Camera',
    camFront: 'Front',
    camThreeQuarter: '45°',
    camSide: 'Side',
    camBack: 'Back',
    previewHeading: 'Motion preview',
    previewOff: 'Off',
    previewIdle: 'Idle',
    previewWalk: 'Walk',
    previewTalk: 'Talk',
    previewSleep: 'Sleep',
    previewNote: 'Preview temporarily drives bones and expressions; picking a bone or editing an expression stops it.',
    statsHeading: 'Model info',
    statParts: 'Parts',
    statBones: 'Bones',
    statMorphs: 'Expressions',
    statMaterials: 'Materials',
    statTris: 'Triangles',
    statCalls: 'Draw calls',
    footReady: 'Ready',
    footLoading: 'Loading…',
    footPreview: 'Preview: {mode}',
    footError: 'Load failed',
    lookApply: 'Apply to pet',
    lookApplied: 'Applied to pet',
    lookApplyFail: 'Apply failed',
    resetAll: 'Reset all',
    turntable: 'Turntable',
    cameraReset: 'Reset view',
    parentHidden: 'Its part is hidden',
    partVisibleCount: '{on} / {all}',
  },
};

const MODEL_LABELS = {
  lilith_v5: {},
  deepseek_v4: {
    zh: {
      brandSub: '三部件 · 476 骨骼 · 31 表情',
      loadingSub: '30 MB · 3 部件 · 476 骨骼',
      fatalText: '请确认 assets/deepseek_v4.glb 存在，然后重试。',
      partsNote: '身体、连衣裙与内裤可以单独隐藏，也可以一键全部脱下。',
      exprNote: '31 个顶点表情，0–100% 连续可调，可叠加。',
      accNote: '饰品、蝴蝶结、手臂环、脖子环、腿环与尾巴按材质单独控制。',
      accFootnote: '隐藏身体时，饰品与尾巴会跟随身体一起隐藏。',
      bonesNote: '476 根骨骼共用一个骨架，旋转会同步到三个部件。',
    },
    en: {
      brandSub: '3 parts · 476 bones · 31 expressions',
      loadingSub: '30 MB · 3 parts · 476 bones',
      fatalText: 'Make sure assets/deepseek_v4.glb exists, then retry.',
      partsNote: 'Hide the body, dress or panties individually, or take everything off at once.',
      exprNote: '31 vertex morphs, continuously adjustable from 0–100% and stackable.',
      accNote: 'Ornament, bows, arm rings, neck ring, leg ring and tail are controlled by material.',
      accFootnote: 'Hiding the body also hides its ornament and tail.',
      bonesNote: 'All 476 bones share one skeleton, so a rotation reaches every part.',
    },
  },
};
Object.assign(LABELS.zh, MODEL_LABELS[MODEL_KEY].zh || {});
Object.assign(LABELS.en, MODEL_LABELS[MODEL_KEY].en || {});

const PART_META = {
  lilith_v5: [
    {
      key: 'Body',
      name: { zh: '身体', en: 'Body' },
      detail: { zh: '头发 · 脸 · 袜子 · 鞋', en: 'hair · face · socks · shoes' },
      color: '#d7d9e8',
    },
    {
      key: 'Top',
      name: { zh: '上衣', en: 'Top' },
      detail: { zh: '衣身 · 领子 · 丝带', en: 'bodice · collar · ribbons' },
      color: '#eceef6',
    },
    {
      key: 'Skirt',
      name: { zh: '裙子', en: 'Skirt' },
      detail: { zh: '双层裙摆', en: 'double-layer skirt' },
      color: '#262b3c',
    },
    {
      key: 'Panties',
      name: { zh: '内裤', en: 'Panties' },
      detail: { zh: '腰带 · 裤腿', en: 'waistband · leg openings' },
      color: '#c9ccda',
    },
  ],
  deepseek_v4: [
    {
      key: 'Body',
      name: { zh: '身体', en: 'Body' },
      detail: { zh: '头发 · 脸 · 皮肤 · 尾巴', en: 'hair · face · skin · tail' },
      color: '#d7d9e8',
    },
    {
      key: 'Cloth',
      name: { zh: '连衣裙', en: 'Dress' },
      detail: { zh: '衣身 · 薄纱 · 蝴蝶结 · 环', en: 'bodice · sheer · bows · rings' },
      color: '#eceef6',
    },
    {
      key: 'Panties',
      name: { zh: '内裤', en: 'Panties' },
      detail: { zh: '腰带 · 裤腿', en: 'waistband · leg openings' },
      color: '#c9ccda',
    },
  ],
};
const LOOK = lookSet(MODEL_KEY);
const PART_NODE = Object.fromEntries(LOOK.parts.map((part) => [part.key, part.node]));
const PARTS = PART_META[MODEL_KEY].map((meta) => ({ ...meta, node: PART_NODE[meta.key] }));

const ACC_NAMES = {
  hairpin: { zh: '发饰', en: 'Hairpin' },
  headband: { zh: '头带', en: 'Headband' },
  hairband: { zh: '发带', en: 'Hairband' },
  bracelets: { zh: '手环', en: 'Bracelets' },
  ribbon: { zh: '丝带', en: 'Ribbon' },
  crystal: { zh: '丝带晶体', en: 'Ribbon crystal' },
  socks: { zh: '袜子', en: 'Socks' },
  shoes: { zh: '鞋子', en: 'Shoes' },
  ornament: { zh: '饰品', en: 'Ornament' },
  bows: { zh: '衣服蝴蝶结', en: 'Dress bows' },
  armrings: { zh: '手臂环', en: 'Arm rings' },
  neckring: { zh: '脖子环', en: 'Neck ring' },
  legring: { zh: '腿环', en: 'Leg ring' },
  tail: { zh: '尾巴', en: 'Tail' },
};

const ACCESSORIES = LOOK.accessories.map((def) => ({ ...def, name: ACC_NAMES[def.id] || { zh: def.id, en: def.id } }));

const MORPH_GROUPS = [
  {
    id: 'mouth',
    name: { zh: '口型', en: 'Mouth' },
    names: ['あ', 'い', 'う', 'え', 'お', 'ん', 'あ２', 'い２', 'う２', 'え２', 'お２', '▲', 'ワ', 'ω', 'ω□'],
  },
  {
    id: 'eyes',
    name: { zh: '眼睛', en: 'Eyes' },
    names: ['まばたき', 'ウィンク', 'ウィンク右', 'ウィンク２', 'ｳｨﾝｸ２右', 'じと目', '上', '下'],
  },
  {
    id: 'emotion',
    name: { zh: '表情', en: 'Emotion' },
    names: ['笑い', 'にやり', 'にやり２', 'にっこり', '口角上げ', '口角下げ', '真面目', '困る', '怒り'],
  },
];

const MORPH_META = {
  'あ': ['口型 · あ', 'Mouth A'],
  'い': ['口型 · い', 'Mouth I'],
  'う': ['口型 · う', 'Mouth U'],
  'え': ['口型 · え', 'Mouth E'],
  'お': ['口型 · お', 'Mouth O'],
  'まばたき': ['眨眼', 'Blink'],
  '笑い': ['微笑', 'Smile'],
  'ウィンク': ['眨眼 · 左', 'Wink L'],
  'ウィンク右': ['眨眼 · 右', 'Wink R'],
  'ウィンク２': ['眨眼 2', 'Wink 2'],
  'ｳｨﾝｸ２右': ['眨眼 2 · 右', 'Wink 2 R'],
  'じと目': ['半睁眼', 'Half-lidded'],
  'ん': ['抿嘴', 'Closed mouth'],
  'あ２': ['口型 2 · あ', 'Mouth A 2'],
  'い２': ['口型 2 · い', 'Mouth I 2'],
  'う２': ['口型 2 · う', 'Mouth U 2'],
  'え２': ['口型 2 · え', 'Mouth E 2'],
  'お２': ['口型 2 · お', 'Mouth O 2'],
  '▲': ['三角嘴', 'Triangle mouth'],
  'ワ': ['张嘴 · ワ', 'Open mouth'],
  'ω': ['猫嘴', 'Cat mouth'],
  'ω□': ['猫嘴张口', 'Cat mouth open'],
  'にやり': ['坏笑', 'Grin'],
  'にやり２': ['坏笑 2', 'Grin 2'],
  'にっこり': ['灿烂笑', 'Beam'],
  '口角上げ': ['嘴角上扬', 'Corners up'],
  '口角下げ': ['嘴角下压', 'Corners down'],
  '真面目': ['认真', 'Serious'],
  '困る': ['困扰', 'Troubled'],
  '上': ['向上看', 'Look up'],
  '下': ['向下看', 'Look down'],
  '怒り': ['生气', 'Angry'],
};

const EXPR_PRESETS = [
  { id: 'neutral', name: { zh: '自然', en: 'Neutral' }, values: {} },
  { id: 'smile', name: { zh: '微笑', en: 'Smile' }, values: { '笑い': 0.9, '口角上げ': 0.35 } },
  { id: 'blink', name: { zh: '眨眼', en: 'Blink' }, values: { 'まばたき': 1 } },
  { id: 'wink', name: { zh: '眨眼', en: 'Wink' }, values: { 'ウィンク': 0.9, 'にっこり': 0.4 } },
  { id: 'angry', name: { zh: '生气', en: 'Angry' }, values: { '怒り': 0.9, 'じと目': 0.6 } },
  { id: 'trouble', name: { zh: '困扰', en: 'Troubled' }, values: { '困る': 0.9, '下': 0.35 } },
  { id: 'surprise', name: { zh: '惊讶', en: 'Surprised' }, values: { 'あ': 0.75, '上': 0.2 } },
  { id: 'serious', name: { zh: '认真', en: 'Serious' }, values: { '真面目': 0.9 } },
  { id: 'smug', name: { zh: '坏笑', en: 'Smug' }, values: { 'にやり': 0.85, 'じと目': 0.35 } },
];

const BONE_GROUPS = [
  {
    id: 'torso',
    name: { zh: '躯干', en: 'Torso' },
    bones: [
      ['腰', '腰', 'Waist'],
      ['下半身', '下半身', 'Hips'],
      ['上半身', '上半身', 'Upper body'],
      ['上半身2', '胸部', 'Chest'],
      ['首', '脖子', 'Neck'],
      ['頭', '头部', 'Head'],
      ['cf_s_spine01', '脊柱 1', 'Spine 1'],
      ['cf_s_spine02', '脊柱 2', 'Spine 2'],
      ['cf_s_spine03', '脊柱 3', 'Spine 3'],
    ],
  },
  {
    id: 'arms',
    name: { zh: '手臂', en: 'Arms' },
    bones: [
      ['左肩', '左肩', 'L shoulder'],
      ['右肩', '右肩', 'R shoulder'],
      ['左腕', '左上臂', 'L upper arm'],
      ['右腕', '右上臂', 'R upper arm'],
      ['左ひじ', '左肘', 'L elbow'],
      ['右ひじ', '右肘', 'R elbow'],
      ['左手首', '左腕', 'L wrist'],
      ['右手首', '右腕', 'R wrist'],
      ['cf_s_hand_L', '左手', 'L hand'],
      ['cf_s_hand_R', '右手', 'R hand'],
    ],
  },
  {
    id: 'legs',
    name: { zh: '腿脚', en: 'Legs' },
    bones: [
      ['左足', '左大腿', 'L thigh'],
      ['右足', '右大腿', 'R thigh'],
      ['左ひざ', '左膝', 'L knee'],
      ['右ひざ', '右膝', 'R knee'],
      ['左足首', '左踝', 'L ankle'],
      ['右足首', '右踝', 'R ankle'],
      ['左つま先', '左脚尖', 'L toe'],
      ['右つま先', '右脚尖', 'R toe'],
    ],
  },
  {
    id: 'face',
    name: { zh: '面部', en: 'Face' },
    bones: [
      ['両目', '双眼', 'Eyes'],
      ['左目', '左眼', 'L eye'],
      ['右目', '右眼', 'R eye'],
      ['cf_J_MouthMove', '嘴部', 'Mouth'],
      ['cf_J_Mayu_ty', '眉毛', 'Brows'],
      ['cf_J_LowerFace', '下颚', 'Jaw'],
    ],
  },
  {
    id: 'chest',
    name: { zh: '胸部', en: 'Chest' },
    bones: [
      ['左胸操作', '左胸控制', 'L bust control'],
      ['右胸操作', '右胸控制', 'R bust control'],
      ['左胸1', '左胸', 'L bust'],
      ['右胸1', '右胸', 'R bust'],
    ],
  },
  {
    id: 'hair',
    name: { zh: '头发', en: 'Hair' },
    bones: [
      ['前发Root', '前发根', 'Front hair root'],
      ['刘海中', '中间刘海', 'Center bangs'],
      ['侧发L', '左侧发', 'L side hair'],
      ['侧发R', '右侧发', 'R side hair'],
      ['馬尾1-0L', '左马尾根', 'L ponytail root'],
      ['馬尾1-0R', '右马尾根', 'R ponytail root'],
    ],
  },
  {
    id: 'accessory',
    name: { zh: '配饰骨骼', en: 'Accessory bones' },
    bones: [
      ['蝴蝶结RootL', '左蝴蝶结', 'L bow root'],
      ['蝴蝶结RootR', '右蝴蝶结', 'R bow root'],
      ['丝带upL', '左丝带', 'L ribbon'],
      ['丝带upR', '右丝带', 'R ribbon'],
      ['丝带downL', '左垂丝带', 'L ribbon tail'],
      ['丝带downR', '右垂丝带', 'R ribbon tail'],
    ],
  },
  {
    id: 'skirt',
    name: { zh: '裙骨', en: 'Skirt bones' },
    bones: [
      ['スカート_0_0', '裙前左', 'Skirt FL'],
      ['スカート_2_0', '裙前中', 'Skirt FC'],
      ['スカート_4_0', '裙前右', 'Skirt FR'],
      ['スカート_6_0', '裙后', 'Skirt back'],
      ['スカート_0_8', '裙中左', 'Skirt mid L'],
      ['スカート_3_8', '裙中', 'Skirt mid'],
      ['スカート_6_8', '裙中后', 'Skirt mid back'],
      ['スカート_0_15', '裙摆左', 'Skirt hem L'],
      ['スカート_3_15', '裙摆中', 'Skirt hem'],
      ['スカート_6_15', '裙摆后', 'Skirt hem back'],
    ],
  },
];

const POSE_PRESETS = [
  { id: 'rest', name: { zh: '默认站姿', en: 'Rest' }, bones: {} },
  { id: 'tilt', name: { zh: '歪头', en: 'Head tilt' }, bones: { '頭': { x: 0, y: 0, z: 9 }, '首': { x: 0, y: 0, z: 4 } } },
  { id: 'nod', name: { zh: '低头', en: 'Look down' }, bones: { '頭': { x: 12, y: 0, z: 0 }, '首': { x: 5, y: 0, z: 0 } } },
  { id: 'twist', name: { zh: '扭腰', en: 'Hip twist' }, bones: { '腰': { x: 0, y: 14, z: 0 }, '上半身': { x: 0, y: -5, z: 0 } } },
];

const PREVIEW_MODES = [
  { id: 'off', name: { zh: '关闭', en: 'Off' } },
  { id: 'idle', name: { zh: '待机', en: 'Idle' } },
  { id: 'walk', name: { zh: '行走', en: 'Walk' } },
  { id: 'run', name: { zh: '跑步', en: 'Run' } },
  { id: 'talk', name: { zh: '说话', en: 'Talk' } },
  { id: 'sleep', name: { zh: '睡觉', en: 'Sleep' } },
];

const ALIASES = new Map();
for (const group of BONE_GROUPS) {
  for (const [name, zh, en] of group.bones) ALIASES.set(name, { zh, en });
}

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const state = {
  lang: 'zh',
  ready: false,
  activeTab: 'parts',
  partVisible: Object.fromEntries(PARTS.map((part) => [part.key, true])),
  accVisible: Object.fromEntries(ACCESSORIES.map((item) => [item.id, true])),
  morphs: {},
  activePreset: null,
  selectedBone: null,
  pose: new Map(),
  boneQuery: '',
  turntable: false,
  turntableSpeed: 30,
  showSkeleton: false,
  showGround: true,
  previewMode: 'off',
  cameraView: 'threequarter',
};

const t = (key) => (LABELS[state.lang] && LABELS[state.lang][key]) || LABELS.zh[key] || key;
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_m, key) => (vars && key in vars ? vars[key] : `{${key}}`));
const tt = (obj) => (obj && (obj[state.lang] || obj.zh)) || '';

let rig = null;
let modelRoot = null;
let modelPivot = null;
let previewAnimator = null;
let previewPhase = 0;
let skeletonHelper = null;
let boneMarker = null;
let selectedBone = null;
let turntableAngle = 0;
let partNodes = {};
let nippleMeshes = [];
let accEntries = {};
let groundGroup = null;
let morphRows = new Map();
let presetButtons = new Map();
let previewButtons = new Map();
let lastStatsUpdate = 0;

// ------------------------------------------------------------------ renderer
const stage = $('stage');
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1016);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const hemi = new THREE.HemisphereLight(0xffffff, 0x6f7488, 1.05);
const keyLight = new THREE.DirectionalLight(0xfff3e9, 2.15);
keyLight.position.set(2.2, 3.4, 2.8);
const rimLight = new THREE.DirectionalLight(0x9fb7ff, 1.25);
rimLight.position.set(-2.6, 2.3, -1.8);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-1.8, 1.1, 2.2);
scene.add(hemi, keyLight, rimLight, fillLight);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.1;
controls.maxDistance = 7;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI / 2 + 0.02;
controls.target.set(0, 0.95, 0);

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0,0,0,0.58)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGround() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 96),
    new THREE.MeshBasicMaterial({ color: 0x161821, transparent: true, opacity: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.003;
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(1.06, 96),
    new THREE.MeshBasicMaterial({ color: 0x1c1f2b, transparent: true, opacity: 0.85 })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = -0.002;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.395, 1.42, 96),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0;
  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.112, 96),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
  );
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.0;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.7),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(floor, inner, ring, ring2, shadow);
  scene.add(group);
  return group;
}

groundGroup = buildGround();

function resize() {
  const w = Math.max(1, stage.clientWidth);
  const h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

function setCameraView(view, { resetYaw = true } = {}) {
  if (!camera) return;
  if (resetYaw) {
    turntableAngle = 0;
    if (modelPivot) modelPivot.rotation.y = 0;
  }
  state.cameraView = view;
  const target = new THREE.Vector3(0, 0.95, 0);
  const dist = 4.2;
  if (view === 'front') camera.position.set(0, 1.08, dist);
  else if (view === 'side') camera.position.set(dist, 1.08, 0);
  else if (view === 'back') camera.position.set(0, 1.08, -dist);
  else camera.position.set(dist * 0.58, 1.24, dist * 0.8);
  controls.target.copy(target);
  controls.update();
  updateCameraButtons();
}

function updateCameraButtons() {
  document.querySelectorAll('.cam-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.cameraView);
  });
}

// ------------------------------------------------------------------ load
function showLoading(show, text) {
  const box = $('loading');
  box.hidden = !show;
  if (text) $('loading-text').textContent = text;
}

function showFatal(error) {
  showLoading(false);
  $('fatal').hidden = false;
  $('fatal-title').textContent = t('fatalTitle');
  $('fatal-text').textContent = `${t('fatalText')}${error ? `\n${error}` : ''}`;
  $('fatal-retry').textContent = t('retry');
  $('foot-state').textContent = t('footError');
}

function hideFatal() {
  $('fatal').hidden = true;
}

async function loadModel() {
  hideFatal();
  showLoading(true, t('loading'));
  $('foot-state').textContent = t('footLoading');
  state.ready = false;

  try {
    const buffer = await window.studio.readAsset(MODEL.asset);
    const arrayBuffer = buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
    });

    if (modelPivot) {
      scene.remove(modelPivot);
      modelPivot.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
      });
    }
    if (skeletonHelper) {
      scene.remove(skeletonHelper);
      skeletonHelper = null;
    }

    modelRoot = gltf.scene;
    prepareModelMaterials(MODEL_KEY, modelRoot);
    modelPivot = new THREE.Group();
    modelPivot.add(modelRoot);
    scene.add(modelPivot);

    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = MODEL_HEIGHT / (size.y || 1);
    modelRoot.scale.setScalar(scale);
    modelRoot.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    modelRoot.updateMatrixWorld(true);

    rig = createRig(modelRoot);
    previewAnimator = createPetAnimator(rig, { model: MODEL_KEY });
    nippleMeshes = (rig.materials.get(LOOK.areola.mats[0]) || []).map((entry) => entry.mesh);

    const entries = collectLookEntries(rig, MODEL_KEY);
    partNodes = entries.partNodes;
    accEntries = entries.accEntries;

    if (skeletonHelper) scene.remove(skeletonHelper);
    skeletonHelper = new THREE.SkeletonHelper(modelRoot);
    const lineMaterial = skeletonHelper.material;
    lineMaterial.depthTest = false;
    lineMaterial.transparent = true;
    lineMaterial.opacity = 0.34;
    lineMaterial.color.setHex(0x8d82ff);
    skeletonHelper.renderOrder = 12;
    skeletonHelper.visible = state.showSkeleton;
    scene.add(skeletonHelper);

    if (!boneMarker) {
      boneMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 18, 12),
        new THREE.MeshBasicMaterial({ color: 0xff7098, depthTest: false, transparent: true, opacity: 0.95 })
      );
      boneMarker.renderOrder = 20;
      scene.add(boneMarker);
    }
    boneMarker.visible = false;

    state.pose.clear();
    state.morphs = {};
    state.activePreset = null;
    state.selectedBone = null;
    selectedBone = null;

    applyLabels();
    updateStatsStatic();
    applyVisibility();
    updatePartPill();
    updateAccessoryChips();
    updateBoneEditor();
    state.ready = true;
    showLoading(false);
    $('foot-state').textContent = t('footReady');
    setCameraView('threequarter');
    startPreview('idle');
    resize();
  } catch (error) {
    console.error('studio load failed:', error);
    showFatal(error && error.message ? error.message : String(error));
  }
}

// ------------------------------------------------------------------ visibility
function applyVisibility() {
  for (const part of PARTS) {
    const node = partNodes[part.key];
    if (node) node.visible = state.partVisible[part.key];
  }
  // The areola is a separate mesh layer on top of the clothes, so it only shows
  // when the covering part is actually off.
  for (const mesh of nippleMeshes) mesh.visible = !state.partVisible[LOOK.areola.part];
  for (const def of ACCESSORIES) {
    const partVisible = (accEntries[def.id] || []).some((entry) => !entry.part || state.partVisible[entry.part]);
    for (const entry of accEntries[def.id] || []) {
      entry.material.visible = state.accVisible[def.id] && (!entry.part || state.partVisible[entry.part]);
    }
    const button = document.querySelector(`.acc-chip[data-acc="${def.id}"]`);
    if (button) button.classList.toggle('is-muted', !partVisible);
  }
}

function applyLookState(look) {
  for (const part of PARTS) {
    state.partVisible[part.key] = !(look && look.parts && look.parts[part.key] === false);
  }
  for (const def of ACCESSORIES) {
    state.accVisible[def.id] = !(look && look.acc && look.acc[def.id] === false);
  }
}

function updatePartPill() {
  const visible = PARTS.filter((part) => state.partVisible[part.key]).length;
  $('parts-pill').textContent = fill(t('partVisibleCount'), { on: visible, all: PARTS.length });
  updateAccessoryChips();
}

function updateAccessoryChips() {
  let on = 0;
  for (const def of ACCESSORIES) {
    if (state.accVisible[def.id]) on += 1;
    const button = document.querySelector(`.acc-chip[data-acc="${def.id}"]`);
    if (!button) continue;
    button.classList.toggle('is-on', !!state.accVisible[def.id]);
    button.setAttribute('aria-pressed', String(!!state.accVisible[def.id]));
    const partVisible = (accEntries[def.id] || []).some((entry) => !entry.part || state.partVisible[entry.part]);
    button.classList.toggle('is-muted', !partVisible);
    button.title = partVisible ? '' : t('parentHidden');
  }
  $('acc-pill').textContent = `${on} / ${ACCESSORIES.length}`;
}

// ------------------------------------------------------------------ UI: parts
function renderParts() {
  const list = $('part-list');
  list.textContent = '';
  for (const part of PARTS) {
    const row = el('label', 'part-row');
    const swatch = el('span', 'part-swatch');
    swatch.style.background = part.color;
    const info = el('span', 'part-info');
    info.append(
      el('span', 'part-name', tt(part.name)),
      el('span', 'part-detail', tt(part.detail))
    );
    const switchWrap = el('span', 'switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!state.partVisible[part.key];
    input.addEventListener('change', () => {
      state.partVisible[part.key] = input.checked;
      applyVisibility();
      updatePartPill();
    });
    switchWrap.append(input, document.createElement('span'));
    row.append(swatch, info, switchWrap);
    list.append(row);
  }
}

function renderAccessories() {
  const grid = $('acc-grid');
  grid.textContent = '';
  for (const def of ACCESSORIES) {
    if (!(accEntries[def.id] || []).length) continue;
    const button = el('button', 'acc-chip');
    button.type = 'button';
    button.dataset.acc = def.id;
    button.append(el('span', 'acc-dot'), el('span', '', tt(def.name)));
    button.addEventListener('click', () => {
      state.accVisible[def.id] = !state.accVisible[def.id];
      applyVisibility();
      updateAccessoryChips();
    });
    grid.append(button);
  }
  updateAccessoryChips();
}

// ------------------------------------------------------------------ UI: expressions
function morphLabel(name) {
  const meta = MORPH_META[name];
  return meta ? meta[state.lang === 'en' ? 1 : 0] : name;
}

function renderExpressions() {
  const presetRow = $('expr-presets');
  presetRow.textContent = '';
  presetButtons = new Map();
  for (const preset of EXPR_PRESETS) {
    const button = el('button', 'preset-chip', tt(preset.name));
    button.type = 'button';
    button.dataset.preset = preset.id;
    button.addEventListener('click', () => applyExpressionPreset(preset));
    presetButtons.set(preset.id, button);
    presetRow.append(button);
  }

  const container = $('morph-groups');
  container.textContent = '';
  morphRows = new Map();
  const available = new Set(rig ? rig.morphNames : []);
  const rendered = new Set();

  const buildRows = (names) => {
    for (const name of names) {
      if (!available.has(name) || rendered.has(name)) continue;
      rendered.add(name);
      const row = el('div', 'morph-row');
      const label = el('div', 'morph-label');
      label.append(el('span', 'morph-name', morphLabel(name)));
      if (MORPH_META[name]) label.append(el('span', 'morph-original', name));
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.value = String(Math.round((state.morphs[name] || 0) * 100));
      const output = el('output', 'morph-value', `${input.value}%`);
      input.addEventListener('input', () => {
        stopPreview();
        const value = Number(input.value) / 100;
        state.morphs[name] = value;
        state.activePreset = null;
        setMorph(rig, name, value);
        output.textContent = `${input.value}%`;
        updatePresetStates();
      });
      row.append(label, input, output);
      container.append(row);
      morphRows.set(name, { input, output });
    }
  };

  for (const group of MORPH_GROUPS) {
    const names = group.names.filter((name) => available.has(name));
    if (!names.length) continue;
    container.append(el('h3', 'group-heading', tt(group.name)));
    buildRows(names);
  }
  const rest = (rig ? rig.morphNames : []).filter((name) => !rendered.has(name));
  if (rest.length) {
    container.append(el('h3', 'group-heading', t('exprOther')));
    buildRows(rest);
  }
  updatePresetStates();
}

function updatePresetStates() {
  for (const [id, button] of presetButtons) {
    button.classList.toggle('is-active', state.activePreset === id);
  }
}

function updateMorphUI() {
  for (const [name, row] of morphRows) {
    const value = Math.round((state.morphs[name] || 0) * 100);
    row.input.value = String(value);
    row.output.textContent = `${value}%`;
  }
  updatePresetStates();
}

function applyExpressionPreset(preset) {
  if (!rig) return;
  stopPreview();
  resetMorphs(rig);
  state.morphs = {};
  for (const [name, value] of Object.entries(preset.values)) {
    state.morphs[name] = value;
    setMorph(rig, name, value);
  }
  state.activePreset = preset.id;
  updateMorphUI();
}

function resetExpressions() {
  if (!rig) return;
  stopPreview();
  resetMorphs(rig);
  state.morphs = {};
  state.activePreset = null;
  updateMorphUI();
}

// ------------------------------------------------------------------ UI: bones
function boneRow(name, withGroup) {
  const alias = ALIASES.get(name);
  const row = el('button', 'bone-row');
  row.type = 'button';
  row.dataset.bone = name;
  const text = el('span', 'bone-text');
  if (alias) {
    text.append(el('span', 'bone-alias', tt(alias)));
    text.append(el('span', 'bone-name', name));
  } else {
    text.append(el('span', 'bone-alias', name));
  }
  if (withGroup) text.append(el('span', 'bone-group', withGroup));
  const dot = el('span', 'bone-dot');
  row.append(text, dot);
  row.addEventListener('click', () => selectBone(name));
  return row;
}

function renderBones() {
  const list = $('bone-list');
  list.textContent = '';
  const total = rig ? rig.bones.size : 0;
  $('bone-count').textContent = String(total);
  const query = state.boneQuery.trim().toLowerCase();
  const fragment = document.createDocumentFragment();

  if (query) {
    const results = [];
    if (rig) {
      for (const name of rig.bones.keys()) {
        const alias = ALIASES.get(name);
        const haystack = `${name} ${alias ? `${alias.zh} ${alias.en}` : ''}`.toLowerCase();
        if (haystack.includes(query)) results.push(name);
      }
    }
    results.sort((a, b) => a.localeCompare(b));
    $('bone-list-title').textContent = `${t('boneResults')} · ${results.length}`;
    if (!results.length) {
      list.append(el('p', 'empty-note', t('boneNoResult')));
    } else {
      for (const name of results) fragment.append(boneRow(name, null));
      list.append(fragment);
    }
  } else {
    $('bone-list-title').textContent = t('boneCommon');
    let count = 0;
    for (const group of BONE_GROUPS) {
      const names = group.bones.map((item) => item[0]).filter((name) => rig && rig.bones.has(name));
      if (!names.length) continue;
      fragment.append(el('h3', 'group-heading', tt(group.name)));
      for (const name of names) {
        fragment.append(boneRow(name, null));
        count += 1;
      }
    }
    list.append(fragment);
    list.append(el('p', 'bone-hint', fill(t('boneSearchAll'), { n: total })));
    $('bone-count').textContent = String(count);
  }
  updateBoneRowStates();
}

function updateBoneRowStates() {
  document.querySelectorAll('.bone-row').forEach((row) => {
    const name = row.dataset.bone;
    row.classList.toggle('is-active', name === state.selectedBone);
    const pose = state.pose.get(name);
    row.classList.toggle('is-dirty', !!pose && (pose.x || pose.y || pose.z));
  });
  const alias = state.selectedBone ? ALIASES.get(state.selectedBone) : null;
  $('bone-selected-hint').textContent = state.selectedBone ? (alias ? tt(alias) : state.selectedBone) : '';
}

function selectBone(name) {
  if (!rig || !rig.bones.has(name)) return;
  stopPreview();
  state.selectedBone = name;
  selectedBone = (rig.bones.get(name) || [])[0] || null;
  boneMarker.visible = !!selectedBone;
  updateBoneEditor();
  updateBoneRowStates();
}

function updateBoneEditor() {
  const name = state.selectedBone;
  const alias = name ? ALIASES.get(name) : null;
  $('bone-current').textContent = name ? (alias ? tt(alias) : name) : t('boneUnselected');
  $('bone-current-alias').textContent = name
    ? (alias ? `${t('boneOriginal')} · ${name}` : '')
    : t('boneSelectHint');
  const pose = name ? (state.pose.get(name) || { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
  for (const axis of ['x', 'y', 'z']) {
    const input = $(`bone-${axis}`);
    input.disabled = !name;
    input.value = String(Math.round(pose[axis] || 0));
    $(`bone-${axis}-value`).textContent = `${Math.round(pose[axis] || 0)}°`;
  }
  $('bone-reset').disabled = !name;
}

function applySelectedPose() {
  if (!selectedBone || !state.selectedBone) return;
  const pose = state.pose.get(state.selectedBone) || { x: 0, y: 0, z: 0 };
  for (const bone of rig.bones.get(state.selectedBone) || []) {
    applyBoneRotation(bone, pose.x, pose.y, pose.z);
  }
}

function setSelectedAxis(axis, value) {
  if (!state.selectedBone || !rig) return;
  stopPreview();
  let pose = state.pose.get(state.selectedBone);
  if (!pose) {
    pose = { x: 0, y: 0, z: 0 };
    state.pose.set(state.selectedBone, pose);
  }
  pose[axis] = value;
  if (!pose.x && !pose.y && !pose.z) state.pose.delete(state.selectedBone);
  applySelectedPose();
  $(`bone-${axis}-value`).textContent = `${Math.round(value)}°`;
  updateBoneRowStates();
}

function resetSelectedBone() {
  if (!state.selectedBone || !rig) return;
  state.pose.delete(state.selectedBone);
  for (const bone of rig.bones.get(state.selectedBone) || []) resetBone(bone);
  updateBoneEditor();
  updateBoneRowStates();
}

function resetBones() {
  if (!rig) return;
  stopPreview();
  resetAllBones(rig);
  state.pose.clear();
  updateBoneEditor();
  updateBoneRowStates();
}

function applyPosePreset(preset) {
  if (!rig) return;
  stopPreview();
  resetAllBones(rig);
  state.pose.clear();
  for (const [name, rotation] of Object.entries(preset.bones)) {
    if (!rig.bones.has(name)) continue;
    state.pose.set(name, { x: rotation.x || 0, y: rotation.y || 0, z: rotation.z || 0 });
  }
  for (const [name, rotation] of state.pose) {
    for (const bone of rig.bones.get(name) || []) {
      applyBoneRotation(bone, rotation.x, rotation.y, rotation.z);
    }
  }
  const first = Object.keys(preset.bones)[0];
  if (first && rig.bones.has(first)) selectBone(first);
  else {
    state.selectedBone = null;
    selectedBone = null;
    boneMarker.visible = false;
    updateBoneEditor();
    updateBoneRowStates();
  }
}

// ------------------------------------------------------------------ preview animation
function clearManualPose() {
  if (!rig) return;
  resetAllBones(rig);
  state.pose.clear();
  updateBoneEditor();
  updateBoneRowStates();
}

function clearManualMorphs() {
  if (!rig) return;
  resetMorphs(rig);
  state.morphs = {};
  state.activePreset = null;
  updateMorphUI();
}

function startPreview(mode) {
  if (!previewAnimator) return;
  if (state.previewMode === mode) return;
  if (state.previewMode !== 'off') previewAnimator.reset();
  state.previewMode = mode;
  previewPhase = 0;
  if (mode !== 'off') {
    clearManualPose();
    clearManualMorphs();
    previewAnimator.reset();
    boneMarker.visible = false;
  } else {
    previewAnimator.reset();
    boneMarker.visible = !!selectedBone;
  }
  updatePreviewUI();
}

function stopPreview() {
  if (state.previewMode === 'off') return;
  state.previewMode = 'off';
  if (previewAnimator) previewAnimator.reset();
  previewPhase = 0;
  boneMarker.visible = !!selectedBone;
  updatePreviewUI();
}

function updatePreviewUI() {
  for (const [id, button] of previewButtons) {
    button.classList.toggle('is-active', state.previewMode === id);
    button.setAttribute('aria-pressed', String(state.previewMode === id));
  }
  if (!state.ready) return;
  if (state.previewMode === 'off') {
    $('foot-state').textContent = t('footReady');
  } else {
    const mode = PREVIEW_MODES.find((item) => item.id === state.previewMode);
    $('foot-state').textContent = fill(t('footPreview'), { mode: tt(mode && mode.name) });
  }
}

let footFlashTimer = null;
function flashFoot(text) {
  $('foot-state').textContent = text;
  clearTimeout(footFlashTimer);
  footFlashTimer = setTimeout(updatePreviewUI, 2200);
}

function previewContext(dt) {
  const mode = state.previewMode;
  if (mode === 'walk') previewPhase += dt * 6.6;
  else if (mode === 'run') previewPhase += dt * 12.4;
  return {
    mode,
    motion: mode,
    walking: mode === 'walk',
    talking: mode === 'talk',
    sleeping: mode === 'sleep',
    dragging: false,
    falling: false,
    pat: 0,
    walkPhase: previewPhase,
  };
}

// ------------------------------------------------------------------ labels
function applyLabels() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = `${MODEL.brand} ${MODEL.ver} · ${state.lang === 'zh' ? '模型工坊' : 'Studio'}`;
  const brandName = document.querySelector('.brand-name');
  const brandVer = document.querySelector('.brand-ver');
  if (brandName) brandName.textContent = MODEL.brand;
  if (brandVer) brandVer.textContent = MODEL.ver;
  $('brand-sub').textContent = state.ready && rig
    ? `${PARTS.length} ${t('statParts')} · ${rig.bones.size} ${t('statBones')} · ${rig.morphNames.length} ${t('statMorphs')}`
    : t('brandSub');
  $('stage-hint').textContent = t('hint');
  $('loading-text').textContent = t('loading');
  $('loading-sub').textContent = t('loadingSub');
  $('fatal-title').textContent = t('fatalTitle');
  $('fatal-text').textContent = t('fatalText');
  $('fatal-retry').textContent = t('retry');
  $('turntable-label').textContent = t('turntable');
  $('camera-label').textContent = t('cameraReset');

  $('tab-parts').textContent = t('tabParts');
  $('tab-expressions').textContent = t('tabExpressions');
  $('tab-bones').textContent = t('tabBones');
  $('tab-view').textContent = t('tabView');
  $('parts-heading').textContent = t('partsHeading');
  $('parts-note').textContent = t('partsNote');
  $('parts-all').textContent = t('partsAll');
  $('parts-none').textContent = t('partsNone');
  $('parts-undress').textContent = t('partsUndress');
  $('acc-heading').textContent = t('accHeading');
  $('acc-note').textContent = t('accNote');
  $('acc-all').textContent = t('accAll');
  $('acc-none').textContent = t('accNone');
  $('acc-footnote').textContent = t('accFootnote');
  $('expr-heading').textContent = t('exprHeading');
  $('expr-note').textContent = t('exprNote');
  $('expr-reset').textContent = t('exprReset');
  $('bones-heading').textContent = t('bonesHeading');
  $('bones-note').textContent = t('bonesNote');
  $('bones-reset').textContent = t('bonesReset');
  $('bone-search').placeholder = t('boneSearch');
  $('bone-reset').textContent = t('boneReset');
  $('view-heading').textContent = t('viewHeading');
  $('view-note').textContent = t('viewNote');
  $('opt-turntable').textContent = t('optTurntable');
  $('opt-speed').textContent = t('optSpeed');
  $('opt-skeleton').textContent = t('optSkeleton');
  $('opt-ground').textContent = t('optGround');
  $('cam-heading').textContent = t('camHeading');
  $('cam-front').textContent = t('camFront');
  $('cam-threequarter').textContent = t('camThreeQuarter');
  $('cam-side').textContent = t('camSide');
  $('cam-back').textContent = t('camBack');
  $('preview-heading').textContent = t('previewHeading');
  $('preview-note').textContent = t('previewNote');
  $('stats-heading').textContent = t('statsHeading');
  $('stat-parts-label').textContent = t('statParts');
  $('stat-bones-label').textContent = t('statBones');
  $('stat-morphs-label').textContent = t('statMorphs');
  $('stat-materials-label').textContent = t('statMaterials');
  $('stat-tris-label').textContent = t('statTris');
  $('stat-calls-label').textContent = t('statCalls');
  $('reset-all').textContent = t('resetAll');
  $('look-apply').textContent = t('lookApply');

  renderParts();
  renderAccessories();
  renderExpressions();
  renderBones();
  renderPosePresets();
  renderPreviewButtons();
  updateBoneEditor();
  updatePartPill();
  updatePreviewUI();
  updateStatsStatic();
  updateCameraButtons();
}

function renderPosePresets() {
  const row = $('pose-presets');
  row.textContent = '';
  for (const preset of POSE_PRESETS) {
    const button = el('button', 'soft-button', tt(preset.name));
    button.type = 'button';
    button.addEventListener('click', () => applyPosePreset(preset));
    row.append(button);
  }
}

function renderPreviewButtons() {
  const grid = $('preview-grid');
  grid.textContent = '';
  previewButtons = new Map();
  for (const mode of PREVIEW_MODES) {
    const button = el('button', 'preset-chip', tt(mode.name));
    button.type = 'button';
    button.dataset.preview = mode.id;
    button.addEventListener('click', () => startPreview(mode.id));
    previewButtons.set(mode.id, button);
    grid.append(button);
  }
  updatePreviewUI();
}

function updateStatsStatic() {
  $('stat-parts').textContent = String(PARTS.length);
  $('stat-bones').textContent = String(rig ? rig.bones.size : 0);
  $('stat-morphs').textContent = String(rig ? rig.morphNames.length : 0);
  $('stat-materials').textContent = String(rig ? rig.materials.size : 0);
}

// ------------------------------------------------------------------ tabs & controls
function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.panel-page').forEach((page) => {
    page.classList.toggle('is-active', page.dataset.page === tab);
  });
}

function setTurntable(on) {
  state.turntable = !!on;
  $('turntable-btn').classList.toggle('is-on', state.turntable);
  $('turntable-btn').setAttribute('aria-pressed', String(state.turntable));
  $('opt-turntable-input').checked = state.turntable;
}

function setSkeleton(on) {
  state.showSkeleton = !!on;
  if (skeletonHelper) skeletonHelper.visible = state.showSkeleton;
  $('opt-skeleton-input').checked = state.showSkeleton;
}

function setGround(on) {
  state.showGround = !!on;
  if (groundGroup) groundGroup.visible = state.showGround;
  $('opt-ground-input').checked = state.showGround;
}

function resetAll() {
  if (!rig) return;
  stopPreview();
  resetAllBones(rig);
  resetMorphs(rig);
  state.pose.clear();
  state.morphs = {};
  state.activePreset = null;
  state.selectedBone = null;
  selectedBone = null;
  boneMarker.visible = false;
  for (const part of PARTS) state.partVisible[part.key] = true;
  for (const def of ACCESSORIES) state.accVisible[def.id] = true;
  applyVisibility();
  updatePartPill();
  updateAccessoryChips();
  updateBoneEditor();
  updateBoneRowStates();
  updateMorphUI();
  setTurntable(false);
  turntableAngle = 0;
  if (modelPivot) modelPivot.rotation.y = 0;
  setCameraView('threequarter');
}

// ------------------------------------------------------------------ events
$('tabs').addEventListener('click', (event) => {
  const button = event.target.closest('.tab');
  if (button) setTab(button.dataset.tab);
});

$('parts-all').addEventListener('click', () => {
  for (const part of PARTS) state.partVisible[part.key] = true;
  applyVisibility();
  renderParts();
  updatePartPill();
});
$('parts-none').addEventListener('click', () => {
  for (const part of PARTS) state.partVisible[part.key] = false;
  applyVisibility();
  renderParts();
  updatePartPill();
});
$('parts-undress').addEventListener('click', () => {
  for (const part of PARTS) state.partVisible[part.key] = part.key === 'Body';
  applyVisibility();
  renderParts();
  updatePartPill();
});
$('acc-all').addEventListener('click', () => {
  for (const def of ACCESSORIES) state.accVisible[def.id] = true;
  applyVisibility();
  updateAccessoryChips();
});
$('acc-none').addEventListener('click', () => {
  for (const def of ACCESSORIES) state.accVisible[def.id] = false;
  applyVisibility();
  updateAccessoryChips();
});
$('expr-reset').addEventListener('click', resetExpressions);
$('expr-presets').addEventListener('click', (event) => {
  const button = event.target.closest('.preset-chip');
  if (button) {
    const preset = EXPR_PRESETS.find((item) => item.id === button.dataset.preset);
    if (preset) applyExpressionPreset(preset);
  }
});
$('bones-reset').addEventListener('click', resetBones);
$('bone-reset').addEventListener('click', resetSelectedBone);
$('bone-search').addEventListener('input', (event) => {
  state.boneQuery = event.target.value;
  renderBones();
});
for (const axis of ['x', 'y', 'z']) {
  $(`bone-${axis}`).addEventListener('input', (event) => {
    setSelectedAxis(axis, Number(event.target.value));
  });
}
$('opt-turntable-input').addEventListener('change', (event) => setTurntable(event.target.checked));
$('turntable-btn').addEventListener('click', () => setTurntable(!state.turntable));
$('opt-speed-input').addEventListener('input', (event) => {
  state.turntableSpeed = Number(event.target.value);
  $('opt-speed-value').textContent = `${state.turntableSpeed}%`;
});
$('opt-skeleton-input').addEventListener('change', (event) => setSkeleton(event.target.checked));
$('opt-ground-input').addEventListener('change', (event) => setGround(event.target.checked));
$('cam-grid').addEventListener('click', (event) => {
  const button = event.target.closest('.cam-button');
  if (button) setCameraView(button.dataset.view);
});
$('camera-btn').addEventListener('click', () => setCameraView('threequarter'));
$('reset-all').addEventListener('click', resetAll);
$('look-apply').addEventListener('click', async () => {
  if (!window.studio.applyLook) return;
  const button = $('look-apply');
  button.disabled = true;
  try {
    const saved = await window.studio.applyLook({
      parts: { ...state.partVisible },
      acc: { ...state.accVisible },
    });
    if (saved) applyLookState(saved);
    applyVisibility();
    renderParts();
    updatePartPill();
    updateAccessoryChips();
    flashFoot(t('lookApplied'));
  } catch (error) {
    console.error('apply look failed:', error);
    flashFoot(t('lookApplyFail'));
  } finally {
    button.disabled = false;
  }
});
$('fatal-retry').addEventListener('click', loadModel);

// ------------------------------------------------------------------ loop
let lastTime = performance.now();
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state.turntable && modelPivot) {
    turntableAngle += dt * state.turntableSpeed * 0.04;
    modelPivot.rotation.y = turntableAngle;
  }

  let rootMotion = { bob: 0, drop: 0 };
  if (state.previewMode !== 'off' && previewAnimator) {
    rootMotion = previewAnimator.update(dt, previewContext(dt)) || rootMotion;
  }

  if (modelPivot) {
    // The animator reports bobs and squat drops as fractions of body height.
    const rootTarget = -(rootMotion.bob + rootMotion.drop) * MODEL_HEIGHT;
    modelPivot.position.y += (rootTarget - modelPivot.position.y) * Math.min(1, dt * 10);
  }

  if (selectedBone && boneMarker && boneMarker.visible) {
    selectedBone.getWorldPosition(boneMarker.position);
  }

  controls.update();
  renderer.render(scene, camera);

  if (now - lastStatsUpdate > 450 && state.ready) {
    lastStatsUpdate = now;
    const info = renderer.info.render;
    $('stat-tris').textContent = Number(info.triangles || 0).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US');
    $('stat-calls').textContent = String(info.calls || 0);
  }
}
renderer.setAnimationLoop(animate);

// ------------------------------------------------------------------ boot
(async () => {
  try {
    const info = await window.studio.getLang();
    if (info && info.lang) state.lang = info.lang === 'en' ? 'en' : 'zh';
  } catch {}
  try {
    if (typeof window.studio.getLook === 'function') {
      applyLookState(await window.studio.getLook());
    }
  } catch (error) {
    console.error('look load failed:', error);
  }
  applyLabels();
  setTab('parts');
  $('opt-speed-value').textContent = `${state.turntableSpeed}%`;
  await loadModel();
})();

window.studio.onLang((payload) => {
  if (!payload || !payload.lang) return;
  state.lang = payload.lang === 'en' ? 'en' : 'zh';
  applyLabels();
});
