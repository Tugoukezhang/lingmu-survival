// The partner panel (伙伴) with three tabs — 照顾 (care, party, work), 技能 (skills and skill books) and 养成
// (evolution, stars, human form) — and the pet dex (图鉴). Rules live in Lingmu.Rules (PetCare, Party, Growth).
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

        static string Ok(bool ok) => ok ? "<color=#4f7d3a>√</color>" : "<color=#e8604c>×</color>";

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

        // ---------- partners ----------
        void FillParty()
        {
            var s = session.S;
            var b = NewBox("伙伴", new Vector2(1660, 920));
            if (selectedPet == null || s.Pet(selectedPet) == null) { selectedPet = s.party.FirstOrDefault() ?? s.pets.FirstOrDefault()?.uid; pendingBook = null; }
            var dex = Button(b, $"图鉴 {Growth.DexCount(s)}/{GameData.Pets.Count}", Sky, Color.white, FsSub, () => Open("dex"));
            ((RectTransform)dex.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -10), new Vector2(230, TouchMin));

            // left: everyone (party first)
            var list = ScrollList(b, new Vector2(36, -110), new Vector2(540, 776));
            foreach (var p in s.pets.OrderBy(p => s.party.Contains(p.uid) ? s.party.IndexOf(p.uid) : 99))
            {
                var uid = p.uid;
                bool sel = uid == selectedPet, inParty = s.party.Contains(uid);
                var row = Panel(list, "row", sel ? Yellow : CreamDark, RoundSmall, true).rectTransform; row.sizeDelta = new Vector2(0, 124);
                row.gameObject.AddComponent<Button>().onClick.AddListener(() => { if (selectedPet != uid) pendingBook = null; selectedPet = uid; FillParty(); });
                Art(row, PetSprite(p), new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(104, 104));
                var n = Label(row, $"{PetMath.DisplayName(p)}  <size=28>Lv.{p.level}</size>", FsBody, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Fill(); n.rectTransform.offsetMin = new Vector2(126, 60); n.rectTransform.offsetMax = new Vector2(-10, -6);
                string state = inParty ? (s.party[0] == uid ? "领队" : "队伍中") : p.job ? "打工中" : "在家";
                var chip = Chip(row, state, inParty ? Grass : p.job ? Orange : Hex("b8a07e"), 100, 42); chip.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(126, 12), new Vector2(100, 42));
                var d = Label(row, $"<color=#e0a020>{new string('★', p.stars)}</color>{(p.shiny ? "  <color=#b07ad0>异色</color>" : "")}", FsSub, Ink, false, TextAlignmentOptions.Left); d.rectTransform.Fill(); d.rectTransform.offsetMin = new Vector2(240, 8); d.rectTransform.offsetMax = new Vector2(-10, -66);
                if (Attention(s, p)) Panel(row, "dot", Red, Circle, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-10, -10), new Vector2(24, 24));
            }

            var pet = s.Pet(selectedPet);
            if (pet == null) return;
            var sp = GameData.Species(pet.species);
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-36, -110), new Vector2(1028, 776));

            // header: art, name, element, nature, stars, exp and affection bars
            Art(info, PetSprite(pet), new Vector2(0, 1), new Vector2(0, 1), new Vector2(14, -10), new Vector2(230, 230));
            var name = Label(info, $"{PetMath.DisplayName(pet)}  <size=32>Lv.{pet.level}</size>", FsTitle + 4, WoodDark, true, TextAlignmentOptions.Left);
            name.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(262, -14), new Vector2(740, 60));
            var nat = GameData.Natures.TryGetValue(pet.nature ?? "gentle", out var nd) ? nd : null;
            Chip(info, sp.element + "属性", ElementColor(sp.element), 120, 46).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(262, -80), new Vector2(120, 46));
            var tags = Label(info, $"{nat?.name}　<color=#e0a020>{new string('★', pet.stars)}</color><color=#cdbb98>{new string('★', 5 - pet.stars)}</color>{(pet.shiny ? "　<color=#b07ad0>异色</color>" : "")}", FsSub, Ink, false, TextAlignmentOptions.Left);
            tags.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(398, -78), new Vector2(600, 50));
            Label(info, "经验", FsSub, Ink, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(262, -140), new Vector2(80, 40));
            var expBar = MakeBar(info, "exp", Sky); expBar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(346, -142), new Vector2(560, 36));
            bool max = pet.level >= PetMath.MaxLevel;
            SetBar(expBar, max ? 1 : pet.exp / (float)PetMath.ExpToNext(pet.level), max ? "满级" : $"{pet.exp}/{PetMath.ExpToNext(pet.level)}");
            Label(info, "好感", FsSub, Ink, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(262, -190), new Vector2(80, 40));
            var affBar = MakeBar(info, "affection", Hex("f08aa0")); affBar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(346, -192), new Vector2(560, 36));
            SetBar(affBar, pet.affection / 100f, $"{pet.affection}/100");

            // tabs
            var tabs = new[] { ("care", "照顾"), ("skills", "技能"), ("growth", "养成") };
            for (int i = 0; i < tabs.Length; i++)
            {
                var (key, label) = tabs[i];
                var tb = Button(info, label, partyTab == key ? Yellow : Cream, WoodDark, FsBody, () => { partyTab = key; pendingBook = null; FillParty(); });
                ((RectTransform)tb.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(20 + i * 236, -254), new Vector2(222, TouchMin));
                bool dot = key == "skills" ? CanLearnAny(s, pet) : key == "growth" && GrowthReady(s, pet);
                if (dot) Panel(tb.transform, "dot", Red, Circle, false).rectTransform.Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-12, -12), new Vector2(26, 26));
            }
            var area = Rect("tab", info); area.Fill(); area.offsetMin = new Vector2(20, 18); area.offsetMax = new Vector2(-20, -360);
            switch (partyTab)
            {
                case "skills": PartySkills(area, s, pet); break;
                case "growth": PartyGrowth(area, s, pet); break;
                default: PartyCare(area, s, pet); break;
            }
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
            var stats = Label(area, $"生命 <b>{st.hp}</b>　　攻击 <b>{st.atk}</b>　　防御 <b>{st.def}</b>　　速度 <b>{st.spd}</b>", FsBody, Ink, false, TextAlignmentOptions.Left);
            stats.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(10, 0), new Vector2(980, 48));
            var more = Label(area, $"探索：{Explore.SkillNames.GetValueOrDefault(sp.explore, sp.explore)}　　打工：{PetCare.Work.GetValueOrDefault(sp.work)?.name ?? sp.work}　　最爱吃：{GameData.Item(sp.food)?.name}", FsSub, Ink, false, TextAlignmentOptions.Left);
            more.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(10, -52), new Vector2(980, 44));
            var (fed, petted) = PetCare.CaredToday(s, pet);
            bool inP = s.party.Contains(pet.uid), home = s.player.area == "home";
            var grid = Rect("buttons", area).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(0, 0), new Vector2(988, 2 * TouchMin + 18));
            var gl = grid.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(318, TouchMin); gl.spacing = new Vector2(17, 18); gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 3;
            var uid = pet.uid;
            void B(string label, bool on, Action a, Color? bg = null) { var x = Button(grid, label, on ? (bg ?? Yellow) : Cream, WoodDark, FsSub, a); x.interactable = on; }
            B(petted ? "今天摸过了" : "摸摸（好感 +2）", !petted, () => session.PetPet(uid));
            var food = PetCare.FoodsInBag(s).OrderByDescending(x => x.id == sp.food).FirstOrDefault();
            B(fed ? "今天喂过了" : food == null ? "没有食物" : $"喂{GameData.Item(food.id).name}", !fed && food != null, () => session.Feed(uid, food.id));
            if (inP) B(s.party[0] == pet.uid ? "已是领队" : "设为领队", s.party[0] != pet.uid, () => session.SetLead(uid), Grass);
            else B("加入队伍", home && s.party.Count < SaveRules.PartyMax, () => session.JoinParty(uid), Grass);
            if (inP) B("回家休息", home && s.party.Count > 1, () => session.LeaveParty(uid));
            else B(pet.job ? "停止打工" : "在家打工", home, () => session.SetJob(uid, !pet.job));
            var tip = Label(area, fed ? "喂食、打工都会给一点经验" : "每天喂一次：好感上升，还有一点经验", FsMin, Hex("8a7458"), false, TextAlignmentOptions.Left);
            tip.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(10, 2 * TouchMin + 26), new Vector2(980, 40));
        }

        // a skill card: element colour, name, power and uses; optional button underneath
        void SkillCard(RectTransform parent, string skillId, Vector2 pos, float width, string tag, string button = null, Action onClick = null)
        {
            var sk = GameData.Skill(skillId);
            var card = Panel(parent, "skill " + skillId, Color.Lerp(ElementColor(sk.element), Color.white, 0.62f), RoundSmall, false).rectTransform;
            card.Place(new Vector2(0, 1), new Vector2(0, 1), pos, new Vector2(width, button != null ? 240 : 150));
            Panel(card, "strip", ElementColor(sk.element), RoundSmall, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 0), new Vector2(14, 150));
            var n = Label(card, sk.name, FsBody, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(26, -10), new Vector2(width - 34, 46));
            string el = string.IsNullOrEmpty(sk.element) || sk.element == Elements.Normal ? "普通" : sk.element;
            string power = sk.power > 0 ? $"{el} · 威力 {sk.power}" : $"{el} · 状态";
            var d = Label(card, power + "\n" + (sk.uses == null ? "次数不限" : $"每场 {sk.uses} 次") + (tag != null ? $"　{tag}" : ""), FsMin, Ink, false, TextAlignmentOptions.TopLeft);
            d.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(26, -58), new Vector2(width - 34, 90));
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
                var cancel = Button(area, "取消", Cream, WoodDark, FsSub, () => { pendingBook = null; FillParty(); }); ((RectTransform)cancel.transform).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(0, 6), new Vector2(180, TouchMin));
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
                var none = Label(area, "背包里没有技能书。\n小镇杂货铺每天卖 2 本，远征的宝箱也能开出来。", FsSub, Hex("8a7458"), false, TextAlignmentOptions.TopLeft);
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
                    else { pendingBook = id; FillParty(); }
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
                var col = Panel(area, "column", Cream, RoundSmall, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(i * 332, 0), new Vector2(318, 380));
                var t = Label(col, title, FsBody, WoodDark, true); t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -8), new Vector2(300, 48));
                return col;
            }
            TextMeshProUGUI Body(RectTransform col, string text)
            {
                var t = Label(col, text, FsMin, Ink, false, TextAlignmentOptions.TopLeft); t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -64), new Vector2(286, 200)); t.richText = true;
                return t;
            }
            Button Act(RectTransform col, string label, bool on, Action a, Color? bg = null)
            {
                var bt = Button(col, label, on ? (bg ?? Grass) : CreamDark, on ? Color.white : WoodDark, FsSub, a); bt.interactable = on;
                ((RectTransform)bt.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 14), new Vector2(290, TouchMin));
                return bt;
            }

            // evolution
            var evo = Column(0, pet.evolved ? "已进化" : $"进化 → {sp.evolution.name}");
            if (pet.evolved) Body(evo, $"已经是{sp.evolution.name}了！\n学会了进化技能「{GameData.Skill(sp.evolution.skill).name}」，属性也变强了。");
            else
            {
                int stones = Inventory.CountOf(s.inventory, sp.evolution.stone);
                Body(evo, $"{Ok(pet.level >= PetMath.EvolveLevel)} 等级 {PetMath.EvolveLevel}（现在 {pet.level}）\n{Ok(pet.affection >= PetMath.EvolveAffection)} 好感 {PetMath.EvolveAffection}（现在 {pet.affection}）\n{Ok(stones > 0)} {GameData.Item(sp.evolution.stone)?.name}（有 {stones} 个）\n<size=26><color=#8a7458>进化石在远征的宝箱里</color></size>");
                Act(evo, "进化", Growth.EvolveCheck(s, uid).ok, () => session.Evolve(uid));
            }

            // stars and crystals
            int crystals = Growth.CrystalsOf(s, pet.species), need = Growth.StarCost(pet.stars);
            var star = Column(1, "星级");
            Body(star, $"<size=34><color=#e0a020>{new string('★', pet.stars)}</color><color=#cdbb98>{new string('★', 5 - pet.stars)}</color></size>\n" +
                (pet.stars >= 5 ? "已经满星了" : $"结晶 {crystals}/{need}") + "\n<color=#8a7458>重复抓到同种宠物，可以转成结晶来升星</color>");
            bool dup = s.pets.Count(x => x.species == pet.species) > 1;
            if (dup && !(pet.stars < 5 && crystals >= need)) Act(star, $"把它转成结晶 +{pet.stars}", !inP || s.party.Count > 1, () => { Growth.ConvertToCrystal(s, uid); selectedPet = null; session.Say($"转成了 {pet.stars} 颗结晶"); session.AfterAction(); }, Orange);
            else Act(star, pet.stars >= 5 ? "已满星" : "升星", pet.stars < 5 && crystals >= need, () => { Growth.StarUp(s, uid); session.Say($"升到了 {pet.stars} 星！"); session.AfterAction(); }, Yellow);

            // human form (first version: 焰尾狐 only)
            var form = Column(2, "化形");
            if (string.IsNullOrEmpty(sp.humanForm)) { Body(form, "<color=#8a7458>这只宠物不会化形。\n目前只有焰尾狐能化成人形。</color>"); return; }
            var fc = Growth.FormCheck(s, uid);
            if (fc.unlocked)
            {
                Body(form, pet.form == "human" ? "现在是人形。\n变身不会改变属性。" : "已经学会化形了。\n变身不会改变属性。");
                Act(form, pet.form == "human" ? "变回原形" : "变成人形", true, () => session.ToggleForm(uid), Sky);
                return;
            }
            int bells = Inventory.CountOf(s.inventory, "item_fox_bell");
            Body(form, $"{Ok(pet.evolved)} 已经进化\n{Ok(pet.affection >= 100)} 好感 100（现在 {pet.affection}）\n{Ok(bells > 0)} 化形铃（有 {bells} 个）\n<size=26><color=#8a7458>化形铃：完成露米的「焰尾狐的心愿」</color></size>");
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
            int seen = GameData.Pets.Count(p => Seen(p.id));
            var back = Button(b, "‹ 伙伴", WoodMid, Cream, FsSub, () => Open("party")); ((RectTransform)back.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -10), new Vector2(190, TouchMin));
            var head = Label(b, $"抓到 {Growth.DexCount(s)} / {GameData.Pets.Count}　　见过 {seen} / {GameData.Pets.Count}", FsBody, Ink, true, TextAlignmentOptions.Left);
            head.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(46, -112), new Vector2(900, 50));
            if (selectedDex == null || GameData.Pets.All(p => p.id != selectedDex)) selectedDex = (GameData.Pets.FirstOrDefault(p => Caught(p.id)) ?? GameData.Pets[0]).id;

            var grid = Rect("grid", b).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(36, -176), new Vector2(950, 710));
            var gl = grid.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(306, 340); gl.spacing = new Vector2(16, 16); gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 3;
            foreach (var p in GameData.Pets)
            {
                var id = p.id; bool sn = Seen(id), ct = Caught(id), sel = id == selectedDex;
                var card = Panel(grid, "card " + id, sel ? Yellow : CreamDark, Round, true);
                card.gameObject.AddComponent<Button>().onClick.AddListener(() => { selectedDex = id; FillDex(); });
                var art = Art(card.rectTransform, SpeciesSprite(id), new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -12), new Vector2(210, 210));
                if (!sn) art.color = new Color(0.25f, 0.18f, 0.12f, 0.85f);   // silhouette
                var n = Label(card.transform, sn ? p.name : "？？？", FsBody, WoodDark, true); n.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 62), new Vector2(290, 46));
                var state = ct ? ("已抓到", Grass) : sn ? ("见过", Sky) : ("未发现", Hex("b8a07e"));
                Chip(card.transform, state.Item1, state.Item2, 120, 42).Place(new Vector2(0.5f, 0), new Vector2(sn ? 1 : 0.5f, 0), new Vector2(sn ? -4 : 0, 12), new Vector2(120, 42));
                if (sn) Chip(card.transform, p.element, ElementColor(p.element), 70, 42).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(4, 12), new Vector2(70, 42));
                if (E(id)?.shiny ?? false) Chip(card.transform, "异色", Hex("b07ad0"), 80, 40).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-10, -10), new Vector2(80, 40));
            }

            // detail of the selected species
            var d = GameData.Species(selectedDex);
            bool dSeen = Seen(d.id), dCaught = Caught(d.id);
            var info = Panel(b, "info", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-36, -110), new Vector2(620, 776));
            var big = Art(info, SpeciesSprite(d.id), new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -16), new Vector2(280, 280));
            if (!dSeen) big.color = new Color(0.25f, 0.18f, 0.12f, 0.85f);
            var nm = Label(info, dSeen ? d.name : "？？？", FsTitle + 4, WoodDark, true); nm.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -304), new Vector2(580, 60));
            string text;
            if (!dSeen) text = "还没遇到过。\n去远征的浮岛上找找看吧。";
            else if (!dCaught) text = $"{d.element}属性\n\n{PetLore.GetValueOrDefault(d.id, "")}\n\n<color=#8a7458>抓到后能看到更多资料</color>";
            else
            {
                var bs = d.baseStats;
                bool evoOwned = s.pets.Any(p => p.species == d.id && p.evolved);
                text = $"{d.element}属性\n{PetLore.GetValueOrDefault(d.id, "")}\n\n" +
                    $"基础　生命 {bs.hp}　攻击 {bs.atk}　防御 {bs.def}　速度 {bs.spd}\n" +
                    $"探索：{Explore.SkillNames.GetValueOrDefault(d.explore, d.explore)}　打工：{PetCare.Work.GetValueOrDefault(d.work)?.name}\n最爱吃：{GameData.Item(d.food)?.name}\n" +
                    $"进化后：{(evoOwned ? d.evolution.name : "？？？")}";
            }
            var t = Label(info, text, FsSub, Ink, false, TextAlignmentOptions.TopLeft); t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -376), new Vector2(560, 390)); t.richText = true;
        }
    }
}
