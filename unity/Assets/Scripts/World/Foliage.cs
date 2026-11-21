// Trees and bushes sway in the wind (Shaders/LingmuFoliage.shader): their imported materials are swapped at runtime for
// the foliage material with the same texture. One material per source material and kind, shared by every copy, so the
// batching stays the same. Scene trees (built by the editor) are found by name when a scene starts; trees made while
// playing (expedition islands) are swapped by ModelLibrary.Place.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    public static class Foliage
    {
        struct Kind { public float wind, flutter, speed; }
        static readonly Dictionary<string, Kind> Kinds = new Dictionary<string, Kind>
        {
            { "tree", new Kind { wind = 0.16f, flutter = 0.028f, speed = 1.05f } },
            { "pine", new Kind { wind = 0.11f, flutter = 0.012f, speed = 0.9f } },
            { "bush", new Kind { wind = 0.06f, flutter = 0.018f, speed = 1.3f } },
            { "shrub", new Kind { wind = 0.07f, flutter = 0.02f, speed = 1.5f } },
        };
        // model names in the scenes (prefab instances) and the ModelLibrary keys
        static readonly Dictionary<string, string> Names = new Dictionary<string, string>
        {
            { "C38-C40_tree_round", "tree" }, { "tree", "tree" }, { "C39_tree_b", "pine" }, { "pine", "pine" },
            { "C41_bush", "bush" }, { "bush", "bush" }, { "C40_shrub_leafy", "shrub" }, { "shrub", "shrub" },
        };

        static Material template;
        static readonly Dictionary<(Material, string), Material> made = new Dictionary<(Material, string), Material>();
        static readonly int BaseMap = Shader.PropertyToID("_BaseMap"), MainTex = Shader.PropertyToID("_MainTex"), BaseColor = Shader.PropertyToID("_BaseColor"), Color = Shader.PropertyToID("_Color");

        public static string KindOf(string name) => name != null && Names.TryGetValue(name, out var k) ? k : null;

        public static void ApplyScene()
        {
            foreach (var t in Object.FindObjectsByType<Transform>(FindObjectsInactive.Exclude, FindObjectsSortMode.None))
            {
                var kind = KindOf(t.name);
                if (kind != null) Apply(t.gameObject, kind);
            }
        }

        public static void Apply(GameObject root, string kind)
        {
            if (!root || kind == null || !Kinds.TryGetValue(kind, out var k)) return;
            if (!template) template = Resources.Load<Material>("Materials/Foliage");
            if (!template) return;
            foreach (var r in root.GetComponentsInChildren<MeshRenderer>())
            {
                var mats = r.sharedMaterials;
                bool changed = false;
                for (int i = 0; i < mats.Length; i++)
                {
                    var src = mats[i];
                    if (!src || src.shader == template.shader) continue;
                    if (!made.TryGetValue((src, kind), out var m) || !m)
                    {
                        m = new Material(template) { name = src.name + " (wind)" };
                        var tex = src.HasProperty(BaseMap) ? src.GetTexture(BaseMap) : src.HasProperty(MainTex) ? src.GetTexture(MainTex) : null;
                        if (tex) { m.SetTexture(BaseMap, tex); if (src.HasProperty(BaseMap)) { m.SetTextureScale(BaseMap, src.GetTextureScale(BaseMap)); m.SetTextureOffset(BaseMap, src.GetTextureOffset(BaseMap)); } }
                        m.SetColor(BaseColor, src.HasProperty(BaseColor) ? src.GetColor(BaseColor) : src.HasProperty(Color) ? src.GetColor(Color) : UnityEngine.Color.white);
                        // the sway grows from the foot of the model to its top (measured on the first copy)
                        var b = r.bounds;
                        m.SetFloat("_Height", Mathf.Max(0.3f, b.size.y));
                        m.SetFloat("_Base", Mathf.Max(0, r.transform.position.y - b.min.y));
                        m.SetFloat("_Wind", k.wind); m.SetFloat("_Flutter", k.flutter); m.SetFloat("_WindSpeed", k.speed);
                        m.enableInstancing = true;
                        made[(src, kind)] = m;
                    }
                    mats[i] = m; changed = true;
                }
                if (changed) r.sharedMaterials = mats;
            }
        }
    }
}
