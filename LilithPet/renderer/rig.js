import * as THREE from 'three';

const DEG = Math.PI / 180;
const boneData = new WeakMap();

const _qx = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _twistQ = new THREE.Quaternion();
const _twistAxis = new THREE.Vector3(0, 1, 0);
const _parentQ = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _rootInv = new THREE.Quaternion();

export function createRig(root) {
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_rootQ);
  _rootInv.copy(_rootQ).invert();

  const bones = new Map();
  const morphMeshes = [];
  const materials = new Map();

  root.traverse((object) => {
    if (object.isBone) {
      const list = bones.get(object.name);
      if (list) list.push(object);
      else bones.set(object.name, [object]);
    }
    if (object.isMesh) {
      if (object.morphTargetDictionary) morphMeshes.push(object);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!material || !material.name) continue;
        if (!materials.has(material.name)) materials.set(material.name, []);
        materials.get(material.name).push({ mesh: object, material });
      }
    }
  });

  for (const list of bones.values()) {
    for (const bone of list) {
      const parent = bone.parent;
      if (parent && parent !== root) {
        parent.getWorldQuaternion(_parentQ);
        _parentQ.premultiply(_rootInv);
      } else {
        _parentQ.copy(_rootQ).premultiply(_rootInv);
      }
      const inverse = _parentQ.clone().invert();
      boneData.set(bone, {
        restQ: bone.quaternion.clone(),
        restPos: bone.position.clone(),
        axes: {
          x: new THREE.Vector3(1, 0, 0).applyQuaternion(inverse).normalize(),
          y: new THREE.Vector3(0, 1, 0).applyQuaternion(inverse).normalize(),
          z: new THREE.Vector3(0, 0, 1).applyQuaternion(inverse).normalize(),
        },
      });
    }
  }

  for (const [joint, targets] of MIRRORED_JOINTS) {
    const bonesOfJoint = bones.get(joint) || [];
    const mirrored = targets.flatMap((name) => bones.get(name) || []);
    if (!bonesOfJoint.length || !mirrored.length) continue;
    for (const bone of bonesOfJoint) mirrorMap.set(bone, mirrored);
  }

  const morphNames = new Set();
  for (const mesh of morphMeshes) {
    for (const name of Object.keys(mesh.morphTargetDictionary || {})) morphNames.add(name);
  }

  return {
    root,
    bones,
    morphMeshes,
    materials,
    morphNames: [...morphNames],
    hasSkeleton: bones.size > 0,
  };
}

// The visible leg skin is partly bound to a parallel "D" chain that is
// parented under the FK hip (左足 → 左足D → 左ひざD → 左足首D, plus 左足D001).
// The D hip inherits the FK hip rotation automatically, but the D knee and
// ankle are deeper in that side chain, so they must be driven with the same
// angles as their FK counterparts or the foot tears away into rubber bands.
const MIRRORED_JOINTS = new Map([
  ['左ひざ', ['左ひざD', '左ひざD001']],
  ['右ひざ', ['右ひざD', '右ひざD001']],
  ['左足首', ['左足首D', '左足首D001']],
  ['右足首', ['右足首D', '右足首D001']],
]);

export const LOOK_SETS = {
  lilith_v5: {
    parts: [
      { key: 'Body', node: 'Lilith_Body' },
      { key: 'Top', node: 'Lilith_Top' },
      { key: 'Skirt', node: 'Lilith_Skirt' },
      { key: 'Panties', node: 'Lilith_Panties' },
    ],
    accessories: [
      { id: 'hairpin', mats: ['M05_发饰'] },
      { id: 'headband', mats: ['M06_头带'] },
      { id: 'bracelets', mats: ['M03_手环左', 'M04_手环右'] },
      { id: 'ribbon', mats: ['M27_丝带'] },
      { id: 'crystal', mats: ['M26_丝带晶体'] },
      { id: 'socks', mats: ['M21_袜R', 'M22_袜L'] },
      { id: 'shoes', mats: ['M23_鞋子白', 'M24_鞋子金属', 'M25_鞋子黑'] },
    ],
    areola: { mats: ['M29_乳头'], part: 'Top' },
  },
  deepseek_v4: {
    parts: [
      { key: 'Body', node: 'DeepSeek_Body' },
      { key: 'Cloth', node: 'DeepSeek_Cloth' },
      { key: 'Panties', node: 'DeepSeek_Panties' },
    ],
    accessories: [
      { id: 'ornament', mats: ['M14_饰品'] },
      { id: 'bows', mats: ['M18_衣服蝴蝶结', 'M23_衣服蝴蝶结*1'] },
      { id: 'armrings', mats: ['M19_手臂环_透', 'M20_手臂环'] },
      { id: 'neckring', mats: ['M21_脖子环'] },
      { id: 'legring', mats: ['M22_腿环'] },
      { id: 'tail', mats: ['M24_尾巴'] },
    ],
    // The areola is painted into the body atlas, so there is no separate layer
    // to hide while dressed.
    areola: { mats: [], part: 'Cloth' },
  },
};

export function lookSet(model) {
  return LOOK_SETS[model] || LOOK_SETS.lilith_v5;
}

// Some FBX exports mark every material as alpha-blended, including opaque skin,
// teeth and eye whites. Without depth writes the mouth interior shows through
// the face and layers sort incorrectly. Materials whose texture alpha is binary
// are rendered as cutouts; fully opaque textures are rendered opaque. Only
// genuinely sheer overlays stay blended.
const MATERIAL_FIXES = {
  deepseek_v4: {
    opaque: new Set([
      'M00_脸', 'M03_齿', 'M07_眼白左', 'M08_眼白右', 'M11_舌',
      'M12_体', 'M13_发', 'M14_饰品', 'M15_内裤', 'M16_衣服',
      'M18_衣服蝴蝶结', 'M20_手臂环', 'M21_脖子环', 'M22_腿环',
      'M23_衣服蝴蝶结*1', 'M24_尾巴',
    ]),
    cutout: new Set([
      'M01_眉', 'M02_鼻', 'M04_眼线_up', 'M05_眼线_kage',
      'M06_眼线_down', 'M09_左眼', 'M10_右眼',
    ]),
  },
};

export function prepareModelMaterials(model, root) {
  const fix = MATERIAL_FIXES[model];
  if (!fix) return;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || !material.name) continue;
      if (fix.opaque.has(material.name)) {
        material.transparent = false;
        material.depthWrite = true;
        material.alphaTest = 0;
        material.needsUpdate = true;
      } else if (fix.cutout.has(material.name)) {
        material.transparent = false;
        material.alphaTest = 0.5;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    }
  });
}

function lookPartForMesh(mesh, parts) {
  let node = mesh;
  while (node) {
    for (const part of parts) {
      if (node.name === part.node) return part.key;
    }
    node = node.parent;
  }
  return null;
}

export function collectLookEntries(rig, model) {
  const set = lookSet(model);
  const partNodes = {};
  for (const part of set.parts) partNodes[part.key] = rig.root.getObjectByName(part.node) || null;
  const accEntries = {};
  for (const def of set.accessories) {
    const entries = [];
    for (const name of def.mats) {
      for (const entry of rig.materials.get(name) || []) {
        entries.push({ ...entry, part: lookPartForMesh(entry.mesh, set.parts) });
      }
    }
    accEntries[def.id] = entries;
  }
  return { partNodes, accEntries };
}

const mirrorMap = new WeakMap();

function applyRotation(bone, xDeg, yDeg, zDeg) {
  const data = boneData.get(bone);
  if (!data) return;
  _qx.setFromAxisAngle(data.axes.x, xDeg * DEG);
  _qy.setFromAxisAngle(data.axes.y, yDeg * DEG);
  _qz.setFromAxisAngle(data.axes.z, zDeg * DEG);
  _q.copy(_qz).multiply(_qy).multiply(_qx);
  bone.quaternion.copy(_q).multiply(data.restQ);
}

export function applyBoneRotation(bone, xDeg = 0, yDeg = 0, zDeg = 0) {
  applyRotation(bone, xDeg, yDeg, zDeg);
  for (const mirror of mirrorMap.get(bone) || []) applyRotation(mirror, xDeg, yDeg, zDeg);
}

export function applyBoneTwist(bone, deg = 0) {
  if (!bone || !boneData.has(bone)) return;
  _twistQ.setFromAxisAngle(_twistAxis, deg * DEG);
  bone.quaternion.multiply(_twistQ);
}

export function resetBone(bone) {
  const data = boneData.get(bone);
  if (!data) return;
  bone.quaternion.copy(data.restQ);
  bone.position.copy(data.restPos);
  for (const mirror of mirrorMap.get(bone) || []) {
    const mirrorData = boneData.get(mirror);
    if (!mirrorData) continue;
    mirror.quaternion.copy(mirrorData.restQ);
    mirror.position.copy(mirrorData.restPos);
  }
}

export function resetAllBones(rig) {
  for (const list of rig.bones.values()) {
    for (const bone of list) resetBone(bone);
  }
}

export function setMorph(rig, name, value) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  for (const mesh of rig.morphMeshes) {
    const index = mesh.morphTargetDictionary[name];
    if (index === undefined) continue;
    mesh.morphTargetInfluences[index] = v;
  }
}

export function resetMorphs(rig) {
  for (const mesh of rig.morphMeshes) {
    const influences = mesh.morphTargetInfluences;
    if (!influences) continue;
    influences.fill(0);
  }
}

export function boneAlias(rig, name) {
  const list = rig.bones.get(name);
  return list && list.length ? list : null;
}
