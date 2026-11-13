// Shared bits of the 3D map kit (docs/14): time uniform, seeded random,
// the "ghost" (see-through) shader patch and small GLSL helpers.
import * as THREE from 'three';

export const TIME = { value: 0 };          // seconds; advanced by World3D every frame

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const hex = (h) => new THREE.Color(h);

// Vertex colours for a whole geometry.
export function paint(geo, color) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), k = color.isColor ? color : hex(color);
  for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Things between the camera and the player are drawn as a screen-door pattern
// (1 pixel in 4), so the player stays visible without sorting transparent meshes.
export const GHOST_GLSL = 'if (mod(floor(gl_FragCoord.x) + 2.0 * floor(gl_FragCoord.y), 4.0) > 0.5) discard;';
export function patchGhost(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `void main() {\n  ${GHOST_GLSL}`);
}

// value noise in GLSL (object-space mottling for rocks, cliffs)
export const NOISE_GLSL = `
float kHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kHash(i), kHash(i + vec3(1,0,0)), f.x), mix(kHash(i + vec3(0,1,0)), kHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(kHash(i + vec3(0,0,1)), kHash(i + vec3(1,0,1)), f.x), mix(kHash(i + vec3(0,1,1)), kHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;
