// Rocks and crystals made in code (until modelled ones arrive): a rock is a lumpy, rounded boulder sunk a little
// into the ground, mapped so the stone texture's moss sits on its top (Art/Stone, tools/art/make_stone.py), often with
// a smaller stone or two beside it; a crystal is a cluster of glowing hexagonal shards with pointed tips.
// Twelve rock shapes and six crystal shapes are made once and shared. RockView builds one when a scene starts, so
// scenes saved in the editor only store the component.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    public static class StoneKit
    {
        static readonly Dictionary<int, Mesh> rocks = new Dictionary<int, Mesh>(), shards = new Dictionary<int, Mesh>();
        static Material stone, crystal, crystalRare;
        static Material Tpl(string n) => Resources.Load<Material>("Materials/" + n);

        public static GameObject Rock(Transform parent, Vector3 at, int seed, float size = 0.9f)
        {
            if (!stone) stone = Tpl("Stone");
            var root = new GameObject("rock"); root.transform.SetParent(parent, false); root.transform.position = at;
            root.transform.rotation = Quaternion.Euler(0, (seed * 47) % 360, 0);
            var rnd = new System.Random(seed);
            Piece(root.transform, RockMesh(seed % 12), stone, Vector3.zero, size * (0.9f + (float)rnd.NextDouble() * 0.25f));
            int extra = seed % 3;                                  // a smaller stone or two at its foot
            for (int i = 0; i < extra; i++)
            {
                float a = (float)rnd.NextDouble() * Mathf.PI * 2, d = size * (0.55f + (float)rnd.NextDouble() * 0.25f);
                Piece(root.transform, RockMesh((seed + 5 + i) % 12), stone, new Vector3(Mathf.Cos(a) * d, 0, Mathf.Sin(a) * d), size * (0.28f + (float)rnd.NextDouble() * 0.18f));
            }
            return root;
        }

        public static GameObject Crystal(Transform parent, Vector3 at, int seed, bool rare)
        {
            if (!crystal) { crystal = Tpl("Crystal"); crystalRare = Tpl("CrystalRare"); }
            var root = new GameObject("crystal"); root.transform.SetParent(parent, false); root.transform.position = at;
            root.transform.rotation = Quaternion.Euler(0, (seed * 61) % 360, 0);
            Piece(root.transform, ShardMesh(seed % 6), rare ? crystalRare : crystal, Vector3.zero, 1f);
            return root;
        }

        static void Piece(Transform parent, Mesh mesh, Material mat, Vector3 offset, float scale)
        {
            var go = new GameObject("piece"); go.transform.SetParent(parent, false);
            go.transform.localPosition = offset; go.transform.localScale = Vector3.one * scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mat;
        }

        // a boulder: sphere (u around, v up), pushed in and out by smooth bumps, flattened underneath and sunk 0.12
        static Mesh RockMesh(int variant)
        {
            if (rocks.TryGetValue(variant, out var hit)) return hit;
            var rnd = new System.Random(7919 * (variant + 1));
            float R() => (float)rnd.NextDouble();
            var bumps = new List<(Vector3 dir, float amp, float width)>();
            for (int i = 0; i < 9; i++) bumps.Add((Random3(rnd), (R() - 0.35f) * 0.32f, 0.5f + R() * 0.7f));
            var stretch = new Vector3(0.9f + R() * 0.3f, 0.55f + R() * 0.3f, 0.75f + R() * 0.3f);
            const int lon = 24, lat = 14;
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            for (int j = 0; j <= lat; j++)
                for (int i = 0; i <= lon; i++)
                {
                    float th = j / (float)lat * Mathf.PI, ph = i / (float)lon * Mathf.PI * 2;
                    var d = new Vector3(Mathf.Sin(th) * Mathf.Cos(ph), Mathf.Cos(th), Mathf.Sin(th) * Mathf.Sin(ph));
                    float r = 1;
                    foreach (var (dir, amp, width) in bumps) r += amp * Mathf.Exp(-(1 - Vector3.Dot(d, dir)) / (width * 0.35f));
                    var p = Vector3.Scale(d * r, stretch) * 0.5f;
                    if (p.y < -0.12f) p.y = -0.12f - (p.y + 0.12f) * 0.15f;            // flat underneath
                    p.y += 0.1f;                                                    // most of it above the ground, a little sunk in
                    v.Add(p); uv.Add(new Vector2(i / (float)lon, 1 - j / (float)lat));
                }
            for (int j = 0; j < lat; j++)
                for (int i = 0; i < lon; i++)
                {
                    int a = j * (lon + 1) + i, b = a + 1, c = a + lon + 1, d = c + 1;
                    tri.AddRange(new[] { a, b, c, b, d, c });
                }
            var m = new Mesh { name = "rock " + variant }; m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(tri, 0);
            m.RecalculateNormals(); m.RecalculateTangents(); m.RecalculateBounds();
            Weld(m);
            return rocks[variant] = m;
        }

        // the u seam of a sphere gets two normals: average them so no crease shows down the side
        static void Weld(Mesh m)
        {
            var v = m.vertices; var n = m.normals;
            var map = new Dictionary<Vector3, Vector3>();
            for (int i = 0; i < v.Length; i++) { var k = new Vector3(Mathf.Round(v[i].x * 1e4f), Mathf.Round(v[i].y * 1e4f), Mathf.Round(v[i].z * 1e4f)); map[k] = map.TryGetValue(k, out var s) ? s + n[i] : n[i]; }
            for (int i = 0; i < v.Length; i++) { var k = new Vector3(Mathf.Round(v[i].x * 1e4f), Mathf.Round(v[i].y * 1e4f), Mathf.Round(v[i].z * 1e4f)); n[i] = map[k].normalized; }
            m.normals = n;
        }

        static Vector3 Random3(System.Random rnd)
        {
            var d = new Vector3((float)rnd.NextDouble() * 2 - 1, (float)rnd.NextDouble() * 1.4f - 0.4f, (float)rnd.NextDouble() * 2 - 1);
            return d.sqrMagnitude < 1e-4f ? Vector3.up : d.normalized;
        }

        // a crystal cluster: one tall shard and three or four smaller ones leaning out, each a hexagonal prism with a point
        static Mesh ShardMesh(int variant)
        {
            if (shards.TryGetValue(variant, out var hit)) return hit;
            var rnd = new System.Random(104729 * (variant + 1));
            float R() => (float)rnd.NextDouble();
            var v = new List<Vector3>(); var tri = new List<int>();
            int count = 4 + variant % 2;
            for (int s = 0; s < count; s++)
            {
                float h = s == 0 ? 0.75f + R() * 0.2f : 0.3f + R() * 0.3f, r = s == 0 ? 0.11f : 0.06f + R() * 0.04f;
                var tilt = s == 0 ? Quaternion.Euler(R() * 8, R() * 360, 0) : Quaternion.Euler(20 + R() * 25, s * (360f / (count - 1)) + R() * 30, 0);
                var basePos = s == 0 ? Vector3.zero : tilt * Vector3.forward * 0.02f + new Vector3(Mathf.Cos(s * 2.1f) * 0.12f, 0, Mathf.Sin(s * 2.1f) * 0.12f);
                var top = basePos + tilt * Vector3.up * h; var tip = basePos + tilt * Vector3.up * (h + r * 1.8f);
                for (int k = 0; k < 6; k++)
                {
                    float a0 = k * Mathf.PI / 3, a1 = (k + 1) * Mathf.PI / 3;
                    var o0 = tilt * new Vector3(Mathf.Cos(a0) * r, 0, Mathf.Sin(a0) * r); var o1 = tilt * new Vector3(Mathf.Cos(a1) * r, 0, Mathf.Sin(a1) * r);
                    Quad(v, tri, basePos + o0 + Vector3.down * 0.05f, basePos + o1 + Vector3.down * 0.05f, top + o1, top + o0);   // side
                    Tri(v, tri, top + o0, top + o1, tip);                                                                          // point
                }
            }
            var m = new Mesh { name = "crystal " + variant }; m.SetVertices(v); m.SetTriangles(tri, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return shards[variant] = m;
        }

        static void Quad(List<Vector3> v, List<int> tri, Vector3 a, Vector3 b, Vector3 c, Vector3 d) { int i = v.Count; v.Add(a); v.Add(b); v.Add(c); v.Add(d); tri.AddRange(new[] { i, i + 2, i + 1, i, i + 3, i + 2 }); }
        static void Tri(List<Vector3> v, List<int> tri, Vector3 a, Vector3 b, Vector3 c) { int i = v.Count; v.Add(a); v.Add(b); v.Add(c); tri.AddRange(new[] { i, i + 2, i + 1 }); }
    }
}
