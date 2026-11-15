// Moves the player on the island: keyboard (WASD / arrows), gamepad, or the on-screen stick (Stick), relative to where
// the camera looks — "up" walks away from the camera, as in the web version's third-person camera.
// Collision follows the island's tile rules (IslandWalkMap). Models without a skeleton bob and lean while walking.
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

        float walk, bob, yaw;
        Animator animator;
        Quaternion baseRotation = Quaternion.identity;     // the model's own turn from the import, kept under the yaw

        void Start() { animator = model ? model.GetComponentInChildren<Animator>() : null; if (model) { baseRotation = model.localRotation; yaw = 0; } }

        void Update()
        {
            var input = ReadInput();
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
            if (moving > 0.1f) yaw = Mathf.LerpAngle(yaw, Mathf.Atan2(move.x, move.z) * Mathf.Rad2Deg, 1 - Mathf.Exp(-Time.deltaTime * 12));
            if (!model) return;
            model.localRotation = Quaternion.Euler(0, yaw, 0) * baseRotation;
            if (animator) { animator.SetFloat("Speed", walk); return; }
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
