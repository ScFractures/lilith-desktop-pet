import * as THREE from 'three';

const EPS = 1e-8;
const point = new THREE.Vector3();
const axis = new THREE.Vector3();
const delta = new THREE.Vector3();
const closest = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const worldOrigin = new THREE.Vector3();
const worldTarget = new THREE.Vector3();
const worldQ = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();
const correction = new THREE.Quaternion();
const identity = new THREE.Quaternion();

// Model-space capsules: unaffected by window size, camera, or character yaw.
export function capsulePush(position, a, b, radius, fallback, out) {
  axis.subVectors(b, a);
  const t = THREE.MathUtils.clamp(delta.subVectors(position, a).dot(axis) / Math.max(EPS, axis.lengthSq()), 0, 1);
  closest.copy(a).addScaledVector(axis, t);
  delta.subVectors(position, closest);
  const distance = delta.length();
  if (distance >= radius) return 0;
  if (distance < EPS) delta.copy(fallback).normalize();
  else delta.multiplyScalar(1 / distance);
  out.copy(closest).addScaledVector(delta, radius);
  return radius - distance;
}

// Rotate, never translate, a joint. Bone lengths and the original skin binding
// remain intact. Corrections are bounded so a collision cannot flip a joint.
function aim(root, joint, endpoint, target, maxAngle) {
  joint.getWorldPosition(worldOrigin);
  endpoint.getWorldPosition(from).sub(worldOrigin).normalize();
  root.localToWorld(worldTarget.copy(target));
  to.copy(worldTarget).sub(worldOrigin).normalize();
  if (from.lengthSq() < EPS || to.lengthSq() < EPS) return;
  correction.setFromUnitVectors(from, to);
  const angle = identity.angleTo(correction);
  if (angle > maxAngle) correction.slerp(identity, 1 - maxAngle / angle);
  joint.getWorldQuaternion(worldQ);
  joint.parent.getWorldQuaternion(parentQ).invert();
  joint.quaternion.copy(parentQ.multiply(correction).multiply(worldQ)).normalize();
  joint.updateWorldMatrix(false, true);
}

export function createPoseSafety(rig) {
  const root = rig.root;
  const bone = name => rig.bones.get(name)?.[0];
  const position = (joint, out = new THREE.Vector3()) => root.worldToLocal(joint.getWorldPosition(out));
  root.updateMatrixWorld(true);
  const neck = bone('首');
  const hips = ['左', '右'].map(side => bone(side + '足'));
  if (!neck || hips.some(joint => !joint)) return { solve() {} };
  const stature = Math.abs(position(neck).y - position(bone('左足首') || hips[0]).y);
  const torsoRadius = stature * 0.087;
  const thighRadius = stature * 0.046;
  const handRadius = stature * 0.022;
  const fabricGap = stature * 0.012;
  const torsoA = new THREE.Vector3();
  const torsoB = new THREE.Vector3();
  const target = new THREE.Vector3();
  const fallback = new THREE.Vector3();
  const limbs = ['左', '右'].map(side => {
    const shoulder = bone(side + '腕');
    const elbow = bone(side + 'ひじ');
    const wrist = bone(side + '手首');
    return { shoulder, elbow, wrist, outward: Math.sign(position(shoulder).x) || 1 };
  }).filter(limb => limb.shoulder && limb.elbow && limb.wrist);
  const legs = ['左', '右'].map(side => ({ hip: bone(side + '足'), knee: bone(side + 'ひざ'), a: new THREE.Vector3(), b: new THREE.Vector3() }));
  // Every depth, not just the hem: a bent thigh can intersect the upper panels.
  const panels = [];
  for (const [name, joints] of rig.bones) {
    const match = /^スカート_(\d+)_(\d+)$/.exec(name);
    if (!match) continue;
    for (const joint of joints) {
      const child = joint.children.find(child => child.isBone && /^スカート_/.test(child.name));
      if (child) panels.push({ joint, child, depth: Number(match[1]), outward: position(child).clone().setY(0).normalize() });
    }
  }
  panels.sort((a, b) => a.depth - b.depth);

  function solve() {
    root.updateMatrixWorld(true);
    position(hips[0], torsoA).add(position(hips[1], point)).multiplyScalar(0.5);
    position(neck, torsoB);
    for (const leg of legs) { position(leg.hip, leg.a); position(leg.knee, leg.b); }
    // Elbow first, then wrist. Shoulder/elbow CCD keeps the hand off the torso
    // and thighs without moving the hand independently of its arm.
    for (const limb of limbs) {
      fallback.set(limb.outward, 0, 0.25).normalize();
      for (let pass = 0; pass < 3; pass++) {
        position(limb.elbow, point);
        if (capsulePush(point, torsoA, torsoB, torsoRadius + handRadius, fallback, target)) {
          aim(root, limb.shoulder, limb.elbow, target, 0.14);
        }
        position(limb.wrist, point);
        if (capsulePush(point, torsoA, torsoB, torsoRadius + handRadius, fallback, target)) {
          aim(root, limb.elbow, limb.wrist, target, 0.14);
          aim(root, limb.shoulder, limb.wrist, target, 0.07);
        }
        for (const leg of legs) {
          position(limb.wrist, point);
          if (capsulePush(point, leg.a, leg.b, thighRadius + handRadius, fallback, target)) {
            aim(root, limb.elbow, limb.wrist, target, 0.12);
            aim(root, limb.shoulder, limb.wrist, target, 0.06);
          }
        }
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const panel of panels) {
        // Include the middle of each link; endpoint-only checks miss a thigh
        // going through the centre of a long fabric segment.
        for (const leg of legs) {
          for (const fraction of [0.5, 1]) {
            position(panel.joint, from);
            position(panel.child, point).lerp(from, 1 - fraction);
            if (capsulePush(point, leg.a, leg.b, thighRadius + fabricGap, panel.outward, target)) {
              // Convert the sample displacement into an endpoint target.
              target.sub(point).multiplyScalar(1 / fraction);
              target.add(position(panel.child, point));
              aim(root, panel.joint, panel.child, target, 0.18);
            }
          }
        }
      }
    }
  }
  return { solve };
}
