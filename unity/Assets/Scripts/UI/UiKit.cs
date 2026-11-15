// Small helpers to build the game UI in code: colours (same as the web version), rounded sprites made at runtime,
// panels, labels (TextMeshPro with the Noto Sans SC font), buttons, bars, item icons.
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Lingmu.UI
{
    public static class UiKit
    {
        public static Color Hex(string h, float a = 1) { ColorUtility.TryParseHtmlString("#" + h, out var c); c.a = a; return c; }
        public static readonly Color WoodDark = Hex("5b3d26"), WoodMid = Hex("8a5a36"), Cream = Hex("fbf3dc"), CreamDark = Hex("efe2c2"),
            Grass = Hex("7fb85a"), GrassDark = Hex("4f7d3a"), Yellow = Hex("f5c84b"), Ink = Hex("5a4030"), Red = Hex("e8604c"), Orange = Hex("f0a040"), Sky = Hex("7ec8e3");

        static Sprite round, circle, roundSmall;
        public static Sprite Round => round ? round : round = MakeRound(96, 30);
        public static Sprite RoundSmall => roundSmall ? roundSmall : roundSmall = MakeRound(48, 14);
        public static Sprite Circle => circle ? circle : circle = MakeRound(256, 128);

        // a white rounded rectangle with a soft 1.5 px edge, 9-sliced so it stretches to any size
        static Sprite MakeRound(int size, int radius)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "ui-round" };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, radius, size - radius), cy = Mathf.Clamp(y + 0.5f, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                    byte a = (byte)(255 * Mathf.Clamp01((radius - d) / 1.5f + 0.5f));
                    px[y * size + x] = new Color32(255, 255, 255, a);
                }
            tex.SetPixels32(px); tex.Apply(false, true);
            int b = Mathf.Min(radius, size / 2 - 1);
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }

        static TMP_FontAsset font, bold;
        public static TMP_FontAsset Font => font ? font : font = Resources.Load<TMP_FontAsset>("Fonts/NotoSansSC-Regular SDF");
        public static TMP_FontAsset Bold => bold ? bold : bold = Resources.Load<TMP_FontAsset>("Fonts/NotoSansSC-Bold SDF") ?? Font;

        static readonly Dictionary<string, Sprite> icons = new Dictionary<string, Sprite>();
        public static Sprite Icon(string itemId)
        {
            if (itemId == null) return null;
            if (!icons.TryGetValue(itemId, out var s)) icons[itemId] = s = Resources.Load<Sprite>("Icons/Items/" + itemId);
            return s;
        }

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;   // UI
            var r = (RectTransform)go.transform;
            r.SetParent(parent, false);
            return r;
        }

        // anchor / pivot as (0..1, 0..1); pos is the offset from the anchor in reference pixels (1920×1080 layout)
        public static RectTransform Place(this RectTransform r, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            r.anchorMin = r.anchorMax = anchor; r.pivot = pivot; r.anchoredPosition = pos; r.sizeDelta = size;
            return r;
        }

        public static RectTransform Fill(this RectTransform r, float inset = 0)
        {
            r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one; r.pivot = new Vector2(0.5f, 0.5f);
            r.offsetMin = new Vector2(inset, inset); r.offsetMax = new Vector2(-inset, -inset);
            return r;
        }

        public static Image Panel(Transform parent, string name, Color color, Sprite sprite = null, bool raycast = true, bool shadow = false)
        {
            var img = Rect(name, parent).gameObject.AddComponent<Image>();
            img.sprite = sprite ?? Round; img.type = Image.Type.Sliced; img.color = color; img.raycastTarget = raycast;
            if (shadow) { var sh = img.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0.23f, 0.15f, 0.08f, 0.35f); sh.effectDistance = new Vector2(0, -6); }
            return img;
        }

        public static TextMeshProUGUI Label(Transform parent, string text, float size, Color color, bool isBold = false, TextAlignmentOptions align = TextAlignmentOptions.Center)
        {
            var t = Rect("text", parent).gameObject.AddComponent<TextMeshProUGUI>();
            t.font = isBold ? Bold : Font; t.text = text; t.fontSize = size; t.color = color; t.alignment = align;
            t.raycastTarget = false; t.textWrappingMode = TextWrappingModes.Normal; t.overflowMode = TextOverflowModes.Overflow;
            return t;
        }

        public static Button Button(Transform parent, string text, Color bg, Color fg, float size, Action onClick, Sprite sprite = null)
        {
            var img = Panel(parent, "button " + text, bg, sprite, true, true);
            var b = img.gameObject.AddComponent<Button>();
            var colors = b.colors; colors.highlightedColor = new Color(1, 1, 1, 1); colors.pressedColor = new Color(0.85f, 0.85f, 0.85f, 1); colors.disabledColor = new Color(0.75f, 0.75f, 0.75f, 0.6f); colors.fadeDuration = 0.05f; b.colors = colors;
            if (onClick != null) b.onClick.AddListener(() => onClick());
            var l = Label(img.transform, text, size, fg, true); l.rectTransform.Fill(6); l.name = "label";
            return b;
        }

        public static void SetLabel(this Button b, string text) => b.GetComponentInChildren<TextMeshProUGUI>().text = text;

        // the clover currency mark: four round leaves and a little stem
        public static RectTransform Clover(Transform parent, float size)
        {
            var root = Rect("clover", parent); root.sizeDelta = new Vector2(size, size);
            var stem = Panel(root, "stem", GrassDark, RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 1), new Vector2(size * 0.06f, -size * 0.02f), new Vector2(size * 0.1f, size * 0.42f));
            stem.localRotation = Quaternion.Euler(0, 0, 20);
            float r = size * 0.27f;
            foreach (var d in new[] { new Vector2(-1, 1), new Vector2(1, 1), new Vector2(-1, -1), new Vector2(1, -1) })
                Panel(root, "leaf", Grass, Circle, false).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), d * r * 0.62f, new Vector2(r * 1.25f, r * 1.25f));
            Panel(root, "middle", GrassDark, Circle, false).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size * 0.14f, size * 0.14f));
            return root;
        }

        public class Bar { public Image fill; public TextMeshProUGUI value; public RectTransform root; }

        // a rounded bar with a coloured fill (0..1) and the value written on it
        public static Bar MakeBar(Transform parent, string name, Color fillColor)
        {
            var bg = Panel(parent, name, new Color(0.36f, 0.25f, 0.16f, 0.25f), RoundSmall, false);
            var fill = Panel(bg.transform, "fill", fillColor, RoundSmall, false);
            fill.rectTransform.anchorMin = Vector2.zero; fill.rectTransform.anchorMax = new Vector2(1, 1); fill.rectTransform.pivot = new Vector2(0, 0.5f);
            fill.rectTransform.offsetMin = new Vector2(3, 3); fill.rectTransform.offsetMax = new Vector2(-3, -3);
            var v = Label(bg.transform, "", 22, Color.white, true); v.rectTransform.Fill(); v.outlineWidth = 0.2f; v.outlineColor = new Color32(70, 45, 25, 200);
            return new Bar { fill = fill, value = v, root = bg.rectTransform };
        }

        public static void SetBar(Bar b, float frac, string text)
        {
            frac = Mathf.Clamp01(frac);
            b.fill.rectTransform.anchorMax = new Vector2(Mathf.Max(frac, 0.0001f), 1);
            b.fill.enabled = frac > 0.001f;
            b.value.text = text;
        }
    }
}
