// Ears, tails, manes and long fur swing after the body (owner 11-22: "宠物毛发是固定死的"). After the animation each frame,
// every secondary bone's tip is a small mass on a spring: it lags behind when the pet runs or turns, overshoots a little
// and settles back to where the clip put it, so the motion authored in Blender (tools/blender/pet_motions.py) still shows.
// Which bones: Tripo's quadruped rig names the body (Spine, Head, Limb); its extra bones are plain "bone_N". Those that
// do not lead to a leg are ears, tail, cheek fur and the like.
using System.Collections.Generic;
using UnityEngine;

namespace Lingmu.World
{
    public class SpringBones : MonoBehaviour
    {
        public float stiffness = 0.16f;     // pull back towards the animated pose each step (0..1)
        public float damping = 0.22f;       // velocity lost each step
        public float gravity = 0.6f;        // m/s² of droop, scaled by the model's size
        public float inertia = 0.55f;       // how much of the body's own movement the tips ignore (more = more lag)

        class Node { public Transform bone, child; public Vector3 tipLocal; public float length; public Vector3 p, prev; public bool started; }
        readonly List<Node> nodes = new List<Node>();
        Vector3 lastRoot; float scale = 1;
        const float Step = 1 / 60f;
        float acc;

        public static SpringBones Add(GameObject model)
        {
            var s = model.GetComponent<SpringBones>() ?? model.AddComponent<SpringBones>();
            s.Build();
            return s.nodes.Count > 0 ? s : null;
        }

        static bool IsBody(Transform t) => t.name.Contains("Limb") || t.name.Contains("Spine") || t.name.Contains("Head") || t.name.Contains("Root");
        static bool LeadsToLeg(Transform t)
        {
            foreach (var c in t.GetComponentsInChildren<Transform>(true)) if (c != t && c.name.Contains("Limb")) return true;
            return false;
        }

        void Build()
        {
            nodes.Clear();
            var all = GetComponentsInChildren<Transform>(true);
            var picked = new List<Transform>();
            foreach (var t in all)
            {
                if (!t.name.StartsWith("bone_") || IsBody(t) || LeadsToLeg(t)) continue;
                if (t.GetComponentInParent<SkinnedMeshRenderer>() == null && t.parent == null) continue;
                picked.Add(t);
            }
            // parents before children, so a tail swings from its root out
            picked.Sort((a, b) => Depth(a).CompareTo(Depth(b)));
            foreach (var t in picked)
            {
                Transform child = null;
                foreach (Transform c in t) if (picked.Contains(c)) { child = c; break; }
                var n = new Node { bone = t, child = child };
                if (child) n.tipLocal = child.localPosition;
                else
                {
                    // the last bone of a chain: as long as its parent bone, pointing the same way
                    var parentLen = t.parent ? t.localPosition : Vector3.up * 0.05f;
                    n.tipLocal = Quaternion.Inverse(t.localRotation) * parentLen * 0.8f;
                }
                n.length = Vector3.Scale(n.tipLocal, t.lossyScale).magnitude;
                if (n.length > 1e-5f) nodes.Add(n);
            }
            var r = GetComponentInChildren<Renderer>();
            scale = r ? Mathf.Max(0.1f, r.bounds.size.y) : 1;
            lastRoot = transform.position;
        }

        static int Depth(Transform t) { int d = 0; while (t.parent) { d++; t = t.parent; } return d; }

        void LateUpdate()
        {
            if (nodes.Count == 0) return;
            // the body's own movement this frame, partly kept by the tips (they lag)
            var move = transform.position - lastRoot; lastRoot = transform.position;
            if (move.sqrMagnitude > 4) move = Vector3.zero;          // teleported
            acc = Mathf.Min(acc + Time.deltaTime, Step * 4);
            int steps = 0;
            while (acc >= Step) { acc -= Step; steps++; }
            foreach (var n in nodes)
            {
                var b = n.bone;
                var animTip = b.TransformPoint(n.tipLocal);
                n.length = (animTip - b.position).magnitude;
                if (!n.started) { n.p = n.prev = animTip; n.started = true; continue; }
                n.p += move * (1 - inertia); n.prev += move * (1 - inertia);   // the rest of the move is left behind: the tip trails
                for (int i = 0; i < steps; i++)
                {
                    var v = (n.p - n.prev) * (1 - damping);
                    n.prev = n.p;
                    n.p += v + Vector3.down * gravity * scale * Step * Step;
                    n.p += (animTip - n.p) * stiffness;
                    var d = n.p - b.position;
                    if (d.sqrMagnitude > 1e-10f) n.p = b.position + d.normalized * n.length;
                }
                var from = animTip - b.position; var to = n.p - b.position;
                if (from.sqrMagnitude > 1e-10f && to.sqrMagnitude > 1e-10f) b.rotation = Quaternion.FromToRotation(from, to) * b.rotation;
            }
        }
    }
}
