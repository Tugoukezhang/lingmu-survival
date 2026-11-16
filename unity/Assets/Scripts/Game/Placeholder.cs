// TEMPORARY stand-ins for things that have no model yet (rocks C33/C34, the mist crystal, the lost bag, fog monsters,
// fox-fire wicks) and the red warning circles. Simple shapes in the game's colours; swap for models when they arrive.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.Game
{
    public static class Placeholder
    {
        static readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();

        static Material Lit(string key, Color c, float smooth = 0.15f, Color? emit = null)
        {
            if (mats.TryGetValue(key, out var m) && m) return m;
            // glowing ones start from the emissive template in Resources, so the emission variant is in the build
            var tpl = emit != null ? Resources.Load<Material>("Materials/LitEmissive") : null;
            m = tpl ? new Material(tpl) : new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.name = key;
            m.SetColor("_BaseColor", c); m.SetFloat("_Smoothness", smooth);
            if (emit != null) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", emit.Value); }
            return mats[key] = m;
        }

        public static Material Transparent(Color c, bool unlit = true)
        {
            var tpl = unlit ? Resources.Load<Material>("Materials/TransparentUnlit") : null;   // transparent variant guaranteed in builds
            if (tpl) { var t = new Material(tpl); t.SetColor("_BaseColor", c); return t; }
            var m = new Material(Shader.Find(unlit ? "Universal Render Pipeline/Unlit" : "Universal Render Pipeline/Lit"));
            m.SetFloat("_Surface", 1); m.SetFloat("_Blend", 0);
            m.SetOverrideTag("RenderType", "Transparent"); m.renderQueue = 3000;
            m.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha); m.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha); m.SetInt("_ZWrite", 0);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.SetColor("_BaseColor", c);
            return m;
        }

        static GameObject Prim(PrimitiveType t, Transform parent, string name, Material m)
        {
            var g = GameObject.CreatePrimitive(t); g.name = name;
            Object.Destroy(g.GetComponent<Collider>());
            g.transform.SetParent(parent, false);
            g.GetComponent<Renderer>().sharedMaterial = m;
            return g;
        }

        public static GameObject Rock(Transform parent, Vector3 at, int hash)
        {
            var root = new GameObject("rock"); root.transform.SetParent(parent, false); root.transform.position = at;
            var grey = Lit("rock", new Color(0.62f, 0.6f, 0.58f), 0.1f); var dark = Lit("rock2", new Color(0.5f, 0.49f, 0.5f), 0.1f);
            var a = Prim(PrimitiveType.Sphere, root.transform, "a", grey); a.transform.localScale = new Vector3(0.85f, 0.55f, 0.75f); a.transform.localPosition = new Vector3(0, 0.22f, 0);
            var b = Prim(PrimitiveType.Sphere, root.transform, "b", dark); b.transform.localScale = new Vector3(0.45f, 0.38f, 0.42f); b.transform.localPosition = new Vector3(0.3f, 0.15f, -0.18f);
            root.transform.rotation = Quaternion.Euler(0, hash % 360, 0);
            return root;
        }

        public static GameObject Crystal(Transform parent, Vector3 at, bool rare)
        {
            var root = new GameObject("crystal"); root.transform.SetParent(parent, false); root.transform.position = at;
            var m = Lit(rare ? "crystal-rare" : "crystal", rare ? new Color(0.75f, 0.6f, 1f) : new Color(0.55f, 0.85f, 0.95f), 0.85f, rare ? new Color(0.4f, 0.25f, 0.7f) : new Color(0.15f, 0.45f, 0.55f));
            for (int i = 0; i < 3; i++)
            {
                var c = Prim(PrimitiveType.Cube, root.transform, "shard", m);
                float h = i == 0 ? 0.8f : 0.5f;
                c.transform.localScale = new Vector3(0.22f, h, 0.22f);
                c.transform.localRotation = Quaternion.Euler(i == 0 ? 0 : 25, i * 120 + 20, i == 0 ? 0 : 15);
                c.transform.localPosition = new Vector3(i == 0 ? 0 : Mathf.Cos(i * 2.1f) * 0.18f, h * 0.45f, i == 0 ? 0 : Mathf.Sin(i * 2.1f) * 0.18f);
            }
            return root;
        }

        public static GameObject Sack(Transform parent, Vector3 at)
        {
            var root = new GameObject("lost bag"); root.transform.SetParent(parent, false); root.transform.position = at;
            var s = Prim(PrimitiveType.Sphere, root.transform, "sack", Lit("sack", new Color(0.78f, 0.6f, 0.38f), 0.1f)); s.transform.localScale = new Vector3(0.55f, 0.5f, 0.55f); s.transform.localPosition = new Vector3(0, 0.25f, 0);
            var t = Prim(PrimitiveType.Cylinder, root.transform, "tie", Lit("tie", new Color(0.85f, 0.3f, 0.25f))); t.transform.localScale = new Vector3(0.18f, 0.05f, 0.18f); t.transform.localPosition = new Vector3(0, 0.52f, 0);
            return root;
        }

        public static GameObject FogMonster(Transform parent)
        {
            var root = new GameObject("fog monster"); root.transform.SetParent(parent, false);
            var body = Prim(PrimitiveType.Capsule, root.transform, "body", Transparent(new Color(0.35f, 0.3f, 0.45f, 0.72f))); body.transform.localScale = new Vector3(0.9f, 0.7f, 0.9f);
            var eyeM = Lit("eye", new Color(1f, 0.85f, 0.3f), 0.5f, new Color(1.2f, 0.8f, 0.2f));
            foreach (var x in new[] { -0.17f, 0.17f }) { var e = Prim(PrimitiveType.Sphere, root.transform, "eye", eyeM); e.transform.localScale = Vector3.one * 0.14f; e.transform.localPosition = new Vector3(x, 0.25f, 0.4f); }
            return root;
        }

        public static GameObject Warning(Transform parent, Vector3 at, float radius)
        {
            var root = new GameObject("warning"); root.transform.SetParent(parent, false); root.transform.position = at;
            var ring = Prim(PrimitiveType.Cylinder, root.transform, "ring", Transparent(new Color(0.91f, 0.34f, 0.29f, 0.3f))); ring.transform.localScale = new Vector3(radius * 2, 0.005f, radius * 2);
            var fill = Prim(PrimitiveType.Cylinder, root.transform, "fill", Transparent(new Color(0.91f, 0.34f, 0.29f, 0.5f))); fill.transform.localScale = new Vector3(0, 0.006f, 0); fill.transform.localPosition = new Vector3(0, 0.004f, 0);
            return root;
        }

        public static void SetWarning(GameObject w, float k)
        {
            var ring = w.transform.Find("ring"); var fill = w.transform.Find("fill");
            float d = ring.localScale.x;
            fill.localScale = new Vector3(d * k, 0.006f, d * k);
        }

        public static GameObject Wick(Transform parent, Vector3 at)
        {
            var g = Prim(PrimitiveType.Sphere, parent, "foxwick", Lit("wick", new Color(1f, 0.6f, 0.3f), 0.6f, new Color(2.2f, 0.9f, 0.3f)));
            g.transform.position = at + Vector3.up * 0.6f; g.transform.localScale = Vector3.one * 0.22f;
            var l = g.AddComponent<Light>(); l.type = LightType.Point; l.color = new Color(1f, 0.6f, 0.3f); l.range = 2; l.intensity = 1.2f; l.shadows = LightShadows.None;
            return g;
        }
    }
}
