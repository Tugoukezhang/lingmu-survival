// 3D look test (docs/14): a forest path built to match the style sample
// docs/参考资料/风格示例/05_游戏内HUD.jpg — low camera behind the hero, giant
// leaves and daisies, rounded sandy boulders, clover ground, warm sun, soft
// contact shadows (GTAO), bloom, tilt-shift and colour grading.
// Open game/look3d.html; WASD / arrows walk. ?shot=1 freezes the hero for screenshots.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { rng, rockGeometry, bigLeafPlant, leafTexture, daisyGeometry, cloverGeometry, tuftGeometry, smallFlowerGeometry } from './nature.js';
import { makeHero, walkHero, makeFluff } from './hero.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const QUALITY = params.get('q') ?? 'high';   // high | low (no AO / tilt-shift)
const rand = rng(20261112);
const noise = new SimplexNoise({ random: rng(7) });

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5f9a36);
scene.fog = new THREE.Fog(0x9fcf62, 24, 60);
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);

// ---------- path and ground ----------
const pathCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.2, 0, 9), new THREE.Vector3(0.4, 0, 4.5), new THREE.Vector3(-0.3, 0, 1), new THREE.Vector3(0.2, 0, -2.2),
  new THREE.Vector3(1.4, 0, -5), new THREE.Vector3(0.9, 0, -8.5), new THREE.Vector3(-0.6, 0, -13),
]);
const pathPts = pathCurve.getSpacedPoints(240);
function pathDist(x, z) {
  let best = 1e9;
  for (const p of pathPts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
function groundY(x, z) {
  const hills = 0.28 * noise.noise(x * 0.12, z * 0.12) + 0.08 * noise.noise(x * 0.5, z * 0.5);
  const terrace = 0.55 * smooth(-5.5, -7.5, z) + 0.5 * smooth(2.6, 4.6, Math.abs(x)) * smooth(-1, -4, z);
  const p = pathDist(x, z);
  return (hills + terrace) * (0.35 + 0.65 * smooth(0.6, 2.2, p));
}
{
  const g = new THREE.PlaneGeometry(44, 44, 220, 220); g.rotateX(-Math.PI / 2); g.translate(0, 0, -4);
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(0x86c33c), grassB = new THREE.Color(0x6aae2e), grassC = new THREE.Color(0xa6d64e);
  const dirt = new THREE.Color(0xd9a466), dirtEdge = new THREE.Color(0xb98a52), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundY(x, z));
    const n1 = noise.noise(x * 0.35, z * 0.35), n2 = noise.noise(x * 1.7 + 3, z * 1.7);
    c.copy(grassA).lerp(grassB, Math.max(0, n1) * 0.8).lerp(grassC, Math.max(0, -n1) * 0.5 + Math.max(0, n2) * 0.15);
    const p = pathDist(x, z) + n2 * 0.12;
    if (p < 1.15) c.lerp(dirtEdge, smooth(1.15, 0.85, p)).lerp(dirt, smooth(0.9, 0.55, p));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  // fine grass speckle on top of the vertex colours
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d'); x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 190 + Math.random() * 65; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 2 + Math.random() * 4); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(26, 26); tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- props ----------
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
const rocks = [];
function rock(x, z, w, h, d, ry = 0, sink = 0.12) {
  const m = new THREE.Mesh(rockGeometry(rand, { w, h, d }), rockMat);
  m.position.set(x, groundY(x, z) - sink, z); m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true; scene.add(m); rocks.push({ x, z, r: Math.max(w, d) * 0.55 });
}
rock(-2.7, -0.6, 3.4, 1.55, 2.6, 0.3);
rock(-0.2, -5.6, 3.3, 1.5, 2.2, -0.15);
rock(3.1, -3.4, 3.2, 1.3, 2.4, 0.4);
rock(4.4, -8.6, 3.8, 1.6, 2.6, 0.1);
rock(-3.6, 3.4, 2.6, 1.7, 2.2, -0.4);
rock(3.4, 0.9, 2.1, 0.9, 1.7, 0.8);
rock(-1.2, -10.5, 2.4, 1.2, 2, 0.5);
rock(0.9, 3.2, 1.0, 0.25, 0.8, 0.2, 0.15);   // flat stepping stones on the path
rock(0.1, 0.6, 0.9, 0.2, 0.7, -0.5, 0.15);

const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), side: THREE.DoubleSide, roughness: 0.62 });
const plantVariants = [0, 1, 2, 3, 4].map((i) => bigLeafPlant(rng(100 + i), { size: 1.25 + i * 0.12, n: 6 + (i % 3) }));
const plantSpots = [
  [-4.2, 0.6, 1.5], [-4.6, -2.6, 1.35], [-5.4, 2.8, 1.6], [-3.4, -4.4, 1.1], [4.7, 1.4, 1.5], [4.3, -1.7, 1.25], [5.6, 4.2, 1.7], [3.6, 4.4, 1.4],
  [-2.2, -7.8, 1.2], [2.6, -6.3, 1.0], [-4.4, -9.6, 1.5], [-6.2, -6.5, 1.6], [6.4, -5.2, 1.4], [1.8, -11.6, 1.4], [-3.0, -12.4, 1.6], [5.6, -11.5, 1.7],
  [-6.4, -1.2, 1.7], [6.8, -0.4, 1.6], [-1.6, 6.8, 1.3], [2.8, 7.4, 1.5],
];
for (const [i, [x, z, s]] of plantSpots.entries()) {
  const m = new THREE.Mesh(plantVariants[i % plantVariants.length], leafMat);
  m.position.set(x, groundY(x, z) - 0.05, z); m.rotation.y = rand() * 6.28; m.scale.setScalar(s);
  m.castShadow = m.receiveShadow = true; scene.add(m);
}
{
  const wall = rng(55);
  for (let i = 0; i < 46; i++) {
    const side = i < 26 ? 'back' : i % 2 ? 'left' : 'right';
    const x = side === 'back' ? -10 + (i / 26) * 20 + (wall() - 0.5) : (side === 'left' ? -7.5 : 7.5) + (wall() - 0.5) * 1.5;
    const z = side === 'back' ? -14 - wall() * 3 : -11 + wall() * 16;
    const m = new THREE.Mesh(plantVariants[i % plantVariants.length], leafMat);
    m.position.set(x, groundY(x, z) - 0.05, z); m.rotation.y = wall() * 6.28; m.scale.setScalar(1.8 + wall() * 1.2);
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
}
const daisyMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 });
const daisySpots = [[-0.6, -4.2, 1.9], [0.4, -4.6, 2.2], [1.3, -4.0, 1.7], [-1.4, -4.8, 1.6], [0.9, -5.2, 2.0], [-0.2, -5.0, 2.4], [2.0, -4.6, 1.5],
  [-2.4, -9.0, 1.9], [-1.2, -9.4, 2.2], [3.4, -10.4, 1.8], [-3.8, -6.8, 1.5]];
for (const [x, z, h] of daisySpots) {
  const m = new THREE.Mesh(daisyGeometry(rand, { h, head: 0.3 + h * 0.07 }), daisyMat);
  m.position.set(x, groundY(x, z) - 0.02, z); m.rotation.y = (rand() - 0.5) * 0.8;
  m.castShadow = m.receiveShadow = true; scene.add(m);
}

// striped tent (top right) and a clay pot on the ledge
{
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const x = cv.getContext('2d');
  for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#f6ece2' : '#d9545a'; x.fillRect(i * 32, 0, 32, 64); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 2.6, 4.2, 32, 1, true), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }));
  tent.position.set(6.4, groundY(6.4, -7.2) + 2.0, -7.2); tent.castShadow = tent.receiveShadow = true; scene.add(tent);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a2b24, roughness: 1 }));
  door.position.set(5.0, groundY(5, -6) + 0.05, -5.9); door.rotation.y = -0.6; scene.add(door);
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t2 = i / 12; pts.push(new THREE.Vector2(0.55 + 0.45 * Math.sin(Math.PI * (0.15 + t2 * 0.75)), t2 * 1.3)); }
  const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshStandardMaterial({ color: 0xc5603d, roughness: 0.8 }));
  pot.position.set(2.6, groundY(2.6, -8.6) + 0.9, -8.6); pot.castShadow = pot.receiveShadow = true; scene.add(pot);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 3.2, 14), new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.95 }));
  log.rotation.z = Math.PI / 2; log.rotation.y = 0.5; log.position.set(-5.4, groundY(-5.4, -4.8) + 0.3, -4.8); log.castShadow = true; scene.add(log);
}

// ---------- ground cover (instanced) ----------
function scatter(geo, mat, count, opts) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let n = 0, tries = 0;
  while (n < count && tries < count * 20) {
    tries++;
    const x = (rand() - 0.5) * opts.w, z = opts.z0 + (rand() - 0.5) * opts.d;
    if (pathDist(x, z) < opts.path) continue;
    if (rocks.some((r) => (r.x - x) ** 2 + (r.z - z) ** 2 < (r.r * 0.8) ** 2)) continue;
    if (opts.clump && noise.noise(x * opts.clump, z * opts.clump) < opts.clumpCut) continue;
    const sc = opts.s0 + rand() * (opts.s1 - opts.s0);
    p.set(x, groundY(x, z), z); q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3)); s.setScalar(sc);
    mesh.setMatrixAt(n, m.compose(p, q, s));
    c.setHSL(0, 0, 0.85 + rand() * 0.3); mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n; mesh.receiveShadow = true; mesh.castShadow = !!opts.shadow;
  scene.add(mesh);
  return mesh;
}
const coverMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 });
const area = { w: 18, d: 26, z0: -3 };
scatter(cloverGeometry(), coverMat, 11000, { ...area, path: 0.95, s0: 0.9, s1: 1.9 });
scatter(tuftGeometry(rng(3)), coverMat, 2600, { ...area, path: 0.85, s0: 0.8, s1: 1.4, clump: 0.6, clumpCut: 0.05 });
scatter(smallFlowerGeometry(0xfdfbf2), coverMat, 520, { ...area, path: 0.9, s0: 0.9, s1: 1.5, clump: 0.4, clumpCut: 0.1, shadow: false });
scatter(smallFlowerGeometry(0xf3a6bd), coverMat, 160, { ...area, path: 0.9, s0: 0.9, s1: 1.4, clump: 0.5, clumpCut: 0.35 });
scatter(smallFlowerGeometry(0xf6c33a), coverMat, 160, { ...area, path: 0.9, s0: 0.9, s1: 1.4, clump: 0.5, clumpCut: 0.35 });

// ---------- hero and pet ----------
const hero = makeHero(); scene.add(hero);
let pet = makeFluff(); scene.add(pet);
// ?pet=<file> loads game/assets/models/<file>.glb (an AI image-to-3D model) instead of the fluff ball
const PET_MODEL = params.get('pet');
const PET_HEIGHT = Number(params.get('petH')) || 0.8;   // metres; the hero is about 1.2
let petModelInfo = PET_MODEL ? { status: 'loading', file: PET_MODEL } : null;
if (PET_MODEL) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath('vendor/three/addons/libs/draco/gltf/'); loader.setDRACOLoader(draco);
  loader.load(`assets/models/${PET_MODEL}.glb`, (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const s = PET_HEIGHT / Math.max(0.001, size.y);
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    model.scale.setScalar(s);
    let tris = 0;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      for (const m of [].concat(o.material)) if (m.map) m.map.anisotropy = 8;
    });
    const holder = new THREE.Group(); holder.add(model);
    holder.position.copy(pet.position);
    scene.remove(pet); pet = holder; scene.add(pet);
    pet.userData.model = true;
    petModelInfo = { status: 'ok', file: PET_MODEL, tris: Math.round(tris), size: size.toArray().map((v) => +v.toFixed(3)), animations: gltf.animations.length };
  }, undefined, (e) => { petModelInfo = { status: 'error', file: PET_MODEL, error: String(e?.message ?? e) }; });
}
pet.traverse((o) => { if (o.isMesh) o.castShadow = true; });
let heroT = 0.36;                           // position along the path (0 … 1) when walking automatically
const heroPos = pathCurve.getPointAt(heroT);
hero.position.set(heroPos.x, groundY(heroPos.x, heroPos.z), heroPos.z);
hero.rotation.y = Math.PI;                  // walking away from the camera
pet.position.set(hero.position.x + 0.25, 0, hero.position.z + 1.55);

// ---------- light ----------
const hemi = new THREE.HemisphereLight(0xe2f2ff, 0x6f9e3c, 1.05); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6b8, 4.1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xc8e4ff, 0.45); scene.add(fill);

// ---------- post-processing ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (QUALITY === 'high') {
  gtao = new GTAOPass(scene, camera, 960, 540);
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.16, 0.5, 0.92);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.1 }, warm: { value: 0.045 }, vig: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, warm, vig; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, sat); c.r *= 1.0 + warm; c.b *= 1.0 - warm;
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vig * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = c; }`,
});
composer.addPass(grade);
let tiltH = null, tiltV = null;
if (QUALITY === 'high') {
  tiltH = new ShaderPass(HorizontalTiltShiftShader); tiltV = new ShaderPass(VerticalTiltShiftShader);
  composer.addPass(tiltH); composer.addPass(tiltV);
}
composer.addPass(new OutputPass());
const smaa = new SMAAPass(960, 540); composer.addPass(smaa);

function resize() {
  const w = window.innerWidth, h = window.innerHeight, ww = Math.min(w, h * 16 / 9), hh = ww * 9 / 16;
  renderer.setSize(ww, hh); composer.setSize(ww, hh);
  canvas.style.left = `${(w - ww) / 2}px`; canvas.style.top = `${(h - hh) / 2}px`;
  camera.aspect = ww / hh; camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio();
  if (tiltH) { tiltH.uniforms.h.value = 1.6 / (ww * pr); tiltH.uniforms.r.value = 0.42; tiltV.uniforms.v.value = 1.6 / (hh * pr); tiltV.uniforms.r.value = 0.42; }
}
window.addEventListener('resize', resize); resize();

// ---------- input ----------
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// ---------- loop ----------
const camTarget = new THREE.Vector3();
let last = performance.now(), frames = 0, fpsT = last, fps = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const mv = new THREE.Vector3((keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft')), 0, (keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup')));
  let speed = 0;
  if (mv.lengthSq() > 0) {
    mv.normalize(); speed = 2.6;
    hero.position.x += mv.x * speed * dt; hero.position.z += mv.z * speed * dt;
    hero.rotation.y = Math.atan2(mv.x, mv.z);
  } else if (!SHOT && params.has('auto')) {
    heroT = Math.min(0.95, heroT + dt * 0.012); const p = pathCurve.getPointAt(heroT), p2 = pathCurve.getPointAt(Math.min(1, heroT + 0.01));
    hero.position.x = p.x; hero.position.z = p.z; hero.rotation.y = Math.atan2(p2.x - p.x, p2.z - p.z); speed = 1.5;
  }
  hero.position.y = groundY(hero.position.x, hero.position.z);
  walkHero(hero, SHOT ? 0.0 : dt, SHOT ? 1 : speed);
  if (SHOT) { const u = hero.userData; u.phase = 0.9; walkHero(hero, 0, 1); }
  // pet trots behind
  const want = new THREE.Vector3(hero.position.x + 0.25, 0, hero.position.z + 1.55);
  pet.position.lerp(want, Math.min(1, dt * 2.5));
  const step = want.clone().sub(pet.position);
  pet.position.y = groundY(pet.position.x, pet.position.z) + Math.abs(Math.sin(now / 160)) * 0.04;
  if (pet.userData.model && step.lengthSq() > 0.0004) pet.rotation.y = Math.atan2(step.x, step.z);   // face where it trots
  // camera: low, behind the hero
  camTarget.lerp(hero.position, SHOT ? 1 : Math.min(1, dt * 4));
  camera.position.set(camTarget.x + 0.1, camTarget.y + 4.0, camTarget.z + 6.0);
  camera.lookAt(camTarget.x, camTarget.y + 0.55, camTarget.z - 2.0);
  sun.position.set(camTarget.x + 7, 12, camTarget.z - 6); sun.target.position.copy(camTarget);
  fill.position.set(camTarget.x - 6, 5, camTarget.z + 8);
  composer.render(dt);
  frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  window.__look = { ready: true, fps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pet: petModelInfo };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
