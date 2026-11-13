// Grass for the 3D map (docs/14): tens of thousands of real blades, instanced
// in chunks. Each blade takes its colour from the ground under it (so it melts
// into the terrain), is darker at the root and lighter at the tip, is lit like
// the ground (normal = up) and sways in the wind.
import * as THREE from 'three';
import { TIME, rng } from './shared.js';

function bladeGeometry() {
  // tapered, slightly bent blade: 5 vertices, 3 triangles; uv.y = height 0…1
  const w = 0.5, pos = [], uv = [], col = [];
  const pts = [[-w, 0, 0, 0], [w, 0, 0, 0], [-w * 0.72, 0.5, 0.07, 0.5], [w * 0.72, 0.5, 0.07, 0.5], [0, 1, 0.26, 1]];
  for (const [x, y, z, t] of pts) {
    pos.push(x, y, z); uv.push(x + 0.5, t);
    const k = 0.52 + 0.7 * t;                 // root dark → tip light
    col.push(k * 0.92, k, k * 0.86);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  g.computeVertexNormals();
  return g;
}

export function grassMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 kRoot = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float kT = uv.y * uv.y;
          float kSway = sin(uTime * 1.7 + kRoot.x * 0.021 + kRoot.z * 0.017) * 0.6 + sin(uTime * 0.8 + kRoot.x * 0.006 - kRoot.z * 0.004) * 0.9;
          transformed.x += kSway * 0.16 * kT;
          transformed.z += kSway * 0.07 * kT;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;');
  };
  return m;
}

// terrain: { W, H, isGrass, colorAt }; avoid(x, y) → true where grass must not grow (farm, paths …)
export function buildGrass(terrain, { step = 6, chunk = 384, bladeH = 15, bladeW = 5.5, seed = 3, avoid = () => false } = {}) {
  const rand = rng(seed);
  const geo = bladeGeometry(), mat = grassMaterial();
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let total = 0;
  for (let cy = 0; cy < terrain.H; cy += chunk) for (let cx = 0; cx < terrain.W; cx += chunk) {
    const mats = [], cols = [];
    for (let y = cy; y < cy + chunk; y += step) for (let x = cx; x < cx + chunk; x += step) {
      const px = x + rand() * step, py = y + rand() * step;
      if (!terrain.isGrass(px, py) || avoid(px, py)) { rand(); continue; }
      const h = bladeH * (0.65 + rand() * 0.8);
      e.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
      m4.compose(p.set(px, 0, py), q.setFromEuler(e), s.set(bladeW * (0.8 + rand() * 0.5), h, bladeW));
      mats.push(m4.clone());
      terrain.colorAt(px, py, c);
      // a little brighter and yellower than the ground so the blades read as lit tips
      c.offsetHSL(0.012 * (rand() - 0.3), -0.04, -0.02 + rand() * 0.06);
      cols.push(c.r, c.g, c.b);
    }
    if (!mats.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols), 3);
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    total += mats.length;
  }
  return { group, count: total, dispose() { geo.dispose(); mat.dispose(); group.children.forEach((m) => m.dispose?.()); } };
}
