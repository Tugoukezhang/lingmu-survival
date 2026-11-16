// What is around and below an island (the reference worlds float over a sea of clouds): a slowly drifting cloud sea
// far below, and soft cloud cards on rings around the island — low ones near the sea, a few high ones far away.
// Tinted by the time of day (they are unlit). The sky itself is the panoramic skybox (Resources/Materials/SkyDay).
using System.Collections.Generic;
using Lingmu.Rules;
using UnityEngine;

namespace Lingmu.World
{
    public class Backdrop : MonoBehaviour
    {
        public Vector3 centre;
        public float seaHeight = -9f;
        public float islandRadius = 22f;
        public int seed = 3;
        Material seaMat, cardMat;
        Color seaBase, cardBase;
        readonly List<Transform> cards = new List<Transform>();
        Transform sea;

        void Start()
        {
            var seaTpl = Resources.Load<Material>("Materials/CloudSea");
            var cardTpl = Resources.Load<Material>("Materials/CloudCard");
            if (seaTpl)
            {
                seaMat = new Material(seaTpl);
                seaBase = seaMat.GetColor("_BaseColor");
                var g = GameObject.CreatePrimitive(PrimitiveType.Plane); g.name = "cloud sea"; Destroy(g.GetComponent<Collider>());
                sea = g.transform; sea.SetParent(transform, false);
                sea.position = new Vector3(centre.x, seaHeight, centre.z); sea.localScale = new Vector3(90, 1, 90);   // 900 m across
                g.GetComponent<Renderer>().sharedMaterial = seaMat;
                g.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            if (cardTpl)
            {
                cardMat = new Material(cardTpl);
                cardBase = cardMat.GetColor("_BaseColor");
                var rnd = new System.Random(seed);
                var quad = Quad();
                void Card(float radius, float y, float size)
                {
                    float a = (float)(rnd.NextDouble() * Mathf.PI * 2);
                    var go = new GameObject("cloud"); go.transform.SetParent(transform, false);
                    go.transform.position = centre + new Vector3(Mathf.Cos(a) * radius, y, Mathf.Sin(a) * radius);
                    go.transform.localScale = new Vector3(size, size * 0.55f, 1);
                    go.AddComponent<MeshFilter>().sharedMesh = quad;
                    var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = cardMat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; r.receiveShadows = false;
                    cards.Add(go.transform);
                }
                for (int i = 0; i < 26; i++) Card(islandRadius + 8 + (float)rnd.NextDouble() * 90, seaHeight + 1 + (float)rnd.NextDouble() * 5, 14 + (float)rnd.NextDouble() * 22);   // low, around the island
                for (int i = 0; i < 10; i++) Card(170 + (float)rnd.NextDouble() * 120, 4 + (float)rnd.NextDouble() * 26, 40 + (float)rnd.NextDouble() * 50);          // far, higher up
            }
        }

        static Mesh Quad()
        {
            var m = new Mesh { name = "cloud card" };
            m.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) });
            m.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
            m.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0); m.RecalculateBounds();
            return m;
        }

        void LateUpdate()
        {
            var cam = Camera.main;
            if (cam) foreach (var c in cards) { var d = c.position - cam.transform.position; d.y = 0; if (d.sqrMagnitude > 0.01f) c.rotation = Quaternion.LookRotation(d); }
            if (seaMat) seaMat.SetTextureOffset("_BaseMap", new Vector2(Time.time * 0.0016f, Time.time * 0.0009f));
            // follow the time of day (dusk warm, night deep blue)
            var s = Game.GameSession.I;
            if (s == null || s.S == null) return;
            var (rgb, dark) = GameTime.TintAt(s.S.clock);
            var tint = new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            float k = Mathf.Clamp01((float)dark * 1.35f);
            var t = Color.Lerp(Color.white, tint, 0.8f) * Mathf.Lerp(1, 0.45f, k);
            if (seaMat) seaMat.SetColor("_BaseColor", seaBase * t);
            if (cardMat) { var c = cardBase * t; c.a = cardBase.a; cardMat.SetColor("_BaseColor", c); }
        }
    }
}
