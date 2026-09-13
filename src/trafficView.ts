import * as THREE from 'three';
import { DIRECTIONS, LANE_OFFSET, STEP, STOP_LINE, TrafficSimulation, VEHICLES, lanePoint } from './trafficSimulation.ts';
import type { TrafficConfig, Point } from './trafficSimulation.ts';

const PALETTE = [0xe65e43, 0x57b8b2, 0x4a83cb, 0xf1bd4b, 0xe8e5de, 0x7757a0, 0x8fab57, 0x374451];
const geometry = new THREE.BoxGeometry(1, 1, 1);
const transform = new THREE.Object3D();
const color = new THREE.Color();
function batch(scene: THREE.Scene, count: number, lit = false) {
  const material = lit ? new THREE.MeshLambertMaterial() : new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
function box(mesh: THREE.InstancedMesh, index: number, p: Point, angle: number,
  x: number, y: number, z: number, width: number, height: number, depth: number, tint: number, tilt = 0) {
  transform.position.set(p.x + x * Math.cos(angle) + z * Math.sin(angle), y,
    p.z - x * Math.sin(angle) + z * Math.cos(angle));
  transform.rotation.set(tilt, angle, 0, 'YXZ');
  transform.scale.set(width, height, depth);
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
  color.setHex(tint); mesh.setColorAt(index, color);
}
function commit(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
function interpolate(previous: Point, current: Point, alpha: number): Point {
  return { x: previous.x + (current.x - previous.x) * alpha, z: previous.z + (current.z - previous.z) * alpha };
}
function interpolateAngle(previous: number, current: number, alpha: number) {
  return previous + Math.atan2(Math.sin(current - previous), Math.cos(current - previous)) * alpha;
}

export function createTraffic(scene: THREE.Scene, config: TrafficConfig, visit: (point: Point) => void) {
  const simulation = new TrafficSimulation(config);
  const cars = batch(scene, 300 * 24, true);
  const people = batch(scene, 400 * 7, true);
  const carLights = batch(scene, 300 * 4);
  const signals = batch(scene, simulation.junctions.length * 4 * 3 + simulation.crossings.length * 4);
  const furniture = batch(scene, simulation.junctions.length * 4 * 7 + simulation.crossings.length * 12);
  let furnitureIndex = 0;
  for (const j of simulation.junctions) {
    for (let d = 0; d < 4; d++) {
      if (j.neighbors[(d + 2) % 4] < 0) continue;
      const position = lanePoint(j, d, -STOP_LINE);
      const angle = Math.atan2(DIRECTIONS[d].x, DIRECTIONS[d].z);
      if (!j.signal) continue;
      // White stop lines sit ahead of the car bumper and behind the zebra crossing.
      box(furniture, furnitureIndex++, position, angle, 0, 0.12, 0, 1.2, 0.018, 0.09, 0xffffff);
      const side = LANE_OFFSET - 1.95;
      box(furniture, furnitureIndex++, position, angle, side, 1.0, 0, 0.075, 1.8, 0.075, 0xeeeeec);
      for (const y of [0.5, 0.9, 1.3]) box(furniture, furnitureIndex++, position, angle, side, y, 0, 0.08, 0.16, 0.08, 0x232629);
      box(furniture, furnitureIndex++, position, angle, side, 1.87, 0, 0.26, 0.65, 0.18, 0x151a1f);
    }
  }
  for (const crossing of simulation.crossings) {
    for (const side of [-1, 1]) {
      const pedAngle = crossing.horizontal ? -side * Math.PI / 2 : side < 0 ? 0 : Math.PI;
      const p = crossing.horizontal ? { x: crossing.x + side * 1.95, z: crossing.z + 0.25 } :
        { x: crossing.x + 0.25, z: crossing.z + side * 1.95 };
      box(furniture, furnitureIndex++, p, pedAngle, 0, 0.85, 0, 0.06, 1.3, 0.06, 0xeeeeee);
      if (simulation.junctions[crossing.junction].signal) {
        box(furniture, furnitureIndex++, p, pedAngle, 0, 1.45, 0, 0.22, 0.40, 0.16, 0x151a1f);
        box(furniture, furnitureIndex++, p, pedAngle, 0, 0.9, 0, 0.10, 0.14, 0.12, 0xffc52e);
      } else {
        box(furniture, furnitureIndex++, p, pedAngle, 0, 1.45, 0, 0.34, 0.34, 0.05, 0x2469bc);
        box(furniture, furnitureIndex++, p, pedAngle, 0, 1.45, -0.03, 0.2, 0.22, 0.01, 0xffffff);
      }
    }
  }
  commit(furniture, furnitureIndex);
  furniture.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  let signalIndex = 0;
  const bulbs: { index: number; junction: number; direction: number; aspect: number; tint: number; last: boolean }[] = [];
  for (const j of simulation.junctions) {
    if (!j.signal) continue;
    for (let d = 0; d < 4; d++) {
      if (j.neighbors[(d + 2) % 4] < 0) continue;
      const p = lanePoint(j, d, -STOP_LINE), angle = Math.atan2(DIRECTIONS[d].x, DIRECTIONS[d].z);

      for (const [level, tint] of [[0, 0xff4038], [1, 0xffc43c], [2, 0x43f597]] as const) {
        bulbs.push({ index: signalIndex, junction: j.id, direction: d, aspect: level, tint, last: false });
        box(signals, signalIndex++, p, angle, LANE_OFFSET - 1.95, 2.06 - level * 0.19, -0.101, 0.15, 0.15, 0.025, 0x293239);
      }
    }
  }
  for (const c of simulation.crossings) {
    const signal = simulation.junctions[c.junction].signal;
    if (!signal) continue;

    for (const side of [-1, 1]) {
      const pedAngle = c.horizontal ? -side * Math.PI / 2 : side < 0 ? 0 : Math.PI;
      const p = c.horizontal ? { x: c.x + side * 1.95, z: c.z + 0.25 } : { x: c.x + 0.25, z: c.z + side * 1.95 };
      bulbs.push({ index: signalIndex, junction: c.junction, direction: 4, aspect: 0, tint: 0xff4038, last: false });
      box(signals, signalIndex++, p, pedAngle, 0, 1.55, -0.09, 0.12, 0.12, 0.025, 0x293239);
      bulbs.push({ index: signalIndex, junction: c.junction, direction: 4, aspect: 2, tint: 0x43f597, last: false });
      box(signals, signalIndex++, p, pedAngle, 0, 1.37, -0.09, 0.12, 0.12, 0.025, 0x293239);
    }
  }
  commit(signals, signalIndex);
  signals.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const panel = document.createElement('details');
  panel.open = true;
  panel.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:1001;background:#101923ed;color:#eef3f7;padding:12px;border:1px solid #ffffff26;border-radius:10px;font:13px/1.5 system-ui;max-width:280px';
  panel.innerHTML = `<summary style="cursor:pointer;font-weight:650">City life · Dutch traffic</summary>
    <label style="display:block">Cars <output id="car-count">${simulation.cars.length}</output><input aria-label="Car count" id="cars" type="range" min="0" max="300" step="10" value="${simulation.cars.length}" style="display:block;width:240px"></label>
    <label style="display:block">People <output id="people-count">${simulation.people.length}</output><input aria-label="Pedestrian count" id="people" type="range" min="0" max="400" step="20" value="${simulation.people.length}" style="display:block;width:240px"></label>
    <button type="button" id="pause">Pause traffic</button> <button type="button" id="visit">Visit a crossing</button>
    <div id="traffic-status" style="margin-top:6px;color:#b9c6d4"></div>`;
  document.body.appendChild(panel);
  // Keep keyboard navigation of the controls from steering the camera.
  panel.addEventListener('keydown', (event) => event.stopPropagation());
  const carInput = panel.querySelector<HTMLInputElement>('#cars')!;
  const peopleInput = panel.querySelector<HTMLInputElement>('#people')!;
  for (const input of [carInput, peopleInput]) {
    input.addEventListener('input', () => {
      panel.querySelector('#car-count')!.textContent = carInput.value;
      panel.querySelector('#people-count')!.textContent = peopleInput.value;
    });
    input.addEventListener('change', () => simulation.setCounts(Number(carInput.value), Number(peopleInput.value)));
  }
  let paused = false;
  panel.querySelector('#pause')!.addEventListener('click', () => {
    paused = !paused; panel.querySelector('#pause')!.textContent = paused ? 'Resume traffic' : 'Pause traffic';
  });
  let visitIndex = 0;
  const destinations = simulation.crossings.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  panel.querySelector('#visit')!.addEventListener('click', () => {
    const c = destinations[visitIndex++ % destinations.length];
    if (!c) return;
    visit(c);
  });
  const view = { personId: null as number | null, alpha: 1 };
  let accumulator = 0, statusTime = 0;
  function update(delta: number) {
    if (!paused) accumulator += Math.min(delta, 0.2);
    while (accumulator >= STEP) { simulation.step(); accumulator -= STEP; }
    const alpha = paused ? 1 : accumulator / STEP;
    view.alpha = alpha;
    let index = 0, lightIndex = 0;
    for (const car of simulation.cars) {
      const p = interpolate(car.previous, car.position, alpha);
      const angle = interpolateAngle(car.previousAngle, car.angle, alpha);
      const v = VEHICLES[car.kind];
      const tint = car.kind === 4 ? 0xf7c844 : car.kind === 5 ? 0x45bac8 : PALETTE[car.color];
      const h = v.height, l = v.length, w = v.width;
      box(cars, index++, p, angle, 0, 0.28, 0, w, 0.24, l, tint);
      const cabinLength = car.kind >= 3 && car.kind !== 4 ? l * 0.83 : l * 0.55;
      box(cars, index++, p, angle, 0, 0.37 + h / 2, -l * 0.05, w * 0.88, h, cabinLength, tint);
      box(cars, index++, p, angle, 0, 0.40 + h / 2, cabinLength / 2 - l * 0.05 + 0.01, w * 0.77, h * 0.63, 0.025, 0x214052);
      box(cars, index++, p, angle, 0, 0.40 + h / 2, -cabinLength / 2 - l * 0.05 - 0.01, w * 0.77, h * 0.63, 0.025, 0x214052);
      for (const side of [-1, 1]) {
        box(cars, index++, p, angle, side * w * 0.45, 0.40 + h / 2, 0, 0.02, h * 0.60, cabinLength * 0.76, 0x214052);
        for (const axle of [-1, 1]) box(cars, index++, p, angle, side * w / 2, 0.23, axle * l * 0.31, 0.10, 0.24, 0.25, 0x172029);
        box(carLights, lightIndex++, p, angle, side * w * 0.31, 0.33, l / 2 + 0.012, 0.16, 0.085, 0.025, 0xfff5cb);
        box(carLights, lightIndex++, p, angle, side * w * 0.31, 0.33, -l / 2 - 0.012, 0.15, 0.08, 0.025, car.braking ? 0xff3028 : 0x902c27);
      }
      // Yellow Dutch plates; taxi roof sign, van cargo stripe, bus destination board, SUV roof rails.
      box(cars, index++, p, angle, 0, 0.23, -l / 2 - 0.015, 0.19, 0.055, 0.025, car.kind === 4 ? 0x74c5e8 : 0xffcb32);
      if (car.kind === 4) box(cars, index++, p, angle, 0, 0.43 + h, 0, 0.28, 0.12, 0.18, 0xffec9d);
      if (car.kind === 3) box(cars, index++, p, angle, -w * 0.455, 0.50, -0.14, 0.025, 0.13, l * 0.55, 0xf29c3a);
      if (car.kind === 5) box(cars, index++, p, angle, 0, 0.39 + h, cabinLength / 2 - l * 0.05 + 0.03, w * 0.7, 0.10, 0.025, 0xffcc63);
      if (car.kind === 2) for (const side of [-1, 1]) box(cars, index++, p, angle, side * w * 0.32, 0.40 + h, 0, 0.04, 0.05, l * 0.48, 0x27343b);
    }
    commit(cars, index); commit(carLights, lightIndex); index = 0;
    for (const person of simulation.people) {
      if (person.id === view.personId) continue;
      const p = interpolate(person.previous, person.position, alpha);
      const angle = interpolateAngle(person.previousAngle, person.angle, alpha);
      const h = person.height, base = person.state === 'cross' ? 0.12 : 0.2;
      const swing = person.state === 'wait' ? 0 : Math.sin(person.walkTime * 8) * 0.5;
      box(people, index++, p, angle, 0, base + h * 0.58, 0, h * 0.28, h * 0.34, h * 0.20, PALETTE[person.color]);
      box(people, index++, p, angle, 0, base + h * 0.87, 0, h * 0.20, h * 0.23, h * 0.20, [0xe7b68e, 0xa96f4c, 0x72482f][person.id % 3]);
      for (const side of [-1, 1]) {
        box(people, index++, p, angle, side * h * 0.09, base + h * 0.22, 0, h * 0.10, h * 0.43, h * 0.12, 0x28384d, side * swing);
        box(people, index++, p, angle, side * h * 0.20, base + h * 0.57, 0, h * 0.08, h * 0.32, h * 0.10, PALETTE[person.color], -side * swing);
      }
      box(people, index++, p, angle, 0, base + h * 0.99, -0.015, h * 0.22, h * 0.06, h * 0.22, person.id % 3 ? 0x423326 : 0xc66547);
    }
    commit(people, index); index = 0;
    for (const bulb of bulbs) {
      const controller = simulation.junctions[bulb.junction].signal!;
      const state = bulb.direction === 4 ? controller.pedestrian : controller.vehicle(bulb.direction);
      const on = bulb.aspect === 0 ? state === 'red' : bulb.aspect === 1 ? state === 'amber' :
        state === 'green' || state === 'flash' && simulation.time % 1.2 < 0.6;
      if (on !== bulb.last) {
        signals.setColorAt(bulb.index, color.setHex(on ? bulb.tint : 0x293239));
        signals.instanceColor!.needsUpdate = true;
        bulb.last = on;
      }
    }
    statusTime += delta;
    if (statusTime >= 0.5) {
      statusTime = 0;
      panel.querySelector('#traffic-status')!.textContent = `${simulation.completedTrips} junction passages · ${simulation.people.filter((p) => p.state === 'wait').length} waiting to cross`;
    }
  }
  return { update, simulation, view };
}
