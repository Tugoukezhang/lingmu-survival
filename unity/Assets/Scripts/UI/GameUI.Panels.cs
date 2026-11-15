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
                case "shop": FillShop(); break;
                case "expand": FillBuild("扩建家园", Progress.ExpandCost, "把家园岛东边的空地买下来，农田会变大", () => Progress.BuyExpansion(session.S), session.S.world?.expanded ?? false); break;
                case "repair": FillBuild("修好小镇的桥", Progress.BridgeCost, "阿栗会帮你一起修，修好就能去更远的地方", () => Progress.RepairBridge(session.S), session.S.world?.bridge ?? false); break;
                case "decorate": FillDecorate(); break;
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
            var t = Label(b, info, 30, Ink); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(50, 160); t.rectTransform.offsetMax = new Vector2(-50, -110);
            var go = Button(b, "去新的浮岛", Yellow, WoodDark, 32, () => session.GoTo("expedition", "new")); ((RectTransform)go.transform).Place(new Vector2(0.5f, 0), new Vector2(s.expedition != null ? 1 : 0.5f, 0), new Vector2(s.expedition != null ? -14 : 0, 40), new Vector2(330, 96));
            if (s.expedition != null) { var last = Button(b, "回到上次的岛", Grass, Color.white, 32, () => session.GoTo("expedition", "last")); ((RectTransform)last.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(14, 40), new Vector2(330, 96)); }
        }

        // ---------- partners ----------
        static Sprite PetSprite(PetInstance p) => Resources.Load<Sprite>("Icons/Pets/pet_" + p.species + (p.evolved ? "_evo" : p.form == "human" ? "_human" : "")) ?? Resources.Load<Sprite>("Icons/Pets/pet_" + p.species);

        void FillParty()
        {
            var s = session.S;
            var b = NewBox("伙伴", new Vector2(1640, 900));
            if (selectedPet == null || s.Pet(selectedPet) == null) selectedPet = s.party.FirstOrDefault() ?? s.pets.FirstOrDefault()?.uid;
            // left: everyone (party first)
            var view = Rect("list", b); view.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -96), new Vector2(560, 770)); view.gameObject.AddComponent<RectMask2D>();
            var content = Rect("content", view); content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.offsetMin = content.offsetMax = Vector2.zero;
            var vl = content.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 10; vl.childControlHeight = false; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            content.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = view.gameObject.AddComponent<ScrollRect>(); sr.content = content; sr.horizontal = false; sr.movementType = ScrollRect.MovementType.Clamped;
            view.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0);
            foreach (var p in s.pets.OrderBy(p => s.party.Contains(p.uid) ? s.party.IndexOf(p.uid) : 99))
            {
                var uid = p.uid;
                bool sel = uid == selectedPet, inParty = s.party.Contains(uid);
                var row = Panel(content, "row", sel ? Yellow : CreamDark, RoundSmall, true).rectTransform; row.sizeDelta = new Vector2(0, 112);
                row.gameObject.AddComponent<Button>().onClick.AddListener(() => { selectedPet = uid; FillParty(); });
                var img = Rect("art", row).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(96, 96)).gameObject.AddComponent<Image>(); img.sprite = PetSprite(p); img.preserveAspect = true; img.raycastTarget = false;
                var n = Label(row, $"{PetMath.DisplayName(p)}  <size=24>Lv.{p.level}</size>", 30, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(120, 52); n.rectTransform.offsetMax = new Vector2(-10, -6);
                string state = inParty ? (s.party[0] == uid ? "领队" : "队伍中") : p.job ? "在家打工" : "在家休息";
                var d = Label(row, $"{state}　好感 {p.affection}　{new string('★', p.stars)}{(p.shiny ? "　异色" : "")}", 22, Ink, false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(120, 8); d.rectTransform.offsetMax = new Vector2(-10, -60);
            }
            // right: the selected one
            var pet = s.Pet(selectedPet);
            if (pet == null) return;
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-36, -96), new Vector2(980, 770));
            var big = Rect("art", info).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(300, 300)).gameObject.AddComponent<Image>(); big.sprite = PetSprite(pet); big.preserveAspect = true; big.raycastTarget = false;
            var sp = GameData.Species(pet.species);
            var st = PetMath.CalcStats(pet);
            var nat = GameData.Natures.TryGetValue(pet.nature ?? "gentle", out var nd) ? nd.name : "";
            string skills = string.Join("、", PetMath.BattleSkills(pet).Select(k => GameData.Skill(k).name));
            string txt = $"<size=40><b>{PetMath.DisplayName(pet)}</b></size>  Lv.{pet.level}　{sp.element}属性　{nat}\n" +
                $"经验 {pet.exp}/{PetMath.ExpToNext(pet.level)}　好感 {pet.affection}/100\n" +
                $"生命 {st.hp}　攻击 {st.atk}　防御 {st.def}　速度 {st.spd}\n" +
                $"技能：{skills}\n" +
                $"探索：{Explore.SkillNames.GetValueOrDefault(sp.explore, sp.explore)}　打工：{PetCare.Work.GetValueOrDefault(sp.work)?.name ?? sp.work}　最爱吃：{GameData.Item(sp.food)?.name}";
            var t = Label(info, txt, 28, Ink, false, TextAlignmentOptions.TopLeft); t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(340, -24), new Vector2(620, 330)); t.richText = true;
            var (fed, petted) = PetCare.CaredToday(s, pet);
            bool inP = s.party.Contains(pet.uid), home = s.player.area == "home";
            var grid = Rect("buttons", info).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(24, 24), new Vector2(932, 300));
            var gl = grid.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(298, 88); gl.spacing = new Vector2(16, 16); gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 3;
            var uid2 = pet.uid;
            void B(string label, bool on, Action a, Color? bg = null) { var x = Button(grid, label, on ? (bg ?? Yellow) : CreamDark, WoodDark, 28, a); x.interactable = on; }
            B(petted ? "今天摸过了" : "摸摸（好感 +2）", !petted, () => session.PetPet(uid2));
            var food = PetCare.FoodsInBag(s).OrderByDescending(x => x.id == sp.food).FirstOrDefault();
            B(fed ? "今天喂过了" : food == null ? "没有食物" : $"喂{GameData.Item(food.id).name}", !fed && food != null, () => session.Feed(uid2, food.id));
            if (inP) B(s.party[0] == pet.uid ? "已是领队" : "设为领队", s.party[0] != pet.uid, () => session.SetLead(uid2), Grass);
            else B("加入队伍", home && s.party.Count < SaveRules.PartyMax, () => session.JoinParty(uid2), Grass);
            if (inP) B("回家休息", home && s.party.Count > 1, () => session.LeaveParty(uid2));
            else B(pet.job ? "停止打工" : "在家打工", home, () => session.SetJob(uid2, !pet.job));
            var evo = Growth.EvolveCheck(s, pet.uid);
            B(pet.evolved ? "已进化" : "进化", !pet.evolved && evo.ok, () => session.Evolve(uid2), Grass);
            if (s.pets.Count(x => x.species == pet.species) > 1) B($"转成结晶（+{pet.stars}）", !inP || s.party.Count > 1, () => { Growth.ConvertToCrystal(s, uid2); selectedPet = null; session.AfterAction(); });
            else if (Growth.CrystalsOf(s, pet.species) > 0 || pet.stars < 5) B(pet.stars >= 5 ? "已满星" : $"升星（结晶 {Growth.CrystalsOf(s, pet.species)}/{Growth.StarCost(pet.stars)}）", pet.stars < 5 && Growth.CrystalsOf(s, pet.species) >= Growth.StarCost(pet.stars), () => { Growth.StarUp(s, uid2); session.AfterAction(); });
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
                float w = key == "gift" ? 360 : 220;
                var tb = Button(b, label, npcTab == key ? Yellow : CreamDark, WoodDark, 26, () => { npcTab = key; FillNpc(npc); });
                ((RectTransform)tb.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(tx, -160), new Vector2(w, 70));
                tx += w + 14;
            }
            var area = Rect("area", b); area.Fill(); area.offsetMin = new Vector2(520, 36); area.offsetMax = new Vector2(-40, -250);
            if (npcTab == "talk")
            {
                var bubble = Panel(area, "bubble", Color.white, null, false, true).rectTransform; bubble.Fill(); bubble.offsetMin = new Vector2(0, 300);
                var t = Label(bubble, "「" + (talkNpc == npc ? talkLine : "") + "」", 34, Ink, false, TextAlignmentOptions.Left); t.rectTransform.Fill(30);
                var likes = Label(area, $"最喜欢：{string.Join("、", n.loves.Select(x => GameData.Item(x)?.name))}　喜欢：{string.Join("、", n.likes.Select(x => GameData.Item(x)?.name))}", 26, Ink, false, TextAlignmentOptions.TopLeft);
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
                    Row(list, id, $"{GameData.Item(id).name} ×{st.count}", tasteText, "送给 TA", can, () => { var r = Town.Gift(s, npc, id); session.Say(r.ok ? $"{n.name}{(r.taste == "love" ? "非常开心！" : r.taste == "like" ? "很高兴" : r.taste == "dislike" ? "不太喜欢……" : "收下了")}（好感 {(r.gain >= 0 ? "+" : "")}{r.gain}）" : r.reason == "gifted" ? "今天已经送过了" : "这周已经送了 2 次"); session.AfterAction(); });
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
                    Row(list, null, "【进行中】" + q.title, need, "交任务", miss.Count == 0, () => { var r = Town.Complete(s, qid); session.Say(r.ok ? $"{n.name}：{q.thanks}" : r.reason == "full" ? "背包满了" : "东西还不够"); session.AfterAction(); });
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
                Row(list, id, def.name, $"四叶草 {e.price}　{def.desc}", "买 1 个", s.clover >= e.price, () => { var r = Town.Buy(s, id); session.Say(r.ok ? $"买了{def.name}（四叶草 −{r.cost}）" : r.reason == "clover" ? "四叶草不够" : "背包满了"); session.AfterAction(); });
            }
        }

        // ---------- building ----------
        void FillBuild(string title, Progress.Cost cost, string about, Func<Progress.BuildResult> act, bool done)
        {
            var s = session.S;
            var b = NewBox(title, new Vector2(1000, 660));
            var miss = Progress.MissingFor(s, cost);
            string need = $"四叶草 {s.clover}/{cost.clover}　" + string.Join("　", cost.items.Select(kv => $"{GameData.Item(kv.Key).name} {Inventory.CountOf(s.inventory, kv.Key)}/{kv.Value}"));
            var t = Label(b, done ? "已经完成了！" : $"{about}\n\n需要：{need}", 30, Ink); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(50, 160); t.rectTransform.offsetMax = new Vector2(-50, -110);
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
            var hint = Label(b, "家具会放在你面前的格子上；放不下时换个位置再试。", 26, Ink); hint.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -92), new Vector2(1100, 44));
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
                var row = Panel(list, "row", CreamDark, RoundSmall, false).rectTransform; row.sizeDelta = new Vector2(0, 118);
                var img = Rect("icon", row).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 0), new Vector2(92, 92)).gameObject.AddComponent<Image>(); img.sprite = Icon(it.id); img.preserveAspect = true; img.raycastTarget = false;
                var n = Label(row, GameData.Item(it.id).name, 32, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(130, 56); n.rectTransform.offsetMax = new Vector2(-470, -8);
                var d = Label(row, $"摆在第 {it.x + 1} 列第 {it.y + 1} 行", 24, Ink, false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(130, 8); d.rectTransform.offsetMax = new Vector2(-470, -62);
                void Small(string t, int k, Action a) { var x = Button(row, t, Yellow, WoodDark, 26, a); ((RectTransform)x.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-18 - k * 150, 0), new Vector2(140, 80)); }
                Small("收回", 0, () => room?.PickUp(idx));
                Small("旋转", 1, () => room?.Rotate(idx));
                Small("移到面前", 2, () => room?.MoveInFront(idx));
            }
            if (!items.Any() && !s.inventory.Any(x => House.IsFurniture(x.id))) Row(list, null, "还没有家具", "在家园的营火旁「制作」里做（工作台配方），居民送的礼物也能摆", null, false, null);
        }
    }
}
