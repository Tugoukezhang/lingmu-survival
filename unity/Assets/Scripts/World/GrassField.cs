// 3D grass and flowers on an island (the reference worlds are lush): tufts on grassy ground (not on paths, soil,
// water, the crumbling edge or under buildings), a few flowers everywhere and many in the meadow. Drawn instanced
// every frame with the Lingmu/Grass shader (sways in the wind). The same seed always gives the same meadow.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    public class GrassField : MonoBehaviour
    {
        public IslandTerrain terrain;
        public IslandWalkMap walk;
        public int seed = 1;
        public float tuftsPerTile = 6.5f;
        public float flowersPerTile = 0.45f;
        public float meadowFlowers = 4f;            // extra flowers per tile in the meadow centre

        const int Batch = 1000;
        Mesh tuft, petal;
        Material grassMat;
        readonly List<Material> flowerMats = new List<Material>();
        readonly List<Matrix4x4[]> tuftBatches = new List<Matrix4x4[]>();
        readonly List<(int mat, Matrix4x4[] m)> flowerBatches = new List<(int, Matrix4x4[])>();
        Bounds bounds;
        bool built;

        void Start() { Build(); }

        public void Build()
        {
            tuftBatches.Clear(); flowerBatches.Clear(); flowerMats.Clear();
            if (!terrain) terrain = GetComponent<IslandTerrain>();
            if (!walk) walk = GetComponent<IslandWalkMap>();
            grassMat = Resources.Load<Material>("Materials/Grass");
            foreach (var n in new[] { "FlowerDaisy", "FlowerYellow", "FlowerBlue" }) { var m = Resources.Load<Material>("Materials/" + n); if (m) flowerMats.Add(m); }
            if (!terrain || !grassMat || terrain.Cols == 0) return;
            tuft = TuftMesh(); petal = PetalMesh();
            var rnd = new System.Random(seed);
            var tufts = new List<Matrix4x4>(); var flowers = new List<(int, Matrix4x4)>();
            var meadow = terrain.Meadow;
            for (int ty = 0; ty < terrain.Rows; ty++)
                for (int tx = 0; tx < terrain.Cols; tx++)
                {
                    if (walk && !walk.IsFree(tx, ty)) continue;           // sea, trees, buildings, camp pieces
                    // denser in patches, sparser between them (an even carpet looks planted)
                    float patch = 0.35f + 1.3f * Mathf.PerlinNoise(tx * 0.19f + seed % 50, ty * 0.19f + 7);
                    int n = Count(rnd, tuftsPerTile * patch);
                    for (int i = 0; i < n; i++)
                    {
                        float px = tx + (float)rnd.NextDouble(), py = ty + (float)rnd.NextDouble();
                        if (rnd.NextDouble() > terrain.GrassAt(px, py)) continue;
                        float r = (float)rnd.NextDouble();
                        float h = Mathf.Lerp(0.14f, 0.38f, r * r) * (0.8f + 0.4f * patch / 1.65f);
                        float w = h * Mathf.Lerp(1.1f, 1.5f, (float)rnd.NextDouble());
                        tufts.Add(Matrix4x4.TRS(new Vector3(px, 0, -py), Quaternion.Euler(0, (float)rnd.NextDouble() * 360, 0), new Vector3(w, h, w)));
                    }
                    float fChance = flowersPerTile;
                    if (meadow is Vector2 m)
                    {
                        float md = Mathf.Pow((tx - m.x) / 4.2f, 2) + Mathf.Pow((ty - m.y) / 3f, 2);
                        if (md < 1) fChance += meadowFlowers * (1 - md);
                    }
                    int f = Count(rnd, fChance);
                    for (int i = 0; i < f && flowerMats.Count > 0; i++)
                    {
                        float px = tx + (float)rnd.NextDouble(), py = ty + (float)rnd.NextDouble();
                        if (terrain.GrassAt(px, py) < 0.6f) continue;
                        float s = Mathf.Lerp(0.1f, 0.16f, (float)rnd.NextDouble());
                        int kind = rnd.NextDouble() < 0.6 ? 0 : rnd.Next(flowerMats.Count);
                        var rot = Quaternion.Euler(0, (float)rnd.NextDouble() * 360, 0) * Quaternion.Euler(-55, 0, 0);
                        flowers.Add((kind, Matrix4x4.TRS(new Vector3(px, Mathf.Lerp(0.1f, 0.2f, (float)rnd.NextDouble()), -py), rot, Vector3.one * s)));
                    }
                }
            for (int i = 0; i < tufts.Count; i += Batch) tuftBatches.Add(tufts.GetRange(i, Mathf.Min(Batch, tufts.Count - i)).ToArray());
            for (int k = 0; k < flowerMats.Count; k++)
            {
                var list = flowers.FindAll(x => x.Item1 == k).ConvertAll(x => x.Item2);
                for (int i = 0; i < list.Count; i += Batch) flowerBatches.Add((k, list.GetRange(i, Mathf.Min(Batch, list.Count - i)).ToArray()));
            }
            bounds = new Bounds(new Vector3(terrain.Cols / 2f, 0.3f, -terrain.Rows / 2f), new Vector3(terrain.Cols + 2, 2, terrain.Rows + 2));
            built = true;
        }

        static int Count(System.Random r, float mean) { int n = Mathf.FloorToInt(mean); if (r.NextDouble() < mean - n) n++; return n; }

        void Update()
        {
            if (!built) return;
            var rp = new RenderParams(grassMat) { shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off, receiveShadows = true, worldBounds = bounds };
            foreach (var b in tuftBatches) Graphics.RenderMeshInstanced(rp, tuft, 0, b);
            foreach (var (k, b) in flowerBatches)
            {
                var fp = new RenderParams(flowerMats[k]) { shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off, receiveShadows = true, worldBounds = bounds };
                Graphics.RenderMeshInstanced(fp, petal, 0, b);
            }
        }

        public int TuftCount { get { int n = 0; foreach (var b in tuftBatches) n += b.Length; return n; } }

        // three crossed cards, 1 m wide and tall, standing on their bottom edge (uv.y 0 = root)
        static Mesh TuftMesh()
        {
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var tri = new List<int>();
            for (int i = 0; i < 3; i++)
            {
                var d = Quaternion.Euler(0, i * 60, 0) * Vector3.right * 0.5f;
                int b = v.Count;
                v.Add(-d); v.Add(d); v.Add(d + Vector3.up); v.Add(-d + Vector3.up);
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(1, 0)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(0, 1));
                tri.AddRange(new[] { b, b + 2, b + 1, b, b + 3, b + 2 });
            }
            var m = new Mesh { name = "grass tuft" };
            m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(tri, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }

        // a flower head: one card, centred
        static Mesh PetalMesh()
        {
            var m = new Mesh { name = "flower" };
            m.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) });
            m.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
            m.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }
    }
}
