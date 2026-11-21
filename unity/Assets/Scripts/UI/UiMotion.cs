// Small UI motions (docs/19 第四节 5 动效和手感), all in unscaled time so they keep moving while the game is paused:
//   Bob    — floats up and down (title logo, island, airship, pets)
//   Drift  — slides sideways and wraps around (clouds)
//   Pulse  — breathes in scale (red dots, the start button, the action button when it can be used)
//   PopIn  — a panel pops in: 0.92 → 1 with a fade, about 0.2 s
//   Spin   — turns slowly (the rays behind a celebration)
//   Press  — a button shrinks a little while held and springs back
using UnityEngine;
using UnityEngine.EventSystems;

namespace Lingmu.UI
{
    public class UiMotion : MonoBehaviour
    {
        public enum Kind { Bob, Drift, Pulse, PopIn, Spin }
        public Kind kind;
        public float amount = 8, speed = 1, phase;   // Bob: px; Drift: px per second (wraps over `range`); Pulse: scale (0.06 = ±6 %)
        public float range = 2400;
        RectTransform rt; Vector2 home; float t0; CanvasGroup group;

        public static UiMotion Add(Component c, Kind kind, float amount, float speed = 1, float phase = 0)
        {
            var m = c.gameObject.AddComponent<UiMotion>();
            m.kind = kind; m.amount = amount; m.speed = speed; m.phase = phase;
            return m;
        }
        public static void Bob(Component c, float px, float speed = 1, float phase = 0) => Add(c, Kind.Bob, px, speed, phase);
        public static void Pulse(Component c, float scale = 0.06f, float speed = 1.6f) => Add(c, Kind.Pulse, scale, speed);
        public static void Drift(Component c, float pxPerSecond, float range) { var m = Add(c, Kind.Drift, pxPerSecond); m.range = range; }
        public static void PopIn(Component c) => Add(c, Kind.PopIn, 0, 1);

        void Start()
        {
            rt = (RectTransform)transform; home = rt.anchoredPosition; t0 = Time.unscaledTime;
            if (kind == Kind.PopIn) { group = GetComponent<CanvasGroup>(); if (!group) group = gameObject.AddComponent<CanvasGroup>(); Step(); }
        }

        void Update() => Step();

        void Step()
        {
            float t = Time.unscaledTime - t0;
            switch (kind)
            {
                case Kind.Bob: rt.anchoredPosition = home + new Vector2(0, Mathf.Sin((t * speed + phase) * Mathf.PI) * amount); break;
                case Kind.Drift:
                    float x = Mathf.Repeat(home.x + t * amount + range * 0.5f, range) - range * 0.5f;
                    rt.anchoredPosition = new Vector2(x, home.y); break;
                case Kind.Pulse: rt.localScale = Vector3.one * (1 + Mathf.Sin(t * speed * Mathf.PI * 2) * amount); break;
                case Kind.Spin: rt.localEulerAngles = new Vector3(0, 0, -t * amount); break;   // degrees per second
                case Kind.PopIn:
                    float k = Mathf.Clamp01(t / 0.2f), e = 1 - (1 - k) * (1 - k) * (1 - k);   // ease-out
                    rt.localScale = Vector3.one * Mathf.Lerp(0.92f, 1, e); group.alpha = e;
                    if (k >= 1) { rt.localScale = Vector3.one; group.alpha = 1; Destroy(this); }
                    break;
            }
        }
    }

    // a button shrinks to 94 % while held (tap feedback on phones, docs/18 动效和手感)
    public class UiPress : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        float target = 1, s = 1;
        public void OnPointerDown(PointerEventData e) => target = 0.94f;
        public void OnPointerUp(PointerEventData e) => target = 1;
        public void OnPointerExit(PointerEventData e) => target = 1;
        void Update()
        {
            if (Mathf.Abs(s - target) < 0.001f) return;
            s = Mathf.MoveTowards(s, target, Time.unscaledDeltaTime * 1.2f);
            transform.localScale = Vector3.one * s;
        }
    }
}
