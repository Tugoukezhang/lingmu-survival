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
    public partial class GameUI : MonoBehaviour
    {
        public const float JoyZone = 0.45f;      // same split as OrbitCamera.dragZone
        const float JoyRadius = 110;

        GameSession session;
        PlayerMover mover;
        public Canvas canvas;
        RectTransform safe;

        TextMeshProUGUI dayText, clockText, phaseText, goalText, cloverText, spotText, actionText;
        Image phaseIcon, actionIcon, joyBaseImg; string shownVerb = "?", shownSpot;
        RectTransform moreTray, spotChip, cloverIcon; CanvasGroup joyKnobGroup;
        float peekUntil, wiggleUntil; int lastClover = -1;
        Bar hpBar, hungerBar;
        RectTransform goalCard; GameObject partyDot;
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
            session.BattleStarted += ShowBattle;
            OrbitCamera.OverUi = OverUi;
            RefreshHud();
        }

        void OnDestroy() { if (session != null) { session.Changed -= RefreshHud; session.Toast -= ShowToast; session.DayEnded -= ShowReport; session.BattleStarted -= ShowBattle; } if (OrbitCamera.OverUi == (Func<Vector2, bool>)OverUi) OrbitCamera.OverUi = null; }

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

            // ---- HUD v2 (docs/19 主界面, GPT 审稿 2026-11-21): light and uncluttered, every word sits on cream ----
            // status card: day · clock · phase on top, two thin bars with icons below; the numbers show when a value is
            // low (< 25 %) or for 3 s after tapping the card
            var card = Panel(safe, "status", Cream, null, true, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(32, -28), new Vector2(452, 128));
            card.gameObject.AddComponent<Button>().onClick.AddListener(() => { peekUntil = Time.unscaledTime + 3; UpdateBarLabels(); });
            dayText = Label(card, "", FsSub, Ink, true, TextAlignmentOptions.Left); dayText.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(22, -12), new Vector2(116, 50));
            clockText = Label(card, "", 40, WoodDark, true, TextAlignmentOptions.Left); clockText.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(132, -8), new Vector2(140, 56));
            var chip = Panel(card, "phase", Yellow, RoundSmall, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-16, -14), new Vector2(136, 48));
            phaseIcon = KitImage(chip, "sun", 38); phaseIcon.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(8, 0), new Vector2(38, 38));
            phaseText = Label(chip, "", FsSub, WoodDark, true); phaseText.rectTransform.Fill(); phaseText.rectTransform.offsetMin = new Vector2(phaseIcon.enabled ? 42 : 0, 0);
            var heart = KitImage(card, "heart", 40); heart.rectTransform.Place(Vector2.zero, Vector2.zero, new Vector2(16, 14), new Vector2(40, 40));
            hpBar = MakeBar(card, "hp", Red); hpBar.root.Place(Vector2.zero, Vector2.zero, new Vector2(60, 21), new Vector2(158, 26));
            var food = Rect("food", card).Place(Vector2.zero, Vector2.zero, new Vector2(230, 12), new Vector2(44, 44)).gameObject.AddComponent<Image>(); food.sprite = Icon("item_berry"); food.preserveAspect = true; food.raycastTarget = false; food.enabled = food.sprite;
            hungerBar = MakeBar(card, "hunger", Orange); hungerBar.root.Place(Vector2.zero, Vector2.zero, new Vector2(278, 21), new Vector2(158, 26));

            // today's goal: a paper strip with the quest mark, up to two lines
            goalCard = Panel(safe, "goal", Cream, null, false, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(32, -170), new Vector2(560, 104));
            var mark = KitImage(goalCard, "quest_mark", 56); mark.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(12, 0), new Vector2(56, 56));
            goalText = Label(goalCard, "", FsSub, Ink, false, TextAlignmentOptions.Left); goalText.rectTransform.Fill(); goalText.rectTransform.offsetMin = new Vector2(mark.enabled ? 78 : 16, 8); goalText.rectTransform.offsetMax = new Vector2(-14, -8);
            goalText.lineSpacing = -12; goalText.overflowMode = TextOverflowModes.Ellipsis;

            // top right: one cream tray of icon buttons with captions (地图 任务 伙伴 制作 背包 更多); 更多 opens 图鉴 / 设置
            const float CellW = 100, CellH = 120;
            var tray = Panel(safe, "menu", Cream, null, true, true).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-32, -28), new Vector2(CellW * 6 + 24, CellH + 12));
            MenuCell(tray, "hud_map", "地图", () => Open("map"), 0);
            MenuCell(tray, "hud_quest", "任务", () => Open("daily"), 1);
            var pets = MenuCell(tray, "hud_pets", "伙伴", () => OpenParty("care"), 2);
            partyDot = Panel(pets, "dot", Red, Circle, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(30, -12), new Vector2(28, 28)).gameObject;
            UiMotion.Pulse(partyDot.transform, 0.12f, 1.1f);
            MenuCell(tray, "hud_craft", "制作", () => Open("craft"), 3);
            MenuCell(tray, "hud_bag", "背包", () => Open("bag"), 4);
            MenuCell(tray, "hud_more", "更多", () => { moreTray.gameObject.SetActive(!moreTray.gameObject.activeSelf); if (moreTray.gameObject.activeSelf) UiMotion.PopIn(moreTray); }, 5);
            moreTray = Panel(safe, "more", Cream, null, true, true).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-32, -28 - CellH - 22), new Vector2(CellW * 2 + 24, CellH + 12));
            MenuCell(moreTray, "hud_dex", "图鉴", () => Open("dex"), 0);
            MenuCell(moreTray, "hud_settings", "设置", () => Open("settings"), 1);
            moreTray.gameObject.SetActive(false);
            // clover money under the tray
            var clover = Panel(safe, "clover", Cream, null, true, true).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-32, -28 - CellH - 22), new Vector2(200, 62));
            cloverIcon = Clover(clover, 46).Place(new Vector2(0, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(36, 0), new Vector2(46, 46));
            cloverText = Label(clover, "", FsBody, WoodDark, true, TextAlignmentOptions.Right); cloverText.rectTransform.Fill(); cloverText.rectTransform.offsetMin = new Vector2(62, 0); cloverText.rectTransform.offsetMax = new Vector2(-20, 0);
            moreTray.SetAsLastSibling();

            // joystick (visual only; input is read in Update so it works anywhere in the left zone): faint at rest, clearer while used
            joyRest = new Vector2(240, 230);
            var jb = Panel(safe, "joystick", new Color(1, 1, 1, 0.16f), Circle, false); joyBaseImg = jb;
            joyBase = jb.rectTransform.Place(Vector2.zero, new Vector2(0.5f, 0.5f), joyRest, new Vector2(JoyRadius * 2 + 20, JoyRadius * 2 + 20));
            var ring = joyBase.gameObject.AddComponent<Outline>(); ring.effectColor = new Color(0.38f, 0.29f, 0.21f, 0.45f); ring.effectDistance = new Vector2(2, -2);
            joyKnob = Panel(joyBase, "knob", Cream, Circle, false, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(92, 92));
            joyKnobGroup = joyKnob.gameObject.AddComponent<CanvasGroup>(); joyKnobGroup.alpha = 0.9f;

            // action button (honey = the main action): painted icon of the verb, the verb under it; above it a cream chip
            // naming what you stand next to
            actionBtn = Button(safe, "互动", Yellow, WoodDark, FsBody, DoAction, Circle);
            ((RectTransform)actionBtn.transform).Place(new Vector2(1, 0), new Vector2(0.5f, 0.5f), new Vector2(-196, 186), new Vector2(200, 200));
            actionText = actionBtn.GetComponentInChildren<TextMeshProUGUI>();
            actionIcon = KitImage(actionBtn.transform, "act_pick", 96); actionIcon.rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 26), new Vector2(96, 96));
            UiMotion.Bob(actionIcon, 4, 0.9f);
            spotChip = Panel(safe, "spot", Cream, null, false, true).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-48, 304), new Vector2(560, 60));
            spotText = Label(spotChip, "", FsMin, Ink); spotText.rectTransform.Fill(); spotText.rectTransform.offsetMin = new Vector2(20, 4); spotText.rectTransform.offsetMax = new Vector2(-20, -4);
            spotText.textWrappingMode = TextWrappingModes.NoWrap; spotText.overflowMode = TextOverflowModes.Ellipsis;

            toastRoot = Rect("toasts", safe).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-30, -28), new Vector2(620, 400));
            var vl = toastRoot.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 10; vl.childAlignment = TextAnchor.UpperCenter; vl.childControlHeight = true; vl.childControlWidth = false; vl.childForceExpandHeight = false;

            // modal layer
            modal = Rect("modal", transform).Fill();
            dim = modal.gameObject.AddComponent<Image>(); dim.color = new Color(0.08f, 0.05f, 0.03f, 0.66f);   // looks about half as dark after tone mapping
            modal.gameObject.SetActive(false);
            battleView = BattleView.Create(transform);
            battleView.Closed = () => { openPanel = null; RefreshHud(); };
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
                ShowVerb(spot?.verb ?? "互动");
                ShowSpot(spot?.label);
            }
            if (Time.unscaledTime >= nextHud) { nextHud = Time.unscaledTime + 0.2f; RefreshClock(); UpdateBarLabels(); }
            if (cloverIcon) cloverIcon.localRotation = Quaternion.Euler(0, 0, Time.unscaledTime < wiggleUntil ? Mathf.Sin((wiggleUntil - Time.unscaledTime) / 0.35f * Mathf.PI * 3) * 6 : 0);
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
            joyBaseImg.color = new Color(1, 1, 1, active ? 0.3f : 0.16f); joyKnobGroup.alpha = active ? 1 : 0.9f;
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
            if (k.mKey.wasPressedThisFrame) Open("map");
        }

        void DoAction()
        {
            if (openPanel != null || spot == null) return;
            var panel = session.Act(spot);
            if (panel == null || session.Area == null) return;
            if (panel.StartsWith("talk:")) OpenNpc(panel.Substring(5)); else Open(panel);
        }

        // ---------- HUD ----------
        void RefreshClock()
        {
            var s = session.S;
            dayText.text = $"第 {s.day} 天";
            clockText.text = GameTime.Format(s.clock);
            var phase = GameTime.PhaseAt(s.clock);
            phaseText.text = GameTime.PhaseNames[phase];
            var ps = Kit(phase == "night" ? "moon" : "sun"); if (ps && phaseIcon.sprite != ps) phaseIcon.sprite = ps;
        }

        // a button of the HUD menu tray: icon and caption, no disc of its own
        RectTransform MenuCell(RectTransform tray, string icon, string caption, Action act, int i)
        {
            var cell = Panel(tray, "button " + caption, new Color(1, 1, 1, 0), FlatRound, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(12 + i * 100, -6), new Vector2(100, 120));
            var b = cell.gameObject.AddComponent<Button>(); b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => GameAudio.Play("click", 0.8f));
            b.onClick.AddListener(() => act());
            cell.gameObject.AddComponent<UiPress>();
            var img = KitImage(cell, icon, 64); img.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -8), new Vector2(64, 64));
            var c = Label(cell, caption, FsMin, WoodDark, true); c.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 6), new Vector2(100, 36));
            return cell;
        }

        // the chip above the action button: pops in when you step next to something new
        void ShowSpot(string label)
        {
            if (label == shownSpot) return;
            shownSpot = label;
            spotChip.gameObject.SetActive(!string.IsNullOrEmpty(label));
            if (string.IsNullOrEmpty(label)) return;
            int dot = label.IndexOf(" · 点互动");   // the button already says the verb: the chip names the thing
            if (dot > 0) label = label.Substring(0, dot);
            spotText.text = label;
            spotChip.sizeDelta = new Vector2(Mathf.Min(560, spotText.GetPreferredValues(label).x + 48), 60);
            UiMotion.PopIn(spotChip);
        }

        // bar numbers: shown when the value is low or for a moment after tapping the status card
        void UpdateBarLabels()
        {
            var p = session.S.player; bool peek = Time.unscaledTime < peekUntil;
            hpBar.value.enabled = peek || p.hp < p.hpMax * 0.25f;
            hungerBar.value.enabled = peek || p.hunger < p.hungerMax * 0.25f;
        }

        // the action button: painted icon of the verb above, the verb under it (text only when there is no icon)
        void ShowVerb(string verb)
        {
            if (verb == shownVerb) return;
            shownVerb = verb;
            actionText.text = verb;
            var ic = Kit(ActionIcon(verb));
            actionIcon.sprite = ic; actionIcon.enabled = ic;
            var r = actionText.rectTransform;
            if (ic) { r.offsetMin = new Vector2(10, 20); r.offsetMax = new Vector2(-10, -126); actionText.fontSize = FsBody - 2; }
            else { r.offsetMin = new Vector2(6, 10); r.offsetMax = new Vector2(-6, -6); actionText.fontSize = FsBody + 8; }
        }

        void RefreshHud()
        {
            var s = session.S;
            RefreshClock();
            SetBar(hpBar, s.player.hp / (float)s.player.hpMax, $"{s.player.hp}/{s.player.hpMax}");
            SetBar(hungerBar, s.player.hunger / (float)s.player.hungerMax, $"{s.player.hunger}/{s.player.hungerMax}");
            cloverText.text = s.clover.ToString();
            if (lastClover >= 0 && s.clover > lastClover) wiggleUntil = Time.unscaledTime + 0.35f;
            lastClover = s.clover;
            UpdateBarLabels();
            partyDot.SetActive(s.pets.Any(p => Attention(s, p)));
            var goal = Guide.Current(s);
            goalCard.gameObject.SetActive(goal != null);
            if (goal != null) goalText.text = "目标：" + goal.text;
            if (openPanel != null && openPanel != "report" && openPanel != "battle") Fill(openPanel);
        }

        void ShowToast(string text)
        {
            var bg = Panel(toastRoot, "toast", Cream, null, false, true);   // a paper strip (docs/19 提示条)
            var t = Label(bg.transform, text, FsSub, Ink); t.rectTransform.Fill(); t.margin = new Vector4(26, 10, 26, 10);
            var fit = bg.gameObject.AddComponent<LayoutElement>();
            t.ForceMeshUpdate();
            float w = Mathf.Min(620, t.preferredWidth + 60);
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
            if ((openPanel == "report" || openPanel == "battle") && panel != openPanel) return;
            if (openPanel == null) GameAudio.Play("open", 0.7f);
            moreTray.gameObject.SetActive(false);
            if (panel != openPanel)
            {
                itemTab = "all"; qty = 1; selectedShop = selectedShip = null; scrollAt.Clear();
                if (panel == "bag") selectedItem = session.S.inventory.FirstOrDefault()?.id;
            }
            openPanel = panel;
            modal.gameObject.SetActive(true);
            session.PauseFor("menu");
            if (mover) mover.enabled = false;
            PlayerMover.Stick = Vector2.zero;
            Fill(panel);
        }

        public void Close()
        {
            if (openPanel == "battle") return;
            poppedFor = null;
            SetHud(true);
            if (openPanel == "report") { openPanel = null; modal.gameObject.SetActive(false); session.StartNewDay(); if (mover) mover.enabled = true; return; }
            openPanel = null;
            modal.gameObject.SetActive(false);
            session.ResumeFor("menu");
            if (mover) mover.enabled = true;
            GameAudio.Play("close", 0.6f);
        }

        RectTransform NewBox(string title, Vector2 size)
        {
            if (box) Destroy(box.gameObject);
            dim.color = new Color(0.08f, 0.05f, 0.03f, 0.66f);
            box = Panel(modal, "panel", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -10), size);
            Decorate(box);
            if (poppedFor != openPanel) { UiMotion.PopIn(box); poppedFor = openPanel; }
            var head = Panel(box, "title", Yellow, null, false, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(0, -6), new Vector2(Mathf.Min(520, size.x - 160), 76));
            var t = Label(head, title, FsTitle, WoodDark, true); t.rectTransform.Fill();
            if (openPanel != "report") ((RectTransform)CloseButton(box, Close).transform).Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-16, -16), new Vector2(104, 104));
            return box;
        }

        // the panel ornaments of the kit: a cloud sitting on the top-left edge, a sprouting cloud in the bottom-right corner
        public static void Decorate(RectTransform panel)
        {
            var cloud = KitImage(panel, "orn_cloud", 150); cloud.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 0), new Vector2(30, -30), new Vector2(150, 85));
            var sprout = KitImage(panel, "orn_sprout", 76); sprout.rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-34, -20), new Vector2(76, 71));
        }

        // the HUD (all of the safe area but the toasts) steps aside while talking to a resident; only what was showing
        // comes back (the 更多 tray and the spot chip keep their own state)
        readonly List<GameObject> hudHidden = new List<GameObject>();
        void SetHud(bool on)
        {
            if (!on)
            {
                if (hudHidden.Count > 0) return;
                foreach (Transform c in safe) if (c != toastRoot && c.gameObject.activeSelf) { hudHidden.Add(c.gameObject); c.gameObject.SetActive(false); }
            }
            else { foreach (var g in hudHidden) if (g) g.SetActive(true); hudHidden.Clear(); }
        }

        void Fill(string panel)
        {
            scrollPending.Clear();
            SetHud(!panel.StartsWith("npc:"));
            switch (panel)
            {
                case "bag": FillBag(); break;
                case "craft": FillCraft(); break;
                case "seeds": FillStore("seeds"); break;
                case "ship": FillShip(); break;
                case "storage": FillStorage(); break;
                default: FillMore(panel); break;
            }
            ApplyScrolls();
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
            var row = Panel(list, "row", CreamDark, RoundSmall, false).rectTransform; row.sizeDelta = new Vector2(0, 120);
            var img = Rect("icon", row).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 0), new Vector2(92, 92)).gameObject.AddComponent<Image>(); img.sprite = Icon(icon); img.preserveAspect = true; img.raycastTarget = false; img.enabled = img.sprite;
            var n = Label(row, name, FsBody, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(130, 58); n.rectTransform.offsetMax = new Vector2(-250, -6);
            var d = Label(row, detail, FsMin, Ink, false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(130, 6); d.rectTransform.offsetMax = new Vector2(-250, -60);
            if (button == null) return;
            var b = Button(row, button, enabled ? Yellow : CreamDark, WoodDark, FsSub, onClick); b.interactable = enabled;
            ((RectTransform)b.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-16, 0), new Vector2(216, TouchMin));
        }

        static string Name(string id) => GameData.Item(id)?.name ?? id;

    }
}
