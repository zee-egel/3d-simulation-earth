import { createRandom } from './randomSeed.ts';

export type District = 'downtown' | 'urban' | 'suburban';
export type Landscape = { name: string; x: number; z: number; rx: number; rz: number; phase: number; kind: 'lake' | 'park' };
export type LayoutNode = { x: number; z: number; neighbors: number[] };
export function shoreRadius(angle: number, phase: number) {
  return 1 + 0.085 * Math.sin(angle * 3 + phase) + 0.045 * Math.sin(angle * 5 - phase);
}
export function landscapeDistance(x: number, z: number, feature: Landscape) {
  const nx = (x - feature.x) / feature.rx, nz = (z - feature.z) / feature.rz;
  return Math.hypot(nx, nz) / shoreRadius(Math.atan2(nz, nx), feature.phase);
}

export function createCityLayout(citySize: number, spacing: number, offset: number, seed: string) {
  const random = createRandom(`${seed}:landscape`);
  const extent = citySize * spacing;
  const features: Landscape[] = [
    { name: 'Westhaven Lake', x: -0.24, z: -0.17, rx: 0.17, rz: 0.115, kind: 'lake' },
    { name: 'Willow Lake', x: 0.27, z: 0.24, rx: 0.115, rz: 0.085, kind: 'lake' },
    { name: 'Royal Gardens', x: 0.13, z: -0.28, rx: 0.13, rz: 0.10, kind: 'park' },
    { name: 'Meadow Commons', x: -0.22, z: 0.24, rx: 0.14, rz: 0.095, kind: 'park' },
    { name: 'Eastwood', x: 0.34, z: -0.12, rx: 0.085, rz: 0.14, kind: 'park' },
  ].map((f) => ({ ...f, kind: f.kind as 'lake' | 'park', x: f.x * extent, z: f.z * extent,
    rx: f.rx * extent, rz: f.rz * extent, phase: random() * Math.PI * 2 }));
  const centers = [
    { x: extent * 0.035, z: extent * -0.04, radius: extent * 0.14, weight: 1.05 },
    { x: extent * -0.30, z: extent * 0.055, radius: extent * 0.085, weight: 0.94 },
    { x: extent * 0.20, z: extent * -0.03, radius: extent * 0.075, weight: 0.91 },
  ];
  const phase = random() * 10;
  function densityAt(x: number, z: number) {
    const hubs = Math.max(...centers.map((c) => c.weight * Math.exp(-((x - c.x) ** 2 + (z - c.z) ** 2) / (c.radius ** 2))));
    const texture = 0.11 * Math.sin(x / 22 + phase) * Math.cos(z / 29 - phase) + 0.07 * Math.sin((x + z) / 13);
    return Math.max(0, Math.min(1, hubs + texture + 0.12));
  }
  function districtAt(x: number, z: number): District {
    const value = densityAt(x, z);
    return value > 0.70 ? 'downtown' : value > 0.29 ? 'urban' : 'suburban';
  }
  function reserved(x: number, z: number, margin = 0) {
    return features.some((f) => landscapeDistance(x, z, f) < 1 + margin / Math.min(f.rx, f.rz));
  }
  const n = citySize - 1;
  const nodes: LayoutNode[] = [];
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) nodes.push({
    x: x * spacing - offset + spacing / 2, z: z * spacing - offset + spacing / 2,
    neighbors: [-1, -1, -1, -1],
  });
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    const id = x * n + z, a = nodes[id];
    for (const [direction, to] of [[0, x < n - 1 ? id + n : -1], [1, z < n - 1 ? id + 1 : -1]]) {
      if (to < 0) continue;
      const b = nodes[to];
      if ([0, 0.25, 0.5, 0.75, 1].some((t) => reserved(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 5))) continue;
      // Continuous avenues plus irregular local streets create long blocks and T-junctions.
      const avenue = direction === 0 ? z % 5 === 2 : x % 6 === 2;
      const keep = avenue || random() < (districtAt(a.x, a.z) === 'downtown' ? 0.90 : 0.58);
      if (keep) { a.neighbors[direction] = to; b.neighbors[(direction + 2) % 4] = id; }
    }
  }
  // Traffic needs a through route: remove dead ends, then retain the largest connected road network.
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.neighbors.filter((to) => to >= 0).length !== 1) return;
      node.neighbors.forEach((to, d) => { if (to >= 0) { nodes[to].neighbors[(d + 2) % 4] = -1; node.neighbors[d] = -1; changed = true; } });
    });
  }
  const visited = new Set<number>();
  let largest: number[] = [];
  nodes.forEach((node, id) => {
    if (visited.has(id) || node.neighbors.every((to) => to < 0)) return;
    const component = [id]; visited.add(id);
    for (let i = 0; i < component.length; i++) for (const to of nodes[component[i]].neighbors) {
      if (to >= 0 && !visited.has(to)) { visited.add(to); component.push(to); }
    }
    if (component.length > largest.length) largest = component;
  });
  const retained = new Set(largest);
  nodes.forEach((node, id) => { if (!retained.has(id)) node.neighbors.fill(-1); });
  function hasStreet(blockX: number, blockZ: number) {
    for (const x of [blockX - 1, blockX]) for (const z of [blockZ - 1, blockZ]) {
      if (x >= 0 && z >= 0 && x < n && z < n && retained.has(x * n + z)) return true;
    }
    return false;
  }
  return { features, nodes, centers, densityAt, districtAt, reserved, hasStreet };
}
