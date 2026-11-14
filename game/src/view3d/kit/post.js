// Post-processing of the 3D map (docs/14): MSAA render, soft bloom, then one
// pass that does the "look": tilt-shift blur (sharp band around the player,
// soft near and far), warm highlights / green-teal shadows, saturation,
// vignette. Tone mapping and sRGB happen in the output pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const LookShader = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) }, uFocus: { value: 0.5 }, uBand: { value: 0.27 }, uBlur: { value: 1.7 },
    uSat: { value: 1.12 }, uWarm: { value: 0.04 }, uVig: { value: 0.26 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uFocus, uBand, uBlur, uSat, uWarm, uVig, uNight; varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocus);
      float amt = smoothstep(uBand, uBand + 0.34, d) * uBlur;
      vec4 c = texture2D(tDiffuse, vUv);
      if (amt > 0.05) {
        vec3 acc = c.rgb; float w = 1.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.399963, r = sqrt(float(i) + 0.5) / 3.46;
          vec2 o = vec2(cos(a), sin(a)) * r * amt * 4.0 * uTexel;
          acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
        }
        c.rgb = acc / w;
      }
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      // warm lights, slightly green-teal shadows (the storybook grade)
      float hi = smoothstep(0.25, 0.9, l);
      c.rgb *= mix(vec3(0.96, 1.01, 1.03), vec3(1.0 + uWarm, 1.0, 1.0 - uWarm), hi);
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - (uVig + uNight * 0.2) * smoothstep(0.38, 0.9, length(q * vec2(1.2, 1.0)));
      gl_FragColor = c;
    }`,
};

export function makePost(renderer, scene, camera, { width, height, quality = 'high' }) {
  const target = new THREE.WebGLRenderTarget(width, height, { samples: quality === 'low' ? 0 : 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.2, 0.55, 0.9);
  if (quality !== 'low') composer.addPass(bloom);
  const look = new ShaderPass(LookShader);
  look.uniforms.uTexel.value.set(1 / (width * renderer.getPixelRatio()), 1 / (height * renderer.getPixelRatio()));
  if (quality === 'low') look.uniforms.uBlur.value = 0;
  composer.addPass(look);
  composer.addPass(new OutputPass());
  // which scene is drawn (the world, or the battle stage)
  const setScene = (s, c) => { renderPass.scene = s; renderPass.camera = c; };
  // drawing size in real pixels (the page tells us how big the picture is on screen)
  const setSize = (w, h) => { composer.setPixelRatio(1); composer.setSize(w, h); look.uniforms.uTexel.value.set(1 / w, 1 / h); look.uniforms.uBlur.value = quality === 'low' ? 0 : 1.25 * Math.max(1, h / 540); };
  return { composer, bloom, look, setScene, setSize, render: (dt) => composer.render(dt), dispose: () => { target.dispose(); composer.dispose?.(); } };
}
