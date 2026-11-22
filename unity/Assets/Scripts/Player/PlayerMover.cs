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
        Quaternion baseRotation = Quaternion.identity;     // the model's own turn from the import, kept under the yaw

        void Start() { animator = model ? model.GetComponentInChildren<Animator>() : null; if (model) { baseRotation = model.localRotation; yaw = 0; } }

        public bool Acting => Time.time < actionUntil;

        // play an action clip from `from` seconds in, for `hold` seconds (then walk / idle again); optional follow-up clip.
        // The Tripo presets start and end with a long idle, so `from` skips straight to the motion.
        public bool PlayAction(string clip, float from, float hold, string then = null, float thenFrom = 0, float thenHold = 0)
        {
            if (!animator || string.IsNullOrEmpty(clip) || !animator.HasState(0, Animator.StringToHash(clip))) return false;
            animator.speed = 1;
            animator.CrossFadeInFixedTime(clip, 0.15f, 0, from);
            actionUntil = Time.time + hold; nextAction = then; nextFrom = thenFrom; nextHold = thenHold;
            return true;
        }

        // turn to look at something (the tree being chopped, the pet the net is thrown at)
        public void FaceTowards(Vector3 at)
        {
            var d = at - transform.position; d.y = 0;
            if (d.sqrMagnitude > 0.01f) turnTo = Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg;
        }

        void EndAction()
        {
            if (nextAction != null) { var n = nextAction; nextAction = null; PlayAction(n, nextFrom, nextHold); return; }
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
