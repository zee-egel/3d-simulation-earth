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
  THREE, camera, streetLightInstances: lamps, warpPoint: (p) => p, unwarpPoint: (p) => p,
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
