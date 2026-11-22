// Moves the player on the island: keyboard (WASD / arrows), gamepad, or the on-screen stick (Stick), relative to where
// the camera looks — "up" walks away from the camera, as in the web version's third-person camera.
// Collision follows the island's tile rules (IslandWalkMap). Models without a skeleton bob and lean while walking.
// PlayAction crossfades into one of the model's action clips (chop, pick_up, water …, states made by SceneKit.Locomotion)
// for a moment and back to walking; moving cancels it. walkRef / runRef: how fast the walk and run clips cover the
// ground at 1x, so playback can keep the feet in step (measured per model).
using Lingmu.World;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Lingmu.Player
{
    public class PlayerMover : MonoBehaviour
    {
        public IslandWalkMap map;
        public Transform cameraTransform;
        public Transform model;                 // the visible character (turned to face where it walks)
        public float speed = 170f / 48f;        // web SPEED 170 px/s → tiles (m) per second
        public static Vector2 Stick;            // set by the on-screen joystick (UI), -1..1
        public static float LastPush;           // how hard the player pushes (0..1); below 0.6 counts as sneaking
        public Vector3 Facing => Quaternion.Euler(0, yaw, 0) * Vector3.forward;

        public float walkRef = 0.66f, runRef = 1.8f;  // m/s the clips cover at 1x (old Blender rig; the round-2 hero sets its own)
        public float maxPlayback = 2.1f;               // faster than this looks fast-forwarded: the feet slide a little instead
        float walk, bob, yaw;
        Animator animator;
        float actionUntil = -1; string nextAction; float nextFrom, nextHold, turnTo = float.NaN;
        GameObject held; string heldKey; Quaternion heldAlign;
        Transform hand, handMid, handIndex, handLittle, forearm;
        Quaternion baseRotation = Quaternion.identity;     // the model's own turn from the import, kept under the yaw

        void Start() { animator = model ? model.GetComponentInChildren<Animator>() : null; if (model) { baseRotation = model.localRotation; yaw = 0; } }

        public bool Acting => Time.time < actionUntil;

        // play an action clip from `from` seconds in, for `hold` seconds (then walk / idle again); optional follow-up clip and a
        // tool in the right hand for the action (and its follow-up). The Tripo presets start and end with a long idle, so `from`
        // skips straight to the motion.
        public bool PlayAction(string clip, float from, float hold, string then = null, float thenFrom = 0, float thenHold = 0, string tool = null)
        {
            if (!animator || string.IsNullOrEmpty(clip) || !animator.HasState(0, Animator.StringToHash(clip))) return false;
            animator.speed = 1;
            animator.CrossFadeInFixedTime(clip, 0.15f, 0, from);
            actionUntil = Time.time + hold; nextAction = then; nextFrom = thenFrom; nextHold = thenHold;
            if (tool != null) Hold(tool); else Drop();   // a new action puts the last tool away
            return true;
        }

        public string HeldTool => held ? heldKey : null;

        // ---------- a tool in the right hand ----------
        // The tool models have their grip at the origin, the handle along their longest side and the working side (axe blade,
        // net opening, can spout …) along another (tools/blender/tool_prep.py). Each frame, after the animation, the grip goes
        // into the fist: the handle runs from the little finger to the index finger, the blade faces where the knuckles point,
        // so it follows whatever the clip does with the hand.
        static readonly System.Collections.Generic.Dictionary<string, float> ToolLength = new System.Collections.Generic.Dictionary<string, float>
            { { "tool_axe", 0.44f }, { "tool_pickaxe", 0.46f }, { "tool_hoe", 0.78f }, { "tool_net", 0.66f }, { "tool_can", 0.34f } };

        public void Hold(string key)
        {
            if (heldKey == key && held) return;
            Drop();
            var e = World.ModelLibrary.Get ? World.ModelLibrary.Get.Find(key) : null;
            if (e == null || !e.model || !animator || !animator.isHuman) return;
            hand = animator.GetBoneTransform(HumanBodyBones.RightHand);
            if (!hand) return;
            handMid = animator.GetBoneTransform(HumanBodyBones.RightMiddleProximal);
            handIndex = animator.GetBoneTransform(HumanBodyBones.RightIndexProximal);
            handLittle = animator.GetBoneTransform(HumanBodyBones.RightLittleProximal);
            forearm = animator.GetBoneTransform(HumanBodyBones.RightLowerArm);
            held = Instantiate(e.model, model);
            held.name = key; heldKey = key;
            foreach (var c in held.GetComponentsInChildren<Collider>()) Destroy(c);
            // its own axes, from the mesh: along = the longest side (towards the head), work = the blade side
            var mf = held.GetComponentInChildren<MeshFilter>();
            var b = mf ? mf.sharedMesh.bounds : new Bounds(Vector3.up * 0.5f, Vector3.one);
            var ext = b.size; int[] order = { 0, 1, 2 };
            System.Array.Sort(order, (i, j) => ext[j].CompareTo(ext[i]));
            Vector3 Axis(int i, float sign) { var v = Vector3.zero; v[i] = sign >= 0 ? 1 : -1; return v; }
            var along = Axis(order[0], b.center[order[0]]);
            int wi = key == "tool_net" ? order[2] : order[1];
            var work = Axis(wi, b.center[wi]);
            if (key == "tool_can") work = Axis(order[1], -b.center[order[1]]);   // the can's up: away from its body, which hangs below the grip
            heldAlign = Quaternion.Inverse(Quaternion.LookRotation(work, along));
            float len = ToolLength.TryGetValue(key, out var l) ? l : 0.45f;
            float now = ext[order[0]] * (mf ? mf.transform.lossyScale.x / Mathf.Max(1e-4f, held.transform.lossyScale.x) : 1);
            held.transform.localScale = Vector3.one * (len / Mathf.Max(1e-4f, now)) / Mathf.Max(1e-4f, model.lossyScale.x);
            if (mf && mf.transform != held.transform) { mf.transform.localPosition = Vector3.zero; mf.transform.localRotation = Quaternion.identity; }
            LateUpdate();
        }

        public void Drop() { if (held) Destroy(held); held = null; heldKey = null; }

        void LateUpdate()
        {
            if (!held || !hand) return;
            var h = hand.position;
            var f = handMid ? handMid.position - h : forearm ? h - forearm.position : model.forward;
            float handLen = Mathf.Max(0.02f, f.magnitude); f /= handLen;
            var across = handIndex && handLittle ? handIndex.position - handLittle.position : Vector3.Cross(f, model.up);
            across -= f * Vector3.Dot(across, f);
            if (across.sqrMagnitude < 1e-6f) across = Vector3.Cross(f, Vector3.up);
            across.Normalize();
            var palm = Vector3.Cross(f, across);                       // out of the palm (right hand)
            Vector3 handle = across, blade = f, down = f;
            if (heldKey == "tool_can")
            {
                // hanging from the fist: the spout along the knuckles' line, the can below the hand
                held.transform.rotation = Quaternion.LookRotation(-down - handle * Vector3.Dot(-down, handle), handle) * heldAlign;
            }
            else held.transform.rotation = Quaternion.LookRotation(blade, handle) * heldAlign;
            held.transform.position = h + f * handLen * 0.55f + palm * handLen * 0.28f;
        }

        // turn to look at something (the tree being chopped, the pet the net is thrown at)
        public void FaceTowards(Vector3 at)
        {
            var d = at - transform.position; d.y = 0;
            if (d.sqrMagnitude > 0.01f) turnTo = Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg;
        }

        void EndAction()
        {
            if (nextAction != null) { var n = nextAction; nextAction = null; PlayAction(n, nextFrom, nextHold, null, 0, 0, HeldTool); return; }   // the follow-up keeps the tool
            Drop();
            actionUntil = -1;
            if (animator) animator.CrossFadeInFixedTime("Move", 0.2f);
        }

        void Update()
        {
            var input = ReadInput();
            if (actionUntil > 0)
            {
                if (input.sqrMagnitude > 0.09f) { nextAction = null; EndAction(); }      // walking off cancels the action
                else if (Time.time >= actionUntil) EndAction();
                else { input = Vector2.zero; }
            }
            Vector3 fwd = cameraTransform ? Vector3.ProjectOnPlane(cameraTransform.forward, Vector3.up).normalized : Vector3.forward;
            if (fwd.sqrMagnitude < 1e-4f) fwd = Vector3.forward;
            var right = Vector3.Cross(Vector3.up, fwd);
            var move = (fwd * input.y + right * input.x) * speed * Time.deltaTime;

            var p = transform.position;
            if (map)
            {
                var nx = p + new Vector3(move.x, 0, 0); if (map.FootFits(nx)) p = nx;     // slide along walls: each axis on its own
                var nz = p + new Vector3(0, 0, move.z); if (map.FootFits(nz)) p = nz;
            }
            else p += move;
            transform.position = p;

            float moving = Mathf.Clamp01(input.magnitude);
            LastPush = moving;
            walk = Mathf.Lerp(walk, moving, 1 - Mathf.Exp(-Time.deltaTime * 10));
            if (moving > 0.1f) { yaw = Mathf.LerpAngle(yaw, Mathf.Atan2(move.x, move.z) * Mathf.Rad2Deg, 1 - Mathf.Exp(-Time.deltaTime * 12)); turnTo = float.NaN; }
            else if (!float.IsNaN(turnTo)) yaw = Mathf.LerpAngle(yaw, turnTo, 1 - Mathf.Exp(-Time.deltaTime * 14));
            if (!model) return;
            model.localRotation = Quaternion.Euler(0, yaw, 0) * baseRotation;
            // ground speed picks the clip (Speed 0 idle, 1 walk at 1 m/s, 2 run from 2.2 m/s) and its playback rate, so the
            // feet keep pace with the ground: at 1x the walk covers walkRef m/s and the run runRef (measured per model, 1.35 m tall)
            if (animator)
            {
                if (actionUntil > 0) return;                 // an action clip is playing at its own pace
                float v = walk * speed;
                float param = v < 1f ? v : 1f + Mathf.Clamp01((v - 1f) / 1.2f);
                animator.SetFloat("Speed", param, 0.08f, Time.deltaTime);
                float clip = param <= 1f ? walkRef : Mathf.Lerp(walkRef, runRef, param - 1f);
                animator.speed = v > 0.05f ? Mathf.Clamp(v / clip, 0.8f, maxPlayback) : 1f;
                return;
            }
            // no skeleton yet: little hops and a forward lean
            bob += Time.deltaTime * 11 * walk;
            model.localPosition = new Vector3(0, Mathf.Abs(Mathf.Sin(bob)) * 0.07f * walk, 0);
            model.localRotation = Quaternion.Euler(0, yaw, 0) * Quaternion.Euler(6 * walk, 0, 0) * baseRotation;
        }

        static Vector2 ReadInput()
        {
            var v = Vector2.zero;
            var k = Keyboard.current;
            if (k != null)
            {
                if (k.wKey.isPressed || k.upArrowKey.isPressed) v.y += 1;
                if (k.sKey.isPressed || k.downArrowKey.isPressed) v.y -= 1;
                if (k.dKey.isPressed || k.rightArrowKey.isPressed) v.x += 1;
                if (k.aKey.isPressed || k.leftArrowKey.isPressed) v.x -= 1;
            }
            if (v == Vector2.zero && Gamepad.current != null) v = Gamepad.current.leftStick.ReadValue();
            if (v == Vector2.zero) v = Stick;
            return v.sqrMagnitude > 1 ? v.normalized : v;
        }
    }
}
