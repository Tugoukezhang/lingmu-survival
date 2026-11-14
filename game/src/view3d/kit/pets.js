// 3D pets and people (docs/14). Models come from assets/models/<name>.glb:
// either built in Blender by code (tools/blender/build.py — split into named
// parts: body, head, tail, earL/R, armL/R, legL/R, orb, eyeL/R) or made
// elsewhere and tidied (tools/blender/cleanup.py — one textured mesh).
// Until a model has arrived (or if there is none) the 2D art stands in.
//
// All motion is made here, without bones, so it works for both kinds:
// whole body — breathing, hopping walk with squash and stretch, leaning into
// the walk, a happy hop now and then, looking around, bowing when working,
// lunging and flinching in battle, toppling over when fainting;
// parts, when the model has them — tail, ears, arms, legs, blinking.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// texture key of the 2D sprite → [model file, size compared with the sprite]
// (evolved forms use the same model a little bigger for now; the fox's human form and the townsfolk have no model yet)
const MODELS = { player: ['player', 1.05] };
for (const id of ['fox', 'pup', 'acorn', 'shark', 'starbear', 'shadecat']) { MODELS[`pet_${id}`] = [id, 1]; MODELS[`pet_${id}_evo`] = [id, 1.1]; }
const PARTS = ['body', 'head', 'tail', 'earL', 'earR', 'armL', 'armR', 'legL', 'legR', 'orb', 'eyeL', 'eyeR'];
const DAY = { value: 1 };           // 1 by day … lower at night (how strong the fill and rim light are)

// Every material of a model bends with the body (the whole figure leans and sways like something soft);
// the fur / skin material also gets the soft fill light, the bright rim and the hit flash.
function soften(m, body) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uDay: DAY, uRoot: { value: new THREE.Vector4(0, 0, 0, 1) }, uBend: { value: new THREE.Vector2() }, uFlash: { value: 0 } });
    m.userData.shader = shader;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uRoot;\nuniform vec2 uBend;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        vec4 kW = modelMatrix * mvPosition;
        float kH = clamp((kW.y - uRoot.y) / uRoot.w, 0.0, 1.4);          // 0 at the feet … 1 at the top of the head
        kW.xz += uBend * (kH * kH * uRoot.w);
        mvPosition = viewMatrix * kW;
        gl_Position = projectionMatrix * mvPosition;`);
    if (!body) return;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDay;\nuniform float uFlash;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float kRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
        totalEmissiveRadiance += (diffuseColor.rgb * (0.2 + 0.5 * kRim) + vec3(1.0, 0.93, 0.8) * 0.16 * kRim) * uDay;
        totalEmissiveRadiance += vec3(1.0, 0.9, 0.85) * uFlash;`);
  };
  m.customProgramCacheKey = () => `pet-soft-${body}`;
  return m;
}

export function makePetKit() {
  const loader = new GLTFLoader(), sources = new Map();      // file → scene | 'loading' | null (failed)
  // flames, stars: self-lit, coloured by their vertex colours
  const glowMat = soften(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.15, 1.0) }), false);

  function source(key) {
    const def = MODELS[key];
    if (!def) return null;
    const got = sources.get(def[0]);
    if (got === undefined) {
      sources.set(def[0], 'loading');
      loader.load(`assets/models/${def[0]}.glb`, (g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          if (o.material.name.startsWith('glow')) { o.material = glowMat; return; }
          const m = o.material; m.metalness = 0;
          o.castShadow = true; o.receiveShadow = !o.name.startsWith('eye');
          if (m.map) m.map.anisotropy = 8;
          if (m.name.startsWith('eye')) { m.roughness = 0.3; m.emissiveMap = m.map; m.emissive.set(0x4a4a4a); soften(m, false); return; }   // eyes: glossy, never murky
          m.roughness = Math.max(m.roughness, 0.72);
          soften(m, true);
        });
        g.scene.userData.clips = g.animations ?? [];           // a rigged model brings its own motions (idle, walk …)
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
    const clips = src.userData.clips ?? [];
    const m = clips.length ? cloneSkinned(src) : src.clone(true);          // bones need their own copy per instance
    const parts = {};
    const g = new THREE.Group();
    const fx = { root: new THREE.Vector4(0, 0, 0, 1), bend: new THREE.Vector2(), flash: 0 };
    m.traverse((o) => {
      if (PARTS.includes(o.name)) { parts[o.name] = o; o.userData.rot = o.rotation.clone(); o.userData.pos = o.position.clone(); }
      // the materials are shared by every pet of this kind: each one hands over its own lean / flash just before it is drawn
      if (o.isMesh) o.onBeforeRender = () => {
        const sh = o.material.userData.shader;
        if (!sh) return;
        sh.uniforms.uRoot.value.copy(fx.root); sh.uniforms.uBend.value.copy(fx.bend); sh.uniforms.uFlash.value = fx.flash;
        o.material.uniformsNeedUpdate = true;
      };
    });
    g.add(m);
    g.userData = { parts, inner: m, size: MODELS[key][1], yaw: 0, walk: 0, roll: 0, seed: Math.random() * 10, fx, wp: new THREE.Vector3() };
    if (clips.length) {
      // skeleton animation: one clip standing, one walking (picked by name; first clip if nothing matches), blended by how fast it moves
      const mixer = new THREE.AnimationMixer(m), pick = (re) => clips.find((c) => re.test(c.name));
      const idle = pick(/idle|stand|breath/i) ?? clips[0], walk = pick(/walk/i) ?? pick(/run/i) ?? null;
      const act = { idle: mixer.clipAction(idle), walk: walk && walk !== idle ? mixer.clipAction(walk) : null };
      act.idle.play(); act.walk?.play();
      if (act.walk) act.walk.setEffectiveWeight(0);
      m.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });      // the bones move it outside its resting box
      g.userData.rig = { mixer, act };
    }
    return g;
  }

  // t: seconds. o: { moving 0…1, face: yaw to turn to (0 = toward the camera), squash: 1 = normal, < 1 pressed down (working),
  //   roll: lying over (radians), hurt: true while it is being hit, lunge: -1…1 push along x (attack) }
  function animate(g, t, dt, o = {}) {
    const { moving = 0, face = 0, squash = 1, roll = 0, hurt = false, lunge = 0 } = o;
    const u = g.userData, p = u.parts, s = u.seed, fx = u.fx, m = u.inner;
    u.walk += (moving - u.walk) * Math.min(1, dt * 8);
    let d = face - u.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    u.yaw += d * Math.min(1, dt * 9);
    u.roll += (roll - u.roll) * Math.min(1, dt * 7);
    const rig = u.rig;
    if (rig) {
      rig.act.idle.setEffectiveWeight(rig.act.walk ? 1 - u.walk : 1);
      rig.act.walk?.setEffectiveWeight(u.walk);
      rig.mixer.update(dt);
    }
    // with a skeleton the walk comes from the bones: no hopping and no stretching on top of it
    const w = rig?.act.walk ? 0 : u.walk, idle = (1 - u.walk) * (roll ? 0 : 1), step = t * 11 + s, air = Math.abs(Math.sin(step));
    // now and then, standing around, a little happy hop
    const cyc = (t * 0.13 + s * 0.37) % 1, happy = cyc < 0.06 ? Math.sin((cyc / 0.06) * Math.PI) * idle : 0;
    m.rotation.set(0, u.yaw + Math.sin(t * 0.5 + s) * 0.22 * idle, u.roll);                      // looks around a little when idle; topples when fainting
    m.position.y = air * 0.08 * w + happy * 0.16 - Math.abs(Math.sin(u.roll)) * 0.04;
    // squash and stretch: long in the air, short on landing, breathing when still, pressed down when working
    const sy = (1 + Math.sin(t * 2.2 + s) * 0.016 * idle + (air - 0.45) * 0.13 * w + (happy > 0 ? (happy - 0.35) * 0.1 : 0)) * Math.min(1.25, Math.max(0.7, squash));
    const sx = 1 / Math.sqrt(sy);
    m.scale.set(sx, sy, sx);
    // lean: into the walk, a slow sway when idle, a push forward when attacking, a bow when pressed down
    const fwdX = Math.sin(u.yaw), fwdZ = Math.cos(u.yaw), bow = Math.max(0, 1 - squash) * 1.6, sway = Math.sin(t * 1.3 + s) * 0.014 * idle;
    const sw = rig ? 0 : sway;                                              // (a rigged model already sways in its idle clip)
    fx.bend.set(fwdX * (0.07 * w + bow) + fwdZ * sw + lunge * 0.22, fwdZ * (0.07 * w + bow) - fwdX * sw);
    fx.flash = hurt ? 0.9 : fx.flash * Math.exp(-dt * 9);
    if (hurt) fx.bend.x += Math.sin(t * 70) * 0.03;                                              // shudder
    g.getWorldPosition(u.wp);
    fx.root.set(u.wp.x, u.wp.y, u.wp.z, g.scale.y);

    // parts (models built in Blender)
    const set = (name, rx, ry, rz) => { const q = p[name]; if (q) q.rotation.set(q.userData.rot.x + rx, q.userData.rot.y + ry, q.userData.rot.z + rz); };
    set('tail', Math.sin(t * 1.6 + s) * 0.06, 0, Math.sin(t * (2.2 + w * 6) + s) * (0.16 + w * 0.12) + happy * 0.3);
    set('head', Math.sin(t * 1.3 + s) * 0.035 + w * 0.06 - happy * 0.12, 0, Math.sin(t * 0.9 + s * 2) * 0.05);
    const twitch = Math.max(0, Math.sin(t * 0.7 + s * 3) - 0.94) * 6;                            // now and then an ear flicks
    set('earL', 0, 0, twitch * 0.5 + Math.sin(step) * 0.05 * w);
    set('earR', 0, 0, -Math.max(0, Math.sin(t * 0.6 + s * 5) - 0.94) * 3 - Math.sin(step) * 0.05 * w);
    set('legL', Math.sin(step) * 0.7 * w, 0, 0);
    set('legR', -Math.sin(step) * 0.7 * w, 0, 0);
    set('armL', -Math.sin(step) * 0.5 * w + Math.sin(t * 1.9 + s) * 0.04 - happy * 0.5, 0, 0);
    set('armR', Math.sin(step) * 0.5 * w + Math.sin(t * 2.6 + s) * 0.1 * idle - happy * 0.5, 0, 0);          // the raised paw waves a little
    const bl = (t * 0.31 + s) % 1, shut = bl > 0.965 || hurt ? 0.12 : 1;                                       // blink; eyes shut when hit
    for (const n of ['eyeL', 'eyeR']) if (p[n]) p[n].scale.y = (p[n].userData.sy ??= p[n].scale.y) * shut;      // (the model's up axis is y here)
    if (p.orb) { const q = p.orb, b = q.userData.pos; q.position.set(b.x + Math.cos(t * 1.4 + s) * 0.03, b.y + Math.sin(t * 2.3 + s) * 0.035, b.z + Math.sin(t * 1.4 + s) * 0.03); }
  }

  return { has: (key) => !!MODELS[key], ready: (key) => !!source(key), instance, animate, setDay: (k) => { DAY.value = k; } };
}
