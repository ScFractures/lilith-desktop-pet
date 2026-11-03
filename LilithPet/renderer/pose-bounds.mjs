import * as THREE from 'three';

// A skinned vertex is a convex combination of its bone-transformed positions.
// Enclosing all influenced vertices per bone gives a conservative animated box
// without re-skinning every vertex on every frame. Three's cached SkinnedMesh
// boundingBox otherwise describes only the first pose.
export function createPoseBounds(root) {
  const entries = [];
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    if (!positions) return;
    if (!mesh.isSkinnedMesh) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      entries.push({ mesh, box: geometry.boundingBox.clone() });
      return;
    }
    const indices = geometry.attributes.skinIndex;
    const weights = geometry.attributes.skinWeight;
    const boxes = mesh.skeleton.bones.map(() => new THREE.Box3());
    const transforms = mesh.skeleton.boneInverses.map(inverse => new THREE.Matrix4().multiplyMatrices(inverse, mesh.bindMatrix));
    const point = new THREE.Vector3();
    const local = new THREE.Vector3();
    const lo = new THREE.Vector3();
    const hi = new THREE.Vector3();
    const morphs = geometry.morphAttributes.position || [];
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      lo.copy(point); hi.copy(point);
      // Enclose all combinations of morph weights in [0, 1], including facial
      // expressions. Avoid relying on whichever expression happened to load.
      for (const morph of morphs) {
        local.fromBufferAttribute(morph, i);
        if (!geometry.morphTargetsRelative) local.sub(point);
        lo.x += Math.min(0, local.x); hi.x += Math.max(0, local.x);
        lo.y += Math.min(0, local.y); hi.y += Math.max(0, local.y);
        lo.z += Math.min(0, local.z); hi.z += Math.max(0, local.z);
      }
      for (let j = 0; j < 4; j++) {
        if (weights.getComponent(i, j) <= 0) continue;
        const index = indices.getComponent(i, j);
        const transform = transforms[index];
        for (let c = 0; c < 8; c++) {
          local.set(c & 1 ? hi.x : lo.x, c & 2 ? hi.y : lo.y, c & 4 ? hi.z : lo.z).applyMatrix4(transform);
          boxes[index].expandByPoint(local);
        }
      }
    }
    entries.push({ mesh, boxes });
  });
  const transformed = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  return function updateBounds(target = new THREE.Box3()) {
    root.updateMatrixWorld(true);
    target.makeEmpty();
    for (const { mesh, box, boxes } of entries) {
      if (!mesh.visible) continue;
      if (box) {
        target.union(transformed.copy(box).applyMatrix4(mesh.matrixWorld));
        continue;
      }
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].isEmpty()) continue;
        matrix.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(mesh.skeleton.bones[i].matrixWorld);
        target.union(transformed.copy(boxes[i]).applyMatrix4(matrix));
      }
    }
    return target;
  };
}

// Fit the projected pose inside the transparent viewport. Ordinary poses keep
// the original framing; only overflowing poses zoom out/shift, then ease back.
export function fitPoseCamera(camera, box, width, height, dt, previousZoom = 1, margin = 10) {
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    bottom = Math.min(bottom, p.y); top = Math.max(top, p.y);
  }
  if (![left, right, bottom, top].every(Number.isFinite)) return 1;
  const limitX = Math.max(0.1, 1 - 2 * margin / width);
  const limitY = Math.max(0.1, 1 - 2 * margin / height);
  const targetZoom = Math.min(1, 2 * limitX / Math.max(0.001, right - left), 2 * limitY / Math.max(0.001, top - bottom));
  const zoom = Math.min(targetZoom, previousZoom + (targetZoom - previousZoom) * Math.min(1, dt * 5));
  const shiftX = Math.max(-limitX - left * zoom, Math.min(0, limitX - right * zoom));
  const shiftY = Math.max(-limitY - bottom * zoom, Math.min(0, limitY - top * zoom));
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] -= shiftX;
  camera.projectionMatrix.elements[9] -= shiftY;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return zoom;
}
