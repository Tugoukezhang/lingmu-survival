// The partner panel (伙伴) with three tabs — 照顾 (care, party, work), 技能 (skills and skill books) and 养成
// (evolution, stars, human form) — and the pet dex (图鉴). Rules live in Lingmu.Rules (PetCare, Party, Growth).
// Look (docs/19 伙伴 / 图鉴): pet cards with element badges and painted stars, stat bars, skill cards, a tick checklist.
using System;
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
        string partyTab = "care";      // care | skills | growth
        string pendingBook;            // a skill book waiting for the slot it should replace
        string selectedDex;

        static Sprite PetSprite(PetInstance p) => Resources.Load<Sprite>("Icons/Pets/pet_" + p.species + (p.evolved ? "_evo" : p.form == "human" ? "_human" : "")) ?? Resources.Load<Sprite>("Icons/Pets/pet_" + p.species);
        static Sprite SpeciesSprite(string sp, bool evolved = false) => (evolved ? Resources.Load<Sprite>($"Icons/Pets/pet_{sp}_evo") : null) ?? Resources.Load<Sprite>("Icons/Pets/pet_" + sp);

        // open the partner panel on a tab, optionally with one pet selected (bag → 去学技能 / 去化形)
        public void OpenParty(string tab, string uid = null)
        {
            partyTab = tab; pendingBook = null;
            if (uid != null) selectedPet = uid;
            Open("party");
        }

        static readonly Color Muted = Hex("8a7458");

        Image Art(RectTransform parent, Sprite sprite, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var img = Rect("art", parent).Place(anchor, pivot, pos, size).gameObject.AddComponent<Image>();
            img.sprite = sprite; img.preserveAspect = true; img.raycastTarget = false; img.enabled = sprite;
            return img;
        }

        RectTransform ScrollList(RectTransform parent, Vector2 pos, Vector2 size, float spacing = 10)
        {
            var view = Rect("list", parent); view.Place(new Vector2(0, 1), new Vector2(0, 1), pos, size); view.gameObject.AddComponent<RectMask2D>();
            var content = Rect("content", view); content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.offsetMin = content.offsetMax = Vector2.zero;
            var vl = content.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = spacing; vl.childControlHeight = false; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            content.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = view.gameObject.AddComponent<ScrollRect>(); sr.content = content; sr.horizontal = false; sr.movementType = ScrollRect.MovementType.Clamped; sr.scrollSensitivity = 40;
            view.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0);
            return content;
        }

        // a pill button with a painted icon left of its word (tabs, care actions)
        Button IconPill(RectTransform parent, string label, Sprite icon, Color bg, bool on, Action act, float width)
        {
            var b = Button(parent, label, on ? bg : Cream, WoodDark, FsSub, act);
            ((RectTransform)b.transform).sizeDelta = new Vector2(width, TouchMin);
            if (icon)
            {
                var img = Rect("icon", b.transform).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 4), new Vector2(46, 46)).gameObject.AddComponent<Image>();
                img.sprite = icon; img.preserveAspect = true; img.raycastTarget = false;
                b.GetComponentInChildren<TextMeshProUGUI>().rectTransform.offsetMin = new Vector2(64, 10);
            }
            return b;
        }

        // ---------- partners ----------
        void FillParty()
        {
            var s = session.S;
            var b = NewBox("伙伴", new Vector2(1660, 920));
            if (selectedPet == null || s.Pet(selectedPet) == null) { selectedPet = s.party.FirstOrDefault() ?? s.pets.FirstOrDefault()?.uid; pendingBook = null; }
            var dex = IconPill(b, $"图鉴 {Growth.DexCount(s)}/{GameData.Pets.Count}", Kit("hud_dex"), Cream, true, () => Open("dex"), 240);
            ((RectTransform)dex.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -12), new Vector2(240, TouchMin));

            // left: the party first, then the pets at home
            var list = ScrollList(b, new Vector2(36, -112), new Vector2(540, 774));
            void Header(string text)
            {
                var h = Rect("header", list); h.sizeDelta = new Vector2(0, 44);
                var t = Label(h, text, FsSub, Muted, true, TextAlignmentOptions.BottomLeft); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(10, 4);
            }
            var party = s.party.Select(s.Pet).Where(p => p != null).ToList();
            var home = s.pets.Where(p => !s.party.Contains(p.uid)).ToList();
            Header($"队伍 {party.Count}/{SaveRules.PartyMax}");
            foreach (var p in party) PetRow(list, s, p);
            if (home.Count > 0) { Header($"在家 {home.Count}"); foreach (var p in home) PetRow(list, s, p); }

            var pet = s.Pet(selectedPet);
            if (pet == null) return;
            var sp = GameData.Species(pet.species);
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-36, -112), new Vector2(1028, 774));

            // header: art, name, element, nature, stars, exp and affection bars
            var well = Panel(info, "well", Hex("f6efe0"), FlatCircle, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -14), new Vector2(226, 226));
            Art(well, PetSprite(pet), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(212, 212));
            var name = Label(info, $"{PetMath.DisplayName(pet)}  <size=32>Lv.{pet.level}</size>", FsTitle + 4, WoodDark, true, TextAlignmentOptions.Left);
            name.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(266, -12), new Vector2(740, 64));
            KitImage(info, ElementBadge(sp.element), 48).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(266, -78), new Vector2(48, 48));
            Chip(info, sp.element + "属性", ElementColor(sp.element), 112, 44).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(320, -80), new Vector2(112, 44));
            var nat = GameData.Natures.TryGetValue(pet.nature ?? "gentle", out var nd) ? nd : null;
            if (nat != null) Chip(info, nat.name, Hex("e4d6bb"), 96, 44).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(444, -80), new Vector2(96, 44));
            Stars(info, pet.stars, 36).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(556, -84), new Vector2(180, 36));
            if (pet.shiny) Chip(info, "异色", Hex("b9a0d0"), 80, 40).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(752, -82), new Vector2(80, 40));
            bool max = pet.level >= PetMath.MaxLevel;
            void BarRow(float y, string icon, string label, Color c, float frac, string text)
            {
                KitImage(info, icon, 34).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(266, y + 2), new Vector2(34, 34));
                Label(info, label, FsSub, Ink, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(308, y + 4), new Vector2(80, 40));
                var bar = MakeBar(info, label, c); bar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(386, y), new Vector2(560, 36));
                SetBar(bar, frac, text);
            }
            BarRow(-142, "sparkle", "经验", Sky, max ? 1 : pet.exp / (float)PetMath.ExpToNext(pet.level), max ? "满级" : $"{pet.exp}/{PetMath.ExpToNext(pet.level)}");
            BarRow(-192, "heart", "好感", Hex("f08aa0"), pet.affection / 100f, $"{pet.affection}/100");

            // tabs
            var tabs = new[] { ("care", "照顾", "heart"), ("skills", "技能", "sparkle"), ("growth", "养成", "orn_sprout") };
            for (int i = 0; i < tabs.Length; i++)
            {
                var (key, label, icon) = tabs[i];
                var tb = IconPill(info, label, Kit(icon), Picked, partyTab == key, () => { partyTab = key; pendingBook = null; Fill("party"); }, 222);
                ((RectTransform)tb.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(20 + i * 236, -254), new Vector2(222, TouchMin));
                bool dot = key == "skills" ? CanLearnAny(s, pet) : key == "growth" && GrowthReady(s, pet);
                if (dot) { var d = Panel(tb.transform, "dot", Red, Circle, false).rectTransform.Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-12, -12), new Vector2(26, 26)); UiMotion.Pulse(d, 0.12f); }
            }
            var area = Rect("tab", info); area.Fill(); area.offsetMin = new Vector2(20, 18); area.offsetMax = new Vector2(-20, -360);
            switch (partyTab)
            {
                case "skills": PartySkills(area, s, pet); break;
                case "growth": PartyGrowth(area, s, pet); break;
                default: PartyCare(area, s, pet); break;
            }
        }

        // a pet card in the list: art, name, level, element badge, state, stars, a red dot when something is ready
        void PetRow(RectTransform list, GameState s, PetInstance p)
        {
            var uid = p.uid; bool sel = uid == selectedPet, inParty = s.party.Contains(uid);
            var sp = GameData.Species(p.species);
            var row = Cell(list, "row " + uid, CreamDark, sel, () => { if (selectedPet != uid) pendingBook = null; selectedPet = uid; Fill("party"); }).rectTransform;
            row.sizeDelta = new Vector2(0, 128);
            Art(row, PetSprite(p), new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(12, 0), new Vector2(108, 108));
            var n = Label(row, PetMath.DisplayName(p), FsBody, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(132, -10), new Vector2(230, 50));
            n.textWrappingMode = TextWrappingModes.NoWrap; n.overflowMode = TextOverflowModes.Ellipsis;
            var lv = Label(row, $"Lv.{p.level}", FsSub, Ink, true, TextAlignmentOptions.Right); lv.rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-64, -14), new Vector2(110, 44));
            KitImage(row, ElementBadge(sp.element), 42).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-14, -14), new Vector2(42, 42));
            string state = inParty ? (s.party[0] == uid ? "领队" : "队伍中") : p.job ? "打工中" : "在家";
            Chip(row, state, inParty ? Grass : p.job ? Orange : Hex("cdb894"), 100, 42).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(132, 14), new Vector2(100, 42));
            Stars(row, p.stars, 28).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(246, 21), new Vector2(140, 28));
            if (p.shiny) Chip(row, "异色", Hex("b9a0d0"), 72, 38).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-14, 16), new Vector2(72, 38));
            if (Attention(s, p)) { var d = Panel(row, "dot", Red, Circle, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 0.5f), new Vector2(22, -22), new Vector2(26, 26)); UiMotion.Pulse(d, 0.12f); }
        }

        // something worth a look: a skill book it can learn, or evolution / star-up / form ready
        static bool Attention(GameState s, PetInstance p) => CanLearnAny(s, p) || GrowthReady(s, p);
        static bool CanLearnAny(GameState s, PetInstance p) => s.inventory.Any(st => GameData.Item(st.id)?.book != null && Growth.CanLearn(s, p.uid, st.id).ok);
        static bool GrowthReady(GameState s, PetInstance p)
        {
            if (!p.evolved && Growth.EvolveCheck(s, p.uid).ok) return true;
            if (p.stars < 5 && Growth.CrystalsOf(s, p.species) >= Growth.StarCost(p.stars)) return true;
            var f = Growth.FormCheck(s, p.uid);
            return f.ok && !f.unlocked;
        }

        void PartyCare(RectTransform area, GameState s, PetInstance pet)
        {
            var sp = GameData.Species(pet.species);
            var st = PetMath.CalcStats(pet);
            // stat bars 【建议】 scale: 生命 out of 200, the others out of 100 (a level-30 evolved pet nearly fills them)
            var stats = new (string label, int v, int cap, Color c)[] { ("生命", st.hp, 200, Hex("e5806a")), ("攻击", st.atk, 100, Orange), ("防御", st.def, 100, Sky), ("速度", st.spd, 100, Grass) };
            for (int i = 0; i < stats.Length; i++)
            {
                var (label, v, cap, c) = stats[i];
                Label(area, label, FsSub, Ink, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(8, -i * 44), new Vector2(80, 40));
                var bar = MakeBar(area, label, c); bar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(88, -i * 44 - 4), new Vector2(380, 32));
                SetBar(bar, v / (float)cap, v.ToString());
            }
            // what it does outside battle
            var facts = new (string key, string value, string icon)[]
            {
                ("探索", Explore.SkillNames.GetValueOrDefault(sp.explore, sp.explore), null),
                ("打工", PetCare.Work.GetValueOrDefault(sp.work)?.name ?? sp.work, null),
                ("最爱吃", GameData.Item(sp.food)?.name, sp.food),
            };
            for (int i = 0; i < facts.Length; i++)
            {
                var (key, value, icon) = facts[i];
                float y = -i * 58;
                Chip(area, key, Hex("e4d6bb"), 110, 44).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(520, y), new Vector2(110, 44));
                float x = 644;
                if (icon != null && Icon(icon)) { Art(area, Icon(icon), new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, y + 4), new Vector2(50, 50)); x += 56; }
                Label(area, value, FsSub, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, y + 2), new Vector2(300, 44));
            }

            var (fed, petted) = PetCare.CaredToday(s, pet);
            bool inP = s.party.Contains(pet.uid), home = s.player.area == "home";
            var uid = pet.uid;
            var tip = Label(area, (petted ? "" : "摸摸：好感 +2。") + (fed ? "喂食、打工都会给一点经验" : "每天喂一次：好感上升，还有一点经验"), FsMin, Muted, false, TextAlignmentOptions.Left);
            tip.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(8, 100), new Vector2(980, 40));
            int k = 0;
            void B(string label, Sprite icon, bool on, Action a, Color bg)
            {
                var x = IconPill(area, label, icon, bg, on, a, 236); x.interactable = on;
                ((RectTransform)x.transform).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(k++ * 248, 0), new Vector2(236, TouchMin));
            }
            B(petted ? "今天摸过了" : "摸摸", Kit("heart"), !petted, () => session.PetPet(uid), Yellow);
            var food = PetCare.FoodsInBag(s).OrderByDescending(x => x.id == sp.food).FirstOrDefault();
            B(fed ? "今天喂过了" : food == null ? "没有食物" : $"喂{GameData.Item(food.id).name}", food != null ? Icon(food.id) : Icon(sp.food), !fed && food != null, () => session.Feed(uid, food.id), Yellow);
            if (inP) { if (s.party[0] != pet.uid) B("设为领队", Kit("star"), true, () => session.SetLead(uid), Grass); }
            else B("加入队伍", Kit("hud_pets"), home && s.party.Count < SaveRules.PartyMax, () => session.JoinParty(uid), Grass);
            if (inP) B("回家休息", Kit("act_door"), home && s.party.Count > 1, () => session.LeaveParty(uid), Yellow);
            else B(pet.job ? "停止打工" : "在家打工", Kit("act_pickaxe"), home, () => session.SetJob(uid, !pet.job), Yellow);
        }

        // a skill card: element colour and badge, name, power and uses; optional button underneath
        void SkillCard(RectTransform parent, string skillId, Vector2 pos, float width, string tag, string button = null, Action onClick = null)
        {
            var sk = GameData.Skill(skillId);
            var card = Panel(parent, "skill " + skillId, Color.Lerp(ElementColor(sk.element), Color.white, 0.66f), RoundSmall, false).rectTransform;
            card.Place(new Vector2(0, 1), new Vector2(0, 1), pos, new Vector2(width, button != null ? 240 : 150));
            Panel(card, "strip", ElementColor(sk.element), FlatSmall, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(5, -5), new Vector2(12, 140));
            KitImage(card, ElementBadge(sk.element), 40).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-10, -10), new Vector2(40, 40));
            var n = Label(card, sk.name, FsBody, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -8), new Vector2(width - 84, 48));
            string power = sk.power > 0 ? $"威力 <b>{sk.power}</b>" : "状态技能";
            var d = Label(card, power + "\n" + (sk.uses == null ? "次数不限" : $"每场 {sk.uses} 次") + (tag != null ? $"　<color=#b07a2a>{tag}</color>" : ""), FsMin, Ink, false, TextAlignmentOptions.TopLeft);
            d.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -58), new Vector2(width - 38, 90)); d.richText = true;
            if (button == null) return;
            var bt = Button(card, button, Yellow, WoodDark, FsSub, onClick); ((RectTransform)bt.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 10), new Vector2(width - 30, TouchMin - 4));
        }

        void PartySkills(RectTransform area, GameState s, PetInstance pet)
        {
            var uid = pet.uid;
            if (pendingBook != null && Inventory.CountOf(s.inventory, pendingBook) > 0)
            {
                var newSkill = GameData.Skill(Growth.BookSkill(pendingBook));
                var ask = Label(area, $"学会「{newSkill.name}」，要忘掉哪个技能？", FsBody, WoodDark, true, TextAlignmentOptions.Left); ask.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(6, 0), new Vector2(760, 48));
                var cancel = Button(area, "取消", Cream, WoodDark, FsSub, () => { pendingBook = null; Fill("party"); }); ((RectTransform)cancel.transform).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(0, 6), new Vector2(180, TouchMin));
                for (int i = 0; i < pet.skills.Count && i < PetMath.RegularSlots; i++)
                {
                    int slot = i; var book = pendingBook;
                    SkillCard(area, pet.skills[i], new Vector2(i * 330, -110), 316, null, "忘掉它", () => { pendingBook = null; session.LearnSkill(uid, book, slot); });
                }
                return;
            }
            pendingBook = null;
            // current skills (3 regular + the evolution skill)
            var all = PetMath.BattleSkills(pet);
            float w = 236;
            for (int i = 0; i < all.Count; i++) SkillCard(area, all[i], new Vector2(i * (w + 14), 0), w, pet.evolved && i == all.Count - 1 ? "进化技能" : null);
            // skill books in the bag
            var books = s.inventory.Where(x => GameData.Item(x.id)?.book != null).ToList();
            if (books.Count == 0)
            {
                var none = Label(area, "背包里没有技能书。\n小镇杂货铺每天卖 2 本，远征的宝箱也能开出来。", FsSub, Muted, false, TextAlignmentOptions.TopLeft);
                none.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(6, -170), new Vector2(980, 120));
                return;
            }
            var list = ScrollList(area, new Vector2(0, -162), new Vector2(988, 236), 8);
            foreach (var st in books)
            {
                var id = st.id; var sk = GameData.Skill(Growth.BookSkill(id));
                var chk = Growth.CanLearn(s, uid, id);
                string why = chk.ok ? (sk.power > 0 ? $"{sk.element} · 威力 {sk.power}" : "状态技能") : chk.reason switch { "element" => $"属性不合：{GameData.Species(pet.species).element}属性只能学{GameData.Species(pet.species).element}、普通或状态技能", "known" => "已经会了", _ => "学不了" };
                var row = Panel(list, "book", Cream, RoundSmall, false).rectTransform; row.sizeDelta = new Vector2(0, 108);
                var icon = Rect("icon", row).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(12, 0), new Vector2(84, 84)).gameObject.AddComponent<Image>(); icon.sprite = Icon(id); icon.preserveAspect = true; icon.raycastTarget = false; icon.enabled = icon.sprite;
                var n = Label(row, $"{GameData.Item(id).name} ×{st.count}", FsBody - 2, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(110, 52); n.rectTransform.offsetMax = new Vector2(-230, -6);
                var d = Label(row, why, FsMin, chk.ok ? Ink : Hex("b0543f"), false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(110, 6); d.rectTransform.offsetMax = new Vector2(-230, -56);
                var bt = Button(row, "学这个", chk.ok ? Yellow : Cream, WoodDark, FsSub, () =>
                {
                    if (pet.skills.Count < PetMath.RegularSlots) session.LearnSkill(uid, id, pet.skills.Count);
                    else { pendingBook = id; Fill("party"); }
                });
                bt.interactable = chk.ok;
                ((RectTransform)bt.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-12, 0), new Vector2(200, TouchMin));
            }
        }

        void PartyGrowth(RectTransform area, GameState s, PetInstance pet)
        {
            var sp = GameData.Species(pet.species);
            var uid = pet.uid;
            bool inP = s.party.Contains(uid);
            RectTransform Column(int i, string title)
            {
                var col = Panel(area, "column", Cream, RoundSmall, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(i * 332, 0), new Vector2(318, 390));
                var t = Label(col, title, FsBody, WoodDark, true); t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -8), new Vector2(300, 50));
                return col;
            }
            void Checks(RectTransform col, params (bool ok, string text)[] lines) { for (int i = 0; i < lines.Length; i++) CheckLine(col, lines[i].ok, lines[i].text, new Vector2(18, -66 - i * 46), 290); }
            void Note(RectTransform col, string text, float y)
            {
                var t = Label(col, text, FsMin, Muted, false, TextAlignmentOptions.TopLeft); t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, y), new Vector2(286, 110));
            }
            Button Act(RectTransform col, string label, bool on, Action a, Color? bg = null)
            {
                var bt = Button(col, label, on ? (bg ?? Grass) : CreamDark, on ? Color.white : WoodDark, FsSub, a); bt.interactable = on;
                ((RectTransform)bt.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 14), new Vector2(290, TouchMin));
                return bt;
            }

            // evolution
            var evo = Column(0, pet.evolved ? "已进化" : $"进化 → {sp.evolution.name}");
            if (pet.evolved) Note(evo, $"已经是{sp.evolution.name}了！\n学会了进化技能「{GameData.Skill(sp.evolution.skill).name}」，属性也变强了。", -66);
            else
            {
                int stones = Inventory.CountOf(s.inventory, sp.evolution.stone);
                Checks(evo, (pet.level >= PetMath.EvolveLevel, $"等级 {pet.level}/{PetMath.EvolveLevel}"),
                    (pet.affection >= PetMath.EvolveAffection, $"好感 {pet.affection}/{PetMath.EvolveAffection}"),
                    (stones > 0, $"{GameData.Item(sp.evolution.stone)?.name} {stones}/1"));
                Note(evo, "进化石在远征的宝箱里", -206);
                Act(evo, "进化", Growth.EvolveCheck(s, uid).ok, () => session.Evolve(uid));
            }

            // stars and crystals
            int crystals = Growth.CrystalsOf(s, pet.species), need = Growth.StarCost(pet.stars);
            var star = Column(1, "星级");
            Stars(star, pet.stars, 46).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -66), new Vector2(230, 46));
            if (pet.stars < 5)
            {
                Label(star, "结晶", FsMin, Ink, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -126), new Vector2(70, 40));
                var bar = MakeBar(star, "crystals", Hex("b9a0d0")); bar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(84, -128), new Vector2(214, 32));
                SetBar(bar, crystals / (float)need, $"{crystals}/{need}");
            }
            Note(star, pet.stars >= 5 ? "已经满星了" : crystals >= need ? "结晶够了，可以升星！" : $"再得 {need - crystals} 颗结晶升到 {pet.stars + 1} 星\n重复抓到同种宠物能换结晶", -180);
            bool dup = s.pets.Count(x => x.species == pet.species) > 1;
            if (dup && !(pet.stars < 5 && crystals >= need)) Act(star, $"把它转成结晶 +{pet.stars}", !inP || s.party.Count > 1, () => { Growth.ConvertToCrystal(s, uid); selectedPet = null; session.Say($"转成了 {pet.stars} 颗结晶"); session.AfterAction(); }, Orange);
            else Act(star, pet.stars >= 5 ? "已满星" : "升星", pet.stars < 5 && crystals >= need, () => { Growth.StarUp(s, uid); session.Say($"升到了 {pet.stars} 星！"); session.AfterAction(); }, Yellow);

            // human form (first version: 焰尾狐 only)
            var form = Column(2, "化形");
            if (string.IsNullOrEmpty(sp.humanForm)) { Note(form, "这只宠物不会化形。\n目前只有焰尾狐能化成人形。", -66); return; }
            var fc = Growth.FormCheck(s, uid);
            if (fc.unlocked)
            {
                Note(form, pet.form == "human" ? "现在是人形。\n变身不会改变属性。" : "已经学会化形了。\n变身不会改变属性。", -66);
                Act(form, pet.form == "human" ? "变回原形" : "变成人形", true, () => session.ToggleForm(uid), Sky);
                return;
            }
            int bells = Inventory.CountOf(s.inventory, "item_fox_bell");
            Checks(form, (pet.evolved, pet.evolved ? "已经进化" : "先完成进化"), (pet.affection >= 100, $"好感 {pet.affection}/100"), (bells > 0, $"化形铃 {bells}/1"));
            Note(form, "化形铃：完成露米的「焰尾狐的心愿」", -206);
            Act(form, "学会化形", fc.ok, () => session.UnlockForm(uid), Sky);
        }

        // ---------- the pet dex ----------
        static readonly Dictionary<string, string> PetLore = new Dictionary<string, string>
        {
            { "acorn", "把橡果顶在背上的小刺猬。遇到危险就缩成一团，其实背上的刺软乎乎的。" },
            { "shark", "梦想开着飞艇横渡云海的小鲨鱼，总是一副要出海的样子。" },
            { "pup", "毛尖结着薄霜的小狼，跑过的地方会留下一串凉凉的脚印。" },
            { "fox", "尾巴尖燃着不烫手的火苗。和主人足够亲近时，能化成人形。" },
            { "starbear", "胸口有星星图案的熊宝宝，夜里会微微发光，最爱星光麦。" },
            { "shadecat", "只有在月光下才看得清的狐猫，喜欢把亮晶晶的东西藏起来。" },
        };

        void FillDex()
        {
            var s = session.S;
            var b = NewBox("宠物图鉴", new Vector2(1660, 920));
            DexEntry E(string sp) => s.dex != null && s.dex.TryGetValue(sp, out var e) ? e : null;
            bool Owned(string sp) => s.pets.Any(p => p.species == sp);
            bool Caught(string sp) => (E(sp)?.caught ?? false) || (E(sp)?.shiny ?? false) || Owned(sp);
            bool Seen(string sp) => (E(sp)?.seen ?? false) || Caught(sp);
            int seen = GameData.Pets.Count(p => Seen(p.id)), caught = Growth.DexCount(s), total = GameData.Pets.Count;
            ((RectTransform)BackButton(b, () => Open("party")).transform).Place(new Vector2(0, 1), new Vector2(0.5f, 0.5f), new Vector2(76, -66), new Vector2(96, 96));
            // collection progress: a bar for caught, the seen count beside it
            Label(b, "已捕获", FsBody, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(140, -106), new Vector2(110, 50));
            var bar = MakeBar(b, "caught", Grass); bar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(252, -112), new Vector2(380, 38));
            SetBar(bar, caught / (float)total, $"{caught} / {total}");
            Label(b, $"已见 {seen} / {total}", FsSub, Muted, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(640, -108), new Vector2(300, 46));
            if (selectedDex == null || GameData.Pets.All(p => p.id != selectedDex)) selectedDex = (GameData.Pets.FirstOrDefault(p => Caught(p.id)) ?? GameData.Pets[0]).id;

            var grid = Rect("grid", b).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -176), new Vector2(950, 710));
            var gl = grid.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(306, 340); gl.spacing = new Vector2(16, 16); gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 3;
            foreach (var p in GameData.Pets)
            {
                var id = p.id; bool sn = Seen(id), ct = Caught(id), sel = id == selectedDex;
                var card = Cell(grid, "card " + id, CreamDark, sel, () => { selectedDex = id; Fill("dex"); });
                var well = Panel(card.transform, "well", sn ? Hex("f6efe0") : Hex("e2d6bf"), FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -14), new Vector2(216, 216));
                var art = Art(well, SpeciesSprite(id), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(200, 200));
                if (!sn) art.color = new Color(0, 0, 0, 0.42f);   // a flat silhouette: no eyes or markings show through
                var n = Label(card.transform, sn ? p.name : "？？？", FsBody, WoodDark, true); n.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 60), new Vector2(290, 48));
                var state = ct ? ("已抓到", Grass) : sn ? ("见过", Sky) : ("未发现", Hex("cdb894"));
                Chip(card.transform, state.Item1, state.Item2, 120, 42).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 14), new Vector2(120, 42));
                if (sn) KitImage(card.transform, ElementBadge(p.element), 48).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(12, -12), new Vector2(48, 48));
                if (E(id)?.shiny ?? false) Chip(card.transform, "异色", Hex("b9a0d0"), 80, 40).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-10, -10), new Vector2(80, 40));
            }

            // detail of the selected species
            var d = GameData.Species(selectedDex);
            bool dSeen = Seen(d.id), dCaught = Caught(d.id);
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-36, -110), new Vector2(620, 776));
            var bw = Panel(info, "well", dSeen ? Hex("f6efe0") : Hex("e2d6bf"), FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -16), new Vector2(280, 280));
            var big = Art(bw, SpeciesSprite(d.id), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(262, 262));
            if (!dSeen) big.color = new Color(0, 0, 0, 0.42f);
            var nm = Label(info, dSeen ? d.name : "？？？", FsTitle + 4, WoodDark, true); nm.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -304), new Vector2(580, 64));
            float ty = -376;
            if (dSeen)
            {
                KitImage(info, ElementBadge(d.element), 44).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(1, 1), new Vector2(-8, -372), new Vector2(44, 44));
                Chip(info, d.element + "属性", ElementColor(d.element), 112, 44).Place(new Vector2(0.5f, 1), new Vector2(0, 1), new Vector2(0, -372), new Vector2(112, 44));
                ty = -430;
            }
            string text;
            if (!dSeen) text = "还没遇到过。\n去远征的浮岛上找找看吧。";
            else if (!dCaught) text = $"{PetLore.GetValueOrDefault(d.id, "")}\n\n<color=#8a7458>抓到后能看到更多资料</color>";
            else
            {
                var bs = d.baseStats;
                bool evoOwned = s.pets.Any(p => p.species == d.id && p.evolved);
                text = $"{PetLore.GetValueOrDefault(d.id, "")}\n\n" +
                    $"基础　生命 {bs.hp}　攻击 {bs.atk}　防御 {bs.def}　速度 {bs.spd}\n" +
                    $"探索：{Explore.SkillNames.GetValueOrDefault(d.explore, d.explore)}　打工：{PetCare.Work.GetValueOrDefault(d.work)?.name}\n最爱吃：{GameData.Item(d.food)?.name}\n" +
                    $"进化后：{(evoOwned ? d.evolution.name : "？？？")}";
            }
            var t = Label(info, text, FsSub, Ink, false, TextAlignmentOptions.TopLeft); t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, ty), new Vector2(560, 340)); t.richText = true;
        }
    }
}
