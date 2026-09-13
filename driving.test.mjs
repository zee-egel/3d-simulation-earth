import assert from 'node:assert/strict';
import { Driving } from './src/driving.ts';
import { TrafficSimulation, VEHICLES } from './src/trafficSimulation.ts';
const sim = new TrafficSimulation({ citySize: 5, spacing: 11, offset: 22, seed: 'driving', cars: 0, people: 0, crosswalks: [] });
const driving = new Driving(sim);
for (let kind = 0; kind < VEHICLES.length; kind++) {
  assert.equal(driving.start(kind, { x: 0, z: 0 }), true);
  assert.ok(driving.onRoad(driving.car.position, driving.car.angle, kind));
}
assert.throws(() => driving.start(-1, { x: 0, z: 0 }));
driving.start(0, { x: 0, z: 0 });
const start = { ...driving.car.position };
driving.keys.add('KeyW');
for (let i = 0; i < 30; i++) driving.update(1 / 60);
assert.ok(driving.car.speed > 0);
assert.ok(Math.hypot(driving.car.position.x - start.x, driving.car.position.z - start.z) > 0.1);
driving.keys.clear(); driving.keys.add('Space');
for (let i = 0; i < 30; i++) driving.update(1 / 60);
assert.equal(driving.car.speed, 0);
driving.keys.clear(); driving.keys.add('KeyS');
for (let i = 0; i < 15; i++) driving.update(1 / 60);
assert.ok(driving.car.speed < 0, 'reverse works');
const angle = driving.car.angle;
driving.keys.add('KeyA'); driving.update(1 / 60);
assert.ok(driving.car.angle < angle, 'steering reverses direction in reverse');
driving.start(0, { x: 0, z: 0 });
driving.keys.add('KeyW'); driving.keys.add('KeyD');
for (let i = 0; i < 600; i++) {
  driving.update(1 / 60);
  assert.ok(driving.onRoad(driving.car.position, driving.car.angle, 0), 'car cannot leave the retained roads');
}
assert.equal(driving.car.speed, 0, 'road boundary stops the car');
assert.throws(() => driving.update(NaN));
driving.stop(); assert.equal(driving.car, null); assert.equal(driving.keys.size, 0);
const empty = new Driving({ junctions: [] });
assert.equal(empty.start(0, { x: 0, z: 0 }), false);
console.log('Driving checks passed: all vehicles, acceleration, brakes, reverse, steering, road boundaries, exit.');
