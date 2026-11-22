// Puts the painted-film character shading (Shaders/LingmuToon.shader) on the hero and the pets when they are placed,
// keeping each model's own texture. The shared material Resources/Materials/Toon (made by SceneKit) keeps the shader in
// the build. Per kind a few settings differ: furry pets get a softer edge and a stronger rim (fluff catching the light).
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    public static class Toon
    {
        static Material template;
        static readonly Dictionary<(Texture, string), Material> made = new Dictionary<(Texture, string), Material>();
        static readonly int BaseMap = Shader.PropertyToID("_BaseMap"), MainTex = Shader.PropertyToID("_MainTex");

        public static void Apply(GameObject root, string key)
        {
            if (!root) return;
            if (!template) template = Resources.Load<Material>("Materials/Toon");
            if (!template) return;
            bool pet = key.StartsWith("pet_");
            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            {
                if (r is ParticleSystemRenderer) continue;
                var mats = r.sharedMaterials;
                for (int i = 0; i < mats.Length; i++)
                {
                    var m = mats[i]; if (!m) continue;
                    var tex = m.HasProperty(BaseMap) ? m.GetTexture(BaseMap) : m.HasProperty(MainTex) ? m.GetTexture(MainTex) : null;
                    if (!made.TryGetValue((tex, key), out var t))
                    {
                        t = new Material(template) { name = "Toon " + key };
                        if (tex) t.SetTexture(BaseMap, tex);
                        if (pet) { t.SetFloat("_Soft", 0.11f); t.SetFloat("_Rim", 0.45f); t.SetFloat("_OutlineWidth", 0.0024f); }
                        made[(tex, key)] = t;
                    }
                    mats[i] = t;
                }
                r.sharedMaterials = mats;
            }
        }
    }
}
