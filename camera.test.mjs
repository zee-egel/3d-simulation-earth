import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCityCamera, pedestrianPose } from './src/cityCamera.ts';
import { warpPoint } from './src/cityWarp.ts';

class Element extends EventTarget {
  style = {};
  children = new Map();
  clientWidth = 1000;
  clientHeight = 800;
  setAttribute() {}
  appendChild(child) { this.child = child; }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new Element());
    return this.children.get(selector);
  }
  getRootNode() { return document; }
}
globalThis.document = new Element();
document.body = new Element();
document.createElement = () => new Element();
globalThis.window = new Element();
const canvas = new Element();
canvas.ownerDocument = document;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(200, 200, 200);
const person = { id: 1, position: { x: 12, z: 30 }, previous: { x: 10, z: 30 },
  angle: Math.PI / 2, previousAngle: Math.PI / 2, height: 0.7, state: 'walk' };
const traffic = { simulation: { people: [person, { ...person, id: 2 }] }, view: { personId: null, alpha: 0.5 } };
const navigation = createCityCamera(camera, canvas, traffic, 327);
const panel = document.body.child;
const click = (selector) => panel.querySelector(selector).dispatchEvent(new Event('click'));
navigation.update();
const saved = camera.position.clone();
click('[data-pov]');
navigation.update();
assert.equal(traffic.view.personId, 1);
const p = warpPoint({ x: 11, z: 30 });
assert.ok(camera.position.distanceTo(new THREE.Vector3(p.x, 0.83, p.z)) < 1e-9);
const forward = camera.getWorldDirection(new THREE.Vector3());
const ahead = warpPoint({ x: 11.1, z: 30 });
assert.ok(forward.dot(new THREE.Vector3(ahead.x - p.x, 0, ahead.z - p.z).normalize()) > 0.99999);
click('[data-next]');
assert.equal(traffic.view.personId, 2);
click('[data-map]');
navigation.update();
assert.ok(camera.position.distanceTo(saved) < 1e-8, 'city view is restored');
click('[data-pov]');
traffic.simulation.people = [];
navigation.update();
assert.equal(traffic.view.personId, null, 'removed pedestrian exits POV safely');
click('[data-pov]');
assert.equal(traffic.view.personId, null, 'empty population does not enter POV');
traffic.simulation.people = [person];
click('[data-pov]');
navigation.focus({ x: 20, z: 30 }, 14);
assert.equal(traffic.view.personId, null, 'destinations leave POV');
assert.equal(camera.position.y, 14);
const wrap = pedestrianPose({ ...person, previousAngle: Math.PI - 0.1, angle: -Math.PI + 0.1 }, 0.5);
assert.ok(Number.isFinite(wrap.yaw));
assert.ok(Math.cos(wrap.yaw) > 0.9, 'heading interpolates across the short arc');
const paused = pedestrianPose(person, 1);
assert.equal(paused.x, warpPoint(person.position).x);
console.log('Camera checks passed: map restoration, POV pose, heading, next person, removal, destinations.');
