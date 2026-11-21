// Particle effects built when the game starts, so a scene only stores this small component:
//   fire      flames licking up from the base, embers drifting up, a little smoke, and a flickering light
//             (its own, or a light already under it; when that light is switched off the fire stops)
//   fountain  water thrown up from the spout and falling back into the basin, splashes on the water, spreading ripples
//   motes     tiny glowing specks drifting in the air around the player (docs/参考资料/拆解/负责人参考3: 光点), a few more
//             in the evening; the emitter follows its parent (the player), the specks stay where they are
// The emitter's position is the effect's base (the fire's bed / the basin's water surface).
using UnityEngine;
using UnityEngine.Rendering;

namespace Lingmu.World
{
    public class FxEmitter : MonoBehaviour
    {
        public string kind = "fire";
        public float size = 0.5f;        // fire: flame height (m); fountain: basin radius (m)
        public float spout = 1f;         // fountain: spout height above the water (m)
        public bool addLight = true;     // fire: make a flickering light (otherwise flicker the one already under it)

        Light lit; float baseIntensity, seed;
        ParticleSystem[] fireSystems = new ParticleSystem[0];

        void Start()
        {
            seed = Random.value * 100;
            if (kind == "fire") Fire(); else if (kind == "fountain") Fountain(); else if (kind == "motes") Motes();
        }

        static Material Mat(string n) => Resources.Load<Material>("Materials/" + n);

        ParticleSystem Make(string name, Material mat, Vector3 at, ParticleSystemRenderMode mode = ParticleSystemRenderMode.Billboard)
        {
            var go = new GameObject(name); go.transform.SetParent(transform, false); go.transform.localPosition = at;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = mat; r.renderMode = mode; r.shadowCastingMode = ShadowCastingMode.Off; r.receiveShadows = false;
            r.sortingFudge = mode == ParticleSystemRenderMode.HorizontalBillboard ? 10 : 0;
            var m = ps.main; m.simulationSpace = ParticleSystemSimulationSpace.World; m.scalingMode = ParticleSystemScalingMode.Hierarchy; m.playOnAwake = true;
            return ps;
        }

        static Gradient Fade(params (float t, Color c)[] keys)
        {
            var g = new Gradient();
            var ck = new GradientColorKey[keys.Length]; var ak = new GradientAlphaKey[keys.Length];
            for (int i = 0; i < keys.Length; i++) { ck[i] = new GradientColorKey(keys[i].c, keys[i].t); ak[i] = new GradientAlphaKey(keys[i].c.a, keys[i].t); }
            g.SetKeys(ck, ak); return g;
        }

        static ParticleSystem.MinMaxCurve Shrink(float from, float to) => new ParticleSystem.MinMaxCurve(1, AnimationCurve.EaseInOut(0, from, 1, to));

        // ---------- motes ----------
        ParticleSystem motes;
        void Motes()
        {
            motes = Make("motes", Mat("FxAdd"), new Vector3(0, 1.6f, 0));
            var m = motes.main;
            m.startLifetime = new ParticleSystem.MinMaxCurve(6f, 10f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.02f, 0.12f);
            m.startSize = new ParticleSystem.MinMaxCurve(0.035f, 0.08f); m.maxParticles = 160;
            m.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.95f, 0.75f, 0.9f), new Color(0.92f, 1f, 0.85f, 0.75f));
            var em = motes.emission; em.rateOverTime = 7;
            var sh = motes.shape; sh.shapeType = ParticleSystemShapeType.Box; sh.scale = new Vector3(18, 3.5f, 18);
            var col = motes.colorOverLifetime; col.enabled = true;
            col.color = Fade((0, new Color(1, 1, 1, 0)), (0.2f, Color.white), (0.8f, Color.white), (1, new Color(1, 1, 1, 0)));
            var noise = motes.noise; noise.enabled = true; noise.strength = 0.25f; noise.frequency = 0.25f; noise.scrollSpeed = 0.1f;
            var vel = motes.velocityOverLifetime; vel.enabled = true; vel.y = new ParticleSystem.MinMaxCurve(0.02f, 0.08f); vel.x = new ParticleSystem.MinMaxCurve(0.03f, 0.1f); vel.z = new ParticleSystem.MinMaxCurve(-0.02f, 0.04f);
            motes.Play();
        }

        void LateUpdate()
        {
            if (!motes) return;
            var s = Game.GameSession.I;
            if (s == null || s.S == null) return;
            int c = s.S.clock;
            float evening = c >= 16 * 60 && c < 20 * 60 ? 1 : 0;   // golden hour: more specks; in the fog the expedition's own effects take over
            var em = motes.emission; em.rateOverTime = Mathf.Lerp(7, 16, evening);
        }

        // ---------- fire ----------
        void Fire()
        {
            float s = size;
            var flames = Make("flames", Mat("FxFlame"), Vector3.zero);
            var m = flames.main;
            m.startLifetime = new ParticleSystem.MinMaxCurve(0.4f, 0.7f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.55f * s, 1.0f * s);
            m.startSize3D = true; m.startSizeX = new ParticleSystem.MinMaxCurve(0.22f * s, 0.38f * s); m.startSizeY = new ParticleSystem.MinMaxCurve(0.42f * s, 0.7f * s); m.startSizeZ = 1;
            m.startRotation = new ParticleSystem.MinMaxCurve(-0.12f, 0.12f); m.maxParticles = 80;
            var em = flames.emission; em.rateOverTime = 34;
            var sh = flames.shape; sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 5; sh.radius = 0.16f * s; sh.rotation = new Vector3(-90, 0, 0);
            var col = flames.colorOverLifetime; col.enabled = true;
            col.color = Fade((0, new Color(1f, 0.9f, 0.55f, 0.0f)), (0.12f, new Color(1f, 0.82f, 0.4f, 0.95f)), (0.55f, new Color(1f, 0.45f, 0.12f, 0.7f)), (1, new Color(0.7f, 0.12f, 0.05f, 0)));
            var sz = flames.sizeOverLifetime; sz.enabled = true; sz.size = Shrink(1f, 0.35f);
            var nz = flames.noise; nz.enabled = true; nz.strength = 0.3f * s; nz.frequency = 1.6f; nz.scrollSpeed = 1.2f;
            var r = flames.GetComponent<ParticleSystemRenderer>(); r.renderMode = ParticleSystemRenderMode.Billboard;

            var embers = Make("embers", Mat("FxAdd"), new Vector3(0, 0.15f * s, 0));
            m = embers.main;
            m.startLifetime = new ParticleSystem.MinMaxCurve(1.0f, 1.9f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.5f * s, 1.3f * s);
            m.startSize = new ParticleSystem.MinMaxCurve(0.025f * s, 0.06f * s); m.maxParticles = 40;
            em = embers.emission; em.rateOverTime = 8;
            sh = embers.shape; sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 18; sh.radius = 0.15f * s; sh.rotation = new Vector3(-90, 0, 0);
            col = embers.colorOverLifetime; col.enabled = true;
            col.color = Fade((0, new Color(1f, 0.8f, 0.35f, 1)), (0.6f, new Color(1f, 0.45f, 0.1f, 0.8f)), (1, new Color(0.8f, 0.2f, 0.05f, 0)));
            nz = embers.noise; nz.enabled = true; nz.strength = 0.6f * s; nz.frequency = 0.9f;

            var smoke = Make("smoke", Mat("FxAlpha"), new Vector3(0, 0.75f * s, 0));
            m = smoke.main;
            m.startLifetime = new ParticleSystem.MinMaxCurve(2.4f, 3.4f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.25f * s, 0.45f * s);
            m.startSize = new ParticleSystem.MinMaxCurve(0.35f * s, 0.55f * s); m.startRotation = new ParticleSystem.MinMaxCurve(0, 6.28f); m.maxParticles = 20;
            em = smoke.emission; em.rateOverTime = 3;
            sh = smoke.shape; sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 8; sh.radius = 0.08f * s; sh.rotation = new Vector3(-90, 0, 0);
            col = smoke.colorOverLifetime; col.enabled = true;
            col.color = Fade((0, new Color(0.45f, 0.42f, 0.4f, 0)), (0.2f, new Color(0.42f, 0.4f, 0.38f, 0.22f)), (1, new Color(0.6f, 0.6f, 0.62f, 0)));
            sz = smoke.sizeOverLifetime; sz.enabled = true; sz.size = Shrink(0.6f, 2.2f);
            var rot = smoke.rotationOverLifetime; rot.enabled = true; rot.z = new ParticleSystem.MinMaxCurve(-0.4f, 0.4f);

            fireSystems = new[] { flames, embers, smoke };
            foreach (var ps in fireSystems) ps.Play();

            lit = GetComponentInChildren<Light>();
            if (!lit && addLight)
            {
                lit = new GameObject("fire light").AddComponent<Light>(); lit.transform.SetParent(transform, false); lit.transform.localPosition = new Vector3(0, 0.6f * s, 0);
                lit.type = LightType.Point; lit.color = new Color(1f, 0.62f, 0.3f); lit.range = 7f * s; lit.intensity = 1.6f; lit.shadows = LightShadows.None;
            }
            if (lit) baseIntensity = lit.intensity;
        }

        void Update()
        {
            if (kind != "fire" || !lit) return;
            bool burning = lit.enabled;
            if (burning) lit.intensity = baseIntensity * (0.62f + 0.38f * Mathf.PerlinNoise(Time.time * 6.5f, seed) + 0.22f * (Mathf.PerlinNoise(Time.time * 2.1f, seed + 7) - 0.5f));
            foreach (var ps in fireSystems) { var e = ps.emission; if (e.enabled != burning) e.enabled = burning; }
        }

        // ---------- fountain ----------
        void Fountain()
        {
            float R = size, H = spout;
            var water = Make("water", Mat("FxAlpha"), new Vector3(0, H, 0));
            var m = water.main;
            float v = Mathf.Sqrt(2 * 9.81f * 0.35f * Mathf.Max(H, 0.3f));        // rises a third of the spout height above it
            m.startLifetime = new ParticleSystem.MinMaxCurve(0.9f, 1.25f); m.startSpeed = new ParticleSystem.MinMaxCurve(v * 0.8f, v);
            m.startSize = new ParticleSystem.MinMaxCurve(0.045f, 0.1f); m.gravityModifier = 1f; m.maxParticles = 400;
            m.startColor = new Color(0.86f, 0.95f, 1f, 0.8f);
            var em = water.emission; em.rateOverTime = 110;
            var sh = water.shape; sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 32; sh.radius = 0.06f; sh.rotation = new Vector3(-90, 0, 0);
            var col = water.colorOverLifetime; col.enabled = true;
            col.color = Fade((0, new Color(1, 1, 1, 0.9f)), (0.8f, new Color(1, 1, 1, 0.8f)), (1, new Color(1, 1, 1, 0)));

            var splash = Make("splash", Mat("FxAlpha"), new Vector3(0, 0.02f, 0));
            m = splash.main;
            m.startLifetime = new ParticleSystem.MinMaxCurve(0.25f, 0.45f); m.startSpeed = new ParticleSystem.MinMaxCurve(0.6f, 1.2f);
            m.startSize = new ParticleSystem.MinMaxCurve(0.035f, 0.08f); m.gravityModifier = 1.2f; m.maxParticles = 120;
            m.startColor = new Color(0.9f, 0.97f, 1f, 0.75f);
            em = splash.emission; em.rateOverTime = 45;
            sh = splash.shape; sh.shapeType = ParticleSystemShapeType.Circle; sh.radius = R * 0.55f; sh.radiusThickness = 0.35f; sh.rotation = new Vector3(-90, 0, 0);
            sh.randomDirectionAmount = 0.2f;

            var ripples = Make("ripples", Mat("FxRing"), new Vector3(0, 0.03f, 0), ParticleSystemRenderMode.HorizontalBillboard);
            m = ripples.main;
            m.startLifetime = new ParticleSystem.MinMaxCurve(1.1f, 1.6f); m.startSpeed = 0; m.startSize = new ParticleSystem.MinMaxCurve(0.25f, 0.45f); m.maxParticles = 30;
            m.startColor = new Color(0.92f, 0.98f, 1f, 0.6f);
            em = ripples.emission; em.rateOverTime = 7;
            sh = ripples.shape; sh.shapeType = ParticleSystemShapeType.Circle; sh.radius = R * 0.6f; sh.rotation = new Vector3(-90, 0, 0);
            var sz = ripples.sizeOverLifetime; sz.enabled = true; sz.size = Shrink(0.4f, 2.4f);
            col = ripples.colorOverLifetime; col.enabled = true;
            col.color = Fade((0, new Color(1, 1, 1, 0)), (0.15f, new Color(1, 1, 1, 0.7f)), (1, new Color(1, 1, 1, 0)));

            water.Play(); splash.Play(); ripples.Play();
        }
    }
}
