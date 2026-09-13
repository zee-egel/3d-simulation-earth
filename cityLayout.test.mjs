import assert from 'node:assert/strict';
import { createCityLayout } from './src/cityLayout.ts';
import { warpPoint, unwarpPoint } from './src/cityWarp.ts';
import { TrafficSimulation } from './src/trafficSimulation.ts';

const config = { citySize: 30, spacing: 11, offset: 159.5, seed: 'Alphen aan den Rijn' };
for (const seed of [config.seed, 'Canal town', 'Garden city']) {
  const layout = createCityLayout(30, 11, 159.5, seed);
  assert.deepEqual(layout.nodes, createCityLayout(30, 11, 159.5, seed).nodes);
  assert.equal(layout.features.filter((f) => f.kind === 'lake').length, 2);
  assert.equal(layout.features.filter((f) => f.kind === 'park').length, 3);
  const active = layout.nodes.map((node, id) => node.neighbors.some((to) => to >= 0) ? id : -1).filter((id) => id >= 0);
  assert.ok(active.length > 100, 'city has a usable road network');
  const visited = new Set([active[0]]), queue = [active[0]];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], node = layout.nodes[id];
    assert.ok(node.neighbors.filter((to) => to >= 0).length >= 2, 'no traffic dead ends');
    node.neighbors.forEach((to, direction) => {
      if (to < 0) return;
      const other = layout.nodes[to];
      assert.equal(other.neighbors[(direction + 2) % 4], id, 'two-way roads are reciprocal');
      for (let t = 0; t <= 1; t += 0.05) assert.equal(layout.reserved(node.x + (other.x - node.x) * t, node.z + (other.z - node.z) * t, 4), false, 'road corridor avoids lakes and large parks');
      if (!visited.has(to)) { visited.add(to); queue.push(to); }
    });
  }
  assert.equal(visited.size, active.length, 'all roads remain connected');
  const districts = new Set(layout.nodes.map((p) => layout.districtAt(p.x, p.z)));
  assert.equal(districts.size, 3);
  for (const center of layout.centers) assert.equal(layout.districtAt(center.x, center.z), 'downtown', 'multiple density centers');
}
for (let x = -180; x <= 180; x += 15) for (let z = -180; z <= 180; z += 15) {
  const roundTrip = unwarpPoint(warpPoint({ x, z }));
  assert.ok(Math.hypot(roundTrip.x - x, roundTrip.z - z) < 1e-6, 'lighting and camera conversion matches rendered streets');
}
const layout = createCityLayout(30, 11, 159.5, config.seed);
const crosswalks = layout.nodes.filter((n) => n.neighbors.filter((to) => to >= 0).length >= 3).map((n) => {
  const d = n.neighbors.findIndex((to) => to >= 0);
  return { x: n.x + [2.7, 0, -2.7, 0][d], z: n.z + [0, 2.7, 0, -2.7][d], horizontal: d % 2 === 1 };
});
const sim = new TrafficSimulation({ ...config, roadNodes: layout.nodes, crosswalks, cars: 90, people: 160 });
for (let frame = 0; frame < 9000; frame++) {
  sim.step();
  for (const car of sim.cars) {
    assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.position.z));
    assert.equal(layout.nodes[car.from].neighbors[car.direction], car.to, 'cars only use rendered road connections');
    assert.equal(layout.reserved(car.position.x, car.position.z), false, 'cars never enter lakes or park interiors');
  }
  for (const person of sim.people) assert.equal(layout.reserved(person.position.x, person.position.z), false, 'pedestrians stay outside water and reserved interiors');
}
assert.ok(sim.completedTrips > 100, `traffic continues on irregular streets (${sim.completedTrips})`);
console.log(`Layout checks passed: ${sim.completedTrips} junction passages on the new connected street network.`);
