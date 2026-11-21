// What is around and below an island (the reference worlds float over a sea of clouds):
//  - a drifting cloud sea far below, with a thinner layer of separate puffs above it moving the other way (depth)
//  - a ring of mist hugging the island's own outline, a little below the edge, slowly drifting and breathing, so the
//    cliffs fade into cloud (cards near the camera fade out, so swinging the camera over the edge never fills the
//    screen with a blurry card)
//  - low cloud cards further out; big painted cumulus clouds around the horizon and drifting across the sky, and a few
//    far floating islands with waterfalls (GPT sheets in Resources/Sky, no fog, a little haze) — owner 11-21: clouds and
//    sky like the Ghibli / fan-made reference videos
// Everything is tinted by the time of day (the clouds are unlit). The sky is the skybox (Resources/Materials/SkyDay,
// the gradient shader Lingmu/Sky).
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
        public IslandWalkMap outline;          // the island's land tiles (found in the scene when not set; expedition islands appear later)

        class Cloud { public Transform t; public MeshRenderer r; public float angle, radius, y, speed, phase, alpha, size, bob; public bool mist, sky; }
        readonly List<Cloud> clouds = new List<Cloud>();
        Material seaMat, layerMat, cardMat, mistMat, sky, cumulusMat, islandMat;
        Color seaBase, layerBase, cardBase, mistBase;
        Mesh[] quads;                          // the card textures are 2×2 sheets: one quad per picture
        MaterialPropertyBlock mpb;
        bool mistBuilt;
        Vector3 mistCentre;
        float skyTurn;
        static readonly int BaseColor = Shader.PropertyToID("_BaseColor"), BaseMap = Shader.PropertyToID("_BaseMap");

        void Start()
        {
            mpb = new MaterialPropertyBlock();
            quads = new Mesh[4]; for (int k = 0; k < 4; k++) quads[k] = Quad(k);
            var seaTpl = Resources.Load<Material>("Materials/CloudSea");
            var layerTpl = Resources.Load<Material>("Materials/CloudLayer");
            var cardTpl = Resources.Load<Material>("Materials/CloudCard");
            var mistTpl = Resources.Load<Material>("Materials/MistCard");
            if (mistTpl) { mistMat = new Material(mistTpl); mistBase = mistMat.GetColor(BaseColor); }
            if (seaTpl) { seaMat = new Material(seaTpl); seaBase = seaMat.GetColor(BaseColor); Plane("cloud sea", seaHeight, seaMat); }
            if (layerTpl) { layerMat = new Material(layerTpl); layerBase = layerMat.GetColor(BaseColor); Plane("cloud layer", seaHeight + 2.4f, layerMat); }
            if (cardTpl)
            {
                cardMat = new Material(cardTpl); cardBase = cardMat.GetColor(BaseColor);
                var rnd = new System.Random(seed);
                float R() => (float)rnd.NextDouble();
                for (int i = 0; i < 26; i++) Add(R() * 360, islandRadius + 10 + R() * 90, seaHeight + 1 + R() * 5, 14 + R() * 22, 0.25f + R() * 0.5f, R(), 1, false);   // low, further out
            }
            var skyTpl = Resources.Load<Material>("Materials/SkyCard");
            var cumulus = Resources.Load<Texture2D>("Sky/cumulus_sheet");
            var isles = Resources.Load<Texture2D>("Sky/islands_sheet");
            if (skyTpl && cumulus)
            {
                cumulusMat = new Material(skyTpl); cumulusMat.SetTexture(BaseMap, cumulus);
                var rnd = new System.Random(seed * 13 + 1);
                float R() => (float)rnd.NextDouble();
                for (int i = 0; i < 9; i++) AddSky(cumulusMat, i * 40 + R() * 25, 120 + R() * 60, 14 + R() * 22, 46 + R() * 30, 0.35f + R() * 0.4f, 0.12f);   // drifting across the sky
                for (int i = 0; i < 12; i++) AddSky(cumulusMat, i * 30 + R() * 20, 240 + R() * 90, -4 + R() * 30, 95 + R() * 70, 0.08f + R() * 0.1f, 0.3f);    // big ones framing the horizon
            }
            if (skyTpl && isles)
            {
                islandMat = new Material(skyTpl); islandMat.SetTexture(BaseMap, isles); islandMat.SetFloat("_Haze", 0.32f);
                var rnd = new System.Random(seed * 29 + 5);
                float R() => (float)rnd.NextDouble();
                for (int i = 0; i < 5; i++) { var c = AddSky(islandMat, 30 + i * 72 + R() * 30, 125 + R() * 70, -8 + R() * 16, 26 + R() * 16, 0.04f + R() * 0.05f, 0); c.bob = 0.6f; }
            }
            sky = RenderSettings.skybox;
            if (sky && sky.HasProperty("_Rotation")) skyTurn = sky.GetFloat("_Rotation");
        }

        void Plane(string name, float y, Material m)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Plane); g.name = name; Destroy(g.GetComponent<Collider>());
            g.transform.SetParent(transform, false);
            g.transform.position = new Vector3(centre.x, y, centre.z); g.transform.localScale = new Vector3(90, 1, 90);   // 900 m across
            var r = g.GetComponent<Renderer>(); r.sharedMaterial = m; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; r.receiveShadows = false;
        }

        Cloud Add(float angleDeg, float radius, float y, float size, float speed, float phase, float alpha, bool mist)
        {
            var go = new GameObject(mist ? "mist" : "cloud"); go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = quads[clouds.Count % 4];
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = mist && mistMat ? mistMat : cardMat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; r.receiveShadows = false;
            go.transform.localScale = new Vector3(size, size / 1.5f, 1);     // the pictures are 3:2
            var c = new Cloud { t = go.transform, r = r, angle = angleDeg, radius = radius, y = y, speed = speed, phase = phase * 6.28f, alpha = alpha, size = size, mist = mist };
            clouds.Add(c);
            return c;
        }

        // a big picture card in the sky (square pictures of a 2×2 sheet), no fog
        Cloud AddSky(Material m, float angleDeg, float radius, float y, float size, float speed, float haze)
        {
            var go = new GameObject("sky card"); go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = quads[clouds.Count % 4];
            var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = m; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; r.receiveShadows = false;
            go.transform.localScale = new Vector3(size, size, 1);
            var c = new Cloud { t = go.transform, r = r, angle = angleDeg, radius = radius, y = y, speed = speed, phase = (angleDeg % 7) * 0.9f, alpha = 1, size = size, sky = true };
            clouds.Add(c);
            return c;
        }

        // the mist ring: cards just outside the island's outline, a little below its edge
        void BuildMist()
        {
            if (!outline) outline = FindAnyObjectByType<IslandWalkMap>();
            if (!outline || outline.Cols == 0 || !cardMat) return;
            mistBuilt = true;
            var edge = new List<Vector3>();
            for (int y = 0; y < outline.Rows; y++)
                for (int x = 0; x < outline.Cols; x++)
                    if (outline.IsLand(x, y) && (!outline.IsLand(x + 1, y) || !outline.IsLand(x - 1, y) || !outline.IsLand(x, y + 1) || !outline.IsLand(x, y - 1)))
                        edge.Add(HomeIslandLayout.TileToWorld(x, y));
            if (edge.Count == 0) return;
            var c0 = Vector3.zero; foreach (var e in edge) c0 += e; c0 /= edge.Count;
            mistCentre = new Vector3(c0.x, 0, c0.z);
            var rnd = new System.Random(seed * 7 + edge.Count);
            float R() => (float)rnd.NextDouble();
            int n = Mathf.Clamp(edge.Count * 2 / 3, 30, 95);
            for (int i = 0; i < n; i++)
            {
                var d = edge[rnd.Next(edge.Count)] - mistCentre; d.y = 0;
                bool high = i % 3 == 0;                 // a third of them rise to the edge itself, the rest hide the cliffs' feet
                Add(Mathf.Atan2(d.z, d.x) * Mathf.Rad2Deg, d.magnitude + (high ? 1.5f : 2.5f) + R() * 4f, high ? -1.2f + R() * 1.4f : -3f + R() * 2f,
                    high ? 6 + R() * 6 : 8 + R() * 8, 0.6f + R() * 0.9f, R(), high ? 0.55f + R() * 0.25f : 0.7f + R() * 0.25f, true);
            }
        }

        static Mesh Quad(int k)
        {
            var m = new Mesh { name = "cloud card " + k };
            float u0 = (k % 2) * 0.5f, v0 = (k < 2 ? 0.5f : 0), u1 = u0 + 0.5f, v1 = v0 + 0.5f;    // picture k of the 2×2 sheet (row by row from the top)
            m.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) });
            m.SetUVs(0, new List<Vector2> { new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1) });
            m.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0); m.RecalculateBounds();
            return m;
        }

        void LateUpdate()
        {
            if (!mistBuilt) BuildMist();
            float t = Time.time;
            if (seaMat) seaMat.SetTextureOffset(BaseMap, new Vector2(t * 0.0016f, t * 0.0009f));
            if (layerMat) layerMat.SetTextureOffset(BaseMap, new Vector2(-t * 0.0026f, t * 0.0011f));
            if (sky && sky.HasProperty("_Rotation")) sky.SetFloat("_Rotation", skyTurn + t * 0.25f);   // the whole sky drifts: a full turn in 24 minutes

            // time-of-day tint (dusk warm, night deep blue)
            var tint = Color.white;
            var s = Game.GameSession.I;
            if (s != null && s.S != null)
            {
                var (rgb, dark) = GameTime.TintAt(s.S.clock);
                var c = new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
                float k = Mathf.Clamp01((float)dark * 1.35f);
                tint = Color.Lerp(Color.white, c, 0.8f) * Mathf.Lerp(1, 0.45f, k);
            }
            if (seaMat) seaMat.SetColor(BaseColor, seaBase * tint);
            if (layerMat) { var c2 = layerBase * tint; c2.a = layerBase.a; layerMat.SetColor(BaseColor, c2); }

            var cam = Camera.main;
            var cp = cam ? cam.transform.position : Vector3.zero;
            foreach (var c in clouds)
            {
                // drift round the island (mist slowly, sky clouds a bit faster); mist rises and sinks a little and breathes
                c.angle += c.speed * Time.deltaTime * (c.mist ? 0.6f : 1f);
                var mid = c.mist ? mistCentre : centre;
                float a = c.angle * Mathf.Deg2Rad;
                float bob = c.mist ? Mathf.Sin(t * 0.35f + c.phase) * 0.35f : c.bob > 0 ? Mathf.Sin(t * 0.2f + c.phase) * c.bob : 0;
                c.t.position = mid + new Vector3(Mathf.Cos(a) * c.radius, c.y + bob, Mathf.Sin(a) * c.radius);
                if (cam) { var d = c.t.position - cp; d.y = 0; if (d.sqrMagnitude > 0.01f) c.t.rotation = Quaternion.LookRotation(d); }
                float breathe = c.mist ? 0.85f + 0.15f * Mathf.Sin(t * 0.5f + c.phase * 1.7f) : 1;
                if (c.sky)
                {
                    var sc = Color.Lerp(Color.white, tint, 0.85f); sc.a = 1;
                    mpb.SetColor(BaseColor, sc); c.r.SetPropertyBlock(mpb);
                    continue;
                }
                float near = cam ? Mathf.SmoothStep(0, 1, (Vector3.Distance(c.t.position, cp) - c.size * 0.35f) / (c.size * 0.6f)) : 1;
                var bas = c.mist && mistMat ? mistBase : cardBase;
                var col = bas * tint; col.a = bas.a * c.alpha * breathe * near;
                mpb.SetColor(BaseColor, col);
                c.r.SetPropertyBlock(mpb);
                c.r.enabled = col.a > 0.01f;
            }
        }
    }
}
