// A chibi hero built from primitives (look test): big blue cap with two pom-poms,
// orange braids, white shirt, red overalls, brown boots. walk(t, speed) animates it.
import * as THREE from 'three';

const M = (color, rough = 0.75) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

export function makeHero() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = M(0xffd8bd), shirt = M(0xfbf6ee), red = M(0xd64b3c), boot = M(0x5a3a24, 0.6), hair = M(0xe0702a, 0.7), cap = M(0x4f8fd8, 0.65);

  // legs + boots
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.09, 0.3, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 10), red); thigh.position.y = -0.1;
    const bootM = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.06, 4, 10), boot); bootM.rotation.x = Math.PI / 2; bootM.position.set(0, -0.25, 0.03); bootM.scale.set(1, 1.2, 0.9);
    leg.add(thigh, bootM); body.add(leg); legs.push(leg);
  }
  // torso: overalls with a white shirt on top
  const pants = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.12, 6, 16), red); pants.position.y = 0.42; pants.scale.set(1, 1, 0.85);
  const shirtM = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.12, 6, 16), shirt); shirtM.position.y = 0.56; shirtM.scale.set(1, 0.9, 0.85);
  for (const s of [-1, 1]) {   // straps
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.02), red); st.position.set(s * 0.075, 0.6, -0.13); st.rotation.z = s * 0.15; body.add(st);
    const st2 = st.clone(); st2.position.z = 0.13; body.add(st2);
  }
  body.add(pants, shirtM);
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.19, 0.64, 0);
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), shirt); sleeve.scale.set(1, 1.1, 1);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.13, 4, 8), skin); fore.position.y = -0.13;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skin); hand.position.y = -0.23;
    arm.add(sleeve, fore, hand); arm.rotation.z = s * 0.25; body.add(arm); arms.push(arm);
  }
  // head
  const head = new THREE.Group(); head.position.y = 0.92; body.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), skin); face.scale.set(1, 0.95, 0.95);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.285, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), hair); back.rotation.x = -0.35; back.position.set(0, 0.01, -0.02);
  head.add(face, back);
  // braids hanging behind both ears
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075 - k * 0.006, 12, 10), hair);
      b.position.set(s * (0.25 + k * 0.012), -0.12 - k * 0.085, -0.08 + k * 0.01); b.scale.set(1, 0.85, 1);
      head.add(b);
    }
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), red); tie.position.set(s * 0.31, -0.5, -0.04); head.add(tie);
  }
  // newsboy cap: puffy crown, brim, two pom-poms
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), cap); crown.scale.set(1.08, 0.85, 1.08); crown.position.y = 0.08;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.06, 24), cap); band.position.y = 0.08;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), cap); brim.rotation.y = Math.PI; brim.position.set(0, 0.07, 0.24); brim.scale.set(1.3, 1, 0.7);
  head.add(crown, band, brim);
  for (const s of [-1, 1]) { const pom = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), cap); pom.position.set(s * 0.18, 0.3, -0.02); head.add(pom); }
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), cap); btn.position.y = 0.36; head.add(btn);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData = { body, legs, arms, head, phase: 0 };
  return root;
}

export function walkHero(hero, dt, speed) {
  const u = hero.userData;
  const moving = speed > 0.05;
  u.phase += dt * (moving ? 9 : 2);
  const s = Math.sin(u.phase), k = moving ? 1 : 0;
  u.legs[0].rotation.x = s * 0.55 * k; u.legs[1].rotation.x = -s * 0.55 * k;
  u.arms[0].rotation.x = -s * 0.5 * k; u.arms[1].rotation.x = s * 0.5 * k;
  u.body.position.y = moving ? Math.abs(Math.cos(u.phase)) * 0.035 : Math.sin(u.phase) * 0.006;
  u.head.rotation.z = moving ? s * 0.04 : 0;
}

// A dark fluffy ball pet made of fur shells (look test).
export function makeFluff() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const a = Math.random() * 0.9 + 0.1; x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 2);
  const shells = 14;
  for (let i = 0; i < shells; i++) {
    const t = i / (shells - 1);
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a211d).lerp(new THREE.Color(0x5a463c), t * 0.6), roughness: 1, alphaMap: i ? tex : null, alphaTest: i ? 0.25 + t * 0.6 : 0, transparent: false });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.26 * (1 + t * 0.22), 28, 20), m);
    s.scale.set(1, 0.88, 1);
    s.castShadow = i === 0; s.receiveShadow = true;
    g.add(s);
  }
  for (const s of [-1, 1]) {   // ears
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 1 }));
    ear.position.set(s * 0.13, 0.27, 0); ear.rotation.z = -s * 0.3; ear.castShadow = true; g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 1 }));
  tail.position.set(-0.27, 0.0, 0.05); g.add(tail);
  g.children.forEach((o) => { o.position.y += 0.24; });
  g.userData = { phase: 0 };
  return g;
}
