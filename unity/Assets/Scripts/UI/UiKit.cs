// Small helpers to build the game UI in code: colours, rounded sprites made at runtime, panels, labels (TextMeshPro
// with the Noto Sans SC font), buttons, bars, item icons and the painted UI kit (Resources/UI/Kit).
// Look: "暖云手绘" (docs/18 视觉主题) — flat matte fills, a warm cocoa hand-drawn edge, cream panels, low-saturation
// pastels, short soft shadows. The runtime sprites are white with a cocoa edge baked in, so Image.color still picks the
// fill colour (the edge takes a darker shade of the same hue, like a coloured-pencil line).
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Lingmu.UI
{
    public static class UiKit
    {
        // font size table (1080-high layout, docs/18 第 0 步): titles 40, body 32, secondary 28, never below 26.
        // Touch targets are at least 88 px high (TouchMin).
        public const float FsTitle = 40, FsBody = 32, FsSub = 28, FsMin = 26, TouchMin = 88;
        // 设置 → 字号「大」: text may grow up to this much where it still fits its box
        public static float TextScale => Prefs.LargeText ? 1.15f : 1f;

        public static Color Hex(string h, float a = 1) { ColorUtility.TryParseHtmlString("#" + h, out var c); c.a = a; return c; }
        // 暖云手绘 palette (docs/参考资料/界面零件总览_v3.jpg)
        public static readonly Color WoodDark = Hex("5a3f32"), WoodMid = Hex("8d6a52"), Cream = Hex("fbf5e6"), CreamDark = Hex("e9dfcc"),
            Grass = Hex("93b26f"), GrassDark = Hex("6f8f4e"), Yellow = Hex("f2c35b"), Ink = Hex("5a4030"), Red = Hex("e2674f"), Orange = Hex("eba25a"), Sky = Hex("9cc3d5");
        public static readonly Color Edge = Hex("6b4f3f");
        // a chosen tab / option: light honey, so it never looks like the solid honey action buttons (GPT review 11-21)
        public static readonly Color Picked = Hex("f7e3a4");

        // outlined shapes (panels, chips, buttons) and flat ones (wells, slots, overlays, bar fills).
        // CreamDark panels and see-through colours are always drawn flat (Panel picks the flat twin).
        static Sprite round, circle, roundSmall, flatRound, flatSmall, flatCircle, pill, pillCircle;
        public static Sprite Round => round ? round : round = MakeRound(96, 30, 4, 0);
        public static Sprite RoundSmall => roundSmall ? roundSmall : roundSmall = MakeRound(48, 14, 3, 0);
        public static Sprite Circle => circle ? circle : circle = MakeRound(256, 128, 9, 0);
        public static Sprite FlatRound => flatRound ? flatRound : flatRound = MakeRound(96, 30, 0, 0);
        public static Sprite FlatSmall => flatSmall ? flatSmall : flatSmall = MakeRound(48, 14, 0, 0);
        public static Sprite FlatCircle => flatCircle ? flatCircle : flatCircle = MakeRound(256, 128, 0, 0);
        // buttons: the same shapes with a slightly darker band along the bottom (about 8 % of the height), so they look pressable
        static Sprite Pill => pill ? pill : pill = MakeRound(96, 30, 4, 7);
        static Sprite PillCircle => pillCircle ? pillCircle : pillCircle = MakeRound(256, 128, 9, 20);

        static Sprite FlatTwin(Sprite s) => s == Round || s == Pill ? FlatRound : s == RoundSmall ? FlatSmall : s == Circle || s == PillCircle ? FlatCircle : s;
        static bool Same(Color a, Color b) => Mathf.Abs(a.r - b.r) + Mathf.Abs(a.g - b.g) + Mathf.Abs(a.b - b.b) < 0.03f;

        // a white rounded rectangle with a soft 1.5 px edge, 9-sliced so it stretches to any size; optional cocoa outline
        // (edge px) and a grey band along the bottom (band px, inside the outline)
        static Sprite MakeRound(int size, int radius, int edge, int band)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "ui-round" };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, radius, size - radius), cy = Mathf.Clamp(y + 0.5f, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                    float a = Mathf.Clamp01((radius - d) / 1.5f + 0.5f);
                    Color c = Color.white;
                    if (band > 0 && y + 0.5f < edge + band) c = new Color(0.86f, 0.86f, 0.86f);
                    if (edge > 0) c = Color.Lerp(c, Edge, Mathf.Clamp01((d - (radius - edge)) / 1.2f + 0.5f));
                    c.a = a;
                    px[y * size + x] = c;
                }
            tex.SetPixels32(px); tex.Apply(false, true);
            int b = Mathf.Min(radius, size / 2 - 1);
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }

        // soft light rays fading out from the middle (behind the celebration card), white so Image.color tints them
        static Sprite rays;
        public static Sprite Rays => rays ? rays : rays = MakeRays(256, 14);
        static Sprite MakeRays(int size, int count)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "ui-rays" };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size - 0.5f, dy = (y + 0.5f) / size - 0.5f, r = Mathf.Sqrt(dx * dx + dy * dy) * 2;
                    float ray = Mathf.SmoothStep(0, 1, Mathf.Cos(Mathf.Atan2(dy, dx) * count) * 0.5f + 0.5f);
                    float a = ray * Mathf.Clamp01(1 - r) * Mathf.Clamp01(r * 4);
                    px[y * size + x] = new Color(1, 1, 1, a);
                }
            tex.SetPixels32(px); tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
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

        // the painted UI kit (GPT sheets sliced by tools/art/sprite_sheet.py, docs/19 第三节): hud_*, act_*, el_*, btn_close, clover …
        static readonly Dictionary<string, Sprite> kit = new Dictionary<string, Sprite>();
        public static Sprite Kit(string name)
        {
            if (name == null) return null;
            if (!kit.TryGetValue(name, out var s)) kit[name] = s = Resources.Load<Sprite>("UI/Kit/" + name);
            return s;
        }

        public static Image KitImage(Transform parent, string name, float size)
        {
            var img = Rect(name, parent).gameObject.AddComponent<Image>();
            img.sprite = Kit(name); img.preserveAspect = true; img.raycastTarget = false; img.enabled = img.sprite;
            img.rectTransform.sizeDelta = new Vector2(size, size);
            return img;
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
            sprite = sprite ? sprite : Round;
            if (color.a < 0.9f || Same(color, CreamDark)) sprite = FlatTwin(sprite);
            // circles are drawn whole (sliced, a big circle turns into a rounded square); the rest is 9-sliced
            bool round = sprite == circle || sprite == flatCircle || sprite == pillCircle;
            img.sprite = sprite; img.type = round ? Image.Type.Simple : Image.Type.Sliced; img.color = color; img.raycastTarget = raycast;
            if (shadow) { var sh = img.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0.25f, 0.17f, 0.1f, 0.22f); sh.effectDistance = new Vector2(0, -5); }
            return img;
        }

        public static TextMeshProUGUI Label(Transform parent, string text, float size, Color color, bool isBold = false, TextAlignmentOptions align = TextAlignmentOptions.Center)
        {
            var t = Rect("text", parent).gameObject.AddComponent<TextMeshProUGUI>();
            size = Mathf.Max(size, FsMin);
            t.font = isBold ? Bold : Font; t.text = text; t.fontSize = size; t.color = color; t.alignment = align;
            if (TextScale > 1) { t.enableAutoSizing = true; t.fontSizeMin = size; t.fontSizeMax = size * TextScale; }
            t.raycastTarget = false; t.textWrappingMode = TextWrappingModes.Normal; t.overflowMode = TextOverflowModes.Overflow;
            return t;
        }

        // text colour that stays readable on a fill: keep the asked one if the contrast is at least 3:1, otherwise
        // cocoa or cream, whichever stands out more (light buttons get dark text, docs/18 视觉主题)
        public static Color Readable(Color bg, Color fg)
        {
            if (bg.a < 0.5f || Contrast(bg, fg) >= 3) return fg;
            return Contrast(bg, WoodDark) >= Contrast(bg, Cream) ? WoodDark : Cream;
        }
        static float Lum(Color c) { float f(float v) => v <= 0.03928f ? v / 12.92f : Mathf.Pow((v + 0.055f) / 1.055f, 2.4f); return 0.2126f * f(c.r) + 0.7152f * f(c.g) + 0.0722f * f(c.b); }
        static float Contrast(Color a, Color b) { float la = Lum(a), lb = Lum(b); return (Mathf.Max(la, lb) + 0.05f) / (Mathf.Min(la, lb) + 0.05f); }

        public static Button Button(Transform parent, string text, Color bg, Color fg, float size, Action onClick, Sprite sprite = null)
        {
            var face = !sprite || sprite == Round ? Pill : sprite == Circle ? PillCircle : sprite;
            var img = Panel(parent, "button " + text, bg, face, true, true);
            var b = img.gameObject.AddComponent<Button>();
            var colors = b.colors; colors.highlightedColor = new Color(1, 1, 1, 1); colors.pressedColor = new Color(0.85f, 0.85f, 0.85f, 1); colors.disabledColor = new Color(0.75f, 0.75f, 0.75f, 0.6f); colors.fadeDuration = 0.05f; b.colors = colors;
            b.onClick.AddListener(() => GameAudio.Play("click", 0.8f));
            img.gameObject.AddComponent<UiPress>();
            if (onClick != null) b.onClick.AddListener(() => onClick());
            var l = Label(img.transform, text, size, Readable(bg, fg), true); l.rectTransform.Fill(6); l.name = "label";
            if (face == Pill || face == PillCircle) l.rectTransform.offsetMin = new Vector2(6, 10);   // centred above the bottom band
            return b;
        }

        // a round cream button with a painted icon, and an optional caption under it (HUD menu)
        public static Button IconButton(Transform parent, string icon, string caption, Action onClick, float size, Color? bg = null)
        {
            var b = Button(parent, "", bg ?? Cream, WoodDark, FsMin, onClick, Circle);
            b.name = "button " + (caption ?? icon);
            var img = KitImage(b.transform, icon, size * 0.58f); img.rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, size * 0.03f), img.rectTransform.sizeDelta);
            if (caption != null)
            {
                var c = Label(b.transform, caption, FsMin, WoodDark, true); c.name = "caption";
                c.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 1), new Vector2(0, 2), new Vector2(size + 40, 34));
                c.outlineWidth = 0.28f; c.outlineColor = new Color32(251, 245, 230, 255);
            }
            return b;
        }

        // the cloud-shaped close button (painted kit part); falls back to a round × button
        public static Button CloseButton(Transform parent, Action onClick, float size = 104)
        {
            var spr = Kit("btn_close");
            var b = spr ? Button(parent, "", Color.white, WoodDark, FsMin, onClick, spr) : Button(parent, "×", WoodDark, Cream, 48, onClick, Circle);
            b.name = "close";
            ((RectTransform)b.transform).sizeDelta = new Vector2(size, size);
            return b;
        }

        // the cloud-shaped back button (painted kit part), for sub-pages such as the dex
        public static Button BackButton(Transform parent, Action onClick, float size = 96)
        {
            var spr = Kit("btn_back");
            var b = spr ? Button(parent, "", Color.white, WoodDark, FsMin, onClick, spr) : Button(parent, "‹", WoodMid, Cream, 48, onClick, Circle);
            b.name = "back";
            ((RectTransform)b.transform).sizeDelta = new Vector2(size, size);
            return b;
        }

        // five painted stars, the first n filled (pet stars)
        public static RectTransform Stars(Transform parent, int n, float size, int total = 5)
        {
            var row = Rect("stars", parent); row.sizeDelta = new Vector2(total * size, size);
            for (int i = 0; i < total; i++)
                KitImage(row, i < n ? "star" : "star_empty", size).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(i * size, 0), new Vector2(size, size));
            return row;
        }

        // a checklist line: a tick when met, a faded lock when not (evolution, human form …)
        public static void CheckLine(Transform parent, bool ok, string text, Vector2 pos, float width)
        {
            var icon = KitImage(parent, ok ? "tick" : "lock", 34);
            icon.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 0.5f), pos + new Vector2(0, -21), new Vector2(34, 34));
            if (!ok) icon.color = new Color(1, 1, 1, 0.6f);
            var t = Label(parent, text, FsMin, ok ? Ink : Hex("8a7458"), false, TextAlignmentOptions.Left);
            t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), pos + new Vector2(44, 0), new Vector2(width - 44, 42));
        }

        // after 设置 → 字号 changes: update every label under root (the base size is fontSizeMin when auto-sizing)
        public static void ApplyTextScale(Transform root)
        {
            foreach (var t in root.GetComponentsInChildren<TextMeshProUGUI>(true))
            {
                float baseSize = t.enableAutoSizing ? t.fontSizeMin : t.fontSize;
                if (TextScale > 1) { t.enableAutoSizing = true; t.fontSizeMin = baseSize; t.fontSizeMax = baseSize * TextScale; }
                else { t.enableAutoSizing = false; t.fontSize = baseSize; }
            }
        }

        public static void SetLabel(this Button b, string text) => b.GetComponentInChildren<TextMeshProUGUI>().text = text;

        // the clover currency mark: the painted coin from the kit, or four round leaves and a stem if it is missing
        public static RectTransform Clover(Transform parent, float size)
        {
            if (Kit("clover")) return KitImage(parent, "clover", size).rectTransform;
            var root = Rect("clover", parent); root.sizeDelta = new Vector2(size, size);
            var stem = Panel(root, "stem", GrassDark, FlatSmall, false).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 1), new Vector2(size * 0.06f, -size * 0.02f), new Vector2(size * 0.1f, size * 0.42f));
            stem.localRotation = Quaternion.Euler(0, 0, 20);
            float r = size * 0.27f;
            foreach (var d in new[] { new Vector2(-1, 1), new Vector2(1, 1), new Vector2(-1, -1), new Vector2(1, -1) })
                Panel(root, "leaf", Grass, FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), d * r * 0.62f, new Vector2(r * 1.25f, r * 1.25f));
            Panel(root, "middle", GrassDark, FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size * 0.14f, size * 0.14f));
            return root;
        }

        // a small coloured chip with text (element, tag, state); the text turns cocoa on light colours
        public static RectTransform Chip(Transform parent, string text, Color color, float width = 96, float height = 46)
        {
            var chip = Panel(parent, "chip " + text, color, RoundSmall, false).rectTransform;
            chip.sizeDelta = new Vector2(width, height);
            var t = Label(chip, text, FsMin, Readable(color, Color.white), true); t.rectTransform.Fill(); t.textWrappingMode = TextWrappingModes.NoWrap;
            return chip;
        }

        // muted element colours of the kit badges (el_*)
        public static Color ElementColor(string el) => el switch
        {
            "水" => Hex("6f9fc4"), "火" => Hex("e5806a"), "森" => Hex("8fb36a"),
            "光" => Hex("eebd4f"), "暗" => Hex("a08ac6"), _ => Hex("a39a90"),
        };
        public static string ElementBadge(string el) => el switch
        {
            "水" => "el_water", "火" => "el_fire", "森" => "el_forest", "光" => "el_light", "暗" => "el_dark", _ => "el_normal",
        };

        // the painted icon for an action verb on the big action button (null = text only)
        public static string ActionIcon(string verb)
        {
            if (string.IsNullOrEmpty(verb)) return null;
            bool Has(params string[] ks) { foreach (var k in ks) if (verb.Contains(k)) return true; return false; }
            return Has("砍") ? "act_axe" : Has("敲", "挖") ? "act_pickaxe" : Has("浇") ? "act_water" : Has("播", "种子") ? "act_seed"
                : Has("收获", "割") ? "act_sickle" : Has("开垦") ? "act_hoe" : Has("摘", "捡") ? "act_pick" : Has("聊") ? "act_talk"
                : Has("睡") ? "act_sleep" : Has("网") ? "act_net" : Has("营地", "制作") ? "act_fire" : Has("进屋", "出门") ? "act_door"
                : Has("出发", "回家") ? "act_airship" : Has("打开", "仓库") ? "act_chest" : Has("出货") ? "act_ship"
                : Has("修", "扩建", "开路", "布置", "过桥") ? "act_build" : null;
        }

        public class Bar { public Image fill; public TextMeshProUGUI value; public RectTransform root; }

        // a rounded bar: cream track with the cocoa edge, a flat coloured fill (0..1) and the value written on it
        public static Bar MakeBar(Transform parent, string name, Color fillColor)
        {
            var bg = Panel(parent, name, Cream, RoundSmall, false);
            var fill = Panel(bg.transform, "fill", fillColor, FlatSmall, false);
            fill.rectTransform.anchorMin = Vector2.zero; fill.rectTransform.anchorMax = new Vector2(1, 1); fill.rectTransform.pivot = new Vector2(0, 0.5f);
            fill.rectTransform.offsetMin = new Vector2(4, 4); fill.rectTransform.offsetMax = new Vector2(-4, -4);
            // light fills (sky, grass, pink …) get cocoa numbers; dark ones white numbers with a cocoa outline
            bool dark = Readable(fillColor, Color.white) != Color.white;
            var v = Label(bg.transform, "", FsMin, dark ? WoodDark : Color.white, true); v.rectTransform.Fill();
            if (!dark) { v.outlineWidth = 0.32f; v.outlineColor = new Color32(90, 63, 50, 255); }
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
