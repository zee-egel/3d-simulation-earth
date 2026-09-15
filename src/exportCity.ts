import * as THREE from 'three';

export function createCitySnapshot(scene: THREE.Scene) {
  const snapshot = scene.clone();
  const batches: THREE.InstancedMesh[] = [];
  snapshot.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) batches.push(object);
  });
  const materials = new Map<string, THREE.Material>();
  const color = new THREE.Color();
  for (const batch of batches) {
    const group = new THREE.Group();
    group.copy(batch, false);
    for (let i = 0; i < batch.count; i++) {
      let material = batch.material;
      if (batch.instanceColor && material instanceof THREE.MeshStandardMaterial) {
        batch.getColorAt(i, color);
        const key = `${material.uuid}:${color.r},${color.g},${color.b}`;
        if (!materials.has(key)) {
          const tinted = material.clone();
          tinted.color.multiply(color);
          materials.set(key, tinted);
        }
        material = materials.get(key)!;
      }
      const mesh = new THREE.Mesh(batch.geometry, material);
      batch.getMatrixAt(i, mesh.matrix);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    for (const child of [...batch.children]) group.add(child);
    batch.parent!.add(group);
    batch.removeFromParent();
  }
  snapshot.updateMatrixWorld(true);
  return snapshot;
}

export async function exportCity(scene: THREE.Scene) {
  const snapshot = createCitySnapshot(scene);
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const data = await new GLTFExporter().parseAsync(snapshot, { binary: true });
  const url = URL.createObjectURL(new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'city.glb';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
