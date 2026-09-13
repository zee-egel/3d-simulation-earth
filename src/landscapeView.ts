import * as THREE from 'three';
import { createRandom } from './randomSeed.ts';
import { landscapeDistance, shoreRadius } from './cityLayout.ts';
import type { Landscape } from './cityLayout.ts';

type Tree = (x: number, z: number, scale: number) => void;
export function addLandscape(scene: THREE.Scene, features: Landscape[], seed: string, tree: Tree) {
  const random = createRandom(`${seed}:gardens`);
  function patch(f: Landscape, scale: number, color: number, y: number, water = false) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * Math.PI * 2, radius = shoreRadius(a, f.phase) * scale;
      const x = f.x + Math.cos(a) * f.rx * radius, z = f.z + Math.sin(a) * f.rz * radius;
      if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
    }
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color,
      roughness: water ? 0.23 : 1, metalness: water ? 0.22 : 0 }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; scene.add(mesh);
  }
  function path(points: THREE.Vector2[], width: number, tint: number, y = 0.055) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(a.distanceTo(b) + 0.10, width), new THREE.MeshStandardMaterial({ color: tint }));
      mesh.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
      mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.y - a.y, b.x - a.x)); scene.add(mesh);
    }
  }
  function circle(x: number, z: number, radius: number, tint: number, y: number) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshStandardMaterial({ color: tint }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); scene.add(mesh);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, tint: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: tint }));
    mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  }
  for (const feature of features) {
    patch(feature, 1.20, 0x829c62, 0.012);
    patch(feature, 1.13, feature.kind === 'lake' ? 0xd8c79b : 0x92ae70, 0.017);
    patch(feature, 1.05, feature.kind === 'lake' ? 0x57aaae : 0x719354, 0.025);
    patch(feature, 1, feature.kind === 'lake' ? 0x2d829a : 0x87a867, 0.033, feature.kind === 'lake');
    const loop: THREE.Vector2[] = [];
    for (let i = 0; i <= 120; i++) {
      const angle = i / 120 * Math.PI * 2, radius = shoreRadius(angle, feature.phase) * (feature.kind === 'lake' ? 1.10 : 0.82);
      loop.push(new THREE.Vector2(feature.x + Math.cos(angle) * feature.rx * radius, feature.z + Math.sin(angle) * feature.rz * radius));
    }
    path(loop, 0.8, 0xd5c49e);
    for (let i = 0; i < 380; i++) {
      const x = feature.x + (random() - 0.5) * feature.rx * 2.4;
      const z = feature.z + (random() - 0.5) * feature.rz * 2.4;
      const d = landscapeDistance(x, z, feature);
      if (feature.kind === 'lake' ? d > 1.14 && d < 1.23 : d > 0.87 && d < 1.04) tree(x, z, 1.4 + random() * 1.8);
    }
    if (feature.kind === 'park') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(feature.x - feature.rx * 0.75, 0, feature.z),
        new THREE.Vector3(feature.x - feature.rx * 0.3, 0, feature.z + feature.rz * 0.23),
        new THREE.Vector3(feature.x + feature.rx * 0.25, 0, feature.z - feature.rz * 0.2),
        new THREE.Vector3(feature.x + feature.rx * 0.75, 0, feature.z),
      ]);
      path(curve.getPoints(70).map((p) => new THREE.Vector2(p.x, p.z)), 1.15, 0xe6d5b0);
      circle(feature.x, feature.z, 5, 0xdad0bb, 0.07);
      circle(feature.x, feature.z, 2.8, 0xf1e4c9, 0.09);
      circle(feature.x, feature.z, 2.35, 0x69c2cb, 0.10);
      const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, 2.1, 12), new THREE.MeshStandardMaterial({ color: 0xd6f2ee }));
      fountain.position.set(feature.x, 1.1, feature.z); scene.add(fountain);
      for (let i = 0; i < 70; i++) {
        const angle = random() * Math.PI * 2, r = 7 + random() * feature.rz * 0.4;
        const x = feature.x + Math.cos(angle) * r, z = feature.z + Math.sin(angle) * r;
        if (Math.abs(z - feature.z) < 3) continue;
        tree(x, z, 0.7 + random() * 1.1);
      }
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5;
        const x = feature.x + Math.cos(a) * 6.6, z = feature.z + Math.sin(a) * 6.6;
        circle(x, z, 0.9, [0xd398ac, 0xe5bc60, 0xb8a1ca][i % 3], 0.09);
        box(x, 0.35, z + 1.5, 1.25, 0.15, 0.4, 0x9b7450);
        box(x, 0.60, z + 1.65, 1.25, 0.4, 0.10, 0x9b7450);
      }
    } else {
      const island = { ...feature, x: feature.x + feature.rx * 0.15, z: feature.z - feature.rz * 0.10,
        rx: feature.rx * 0.15, rz: feature.rz * 0.17 };
      patch(island, 1.15, 0xe1ce9f, 0.07); patch(island, 1, 0x7e9b60, 0.08);
      for (let i = 0; i < 12; i++) tree(island.x + (random() - 0.5) * island.rx, island.z + (random() - 0.5) * island.rz, 0.9 + random());
      for (let i = 0; i < 5; i++) {
        const angle = 1.4 + i * 0.38;
        const x = feature.x + Math.cos(angle) * feature.rx * 0.60, z = feature.z + Math.sin(angle) * feature.rz * 0.62;
        box(x, 0.18, z, 0.75, 0.23, 1.9, [0xf3e8cd, 0xbd604b, 0xefd483][i % 3]);
        box(x, 0.95, z, 0.04, 1.5, 0.04, 0xede5d6);
        const sail = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.8, 1.5, 3), new THREE.MeshStandardMaterial({ color: 0xfff4da }));
        sail.scale.z = 0.05; sail.position.set(x + 0.25, 1.0, z); scene.add(sail);
      }
      const dockAngle = 0.2;
      const radius = shoreRadius(dockAngle, feature.phase);
      const dx = feature.x + Math.cos(dockAngle) * feature.rx * radius, dz = feature.z + Math.sin(dockAngle) * feature.rz * radius;
      box(dx - 1.4, 0.20, dz, 5.5, 0.20, 1.4, 0xad8257);
      for (let i = 0; i < 6; i++) box(dx - 4 + i, 0.34, dz, 0.025, 0.04, 1.4, 0x75583e);
    }
  }
}
