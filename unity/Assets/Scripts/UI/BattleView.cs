// The battle screen (web scenes/BattleScene.js, new layout): your pet bottom left, the wild pet top right, HP bars,
// the message line, four skill buttons, and 零食 / 扔网 / 换伙伴 / 自动 / 一键结算 / 溜走. Turn events from the rules are
// played back one by one. When the battle is over the one commit happens (GameSession.FinishBattle) and the result shows.
using System;
using System.Collections;
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
    public class BattleView : MonoBehaviour
    {
        class Side { public RectTransform root, portrait; public Image art; public TextMeshProUGUI name; public Bar hp; public Image element; public TextMeshProUGUI elementText; }

        GameSession session;
        BattleState b;
        Side me, foe;
        TextMeshProUGUI log;
        RectTransform actions, sub, result;
        readonly List<Button> skillButtons = new List<Button>();
        Button snackBtn, netBtn, switchBtn, autoBtn, quickBtn, fleeBtn;
        bool playing;
        public Action Closed;

        public static BattleView Create(Transform parent)
        {
            var root = Rect("battle", parent).Fill();
            var v = root.gameObject.AddComponent<BattleView>();
            v.Build(root);
            root.gameObject.SetActive(false);
            return v;
        }

        static Sprite PetArt(Mon m)
        {
            var key = m.src != null && m.src.evolved ? $"pet_{m.species}_evo" : m.form == "human" ? $"pet_{m.species}_human" : $"pet_{m.species}";
            return Resources.Load<Sprite>("Icons/Pets/" + key) ?? Resources.Load<Sprite>("Icons/Pets/pet_" + m.species);
        }

        void Build(RectTransform root)
        {
            var sky = root.gameObject.AddComponent<Image>(); sky.color = Hex("cfe8f3");
            var hill = Panel(root, "hill", Hex("a9d67e"), Circle, false).rectTransform; hill.anchorMin = new Vector2(-0.3f, -0.9f); hill.anchorMax = new Vector2(1.3f, 0.42f); hill.offsetMin = hill.offsetMax = Vector2.zero;
            var hill2 = Panel(root, "hill2", Hex("bfe39a"), Circle, false).rectTransform; hill2.anchorMin = new Vector2(0.35f, 0.25f); hill2.anchorMax = new Vector2(1.25f, 0.72f); hill2.offsetMin = hill2.offsetMax = Vector2.zero;
            foe = MakeSide(root, new Vector2(0.71f, 0.62f), 360, true);
            me = MakeSide(root, new Vector2(0.27f, 0.36f), 420, false);
            var logBox = Panel(root, "log", new Color(Cream.r, Cream.g, Cream.b, 0.95f), null, false, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -26), new Vector2(1100, 90));
            log = Label(logBox, "", 32, Ink, true); log.rectTransform.Fill(12);

            actions = Panel(root, "actions", new Color(Cream.r, Cream.g, Cream.b, 0.96f), null, true, true).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-28, 24), new Vector2(860, 380));
            for (int i = 0; i < 4; i++)
            {
                int k = i;
                var btn = Button(actions, "", Yellow, WoodDark, FsBody, () => UseSkill(k));
                ((RectTransform)btn.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(24 + (i % 2) * 412, -22 - (i / 2) * 124), new Vector2(400, 112));
                var lbl = btn.GetComponentInChildren<TextMeshProUGUI>(); lbl.alignment = TextAlignmentOptions.Left; lbl.margin = new Vector4(24, 0, 10, 0); lbl.richText = true;
                skillButtons.Add(btn);
            }
            float bw = 156, gap = 10, y = 24;
            Button Small(string t, Color bg, Color fg, int i, Action a) { var x = Button(actions, t, bg, fg, FsSub, a); ((RectTransform)x.transform).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(24 + i * (bw + gap), y), new Vector2(bw, TouchMin)); return x; }
            snackBtn = Small("零食", WoodMid, Cream, 0, () => OpenSub("snack"));
            netBtn = Small("扔网", WoodMid, Cream, 1, () => OpenSub("net"));
            switchBtn = Small("换伙伴", WoodMid, Cream, 2, () => OpenSub("switch"));
            autoBtn = Small("自动", Grass, Color.white, 3, () => Do(Rules.Battle.AutoAction(b)));
            fleeBtn = Small("溜走", CreamDark, WoodDark, 4, () => Do(BattleAction.Flee()));
            quickBtn = Button(root, "一键结算", Grass, Color.white, FsBody, QuickResolve);
            ((RectTransform)quickBtn.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-28, 420), new Vector2(250, TouchMin));
        }

        Side MakeSide(RectTransform root, Vector2 anchor, float size, bool isFoe)
        {
            var s = new Side();
            s.root = Rect(isFoe ? "foe" : "me", root).Place(anchor, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
            var shadow = Panel(s.root, "shadow", new Color(0.2f, 0.35f, 0.15f, 0.3f), Circle, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, 20), new Vector2(size * 0.8f, size * 0.2f));
            s.portrait = Rect("portrait", s.root).Fill();
            s.art = s.portrait.gameObject.AddComponent<Image>(); s.art.preserveAspect = true; s.art.raycastTarget = false;
            if (isFoe) s.portrait.localScale = new Vector3(-1, 1, 1);   // face each other
            var card = Panel(root, "card", new Color(Cream.r, Cream.g, Cream.b, 0.95f), null, false, true).rectTransform;
            card.Place(anchor, new Vector2(0.5f, 0.5f), isFoe ? new Vector2(-470, 120) : new Vector2(0, -290), new Vector2(430, 130));
            s.name = Label(card, "", 32, WoodDark, true, TextAlignmentOptions.Left); s.name.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(22, -12), new Vector2(300, 50));
            s.element = Panel(card, "element", Grass, RoundSmall, false); s.element.rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-16, -14), new Vector2(84, 46));
            s.elementText = Label(s.element.transform, "", FsMin, Color.white, true); s.elementText.rectTransform.Fill();
            s.hp = MakeBar(card, "hp", Red); s.hp.root.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(22, 20), new Vector2(386, 34));
            return s;
        }

        // ---------- showing ----------
        public void Show(GameSession g, BattleState battle)
        {
            session = g; b = battle; playing = false;
            gameObject.SetActive(true);
            if (result) Destroy(result.gameObject);
            if (sub) Destroy(sub.gameObject);
            actions.gameObject.SetActive(true);
            var f = Rules.Battle.Active(b, "foe");
            log.text = b.ambush ? $"你悄悄靠近了野生的{f.name}！（对方第 1 回合来不及行动）" : $"野生的{f.name}（Lv.{f.level}）出现了！";
            Refresh();
        }

        void Refresh()
        {
            Fill(me, Rules.Battle.Active(b, "me"));
            Fill(foe, Rules.Battle.Active(b, "foe"));
            var m = Rules.Battle.Active(b, "me");
            for (int i = 0; i < 4; i++)
            {
                var btn = skillButtons[i];
                if (i >= m.skills.Count) { btn.gameObject.SetActive(false); continue; }
                btn.gameObject.SetActive(true);
                var s = GameData.Skill(m.skills[i]);
                int uses = m.uses[m.skills[i]];
                string useText = uses == int.MaxValue ? "" : $"  <size=26>{uses}/{s.uses}</size>";
                string power = s.power > 0 ? $"<size=26>威力 {s.power}</size>" : "<size=26>状态</size>";
                btn.SetLabel($"{s.name}{useText}\n{power}");
                btn.GetComponent<Image>().color = Color.Lerp(WildPet.ElementColor(s.element), Color.white, 0.55f);
                btn.interactable = !playing && !b.needSwitch && uses > 0;
            }
            bool can = !playing && b.over == null;
            snackBtn.interactable = can && !b.needSwitch && b.inventory.Any(x => GameData.Item(x.id)?.food != null);
            netBtn.interactable = can && !b.needSwitch && b.inventory.Any(x => GameData.Item(x.id)?.netMult != null);
            switchBtn.interactable = can && b.me.mons.Count(x => x.hp > 0) > (b.needSwitch ? 0 : 1);
            autoBtn.interactable = can; fleeBtn.interactable = can && !b.needSwitch;
            quickBtn.gameObject.SetActive(can && Rules.Battle.CanQuickResolve(b));
        }

        void Fill(Side s, Mon m)
        {
            s.art.sprite = PetArt(m);
            s.name.text = $"{m.name}  <size=28>Lv.{m.level}</size>";
            s.element.color = WildPet.ElementColor(m.element);
            s.elementText.text = m.element ?? "";
            SetBar(s.hp, m.hp / (float)m.maxHp, $"{m.hp}/{m.maxHp}");
        }

        // ---------- actions ----------
        void UseSkill(int i) { var m = Rules.Battle.Active(b, "me"); if (i < m.skills.Count) Do(BattleAction.Skill(m.skills[i])); }

        void Do(BattleAction a)
        {
            if (playing || b.over != null) return;
            if (sub) Destroy(sub.gameObject);
            var r = Rules.Battle.ResolveTurn(b, a);
            if (!r.ok) { log.text = r.reason switch { "no-uses" => "这个技能用完了", "must-switch" => "先换上一只伙伴", "no-net" => "没有捕宠网了", "fainted" => "倒下的宠物不能捕捉", _ => "现在不能这样做" }; return; }
            StartCoroutine(Play(r.events));
        }

        void QuickResolve()
        {
            if (playing) return;
            Rules.Battle.QuickResolve(b);
            Refresh();
            StartCoroutine(Play(new List<BattleEvent> { new BattleEvent { t = "end", result = b.over } }));
        }

        void OpenSub(string kind)
        {
            if (sub) Destroy(sub.gameObject);
            if (playing) return;
            sub = Panel(transform, "sub", Cream, null, true, true).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-28, 420), new Vector2(860, 420));
            var title = Label(sub, kind == "snack" ? "喂零食（喜欢的食物：捕捉率 ×1.5）" : kind == "net" ? "扔网" : "换上哪只伙伴？", FsBody, WoodDark, true); title.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -14), new Vector2(800, 50));
            var close = Button(sub, "×", WoodDark, Cream, 44, () => Destroy(sub.gameObject), Circle); ((RectTransform)close.transform).Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-10, -10), new Vector2(TouchMin, TouchMin));
            var grid = Rect("grid", sub).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(24, -76), new Vector2(812, 330));
            var gl = grid.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(196, 150); gl.spacing = new Vector2(12, 12); gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 4;
            if (kind == "switch")
            {
                for (int i = 0; i < b.me.mons.Count; i++)
                {
                    var m = b.me.mons[i]; int idx = i;
                    var cell = Button(grid, $"{m.name}\n<size=26>{m.hp}/{m.maxHp}</size>", m.hp > 0 && i != b.me.active ? CreamDark : new Color(0.8f, 0.78f, 0.74f), WoodDark, FsSub, () => Do(BattleAction.Switch(idx)));
                    cell.interactable = m.hp > 0 && (i != b.me.active || b.needSwitch);
                }
                return;
            }
            var foeMon = Rules.Battle.Active(b, "foe");
            foreach (var st in b.inventory.Where(x => kind == "snack" ? GameData.Item(x.id)?.food != null : GameData.Item(x.id)?.netMult != null).ToList())
            {
                var id = st.id;
                string extra = kind == "net" ? $"成功率 {Mathf.RoundToInt((float)Rules.Battle.CatchChance(b, id) * 100)}%" : PetMath.BaitMultiplier(foeMon.species, id) == 1.5 ? "最爱吃！" : "×1.2";
                var cell = Button(grid, $"{GameData.Item(id).name} ×{st.count}\n<size=26>{extra}</size>", CreamDark, WoodDark, FsMin, () => Do(kind == "snack" ? BattleAction.Snack(id) : BattleAction.Catch(id)));
                var icon = Rect("icon", cell.transform).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -6), new Vector2(64, 64)).gameObject.AddComponent<Image>();
                icon.sprite = Icon(id); icon.preserveAspect = true; icon.raycastTarget = false;
                cell.GetComponentInChildren<TextMeshProUGUI>().margin = new Vector4(4, 62, 4, 4);
            }
        }

        // ---------- playing the events back ----------
        IEnumerator Play(List<BattleEvent> events)
        {
            playing = true;
            Refresh();
            foreach (var e in events)
            {
                string text = Describe(e);
                if (text != null) log.text = text;
                PlaySound(e);
                if (e.t == "damage") { var side = e.side == "me" ? me : foe; SetBar(side.hp, e.hp / (float)e.maxHp, $"{e.hp}/{e.maxHp}"); StartCoroutine(Shake(side.portrait)); }
                if (e.t == "heal") { var side = e.side == "me" ? me : foe; SetBar(side.hp, e.hp / (float)e.maxHp, $"{e.hp}/{e.maxHp}"); }
                if (e.t == "send") { Fill(e.side == "me" ? me : foe, Rules.Battle.Active(b, e.side)); }
                if (e.t == "faint") StartCoroutine(Faint(e.side == "me" ? me : foe));
                if (e.t == "caught") StartCoroutine(Faint(foe));
                if (text != null || e.t == "damage") yield return new WaitForSecondsRealtime(e.t == "end" ? 0.4f : 0.75f);
            }
            playing = false;
            Fill(me, Rules.Battle.Active(b, "me")); Fill(foe, Rules.Battle.Active(b, "foe"));
            me.portrait.localScale = new Vector3(1, 1, 1); foe.portrait.localScale = new Vector3(-1, 1, 1);
            Refresh();
            if (b.over != null) ShowResult();
            else if (b.needSwitch) OpenSub("switch");
        }

        static void PlaySound(BattleEvent e)
        {
            string n = e.t switch
            {
                "use" => "swish", "damage" => e.eff == "super" ? "hit_super" : e.eff == "weak" ? "hit_weak" : "hit", "heal" => "heal",
                "stat" => e.up ? "buff" : "debuff", "faint" => "faint", "throw" => "throw", "escape" => "escape", "caught" => "catch",
                "send" => "send", "snack" => "eat", "flee" => "flee", _ => null,
            };
            if (n != null) GameAudio.Play(n);
        }

        string Describe(BattleEvent e)
        {
            string Who(string side) => side == "me" ? "" : "野生的";
            return e.t switch
            {
                "use" => $"{Who(e.side)}{e.name}使用了{e.skillName}！",
                "damage" => e.eff == "super" ? "效果拔群！" : e.eff == "weak" ? "效果不太好……" : null,
                "bond" => $"{e.name}为了你咬牙坚持住了！",
                "heal" => $"恢复了 {e.amount} 点体力",
                "stat" => $"{e.name}的{(e.stat == "atk" ? "攻击" : e.stat == "def" ? "防御" : "速度")}{(e.up ? "提高了" : "降低了")}",
                "faint" => $"{Who(e.side)}{e.name}倒下了",
                "exp" => $"{e.name}得到 {e.amount} 点经验",
                "send" => e.side == "me" ? $"上吧，{e.name}！" : $"野生的{e.name}上场了",
                "snack" => e.favourite ? $"{e.name}很喜欢{e.itemName}！（捕捉率 ×1.5）" : $"{e.name}吃了{e.itemName}",
                "throw" => $"扔出了{e.itemName}……（成功率 {Mathf.RoundToInt((float)e.rate * 100)}%）",
                "escape" => $"{e.name}挣脱了网！",
                "caught" => $"抓到了{e.name}！",
                "surprised" => $"{e.name}吓了一跳，没能行动",
                "flee" => "溜走了",
                "need-switch" => "换上一只伙伴吧",
                _ => null,
            };
        }

        IEnumerator Shake(RectTransform r)
        {
            var basePos = Vector2.zero;
            for (float t = 0; t < 0.3f; t += Time.unscaledDeltaTime) { r.anchoredPosition = basePos + new Vector2(Mathf.Sin(t * 70) * 14, 0); yield return null; }
            r.anchoredPosition = basePos;
        }

        IEnumerator Faint(Side s)
        {
            var sc = s.portrait.localScale;
            for (float t = 0; t < 0.4f; t += Time.unscaledDeltaTime) { s.portrait.localScale = new Vector3(sc.x * (1 - t * 2), sc.y * (1 - t * 2), 1); yield return null; }
            s.portrait.localScale = Vector3.zero;
        }

        void ShowResult()
        {
            actions.gameObject.SetActive(false);
            quickBtn.gameObject.SetActive(false);
            var over = b.over;
            var summary = session.FinishBattle();
            GameAudio.Play(over == "win" || over == "caught" ? "win" : over == "lose" ? "lose" : "flee");
            if (summary.levelUps.Count > 0) GameAudio.Play("levelup", 0.8f);
            result = Panel(transform, "result", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(860, 560));
            var head = Panel(result, "head", over == "lose" ? WoodMid : Grass, null, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(0, -8), new Vector2(420, 84));
            var ht = Label(head, over switch { "win" => "胜利！", "caught" => "抓到啦！", "flee" => "溜走了", _ => "伙伴们累倒了" }, 40, Color.white, true); ht.rectTransform.Fill();
            var lines = new List<string>();
            if (summary.firstWin) lines.Add("<color=#c99a1e>今天第一场胜利：经验 ×2！</color>");
            foreach (var (name, amount) in summary.exp) lines.Add($"{name} 经验 +{amount}");
            foreach (var (name, level) in summary.levelUps) lines.Add($"{name} 升到了 Lv.{level}！");
            if (summary.clover > 0) lines.Add($"四叶草 +{summary.clover}");
            if (summary.caught != null) lines.Add(summary.caught.joined ? $"{summary.caught.name} 加入了队伍（好感 {summary.caught.affection}）" : $"{summary.caught.name} 去家园等你了");
            if (over == "lose") lines.Add("野生宠物跑开了。回家让伙伴们休息一下吧");
            var body = Label(result, string.Join("\n", lines), 32, Ink, false, TextAlignmentOptions.Top); body.rectTransform.Fill(); body.rectTransform.offsetMin = new Vector2(40, 130); body.rectTransform.offsetMax = new Vector2(-40, -90);
            var ok = Button(result, "继续", Yellow, WoodDark, 36, () => { gameObject.SetActive(false); Closed?.Invoke(); });
            ((RectTransform)ok.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 30), new Vector2(300, 92));
        }
    }
}
