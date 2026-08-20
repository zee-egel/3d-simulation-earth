import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { createRandom } from "./randomSeed";

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

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x87ceeb); // Set background color to sky blue

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const cameraDistance = cityWidth * 0.9; // Distance from the center of the city

camera.position.set(cameraDistance, cameraDistance, cameraDistance); // Position the camera at (cameraDistance, cameraDistance, cameraDistance)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

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

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true; // Enable damping for smoother controls

const keysPressed = new Set<string>();
const moveDirection = new THREE.Vector3();
const forwardDirection = new THREE.Vector3();
const rightDirection = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const walkSpeed = 12;
const sprintMultiplier = 2.5;

window.addEventListener("keydown", (event) => {
  keysPressed.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keysPressed.delete(event.code);
});

function updateCameraMovement(delta: number) {
  moveDirection.set(0, 0, 0);

  camera.getWorldDirection(forwardDirection);
  forwardDirection.y = 0;

  if (forwardDirection.lengthSq() === 0) return;

  forwardDirection.normalize();
  rightDirection.crossVectors(forwardDirection, worldUp).normalize();

  if (keysPressed.has("KeyW")) moveDirection.add(forwardDirection);
  if (keysPressed.has("KeyS")) moveDirection.sub(forwardDirection);

  const turnSpeed = 1.8;
  let turnAmount = 0;

  if (keysPressed.has("KeyD")) turnAmount -= turnSpeed * delta;
  if (keysPressed.has("KeyA")) turnAmount += turnSpeed * delta;

  if (turnAmount !== 0) {
    const targetOffset = controls.target.clone().sub(camera.position);
    targetOffset.applyAxisAngle(worldUp, turnAmount);
    controls.target.copy(camera.position).add(targetOffset);
    camera.lookAt(controls.target);
  }

  if (moveDirection.lengthSq() === 0) return;

  moveDirection.normalize();

  const speed =
    walkSpeed *
    (keysPressed.has("ShiftLeft") || keysPressed.has("ShiftRight")
      ? sprintMultiplier
      : 1);

  const movement = moveDirection.multiplyScalar(speed * delta);

  camera.position.add(movement);
  controls.target.add(movement);
}

const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(10, 20, 10);

scene.add(directionalLight);

const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4b6b45 }); // Forest green
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
const clock = new THREE.Timer();

ground.rotation.x = -Math.PI / 2; // Rotate the ground to be horizontal

scene.add(ground);

function animate() {
  requestAnimationFrame(animate);

  clock.update();
  const delta = clock.getDelta();
  updateDayNightCycle(delta);
  updateCameraMovement(delta);
  updateClosestStreetLights();

  controls.update(); // Update controls for damping
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

let timeOfDay = 0; // Temporarily locked to the darkest point of the cycle
const headMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8d3b5,
  emissive: 0xffd98a,
  emissiveIntensity: 0,
});

function updateDayNightCycle(_delta: number) {
  // Time progression is temporarily disabled to keep the scene fully dark.

  const sunHeight = Math.sin(timeOfDay);
  const sunDistance = 100;

  const daylight = THREE.MathUtils.clamp(sunHeight * 0.5 + 0.5, 0, 1);
  ambientLight.intensity = daylight * 0.85 + 0.15;
  directionalLight.intensity = daylight * 2;

  const dayColor = new THREE.Color(0x87ceeb);
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

const activeStreetLightCount = 24;

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
  const closestLights = [...streetLightInstances]
    .sort((a, b) => {
      const distanceA =
        (a.x - camera.position.x) ** 2 + (a.z - camera.position.z) ** 2;

      const distanceB =
        (b.x - camera.position.x) ** 2 + (b.z - camera.position.z) ** 2;

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

    light.position.set(streetLamp.x, sidewalkHeight + 2.4, streetLamp.z);

    const targetDistance = 2.5;

    target.position.set(
      streetLamp.x + Math.cos(streetLamp.rotationY) * targetDistance,
      0.1,
      streetLamp.z + Math.sin(streetLamp.rotationY) * targetDistance,
    );

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
  const geometry = new THREE.PlaneGeometry(width, depth);
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

function createBlockPlatform(x: number, z: number) {
  const geometry = new THREE.BoxGeometry(blockSize, sidewalkHeight, blockSize);
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

function createTree(x: number, z: number, scale: number) {
  const trunkGeometry = new THREE.CylinderGeometry(
    0.12 * scale,
    0.16 * scale,
    1.2 * scale,
    8,
  );
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4f2a });

  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.set(x, 0.6 * scale + sidewalkHeight, z);

  scene.add(trunk);

  const crownGeometry = new THREE.SphereGeometry(0.7 * scale, 10 * scale, 10);
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6f3f });

  const crown = new THREE.Mesh(crownGeometry, crownMaterial);
  crown.position.set(x, 1.5 * scale + sidewalkHeight, z);
  scene.add(crown);
}

function createCrosswalk(x: number, z: number, horizontal: boolean) {
  const stripeCount = 6;
  const stripeWidth = roadWidth / (stripeCount * 2 - 1);
  const stripeLength = roadWidth * 0.8; // Slightly shorter than the road width
  const stripeGap = 0.2;

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
  switch (district) {
    case "downtown":
      return 0x5f6670; // Dark gray for downtown
    case "urban":
      return 0xa19280; // Medium gray for urban
    case "suburban":
    default:
      return 0xc8b08a; // Light gray for suburban
  }
}

function isInsideIntersection(position: number) {
  for (let i = 0; i < citySize - 1; i++) {
    const blockPosition = i * spacing - offset;
    const roadPosition = blockPosition + spacing / 2;
    if (Math.abs(position - roadPosition) < roadWidth / 2) {
      return true;
    }
  }

  return false;
}

function isInsideCrosswalk(x: number, z: number, width: number, depth: number) {
  return crosswalks.some((crosswalk) => {
    const crosswalkWidth = crosswalk.horizontal ? roadWidth : roadWidth * 0.8;
    const crosswalkDepth = crosswalk.horizontal ? roadWidth * 0.8 : roadWidth;

    const overlapsX = Math.abs(x - crosswalk.x) < (width + crosswalkWidth) / 2;
    const overlapsZ = Math.abs(z - crosswalk.z) < (depth + crosswalkDepth) / 2;

    return overlapsX && overlapsZ;
  });
}

// decide crosswalk positions before road markings are rendered
for (let x = 0; x < citySize - 1; x++) {
  for (let z = 0; z < citySize - 1; z++) {
    const roadX = x * spacing - offset + spacing / 2;
    const roadZ = z * spacing - offset + spacing / 2;

    const hasCrosswalk = random() < 0.25;
    if (!hasCrosswalk) continue;

    const side = Math.floor(random() * 4);
    const crosswalkOffset = roadWidth / 2 + 1.2;

    switch (side) {
      case 0: // north
        crosswalks.push({
          x: roadX,
          z: roadZ - crosswalkOffset,
          horizontal: true,
        });
        break;
      case 1: // south
        crosswalks.push({
          x: roadX,
          z: roadZ + crosswalkOffset,
          horizontal: true,
        });
        break;
      case 2: // west
        crosswalks.push({
          x: roadX - crosswalkOffset,
          z: roadZ,
          horizontal: false,
        });
        break;
      case 3: // east
        crosswalks.push({
          x: roadX + crosswalkOffset,
          z: roadZ,
          horizontal: false,
        });
        break;
    }
  }
}

// create roads once, between each pair of city blocks
for (let i = 0; i < citySize - 1; i++) {
  const blockPosition = i * spacing - offset;
  const roadPosition = blockPosition + spacing / 2;
  const dashLength = 1.5;
  const dashGap = 1;
  const dashSpacing = dashLength + dashGap;

  createRoad(0, roadPosition, cityWidth, roadWidth);
  createRoad(roadPosition, 0, roadWidth, cityWidth);
  for (let z = -cityWidth / 2; z < cityWidth / 2; z += dashSpacing) {
    if (isInsideIntersection(z)) continue; // Skip road markings in intersections
    if (isInsideCrosswalk(roadPosition, z, 0.1, dashLength)) continue;
    createRoadMarking(roadPosition, z, 0.1, dashLength);
  }
  for (let x = -cityWidth / 2; x < cityWidth / 2; x += dashSpacing) {
    if (isInsideIntersection(x)) continue; // Skip road markings in intersections
    if (isInsideCrosswalk(x, roadPosition, dashLength, 0.1)) continue;
    createRoadMarking(x, roadPosition, dashLength, 0.1);
  }
}

// render crosswalks after road markings have been filtered around them
for (const crosswalk of crosswalks) {
  createCrosswalk(crosswalk.x, crosswalk.z, crosswalk.horizontal);
}

type District = "downtown" | "urban" | "suburban";

// loop for each block in the city grid
for (let x = 0; x < citySize; x++) {
  for (let z = 0; z < citySize; z++) {
    const blockX = x * spacing - offset;
    const blockZ = z * spacing - offset;
    createBlockPlatform(blockX, blockZ);
    const lampOffset = blockSize / 2 - 0.35; // Offset for street lights from the block edge
    const evenBlock = (x + z) % 2 === 0; // Determine if the block is even or odd based on its grid position
    if (evenBlock) {
      streetLightInstances.push({
        x: blockX - lampOffset,
        z: blockZ - lampOffset,
        rotationY: -Math.PI / 2,
      });

      streetLightInstances.push({
        x: blockX + lampOffset,
        z: blockZ + lampOffset,
        rotationY: Math.PI / 2,
      });
    } else {
      streetLightInstances.push({
        x: blockX - lampOffset,
        z: blockZ + lampOffset,
        rotationY: Math.PI,
      });

      streetLightInstances.push({
        x: blockX + lampOffset,
        z: blockZ - lampOffset,
        rotationY: 0,
      });
    }
    const distanceToCenter = Math.sqrt(blockX ** 2 + blockZ ** 2); // Calculate distance from the center of the city using Pythagorean theorem
    const maxDistance = Math.hypot(offset, offset); // Maximum distance from the center to a corner of the city also using Pythagorean theorem
    const centerFactor = 1 - distanceToCenter / maxDistance; // Calculate a factor based on distance to center (1 at center, 0 at corners)

    /**
     * downtown: high buildings, more setback buildings, dark gray, glassy, almost no parks
     * urban: mid height buildings, mix setback and normal buildings, concrete, beige, bricks, some parks
     * suburban: low height buildings, mostly normal buildings, colorful, wood, more parks
     */
    const district =
      centerFactor > 0.65
        ? "downtown"
        : centerFactor > 0.35
          ? "urban"
          : "suburban"; // Determine district type based on center factor

    const parkChance =
      district === "downtown" ? 0.02 : district === "urban" ? 0.08 : 0.18; // Chance of park based on district

    const isPark = random() < parkChance; // Determine if this block is a park based on random chance
    if (isPark) {
      createPark(blockX, blockZ);
      continue;
    }

    // loop for each lot in the block
    for (let lotX = 0; lotX < lotsPerSide; lotX++) {
      for (let lotZ = 0; lotZ < lotsPerSide; lotZ++) {
        const buildingWidth = lotSize * (0.5 + random() * 0.4); // Random width between 50% and 100% of lot size
        const buildingDepth = lotSize * (0.5 + random() * 0.4); // Random depth between 50% and 100% of lot size
        const lotOffsetX = (lotX + 0.5) * lotSize - blockSize / 2;
        const lotOffsetZ = (lotZ + 0.5) * lotSize - blockSize / 2;
        const setback = random() * 0.3 * Math.min(buildingWidth, buildingDepth); // Random setback up to 30% of the smaller dimension of the building
        const localVariation = 0.6 + random() * 0.8; // Local variation factor between 0.6 and 1.4
        let minHeight: number;
        let maxHeight: number;
        switch (district) {
          case "downtown":
            minHeight = 15 * localVariation;
            maxHeight = 35 * localVariation;
            break;
          case "urban":
            minHeight = 7 * localVariation;
            maxHeight = 18 * localVariation;
            break;
          case "suburban":
          default:
            minHeight = 3 * localVariation;
            maxHeight = 8 * localVariation;
            break;
        }

        const buildingHeight = minHeight + random() * (maxHeight - minHeight); // Random height between min and max based on district
        const buildingTypeRoll = random();
        const setbackChance =
          district === "downtown" ? 0.7 : district === "urban" ? 0.3 : 0.05; // Chance of setback building based on district

        const buildingColor = getBuildingColor(district); // Get building color based on district
        const windowColor =
          district === "downtown" || district === "suburban"
            ? 0xadd8e6
            : 0x222831;

        if (buildingTypeRoll < setbackChance) {
          createSetbackBuilding(
            blockX + lotOffsetX,
            blockZ + lotOffsetZ,
            buildingWidth,
            buildingDepth,
            buildingHeight,
            setback,
            buildingColor,
            windowColor,
            district,
          );
        } else {
          createBuilding(
            blockX + lotOffsetX,
            blockZ + lotOffsetZ,
            buildingWidth,
            buildingDepth,
            buildingHeight,
            buildingColor,
            windowColor,
            district,
          );
        }
      }
    }
  }
}

createWindowInstances();
createStreetLightInstances();
createRoadMarkingInstances();
for (let i = 0; i < activeStreetLightCount; i++) {
  createStreetLightSpotLight();
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
