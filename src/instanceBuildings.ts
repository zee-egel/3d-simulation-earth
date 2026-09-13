import * as THREE from 'three';

// Batch the city's static primitives before adding animated traffic and streetlights.
export function instanceBuildings(scene: THREE.Scene, chunkSize: number) {
  scene.updateMatrixWorld(true);
  const chunks = new Map<string, {
    geometry: THREE.BufferGeometry;
    meshes: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; scale: THREE.Vector3 }[];
  }>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh ||
        !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const geometry = object.geometry;
    const scale = new THREE.Vector3(1, 1, 1);
    let shape: object;
    if (geometry instanceof THREE.BoxGeometry) {
      const p = geometry.parameters;
      scale.set(p.width, p.height, p.depth);
      shape = { ...p, width: 1, height: 1, depth: 1 };
    } else if (geometry instanceof THREE.PlaneGeometry) {
      const p = geometry.parameters;
      scale.set(p.width, p.height, 1);
      shape = { ...p, width: 1, height: 1 };
    } else if (geometry instanceof THREE.SphereGeometry) {
      const p = geometry.parameters;
      scale.setScalar(p.radius);
      shape = { ...p, radius: 1, widthSegments: Math.max(3, Math.floor(p.widthSegments)), heightSegments: Math.max(2, Math.floor(p.heightSegments)) };
    } else if (geometry instanceof THREE.CylinderGeometry) {
      const p = geometry.parameters;
      scale.set(p.radiusBottom, p.height, p.radiusBottom);
      shape = { ...p, radiusBottom: 1, radiusTop: Number((p.radiusTop / p.radiusBottom).toFixed(12)), height: 1 };
    } else return;
    const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
    const key = `${Math.floor(position.x / chunkSize)},${Math.floor(position.z / chunkSize)}:${geometry.type}:${JSON.stringify(shape)}`;
    if (!chunks.has(key)) chunks.set(key, {
      geometry: geometry.clone().scale(1 / scale.x, 1 / scale.y, 1 / scale.z), meshes: [],
    });
    chunks.get(key)!.meshes.push({ mesh: object, scale });
  });

  // ponytail: current static materials differ only in color; split batches if finishes change.
  const material = new THREE.MeshStandardMaterial();
  const size = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const oldMaterials = new Set<THREE.Material>();
  for (const { meshes, geometry } of chunks.values()) {
    const batch = new THREE.InstancedMesh(geometry, material, meshes.length);
    meshes.forEach(({ mesh, scale }, index) => {
      size.makeScale(scale.x, scale.y, scale.z);
      matrix.multiplyMatrices(mesh.matrixWorld, size);
      batch.setMatrixAt(index, matrix);
      batch.setColorAt(index, mesh.material.color);
      mesh.removeFromParent();
      mesh.geometry.dispose();
      oldMaterials.add(mesh.material);
    });
    batch.computeBoundingSphere();
    scene.add(batch);
  }
  oldMaterials.forEach((oldMaterial) => oldMaterial.dispose());
}
