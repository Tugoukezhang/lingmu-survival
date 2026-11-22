// The moment the tool lands on the thing the hero works on (owner 11-22: "跟交互的石头也好木头也好都很割裂"):
// the thing shakes (a tree sways and sheds leaves, a rock jolts), chips / soil / water fly, and the sound and a small
// camera jolt land on that beat (GameSession times it to the action clip). A resource that is used up does not vanish
// when the button is pressed any more: a tree topples away from the hero and fades, a rock or crystal bursts.
using UnityEngine;
using UnityEngine.Rendering;

namespace Lingmu.World
{
    public static class Impact
    {
        // which effect an action makes; null = none
        public static string KindOf(string verb) => verb switch
        {
            "砍树" or "开路" => "wood",
            "敲石头" => "stone",
            "挖雾晶" => "crystal",
            "开垦" or "播种" => "dirt",
            "浇水" => "water",
            "摘浆果" or "割草" or "收获" => "leaf",
            _ => null,
        };

        public static void Hit(GameObject target, Vector3 at, string kind, bool breaks, Vector3 hero)
        {
            if (kind == null) return;
            if (target)
            {
                var b = Bounds(target);
                at = new Vector3(b.center.x, Mathf.Min(b.min.y + 0.55f, b.center.y), b.center.z) + (hero - b.center).WithY(0).normalized * Mathf.Min(b.extents.x, 0.35f);
                if (kind == "wood") Burst(new Vector3(b.center.x, b.min.y + b.size.y * 0.72f, b.center.z), "leaves", b.extents.x * 0.8f);
                var r = target.GetComponent<HitReaction>() ?? target.AddComponent<HitReaction>();
                r.Init(kind, breaks, hero);
            }
            Burst(at, kind, 0.08f);
            if (kind is "wood" or "stone" or "crystal") Player.OrbitCamera.Kick(breaks ? 0.06f : 0.035f);
        }

        static Bounds Bounds(GameObject g)
        {
            var rs = g.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(g.transform.position + Vector3.up * 0.5f, Vector3.one);
            var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds); return b;
        }

        static Vector3 WithY(this Vector3 v, float y) { v.y = y; return v; }

        // a one-shot spray of small bits; colours and weight by kind
        static void Burst(Vector3 at, string kind, float radius)
        {
            var go = new GameObject("impact " + kind); go.transform.position = at;
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var rend = go.GetComponent<ParticleSystemRenderer>();
            rend.sharedMaterial = Resources.Load<Material>("Materials/FxAlpha"); rend.shadowCastingMode = ShadowCastingMode.Off; rend.receiveShadows = false;
            var m = ps.main;
            m.loop = false; m.duration = 0.2f; m.simulationSpace = ParticleSystemSimulationSpace.World; m.playOnAwake = false; m.maxParticles = 60;
            m.startRotation = new ParticleSystem.MinMaxCurve(0, Mathf.PI * 2);
            Color a, b; int count; float speedLo, speedHi, sizeLo, sizeHi, life, gravity;
            switch (kind)
            {
                case "wood": a = new Color(0.78f, 0.55f, 0.3f); b = new Color(0.95f, 0.8f, 0.55f); count = 16; speedLo = 1.6f; speedHi = 3.2f; sizeLo = 0.035f; sizeHi = 0.08f; life = 0.7f; gravity = 1.3f; break;
                case "stone": a = new Color(0.55f, 0.55f, 0.58f); b = new Color(0.82f, 0.8f, 0.76f); count = 18; speedLo = 1.8f; speedHi = 3.6f; sizeLo = 0.03f; sizeHi = 0.07f; life = 0.6f; gravity = 1.6f; break;
                case "crystal": a = new Color(0.55f, 0.75f, 1f); b = new Color(0.9f, 0.97f, 1f); count = 20; speedLo = 1.4f; speedHi = 3.0f; sizeLo = 0.025f; sizeHi = 0.06f; life = 0.8f; gravity = 0.9f; break;
                case "dirt": a = new Color(0.45f, 0.31f, 0.2f); b = new Color(0.62f, 0.46f, 0.3f); count = 18; speedLo = 1.0f; speedHi = 2.4f; sizeLo = 0.035f; sizeHi = 0.075f; life = 0.6f; gravity = 1.5f; break;
                case "water": a = new Color(0.55f, 0.8f, 1f, 0.9f); b = new Color(0.85f, 0.95f, 1f, 0.9f); count = 22; speedLo = 0.6f; speedHi = 1.6f; sizeLo = 0.025f; sizeHi = 0.05f; life = 0.55f; gravity = 1.2f; break;
                case "leaves": a = new Color(0.45f, 0.7f, 0.25f); b = new Color(0.75f, 0.85f, 0.35f); count = 10; speedLo = 0.2f; speedHi = 0.7f; sizeLo = 0.05f; sizeHi = 0.09f; life = 1.8f; gravity = 0.12f; break;
                default: a = new Color(0.5f, 0.75f, 0.3f); b = new Color(0.85f, 0.9f, 0.45f); count = 12; speedLo = 0.8f; speedHi = 1.8f; sizeLo = 0.035f; sizeHi = 0.06f; life = 0.7f; gravity = 0.8f; break;
            }
            m.startColor = new ParticleSystem.MinMaxGradient(a, b);
            m.startSpeed = new ParticleSystem.MinMaxCurve(speedLo, speedHi);
            m.startSize = new ParticleSystem.MinMaxCurve(sizeLo, sizeHi);
            m.startLifetime = new ParticleSystem.MinMaxCurve(life * 0.7f, life);
            m.gravityModifier = gravity;
            var em = ps.emission; em.rateOverTime = 0; em.SetBursts(new[] { new ParticleSystem.Burst(0, (short)count) });
            var sh = ps.shape; sh.enabled = true;
            if (kind == "leaves") { sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = Mathf.Max(0.3f, radius); }
            else if (kind == "water") { sh.shapeType = ParticleSystemShapeType.Cone; sh.angle = 25; sh.radius = 0.05f; go.transform.rotation = Quaternion.Euler(-60, 0, 0); }
            else { sh.shapeType = ParticleSystemShapeType.Hemisphere; sh.radius = radius; go.transform.rotation = Quaternion.Euler(-90, 0, 0); }
            var rot = ps.rotationOverLifetime; rot.enabled = true; rot.z = new ParticleSystem.MinMaxCurve(-6f, 6f);
            var size = ps.sizeOverLifetime; size.enabled = true; size.size = new ParticleSystem.MinMaxCurve(1, AnimationCurve.EaseInOut(0, 1, 1, 0.2f));
            if (kind == "leaves") { var vel = ps.velocityOverLifetime; vel.enabled = true; vel.x = new ParticleSystem.MinMaxCurve(-0.4f, 0.4f); vel.z = new ParticleSystem.MinMaxCurve(-0.4f, 0.4f); vel.y = new ParticleSystem.MinMaxCurve(-0.05f, 0.05f); }
            ps.Play();
            Object.Destroy(go, life + 1f);
        }
    }

    // how the thing reacts: a decaying shake (trees sway about their base, rocks jolt and squash), or — when used up — a
    // tree topples away from the hero and sinks away, a rock squashes and pops
    public class HitReaction : MonoBehaviour
    {
        string kind; bool breaks; float t;
        Quaternion baseRot; Vector3 basePos, baseScale, axis;
        bool started;

        public void Init(string k, bool b, Vector3 hero)
        {
            if (!started) { baseRot = transform.rotation; basePos = transform.position; baseScale = transform.localScale; started = true; }
            kind = k; breaks = breaks || b; t = 0;
            var away = transform.position - hero; away.y = 0;
            if (away.sqrMagnitude < 1e-4f) away = Vector3.forward;
            axis = Vector3.Cross(Vector3.up, away.normalized);       // tipping over this axis leans the top away from the hero
        }

        void Update()
        {
            t += Time.deltaTime;
            bool tree = kind == "wood";
            if (!breaks)
            {
                float k = Mathf.Exp(-t * 5.5f) * Mathf.Sin(t * 26f);
                if (tree) transform.rotation = Quaternion.AngleAxis(k * 4.5f, axis) * baseRot;
                else
                {
                    transform.localScale = baseScale * (1 - 0.07f * Mathf.Abs(k));
                    transform.position = basePos + new Vector3(Mathf.Sin(t * 61f), 0, Mathf.Cos(t * 53f)) * 0.02f * Mathf.Exp(-t * 7f);
                }
                if (t > 0.8f) { transform.rotation = baseRot; transform.position = basePos; transform.localScale = baseScale; Destroy(this); }
                return;
            }
            if (tree)
            {
                // a short shiver, then falls away from the hero (gathering speed), bounces once, sinks into the ground
                float fall = t < 0.15f ? 0 : Mathf.Clamp01((t - 0.15f) / 0.75f);
                float angle = 82f * fall * fall;
                if (fall >= 1) angle = 82f - 6f * Mathf.Exp(-(t - 0.9f) * 6f) * Mathf.Abs(Mathf.Sin((t - 0.9f) * 14f));
                transform.rotation = Quaternion.AngleAxis(angle, axis) * baseRot;
                if (t > 1.3f) { float s = Mathf.Clamp01(1 - (t - 1.3f) / 0.5f); transform.localScale = baseScale * Mathf.Max(0.001f, s); transform.position = basePos + Vector3.down * (1 - s) * 0.3f; }
                if (t > 1.85f) Destroy(gameObject);
            }
            else
            {
                float s = t < 0.12f ? 1 - 0.18f * (t / 0.12f) : Mathf.Max(0, 0.82f * (1 - (t - 0.12f) / 0.22f));
                transform.localScale = new Vector3(baseScale.x * (1 + (1 - s) * 0.3f), baseScale.y * s, baseScale.z * (1 + (1 - s) * 0.3f));
                if (t > 0.36f) Destroy(gameObject);
            }
        }
    }
}
