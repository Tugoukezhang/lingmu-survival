// Shows the farm plots of the home island from the game state. TEMPORARY look (soil patches, sprouts, coloured
// balls for ripe crops) until the crop models of the modelling task pack arrive; only the visuals change then.
using System.Collections.Generic;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

namespace Lingmu.Game
{
    public class FarmField : MonoBehaviour
    {
        class PlotView { public GameObject soil, sprout, fruit; public Renderer soilR; }
        readonly Dictionary<string, PlotView> views = new Dictionary<string, PlotView>();
        Material soilDry, soilWet, leaf;
        readonly Dictionary<string, Material> fruitMats = new Dictionary<string, Material>();
        float next;

        static Material Mat(Color c)
        {
            var sh = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var m = new Material(sh) { color = c };
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.1f);
            return m;
        }

        void Start()
        {
            soilDry = Mat(new Color(0.40f, 0.26f, 0.15f)); soilWet = Mat(new Color(0.24f, 0.15f, 0.09f)); leaf = Mat(new Color(0.45f, 0.78f, 0.3f));
            var s = GameSession.I;
            var f = s.Layout.FarmRect;
            for (int y = f.y; y < f.y + f.h; y++)
                for (int x = f.x; x < f.x + f.w; x++)
                {
                    var at = HomeIslandLayout.TileToWorld(x, y);
                    var v = new PlotView();
                    v.soil = GameObject.CreatePrimitive(PrimitiveType.Cube); v.soil.name = $"plot {x},{y}";
                    v.soil.transform.SetParent(transform); v.soil.transform.position = at + new Vector3(0, 0.04f, 0); v.soil.transform.localScale = new Vector3(0.86f, 0.08f, 0.86f);
                    Destroy(v.soil.GetComponent<Collider>()); v.soilR = v.soil.GetComponent<Renderer>();
                    v.sprout = GameObject.CreatePrimitive(PrimitiveType.Capsule); v.sprout.transform.SetParent(transform, false);
                    Destroy(v.sprout.GetComponent<Collider>()); v.sprout.GetComponent<Renderer>().sharedMaterial = leaf;
                    v.fruit = GameObject.CreatePrimitive(PrimitiveType.Sphere); v.fruit.transform.SetParent(transform);
                    Destroy(v.fruit.GetComponent<Collider>());
                    views[Farm.PlotKey(x, y)] = v;
                }
            Refresh();
        }

        void Update() { if (Time.time >= next) { next = Time.time + 0.25f; Refresh(); } }

        void Refresh()
        {
            var s = GameSession.I.S;
            foreach (var kv in views)
            {
                var p = Farm.PlotOf(s, kv.Key); var v = kv.Value;
                v.soil.SetActive(p.tilled);
                if (!p.tilled) { v.fruit.SetActive(false); v.sprout.SetActive(false); continue; }
                v.soilR.sharedMaterial = p.watered ? soilWet : soilDry;
                bool ripe = Farm.Ripe(p);
                v.sprout.SetActive(p.crop != null && !ripe);
                v.fruit.SetActive(ripe);
                if (p.crop != null && !ripe)
                {
                    float g = 0.25f + 0.75f * p.days / Mathf.Max(1, GameData.Crops[p.crop].days);
                    v.sprout.transform.localScale = new Vector3(0.16f + 0.12f * g, 0.22f * g + 0.06f, 0.16f + 0.12f * g);
                    v.sprout.transform.position = v.soil.transform.position + new Vector3(0, 0.04f + v.sprout.transform.localScale.y, 0);
                }
                if (ripe)
                {
                    if (!fruitMats.TryGetValue(p.crop, out var m))
                    {
                        ColorUtility.TryParseHtmlString(GameData.Crops[p.crop].color ?? "#f08a3a", out var c);
                        fruitMats[p.crop] = m = Mat(c);
                    }
                    v.fruit.GetComponent<Renderer>().sharedMaterial = m;
                    v.fruit.transform.position = v.soil.transform.position + new Vector3(0, 0.22f, 0);
                    v.fruit.transform.localScale = Vector3.one * 0.38f;
                }
            }
        }
    }
}
