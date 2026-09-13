import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { warpPoint } from './cityWarp.ts';
import type { createTraffic } from './trafficView.ts';

type Person = ReturnType<typeof createTraffic>['simulation']['people'][number];

export function pedestrianPose(person: Person, alpha: number) {
  const p = { x: THREE.MathUtils.lerp(person.previous.x, person.position.x, alpha),
    z: THREE.MathUtils.lerp(person.previous.z, person.position.z, alpha) };
  const angle = person.previousAngle + Math.atan2(Math.sin(person.angle - person.previousAngle),
    Math.cos(person.angle - person.previousAngle)) * alpha;
  const position = warpPoint(p);
  const ahead = warpPoint({ x: p.x + Math.sin(angle) * 0.1, z: p.z + Math.cos(angle) * 0.1 });
  return { ...position, y: (person.state === 'cross' ? 0.12 : 0.2) + person.height * 0.9,
    yaw: Math.atan2(position.x - ahead.x, position.z - ahead.z) };
}

export function createCityCamera(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement,
  traffic: ReturnType<typeof createTraffic>, cityWidth: number) {
  const controls = new MapControls(camera, canvas);
  controls.enableDamping = true;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.minDistance = 5;
  controls.maxDistance = cityWidth * 2;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.maxTargetRadius = cityWidth * 0.75;
  const savedPosition = camera.position.clone();
  const savedTarget = controls.target.clone();
  let yaw = 0, pitch = 0;
  let pointer: { id: number; x: number; y: number } | null = null;
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Camera controls');
  panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:1001;max-width:min(340px,calc(100vw - 48px));padding:12px;border-radius:10px;background:#162823ed;color:#f2f1e8;font:13px/1.5 system-ui;border:1px solid #ffffff35';
  panel.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" data-map aria-pressed="true">City view</button><button type="button" data-pov aria-pressed="false">Pedestrian POV</button><button type="button" data-next hidden>Next person</button><button type="button" data-home>Overview</button></div><div data-help role="status" style="margin-top:8px"></div>`;
  document.body.appendChild(panel);
  const map = panel.querySelector<HTMLButtonElement>('[data-map]')!;
  const pov = panel.querySelector<HTMLButtonElement>('[data-pov]')!;
  const next = panel.querySelector<HTMLButtonElement>('[data-next]')!;
  const help = panel.querySelector<HTMLElement>('[data-help]')!;
  function refresh() {
    const following = traffic.view.personId !== null;
    map.setAttribute('aria-pressed', String(!following));
    pov.setAttribute('aria-pressed', String(following));
    next.hidden = !following;
    help.textContent = following ? 'Walking with a pedestrian · drag to look · Esc returns to city view.' :
      'Drag to pan · scroll to zoom · right-drag to rotate. Touch: one finger pans, two fingers zoom / rotate.';
    canvas.style.cursor = 'grab';
  }
  function leave() {
    if (traffic.view.personId === null) return;
    traffic.view.personId = null;
    camera.position.copy(savedPosition);
    controls.target.copy(savedTarget);
    controls.enabled = true;
    controls.update();
    pointer = null;
    refresh();
  }
  function focus(point: { x: number; z: number }, height: number) {
    leave();
    // Flush orbit damping before a preset so the old gesture cannot move the new view.
    controls.enableDamping = false;
    controls.update();
    controls.target.set(point.x, 0, point.z);
    camera.position.set(point.x + height * 0.8, height, point.z + height * 0.8);
    controls.update();
    controls.enableDamping = true;
  }
  function overview() { focus({ x: 0, z: 0 }, cityWidth * 0.72); }
  function follow(nextPerson = false) {
    const people = traffic.simulation.people;
    if (!people.length) { leave(); help.textContent = 'Add people using the People slider to enter pedestrian POV.'; return; }
    let person = people[0];
    if (nextPerson && traffic.view.personId !== null) {
      person = people[(people.findIndex((p) => p.id === traffic.view.personId) + 1) % people.length];
    } else {
      let nearest = Infinity;
      for (const candidate of people) {
        const p = warpPoint(candidate.position);
        const distance = Math.hypot(p.x - controls.target.x, p.z - controls.target.z);
        if (distance < nearest) { nearest = distance; person = candidate; }
      }
    }
    if (traffic.view.personId === null) {
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      savedPosition.copy(camera.position);
      savedTarget.copy(controls.target);
    }
    controls.enabled = false;
    traffic.view.personId = person.id;
    yaw = 0; pitch = 0;
    refresh();
  }
  map.addEventListener('click', leave);
  pov.addEventListener('click', () => follow());
  next.addEventListener('click', () => follow(true));
  panel.querySelector('[data-home]')!.addEventListener('click', overview);
  window.addEventListener('keydown', (event) => { if (event.code === 'Escape') leave(); });
  canvas.addEventListener('pointerdown', (event) => {
    if (traffic.view.personId === null || pointer || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw -= (event.clientX - pointer.x) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - pointer.y) * 0.004, -1.2, 1.2);
    pointer.x = event.clientX; pointer.y = event.clientY;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, () => { pointer = null; canvas.style.cursor = 'grab'; });
  }
  window.addEventListener('blur', () => { pointer = null; });
  refresh();
  return { focus, overview, update() {
    if (traffic.view.personId !== null) {
      const person = traffic.simulation.people.find((p) => p.id === traffic.view.personId);
      if (!person) { leave(); return; }
      const pose = pedestrianPose(person, traffic.view.alpha);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, pose.yaw + yaw, 0, 'YXZ'));
    } else controls.update();
  } };
}
