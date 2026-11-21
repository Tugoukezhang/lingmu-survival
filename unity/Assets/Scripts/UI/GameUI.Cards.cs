// Card-style panels (docs/19 第二节): the airship dock as route cards, the campfire with a burn bar, daily tasks as
// task cards with the all-done reward, the end-of-day diary, a general confirm box (used before leaving a lost bag
// behind) and the full-screen celebration card (evolution, a new star, the human form).
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
        static readonly Color Note = Hex("75604d");

        // a small chip with an icon and a few words (info strips)
        RectTransform IconChip(RectTransform parent, Sprite icon, string text, float width)
        {
            var c = Panel(parent, "chip " + text, Hex("f3ead6"), FlatSmall, false).rectTransform; c.sizeDelta = new Vector2(width, 60);
            if (icon) { var i = Rect("icon", c).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(12, 0), new Vector2(44, 44)).gameObject.AddComponent<Image>(); i.sprite = icon; i.preserveAspect = true; i.raycastTarget = false; }
            var t = Label(c, text, FsSub, WoodDark, true, TextAlignmentOptions.Left); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(icon ? 64 : 16, 0);
            return c;
        }

        // ---------- confirm box ----------
        string askTitle, askText, askOk; Action askAct, askBack;

        // "are you sure?" before something you cannot undo; back = where 再想想 goes (default: close)
        public void Ask(string title, string text, string ok, Action act, Action back = null)
        {
            askTitle = title; askText = text; askOk = ok; askAct = act; askBack = back;
            Open("confirm");
        }

        void FillConfirm()
        {
            var b = NewBox(askTitle, new Vector2(1000, 560));
            KitImage(b, "quest_mark", 96).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -84), new Vector2(96, 96));
            var t = Label(b, askText, FsBody, Ink); t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -196), new Vector2(860, 160));
            var back = Button(b, "再想想", Cream, WoodDark, FsBody, () => { var a = askBack; if (a != null) a(); else Close(); });
            ((RectTransform)back.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-16, 40), new Vector2(300, 96));
            var ok = Button(b, askOk, Yellow, WoodDark, FsBody, () => { var a = askAct; Close(); a?.Invoke(); });
            ((RectTransform)ok.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(16, 40), new Vector2(300, 96));
        }

        // the expedition airship when the lost bag is still on the island (ExpeditionArea returns "leave")
        void FillLeave()
        {
            int lost = Travel.LostBagCount(session.S);
            askTitle = "现在回家？"; askOk = "回家"; askBack = null;
            askText = $"岛上还有你的失物包（{lost} 件）。\n下次在码头选「回到上次的岛」还能捡回来。";
            askAct = () => session.GoTo("home");
            FillConfirm();
        }

        // ---------- the airship dock: route cards ----------
        void FillDock()
        {
            var s = session.S;
            int lost = Travel.LostBagCount(s);
            bool hasLast = s.expedition != null;
            var b = NewBox("飞艇码头", new Vector2(1400, 840));
            var strip = Rect("info", b).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -92), new Vector2(1000, 60));
            var hl = strip.gameObject.AddComponent<HorizontalLayoutGroup>(); hl.spacing = 16; hl.childAlignment = TextAnchor.MiddleCenter; hl.childControlWidth = false; hl.childControlHeight = false; hl.childForceExpandWidth = false;
            IconChip(strip, Kit("act_airship"), $"{GameTime.Format(s.clock)} 出发 → {GameTime.Format(Mathf.Min(s.clock + 60, 24 * 60 - 1))} 抵达", 380);
            IconChip(strip, Kit("fog"), "20:00 起雾", 240);

            var island = Resources.Load<Sprite>("UI/Title/title_island");
            void Route(float x, string title, string text, bool warn, string button, Color bg, Color fg, Action act)
            {
                var card = Panel(b, "route " + title, Hex("f6efe0"), null, false, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(x, -176), new Vector2(560, 560));
                var art = Rect("art", card).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -12), new Vector2(260, 230)).gameObject.AddComponent<Image>();
                art.sprite = island ? island : Kit("act_airship"); art.preserveAspect = true; art.raycastTarget = false;
                UiMotion.Bob(art, 6, 0.5f, x > 0 ? 0.5f : 0);
                if (warn) { var bag = KitImage(card, "act_chest", 70); bag.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(110, -170), new Vector2(70, 70)); UiMotion.Pulse(bag, 0.08f); }
                var t = Label(card, title, FsTitle, WoodDark, true); t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -250), new Vector2(520, 60));
                var d = Label(card, text, FsSub, warn ? Hex("a8503c") : Ink); d.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -318), new Vector2(500, 110));
                var go = Button(card, button, bg, fg, FsBody + 2, act);
                ((RectTransform)go.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 28), new Vector2(320, 96));
            }
            void GoNew() => session.GoTo("expedition", "new");
            Action newAct = hasLast && lost > 0
                ? () => Ask("去新的浮岛？", $"上次的岛上还有失物包（{lost} 件）。\n去新的岛，失物包就找不回来了。", "还是去新的", GoNew, () => Open("dock"))
                : (Action)GoNew;
            if (hasLast)
            {
                Route(-296, "新的浮岛", "随机的雾林浮岛\n资源、宝箱、野生宠物都是新的", false, "出发", Yellow, WoodDark, newAct);
                Route(296, "上次的岛", lost > 0 ? $"失物包还在岛上（{lost} 件）\n回去就能捡回来" : "接着探索上次的岛\n采过的地方还没长回来", lost > 0, "回去", Grass, Color.white, () => session.GoTo("expedition", "last"));
            }
            else Route(0, "新的浮岛", "随机的雾林浮岛\n资源、宝箱、野生宠物都是新的", false, "出发", Yellow, WoodDark, newAct);
            var tip = Label(b, "天黑前回来，或者带够木材和帐篷在岛上过夜", FsSub, Note); tip.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(1000, 50));
        }

        // ---------- campfire on an expedition island ----------
        void FillCamp()
        {
            var ex = session.Area as ExpeditionArea;
            var s = session.S;
            var f = Camp.Fires(s).Find(x => x.id == ex?.CampFireId);
            if (f == null) { Close(); return; }
            var b = NewBox("营火", new Vector2(1160, 700));
            int left = Camp.FireLeft(s, f), wood = Camp.WoodToDawn(s, f), have = Inventory.CountOf(s.inventory, "item_wood");
            bool tent = Inventory.CountOf(s.inventory, "item_tent") > 0;
            var fire = KitImage(b, "act_fire", 230); fire.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(60, -110), new Vector2(230, 230));
            if (left > 0) UiMotion.Pulse(fire, 0.04f, 1.3f); else fire.color = new Color(1, 1, 1, 0.45f);
            var head = Label(b, left > 0 ? $"还能烧 {left / 60} 小时 {left % 60} 分" : "营火已经熄灭了", FsTitle, WoodDark, true, TextAlignmentOptions.Left);
            head.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(330, -110), new Vector2(780, 60));
            Label(b, "到明早 6:00", FsSub, Note, false, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(330, -180), new Vector2(200, 44));
            var bar = MakeBar(b, "burn", Orange); bar.root.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(500, -184), new Vector2(600, 38));
            float frac = left + wood * Camp.FirePerWood > 0 ? left / (float)(left + wood * Camp.FirePerWood) : 1;
            SetBar(bar, wood == 0 ? 1 : frac, wood == 0 ? "够烧到天亮" : $"还差 {wood} 根木材");
            var wi = Rect("wood", b).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(330, -246), new Vector2(52, 52)).gameObject.AddComponent<Image>(); wi.sprite = Icon("item_wood"); wi.preserveAspect = true; wi.raycastTarget = false;
            Label(b, $"背包里有木材 {have} 根　（1 根 = 多烧 2 小时）", FsSub, Ink, false, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(394, -250), new Vector2(700, 48));
            CheckLine(b, tent, tent ? "有帐篷：火够烧到天亮就能在这里睡" : "没有帐篷：在家园工作台用布 4 + 木材 6 做一顶", new Vector2(330, -318), 780);
            CheckLine(b, wood == 0, wood == 0 ? "火能烧到天亮" : "先添柴，让火烧到天亮", new Vector2(330, -366), 780);
            var id = f.id;
            var add = Button(b, "添柴：木材 −1，多烧 2 小时", Yellow, WoodDark, FsSub, () => ex.AddWood(id)); ((RectTransform)add.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-14, 40), new Vector2(420, 96));
            add.interactable = have > 0;
            var sleep = Button(b, "在帐篷里睡到天亮", Grass, Color.white, FsBody, () => { var c = Camp.CanCampSleep(s, id); if (c.ok) { openPanel = null; poppedFor = null; modal.gameObject.SetActive(false); session.ResumeFor("menu"); if (mover) mover.enabled = true; } ex.CampSleep(id); });
            ((RectTransform)sleep.transform).Place(new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(14, 40), new Vector2(420, 96));
            sleep.interactable = tent && wood == 0;
        }

        // ---------- daily tasks: three a day, +20 clover each, +30 and a seed packet for all three ----------
        static string TaskIcon(string stat) => stat switch
        {
            "water" => "act_water", "feed" => "item_berry", "pet" => "heart", "gather" => "act_pick", "plant" => "act_seed", "craft" => "hud_craft",
            "wins" => "sparkle", "chests" => "act_chest", "shipped" => "act_ship", "harvest" => "act_sickle", "catches" => "act_net", "talk" => "act_talk", _ => "quest_mark",
        };

        void FillDaily()
        {
            var s = session.S;
            var d = Daily.Ensure(s);
            var b = NewBox($"每日任务 · 第 {s.day} 天", new Vector2(1240, 840));
            for (int i = 0; i < d.tasks.Count; i++)
            {
                var t = d.tasks[i];
                int prog = Mathf.Max(0, Daily.Progress(s, t));
                var row = Panel(b, "task", t.done ? Hex("eef3df") : Hex("f6efe0"), RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -96 - i * 158), new Vector2(1140, 142));
                var well = Panel(row, "well", Cream, FlatCircle, false).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(20, 0), new Vector2(104, 104));
                var ic = TaskIcon(t.stat);
                var img = Rect("icon", well).Fill(14).gameObject.AddComponent<Image>(); img.sprite = ic.StartsWith("item_") ? Icon(ic) : Kit(ic); img.preserveAspect = true; img.raycastTarget = false;
                var name = Label(row, t.text, FsBody, WoodDark, true, TextAlignmentOptions.Left); name.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(148, -14), new Vector2(700, 50));
                var bar = MakeBar(row, "progress", t.done ? Grass : Orange); bar.root.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(148, 22), new Vector2(600, 36));
                SetBar(bar, prog / (float)t.n, $"{Mathf.Min(prog, t.n)}/{t.n}");
                if (t.done)
                {
                    KitImage(row, "tick", 64).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-150, 0), new Vector2(64, 64));
                    Label(row, "已到账", FsBody, GrassDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-20, 0), new Vector2(120, 50));
                }
                else
                {
                    Clover(row, 52).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-150, 0), new Vector2(52, 52));
                    Label(row, $"+{Daily.TaskReward}", FsTitle, Hex("b07a2a"), true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-30, 0), new Vector2(110, 56));
                }
            }
            // all three: the bonus
            int done = d.tasks.Count(x => x.done);
            var bonus = Panel(b, "bonus", d.bonus ? Hex("eef3df") : Picked, RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(1140, 120));
            var bt = Label(bonus, d.bonus ? "今天的奖励都领完了，明天再来！" : $"额外奖励 · 完成 {done}/3", FsBody, WoodDark, true, TextAlignmentOptions.Left); bt.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(30, 0), new Vector2(520, 56));
            for (int i = 0; i < 3; i++)
            {
                var dot = KitImage(bonus, i < done ? "tick" : "lock", 46); dot.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(340 + i * 56, 0), new Vector2(46, 46));
                if (i >= done) dot.color = new Color(1, 1, 1, 0.5f);
                if (d.bonus) dot.gameObject.SetActive(false);
            }
            if (!d.bonus)
            {
                Clover(bonus, 52).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-330, 0), new Vector2(52, 52));
                Label(bonus, $"+{Daily.AllBonus}", FsTitle, Hex("b07a2a"), true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-210, 0), new Vector2(110, 56));
                var seed = Rect("seed", bonus).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-150, 0), new Vector2(64, 64)).gameObject.AddComponent<Image>(); seed.sprite = Icon("item_seed_carrot"); seed.preserveAspect = true; seed.raycastTarget = false;
                Label(bonus, "种子", FsSub, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-30, 0), new Vector2(110, 50));
            }
        }

        // ---------- the end-of-day diary ----------
        static string ReportIcon(string line)
        {
            bool Has(params string[] ks) => ks.Any(line.Contains);
            return Has("睡") ? "act_sleep" : Has("出货") ? "act_ship" : Has("作物", "长大", "成熟") ? "act_seed" : Has("打工") ? "act_pickaxe"
                : Has("宠物", "伙伴") ? "hud_pets" : Has("饿", "生命") ? "heart" : Has("雾", "晕") ? "fog" : Has("任务") ? "hud_daily" : Has("四叶草") ? "clover" : "sparkle";
        }

        void ShowReport(SettlementReport r)
        {
            openPanel = "report";
            GameAudio.Play("dayend");
            modal.gameObject.SetActive(true);
            if (mover) mover.enabled = false;
            PlayerMover.Stick = Vector2.zero;
            var b = NewBox($"第 {r.endedDay} 天的日记", new Vector2(1440, 840));
            var s = session.S;
            // a notebook: the left page is the day, the right page what happened
            Panel(b, "spine", Hex("eadfca"), FlatSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-80, -100), new Vector2(8, 560));
            var day = Label(b, $"第 {r.endedDay} 天", FsTitle + 28, WoodDark, true); day.rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 1), new Vector2(320, -110), new Vector2(520, 90));
            var sun = KitImage(b, "sun", 130); sun.rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 1), new Vector2(320, -210), new Vector2(130, 130)); sun.rectTransform.localRotation = Quaternion.Euler(0, 0, -8);
            UiMotion.Bob(sun, 4, 0.6f);
            var mood = Label(b, "辛苦啦，今天也过得很充实！", FsSub, Note); mood.rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 1), new Vector2(320, -356), new Vector2(520, 50));
            // the party, asleep in a row
            var party = s.party.Select(s.Pet).Where(p => p != null).ToList();
            for (int i = 0; i < party.Count; i++)
            {
                var a = Rect("pet", b).Place(new Vector2(0, 1), new Vector2(0.5f, 1), new Vector2(320 + (i - (party.Count - 1) / 2f) * 130, -420), new Vector2(120, 120)).gameObject.AddComponent<Image>();
                a.sprite = PetSprite(party[i]); a.preserveAspect = true; a.raycastTarget = false;
                UiMotion.Bob(a, 3, 0.4f, i * 0.3f);
            }
            Label(b, "四叶草余额", FsMin, Note).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 1), new Vector2(320, -560), new Vector2(300, 36));
            var cl = Rect("clover", b).Place(new Vector2(0, 1), new Vector2(0.5f, 1), new Vector2(320, -596), new Vector2(300, 60));
            Clover(cl, 50).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(30, 0), new Vector2(50, 50));
            Label(cl, s.clover.ToString(), FsTitle, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(96, 0), new Vector2(200, 56));
            // the right page: one line per thing that happened, with an icon
            var page = ScrollList(b, new Vector2(680, -100), new Vector2(700, 560), 10);
            foreach (var line in r.lines)
            {
                var row = Rect("line", page); row.sizeDelta = new Vector2(0, 76);
                var ic = ReportIcon(line);
                KitImage(row, ic, 56).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(0, 0), new Vector2(56, 56));
                var t = Label(row, line, FsSub, Ink, false, TextAlignmentOptions.Left); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(72, 0);
            }
            if (r.lines.Count == 0) { var row = Rect("line", page); row.sizeDelta = new Vector2(0, 76); Label(row, "平平静静的一天。", FsSub, Ink).rectTransform.Fill(); }
            var go = Button(b, $"开始第 {r.day} 天", Yellow, WoodDark, 36, Close); ((RectTransform)go.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-60, 40), new Vector2(380, 100));
        }

        // ---------- the celebration card ----------
        RectTransform celebration;

        // full screen: soft turning rays behind the pet, a honey title, one line, 继续
        public void Celebrate(Sprite art, string title, string line)
        {
            if (celebration) Destroy(celebration.gameObject);
            celebration = Rect("celebration", transform).Fill();
            var dimC = celebration.gameObject.AddComponent<Image>(); dimC.color = new Color(0.08f, 0.05f, 0.03f, 0.8f);
            var rays = Rect("rays", celebration).Place(new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900, 900)).gameObject.AddComponent<Image>();
            rays.sprite = Rays; rays.color = new Color(1, 0.9f, 0.6f, 0.55f); rays.raycastTarget = false;
            UiMotion.Add(rays, UiMotion.Kind.Spin, 10);
            var glow = Panel(celebration, "glow", new Color(1, 0.96f, 0.85f, 0.5f), FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(460, 460));
            var pet = Rect("art", celebration).Place(new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(440, 440)).gameObject.AddComponent<Image>();
            pet.sprite = art; pet.preserveAspect = true; pet.raycastTarget = false;
            UiMotion.PopIn(pet); UiMotion.Bob(pet, 10, 0.6f);
            for (int i = 0; i < 3; i++)
            {
                var sp = KitImage(celebration, "sparkle", 64 - i * 10); sp.rectTransform.Place(new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), new Vector2(new[] { -260f, 250f, 200f }[i], new[] { 140f, 180f, -150f }[i]), new Vector2(64 - i * 10, 64 - i * 10));
                UiMotion.Bob(sp, 9, 1.2f, i * 0.4f);
            }
            var plate = Panel(celebration, "title", Picked, null, false, true).rectTransform.Place(new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), new Vector2(0, -290), new Vector2(560, 92));
            Label(plate, title, FsTitle + 4, WoodDark, true).rectTransform.Fill();
            UiMotion.PopIn(plate);
            var t = Label(celebration, line, FsBody, Cream, true); t.rectTransform.Place(new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), new Vector2(0, -372), new Vector2(1000, 50));
            var ok = Button(celebration, "继续", Yellow, WoodDark, FsBody + 2, () => { if (celebration) Destroy(celebration.gameObject); });
            ((RectTransform)ok.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 48), new Vector2(300, 96));
            GameAudio.Play("levelup", 0.9f);
        }
    }
}
