// Third-person camera behind and above the player (the web version's "B" camera, game/src/view3d/World3D.js ORBIT):
// drag on the right part of the screen (mouse or finger) to turn it and tilt it, Z / C on a keyboard to turn it;
// pinch with two fingers on the right part (or the mouse wheel) to come closer or step back (owner 11-21: 视角).
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
        [Range(0.2f, 0.95f)] public float pitch = 0.34f;   // low enough that the sky and the far islands show at the top
        public float minPitch = 0.2f, maxPitch = 0.95f;
        public float minDistance = 3.6f, maxDistance = 11f;   // pinch / wheel range
        public float yaw;                       // radians; 0 = looking north
        public LayerMask groundMask = ~0;
        [Range(0, 1)] public float dragZone = 0.45f;   // the left part of the screen belongs to the joystick

        Vector3 focus; bool hasFocus; float k = 1; int dragTouch = -1; bool mouseDrag; float pinchFrom = -1;
        // set by the UI: true when a screen point is over a button or panel (a drag starting there doesn't turn the camera)
        public static System.Func<Vector2, bool> OverUi;
        static bool Free(Vector2 p) => OverUi == null || !OverUi(p);

        public void Snap() { if (target) { focus = target.position; hasFocus = true; Place(); } }

        // a tool landing on wood or stone (World/Impact): a short jolt that dies away in ~0.2 s
        static float kick;
        public static void Kick(float metres) => kick = Mathf.Max(kick, metres);

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
            if (kick > 0.0005f)
            {
                transform.position += transform.up * kick * Mathf.Sin(Time.time * 70f) + transform.right * kick * 0.6f * Mathf.Cos(Time.time * 53f);
                kick = Mathf.MoveTowards(kick, 0, Time.deltaTime * 0.3f);
            }
        }

        void ReadDrag()
        {
            Vector2 delta = Vector2.zero;
            var ts = Touchscreen.current;
            if (ts != null)
            {
                // two fingers on the camera side: pinch to zoom (and no turning while pinching)
                Vector2 a = default, b = default; int n = 0;
                foreach (var t in ts.touches)
                    if (t.press.isPressed && t.startPosition.ReadValue().x > Screen.width * dragZone) { if (n == 0) a = t.position.ReadValue(); else if (n == 1) b = t.position.ReadValue(); n++; }
                if (n >= 2)
                {
                    float gap = Vector2.Distance(a, b);
                    if (pinchFrom > 0) distance = Mathf.Clamp(distance * pinchFrom / Mathf.Max(gap, 1), minDistance, maxDistance);
                    pinchFrom = gap; dragTouch = -1;
                    return;
                }
                pinchFrom = -1;
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
                float wheel = m.scroll.ReadValue().y;
                if (wheel != 0 && Free(m.position.ReadValue())) distance = Mathf.Clamp(distance * Mathf.Pow(0.9f, Mathf.Sign(wheel)), minDistance, maxDistance);
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
