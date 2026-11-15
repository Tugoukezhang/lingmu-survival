// The in-game screen, built in code (landscape phone layout, 1920×1080 reference, safe area respected):
//   top left  — status card: day, clock, health and fullness bars, today's goal
//   top right — clover count, bag and crafting buttons
//   left 45 % — floating joystick (appears where the thumb lands)
//   bottom right — the action button with the verb of the spot you stand at (睡觉 / 浇水 / 出货 …)
//   panels — bag, crafting, seed stand, shipping box, storage, the end-of-day report; open panels stop the clock
// Desktop testing: WASD to walk, E / Space = action, B = bag, C = crafting, Esc closes a panel.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.Rules;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public class GameUI : MonoBehaviour
    {
        public const float JoyZone = 0.45f;      // same split as OrbitCamera.dragZone
        const float JoyRadius = 110;

        GameSession session;
        PlayerMover mover;
        public Canvas canvas;
        RectTransform safe;

        TextMeshProUGUI dayText, clockText, phaseText, goalText, cloverText, spotText;
        Bar hpBar, hungerBar;
        RectTransform goalCard;
        Button actionBtn;
        RectTransform joyBase, joyKnob; Vector2 joyRest;
        RectTransform toastRoot;
        readonly List<(RectTransform r, CanvasGroup g, float until)> toasts = new List<(RectTransform, CanvasGroup, float)>();

        RectTransform modal; Image dim;
        string openPanel; string selectedItem;
        Spot spot;

        int joyTouch = -1; bool joyMouse; Vector2 joyOrigin;

        void Start()
        {
            session = GameSession.I;
            mover = session.player ? session.player.GetComponent<PlayerMover>() : null;
            Build();
            session.Changed += RefreshHud;
            session.Toast += ShowToast;
            session.DayEnded += ShowReport;
            OrbitCamera.OverUi = OverUi;
            RefreshHud();
        }

        void OnDestroy() { if (session != null) { session.Changed -= RefreshHud; session.Toast -= ShowToast; session.DayEnded -= ShowReport; } if (OrbitCamera.OverUi == (Func<Vector2, bool>)OverUi) OrbitCamera.OverUi = null; }

        // ---------- building ----------
        void Build()
        {
            if (!FindAnyObjectByType<EventSystem>())
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                es.transform.SetParent(transform, false);
            }
            canvas = gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvas.sortingOrder = 10;
            var scaler = gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight; scaler.matchWidthOrHeight = 1;   // landscape: keep the height, wider phones get more room
            gameObject.AddComponent<GraphicRaycaster>();
            gameObject.layer = 5;

            safe = Rect("safe area", transform).Fill();
            ApplySafeArea();

            // status card
            var card = Panel(safe, "status", new Color(Cream.r, Cream.g, Cream.b, 0.94f), null, true, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -24), new Vector2(470, 176));
            dayText = Label(card, "", 30, Ink, true, TextAlignmentOptions.Left); dayText.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(26, -14), new Vector2(150, 50));
            clockText = Label(card, "", 46, WoodDark, true, TextAlignmentOptions.Left); clockText.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(150, -6), new Vector2(170, 62));
            var chip = Panel(card, "phase", Yellow, RoundSmall, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-22, -20), new Vector2(110, 44));
            phaseText = Label(chip, "", 24, WoodDark, true); phaseText.rectTransform.Fill();
            var l1 = Label(card, "生命", 24, Ink, true, TextAlignmentOptions.Left); l1.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(26, -80), new Vector2(70, 36));
            hpBar = MakeBar(card, "hp", Red); hpBar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(96, -82), new Vector2(348, 32));
            var l2 = Label(card, "饱食", 24, Ink, true, TextAlignmentOptions.Left); l2.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(26, -124), new Vector2(70, 36));
            hungerBar = MakeBar(card, "hunger", Orange); hungerBar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(96, -126), new Vector2(348, 32));

            goalCard = Panel(safe, "goal", new Color(WoodDark.r, WoodDark.g, WoodDark.b, 0.78f), null, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -212), new Vector2(560, 92));
            goalText = Label(goalCard, "", 25, Cream, false, TextAlignmentOptions.Left); goalText.rectTransform.Fill(16); goalText.overflowMode = TextOverflowModes.Truncate;

            // top right: clover and buttons
            var clover = Panel(safe, "clover", new Color(Cream.r, Cream.g, Cream.b, 0.94f), null, true, true).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-28, -24), new Vector2(250, 76));
            Clover(clover, 52).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(16, 0), new Vector2(52, 52));
            cloverText = Label(clover, "", 34, WoodDark, true, TextAlignmentOptions.Right); cloverText.rectTransform.Fill(); cloverText.rectTransform.offsetMin = new Vector2(70, 0); cloverText.rectTransform.offsetMax = new Vector2(-22, 0);
            var bag = Button(safe, "背包", WoodMid, Cream, 32, () => Open("bag"), Circle); ((RectTransform)bag.transform).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-28, -118), new Vector2(118, 118));
            var craft = Button(safe, "制作", WoodMid, Cream, 32, () => Open("craft"), Circle); ((RectTransform)craft.transform).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-162, -118), new Vector2(118, 118));

            // joystick (visual only; input is read in Update so it works anywhere in the left zone)
            joyRest = new Vector2(250, 250);
            joyBase = Panel(safe, "joystick", new Color(1, 1, 1, 0.22f), Circle, false).rectTransform.Place(Vector2.zero, new Vector2(0.5f, 0.5f), joyRest, new Vector2(JoyRadius * 2 + 40, JoyRadius * 2 + 40));
            var ring = joyBase.gameObject.AddComponent<Outline>(); ring.effectColor = new Color(1, 1, 1, 0.35f); ring.effectDistance = new Vector2(3, -3);
            joyKnob = Panel(joyBase, "knob", new Color(Cream.r, Cream.g, Cream.b, 0.9f), Circle, false, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(120, 120));

            // action button + what it would do
            actionBtn = Button(safe, "互动", Yellow, WoodDark, 46, DoAction, Circle);
            ((RectTransform)actionBtn.transform).Place(new Vector2(1, 0), new Vector2(0.5f, 0.5f), new Vector2(-210, 200), new Vector2(230, 230));
            var spotChip = Panel(safe, "spot", new Color(WoodDark.r, WoodDark.g, WoodDark.b, 0.82f), null, false).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-40, 340), new Vector2(560, 64));
            spotText = Label(spotChip, "", 26, Cream); spotText.rectTransform.Fill(10);

            toastRoot = Rect("toasts", safe).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -28), new Vector2(900, 400));
            var vl = toastRoot.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 10; vl.childAlignment = TextAnchor.UpperCenter; vl.childControlHeight = true; vl.childControlWidth = false; vl.childForceExpandHeight = false;

            // modal layer
            modal = Rect("modal", transform).Fill();
            dim = modal.gameObject.AddComponent<Image>(); dim.color = new Color(0.08f, 0.05f, 0.03f, 0.66f);   // looks about half as dark after tone mapping
            modal.gameObject.SetActive(false);
        }

        void ApplySafeArea()
        {
            var a = Screen.safeArea; float w = Mathf.Max(1, Screen.width), h = Mathf.Max(1, Screen.height);
            safe.anchorMin = new Vector2(a.xMin / w, a.yMin / h); safe.anchorMax = new Vector2(a.xMax / w, a.yMax / h);
            safe.offsetMin = safe.offsetMax = Vector2.zero;
        }

        // ---------- every frame ----------
        float nextHud;
        void Update()
        {
            ReadJoystick();
            ReadKeys();
            if (openPanel == null)
            {
                spot = session.CurrentSpot();
                actionBtn.interactable = spot != null && spot.verb != "等待";
                actionBtn.SetLabel(spot?.verb ?? "互动");
                spotText.text = spot?.label ?? "";
                spotText.transform.parent.gameObject.SetActive(spot != null);
            }
            if (Time.unscaledTime >= nextHud) { nextHud = Time.unscaledTime + 0.2f; RefreshClock(); }
            for (int i = toasts.Count - 1; i >= 0; i--)
            {
                var (r, g, until) = toasts[i];
                float left = until - Time.unscaledTime;
                g.alpha = Mathf.Clamp01(left / 0.4f);
                if (left <= 0) { Destroy(r.gameObject); toasts.RemoveAt(i); }
            }
        }

        bool OverUi(Vector2 screen)
        {
            if (!EventSystem.current) return false;
            var data = new PointerEventData(EventSystem.current) { position = screen };
            var hits = new List<RaycastResult>();
            EventSystem.current.RaycastAll(data, hits);
            return hits.Count > 0;
        }

        void ReadJoystick()
        {
            Vector2 stick = Vector2.zero; bool active = false; Vector2 pos = default;
            if (openPanel == null)
            {
                var ts = Touchscreen.current;
                if (ts != null)
                    foreach (var t in ts.touches)
                    {
                        int id = t.touchId.ReadValue();
                        if (!t.press.isPressed) { if (id == joyTouch) joyTouch = -1; continue; }
                        var start = t.startPosition.ReadValue();
                        if (joyTouch == -1 && t.press.wasPressedThisFrame && start.x < Screen.width * JoyZone && !OverUi(start)) { joyTouch = id; joyOrigin = start; }
                        if (id == joyTouch) { active = true; pos = t.position.ReadValue(); }
                    }
                var m = Mouse.current;
                if (!active && m != null)
                {
                    var mp = m.position.ReadValue();
                    if (m.leftButton.wasPressedThisFrame && mp.x < Screen.width * JoyZone && !OverUi(mp)) { joyMouse = true; joyOrigin = mp; }
                    if (!m.leftButton.isPressed) joyMouse = false;
                    if (joyMouse) { active = true; pos = mp; }
                }
            }
            else { joyTouch = -1; joyMouse = false; }
            float scale = canvas.scaleFactor > 0 ? canvas.scaleFactor : 1;
            if (active)
            {
                var d = (pos - joyOrigin) / scale;
                stick = Vector2.ClampMagnitude(d / JoyRadius, 1);
                joyBase.anchoredPosition = (joyOrigin - Screen.safeArea.min) / scale;
                joyKnob.anchoredPosition = stick * JoyRadius;
            }
            else { joyBase.anchoredPosition = joyRest; joyKnob.anchoredPosition = Vector2.zero; }
            PlayerMover.Stick = stick;
        }

        void ReadKeys()
        {
            var k = Keyboard.current;
            if (k == null) return;
            if (openPanel != null) { if (k.escapeKey.wasPressedThisFrame) Close(); return; }
            if (k.eKey.wasPressedThisFrame || k.spaceKey.wasPressedThisFrame) DoAction();
            if (k.bKey.wasPressedThisFrame) Open("bag");
            if (k.cKey.wasPressedThisFrame && !k.zKey.isPressed) Open("craft");
        }

        void DoAction()
        {
            if (openPanel != null || spot == null) return;
            var panel = session.Act(spot);
            if (panel != null) Open(panel);
        }

        // ---------- HUD ----------
        void RefreshClock()
        {
            var s = session.S;
            dayText.text = $"第 {s.day} 天";
            clockText.text = GameTime.Format(s.clock);
            phaseText.text = GameTime.PhaseNames[GameTime.PhaseAt(s.clock)];
        }

        void RefreshHud()
        {
            var s = session.S;
            RefreshClock();
            SetBar(hpBar, s.player.hp / (float)s.player.hpMax, $"{s.player.hp}/{s.player.hpMax}");
            SetBar(hungerBar, s.player.hunger / (float)s.player.hungerMax, $"{s.player.hunger}/{s.player.hungerMax}");
            cloverText.text = s.clover.ToString();
            var goal = Guide.Current(s);
            goalCard.gameObject.SetActive(goal != null);
            if (goal != null) goalText.text = "目标：" + goal.text;
            if (openPanel != null && openPanel != "report") Fill(openPanel);
        }

        void ShowToast(string text)
        {
            var bg = Panel(toastRoot, "toast", new Color(WoodDark.r, WoodDark.g, WoodDark.b, 0.88f), null, false);
            var t = Label(bg.transform, text, 28, Cream); t.rectTransform.Fill(); t.margin = new Vector4(26, 10, 26, 10);
            var fit = bg.gameObject.AddComponent<LayoutElement>();
            t.ForceMeshUpdate();
            float w = Mathf.Min(880, t.preferredWidth + 60);
            bg.rectTransform.sizeDelta = new Vector2(w, 0);
            fit.preferredHeight = Mathf.Max(60, t.GetPreferredValues(text, w - 52, 0).y + 22); fit.preferredWidth = w;
            var g = bg.gameObject.AddComponent<CanvasGroup>();
            toasts.Add((bg.rectTransform, g, Time.unscaledTime + 3.2f));
            while (toasts.Count > 4) { Destroy(toasts[0].r.gameObject); toasts.RemoveAt(0); }
        }

        // ---------- panels ----------
        RectTransform box;

        public void Open(string panel)
        {
            if (openPanel == "report" && panel != "report") return;
            openPanel = panel;
            modal.gameObject.SetActive(true);
            session.PauseFor("menu");
            if (mover) mover.enabled = false;
            PlayerMover.Stick = Vector2.zero;
            if (panel == "bag") selectedItem = session.S.inventory.FirstOrDefault()?.id;
            Fill(panel);
        }

        public void Close()
        {
            if (openPanel == "report") { openPanel = null; modal.gameObject.SetActive(false); session.StartNewDay(); if (mover) mover.enabled = true; return; }
            openPanel = null;
            modal.gameObject.SetActive(false);
            session.ResumeFor("menu");
            if (mover) mover.enabled = true;
        }

        RectTransform NewBox(string title, Vector2 size)
        {
            if (box) Destroy(box.gameObject);
            box = Panel(modal, "panel", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -10), size);
            var head = Panel(box, "title", WoodMid, null, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(0, -8), new Vector2(Mathf.Min(520, size.x - 120), 76));
            var t = Label(head, title, 36, Cream, true); t.rectTransform.Fill();
            if (openPanel != "report")
            {
                var x = Button(box, "×", WoodDark, Cream, 44, Close, Circle);
                ((RectTransform)x.transform).Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-14, -14), new Vector2(84, 84));
            }
            return box;
        }

        void Fill(string panel)
        {
            switch (panel)
            {
                case "bag": FillBag(); break;
                case "craft": FillCraft(); break;
                case "seeds": FillSeeds(); break;
                case "ship": FillShip(); break;
                case "storage": FillStorage(); break;
            }
        }

        void FillBag()
        {
            var s = session.S;
            int slots = Crafting.BagSlots(s);
            var b = NewBox($"背包  {s.inventory.Count}/{slots}", new Vector2(1500, 860));
            var grid = Rect("grid", b).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(50, -90), new Vector2(880, 730));
            var g = grid.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = new Vector2(132, 132); g.spacing = new Vector2(14, 14); g.constraint = GridLayoutGroup.Constraint.FixedColumnCount; g.constraintCount = 6;
            if (selectedItem != null && !s.inventory.Any(x => x.id == selectedItem)) selectedItem = s.inventory.FirstOrDefault()?.id;
            for (int i = 0; i < slots; i++)
            {
                var st = i < s.inventory.Count ? s.inventory[i] : null;
                bool sel = st != null && st.id == selectedItem;
                var cell = Panel(grid, "slot", sel ? Yellow : CreamDark, RoundSmall, st != null);
                if (st == null) continue;
                var id = st.id;
                var btn = cell.gameObject.AddComponent<Button>(); btn.onClick.AddListener(() => { selectedItem = id; FillBag(); });
                var icon = Rect("icon", cell.transform).Fill(14).gameObject.AddComponent<Image>(); icon.sprite = Icon(id); icon.preserveAspect = true; icon.raycastTarget = false;
                if (!icon.sprite) { var n = Label(cell.transform, GameData.Item(id)?.name ?? id, 22, Ink); n.rectTransform.Fill(8); }
                var cnt = Label(cell.transform, st.count > 1 ? st.count.ToString() : "", 28, WoodDark, true, TextAlignmentOptions.BottomRight); cnt.rectTransform.Fill(8);
                cnt.outlineWidth = 0.25f; cnt.outlineColor = new Color32(251, 243, 220, 255);
            }
            // details
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-46, -96), new Vector2(500, 718));
            var def = GameData.Item(selectedItem);
            if (def == null) { var e = Label(info, "背包是空的", 30, Ink); e.rectTransform.Fill(); return; }
            var big = Rect("icon", info).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -30), new Vector2(180, 180)).gameObject.AddComponent<Image>(); big.sprite = Icon(selectedItem); big.preserveAspect = true; big.raycastTarget = false;
            var name = Label(info, def.name, 42, WoodDark, true); name.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -220), new Vector2(460, 60));
            var tagChip = Panel(info, "tag", Grass, RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -288), new Vector2(130, 42));
            var tag = Label(tagChip, def.tag ?? "", 24, Color.white, true); tag.rectTransform.Fill();
            string extra = def.food != null ? $"\n饱食 +{def.food}" + (def.heal != null ? $"　生命 +{def.heal}" : "") : "";
            if (Farm.PriceOf(selectedItem) is int price) extra += $"\n出货价 {price}";
            var desc = Label(info, def.desc + extra, 27, Ink, false, TextAlignmentOptions.TopLeft); desc.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -350), new Vector2(430, 240));
            if (def.food != null)
            {
                var item = selectedItem;
                var use = Button(info, "吃掉", Yellow, WoodDark, 34, () => { session.Eat(item); }); ((RectTransform)use.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 30), new Vector2(260, 90));
            }
        }

        // a scrolling list of rows: icon, name, a line of detail, and a button on the right
        RectTransform List(RectTransform b, float top = 100)
        {
            var view = Rect("list", b); view.Fill(); view.offsetMin = new Vector2(40, 36); view.offsetMax = new Vector2(-40, -top);
            view.gameObject.AddComponent<RectMask2D>();
            var content = Rect("content", view); content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.offsetMin = content.offsetMax = Vector2.zero;
            var vl = content.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 12; vl.childControlHeight = false; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            content.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = view.gameObject.AddComponent<ScrollRect>(); sr.content = content; sr.horizontal = false; sr.movementType = ScrollRect.MovementType.Clamped; sr.scrollSensitivity = 40;
            view.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0);   // catches drags for scrolling
            return content;
        }

        void Row(RectTransform list, string icon, string name, string detail, string button, bool enabled, Action onClick)
        {
            var row = Panel(list, "row", CreamDark, RoundSmall, false).rectTransform; row.sizeDelta = new Vector2(0, 118);
            var img = Rect("icon", row).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 0), new Vector2(92, 92)).gameObject.AddComponent<Image>(); img.sprite = Icon(icon); img.preserveAspect = true; img.raycastTarget = false; img.enabled = img.sprite;
            var n = Label(row, name, 32, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(130, 56); n.rectTransform.offsetMax = new Vector2(-250, -8);
            var d = Label(row, detail, 24, Ink, false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(130, 8); d.rectTransform.offsetMax = new Vector2(-250, -62);
            if (button == null) return;
            var b = Button(row, button, enabled ? Yellow : CreamDark, WoodDark, 28, onClick); b.interactable = enabled;
            ((RectTransform)b.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-18, 0), new Vector2(210, 84));
        }

        static string Name(string id) => GameData.Item(id)?.name ?? id;

        void FillCraft()
        {
            var s = session.S;
            var b = NewBox("制作", new Vector2(1300, 880));
            var list = List(b);
            foreach (var r in GameData.Recipes.Where(r => Crafting.Unlocked(s, r.id)))
            {
                var chk = Crafting.CanCraft(s, r.id);
                bool here = Crafting.StationOk(s, r.id);
                var cost = string.Join("　", r.cost.Select(kv => $"{Name(kv.Key)} {Inventory.CountOf(s.inventory, kv.Key)}/{kv.Value}"));
                var id = r.id;
                Row(list, r.@out, Name(r.@out) + (r.n > 1 ? $" ×{r.n}" : ""), (r.station == "workbench" ? "【工作台】" : "") + cost, here ? "制作" : "回家做", chk.ok && here, () => session.Craft(id));
            }
        }

        void FillSeeds()
        {
            var s = session.S;
            var b = NewBox("种子摊", new Vector2(1200, 860));
            var list = List(b);
            foreach (var id in GameData.CropIds)
            {
                var c = GameData.Crops[id]; var cid = id;
                Row(list, c.seed, Name(c.seed), $"四叶草 {c.seedPrice}　·　浇水 {c.days} 天成熟　·　果实出货价 {Farm.PriceOf(c.crop)}", $"买 1 包", s.clover >= c.seedPrice, () => session.BuySeed(cid));
            }
        }

        void FillShip()
        {
            var s = session.S;
            var b = NewBox("出货箱", new Vector2(1200, 880));
            var head = Label(b, $"箱子里 {Farm.Of(s).shipping.Sum(x => x.count)} 件，明早换成四叶草 +{Farm.ShippingValue(s)}", 28, Ink, true); head.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -90), new Vector2(1000, 50));
            var list = List(b, 150);
            foreach (var st in Farm.Of(s).shipping.ToList()) { var id = st.id; Row(list, id, $"{Name(id)} ×{st.count}", "已经放进箱子", "取回", true, () => session.Unship(id)); }
            var sellable = s.inventory.Where(x => Farm.PriceOf(x.id) != null).ToList();
            foreach (var st in sellable) { var id = st.id; Row(list, id, $"{Name(id)} ×{st.count}", $"每个 {Farm.PriceOf(id)}", "放入 1", true, () => session.Ship(id)); }
            if (sellable.Count == 0 && Farm.Of(s).shipping.Count == 0) Row(list, null, "没有能出货的东西", "作物、浆果、鱼、雾晶都能卖", null, false, null);
        }

        void FillStorage()
        {
            var s = session.S;
            var b = NewBox("仓库", new Vector2(1200, 880));
            var put = Button(b, "全部存入", Yellow, WoodDark, 28, () => session.DepositAll()); ((RectTransform)put.transform).Place(new Vector2(0.5f, 1), new Vector2(1, 1), new Vector2(-10, -96), new Vector2(240, 76));
            var take = Button(b, "全部取回", Grass, Color.white, 28, () => session.WithdrawAll()); ((RectTransform)take.transform).Place(new Vector2(0.5f, 1), new Vector2(0, 1), new Vector2(10, -96), new Vector2(240, 76));
            var list = List(b, 190);
            var items = s.storage ?? new List<ItemStack>();
            foreach (var st in items) Row(list, st.id, $"{Name(st.id)} ×{st.count}", GameData.Item(st.id)?.desc ?? "", null, false, null);
            if (items.Count == 0) Row(list, null, "仓库是空的", "宠物打工带回的东西也放在这里", null, false, null);
        }

        void ShowReport(SettlementReport r)
        {
            openPanel = "report";
            modal.gameObject.SetActive(true);
            if (mover) mover.enabled = false;
            PlayerMover.Stick = Vector2.zero;
            var b = NewBox($"第 {r.endedDay} 天结束", new Vector2(1100, 760));
            var text = Label(b, string.Join("\n", r.lines.Select(l => "· " + l)), 30, Ink, false, TextAlignmentOptions.TopLeft);
            text.rectTransform.Fill(); text.rectTransform.offsetMin = new Vector2(70, 150); text.rectTransform.offsetMax = new Vector2(-70, -120);
            var go = Button(b, $"开始第 {r.day} 天", Yellow, WoodDark, 36, Close); ((RectTransform)go.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(360, 96));
        }
    }
}
