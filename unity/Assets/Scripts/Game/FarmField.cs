// Shows the farm plots of the home island from the game state:
//  - a tilled plot is a mound of earth with three furrows (darker and a little shiny once watered)
//  - a crop grows through three stages of leaves that sway in the wind, built from leaf cards per crop:
//    carrot (feathery thin tops), strawberry (low and bushy), sunflower (stalk with broad leaves), starwheat (a clump
//    of blades turning gold), pumpkin (big leaves spreading low)
//  - when ripe the produce shows: a carrot's orange shoulder, red strawberries, a sunflower head, golden ears, a pumpkin
// Meshes are made once per crop and stage and shared by all plots. Materials come from Resources/Materials.
using System.Collections.Generic;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

namespace Lingmu.Game
{
    public class FarmField : MonoBehaviour
    {
        class PlotView { public Transform root; public MeshRenderer soil, leaves, produce; public MeshFilter leafMesh, produceMesh; public string shown = "?"; }   // "?": nothing applied yet
        readonly Dictionary<string, PlotView> views = new Dictionary<string, PlotView>();
        readonly Dictionary<string, (Mesh mesh, Material mat)> plantCache = new Dictionary<string, (Mesh, Material)>();
        readonly Dictionary<string, Mesh> produceCache = new Dictionary<string, Mesh>();
        Material soilDry, soilWet, leafBroad, leafThin, head, ear, produceMat;
        Mesh soilMesh;
        MaterialPropertyBlock mpb;
        float next;

        static Material Tpl(string n) => Resources.Load<Material>("Materials/" + n);

        void Start()
        {
            soilDry = Tpl("SoilDry"); soilWet = Tpl("SoilWet"); leafBroad = Tpl("CropLeaf"); leafThin = Tpl("CropLeafThin");
            head = Tpl("CropHead"); ear = Tpl("CropEar"); produceMat = Tpl("Produce");
            mpb = new MaterialPropertyBlock();
            soilMesh = SoilMesh();
            var home = FindAnyObjectByType<HomeArea>();
            var L = home.Layout;
            foreach (var r in new[] { L.FarmRect, L.ExpandRect })
                for (int y = r.y; y < r.y + r.h; y++)
                    for (int x = r.x; x < r.x + r.w; x++)
                    {
                        var v = new PlotView { root = new GameObject($"plot {x},{y}").transform };
                        v.root.SetParent(transform); v.root.position = HomeIslandLayout.TileToWorld(x, y);
                        v.root.rotation = Quaternion.Euler(0, ((x * 7 + y * 13) % 4) * 3f - 4.5f, 0);   // not quite in a grid: hand-dug
                        v.soil = Part(v.root, "soil", soilMesh, soilDry, out _);
                        v.leaves = Part(v.root, "leaves", null, leafBroad, out v.leafMesh);
                        v.produce = Part(v.root, "produce", null, produceMat, out v.produceMesh);
                        views[Farm.PlotKey(x, y)] = v;
                    }
            Refresh();
        }

        static MeshRenderer Part(Transform root, string name, Mesh mesh, Material mat, out MeshFilter mf)
        {
            var go = new GameObject(name); go.transform.SetParent(root, false);
            if (name != "soil") go.transform.localScale = Vector3.one * 1.35f;      // plants read better a bit larger than life from the game's camera
            mf = go.AddComponent<MeshFilter>(); mf.sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mat;
            r.shadowCastingMode = name == "soil" ? UnityEngine.Rendering.ShadowCastingMode.Off : UnityEngine.Rendering.ShadowCastingMode.On;
            return r;
        }

        void Update() { if (Time.time >= next) { next = Time.time + 0.25f; Refresh(); } }

        void Refresh()
        {
            var s = GameSession.I.S;
            foreach (var kv in views)
            {
                var p = Farm.PlotOf(s, kv.Key); var v = kv.Value;
                v.soil.gameObject.SetActive(p.tilled);
                if (!p.tilled) { v.leaves.gameObject.SetActive(false); v.produce.gameObject.SetActive(false); v.shown = "?"; continue; }
                v.soil.sharedMaterial = p.watered ? soilWet : soilDry;
                string key = null; bool ripe = false;
                if (p.crop != null)
                {
                    ripe = Farm.Ripe(p);
                    float g = p.days / (float)Mathf.Max(1, GameData.Crops[p.crop].days);
                    int stage = ripe ? 2 : g < 0.34f ? 0 : g < 0.67f ? 1 : 2;
                    key = $"{p.crop}:{stage}:{(ripe ? 1 : 0)}";
                }
                if (key == v.shown) continue;
                v.shown = key;
                v.leaves.gameObject.SetActive(key != null);
                v.produce.gameObject.SetActive(ripe);
                if (key == null) continue;
                var parts = key.Split(':');
                var (mesh, mat) = Plant(parts[0], int.Parse(parts[1]));
                v.leafMesh.sharedMesh = mesh; v.leaves.sharedMaterial = mat;
                mpb.Clear(); if (parts[0] == "starwheat" && ripe) mpb.SetColor("_Color", new Color(1.25f, 1.05f, 0.55f)); v.leaves.SetPropertyBlock(mpb);   // ripe starwheat turns gold
                if (ripe)
                {
                    v.produceMesh.sharedMesh = Produce(parts[0]);
                    v.produce.sharedMaterial = parts[0] == "sunflower" ? head : parts[0] == "starwheat" ? ear : produceMat;
                    mpb.Clear();
                    if (v.produce.sharedMaterial == produceMat)
                    {
                        ColorUtility.TryParseHtmlString(GameData.Crops[parts[0]].color ?? "#f08a3a", out var c);
                        mpb.SetColor("_BaseColor", c);
                    }
                    v.produce.SetPropertyBlock(mpb);
                }
            }
        }

        // ---------- meshes ----------
        static Mesh SoilMesh()
        {
            // 0.88 m square mound: three furrows running east-west, edges rounded down into the ground
            const int n = 18; const float size = 0.88f;
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            for (int j = 0; j <= n; j++)
                for (int i = 0; i <= n; i++)
                {
                    float u = i / (float)n, w = j / (float)n;
                    float edge = Mathf.Clamp01(Mathf.Min(Mathf.Min(u, 1 - u), Mathf.Min(w, 1 - w)) / 0.14f);
                    edge = edge * edge * (3 - 2 * edge);
                    float ridge = 0.5f + 0.5f * Mathf.Cos(w * Mathf.PI * 2 * 3);       // three ridges across
                    float h = edge * (0.05f + 0.035f * ridge) + Mathf.PerlinNoise(u * 9 + 3, w * 9) * 0.008f;
                    v.Add(new Vector3((u - 0.5f) * size, h, (w - 0.5f) * size)); uv.Add(new Vector2(u * 0.9f, w * 0.9f));
                }
            for (int j = 0; j < n; j++)
                for (int i = 0; i < n; i++)
                {
                    int a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
                    tri.AddRange(new[] { a, c, b, b, c, d });
                }
            var m = new Mesh { name = "soil mound" }; m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(tri, 0);
            m.RecalculateNormals(); m.RecalculateTangents(); m.RecalculateBounds();
            return m;
        }

        // one leaf card: rises from `at`, leaning out towards `yaw` by `tilt` degrees and curling `bend` more at the tip
        static void Card(List<Vector3> v, List<Vector2> uv, List<int> tri, Vector3 at, float yaw, float tilt, float bend, float width, float height)
        {
            var outDir = Quaternion.Euler(0, yaw, 0) * Vector3.forward; var side = Vector3.Cross(Vector3.up, outDir);
            var p = at; int i0 = v.Count;
            for (int k = 0; k <= 2; k++)
            {
                if (k > 0) { float a = (tilt + bend * (k - 1)) * Mathf.Deg2Rad; p += (Mathf.Sin(a) * outDir + Mathf.Cos(a) * Vector3.up) * (height * 0.5f); }
                float w = width * 0.5f;
                v.Add(p - side * w); v.Add(p + side * w); uv.Add(new Vector2(0, k * 0.5f)); uv.Add(new Vector2(1, k * 0.5f));
            }
            for (int k = 0; k < 2; k++) { int a = i0 + k * 2; tri.AddRange(new[] { a, a + 2, a + 1, a + 1, a + 2, a + 3 }); }
        }

        (Mesh, Material) Plant(string crop, int stage)
        {
            var key = crop + ":" + stage;
            if (plantCache.TryGetValue(key, out var hit)) return hit;
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            var rnd = new System.Random(crop.Length * 977 + crop[0] * 31 + stage);
            float R(float a, float b) => a + (float)rnd.NextDouble() * (b - a);
            float grow = new[] { 0.45f, 0.75f, 1f }[stage];
            Material mat = leafBroad;
            switch (crop)
            {
                case "carrot":
                    mat = leafThin;
                    for (int i = 0, n = new[] { 3, 5, 8 }[stage]; i < n; i++) Card(v, uv, tri, new Vector3(R(-0.03f, 0.03f), 0.06f, R(-0.03f, 0.03f)), i * 360f / n + R(-15, 15), R(8, 22), R(10, 25), 0.06f * grow + 0.02f, R(0.22f, 0.32f) * grow);
                    break;
                case "strawberry":
                    for (int i = 0, n = new[] { 2, 4, 6 }[stage]; i < n; i++) Card(v, uv, tri, new Vector3(0, 0.06f, 0), i * 360f / n + R(-20, 20), R(45, 62), R(10, 20), 0.16f * grow + 0.04f, 0.2f * grow + 0.03f);
                    break;
                case "sunflower":
                    mat = leafThin;   // the stalk and its leaves share the thin-leaf material, so the whole plant sways together
                    float stalk = new[] { 0.18f, 0.45f, 0.8f }[stage];
                    Card(v, uv, tri, new Vector3(0, 0.05f, 0), 0, 0, 0, 0.06f, stalk); Card(v, uv, tri, new Vector3(0, 0.05f, 0), 90, 0, 0, 0.06f, stalk);
                    for (int i = 0, n = new[] { 2, 4, 6 }[stage]; i < n; i++)
                        Card(v, uv, tri, new Vector3(0, 0.08f + stalk * 0.7f * i / Mathf.Max(1, n), 0), i * 137f, R(55, 70), R(10, 20), 0.07f, 0.2f * grow);
                    break;
                case "starwheat":
                    mat = leafThin;
                    for (int i = 0, n = new[] { 4, 7, 11 }[stage]; i < n; i++) Card(v, uv, tri, new Vector3(R(-0.06f, 0.06f), 0.05f, R(-0.06f, 0.06f)), R(0, 360), R(4, 16), R(5, 15), 0.045f, R(0.3f, 0.45f) * grow + 0.05f);
                    break;
                default:   // pumpkin: big leaves spreading low
                    for (int i = 0, n = new[] { 2, 3, 5 }[stage]; i < n; i++) Card(v, uv, tri, new Vector3(R(-0.05f, 0.05f), 0.06f, R(-0.05f, 0.05f)), i * 360f / n + R(-25, 25), R(58, 72), R(12, 22), 0.24f * grow + 0.05f, 0.3f * grow + 0.04f);
                    break;
            }
            var m = new Mesh { name = key }; m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(tri, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return plantCache[key] = (m, mat);
        }

        Mesh Produce(string crop)
        {
            if (produceCache.TryGetValue(crop, out var hit)) return hit;
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            var rnd = new System.Random(crop.Length * 131 + crop[0]);
            float R(float a, float b) => a + (float)rnd.NextDouble() * (b - a);
            switch (crop)
            {
                case "carrot": Blob(v, uv, tri, new Vector3(0, 0.05f, 0), new Vector3(0.075f, 0.09f, 0.075f), 0, 0.6f); break;            // the shoulder showing above the soil
                case "strawberry":
                    for (int i = 0; i < 5; i++) { float a = i * 72 + R(-20, 20); var at = Quaternion.Euler(0, a, 0) * new Vector3(0, 0.05f, R(0.09f, 0.15f)); Blob(v, uv, tri, at, new Vector3(0.035f, 0.045f, 0.035f), 0, -0.5f); }
                    break;
                case "sunflower": Card(v, uv, tri, new Vector3(0, 0.68f, -0.02f), 180, 25, 0, 0.34f, 0.34f); break;   // the head, facing south and a little up
                case "starwheat":
                    for (int i = 0; i < 6; i++) { var at = new Vector3(R(-0.06f, 0.06f), 0.05f + R(0.22f, 0.32f), R(-0.06f, 0.06f)); float yw = R(0, 180); Card(v, uv, tri, at, yw, R(0, 12), 0, 0.07f, 0.22f); Card(v, uv, tri, at, yw + 90, R(0, 12), 0, 0.07f, 0.22f); }
                    break;
                default: Blob(v, uv, tri, new Vector3(0.1f, 0.11f, -0.06f), new Vector3(0.19f, 0.13f, 0.19f), 8, 0); break;               // pumpkin, ribbed
            }
            var m = new Mesh { name = crop + " produce" }; m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(tri, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return produceCache[crop] = m;
        }

        // a rounded blob (sphere scaled by `r`) with `ribs` grooves around it (pumpkin); point > 0: long underneath (carrot),
        // point < 0: a pointed tip at the bottom (strawberry)
        static void Blob(List<Vector3> v, List<Vector2> uv, List<int> tri, Vector3 at, Vector3 r, int ribs, float point)
        {
            const int lon = 16, lat = 10; int i0 = v.Count;
            for (int j = 0; j <= lat; j++)
                for (int i = 0; i <= lon; i++)
                {
                    float th = j / (float)lat * Mathf.PI, ph = i / (float)lon * Mathf.PI * 2;
                    float rr = 1 - (ribs > 0 ? 0.08f * Mathf.Pow(Mathf.Abs(Mathf.Cos(ph * ribs * 0.5f)), 3) : 0);
                    var d = new Vector3(Mathf.Sin(th) * Mathf.Cos(ph) * rr, Mathf.Cos(th), Mathf.Sin(th) * Mathf.Sin(ph) * rr);
                    if (point > 0 && d.y < 0) d.y *= 1 + point * 2.5f;
                    if (point < 0 && d.y < 0) { d.y *= 1 - point; d.x *= 1 + d.y * 0.5f; d.z *= 1 + d.y * 0.5f; }
                    v.Add(at + Vector3.Scale(d, r)); uv.Add(new Vector2(i / (float)lon, j / (float)lat));
                }
            for (int j = 0; j < lat; j++)
                for (int i = 0; i < lon; i++)
                {
                    int a = i0 + j * (lon + 1) + i, b = a + 1, c = a + lon + 1, d = c + 1;
                    tri.AddRange(new[] { a, b, c, b, d, c });
                }
        }
    }
}
