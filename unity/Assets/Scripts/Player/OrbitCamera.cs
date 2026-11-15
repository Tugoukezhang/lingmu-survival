// Third-person camera behind and above the player (the web version's "B" camera, game/src/view3d/World3D.js ORBIT):
// drag on the right part of the screen (mouse or finger) to turn it and tilt it, Z / C on a keyboard to turn it.
// Comes closer when the ground rises between it and the player.
using UnityEngine;
using UnityEngine.InputSystem;

namespace Lingmu.Player
{
    public class OrbitCamera : MonoBehaviour
    {
        public Transform target;
        public float distance = 330f / 48f;     // web ORBIT.dist 330 px → m
        public float lookHeight = 52f / 48f;    // web ORBIT.look
        [Range(0.2f, 0.95f)] public float pitch = 0.42f;
        public float minPitch = 0.2f, maxPitch = 0.95f;
        public float yaw;                       // radians; 0 = looking north
        public LayerMask groundMask = ~0;
        [Range(0, 1)] public float dragZone = 0.45f;   // the left part of the screen belongs to the joystick

        Vector3 focus; bool hasFocus; float k = 1; int dragTouch = -1; bool mouseDrag;
        // set by the UI: true when a screen point is over a button or panel (a drag starting there doesn't turn the camera)
        public static System.Func<Vector2, bool> OverUi;
        static bool Free(Vector2 p) => OverUi == null || !OverUi(p);

        public void Snap() { if (target) { focus = target.position; hasFocus = true; Place(); } }

        void LateUpdate()
        {
            if (!target) return;
            ReadDrag();
            var kb = Keyboard.current;
            if (kb != null) yaw += ((kb.zKey.isPressed ? 1 : 0) - (kb.cKey.isPressed ? 1 : 0)) * Time.deltaTime * 1.8f;
            if (!hasFocus || (focus - target.position).sqrMagnitude > 25) { focus = target.position; hasFocus = true; }
            focus = Vector3.Lerp(focus, target.position, 1 - Mathf.Exp(-Time.deltaTime * 7));
            Place();
        }

        void Place()
        {
            float cp = Mathf.Cos(pitch), sp = Mathf.Sin(pitch);
            var back = new Vector3(Mathf.Sin(yaw) * cp, sp, -Mathf.Cos(yaw) * cp);   // from the player toward the camera
            var eye = focus + Vector3.up * lookHeight;
            float want = distance;
            if (Physics.SphereCast(eye, 0.25f, back, out var hit, distance, groundMask, QueryTriggerInteraction.Ignore)) want = Mathf.Max(distance * 0.28f, hit.distance - 0.2f);
            k = Mathf.Lerp(k, want / distance, 1 - Mathf.Exp(-Time.deltaTime * (want / distance < k ? 12 : 3)));
            transform.position = eye + back * distance * k;
            transform.rotation = Quaternion.LookRotation(eye - transform.position, Vector3.up);
        }

        void ReadDrag()
        {
            Vector2 delta = Vector2.zero;
            var ts = Touchscreen.current;
            if (ts != null)
            {
                foreach (var t in ts.touches)
                {
                    if (!t.press.isPressed) { if (t.touchId.ReadValue() == dragTouch) dragTouch = -1; continue; }
                    int id = t.touchId.ReadValue();
                    if (dragTouch == -1 && t.press.wasPressedThisFrame && t.startPosition.ReadValue().x > Screen.width * dragZone && Free(t.startPosition.ReadValue())) dragTouch = id;
                    if (id == dragTouch) delta += t.delta.ReadValue();
                }
            }
            var m = Mouse.current;
            if (m != null)
            {
                if (m.leftButton.wasPressedThisFrame) mouseDrag = m.position.ReadValue().x > Screen.width * dragZone && Free(m.position.ReadValue());
                if (!m.leftButton.isPressed) mouseDrag = false;
                if (mouseDrag) delta += m.delta.ReadValue();
            }
            if (delta == Vector2.zero) return;
            float scale = 960f / Mathf.Max(Screen.width, 1);          // same feel as the web version's 960-wide layout
            yaw -= delta.x * 0.0065f * scale;
            pitch = Mathf.Clamp(pitch - delta.y * 0.004f * scale, minPitch, maxPitch);
        }
    }
}
