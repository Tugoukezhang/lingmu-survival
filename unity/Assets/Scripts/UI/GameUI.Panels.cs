// More panels for the in-game screen: the battle, campfire, airship dock, partners (pets), residents (talk, gifts,
// quests), the general store, building (home expansion, the town bridge) and arranging the room.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.Rules;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public partial class GameUI
    {
        BattleView battleView;
        string selectedPet;

        void ShowBattle(BattleState b)
        {
            if (openPanel != null && openPanel != "battle") { modal.gameObject.SetActive(false); session.ResumeFor("menu"); }
            openPanel = "battle";
            PlayerMover.Stick = Vector2.zero;
            battleView.transform.SetAsLastSibling();
            battleView.Show(session, b);
        }

        void FillMore(string panel)
        {
            if (panel.StartsWith("npc:")) { FillNpc(panel.Substring(4)); return; }
            switch (panel)
            {
                case "camp": FillCamp(); break;
                case "dock": FillDock(); break;
                case "party": FillParty(); break;
                case "dex": FillDex(); break;
                case "shop": FillShop(); break;
                case "expand": FillBuild("扩建家园", Progress.ExpandCost, "把家园岛东边的空地买下来，农田会变大", () => Progress.BuyExpansion(session.S), session.S.world?.expanded ?? false); break;
                case "repair": FillBuild("修好小镇的桥", Progress.BridgeCost, "阿栗会帮你一起修，修好就能去更远的地方", () => Progress.RepairBridge(session.S), session.S.world?.bridge ?? false); break;
                case "decorate": FillDecorate(); break;
                case "daily": FillDaily(); break;
                case "map": FillMap(); break;
                case "settings": FillSettings(); break;
            }
        }

        // ---------- campfire on an expedition island ----------
        void FillCamp()
        {
            var ex = session.Area as ExpeditionArea;
            var s = session.S;
            var f = Camp.Fires(s).Find(x => x.id == ex?.CampFireId);
            var b = NewBox("营地", new Vector2(1000, 640));
            if (f == null) { Close(); return; }
            int left = Camp.FireLeft(s, f), wood = Camp.WoodToDawn(s, f);
            bool tent = Inventory.CountOf(s.inventory, "item_tent") > 0;
            string info = (left > 0 ? $"营火还能烧 {left / 60} 小时 {left % 60} 分" : "营火已经熄灭了") + "\n" +
                (wood > 0 ? $"撑到明早 6:00 还要 {wood} 根木材" : "够烧到天亮了") + $"（背包里有 {Inventory.CountOf(s.inventory, "item_wood")} 根）\n" +
                (tent ? "有帐篷：火够烧到天亮就能在这里睡" : "没有帐篷：在家园工作台用布 4 + 木材 6 做一顶");
            var t = Label(b, info, 32, Ink, false, TextAlignmentOptions.Center); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(50, 160); t.rectTransform.offsetMax = new Vector2(-50, -110);
            var id = f.id;
            var add = Button(b, "添柴（木材 −1）", Yellow, WoodDark, 32, () => ex.AddWood(id)); ((RectTransform)add.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-14, 40), new Vector2(340, 96));
            add.interactable = Inventory.CountOf(s.inventory, "item_wood") > 0;
            var sleep = Button(b, "在帐篷里睡觉", Grass, Color.white, 32, () => { var c = Camp.CanCampSleep(s, id); if (c.ok) { openPanel = null; modal.gameObject.SetActive(false); session.ResumeFor("menu"); if (mover) mover.enabled = true; } ex.CampSleep(id); }); ((RectTransform)sleep.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(14, 40), new Vector2(340, 96));
            sleep.interactable = tent && wood == 0;
        }

        // ---------- airship dock at home ----------
        void FillDock()
        {
            var s = session.S;
            var b = NewBox("飞艇码头", new Vector2(1000, 660));
            int lost = Travel.LostBagCount(s);
            string info = $"现在 {GameTime.Format(s.clock)}，飞一趟要 1 小时。\n20 点会起雾，雾里有雾怪；天黑前回来，或者带够木材和帐篷在岛上过夜。";
            if (s.expedition != null && lost > 0) info += $"\n\n上次的岛上还有你的失物包（{lost} 件）。去新的岛，失物包就找不回来了。";
            var t = Label(b, info, FsBody, Ink); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(50, 160); t.rectTransform.offsetMax = new Vector2(-50, -110);
            var go = Button(b, "去新的浮岛", Yellow, WoodDark, 32, () => session.GoTo("expedition", "new")); ((RectTransform)go.transform).Place(new Vector2(0.5f, 0), new Vector2(s.expedition != null ? 1 : 0.5f, 0), new Vector2(s.expedition != null ? -14 : 0, 40), new Vector2(330, 96));
            if (s.expedition != null) { var last = Button(b, "回到上次的岛", Grass, Color.white, 32, () => session.GoTo("expedition", "last")); ((RectTransform)last.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(14, 40), new Vector2(330, 96)); }
        }

        // ---------- residents of 风铃小镇 ----------
        string talkLine; string talkNpc; string npcTab = "talk";

        public void OpenNpc(string npc)
        {
            var r = Town.Talk(session.S, npc);
            talkNpc = npc; talkLine = r.line; npcTab = "talk";
            if (r.gain > 0) session.Say($"{GameData.Npcs[npc].name}好感 +{r.gain}");
            if (r.present != null && !r.present.full) session.Say($"收到礼物：" + string.Join("、", r.present.items.Select(kv => $"{GameData.Item(kv.Key).name} ×{kv.Value}")));
            if (r.present != null && r.present.full) session.Say("背包满了，礼物下次再给你");
            session.AfterAction();
            Open("npc:" + npc);
        }

        void FillNpc(string npc)
        {
            var s = session.S; var n = GameData.Npcs[npc];
            var b = NewBox(n.name, new Vector2(1600, 880));
            var art = Rect("art", b).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 30), new Vector2(460, 700)).gameObject.AddComponent<Image>();
            art.sprite = Resources.Load<Sprite>("Icons/Npcs/npc_" + npc); art.preserveAspect = true; art.raycastTarget = false;
            int f = Town.FriendOf(s, npc), h = Town.Hearts(f);
            var head = Label(b, $"{n.role}　<color=#e8604c>{new string('♥', h)}</color><color=#c9b99a>{new string('♥', 5 - h)}</color>　好感 {f}/100", 28, Ink, true, TextAlignmentOptions.Left); head.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(520, -100), new Vector2(1000, 50)); head.richText = true;
            var tabs = new[] { ("talk", "聊天"), ("gift", $"送礼（本周还能送 {Town.GiftsLeft(s, npc)} 次）"), ("quest", "任务") }.ToList();
            if (n.shop) tabs.Add(("shop", "杂货铺"));
            float tx = 520;
            foreach (var (key, label) in tabs)
            {
                float w = key == "gift" ? 400 : 220;
                var tb = Button(b, label, npcTab == key ? Yellow : CreamDark, WoodDark, FsSub, () => { npcTab = key; FillNpc(npc); });
                ((RectTransform)tb.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(tx, -156), new Vector2(w, TouchMin));
                tx += w + 14;
            }
            var area = Rect("area", b); area.Fill(); area.offsetMin = new Vector2(520, 36); area.offsetMax = new Vector2(-40, -264);
            if (npcTab == "talk")
            {
                var bubble = Panel(area, "bubble", Color.white, null, false, true).rectTransform; bubble.Fill(); bubble.offsetMin = new Vector2(0, 300);
                var t = Label(bubble, "「" + (talkNpc == npc ? talkLine : "") + "」", 34, Ink, false, TextAlignmentOptions.Left); t.rectTransform.Fill(30);
                var likes = Label(area, $"最喜欢：{string.Join("、", n.loves.Select(x => GameData.Item(x)?.name))}　喜欢：{string.Join("、", n.likes.Select(x => GameData.Item(x)?.name))}", FsSub, Ink, false, TextAlignmentOptions.TopLeft);
                likes.rectTransform.Fill(); likes.rectTransform.offsetMax = new Vector2(0, -320); likes.rectTransform.offsetMin = new Vector2(0, 150);
                return;
            }
            var list = List(area, 0);
            ((RectTransform)list.parent).offsetMin = Vector2.zero; ((RectTransform)list.parent).offsetMax = Vector2.zero;
            if (npcTab == "gift")
            {
                bool can = !(s.town?.giftDay?.TryGetValue(npc, out var gd) == true && gd == s.day) && Town.GiftsLeft(s, npc) > 0;
                foreach (var st in s.inventory.Where(x => !(GameData.Item(x.id)?.tool ?? true)).ToList())
                {
                    var id = st.id; var taste = Town.GiftTaste(npc, id);
                    string tasteText = taste switch { "love" => "最喜欢！+10", "like" => "喜欢 +5", "dislike" => "不喜欢 −3", _ => "+2" };
                    Row(list, id, $"{GameData.Item(id).name} ×{st.count}", tasteText, "送给 TA", can, () => { var r = Town.Gift(s, npc, id); if (r.ok) GameAudio.Play(r.taste == "love" || r.taste == "like" ? "happy" : "pick"); session.Say(r.ok ? $"{n.name}{(r.taste == "love" ? "非常开心！" : r.taste == "like" ? "很高兴" : r.taste == "dislike" ? "不太喜欢……" : "收下了")}（好感 {(r.gain >= 0 ? "+" : "")}{r.gain}）" : r.reason == "gifted" ? "今天已经送过了" : "这周已经送了 2 次"); session.AfterAction(); });
                }
                if (!can) Row(list, null, "今天不能再送了", "每位居民一天收一次礼物，一周最多两次", null, false, null);
                return;
            }
            if (npcTab == "quest")
            {
                foreach (var q in Town.ActiveOf(s, npc))
                {
                    var miss = Town.Missing(s, q.id); var qid = q.id;
                    string need = string.Join("　", q.need.Select(kv => kv.Key == "party" ? $"带上{GameData.Species((string)kv.Value).name}" : $"{GameData.Item(kv.Key).name} {Inventory.CountOf(s.inventory, kv.Key)}/{(int)kv.Value}"));
                    Row(list, null, "【进行中】" + q.title, need, "交任务", miss.Count == 0, () => { var r = Town.Complete(s, qid); if (r.ok) GameAudio.Play("quest"); session.Say(r.ok ? $"{n.name}：{q.thanks}" : r.reason == "full" ? "背包满了" : "东西还不够"); session.AfterAction(); });
                }
                foreach (var q in Town.Offers(s, npc)) { var qid = q.id; Row(list, null, q.title, q.ask, "接受", true, () => { Town.Accept(s, qid); session.AfterAction(); }); }
                var locked = Town.HeartLocked(s, npc);
                if (locked != null) Row(list, null, "？？？", $"再熟一点（{locked.hearts} 颗心）{n.name}会拜托你新的事", null, false, null);
                if (!Town.ActiveOf(s, npc).Any() && !Town.Offers(s, npc).Any() && locked == null) Row(list, null, "现在没有任务", "过几天再来看看吧", null, false, null);
                return;
            }
            FillShopList(list);
        }

        void FillShop()
        {
            var b = NewBox("杂货铺", new Vector2(1200, 880));
            FillShopList(List(b));
        }

        void FillShopList(RectTransform list)
        {
            var s = session.S;
            foreach (var e in Town.Stock(s))
            {
                var id = e.id; var def = GameData.Item(id);
                Row(list, id, def.name, $"四叶草 {e.price}　{def.desc}", "买 1 个", s.clover >= e.price, () => { var r = Town.Buy(s, id); if (r.ok) GameAudio.Play("coin"); session.Say(r.ok ? $"买了{def.name}（四叶草 −{r.cost}）" : r.reason == "clover" ? "四叶草不够" : "背包满了"); session.AfterAction(); });
            }
        }

        // ---------- building ----------
        void FillBuild(string title, Progress.Cost cost, string about, Func<Progress.BuildResult> act, bool done)
        {
            var s = session.S;
            var b = NewBox(title, new Vector2(1000, 660));
            var miss = Progress.MissingFor(s, cost);
            string need = $"四叶草 {s.clover}/{cost.clover}　" + string.Join("　", cost.items.Select(kv => $"{GameData.Item(kv.Key).name} {Inventory.CountOf(s.inventory, kv.Key)}/{kv.Value}"));
            var t = Label(b, done ? "已经完成了！" : $"{about}\n\n需要：{need}", FsBody, Ink); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(50, 160); t.rectTransform.offsetMax = new Vector2(-50, -110);
            if (done) return;
            var go = Button(b, "开工", Yellow, WoodDark, 34, () => { var r = act(); session.Say(r.ok ? "完成了！" : r.reason == "ali" ? "要先完成阿栗的「工坊的木料」，他才信任你" : r.reason == "away" ? "要在家园才能扩建" : "材料还不够"); session.AfterAction(); });
            ((RectTransform)go.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(320, 96));
            go.interactable = miss.Count == 0;
        }

        // ---------- arranging the room ----------
        void FillDecorate()
        {
            var s = session.S;
            var room = session.Area as HouseArea;
            var b = NewBox("布置小屋", new Vector2(1300, 880));
            var hint = Label(b, "家具会放在你面前的格子上；放不下时换个位置再试。", FsSub, Ink); hint.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -92), new Vector2(1100, 44));
            var list = List(b, 150);
            foreach (var st in s.inventory.Where(x => House.IsFurniture(x.id)).ToList())
            {
                var id = st.id;
                Row(list, id, $"{GameData.Item(id).name} ×{st.count}", "在背包里", "放在面前", room != null, () => room.PlaceInFront(id));
            }
            var items = House.Of(s).items;
            for (int i = 0; i < items.Count; i++)
            {
                int idx = i; var it = items[i];
                var row = Panel(list, "row", CreamDark, RoundSmall, false).rectTransform; row.sizeDelta = new Vector2(0, 120);
                var img = Rect("icon", row).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 0), new Vector2(92, 92)).gameObject.AddComponent<Image>(); img.sprite = Icon(it.id); img.preserveAspect = true; img.raycastTarget = false;
                var n = Label(row, GameData.Item(it.id).name, 32, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(130, 56); n.rectTransform.offsetMax = new Vector2(-470, -8);
                var d = Label(row, $"摆在第 {it.x + 1} 列第 {it.y + 1} 行", FsMin, Ink, false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(130, 8); d.rectTransform.offsetMax = new Vector2(-470, -62);
                void Small(string t, int k, Action a) { var x = Button(row, t, Yellow, WoodDark, FsMin, a); ((RectTransform)x.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-14 - k * 152, 0), new Vector2(144, TouchMin)); }
                Small("收回", 0, () => room?.PickUp(idx));
                Small("旋转", 1, () => room?.Rotate(idx));
                Small("移到面前", 2, () => room?.MoveInFront(idx));
            }
            if (!items.Any() && !s.inventory.Any(x => House.IsFurniture(x.id))) Row(list, null, "还没有家具", "在家园的营火旁「制作」里做（工作台配方），居民送的礼物也能摆", null, false, null);
        }
    }
}
