// One-off check (delete after): where Unity puts the bones of an FBX relative to its mesh.
using System.Linq;
using UnityEditor;
using UnityEngine;
public static class LingmuProbe
{
    public static void Bones()
    {
        foreach (var p in new[] { "Assets/ZProbe/pup_orig.fbx", "Assets/ZProbe/acorn_orig.fbx", "Assets/Art/Characters/A02_pup_rig/A02_pup_rig.fbx", "Assets/Art/Characters/A00_fox_rig/A00_fox_rig.fbx" })
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(p);
            if (!asset) { Debug.Log("[Probe] missing " + p); continue; }
            var g = (GameObject)Object.Instantiate(asset);
            var smr = g.GetComponentInChildren<SkinnedMeshRenderer>();
            var m = new Mesh(); smr.BakeMesh(m, true);
            var b = new Bounds(); bool first = true;
            foreach (var v in m.vertices) { var w = smr.transform.TransformPoint(v); if (first) { b = new Bounds(w, Vector3.zero); first = false; } else b.Encapsulate(w); }
            string Pos(string n) { var t = g.GetComponentsInChildren<Transform>().FirstOrDefault(x => x.name == n); return t ? $"{n}({t.position.x:F2},{t.position.y:F2},{t.position.z:F2})" : n + "(-)"; }
            Debug.Log($"[Probe] {p} mesh y {b.min.y:F2}..{b.max.y:F2} centre ({b.center.x:F2},{b.center.y:F2},{b.center.z:F2}) {Pos("Hip")} {Pos("Head")} {Pos("L_Foot")} {Pos("R_Foot")} {Pos("L_Hand")} rootBone={smr.rootBone?.name} bones={smr.bones.Length}");
            Object.DestroyImmediate(g);
        }
    }
}
