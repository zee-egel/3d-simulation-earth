import * as THREE from "three";
import { createCityCamera } from "./cityCamera";
import { createRandom } from "./randomSeed";
import { instanceBuildings } from "./instanceBuildings";
import { createTraffic } from "./trafficView";
import { createCityLayout } from "./cityLayout";
import type { District } from "./cityLayout";
import { addLandscape } from "./landscapeView";
import { bendCity, warpPoint, unwarpPoint } from "./cityWarp";

const citySize = 30;
const blockSize = 8;
const lotsPerSide = 2;
const lotSize = blockSize / lotsPerSide;
const roadWidth = 3;

const spacing = blockSize + roadWidth;
const offset = ((citySize - 1) * spacing) / 2;
const cityWidth = citySize * blockSize + (citySize - 1) * roadWidth;
const sidewalkHeight = 0.2;

const groundPadding = spacing * 0.5;
const groundSize = cityWidth + groundPadding * 2;
const citySeed = "Alphen aan den Rijn";
const layout = createCityLayout(citySize, spacing, offset, citySeed);

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x87ceeb); // Set background color to sky blue

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const cameraDistance = cityWidth * 0.72; // Distance from the center of the city

camera.position.set(cameraDistance, cameraDistance, cameraDistance); // Position the camera at (cameraDistance, cameraDistance, cameraDistance)

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));

document.body.appendChild(renderer.domElement);

// performance HUD
const performanceHud = document.createElement("div");
performanceHud.style.position = "fixed";
performanceHud.style.top = "12px";
performanceHud.style.left = "12px";
performanceHud.style.padding = "8px 10px";
performanceHud.style.background = "rgba(0, 0, 0, 0.7)";
performanceHud.style.color = "white";
performanceHud.style.fontFamily = "monospace";
performanceHud.style.fontSize = "12px";
performanceHud.style.lineHeight = "1.5";
performanceHud.style.zIndex = "1000";
performanceHud.style.pointerEvents = "none";
document.body.appendChild(performanceHud);

let frameCount = 0;
let lastFpsUpdate = performance.now();
let fps = 0;

const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(10, 20, 10);

scene.add(directionalLight);

const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 32, 32);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x7d956b }); // Forest green
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
const clock = new THREE.Timer();

ground.rotation.x = -Math.PI / 2; // Rotate the ground to be horizontal

scene.add(ground);

function animate() {
  requestAnimationFrame(animate);

  clock.update();
  const delta = clock.getDelta();
  updateDayNightCycle(delta);
  traffic.update(delta);
  cityCamera.update();
  updateClosestStreetLights();
  renderer.render(scene, camera);

  frameCount++;
  const now = performance.now();
  const elapsed = now - lastFpsUpdate;

  if (elapsed >= 500) {
    fps = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFpsUpdate = now;

    const info = renderer.info;

    performanceHud.innerHTML = [
      `FPS: ${fps}`,
      `Draw calls: ${info.render.calls}`,
      `Triangles: ${info.render.triangles.toLocaleString()}`,
      `Geometries: ${info.memory.geometries.toLocaleString()}`,
      `Textures: ${info.memory.textures.toLocaleString()}`,
      `Time of Day: ${((timeOfDay / (Math.PI * 2)) * 24).toFixed(1)} hours`,
    ].join("<br>");
  }
}

const random = createRandom(citySeed);

type Crosswalk = {
  x: number;
  z: number;
  horizontal: boolean;
};

const crosswalks: Crosswalk[] = [];

type WindowInstance = {
  parent: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  width: number;
  height: number;
  color: number;
};

const windowInstances: WindowInstance[] = [];
const sharedWindowGeometry = new THREE.PlaneGeometry(1, 1);

type RoadMarkingInstance = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

const roadMarkingInstances: RoadMarkingInstance[] = [];
const sharedRoadMarkingGeometry = new THREE.PlaneGeometry(1, 1);

type StreetLightInstance = {
  x: number;
  z: number;
  rotationY: number;
};

const streetLightInstances: StreetLightInstance[] = [];
const sharedStreetLightGeometry = new THREE.CylinderGeometry(
  0.06,
  0.08,
  2.5,
  8,
);
const sharedStreetLightHeadGeometry = new THREE.BoxGeometry(0.35, 0.18, 0.18);

function addWindowsToBuilding(
  building: THREE.Object3D,
  width: number,
  depth: number,
  height: number,
  seed: string,
  windowColor: number,
  district: District,
) {
  const windowRandom = createRandom(seed);

  if (district === "downtown") {
    const floorHeight = 2.2;
    const floorCount = Math.floor(height / floorHeight);
    if (floorCount <= 0) return;

    const windowHeight = 1.05;
    const facadeCoverage = 0.82;
    const frontColumns = Math.max(2, Math.min(6, Math.floor(width / 0.65)));
    const sideColumns = Math.max(2, Math.min(6, Math.floor(depth / 0.65)));

    for (let floor = 0; floor < floorCount; floor++) {
      const y = -height / 2 + floorHeight * (floor + 0.55);

      for (let column = 0; column < frontColumns; column++) {
        const facadePosition =
          ((column + 1) / (frontColumns + 1) - 0.5) * facadeCoverage;
        const columnSpacing = (width * facadeCoverage) / (frontColumns + 1);
        const windowWidth = Math.min(0.48, columnSpacing * 0.58);

        windowInstances.push({
          parent: building,
          x: facadePosition * width,
          y,
          z: depth / 2 + 0.01,
          rotationY: 0,
          width: windowWidth,
          height: windowHeight,
          color: windowColor,
        });
        windowInstances.push({
          parent: building,
          x: facadePosition * width,
          y,
          z: -depth / 2 - 0.01,
          rotationY: Math.PI,
          width: windowWidth,
          height: windowHeight,
          color: windowColor,
        });
      }

      for (let column = 0; column < sideColumns; column++) {
        const facadePosition =
          ((column + 1) / (sideColumns + 1) - 0.5) * facadeCoverage;
        const columnSpacing = (depth * facadeCoverage) / (sideColumns + 1);
        const windowWidth = Math.min(0.48, columnSpacing * 0.58);

        windowInstances.push({
          parent: building,
          x: width / 2 + 0.01,
          y,
          z: facadePosition * depth,
          rotationY: Math.PI / 2,
          width: windowWidth,
          height: windowHeight,
          color: windowColor,
        });
        windowInstances.push({
          parent: building,
          x: -width / 2 - 0.01,
          y,
          z: facadePosition * depth,
          rotationY: -Math.PI / 2,
          width: windowWidth,
          height: windowHeight,
          color: windowColor,
        });
      }
    }

    return;
  }

  const floorHeight =
    district === "urban"
      ? 2.4 + windowRandom() * 0.4
      : 2.6 + windowRandom() * 0.6;
  const floorCount = Math.floor(height / floorHeight);
  if (floorCount <= 0) return;

  const windowsPerRow =
    district === "urban"
      ? 2 + Math.floor(windowRandom() * 2)
      : 1 + Math.floor(windowRandom() * 2);

  const facadeCoverage =
    district === "urban"
      ? 0.65 + windowRandom() * 0.15
      : 0.5 + windowRandom() * 0.25;

  const baseWindowWidth =
    district === "urban"
      ? 0.34 + windowRandom() * 0.14
      : 0.38 + windowRandom() * 0.24;
  const baseWindowHeight =
    district === "urban"
      ? 0.58 + windowRandom() * 0.18
      : 0.55 + windowRandom() * 0.3;

  for (let floor = 0; floor < floorCount; floor++) {
    const y = -height / 2 + floorHeight * (floor + 0.6);

    for (let column = 0; column < windowsPerRow; column++) {
      const facadePosition =
        ((column + 1) / (windowsPerRow + 1) - 0.5) * facadeCoverage;

      const horizontalJitter =
        district === "suburban" ? (windowRandom() - 0.5) * 0.18 : 0;
      const sizeVariation =
        district === "suburban" ? 0.85 + windowRandom() * 0.3 : 1;

      windowInstances.push({
        parent: building,
        x: (facadePosition + horizontalJitter) * width,
        y,
        z: depth / 2 + 0.01,
        rotationY: 0,
        width: baseWindowWidth * sizeVariation,
        height: baseWindowHeight * sizeVariation,
        color: windowColor,
      });
      windowInstances.push({
        parent: building,
        x: (facadePosition + horizontalJitter) * width,
        y,
        z: -depth / 2 - 0.01,
        rotationY: Math.PI,
        width: baseWindowWidth * sizeVariation,
        height: baseWindowHeight * sizeVariation,
        color: windowColor,
      });

      if (district === "urban" || windowRandom() < 0.75) {
        const sideJitter =
          district === "suburban" ? (windowRandom() - 0.5) * 0.18 : 0;

        windowInstances.push({
          parent: building,
          x: width / 2 + 0.01,
          y,
          z: (facadePosition + sideJitter) * depth,
          rotationY: Math.PI / 2,
          width: baseWindowWidth * sizeVariation,
          height: baseWindowHeight * sizeVariation,
          color: windowColor,
        });
        windowInstances.push({
          parent: building,
          x: -width / 2 - 0.01,
          y,
          z: (facadePosition + sideJitter) * depth,
          rotationY: -Math.PI / 2,
          width: baseWindowWidth * sizeVariation,
          height: baseWindowHeight * sizeVariation,
          color: windowColor,
        });
      }
    }
  }
}

function createBuilding(
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  color: number,
  windowColor: number,
  district: District,
) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color,
  });

  const building = new THREE.Mesh(geometry, material);
  building.position.set(x, height / 2 + sidewalkHeight, z);

  addWindowsToBuilding(
    building,
    width,
    depth,
    height,
    `building-${x.toFixed(2)}-${z.toFixed(2)}`,
    windowColor,
    district,
  );

  scene.add(building);
}

function createSetbackBuilding(
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  setback: number,
  color: number,
  windowColor: number,
  district: District,
) {
  const building = new THREE.Group();
  building.position.set(x, sidewalkHeight, z);

  const segmentCount = 3;
  const segmentHeight = height / segmentCount;

  const material = new THREE.MeshStandardMaterial({
    color,
  });

  let currentY = 0;
  let currentWidth = width;
  let currentDepth = depth;

  for (let segment = 0; segment < segmentCount; segment++) {
    const segmentGeometry = new THREE.BoxGeometry(
      currentWidth,
      segmentHeight,
      currentDepth,
    );

    const segmentMesh = new THREE.Mesh(segmentGeometry, material);
    segmentMesh.position.set(0, currentY + segmentHeight / 2, 0);
    addWindowsToBuilding(
      segmentMesh,
      currentWidth,
      currentDepth,
      segmentHeight,
      `setback-${x.toFixed(2)}-${z.toFixed(2)}-${segment}`,
      windowColor,
      district,
    );
    building.add(segmentMesh);
    currentY += segmentHeight;

    if (segment < segmentCount - 1) {
      const setbackFactor = Math.max(
        0.4,
        1 - setback / Math.max(currentWidth, currentDepth),
      );

      currentWidth *= setbackFactor;
      currentDepth *= setbackFactor;
    }
  }

  scene.add(building);
}

let timeOfDay = 0;
const headMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8d3b5,
  emissive: 0xffd98a,
  emissiveIntensity: 0,
});

function updateDayNightCycle(delta: number) {
  timeOfDay = (timeOfDay + delta * 0.1) % (Math.PI * 2);
  const sunHeight = Math.sin(timeOfDay);
  const sunDistance = 100;

  const daylight = THREE.MathUtils.clamp(sunHeight * 0.5 + 0.5, 0, 1);
  ambientLight.intensity = daylight * 0.85 + 0.15;
  directionalLight.intensity = daylight * 2;

  const dayColor = new THREE.Color(0xb6d5dc);
  const nightColor = new THREE.Color(0x07111f);

  scene.background = nightColor.clone().lerp(dayColor, daylight);

  headMaterial.emissiveIntensity = (1 - daylight) * 2;

  directionalLight.position.set(
    Math.cos(timeOfDay) * sunDistance,
    sunHeight * sunDistance,
    Math.sin(timeOfDay) * sunDistance,
  );
}

function createStreetLightInstances() {
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

  const poles = new THREE.InstancedMesh(
    sharedStreetLightGeometry,
    poleMaterial,
    streetLightInstances.length,
  );

  const heads = new THREE.InstancedMesh(
    sharedStreetLightHeadGeometry,
    headMaterial,
    streetLightInstances.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const rotation = new THREE.Euler();
  streetLightInstances.forEach((light, index) => {
    position.set(light.x, sidewalkHeight + 1.25, light.z);
    rotation.set(0, light.rotationY, 0);
    quaternion.setFromEuler(rotation);
    matrix.compose(position, quaternion, scale);
    poles.setMatrixAt(index, matrix);

    position.set(light.x, sidewalkHeight + 2.5, light.z);
    rotation.set(0, light.rotationY, 0);
    quaternion.setFromEuler(rotation);
    matrix.compose(position, quaternion, scale);
    heads.setMatrixAt(index, matrix);
  });

  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;

  scene.add(poles);
  scene.add(heads);
}

const activeStreetLightCount = 8;
const lastStreetLightCameraPosition = new THREE.Vector2(Infinity, Infinity);

const activeStreetLightSpots: THREE.SpotLight[] = [];
const activeStreetLightTargets: THREE.Object3D[] = [];

function createStreetLightSpotLight() {
  const light = new THREE.SpotLight(0xffd98a, 500, 12, Math.PI / 4, 0.4, 2);

  const target = new THREE.Object3D();

  light.target = target;

  scene.add(target);
  scene.add(light);

  activeStreetLightSpots.push(light);
  activeStreetLightTargets.push(target);
}

function updateClosestStreetLights() {
  // refresh after one ground unit of movement. use a spatial index if this sort gets costly.
  const streetCamera = unwarpPoint(camera.position);
  const dx = streetCamera.x - lastStreetLightCameraPosition.x;
  const dz = streetCamera.z - lastStreetLightCameraPosition.y;
  if (dx * dx + dz * dz < 1) return;
  lastStreetLightCameraPosition.set(streetCamera.x, streetCamera.z);

  const closestLights = [...streetLightInstances]
    .sort((a, b) => {
      const distanceA =
        (a.x - streetCamera.x) ** 2 + (a.z - streetCamera.z) ** 2;

      const distanceB =
        (b.x - streetCamera.x) ** 2 + (b.z - streetCamera.z) ** 2;

      return distanceA - distanceB;
    })
    .slice(0, activeStreetLightCount);

  for (let i = 0; i < activeStreetLightCount; i++) {
    const streetLamp = closestLights[i];
    const light = activeStreetLightSpots[i];
    const target = activeStreetLightTargets[i];

    if (!streetLamp) {
      light.visible = false;
      continue;
    }

    light.visible = true;

    const lightPosition = warpPoint(streetLamp);
    light.position.set(lightPosition.x, sidewalkHeight + 2.4, lightPosition.z);

    const targetDistance = 2.5;

    const lightTarget = warpPoint({ x: streetLamp.x + Math.cos(streetLamp.rotationY) * targetDistance,
      z: streetLamp.z + Math.sin(streetLamp.rotationY) * targetDistance });
    target.position.set(lightTarget.x, 0.1, lightTarget.z);

    target.updateMatrixWorld();
  }
}
// Create instanced meshes for windows to improve performance
function createWindowInstances() {
  scene.updateMatrixWorld(true);

  const colors = [...new Set(windowInstances.map((window) => window.color))];
  const localMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Euler();

  for (const color of colors) {
    const instancesForColor = windowInstances.filter(
      (window) => window.color === color,
    );

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      metalness: 0.05,
    });

    const instancedWindows = new THREE.InstancedMesh(
      sharedWindowGeometry,
      material,
      instancesForColor.length,
    );

    instancesForColor.forEach((window, index) => {
      position.set(window.x, window.y, window.z);
      rotation.set(0, window.rotationY, 0);
      quaternion.setFromEuler(rotation);
      scale.set(window.width, window.height, 1);

      localMatrix.compose(position, quaternion, scale);
      worldMatrix.multiplyMatrices(window.parent.matrixWorld, localMatrix);
      instancedWindows.setMatrixAt(index, worldMatrix);
    });

    instancedWindows.instanceMatrix.needsUpdate = true;
    instancedWindows.frustumCulled = false;
    scene.add(instancedWindows);
  }
}

function createRoad(x: number, z: number, width: number, depth: number) {
  const geometry = new THREE.PlaneGeometry(width, depth, Math.max(1, Math.ceil(width / 3)), Math.max(1, Math.ceil(depth / 3)));
  const material = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Dark gray for roads

  const road = new THREE.Mesh(geometry, material);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.1, z); // Keep roads just above the ground and below the sidewalk

  scene.add(road);
}

function createRoadMarking(x: number, z: number, width: number, depth: number) {
  roadMarkingInstances.push({
    x,
    z,
    width,
    depth,
  });
}

function createRoadMarkingInstances() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
  });

  const instancedMarkings = new THREE.InstancedMesh(
    sharedRoadMarkingGeometry,
    material,
    roadMarkingInstances.length,
  );

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Euler(-Math.PI / 2, 0, 0);

  quaternion.setFromEuler(rotation);

  roadMarkingInstances.forEach((marking, index) => {
    position.set(marking.x, 0.11, marking.z);
    scale.set(marking.width, marking.depth, 1);
    matrix.compose(position, quaternion, scale);
    instancedMarkings.setMatrixAt(index, matrix);
  });

  instancedMarkings.instanceMatrix.needsUpdate = true;
  instancedMarkings.frustumCulled = false;
  scene.add(instancedMarkings);
}

function createBlockPlatform(x: number, z: number, width = blockSize, depth = blockSize) {
  const geometry = new THREE.BoxGeometry(width, sidewalkHeight, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0xb8b8b8, // Light gray for block platforms
  });
  const platform = new THREE.Mesh(geometry, material);
  platform.position.set(x, sidewalkHeight / 2, z); // Slightly above ground to avoid z-fighting
  scene.add(platform);
}

function createPark(x: number, z: number) {
  const geometry = new THREE.PlaneGeometry(blockSize * 0.9, blockSize * 0.9);
  const material = new THREE.MeshStandardMaterial({ color: 0x4f7942 });
  const treeCount = 5 + Math.floor(random() * 8); // Random number of trees between 5 and 9

  for (let i = 0; i < treeCount; i++) {
    const margin = 0.8;

    const treeX = x + (random() - 0.5) * (blockSize - margin * 2);
    const treeZ = z + (random() - 0.5) * (blockSize - margin * 2);

    const treeScale = 0.8 + random() * 0.6; // Random scale between 0.8 and 1.2
    createTree(treeX, treeZ, treeScale);
  }

  const park = new THREE.Mesh(geometry, material);

  park.rotation.x = -Math.PI / 2;
  park.position.set(x, sidewalkHeight + 0.08, z); // Slightly above the block platform to avoid z-fighting
  scene.add(park);
}

function createTree(x: number, z: number, scale: number, base = sidewalkHeight) {
  const trunkGeometry = new THREE.CylinderGeometry(
    0.12 * scale,
    0.16 * scale,
    1.2 * scale,
    8,
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4f2a });

  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.set(x, 0.6 * scale + base, z);

  scene.add(trunk);

  const crownGeometry = new THREE.SphereGeometry(0.7 * scale, 10, 8);
  const crownMaterial = new THREE.MeshStandardMaterial({ color: [0x4b734b, 0x6f8e54, 0x8aa363, 0xb78b61, 0xd8a1ae][Math.floor(random() * 5)] });

  const crown = new THREE.Mesh(crownGeometry, crownMaterial);
  crown.position.set(x, 1.5 * scale + base, z);
  scene.add(crown);
}

function createCrosswalk(x: number, z: number, horizontal: boolean) {
  const stripeCount = 6;
  const stripeWidth = roadWidth / (stripeCount * 2 - 1);
  const stripeLength = roadWidth * 0.8; // Slightly shorter than the road width
  const stripeGap = stripeWidth;

  for (let i = 0; i < stripeCount; i++) {
    const offset = (i - (stripeCount - 1) / 2) * (stripeWidth + stripeGap);
    if (horizontal) {
      createRoadMarking(x + offset, z, stripeWidth, stripeLength);
    } else {
      createRoadMarking(x, z + offset, stripeLength, stripeWidth);
    }
  }
}

function getBuildingColor(district: District) {
  const palette = district === 'downtown' ? [0x647d83, 0x849b9b, 0xc7c8bc, 0x556a77] :
    district === 'urban' ? [0xc2aa8c, 0xae755d, 0xd9cbbb, 0x987765, 0xb5b7ac] :
    [0xe1d3b7, 0xbc8269, 0xc8bd9c, 0xa9b8ab, 0xd8ad8e];
  return palette[Math.floor(random() * palette.length)];
}

function isInsideCrosswalk(x: number, z: number, width: number, depth: number) {
  return crosswalks.some((c) => Math.abs(x - c.x) < (width + (c.horizontal ? roadWidth : roadWidth * 0.8)) / 2 &&
    Math.abs(z - c.z) < (depth + (c.horizontal ? roadWidth * 0.8 : roadWidth)) / 2);
}

// Crossings only exist on retained streets, never on removed roads or in lakes.
for (const node of layout.nodes) {
  const directions = node.neighbors.map((to, d) => to >= 0 ? d : -1).filter((d) => d >= 0);
  if (directions.length < 3 || random() > 0.55) continue;
  const d = directions[Math.floor(random() * directions.length)];
  crosswalks.push({ x: node.x + [2.7, 0, -2.7, 0][d], z: node.z + [0, 2.7, 0, -2.7][d], horizontal: d % 2 === 1 });
}
for (const node of layout.nodes) {
  if (node.neighbors.every((to) => to < 0)) continue;
  createRoad(node.x, node.z, roadWidth, roadWidth);
  for (const direction of [0, 1]) {
    const to = node.neighbors[direction];
    if (to < 0) continue;
    const end = layout.nodes[to];
    const x = (node.x + end.x) / 2, z = (node.z + end.z) / 2;
    createRoad(x, z, direction === 0 ? spacing : roadWidth, direction === 0 ? roadWidth : spacing);
    for (let along = 2.2; along < spacing - 1.8; along += 2.5) {
      const mx = node.x + (direction === 0 ? along : 0), mz = node.z + (direction === 1 ? along : 0);
      const width = direction === 0 ? 1.2 : 0.09, depth = direction === 1 ? 1.2 : 0.09;
      if (!isInsideCrosswalk(mx, mz, width, depth)) createRoadMarking(mx, mz, width, depth);
    }
    for (const side of [-1, 1]) streetLightInstances.push({
      x: x + (direction === 1 ? side * 1.85 : 0), z: z + (direction === 0 ? side * 1.85 : 0),
      rotationY: direction === 0 ? -side * Math.PI / 2 : side === 1 ? Math.PI : 0,
    });
  }
}
for (const c of crosswalks) createCrosswalk(c.x, c.z, c.horizontal);

for (let x = 0; x < citySize; x++) for (let z = 0; z < citySize; z++) {
  const blockX = x * spacing - offset, blockZ = z * spacing - offset;
  if (layout.reserved(blockX, blockZ, 7)) continue;
  if (!layout.hasStreet(x, z)) {
    if (random() < 0.45) createTree(blockX, blockZ, 1.2 + random(), 0);
    continue;
  }
  const district = layout.districtAt(blockX, blockZ);
  const density = layout.densityAt(blockX, blockZ);
  createBlockPlatform(blockX, blockZ);
  // Join parcels where a side street was removed, making larger continuous blocks.
  const n = citySize - 1;
  if (x < citySize - 1 && z > 0 && z < n && layout.nodes[x * n + z - 1].neighbors[1] < 0 &&
      !layout.reserved(blockX + spacing, blockZ, 7) && layout.hasStreet(x + 1, z)) {
    createBlockPlatform(blockX + spacing / 2, blockZ, roadWidth, blockSize);
  }
  if (z < citySize - 1 && x > 0 && x < n && layout.nodes[(x - 1) * n + z].neighbors[0] < 0 &&
      !layout.reserved(blockX, blockZ + spacing, 7) && layout.hasStreet(x, z + 1)) {
    createBlockPlatform(blockX, blockZ + spacing / 2, blockSize, roadWidth);
  }
  if (district !== 'suburban' && random() < 0.23) {
    const color = getBuildingColor(district);
    if (district === 'downtown') createSetbackBuilding(blockX, blockZ, 5.5, 5.2, 18 + random() * 24, 0.8, color, 0xb4d8d6, district);
    else {
      createBuilding(blockX - 1.65, blockZ, 1.8, 5.6, 4 + random() * 4, color, 0x9bb9bc, district);
      createBuilding(blockX + 0.9, blockZ + 1.9, 3.3, 1.8, 4 + random() * 4, color, 0x9bb9bc, district);
      createTree(blockX + 0.7, blockZ - 0.9, 0.8);
    }
    continue;
  }
  if (random() < (district === 'downtown' ? 0.06 : 0.16)) { createPark(blockX, blockZ); continue; }
  for (let lotX = 0; lotX < lotsPerSide; lotX++) for (let lotZ = 0; lotZ < lotsPerSide; lotZ++) {
    const bx = blockX + (lotX + 0.5) * lotSize - blockSize / 2;
    const bz = blockZ + (lotZ + 0.5) * lotSize - blockSize / 2;
    if (random() < (district === 'suburban' ? 0.36 : 0.10)) { createTree(bx, bz, 0.75 + random() * 0.45); continue; }
    const width = lotSize * (0.48 + random() * 0.25), depth = lotSize * (0.48 + random() * 0.25);
    const height = district === 'downtown' ? 10 + Math.pow(random(), 1.7) * 27 * density :
      district === 'urban' ? 3.2 + random() * 7 : 1.4 + random() * 2.8;
    const color = getBuildingColor(district);
    if (district === 'downtown' && random() < 0.65) {
      createSetbackBuilding(bx, bz, width, depth, height, 0.2 + random() * 0.6, color, 0xb4d8d6, district);
    } else {
      createBuilding(bx, bz, width, depth, height, color, district === 'suburban' ? 0x536d76 : 0x9bb9bc, district);
    }
    if (district === 'suburban' || district === 'urban' && random() < 0.35) {
      const roofHeight = 0.55 + random() * 0.65;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 1, 1, 4),
        new THREE.MeshStandardMaterial({ color: [0x8d5845, 0x596a70, 0xa87459][Math.floor(random() * 3)] }));
      roof.scale.set(width * 0.74, roofHeight, depth * 0.74);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(bx, sidewalkHeight + height + roofHeight / 2, bz); scene.add(roof);
    }
  }
}
addLandscape(scene, layout.features, citySeed, (x, z, scale) => createTree(x, z, scale, 0.03));

createWindowInstances();
instanceBuildings(scene, spacing * 5);
windowInstances.length = 0;
createStreetLightInstances();
createRoadMarkingInstances();
for (let i = 0; i < activeStreetLightCount; i++) {
  createStreetLightSpotLight();
}
const traffic = createTraffic(
  scene,
  { citySize, spacing, offset, seed: citySeed, crosswalks, roadNodes: layout.nodes },
  (point) => cityCamera.focus(warpPoint(point), 14),
);
bendCity(scene);
const cityCamera = createCityCamera(camera, renderer.domElement, traffic, cityWidth);
const explore = document.createElement('select');
explore.setAttribute('aria-label', 'Explore the city');
explore.style.cssText = 'position:fixed;top:12px;right:12px;z-index:1001;padding:10px 14px;border-radius:8px;background:#162823ed;color:#f2f1e8;border:1px solid #ffffff35;font:14px system-ui';
explore.add(new Option('Explore the city · overview', 'overview'));
layout.features.forEach((feature, index) => explore.add(new Option(feature.name, String(index))));
explore.addEventListener('keydown', (event) => event.stopPropagation());
explore.addEventListener('change', () => {
  if (explore.value === 'overview') { cityCamera.overview(); return; }
  const feature = layout.features[Number(explore.value)];
  if (!feature) return;
  const center = warpPoint(feature), radius = Math.max(feature.rx, feature.rz);
  cityCamera.focus(center, radius * 1.3);
});
document.body.appendChild(explore);
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
