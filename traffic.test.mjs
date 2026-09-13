import assert from 'node:assert/strict';
import { SignalController, TrafficSimulation, STEP, TIMING, GAP, STOP_LINE, lanePoint } from './src/trafficSimulation.ts';

const demand = (...directions) => Array.from({ length: 5 }, (_, d) => directions.includes(d));
const tick = (controller, seconds, calls, occupied = false) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) controller.update(STEP, calls, occupied);
};
const signal = new SignalController();
tick(signal, 3, demand(1));
assert.equal(signal.vehicle(0), 'green', 'minimum green is protected');
tick(signal, 1.1, demand(1));
assert.equal(signal.stage, 'amber');
tick(signal, TIMING.amber + 0.1, demand(1));
assert.equal(signal.stage, 'clearance');
tick(signal, 10, demand(1), true);
assert.equal(signal.stage, 'clearance', 'occupied junction prevents conflicting green');
tick(signal, STEP, demand(1));
assert.equal(signal.vehicle(1), 'green');
const idle = new SignalController();
tick(idle, 60, demand());
assert.equal(idle.vehicle(0), 'green', 'idle controller rests in green');
const busy = new SignalController();
const served = new Set();
for (let i = 0; i < 180 / STEP; i++) {
  busy.update(STEP, demand(0, 1, 2, 3, 4), false);
  if (busy.stage === 'green' || busy.stage === 'walk') served.add(busy.phase);
  assert.ok([0, 1, 2, 3].filter((d) => busy.vehicle(d) === 'green').length <= 1);
  if (busy.pedestrian !== 'red') assert.ok([0, 1, 2, 3].every((d) => busy.vehicle(d) === 'red'));
}
assert.equal(served.size, 5, 'continuous demand cannot starve an approach or pedestrian call');

const config = { citySize: 8, spacing: 11, offset: 38.5, seed: 'traffic-check', cars: 60, people: 70,
  crosswalks: Array.from({ length: 49 }, (_, id) => ({ x: Math.floor(id / 7) * 11 - 33, z: id % 7 * 11 - 35.7, horizontal: true })) };
const sim = new TrafficSimulation(config);
const repeat = new TrafficSimulation(config);
let walkFrames = 0, movingFrames = 0, amberFrames = 0;
for (let frame = 0; frame < 9000; frame++) {
  sim.step();
  if (frame < 300) repeat.step();
  if (frame === 299) assert.deepEqual(sim.cars, repeat.cars, 'same seed and ticks are deterministic');
  const lanes = new Map();
  for (const car of sim.cars) {
    assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.position.z));
    assert.ok(car.speed >= 0);
    if (car.speed > 0.1) movingFrames++;
    if (car.crossing) {
      assert.equal(sim.junctions[car.to].occupant, car.id);
    } else {
      const key = `${car.from}:${car.to}`;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(car);
      assert.ok(car.s <= config.spacing - STOP_LINE - car.length / 2 + 1e-6, 'front stays behind stop line before admission');
    }
  }
  for (const cars of lanes.values()) {
    cars.sort((a, b) => b.s - a.s);
    for (let i = 1; i < cars.length; i++) assert.ok(cars[i - 1].s - cars[i].s >= (cars[i - 1].length + cars[i].length) / 2 + GAP - 1e-6, 'following vehicles keep their gap');
  }
  for (const person of sim.people) if (person.state === 'cross') {
    walkFrames++;
    const junction = sim.junctions[sim.crossings[person.crossing].junction];
    assert.equal(junction.occupant, null, 'no vehicles enter an occupied pedestrian conflict');
    if (junction.signal) assert.ok([0, 1, 2, 3].every((d) => junction.signal.vehicle(d) === 'red'), 'pedestrians keep conflicting signals red until clear');
  }
  amberFrames += sim.junctions.filter((j) => j.signal?.stage === 'amber').length;
}
assert.ok(sim.completedTrips > 100, `traffic must make progress, got ${sim.completedTrips}`);
assert.ok(walkFrames > 100 && movingFrames > 100 && amberFrames > 100);

// A blocked receiving lane keeps a car out, even with a green signal.
const blocked = new TrafficSimulation({ ...config, cars: 0, people: 0 });
blocked.setCounts(2, 0);
const [car, ahead] = blocked.cars;
const j = blocked.junctions[car.to];
car.nextDirection = j.neighbors.findIndex((id, d) => id >= 0 && d !== (car.direction + 2) % 4);
ahead.from = car.to; ahead.to = j.neighbors[car.nextDirection]; ahead.s = STOP_LINE + ahead.length / 2;
assert.equal(blocked.exitAvailable(car), false);
assert.throws(() => sim.setCounts(-1, 5));
assert.throws(() => sim.step(1));
assert.deepEqual(lanePoint({ x: 0, z: 0 }, 0, 3), { x: 3, z: 0.72 });
console.log(`Traffic checks passed: ${sim.completedTrips} junction passages over 300 simulated seconds.`);

function approach(signalState, remaining, speed) {
  const world = new TrafficSimulation({ ...config, cars: 1, people: 0 });
  const car = world.cars[0];
  car.from = 10; car.to = 17; car.direction = 0; car.nextDirection = 0;
  car.s = config.spacing - STOP_LINE - car.length / 2 - remaining;
  car.position = lanePoint(world.junctions[car.from], 0, car.s);
  car.speed = speed;
  const controller = world.junctions[17].signal = new SignalController(signalState === 'red' ? 1 : 0);
  if (signalState === 'amber') controller.stage = 'amber';
  return { world, car, controller };
}
const red = approach('red', 0, 0);
red.world.step();
assert.equal(red.car.crossing, false, 'red prohibits entry');
const amberStop = approach('amber', 1, 1);
for (let i = 0; i < 60; i++) amberStop.world.step();
assert.equal(amberStop.car.crossing, false, 'a car able to stop at amber does not change its mind');
const amberGo = approach('amber', 0.05, 1);
for (let i = 0; i < 5; i++) amberGo.world.step();
assert.equal(amberGo.car.crossing, true, 'a committed amber vehicle clears the junction');
const zebra = approach('green', 0, 0);
zebra.world.junctions[17].signal = null;
const crossingId = zebra.world.junctions[17].crossings[0];
zebra.world.people.push({ id: 0, crossing: crossingId, side: -1, state: 'wait', distance: 0, speed: 0.4,
  height: 0.6, color: 0, walkTime: 0, offset: 0, position: { x: 0, z: 0 }, previous: { x: 0, z: 0 }, angle: 0, previousAngle: 0 });
zebra.world.step();
assert.equal(zebra.car.crossing, false, 'a waiting zebra pedestrian takes priority over a car');
assert.equal(zebra.world.people[0].state, 'cross');
console.log('Red, amber commitment, and zebra priority checks passed.');
