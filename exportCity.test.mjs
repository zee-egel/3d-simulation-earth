import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCitySnapshot } from './src/exportCity.ts';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const scene = new THREE.Scene();
const parent = new THREE.Group();
parent.position.set(10, 2, 3);
scene.add(parent);
const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 3);
batch.position.x = 4;
batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, 0));
batch.setColorAt(0, new THREE.Color('red'));
batch.setColorAt(1, new THREE.Color('blue'));
batch.count = 2; // Unused traffic capacity must not become extra vehicles.
parent.add(batch);
const snapshot = createCitySnapshot(scene);
const meshes = [];
snapshot.traverse((object) => {
  assert.ok(!(object instanceof THREE.InstancedMesh));
  if (object instanceof THREE.Mesh) meshes.push(object);
});
assert.equal(meshes.length, 2);
assert.deepEqual(meshes.map((mesh) => mesh.getWorldPosition(new THREE.Vector3()).toArray()), [[15, 2, 3], [16, 2, 3]]);
assert.deepEqual(meshes.map((mesh) => mesh.material.color.getHexString()), ['ff0000', '0000ff']);
batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(100, 0, 0));
assert.equal(meshes[0].matrix.elements[12], 1);
assert.equal(batch.parent, parent);
assert.equal(material.color.getHexString(), 'ffffff');
// Node lacks the browser FileReader used to package GLB buffers.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend();
    });
  }
};
const glb = await new GLTFExporter().parseAsync(snapshot, { binary: true });
const header = new DataView(glb);
assert.equal(header.getUint32(0, true), 0x46546c67);
assert.equal(header.getUint32(8, true), glb.byteLength);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, header.getUint32(12, true))));
assert.equal(json.nodes.filter((node) => node.mesh !== undefined).length, 2);
assert.ok(!json.extensionsRequired?.includes('EXT_mesh_gpu_instancing'));
console.log('City export snapshot checks passed.');
