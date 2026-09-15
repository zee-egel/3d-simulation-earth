import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';

// Exercise the actual selection code without starting the browser renderer.
const source = readFileSync(new URL('./src/main.ts', import.meta.url), 'utf8');
const count = Number(source.match(/const activeStreetLightCount = (\d+);/)[1]);
const camera = { position: new THREE.Vector3() };
const lamps = Array.from({ length: 40 }, (_, x) => ({ x, z: 0, rotationY: 0 }));
let selections = 0;
lamps[Symbol.iterator] = function* () {
  selections++;
  yield* Array.prototype.values.call(this);
};
const lights = Array.from({ length: count }, () => new THREE.SpotLight());
const context = {
  THREE, camera, streetLightInstances: lamps,
  activeStreetLightCount: count,
  lastStreetLightCameraPosition: new THREE.Vector2(Infinity, Infinity),
  activeStreetLightSpots: lights,
  activeStreetLightTargets: lights.map(() => new THREE.Object3D()),
  sidewalkHeight: 0.2,
};
runInNewContext(source.slice(source.indexOf('function updateClosestStreetLights()'),
  source.indexOf('// Create instanced meshes for windows')), context);
const update = context.updateClosestStreetLights;
assert.ok(count > 0);
update();
assert.equal(selections, 1);
assert.equal(lights[Math.min(count, lamps.length) - 1].position.x, Math.min(count, lamps.length) - 1);
if (count > lamps.length) assert.equal(lights.at(-1).visible, false);
update();
camera.position.set(0.5, 100, 0);
update();
assert.equal(selections, 1);
camera.position.x = 1;
update();
assert.equal(selections, 2);
assert.equal(lights[0].position.x, 1);
camera.position.set(39, 100, 0);
update();
assert.equal(selections, 3);
assert.equal(lights[0].position.x, 39);
console.log('Streetlight selection checks passed.');

runInNewContext(source.slice(source.indexOf('function createStreetLightPoolMaterial()'),
  source.indexOf('const headMaterial')), context);
const poolMaterial = context.createStreetLightPoolMaterial();
const { data, width, height } = poolMaterial.map.image;
const alpha = (x, y) => data[(y * width + x) * 4 + 3];
assert.equal(alpha(0, 0), 0);
assert.ok(alpha(width / 2, height / 2) > 250);
assert.ok(alpha(width / 2, height / 2) > alpha(width / 4, height / 2));
assert.equal(poolMaterial.depthWrite, false);
assert.equal(poolMaterial.depthTest, true);

Object.assign(context, {
  timeOfDay: Math.PI / 2,
  ambientLight: new THREE.AmbientLight(),
  directionalLight: new THREE.DirectionalLight(),
  scene: new THREE.Scene(),
  headMaterial: new THREE.MeshStandardMaterial(),
  streetLightPoolMaterial: poolMaterial,
});
runInNewContext(source.slice(source.indexOf('function updateDayNightCycle('),
  source.indexOf('function createStreetLightInstances()')).replace('delta: number', 'delta'), context);
for (const [time, night] of [[Math.PI / 2, 0], [Math.PI, 0.5], [Math.PI * 1.5, 1]]) {
  context.timeOfDay = time;
  context.updateDayNightCycle(0);
  assert.ok(Math.abs(poolMaterial.opacity - night * 0.35) < 1e-10);
  assert.ok(Math.abs(context.headMaterial.emissiveIntensity - night * 2) < 1e-10);
  for (const light of lights) assert.ok(Math.abs(light.intensity - night * 500) < 1e-10);
}
poolMaterial.map.dispose();
poolMaterial.dispose();
console.log('Streetlight pool and day/night checks passed.');
