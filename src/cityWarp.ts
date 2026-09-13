import * as THREE from 'three';

// A smooth, invertible bend shared by roads, buildings, signals, cars, and people.
export function warpPoint(p: { x: number; z: number }) {
  return { x: p.x + 15 * Math.sin(p.z / 65) + 5 * Math.sin(p.z / 27),
    z: p.z + 12 * Math.sin(p.x / 76) };
}
export function unwarpPoint(p: { x: number; z: number }) {
  let x = p.x, z = p.z;
  for (let i = 0; i < 12; i++) {
    x = p.x - 15 * Math.sin(z / 65) - 5 * Math.sin(z / 27);
    z = p.z - 12 * Math.sin(x / 76);
  }
  return { x, z };
}
export function bendCity(scene: THREE.Scene) {
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m));
    // The rendered bend moves vertices at most 24 units; retain conservative culling bounds.
    if (object instanceof THREE.InstancedMesh) {
      object.computeBoundingSphere();
      if (object.boundingSphere) object.boundingSphere.radius += 24;
    } else {
      object.geometry.computeBoundingSphere();
      if (object.geometry.boundingSphere) object.geometry.boundingSphere.radius += 24;
    }
  });
  for (const material of materials) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `vec3 bendCityPosition(vec3 p) {
        return vec3(p.x + 15.0*sin(p.z/65.0) + 5.0*sin(p.z/27.0), p.y, p.z + 12.0*sin(p.x/76.0));
      }\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 cityPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cityPosition = instanceMatrix * cityPosition;
        #endif
        cityPosition = modelMatrix * cityPosition;
        vec4 mvPosition = viewMatrix * vec4(bendCityPosition(cityPosition.xyz), 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #if (defined(STANDARD) || defined(LAMBERT)) && !defined(FLAT_SHADED)
          vec3 cityNormal = vec3(dot(viewMatrix[0].xyz, vNormal), dot(viewMatrix[1].xyz, vNormal), dot(viewMatrix[2].xyz, vNormal));
          float dxDz = 15.0/65.0*cos(cityPosition.z/65.0) + 5.0/27.0*cos(cityPosition.z/27.0);
          float dzDx = 12.0/76.0*cos(cityPosition.x/76.0);
          float determinant = 1.0 - dxDz*dzDx;
          cityNormal = vec3((cityNormal.x-dzDx*cityNormal.z)/determinant, cityNormal.y,
            (cityNormal.z-dxDz*cityNormal.x)/determinant);
          vNormal = normalize(mat3(viewMatrix) * cityNormal);
        #endif
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        #if defined(USE_ENVMAP) || defined(DISTANCE) || defined(USE_SHADOWMAP) || defined(USE_TRANSMISSION) || NUM_SPOT_LIGHT_COORDS > 0
          worldPosition.xyz = bendCityPosition(worldPosition.xyz);
        #endif
      `);
    };
    material.customProgramCacheKey = () => 'city-bend-v2';
    material.needsUpdate = true;
  }
}
