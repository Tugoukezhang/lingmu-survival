// The ground of the home island, generated from its layout every time it is enabled (in the editor too), like the web
// version's 3D terrain (game/src/view3d/kit/terrain.js): the island outline from rounded blobs around the land tiles,
// a painted top (grass with light and dark patches, dirt paths, the tilled field, the pets' meadow) and a ring of cliff
// that narrows down into the clouds. Nothing is stored as an asset: the same seed always gives the same ground.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Lingmu.World
{
    // what the terrain needs to know about an island: its tile grid, where the land is, paths and special ground
    public class IslandShape
    {
        public int cols, rows, seed;
        public System.Func<int, int, bool> land;
        public List<(Vector2 a, Vector2 b, float bend, float w)> curves = new List<(Vector2, Vector2, float, float)>();   // w < 0: straight band of width -w
        public RectInt? field;                      // tilled soil (home farm)
        public Vector2? meadow;                     // lighter grass patch
        public System.Func<int, int, bool> water;   // shallow ponds (expedition islands)

        public static IslandShape Home(HomeIslandLayout L)
        {
            var s = new IslandShape { cols = HomeIslandLayout.Cols, rows = HomeIslandLayout.Rows, seed = L.Seed, land = (x, y) => L.IsLand(x, y),
                field = new RectInt(L.FarmRect.x, L.FarmRect.y, L.FarmRect.w, L.FarmRect.h), meadow = new Vector2(L.Meadow.x, L.Meadow.y) };
            var sp = new Vector2(L.Spawn.x + 0.5f, L.Spawn.y + 0.5f);
            s.curves.Add((sp + new Vector2(-1.4f, -0.9f), sp + new Vector2(1.4f, -0.9f), 0, -1.6f));   // trampled ground around the camp
            s.curves.Add((sp, new Vector2(L.DockTile.x + 0.5f, L.DockTile.y + 1.3f), 0.06f, 0.8f));                                       // to the dock
            s.curves.Add((sp, new Vector2(L.BridgeTile.x, L.BridgeTile.y + 0.5f), -0.07f, 0.8f));                                         // to the rope bridge
            s.curves.Add((sp + new Vector2(-0.6f, -1.4f), new Vector2(L.CottageRect.x + L.CottageRect.w / 2f, L.CottageRect.y + L.CottageRect.h + 0.7f), 0.12f, 0.8f));   // to the cottage door
            s.curves.Add((sp + new Vector2(0.8f, 0), new Vector2(L.FarmRect.x - 0.2f, L.FarmRect.y + 1.5f), -0.12f, 0.7f));              // to the field
            return s;
        }

        // the paths as short straight pieces (tile units, x east, y south): curves are bent by `bend` sideways
        public List<(Vector2 a, Vector2 b, float w)> PathSegments()
        {
            var segs = new List<(Vector2, Vector2, float)>();
            foreach (var (a, b, bend, w) in curves)
            {
                if (w < 0) { segs.Add((a, b, -w)); continue; }
                var m = (a + b) / 2 + new Vector2(-(b.y - a.y), b.x - a.x) * bend;
                Vector2 prev = a;
                for (int i = 1; i <= 14; i++) { float t = i / 14f, u = 1 - t; var p = u * u * a + 2 * u * t * m + t * t * b; segs.Add((prev, p, w)); prev = p; }
            }
            return segs;
        }

        // how far a point is from the edge of the nearest path (negative = on the path); used to keep trees off paths
        public float PathClearance(Vector2 p)
        {
            float d = float.MaxValue;
            foreach (var (a, b, w) in PathSegments())
            {
                var ab = b - a; float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / Mathf.Max(ab.sqrMagnitude, 1e-6f));
                d = Mathf.Min(d, Vector2.Distance(p, a + ab * t) - w * 0.5f);
            }
            return d;
        }
    }

    [ExecuteAlways]
    public class IslandTerrain : MonoBehaviour
    {
        public int seed = HomeIslandLayout.DefaultSeed;
        public IslandShape shape;          // set before enabling for an island made while playing (expeditions)
        public string preset = "home";     // saved scenes: "home" (the home island from `seed`) or "town" — `shape` itself can't be saved
        IslandShape S;
        const int MaskPerTile = 8;        // outline mask: 8 samples per tile
        const int PixPerTile = 32;        // ground painting: 32 pixels per tile
        const float Step = 0.25f;         // top mesh grid spacing (m)
        const float DetailPerTile = 1.4f; // the grass detail texture repeats 1.4 times per metre

        Texture2D ground, cliffTex, detailMask;
        float[] grassMap; int gw, gh;           // 1 = grass (for the scattered 3D grass), 0 = path, soil, water
        Mesh top, cliff, water;
        Material topMat, cliffMat, waterMat;
        float[] mask; int mw, mh;

        void OnEnable() => Build();
        void OnDisable() => Release();

        void Release()
        {
            foreach (Object o in new Object[] { ground, cliffTex, detailMask, top, cliff, topMat, cliffMat, water, waterMat }) if (o) DestroyImmediate(o);
            water = null; waterMat = null;
        }

        public void Build()
        {
            Release();
            S = shape ?? (preset == "town" ? Lingmu.Game.TownArea.Shape() : IslandShape.Home(HomeIslandLayout.Generate(seed)));
            BuildMask();
            ground = PaintGround();
            top = TopMesh();
            cliffTex = CliffTexture();
            cliff = CliffMesh();
            // materials come from templates in Resources (so their shader variants are in every build: alpha clip,
            // the tiling grass detail and its normal map); without them (first import) plain Lit materials are made
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var topTpl = Resources.Load<Material>("Materials/IslandTop"); var cliffTpl = Resources.Load<Material>("Materials/IslandCliff");
            topMat = topTpl ? new Material(topTpl) : new Material(lit);
            topMat.name = "IslandTop"; topMat.hideFlags = HideFlags.DontSave;
            topMat.SetTexture("_BaseMap", ground);
            topMat.SetFloat("_Smoothness", 0.08f);
            topMat.SetFloat("_AlphaClip", 1); topMat.SetFloat("_Cutoff", 0.5f); topMat.EnableKeyword("_ALPHATEST_ON");
            if (topTpl)
            {
                topMat.SetTexture("_DetailMask", detailMask);
                var tiling = new Vector2(S.cols * DetailPerTile, S.rows * DetailPerTile);
                topMat.SetTextureScale("_DetailAlbedoMap", tiling);
            }
            cliffMat = cliffTpl ? new Material(cliffTpl) : new Material(lit);
            cliffMat.name = "IslandCliff"; cliffMat.hideFlags = HideFlags.DontSave;
            cliffMat.SetTexture("_BaseMap", cliffTex);
            cliffMat.SetFloat("_Smoothness", 0.05f);
            cliffMat.SetFloat("_Cull", (float)CullMode.Off);
            Show("Top", top, topMat);
            Show("Cliff", cliff, cliffMat);
            // pond water: a rippling see-through surface just above the painted pond bed (Lingmu/Water)
            var waterTpl = Resources.Load<Material>("Materials/Water");
            var old = transform.Find("Water");
            if (S.water != null && waterTpl)
            {
                water = WaterMesh();
                waterMat = new Material(waterTpl) { name = "Water", hideFlags = HideFlags.DontSave };
                Show("Water", water, waterMat);
            }
            else if (old) DestroyImmediate(old.gameObject);
        }

        void Show(string name, Mesh m, Material mat)
        {
            var t = transform.Find(name);
            if (!t) { t = new GameObject(name).transform; t.SetParent(transform, false); }
            t.gameObject.hideFlags = HideFlags.DontSave | HideFlags.NotEditable;
            var mf = t.GetComponent<MeshFilter>(); if (!mf) mf = t.gameObject.AddComponent<MeshFilter>();
            var mr = t.GetComponent<MeshRenderer>(); if (!mr) mr = t.gameObject.AddComponent<MeshRenderer>();
            mf.sharedMesh = m; mr.sharedMaterial = mat;
            mr.shadowCastingMode = name == "Water" ? ShadowCastingMode.Off : ShadowCastingMode.On; mr.receiveShadows = true;
            if (name == "Top") { var mc = t.GetComponent<MeshCollider>(); if (!mc) mc = t.gameObject.AddComponent<MeshCollider>(); mc.sharedMesh = m; }   // the camera keeps clear of the ground
        }

        // ---------- outline ----------
        void BuildMask()
        {
            mw = S.cols * MaskPerTile; mh = S.rows * MaskPerTile;
            var hard = new float[mw * mh];
            float r = 0.74f * MaskPerTile;
            for (int ty = 0; ty < S.rows; ty++)
                for (int tx = 0; tx < S.cols; tx++)
                {
                    if (!S.land(tx, ty)) continue;
                    float cx = (tx + 0.5f) * MaskPerTile, cy = (ty + 0.5f) * MaskPerTile;
                    int x0 = Mathf.Max(0, (int)(cx - r - 1)), x1 = Mathf.Min(mw - 1, (int)(cx + r + 1));
                    int y0 = Mathf.Max(0, (int)(cy - r - 1)), y1 = Mathf.Min(mh - 1, (int)(cy + r + 1));
                    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++)
                        if ((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy) <= r * r) hard[y * mw + x] = 1;
                }
            mask = Blur(hard, mw, mh, 1);
        }

        static float[] Blur(float[] src, int w, int h, int rad)
        {
            var tmp = new float[w * h]; var dst = new float[w * h];
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { float s = 0; int n = 0; for (int k = -rad; k <= rad; k++) { int xx = Mathf.Clamp(x + k, 0, w - 1); s += src[y * w + xx]; n++; } tmp[y * w + x] = s / n; }
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) { float s = 0; int n = 0; for (int k = -rad; k <= rad; k++) { int yy = Mathf.Clamp(y + k, 0, h - 1); s += tmp[yy * w + x]; n++; } dst[y * w + x] = s / n; }
            return dst;
        }

        // mask value at a point in tile units (tx east, ty south)
        float MaskAt(float tx, float ty)
        {
            float fx = tx * MaskPerTile - 0.5f, fy = ty * MaskPerTile - 0.5f;
            int x0 = Mathf.Clamp(Mathf.FloorToInt(fx), 0, mw - 2), y0 = Mathf.Clamp(Mathf.FloorToInt(fy), 0, mh - 2);
            float u = Mathf.Clamp01(fx - x0), v = Mathf.Clamp01(fy - y0);
            float a = Mathf.Lerp(mask[y0 * mw + x0], mask[y0 * mw + x0 + 1], u), b = Mathf.Lerp(mask[(y0 + 1) * mw + x0], mask[(y0 + 1) * mw + x0 + 1], u);
            return Mathf.Lerp(a, b, v);
        }

        // ---------- ground painting ----------
        struct Seg { public Vector2 a, b; public float w; }

        List<Seg> Paths() => S.PathSegments().ConvertAll(s => new Seg { a = s.a, b = s.b, w = s.w });

        static float DistToSeg(Vector2 p, Seg s)
        {
            var ab = s.b - s.a; float t = Mathf.Clamp01(Vector2.Dot(p - s.a, ab) / Mathf.Max(ab.sqrMagnitude, 1e-6f));
            return Vector2.Distance(p, s.a + ab * t);
        }

        Texture2D PaintGround()
        {
            int W = S.cols * PixPerTile, H = S.rows * PixPerTile;
            var px = new Color32[W * H];
            var detail = new byte[W * H];
            gw = W; gh = H; grassMap = new float[W * H];
            var paths = Paths();
            var waterC = new Color(0.36f, 0.68f, 0.82f); var waterDeep = new Color(0.22f, 0.5f, 0.7f); var sand = new Color(0.86f, 0.78f, 0.55f);
            var grass = new Color(0.47f, 0.73f, 0.29f); var grassDark = new Color(0.27f, 0.55f, 0.26f); var grassLight = new Color(0.70f, 0.86f, 0.38f);
            var dirt = new Color(0.82f, 0.64f, 0.42f); var dirtRim = new Color(0.58f, 0.55f, 0.32f); var soil = new Color(0.45f, 0.30f, 0.19f);
            float ox = Mathf.Abs(S.seed) % 97 * 3.1f, oy = Mathf.Abs(S.seed) % 89 * 2.3f;
            for (int py = 0; py < H; py++)
            {
                float ty = (H - 1 - py + 0.5f) / PixPerTile;          // texture rows go up, tile y goes south
                for (int pxl = 0; pxl < W; pxl++)
                {
                    float tx = (pxl + 0.5f) / PixPerTile;
                    float big = Mathf.PerlinNoise(ox + tx * 0.11f, oy + ty * 0.11f), mid = Mathf.PerlinNoise(ox + tx * 0.45f + 40, oy + ty * 0.45f), fine = Mathf.PerlinNoise(tx * 3.1f, ty * 3.1f);
                    Color c = Color.Lerp(grassDark, grass, Mathf.SmoothStep(0.2f, 0.62f, big));
                    float det = 1, grassy = 1;      // grain strength; how much 3D grass may grow here
                    c = Color.Lerp(c, grassLight, Mathf.SmoothStep(0.62f, 0.9f, mid) * 0.55f);
                    c *= 0.93f + 0.14f * fine;
                    // the pets' meadow: lighter
                    if (S.meadow is Vector2 m)
                    {
                        float md = Mathf.Pow((tx - m.x - 0.5f) / 3.6f, 2) + Mathf.Pow((ty - m.y - 0.5f) / 2.4f, 2);
                        if (md < 1) c = Color.Lerp(c, grassLight, (1 - md) * 0.45f);
                    }
                    // dirt paths: olive rim, warm body
                    float d = 99; foreach (var s in paths) d = Mathf.Min(d, DistToSeg(new Vector2(tx, ty), s) - s.w * 0.5f + 0.18f * Mathf.PerlinNoise(tx * 1.7f, ty * 1.7f));
                    if (d < 0.18f) c = Color.Lerp(c, dirtRim, Mathf.InverseLerp(0.18f, 0.05f, d) * 0.6f);
                    if (d < 0.05f) c = Color.Lerp(c, dirt * (0.92f + 0.16f * fine), Mathf.InverseLerp(0.05f, -0.05f, d));
                    det = Mathf.Lerp(0.45f, 1, Mathf.InverseLerp(-0.05f, 0.12f, d));
                    grassy = Mathf.InverseLerp(0.06f, 0.4f, d);
                    // the field: tilled soil in rows
                    if (S.field is RectInt f && tx >= f.x + 0.06f && tx <= f.x + f.width - 0.06f && ty >= f.y + 0.06f && ty <= f.y + f.height - 0.06f)
                    { c = soil * (0.85f + 0.25f * Mathf.Abs(Mathf.Sin(ty * Mathf.PI * 2)) + 0.08f * fine); det = 0.4f; grassy = 0; }
                    // shallow ponds: sandy rim, then water getting deeper towards the middle
                    if (S.water != null)
                    {
                        float wd = WaterDepth(tx, ty);
                        if (wd > 0) { c = Color.Lerp(c, sand, Mathf.Clamp01(wd * 3f)); det = Mathf.Lerp(det, 0.3f, Mathf.Clamp01(wd * 3f)); grassy *= Mathf.Clamp01(1 - wd * 6f); }
                        if (wd > 0.3f) { c = Color.Lerp(waterC, waterDeep, Mathf.Clamp01((wd - 0.3f) * 1.4f)) * (0.95f + 0.1f * mid); det = 0; }
                    }
                    c.a = MaskAt(tx, ty);
                    px[py * W + pxl] = c;
                    detail[py * W + pxl] = (byte)(det * 255);
                    grassMap[py * W + pxl] = grassy * Mathf.InverseLerp(0.82f, 0.97f, c.a);   // not on the crumbling edge
                }
            }
            var t = new Texture2D(W, H, TextureFormat.RGBA32, true) { name = "IslandGround", wrapMode = TextureWrapMode.Clamp, anisoLevel = 4, hideFlags = HideFlags.DontSave };
            t.SetPixels32(px); t.Apply(true);
            detailMask = new Texture2D(W, H, TextureFormat.Alpha8, true) { name = "IslandDetailMask", wrapMode = TextureWrapMode.Clamp, hideFlags = HideFlags.DontSave };
            detailMask.SetPixelData(detail, 0); detailMask.Apply(true);
            return t;
        }

        // how much grass grows at a point (tile units, x east, y south): 1 on meadow, 0 on paths, soil, water, edges
        public float GrassAt(float tx, float ty)
        {
            if (grassMap == null) return 0;
            int x = Mathf.FloorToInt(tx * PixPerTile), y = gh - 1 - Mathf.FloorToInt(ty * PixPerTile);
            if (x < 0 || y < 0 || x >= gw || y >= gh) return 0;
            return grassMap[y * gw + x];
        }
        public int Cols => S?.cols ?? 0;
        public int Rows => S?.rows ?? 0;
        public Vector2? Meadow => S?.meadow;

        // 0 = dry … 1 = deep inside a pond (smooth, from the water tiles around the point)
        float WaterDepth(float tx, float ty)
        {
            float sum = 0, wsum = 0;
            int x0 = Mathf.FloorToInt(tx - 1.5f), y0 = Mathf.FloorToInt(ty - 1.5f);
            for (int y = y0; y <= y0 + 3; y++) for (int x = x0; x <= x0 + 3; x++)
            {
                float d = Vector2.Distance(new Vector2(tx, ty), new Vector2(x + 0.5f, y + 0.5f));
                float w = Mathf.Max(0, 1.6f - d);
                sum += w * (S.water(x, y) ? 1 : 0); wsum += w;
            }
            return wsum > 0 ? sum / wsum : 0;
        }

        // ---------- top surface ----------
        Mesh TopMesh()
        {
            int nx = Mathf.RoundToInt(S.cols / Step), ny = Mathf.RoundToInt(S.rows / Step);
            var verts = new List<Vector3>(); var uvs = new List<Vector2>(); var tris = new List<int>();
            var index = new int[(nx + 1) * (ny + 1)];
            for (int j = 0; j <= ny; j++) for (int i = 0; i <= nx; i++)
            {
                float tx = i * Step, ty = j * Step;
                index[j * (nx + 1) + i] = verts.Count;
                verts.Add(new Vector3(tx, 0, -ty));
                uvs.Add(new Vector2(tx / S.cols, 1 - ty / S.rows));
            }
            for (int j = 0; j < ny; j++) for (int i = 0; i < nx; i++)
            {
                if (MaskAt((i + 0.5f) * Step, (j + 0.5f) * Step) < 0.15f) continue;     // far outside the outline: skip
                int a = index[j * (nx + 1) + i], b = a + 1, c = index[(j + 1) * (nx + 1) + i], d = c + 1;
                tris.AddRange(new[] { a, b, c, b, d, c });
            }
            var mesh = new Mesh { name = "IslandTop", indexFormat = IndexFormat.UInt32, hideFlags = HideFlags.DontSave };
            mesh.SetVertices(verts); mesh.SetUVs(0, uvs); mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals(); mesh.RecalculateTangents(); mesh.RecalculateBounds();
            return mesh;
        }

        // ---------- pond water ----------
        // a grid over the ponds, 3.5 cm above the ground; vertex colour red = how deep inside the pond (for the shader)
        Mesh WaterMesh()
        {
            int nx = Mathf.RoundToInt(S.cols / Step), ny = Mathf.RoundToInt(S.rows / Step);
            var depth = new float[(nx + 1) * (ny + 1)];
            for (int j = 0; j <= ny; j++) for (int i = 0; i <= nx; i++) depth[j * (nx + 1) + i] = WaterDepth(i * Step, j * Step);
            var verts = new List<Vector3>(); var cols = new List<Color32>(); var tris = new List<int>();
            var index = new Dictionary<int, int>();
            int V(int i, int j)
            {
                int k = j * (nx + 1) + i;
                if (index.TryGetValue(k, out int v)) return v;
                index[k] = verts.Count;
                verts.Add(new Vector3(i * Step, 0.035f, -j * Step));
                cols.Add(new Color32((byte)(Mathf.Clamp01(depth[k]) * 255), 0, 0, 255));
                return verts.Count - 1;
            }
            for (int j = 0; j < ny; j++) for (int i = 0; i < nx; i++)
            {
                float m = Mathf.Max(Mathf.Max(depth[j * (nx + 1) + i], depth[j * (nx + 1) + i + 1]), Mathf.Max(depth[(j + 1) * (nx + 1) + i], depth[(j + 1) * (nx + 1) + i + 1]));
                if (m < 0.2f) continue;
                int a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
                tris.AddRange(new[] { a, b, c, b, d, c });
            }
            var mesh = new Mesh { name = "PondWater", indexFormat = IndexFormat.UInt32, hideFlags = HideFlags.DontSave };
            mesh.SetVertices(verts); mesh.SetColors(cols); mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }

        // ---------- cliff ----------
        static readonly Vector2[] Rings = { new Vector2(0.02f, -0.06f), new Vector2(-0.5f, -0.18f), new Vector2(-1.4f, 0.12f), new Vector2(-2.9f, 0.7f), new Vector2(-4.8f, 1.8f), new Vector2(-6.9f, 3.5f) };

        Texture2D CliffTexture()
        {
            const int W = 128, H = 256;
            var px = new Color[W * H];
            var soil = new Color(0.46f, 0.32f, 0.2f);
            var bands = new[] { new Color(0.80f, 0.64f, 0.45f), new Color(0.70f, 0.52f, 0.35f), new Color(0.86f, 0.73f, 0.55f), new Color(0.74f, 0.58f, 0.40f), new Color(0.64f, 0.47f, 0.32f) };
            var deep = new Color(0.50f, 0.50f, 0.58f);
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
            {
                float t = 1 - y / (H - 1f);                       // 0 at the top edge … 1 at the bottom tip
                float wob = (Mathf.PerlinNoise(x * 0.05f, 3.1f) - 0.5f) * 0.05f + (Mathf.PerlinNoise(x * 0.17f, 7.7f) - 0.5f) * 0.015f;
                float layer = (t + wob) * 9f;                    // strata, slightly wavy
                int li = Mathf.Abs(Mathf.FloorToInt(layer)) % bands.Length;
                float edge = Mathf.Abs(layer - Mathf.Round(layer));
                var c = Color.Lerp(bands[li], bands[(li + 1) % bands.Length], Mathf.SmoothStep(0.35f, 0.5f, layer - Mathf.Floor(layer)));
                c *= edge < 0.06f ? 0.78f : 1f;                  // a dark line between layers
                c *= 0.9f + 0.18f * Mathf.PerlinNoise(x * 0.3f, y * 0.06f);                 // grain
                c *= 1 - 0.14f * Mathf.Clamp01(Mathf.PerlinNoise(x * 0.11f + 5, y * 0.012f) * 2 - 1);   // vertical streaks
                if (t < 0.1f) c = Color.Lerp(soil, c, Mathf.SmoothStep(0.05f, 0.1f, t));   // soil under the grass
                c = Color.Lerp(c, deep, Mathf.Clamp01((t - 0.45f) * 1.3f));               // cooler and darker in the cloud shade below
                float lip = 0.035f + 0.02f * Mathf.PerlinNoise(x * 0.4f, 1.3f);           // grass hanging over the top
                if (t < lip) c = Color.Lerp(new Color(0.36f, 0.6f, 0.24f), new Color(0.5f, 0.74f, 0.3f), t / lip);
                c.a = 1; px[y * W + x] = c;
            }
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, true) { name = "IslandCliff", wrapModeU = TextureWrapMode.Repeat, wrapModeV = TextureWrapMode.Clamp, hideFlags = HideFlags.DontSave };
            tex.SetPixels(px); tex.Apply(true);
            return tex;
        }

        Mesh CliffMesh()
        {
            // marching squares on the outline mask (every 2nd sample) → segments of the island edge, in tile units
            const int S = 2; const float Iso = 0.5f;
            int gw = mw / S + 2, gh = mh / S + 2;
            float Val(int gx, int gy) { int x = (gx - 1) * S, y = (gy - 1) * S; return x < 0 || y < 0 || x >= mw || y >= mh ? 0 : mask[y * mw + x]; }
            float Wx(int gx) => ((gx - 1) * S + 0.5f) / MaskPerTile;
            float Wy(int gy) => ((gy - 1) * S + 0.5f) / MaskPerTile;
            Vector2 Lerp(float ax, float ay, float av, float bx, float by, float bv) { float t = (Iso - av) / ((bv - av) == 0 ? 1 : (bv - av)); return new Vector2(ax + (bx - ax) * t, ay + (by - ay) * t); }
            var segs = new List<(Vector2, Vector2)>();
            for (int gy = 0; gy < gh - 1; gy++) for (int gx = 0; gx < gw - 1; gx++)
            {
                float a = Val(gx, gy), b = Val(gx + 1, gy), c = Val(gx + 1, gy + 1), d = Val(gx, gy + 1);
                int idx = (a > Iso ? 8 : 0) | (b > Iso ? 4 : 0) | (c > Iso ? 2 : 0) | (d > Iso ? 1 : 0);
                if (idx == 0 || idx == 15) continue;
                float x0 = Wx(gx), x1 = Wx(gx + 1), y0 = Wy(gy), y1 = Wy(gy + 1);
                Vector2 T() => Lerp(x0, y0, a, x1, y0, b);
                Vector2 R() => Lerp(x1, y0, b, x1, y1, c);
                Vector2 B() => Lerp(x0, y1, d, x1, y1, c);
                Vector2 Lf() => Lerp(x0, y0, a, x0, y1, d);
                switch (idx)
                {
                    case 1: case 14: segs.Add((Lf(), B())); break;
                    case 2: case 13: segs.Add((B(), R())); break;
                    case 3: case 12: segs.Add((Lf(), R())); break;
                    case 4: case 11: segs.Add((T(), R())); break;
                    case 6: case 9: segs.Add((T(), B())); break;
                    case 7: case 8: segs.Add((Lf(), T())); break;
                    case 5: segs.Add((Lf(), T())); segs.Add((B(), R())); break;
                    case 10: segs.Add((Lf(), B())); segs.Add((T(), R())); break;
                }
            }
            var centre = new Vector2(this.S.cols / 2f, this.S.rows / 2f);
            Vector3 WallPoint(Vector2 p, int ring)
            {
                var dir = centre - p; float len = Mathf.Max(dir.magnitude, 1e-3f);
                float wob = ring > 0 ? Mathf.Sin(p.x * 1.5f + ring * 1.7f) * 0.15f + Mathf.Sin(p.y * 2.2f + ring) * 0.12f : 0;
                var q = p + dir / len * (Rings[ring].y + wob);
                return new Vector3(q.x, Rings[ring].x, -q.y);
            }
            var verts = new List<Vector3>(); var uvs = new List<Vector2>(); var tris = new List<int>();
            foreach (var (p, q) in segs)
            {
                float u0 = (p.x + p.y) * 0.5f, u1 = (q.x + q.y) * 0.5f;
                for (int k = 0; k < Rings.Length - 1; k++)
                {
                    int i0 = verts.Count;
                    verts.Add(WallPoint(p, k)); verts.Add(WallPoint(q, k)); verts.Add(WallPoint(q, k + 1)); verts.Add(WallPoint(p, k + 1));
                    float v0 = 1 - k / (Rings.Length - 1f), v1 = 1 - (k + 1) / (Rings.Length - 1f);
                    uvs.Add(new Vector2(u0, v0)); uvs.Add(new Vector2(u1, v0)); uvs.Add(new Vector2(u1, v1)); uvs.Add(new Vector2(u0, v1));
                    tris.AddRange(new[] { i0, i0 + 3, i0 + 1, i0 + 1, i0 + 3, i0 + 2 });
                }
            }
            var mesh = new Mesh { name = "IslandCliff", indexFormat = IndexFormat.UInt32, hideFlags = HideFlags.DontSave };
            mesh.SetVertices(verts); mesh.SetUVs(0, uvs); mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }
    }
}
