// Goals and way-finding on the HUD (docs/20 第三节 1, 第 1 批):
//   - the goal note always shows the goal of Rules/Goals (tap it: a small card to pick which goal to follow)
//   - a quest mark floats over the place of the followed goal; off screen, an arrow on the screen edge points to it;
//     a chip under the note says how far it is, or which way out to take when it is on another island
//   - a soft honey ring on the ground under the thing the action button would use
//   - on an expedition, a strip slides in before the fog (the walk back to the airship + 30 minutes, at the latest 19:00)
//   - items you get fly from where they came from into the bag button
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Rules;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public partial class GameUI
    {
        static string followGoal;                 // the goal the player picked (survives scene changes); null = the first
        static int warnedDay = -1;                // the fog strip shows once a day
        static bool followShip;                   // 「指路回飞艇」 from the fog strip, until you leave the island

        RectTransform goalMarker, goalArrow, goalChip, nightStrip, bagCell, flyLayer;
        TextMeshProUGUI goalChipText, nightText;
        GoalView goal; Vector3? goalAt; bool goalHere;
        SpriteRenderer ring;
        float stripUntil;

        void BuildGuide()
        {
            goalCard.GetComponent<Image>().raycastTarget = true;
            goalCard.gameObject.AddComponent<Button>().onClick.AddListener(() => { GameAudio.Play("click", 0.8f); Open("goals"); });
            goalCard.gameObject.AddComponent<UiPress>();
            goalChip = Panel(safe, "goal distance", Picked, null, false, true).rectTransform.Place(new Vector2(0, 1), new Vector2(1, 1), new Vector2(32 + 560, -170 - 104 - 8), new Vector2(220, 50));
            goalChipText = Label(goalChip, "", FsMin, WoodDark, true); goalChipText.rectTransform.Fill(); goalChipText.rectTransform.offsetMin = new Vector2(14, 0); goalChipText.rectTransform.offsetMax = new Vector2(-14, 0);
            goalChipText.textWrappingMode = TextWrappingModes.NoWrap;

            // the marker over the goal's place and the edge arrow (under the panels, above the world)
            flyLayer = Rect("world marks", safe).Fill(); flyLayer.SetAsFirstSibling();
            goalMarker = Rect("goal mark", flyLayer).Place(Vector2.zero, new Vector2(0.5f, 0), Vector2.zero, new Vector2(80, 80));
            var mk = KitImage(goalMarker, "quest_mark", 80); mk.rectTransform.Fill();
            UiMotion.Bob(mk, 8, 0.8f);
            goalArrow = Rect("goal arrow", flyLayer).Place(Vector2.zero, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(96, 96));
            var ar = goalArrow.gameObject.AddComponent<Image>(); ar.sprite = Pointer; ar.color = Yellow; ar.raycastTarget = false;
            var arMark = KitImage(goalArrow, "quest_mark", 44); arMark.rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-8, 0), new Vector2(44, 44));
            goalMarker.gameObject.SetActive(false); goalArrow.gameObject.SetActive(false);

            // the ground ring (a flat sprite in the world)
            var rg = new GameObject("action ring"); ring = rg.AddComponent<SpriteRenderer>();
            ring.sprite = GroundRing; ring.color = new Color(1f, 0.86f, 0.42f, 0.9f); ring.sortingOrder = 50;
            rg.transform.rotation = Quaternion.Euler(90, 0, 0); rg.SetActive(false);

            // the fog strip: cream with an orange edge, the moon, a line, two small buttons
            // between the status card (ends at x 484) and the menu tray (starts at 1920 − 656): 740 wide, centred at −100
            nightStrip = Panel(safe, "fog strip", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-100, -28), new Vector2(740, 104));
            Panel(nightStrip, "edge", Orange, FlatSmall, false).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(12, 76));
            var moon = KitImage(nightStrip, "moon", 60); moon.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(32, 0), new Vector2(60, 60));
            nightText = Label(nightStrip, "", FsMin, Ink, false, TextAlignmentOptions.Left); nightText.rectTransform.Fill(); nightText.rectTransform.offsetMin = new Vector2(100, 6); nightText.rectTransform.offsetMax = new Vector2(-300, -6);
            nightText.lineSpacing = -8;
            var go = Button(nightStrip, "指路回飞艇", Yellow, WoodDark, FsMin, () => { followShip = true; nightStrip.gameObject.SetActive(false); RefreshGoal(); });
            ((RectTransform)go.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-124, 0), new Vector2(164, 80));
            var camp = Button(nightStrip, "扎营", CreamDark, WoodDark, FsMin, () => { nightStrip.gameObject.SetActive(false); CampHere(); });
            ((RectTransform)camp.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-12, 0), new Vector2(104, 80));
            nightStrip.gameObject.SetActive(false);
            if (session.S.player.area != "expedition") followShip = false;

            session.ItemGained += FlyToBag;
        }

        void CampHere()
        {
            if (session.Area is ExpeditionArea ex && Inventory.CountOf(session.S.inventory, "item_campfire") > 0) ex.PlaceCampfireNear();
            else Open("craft");
        }

        // ---------- the followed goal ----------
        void RefreshGoal()
        {
            var s = session.S;
            goal = Goals.Pick(s, followGoal);
            if (followShip && s.player.area == "expedition") goal = new GoalView { id = "ship", line = "guide", text = "起雾前回到飞艇", area = "expedition", place = "airship" };
            goalCard.gameObject.SetActive(goal != null);
            goalAt = null; goalHere = false;
            if (goal == null) { goalChip.gameObject.SetActive(false); return; }
            string line = Goals.LineNames.TryGetValue(goal.line, out var ln) && goal.line != "guide" ? ln + "：" : "目标：";
            goalText.text = line + goal.text + (goal.have >= 0 ? $"（{goal.have}/{goal.need}）" : "");
            var area = session.Area;
            if (goal.area == null || area == null || !session.player) { goalChip.gameObject.SetActive(false); return; }
            goalHere = goal.area == area.Id;
            string place = goalHere ? goal.place : Goals.Exit(area.Id, goal.area);
            if (place != null) goalAt = area.FindPlace(place, session.player.position);
            goalChip.gameObject.SetActive(true);
            if (!goalHere) goalChipText.text = $"先去{Goals.AreaName(NextArea(area.Id, goal.area))} ›";
        }

        static string NextArea(string from, string to) => from == "home" ? to : "home";

        // every frame: the marker / arrow follow the camera, the chip counts the metres, the ring sits under the spot
        void UpdateGuide()
        {
            var cam = Camera.main;
            bool show = openPanel == null && session.Battle == null && goalAt.HasValue && cam && session.player;
            if (show)
            {
                var target = goalAt.Value;
                float dist = Vector2.Distance(new Vector2(target.x, target.z), new Vector2(session.player.position.x, session.player.position.z));
                if (goalHere) goalChipText.text = dist < 2.5f ? "就在这里" : $"{Mathf.RoundToInt(dist)} 米 ›";
                show = dist > 2.5f;
                if (show) PlaceMarker(cam, target + Vector3.up * 2.2f);
            }
            if (!show) { goalMarker.gameObject.SetActive(false); goalArrow.gameObject.SetActive(false); }

            bool ringOn = openPanel == null && spot != null && spot.pos != Vector3.zero && spot.kind != "airship" && session.Battle == null;   // the airship floats off the edge: no ring in the air
            ring.gameObject.SetActive(ringOn);
            if (ringOn)
            {
                float k = 1 + Mathf.Sin(Time.unscaledTime * 4) * 0.06f;
                ring.transform.position = new Vector3(spot.pos.x, spot.pos.y + 0.06f, spot.pos.z);
                ring.transform.localScale = Vector3.one * 1.5f * k;
            }

            if (nightStrip.gameObject.activeSelf && Time.unscaledTime > stripUntil) nightStrip.gameObject.SetActive(false);
            toastRoot.anchoredPosition = new Vector2(-30, nightStrip.gameObject.activeSelf ? -146 : -28);
        }

        void PlaceMarker(Camera cam, Vector3 world)
        {
            var sp = cam.WorldToScreenPoint(world);
            var area = safe.rect;
            float scale = canvas.scaleFactor > 0 ? canvas.scaleFactor : 1;
            var local = (new Vector2(sp.x, sp.y) - Screen.safeArea.min) / scale;
            if (sp.z < 0) local = new Vector2(area.width, area.height) - local;   // behind the camera: mirror
            const float Inset = 110;
            bool onScreen = sp.z > 0 && local.x > Inset && local.x < area.width - Inset && local.y > Inset && local.y < area.height - Inset;
            goalMarker.gameObject.SetActive(onScreen);
            goalArrow.gameObject.SetActive(!onScreen);
            if (onScreen) { goalMarker.anchoredPosition = local; return; }
            var centre = new Vector2(area.width, area.height) * 0.5f;
            var dir = (local - centre); if (dir.sqrMagnitude < 1) dir = Vector2.up;
            // where the ray from the centre leaves the inset rectangle
            float tx = dir.x != 0 ? (centre.x - Inset) / Mathf.Abs(dir.x) : float.MaxValue, ty = dir.y != 0 ? (centre.y - Inset) / Mathf.Abs(dir.y) : float.MaxValue;
            goalArrow.anchoredPosition = centre + dir * Mathf.Min(tx, ty);
            goalArrow.localEulerAngles = new Vector3(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg);
            goalArrow.GetChild(0).localEulerAngles = -goalArrow.localEulerAngles;   // the mark inside stays upright
        }

        // ---------- the fog strip (expedition) ----------
        void CheckFog()
        {
            var s = session.S;
            if (s.player.area != "expedition" || !(session.Area is ExpeditionArea ex) || !session.player) return;
            bool late = s.clock >= 19 * 60 || s.clock < GameTime.DayStart;
            clockText.color = late && !Night.IsFoggy(s.clock) ? Orange : Night.IsFoggy(s.clock) ? Hex("8a7ab8") : WoodDark;
            if (warnedDay == s.day || Night.IsFoggy(s.clock) || s.clock < 12 * 60 || session.Battle != null) return;
            var ship = ex.FindPlace("airship", session.player.position) ?? session.player.position;
            float metres = Vector3.Distance(ship, session.player.position);
            float pace = mover ? mover.speed : 170f / 48f;
            int walk = Mathf.CeilToInt(metres * 1.4f / pace / (float)(GameTime.MsPerGameMin / 1000));   // paths wind: ×1.4
            int warnAt = Mathf.Min(19 * 60, GameTime.NightStart - 30 - walk);
            if (s.clock < warnAt) return;
            warnedDay = s.day;
            int left = GameTime.NightStart - s.clock;
            nightText.text = $"<b>{(left >= 60 ? $"{left / 60} 小时" : "")}{(left % 60 > 0 ? $"{left % 60} 分钟" : "")}后起雾</b>\n飞艇 {Mathf.RoundToInt(metres)} 米，约走 {walk} 分钟";
            nightStrip.gameObject.SetActive(true); UiMotion.PopIn(nightStrip);
            stripUntil = Time.unscaledTime + 14;
            GameAudio.Play("open", 0.6f);
        }

        // ---------- the goals card ----------
        void FillGoals()
        {
            var s = session.S;
            var all = Goals.All(s);
            var b = NewBox("现在可以做", new Vector2(1180, 220 + Mathf.Max(1, all.Count) * 136));
            var list = Rect("goals", b).Fill(); list.offsetMin = new Vector2(48, 40); list.offsetMax = new Vector2(-48, -110);
            var vl = list.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 16; vl.childControlHeight = false; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            if (all.Count == 0) { Label(list, "今天的事都做完了，随便逛逛吧", FsBody, Ink).rectTransform.sizeDelta = new Vector2(0, 100); return; }
            var cur = Goals.Pick(s, followGoal);
            foreach (var g in all)
            {
                bool on = cur != null && g.id == cur.id && !followShip;
                var row = Panel(list, "goal", on ? Picked : CreamDark, RoundSmall, false).rectTransform; row.sizeDelta = new Vector2(0, 120);
                var tag = Panel(row, "line", g.line == "daily" ? Sky : g.line == "town" ? Grass : Yellow, RoundSmall, false).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 0), new Vector2(104, 56));
                Label(tag, Goals.LineNames[g.line], FsMin, WoodDark, true).rectTransform.Fill();
                var t = Label(row, g.text + (g.have >= 0 ? $"（{g.have}/{g.need}）" : ""), FsSub, Ink, false, TextAlignmentOptions.Left); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(140, 8); t.rectTransform.offsetMax = new Vector2(-240, -8);
                var where = g.area == null ? "在面板里做" : g.area == session.Area?.Id ? "就在这个岛" : "在" + Goals.AreaName(g.area);
                if (on) { Label(row, "正在指路", FsMin, GrassDark, true).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-24, 0), new Vector2(190, 50)); continue; }
                var id = g.id;
                var btn = Button(row, g.area == null ? "看看" : "指路", Yellow, WoodDark, FsSub, () => { followGoal = id; followShip = false; Close(); RefreshGoal(); });
                ((RectTransform)btn.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-16, 0), new Vector2(200, TouchMin));
                Label(row, where, FsMin, Hex("75604d"), false, TextAlignmentOptions.Right).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-232, 4), new Vector2(240, 36));
            }
        }

        // ---------- items fly into the bag ----------
        void FlyToBag(string itemId, Vector3 world)
        {
            var cam = Camera.main;
            if (!cam || !bagCell || openPanel != null) return;
            var icon = Icon(itemId); if (!icon) return;
            var sp = cam.WorldToScreenPoint(world + Vector3.up * 0.8f); if (sp.z < 0) return;
            float scale = canvas.scaleFactor > 0 ? canvas.scaleFactor : 1;
            var img = Rect("fly " + itemId, flyLayer).gameObject.AddComponent<Image>(); img.sprite = icon; img.preserveAspect = true; img.raycastTarget = false;
            var r = img.rectTransform; r.anchorMin = r.anchorMax = Vector2.zero; r.sizeDelta = new Vector2(84, 84);
            var from = (new Vector2(sp.x, sp.y) - Screen.safeArea.min) / scale;
            var corners = new Vector3[4]; bagCell.GetWorldCorners(corners);
            var to = ((Vector2)RectTransformUtility.WorldToScreenPoint(null, (corners[0] + corners[2]) * 0.5f) - Screen.safeArea.min) / scale;
            flying.Add((r, from, to, Time.unscaledTime + flying.Count * 0.08f));
        }

        readonly List<(RectTransform r, Vector2 from, Vector2 to, float t0)> flying = new List<(RectTransform, Vector2, Vector2, float)>();
        void UpdateFlying()
        {
            for (int i = flying.Count - 1; i >= 0; i--)
            {
                var (r, from, to, t0) = flying[i];
                float k = Mathf.Clamp01((Time.unscaledTime - t0) / 0.7f);
                if (!r) { flying.RemoveAt(i); continue; }
                float e = k * k * (3 - 2 * k);
                var mid = (from + to) * 0.5f + new Vector2(0, 160);
                r.anchoredPosition = Vector2.Lerp(Vector2.Lerp(from, mid, e), Vector2.Lerp(mid, to, e), e);   // a little arc
                r.localScale = Vector3.one * (k < 0.15f ? Mathf.Lerp(0.4f, 1.15f, k / 0.15f) : Mathf.Lerp(1.15f, 0.55f, (k - 0.15f) / 0.85f));
                if (k < 1) continue;
                Destroy(r.gameObject); flying.RemoveAt(i);
                bagCell.localScale = Vector3.one * 1.12f; bagPunch = Time.unscaledTime;
            }
            if (bagCell && bagPunch > 0)
            {
                float t = (Time.unscaledTime - bagPunch) / 0.25f;
                bagCell.localScale = Vector3.one * Mathf.Lerp(1.12f, 1, t);
                if (t >= 1) bagPunch = -9;
            }
        }
        float bagPunch = -9;
    }
}
