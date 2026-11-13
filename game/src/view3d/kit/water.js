// Pond water for the 3D map (docs/14): one see-through surface over all pond
// basins of the island, with moving ripple lines, a soft foam line along the
// shore and small glints. The pond bed (terrain.js) shows through.
import * as THREE from 'three';
import { TIME, NOISE_GLSL } from './shared.js';
import { WATER_LEVEL } from './terrain.js';

export function buildWater(terrain) {
  const { W, fullH: H, off, waterMask, maskW: mw, maskH: mh } = terrain;      // the mask covers the padded map (terrain.js)
  const data = new Uint8Array(mw * mh * 4);
  for (let i = 0; i < mw * mh; i++) { const v = Math.round(waterMask[i] * 255); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const mask = new THREE.DataTexture(data, mw, mh, THREE.RGBAFormat);
  mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMask: { value: mask }, uTime: TIME, uLight: { value: new THREE.Color(1, 1, 1) }, uSize: { value: new THREE.Vector2(W, H) }, uOff: { value: off } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform sampler2D uMask; uniform float uTime, uOff; uniform vec3 uLight; uniform vec2 uSize; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        float m = texture2D(uMask, (vW.xz + vec2(0.0, uOff)) / uSize).r;
        if (m < 0.4) discard;
        float depth = smoothstep(0.4, 0.95, m);
        vec2 p = vW.xz * 0.05;
        float n1 = kNoise(vec3(p + vec2(uTime * 0.16, uTime * 0.11), uTime * 0.22));
        float n2 = kNoise(vec3(p * 1.9 - vec2(uTime * 0.13, -uTime * 0.09), 7.0 + uTime * 0.27));
        float line = 1.0 - smoothstep(0.0, 0.045, abs(n1 - n2));            // drifting ripple lines
        vec3 col = mix(vec3(0.50, 0.84, 0.78), vec3(0.10, 0.46, 0.62), depth);
        col += (n1 - 0.5) * 0.10;
        col += line * (0.10 + 0.16 * depth);
        float glint = step(0.8, kNoise(vec3(vW.xz * 0.33, uTime * 1.3))) * line;
        col += glint * 0.55;
        // foam along the shore, breathing in and out
        float edge = 0.47 + 0.035 * sin(uTime * 1.4 + p.x * 2.3 + p.y * 1.7);
        float foam = (1.0 - smoothstep(edge, edge + 0.07, m)) * smoothstep(0.4, 0.44, m) * (0.55 + 0.45 * n2);
        col = mix(col, vec3(0.95, 1.0, 0.98), foam * 0.6);
        float alpha = max(mix(0.34, 0.82, depth), foam * 0.7) * smoothstep(0.4, 0.45, m);
        gl_FragColor = vec4(col * uLight, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), mat);
  mesh.position.set(W / 2, WATER_LEVEL, H / 2 - off);
  mesh.renderOrder = 2;
  return { mesh, setLight: (c) => mat.uniforms.uLight.value.copy(c), dispose() { mask.dispose(); mat.dispose(); mesh.geometry.dispose(); } };
}
