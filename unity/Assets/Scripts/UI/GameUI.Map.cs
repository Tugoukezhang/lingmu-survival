// The island map and arranging the room (docs/19 地图 / 布置).
//   地图 — a photo of the real island taken by a camera straight above it, in a rounded frame, with sign tags for the
//          places that matter, icon pins for the many small ones (chests, fires), a "你在这里" pin and a card beside it.
//   布置 — a drawer on the right so the room stays in view: furniture in the bag / already placed, and the tools
//          (放在面前, 移到面前, 旋转, 收回) for the chosen piece.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Rules;
using Lingmu.World;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public partial class GameUI
    {
        // map marks: icon, label, and whether it gets a sign with words (false = a small icon pin)
        static readonly Dictionary<string, (string icon, string label, bool sign)> MapKinds = new Dictionary<string, (string, string, bool)>
        {
            { "airship", ("act_airship", "飞艇", true) }, { "dock", ("act_airship", "飞艇码头", true) }, { "fire", ("act_fire", "营火", false) }, { "campfire", ("act_fire", "营火", true) },
            { "tent", ("act_sleep", "帐篷", true) }, { "lostbag", ("act_chest", "失物包", true) }, { "chest", ("act_chest", "宝箱", false) }, { "thorn", ("act_build", "荆棘", false) },
            { "npc", ("act_talk", "居民", false) }, { "door", ("act_door", "门", true) }, { "bridge", ("act_build", "吊桥", true) }, { "home", ("act_door", "回家园", true) },
            { "north", ("lock", "断桥", true) }, { "bed", ("act_sleep", "床", true) }, { "storage", ("act_chest", "仓库", true) }, { "ship", ("act_ship", "出货箱", true) },
            { "seeds", ("act_seed", "种子摊", true) }, { "expand", ("act_build", "扩建用地", true) }, { "decorate", ("act_build", "布置板", true) },
        };
        RenderTexture mapPhoto;

        void FillMap()
        {
            var id = session.Area?.Id;
            var (title, about) = id switch
            {
                "home" => ("家园岛", "你的小家。种地、出货、照顾伙伴，从码头坐飞艇去远征。"),
                "town" => ("风铃小镇", "居民们住在这里。聊天、送礼、接委托，杂货铺每天有新的技能书。"),
                "house" => ("我的小屋", "摆上家具，把小屋布置成你喜欢的样子。"),
                _ => ("雾林浮岛", "采集、开宝箱、抓野生宠物。20 点起雾，天黑前回到飞艇。"),
            };
            var b = NewBox("地图 · " + title, new Vector2(1660, 920));
            var walk = mover ? mover.map : null;
            if (!walk || walk.Cols == 0) { var t0 = Label(b, "这里没有地图", 34, Ink); t0.rectTransform.Fill(); return; }
            int cols = walk.Cols, rows = walk.Rows;
            float T = HomeIslandLayout.TileSize;
            float cell = Mathf.Floor(Mathf.Min(1080f / cols, 760f / rows));
            int pw = Mathf.RoundToInt(cols * cell), ph = Mathf.RoundToInt(rows * cell);

            // the photo: an orthographic camera straight above the island, the UI left out
            if (mapPhoto && (mapPhoto.width != pw || mapPhoto.height != ph)) { mapPhoto.Release(); mapPhoto = null; }
            if (!mapPhoto) mapPhoto = new RenderTexture(pw, ph, 24) { name = "map photo" };
            var cam = new GameObject("map camera").AddComponent<Camera>();
            cam.enabled = false; cam.orthographic = true; cam.orthographicSize = rows * T / 2f; cam.aspect = cols / (float)rows;
            cam.transform.SetPositionAndRotation(new Vector3(cols * T / 2f, 80, -rows * T / 2f), Quaternion.Euler(90, 0, 0));
            cam.nearClipPlane = 1; cam.farClipPlane = 300; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Hex("bfe3ef"); cam.cullingMask = ~(1 << 5);
            bool fog = RenderSettings.fog; RenderSettings.fog = false;   // from 80 m up the scene fog would wash the photo out
            cam.targetTexture = mapPhoto; cam.Render(); cam.targetTexture = null;
            RenderSettings.fog = fog;
            Destroy(cam.gameObject);

            var frame = Panel(b, "frame", Hex("f6efe0"), null, false, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(40, -96), new Vector2(pw + 32, ph + 32));
            var mask = Panel(frame, "mask", Color.white, FlatRound, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -16), new Vector2(pw, ph));
            mask.gameObject.AddComponent<Mask>().showMaskGraphic = false;
            var photo = Rect("photo", mask).Fill().gameObject.AddComponent<RawImage>(); photo.texture = mapPhoto; photo.raycastTarget = false;
            var marks = Rect("marks", frame).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -16), new Vector2(pw, ph));
            Vector2 At(Vector3 p) => new Vector2(p.x / T * cell, p.z / T * cell);   // world x east, z north (rows run south)

            var legend = new List<(string icon, string label)>();
            var signed = new HashSet<string>();
            var taken = new List<Rect>();                       // signs step aside so they do not cover each other
            var pins = new List<(Vector2 at, string icon)>();
            Vector2 me = session.player ? At(session.player.position) : new Vector2(-999, -999);
            if (session.player) taken.Add(new Rect(me.x - 64, me.y + 28, 128, 48));
            foreach (var sp in session.Area.MapSpots())
            {
                if (!MapKinds.TryGetValue(sp.kind, out var k)) continue;
                if (!legend.Any(l => l.label == k.label)) legend.Add((k.icon, k.label));
                var at = At(sp.pos);
                if (k.sign && signed.Add(k.label)) Sign(marks, at, k.icon, k.label, taken);
                else if (!pins.Any(q => q.icon == k.icon && Vector2.Distance(q.at, at) < 44)) { pins.Add((at, k.icon)); Pin(marks, at, k.icon); }   // one pin for a cluster
            }
            if (session.player)
            {
                var dot = Panel(marks, "you", Yellow, Circle, false, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 0.5f), me, new Vector2(56, 56));
                KitImage(dot, "hud_pets", 34).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(34, 34));
                UiMotion.Pulse(dot, 0.1f, 1.2f);
                Chip(marks, "你在这里", Red, 128, 40).Place(new Vector2(0, 1), new Vector2(0.5f, 0), me + new Vector2(0, 32), new Vector2(128, 40));
            }

            // the card beside the map: name, a line about the place, what the marks mean
            var card = Panel(b, "card", Hex("f6efe0"), null, false, true).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-40, -96), new Vector2(Mathf.Min(460, 1660 - pw - 150), 780));
            float cw = card.sizeDelta.x;
            var nm = Label(card, title, FsTitle + 4, WoodDark, true, TextAlignmentOptions.Left); nm.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -20), new Vector2(cw - 56, 64));
            var ab = Label(card, about, FsSub, Ink, false, TextAlignmentOptions.TopLeft); ab.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -92), new Vector2(cw - 56, 130));
            float y = -236;
            foreach (var (icon, label) in legend.Take(9))
            {
                KitImage(card, icon, 44).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, y), new Vector2(44, 44));
                Label(card, label, FsSub, WoodDark, false, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(84, y - 2), new Vector2(cw - 110, 46));
                y -= 54;
            }
            if (id == "expedition" && Explore.TreasureSense(session.S) == 0)
            {
                var hint = Label(card, "带上会寻宝的宠物，地图上会标出宝箱", FsMin, Note, false, TextAlignmentOptions.BottomLeft);
                hint.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(28, 24), new Vector2(cw - 56, 80));
            }
        }

        // a sign tag: cream chip with icon and word on a little post, its foot on the place
        void Sign(RectTransform parent, Vector2 at, string icon, string label, List<Rect> taken)
        {
            var chip = Panel(parent, "sign " + label, Cream, RoundSmall, false, true).rectTransform;
            var t = Label(chip, label, FsMin, WoodDark, true, TextAlignmentOptions.Left); t.textWrappingMode = TextWrappingModes.NoWrap;
            float w = t.GetPreferredValues(label).x + 70;
            // the first free height above (or below) the place; the post stretches to reach it
            float lift = 20;
            foreach (var tryLift in new[] { 20f, 76f, -96f, 132f, -152f, 188f })
            {
                var r = new Rect(at.x - w / 2, at.y + tryLift, w, 50);
                if (!taken.Any(o => o.Overlaps(r))) { lift = tryLift; break; }
            }
            taken.Add(new Rect(at.x - w / 2, at.y + lift, w, 50));
            float postLen = lift >= 0 ? lift + 2 : -lift - 50;
            var post = Panel(parent, "post", WoodMid, FlatSmall, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, lift >= 0 ? 0 : 1), at, new Vector2(6, Mathf.Max(8, postLen)));
            post.SetAsFirstSibling();
            chip.Place(new Vector2(0, 1), new Vector2(0.5f, 0), at + new Vector2(0, lift), new Vector2(w, 50));
            t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(54, 0);
            KitImage(chip, icon, 38).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(38, 38));
        }

        void Pin(RectTransform parent, Vector2 at, string icon)
        {
            var p = Panel(parent, "pin", Cream, Circle, false, true).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 0.5f), at, new Vector2(46, 46));
            KitImage(p, icon, 30).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(30, 30));
        }

        // ---------- arranging the room: a drawer on the right ----------
        string decoTab = "bag"; string selectedFurn; int selectedPlaced = -1;

        RectTransform NewDrawer(string title, float width)
        {
            if (box) Destroy(box.gameObject);
            dim.color = new Color(0.08f, 0.05f, 0.03f, 0.18f);   // the room stays in view
            box = Panel(modal, "drawer", Cream, null, true, true).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-24, -10), new Vector2(width, 960));
            if (poppedFor != openPanel) { UiMotion.PopIn(box); poppedFor = openPanel; }
            var head = Panel(box, "title", Yellow, null, false, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(0, -6), new Vector2(Mathf.Min(420, width - 160), 76));
            Label(head, title, FsTitle, WoodDark, true).rectTransform.Fill();
            ((RectTransform)CloseButton(box, Close).transform).Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-16, -16), new Vector2(104, 104));
            return box;
        }

        void FillDecorate()
        {
            var s = session.S;
            var room = session.Area as HouseArea;
            var b = NewDrawer("布置小屋", 760);
            var bag = s.inventory.Where(x => House.IsFurniture(x.id)).ToList();
            var placed = House.Of(s).items;
            if (selectedPlaced >= placed.Count) selectedPlaced = -1;
            // two tabs: in the bag / already placed
            void Tab(string key, string label, int i)
            {
                var tb = Button(b, label, decoTab == key ? Picked : Cream, WoodDark, FsSub, () => { decoTab = key; selectedFurn = null; selectedPlaced = -1; Fill("decorate"); });
                ((RectTransform)tb.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36 + i * 344, -92), new Vector2(330, TouchMin));
            }
            Tab("bag", $"背包里  {bag.Sum(x => x.count)}", 0); Tab("placed", $"已摆好  {placed.Count}", 1);
            var grid = SlotGrid(b, "deco " + decoTab, new Vector2(36, -200), new Vector2(688, 460), new Vector2(124, 124), 12, 5);
            if (decoTab == "bag")
            {
                if (selectedFurn == null || !bag.Any(x => x.id == selectedFurn)) selectedFurn = bag.FirstOrDefault()?.id;
                foreach (var st in bag) { var fid = st.id; Slot(grid, fid, st.count, fid == selectedFurn, () => { selectedFurn = fid; Fill("decorate"); }); }
            }
            else
            {
                if (selectedPlaced < 0 && placed.Count > 0) selectedPlaced = 0;
                for (int i = 0; i < placed.Count; i++) { int idx = i; Slot(grid, placed[i].id, 1, idx == selectedPlaced, () => { selectedPlaced = idx; Fill("decorate"); }); }
            }
            // the chosen piece and what to do with it
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 30), new Vector2(688, 260));
            string pick = decoTab == "bag" ? selectedFurn : selectedPlaced >= 0 ? placed[selectedPlaced].id : null;
            if (pick == null)
            {
                Hint(info, decoTab == "bag" ? "还没有家具：在家园的工作台做，或者去小镇杂货铺买" : "还没有摆家具", new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(640, 90));
                return;
            }
            var art = Rect("art", info).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(110, 110)).gameObject.AddComponent<Image>(); art.sprite = Icon(pick); art.preserveAspect = true; art.raycastTarget = false;
            Label(info, Name(pick), FsTitle, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(146, -20), new Vector2(520, 56));
            if (decoTab == "bag")
            {
                Label(info, "会放在你面前的格子上；放不下时换个位置再试", FsMin, Note, false, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(146, -78), new Vector2(520, 60));
                var put = Button(info, "放在面前", Yellow, WoodDark, FsBody, () => room?.PlaceInFront(pick));
                ((RectTransform)put.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-20, 20), new Vector2(260, 96));
                put.interactable = room != null;
                if (room == null) Label(info, "进小屋后才能摆放", FsMin, Red, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(20, 40), new Vector2(360, 50));
            }
            else
            {
                var it = placed[selectedPlaced]; int idx = selectedPlaced;
                Label(info, $"摆在第 {it.x + 1} 列第 {it.y + 1} 行", FsMin, Note, false, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(146, -78), new Vector2(520, 44));
                var tools = new (string label, string icon, Action act)[] { ("移到面前", "act_build", () => room?.MoveInFront(idx)), ("旋转", "sparkle", () => room?.Rotate(idx)), ("收回", "act_chest", () => { room?.PickUp(idx); selectedPlaced = -1; }) };
                for (int i = 0; i < tools.Length; i++)
                {
                    var (label, icon, act) = tools[i];
                    var tb = IconPill(info, label, Kit(icon), Yellow, true, act, 208);
                    ((RectTransform)tb.transform).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(20 + i * 222, 20), new Vector2(208, TouchMin));
                    tb.interactable = room != null;
                }
            }
        }
    }
}
