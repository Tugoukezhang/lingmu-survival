// 3D pets and people (docs/14): models made in Blender by code
// (tools/blender/build.py → assets/models/<name>.glb), loaded when first
// needed. Until a model has arrived (or if there is none) the 2D art stands in.
// The models are split into named parts — body, head, tail, earL/R, armL/R,
// legL/R, orb — and animated here: breathing, tail and ears, a hopping walk.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// texture key of the 2D sprite → [model file, size compared with the sprite]
// (evolved forms use the same model a little bigger for now; the fox's human form and the townsfolk have no model yet)
const MODELS = { player: ['player', 1.05] };
for (const id of ['fox', 'pup', 'acorn', 'shark', 'starbear', 'shadecat']) { MODELS[`pet_${id}`] = [id, 1]; MODELS[`pet_${id}_evo`] = [id, 1.1]; }
const PARTS = ['body', 'head', 'tail', 'earL', 'earR', 'armL', 'armR', 'legL', 'legR', 'orb', 'eyeL', 'eyeR'];
const DAY = { value: 1 };           // 1 by day … lower at night (how strong the fill and rim light are)

export function makePetKit() {
  const loader = new GLTFLoader(), sources = new Map();      // file → scene | 'loading' | null (failed)
  // flames, stars: self-lit, coloured by their vertex colours
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.15, 1.0) });

  function source(key) {
    const def = MODELS[key];
    if (!def) return null;
    const got = sources.get(def[0]);
    if (got === undefined) {
      sources.set(def[0], 'loading');
      loader.load(`assets/models/${def[0]}.glb`, (g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          if (o.material.name.startsWith('glow')) o.material = glowMat;
          else {
            o.castShadow = true; o.receiveShadow = !o.name.startsWith('eye');
            const m = o.material; m.metalness = 0;
            if (m.map) { m.roughness = 0.3; m.emissiveMap = m.map; m.emissive.set(0x4a4a4a); m.map.anisotropy = 8; return; }      // eyes: glossy, never murky
            m.roughness = Math.max(m.roughness, 0.72);
            // toy-like shading: shadows keep their colour (light seems to pass through the fluff) and the outline catches the light
            m.onBeforeCompile = (shader) => {
              shader.uniforms.uDay = DAY;
              shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDay;')
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                  float kRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
                  totalEmissiveRadiance += (diffuseColor.rgb * (0.2 + 0.5 * kRim) + vec3(1.0, 0.93, 0.8) * 0.16 * kRim) * uDay;`);
            };
            m.customProgramCacheKey = () => 'pet-soft';
          }
        });
        sources.set(def[0], g.scene);
      }, undefined, () => sources.set(def[0], null));
      return null;
    }
    return got === 'loading' ? null : got;
  }

  // a new instance for one sprite, or null while the model is not there
  function instance(key) {
    const src = source(key);
    if (!src) return null;
    const m = src.clone(true);
    const parts = {};
    m.traverse((o) => { if (PARTS.includes(o.name)) { parts[o.name] = o; o.userData.rot = o.rotation.clone(); o.userData.pos = o.position.clone(); } });
    const g = new THREE.Group();
    g.add(m);
    g.userData = { parts, inner: m, size: MODELS[key][1], yaw: 0, walk: 0, seed: Math.random() * 10 };
    return g;
  }

  // t: seconds. moving: 0 … 1 (how much it is walking). face: yaw to turn to (radians, 0 = toward the camera).
  function animate(g, t, dt, moving, face) {
    const u = g.userData, p = u.parts, s = u.seed;
    u.walk += (moving - u.walk) * Math.min(1, dt * 8);
    let d = face - u.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    u.yaw += d * Math.min(1, dt * 9);
    u.inner.rotation.y = u.yaw;
    const w = u.walk, step = t * 11 + s;
    u.inner.position.y = Math.abs(Math.sin(step)) * 0.07 * w;                     // little hops
    u.inner.scale.set(1, 1 + Math.sin(t * 2.2 + s) * 0.012 * (1 - w), 1);         // breathing
    const set = (name, rx, ry, rz) => { const o = p[name]; if (o) o.rotation.set(o.userData.rot.x + rx, o.userData.rot.y + ry, o.userData.rot.z + rz); };
    set('tail', Math.sin(t * 1.6 + s) * 0.06, 0, Math.sin(t * (2.2 + w * 6) + s) * (0.16 + w * 0.12));
    set('head', Math.sin(t * 1.3 + s) * 0.035 + w * 0.06, 0, Math.sin(t * 0.9 + s * 2) * 0.05);
    const twitch = Math.max(0, Math.sin(t * 0.7 + s * 3) - 0.94) * 6;             // now and then an ear flicks
    set('earL', 0, 0, twitch * 0.5 + Math.sin(step) * 0.05 * w);
    set('earR', 0, 0, -Math.max(0, Math.sin(t * 0.6 + s * 5) - 0.94) * 3 - Math.sin(step) * 0.05 * w);
    set('legL', Math.sin(step) * 0.7 * w, 0, 0);
    set('legR', -Math.sin(step) * 0.7 * w, 0, 0);
    set('armL', -Math.sin(step) * 0.5 * w + Math.sin(t * 1.9 + s) * 0.04, 0, 0);
    set('armR', Math.sin(step) * 0.5 * w + Math.sin(t * 2.6 + s) * 0.1 * (1 - w), 0, 0);       // the raised paw waves a little
    // blink: both eyes close for a moment every few seconds
    const bl = (t * 0.31 + s) % 1, shut = bl > 0.965 ? 0.12 : 1;
    for (const n of ['eyeL', 'eyeR']) if (p[n]) p[n].scale.y = (p[n].userData.sy ??= p[n].scale.y) * shut;      // (the model's up axis is y here)
    if (p.orb) { const o = p.orb, b = o.userData.pos; o.position.set(b.x + Math.cos(t * 1.4 + s) * 0.03, b.y + Math.sin(t * 2.3 + s) * 0.035, b.z + Math.sin(t * 1.4 + s) * 0.03); }
  }

  return { has: (key) => !!MODELS[key], ready: (key) => !!source(key), instance, animate, setDay: (k) => { DAY.value = k; } };
}
