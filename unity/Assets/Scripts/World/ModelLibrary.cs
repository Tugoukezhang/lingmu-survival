// The models a scene can create while playing (expedition islands are made from a seed, so their trees, chests and
// wild pets are placed at runtime). Filled by the editor (LingmuScenes.UpdateLibrary) from Assets/Art; lives in
// Resources so it is in every build. Place() puts a model on the ground at a given size, like the scene builders do.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    [CreateAssetMenu(menuName = "Lingmu/Model Library")]
    public class ModelLibrary : ScriptableObject
    {
        [System.Serializable] public class Entry { public string key; public GameObject model; public RuntimeAnimatorController animator; }
        public List<Entry> entries = new List<Entry>();

        static ModelLibrary lib;
        public static ModelLibrary Get => lib ? lib : lib = Resources.Load<ModelLibrary>("ModelLibrary");

        public Entry Find(string key) => entries.Find(e => e.key == key);

        // a model standing on the ground at `at`, its height (or width) `size` metres, turned by `yaw` on top of its import turn
        public static GameObject Place(string key, Transform parent, Vector3 at, float size, bool fitHeight, float yaw)
        {
            var e = Get ? Get.Find(key) : null;
            if (e == null || !e.model) { var miss = new GameObject("missing " + key); miss.transform.SetParent(parent, false); miss.transform.position = at; return miss; }
            var g = Instantiate(e.model, parent);
            g.name = key;
            g.transform.rotation = Quaternion.Euler(0, yaw, 0) * e.model.transform.rotation;
            var b = Bounds(g);
            float now = fitHeight ? b.size.y : Mathf.Max(b.size.x, b.size.z);
            g.transform.localScale = e.model.transform.localScale * (size / Mathf.Max(now, 1e-4f));
            b = Bounds(g);
            g.transform.position += new Vector3(at.x - b.center.x, at.y - b.min.y, at.z - b.center.z);
            if (e.animator) { var an = g.GetComponentInChildren<Animator>(); if (an) { an.runtimeAnimatorController = e.animator; an.applyRootMotion = false; } }
            Foliage.Apply(g, Foliage.KindOf(key));   // trees and bushes sway in the wind
            if (key.StartsWith("pet_") && e.animator) SpringBones.Add(g);   // ears, tails and fur swing after the body (Tripo rigs)
            if (key.StartsWith("pet_") || key == "hero") Toon.Apply(g, key);  // painted-film shading: three tones, warm outline
            return g;
        }

        // renderer bounds (cheap; good enough for fitting at runtime)
        public static Bounds Bounds(GameObject g)
        {
            bool any = false; var bb = new Bounds(g.transform.position, Vector3.zero);
            foreach (var r in g.GetComponentsInChildren<Renderer>())
            {
                if (r is SkinnedMeshRenderer s) s.updateWhenOffscreen = true;
                if (!any) { bb = r.bounds; any = true; } else bb.Encapsulate(r.bounds);
            }
            return bb;
        }
    }
}
