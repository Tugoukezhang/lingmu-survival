// A round patch of the rippling pond water (Lingmu/Water) for basins such as the town fountain: built when enabled
// (in the editor too, nothing stored), depth 1 in the middle falling to the shore value at the rim, so the shader's
// foam laps along the basin wall.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    [ExecuteAlways]
    public class WaterDisc : MonoBehaviour
    {
        public float radius = 1f;
        [Range(0, 1)] public float rimDepth = 0.4f;     // shader depth at the rim (≈0.4 = foam line, see LingmuWater.shader)
        Mesh mesh; Material mat;

        void OnEnable()
        {
            var tpl = Resources.Load<Material>("Materials/Water");
            if (!tpl) return;
            mesh = Disc(radius, rimDepth);
            mat = new Material(tpl) { name = "Water (basin)", hideFlags = HideFlags.DontSave };
            var mf = GetComponent<MeshFilter>(); if (!mf) mf = gameObject.AddComponent<MeshFilter>();      // (not ??: Unity's missing component isn't C# null)
            var mr = GetComponent<MeshRenderer>(); if (!mr) mr = gameObject.AddComponent<MeshRenderer>();
            mf.hideFlags = mr.hideFlags = HideFlags.DontSave;
            mf.sharedMesh = mesh; mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; mr.receiveShadows = true;
        }

        void OnDisable()
        {
            if (mesh) DestroyImmediate(mesh);
            if (mat) DestroyImmediate(mat);
        }

        static Mesh Disc(float r, float rim)
        {
            const int Seg = 48; var rings = new[] { 0f, 0.45f, 0.78f, 0.92f, 1f };
            var v = new List<Vector3>(); var c = new List<Color32>(); var t = new List<int>();
            foreach (var f in rings)
                for (int i = 0; i < Seg; i++)
                {
                    float a = i * Mathf.PI * 2 / Seg;
                    v.Add(new Vector3(Mathf.Cos(a) * r * f, 0, Mathf.Sin(a) * r * f));
                    float d = Mathf.Lerp(1, rim, Mathf.SmoothStep(0.5f, 1, f));
                    c.Add(new Color32((byte)(d * 255), 0, 0, 255));
                }
            for (int k = 0; k < rings.Length - 1; k++)
                for (int i = 0; i < Seg; i++)
                {
                    int a = k * Seg + i, b = k * Seg + (i + 1) % Seg, a2 = a + Seg, b2 = b + Seg;
                    t.AddRange(new[] { a, b, a2, b, b2, a2 });
                }
            var m = new Mesh { name = "water disc", hideFlags = HideFlags.DontSave };
            m.SetVertices(v); m.SetColors(c); m.SetTriangles(t, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }
    }
}
