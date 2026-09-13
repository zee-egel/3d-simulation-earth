import assert from 'node:assert/strict';
import * as THREE from 'three';
import { instanceBuildings } from './src/instanceBuildings.ts';

const scene = new THREE.Scene();
const group = new THREE.Group();
group.position.set(3, 2, 1);
scene.add(group);
const boxes = [0, 2, 100].map((x) => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 3),
    new THREE.MeshStandardMaterial({ color: x === 0 ? 'red' : 'blue' }));
  box.position.x = x;
  group.add(box);
  return box;
});
scene.updateMatrixWorld(true);
const expected = boxes.map((box) => new THREE.Box3().setFromObject(box));
const existing = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1);
scene.add(existing);
instanceBuildings(scene, 55);
const batches = scene.children.filter((child) => child instanceof THREE.InstancedMesh && child !== existing);
assert.equal(batches.length, 2);
assert.equal(batches[0].count, 2);
assert.equal(batches[1].count, 1);
assert.equal(existing.parent, scene);
const matrix = new THREE.Matrix4();
const color = new THREE.Color();
let index = 0;
for (const batch of batches) {
  assert.ok(batch.boundingSphere.radius > 0);
  for (let i = 0; i < batch.count; i++, index++) {
    batch.getMatrixAt(i, matrix);
    const bounds = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix);
    assert.ok(bounds.equals(expected[index]));
    batch.getColorAt(i, color);
    assert.ok(color.equals(boxes[index].material.color));
  }
}
console.log('Building batching checks passed.');

// Differently scaled trees and ground surfaces must batch without changing bounds.
const scenery = new THREE.Scene();
const sceneryBounds = [];
for (let i = 0; i < 2; i++) {
  const scale = 1 + i * 0.01;
  const shapes = [
    new THREE.SphereGeometry(0.7 * scale, 10 * scale, 10),
    new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 1.2 * scale, 8),
    new THREE.PlaneGeometry(3 * scale, 5 * scale),
  ];
  shapes.forEach((geometry, kind) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.position.set(2 + i * 4, 2, 2 + kind * 4);
    mesh.rotation.x = kind === 2 ? -Math.PI / 2 : 0;
    scenery.add(mesh);
    sceneryBounds.push(new THREE.Box3().setFromObject(mesh));
  });
}
instanceBuildings(scenery, 55);
assert.equal(scenery.children.length, 3, 'scaled spheres, trunks, and planes share their shape batches');
for (const batch of scenery.children) {
  assert.equal(batch.count, 2);
  batch.geometry.computeBoundingBox();
  for (let i = 0; i < batch.count; i++) {
    batch.getMatrixAt(i, matrix);
    const bounds = batch.geometry.boundingBox.clone().applyMatrix4(matrix);
    assert.ok(sceneryBounds.some((expected) => bounds.min.distanceTo(expected.min) < 1e-5 && bounds.max.distanceTo(expected.max) < 1e-5), 'batch preserves world bounds');
  }
}
console.log('Tree and surface batching checks passed.');
