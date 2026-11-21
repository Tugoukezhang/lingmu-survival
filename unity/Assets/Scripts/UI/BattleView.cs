// The battle screen (web scenes/BattleScene.js, new layout): your pet bottom left, the wild pet top right, HP bars,
// the message line, four skill buttons, and 零食 / 扔网 / 换伙伴 / 自动 / 一键结算 / 溜走. Turn events from the rules are
// played back one by one. When the battle is over the one commit happens (GameSession.FinishBattle) and the result shows.
// Look (docs/19 对战): a painted backdrop (Resources/UI/Battle), info cards with element badges, skill cards that say
// whether a move hits hard or soft, floating damage numbers, a lunge and a hit flash, a result card with growing exp bars.
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
        class Side { public RectTransform root, portrait, card; public Image art, badge; public TextMeshProUGUI name; public Bar hp; public bool foe; }

        GameSession session;
        BattleState b;
        Side me, foe;
        Image backdrop;
        TextMeshProUGUI log;
        RectTransform actions, sub, result;
        readonly List<Button> skillButtons = new List<Button>();
        readonly List<Image> skillBadges = new List<Image>();
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
            var art = Resources.Load<Sprite>("UI/Battle/battle_bg");
            if (art)
            {
                // the painted clearing: two light patches where the pets stand (lower left, right middle)
                var bg = Rect("backdrop", root); bg.anchorMin = bg.anchorMax = new Vector2(0.5f, 0.5f); bg.pivot = new Vector2(0.5f, 0.5f);
                backdrop = bg.gameObject.AddComponent<Image>(); backdrop.sprite = art;
                var fit = bg.gameObject.AddComponent<AspectRatioFitter>(); fit.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent; fit.aspectRatio = art.rect.width / art.rect.height;
            }
            else
            {
                var sky = root.gameObject.AddComponent<Image>(); sky.color = Hex("cfe8f3");
                var hill = Panel(root, "hill", Hex("a9d67e"), FlatCircle, false).rectTransform; hill.anchorMin = new Vector2(-0.3f, -0.9f); hill.anchorMax = new Vector2(1.3f, 0.42f); hill.offsetMin = hill.offsetMax = Vector2.zero;
                var hill2 = Panel(root, "hill2", Hex("bfe39a"), FlatCircle, false).rectTransform; hill2.anchorMin = new Vector2(0.35f, 0.25f); hill2.anchorMax = new Vector2(1.25f, 0.72f); hill2.offsetMin = hill2.offsetMax = Vector2.zero;
            }
            foe = MakeSide(root, new Vector2(0.75f, 0.62f), 340, true);
            me = MakeSide(root, new Vector2(0.25f, 0.39f), 420, false);
            var logBox = Panel(root, "log", Cream, null, false, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -26), new Vector2(1100, 90));
            log = Label(logBox, "", 32, Ink, true); log.rectTransform.Fill(12);

            actions = Panel(root, "actions", Cream, null, true, true).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-28, 24), new Vector2(860, 380));
            for (int i = 0; i < 4; i++)
            {
                int k = i;
                var btn = Button(actions, "", Yellow, WoodDark, FsBody, () => UseSkill(k));
                ((RectTransform)btn.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(24 + (i % 2) * 412, -22 - (i / 2) * 124), new Vector2(400, 112));
                var lbl = btn.GetComponentInChildren<TextMeshProUGUI>(); lbl.alignment = TextAlignmentOptions.Left; lbl.margin = new Vector4(78, 0, 10, 0); lbl.richText = true;
                var badge = KitImage(btn.transform, "el_normal", 52); badge.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(16, 4), new Vector2(52, 52));
                skillButtons.Add(btn); skillBadges.Add(badge);
            }
            float bw = 156, gap = 10, y = 24;
            Button Small(string t, string icon, Color bg, int i, Action a)
            {
                var x = Button(actions, t, bg, WoodDark, FsSub, a);
                ((RectTransform)x.transform).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(24 + i * (bw + gap), y), new Vector2(bw, TouchMin));
                var sp = icon.StartsWith("item_") ? Icon(icon) : Kit(icon);
                if (sp)
                {
                    var img = Rect("icon", x.transform).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(12, 4), new Vector2(42, 42)).gameObject.AddComponent<Image>();
                    img.sprite = sp; img.preserveAspect = true; img.raycastTarget = false;
                    x.GetComponentInChildren<TextMeshProUGUI>().rectTransform.offsetMin = new Vector2(52, 10);
                }
                return x;
            }
            snackBtn = Small("零食", "item_berry", Cream, 0, () => OpenSub("snack"));
            netBtn = Small("扔网", "act_net", Cream, 1, () => OpenSub("net"));
            switchBtn = Small("换伙伴", "hud_pets", Cream, 2, () => OpenSub("switch"));
            autoBtn = Small("自动", "sparkle", Grass, 3, () => Do(Rules.Battle.AutoAction(b)));
            fleeBtn = Small("溜走", "btn_back", Cream, 4, () => Do(BattleAction.Flee()));
            quickBtn = Button(root, "一键结算", Grass, Color.white, FsBody, QuickResolve);
            ((RectTransform)quickBtn.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-28, 420), new Vector2(250, TouchMin));
        }

        Side MakeSide(RectTransform root, Vector2 anchor, float size, bool isFoe)
        {
            var s = new Side { foe = isFoe };
            s.root = Rect(isFoe ? "foe" : "me", root).Place(anchor, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
            Panel(s.root, "shadow", new Color(0.25f, 0.33f, 0.12f, 0.28f), FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, 20), new Vector2(size * 0.7f, size * 0.16f));
            s.portrait = Rect("portrait", s.root).Fill();
            s.art = s.portrait.gameObject.AddComponent<Image>(); s.art.preserveAspect = true; s.art.raycastTarget = false;
            if (isFoe) s.portrait.localScale = new Vector3(-1, 1, 1);   // face each other
            s.card = Panel(root, "card", Cream, null, false, true).rectTransform;
            s.card.Place(anchor, new Vector2(0.5f, 0.5f), isFoe ? new Vector2(-480, 110) : new Vector2(0, -290), new Vector2(440, 136));
            s.badge = KitImage(s.card, "el_normal", 48); s.badge.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -12), new Vector2(48, 48));
            s.name = Label(s.card, "", 32, WoodDark, true, TextAlignmentOptions.Left); s.name.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(74, -10), new Vector2(350, 52));
            KitImage(s.card, "heart", 32).rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(18, 20), new Vector2(32, 32));
            s.hp = MakeBar(s.card, "hp", Grass); s.hp.root.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(58, 18), new Vector2(362, 36));
            s.hp.value.color = WoodDark; s.hp.value.outlineWidth = 0;
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
            int clock = g.S.clock;
            if (backdrop) backdrop.color = clock >= 19 * 60 || clock < 6 * 60 ? Hex("a3b2d8") : clock >= 17 * 60 ? Hex("ffe2c4") : Color.white;   // evening glow, night blue
            var f = Rules.Battle.Active(b, "foe");
            log.text = b.ambush ? $"你悄悄靠近了野生的{f.name}！它这回合来不及行动，点一个技能出招" : $"野生的{f.name}（Lv.{f.level}）出现了！点一个技能出招";
            Refresh();
            StartCoroutine(Enter(me, -520)); StartCoroutine(Enter(foe, 520));
            UiMotion.PopIn(actions);
        }

        void Refresh()
        {
            Fill(me, Rules.Battle.Active(b, "me"));
            Fill(foe, Rules.Battle.Active(b, "foe"));
            var m = Rules.Battle.Active(b, "me");
            var target = Rules.Battle.Active(b, "foe");
            for (int i = 0; i < 4; i++)
            {
                var btn = skillButtons[i];
                if (i >= m.skills.Count) { btn.gameObject.SetActive(false); continue; }
                btn.gameObject.SetActive(true);
                var s = GameData.Skill(m.skills[i]);
                int uses = m.uses[m.skills[i]];
                string useText = uses == int.MaxValue ? "" : $"  <size=26>{uses}/{s.uses}</size>";
                double mult = s.power > 0 ? Elements.Multiplier(s.element, target.element) : 1;
                string hint = mult > 1 ? "　<color=#3d7a28>效果拔群</color>" : mult < 1 ? "　<color=#a8503c>效果不好</color>" : "";
                string power = s.power > 0 ? $"<size=26>威力 {s.power}{hint}</size>" : "<size=26>状态技能</size>";
                btn.SetLabel($"{s.name}{useText}\n{power}");
                bool plain = string.IsNullOrEmpty(s.element) || s.element == Elements.Normal;   // a plain move is cream, never the grey of a disabled button
                btn.GetComponent<Image>().color = plain ? Hex("fff5e3") : Color.Lerp(ElementColor(s.element), Color.white, 0.55f);
                skillBadges[i].sprite = Kit(ElementBadge(s.element)); skillBadges[i].enabled = skillBadges[i].sprite;
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
            s.badge.sprite = Kit(ElementBadge(m.element)); s.badge.enabled = s.badge.sprite;
            SetHp(s, m.hp, m.maxHp);
        }

        // green above half, orange above a fifth, red below
        static void SetHp(Side s, int hp, int max)
        {
            float f = hp / (float)Mathf.Max(1, max);
            SetBar(s.hp, f, $"{hp}/{max}");
            s.hp.fill.color = f > 0.5f ? Grass : f > 0.2f ? Orange : Red;
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
            UiMotion.PopIn(sub);
            var title = Label(sub, kind == "snack" ? "喂零食（喜欢的食物：捕捉率 ×1.5）" : kind == "net" ? "扔网" : "换上哪只伙伴？", FsBody, WoodDark, true); title.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -14), new Vector2(800, 50));
            var close = CloseButton(sub, () => Destroy(sub.gameObject), TouchMin); ((RectTransform)close.transform).Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-10, -10), new Vector2(TouchMin, TouchMin));
            var grid = Rect("grid", sub).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(24, -76), new Vector2(812, 330));
            var gl = grid.gameObject.AddComponent<GridLayoutGroup>(); gl.cellSize = new Vector2(196, 150); gl.spacing = new Vector2(12, 12); gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 4;
            if (kind == "switch")
            {
                for (int i = 0; i < b.me.mons.Count; i++)
                {
                    var m = b.me.mons[i]; int idx = i;
                    bool ok = m.hp > 0 && (i != b.me.active || b.needSwitch);
                    var cell = Button(grid, $"{m.name}\n<size=26>{m.hp}/{m.maxHp}</size>", ok ? Cream : CreamDark, WoodDark, FsMin, () => Do(BattleAction.Switch(idx)));
                    var art = Rect("art", cell.transform).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -6), new Vector2(72, 72)).gameObject.AddComponent<Image>();
                    art.sprite = PetArt(m); art.preserveAspect = true; art.raycastTarget = false;
                    if (m.hp <= 0) art.color = new Color(1, 1, 1, 0.4f);
                    cell.GetComponentInChildren<TextMeshProUGUI>().margin = new Vector4(4, 70, 4, 4);
                    cell.interactable = ok;
                }
                return;
            }
            var foeMon = Rules.Battle.Active(b, "foe");
            foreach (var st in b.inventory.Where(x => kind == "snack" ? GameData.Item(x.id)?.food != null : GameData.Item(x.id)?.netMult != null).ToList())
            {
                var id = st.id;
                string extra = kind == "net" ? $"成功率 {Mathf.RoundToInt((float)Rules.Battle.CatchChance(b, id) * 100)}%" : PetMath.BaitMultiplier(foeMon.species, id) == 1.5 ? "<color=#3d7a28>最爱吃！</color>" : "×1.2";
                var cell = Button(grid, $"{GameData.Item(id).name} ×{st.count}\n<size=26>{extra}</size>", Cream, WoodDark, FsMin, () => Do(kind == "snack" ? BattleAction.Snack(id) : BattleAction.Catch(id)));
                var icon = Rect("icon", cell.transform).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -6), new Vector2(64, 64)).gameObject.AddComponent<Image>();
                icon.sprite = Icon(id); icon.preserveAspect = true; icon.raycastTarget = false;
                var lbl = cell.GetComponentInChildren<TextMeshProUGUI>(); lbl.margin = new Vector4(4, 62, 4, 4); lbl.richText = true;
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
                if (e.t == "use") StartCoroutine(Lunge(e.side == "me" ? me : foe));
                if (e.t == "damage")
                {
                    var side = e.side == "me" ? me : foe;
                    SetHp(side, e.hp, e.maxHp);
                    StartCoroutine(Shake(side));
                    StartCoroutine(Popup(side, e.eff == "super" ? $"-{e.amount}!" : $"-{e.amount}", e.eff == "super" ? Yellow : e.eff == "weak" ? Hex("e9dfcc") : Color.white, e.eff == "super" ? 68 : e.eff == "weak" ? 40 : 54));
                }
                if (e.t == "heal") { var side = e.side == "me" ? me : foe; SetHp(side, e.hp, e.maxHp); StartCoroutine(Popup(side, $"+{e.amount}", Hex("b8e08e"), 50)); }
                if (e.t == "send") { var side = e.side == "me" ? me : foe; Fill(side, Rules.Battle.Active(b, e.side)); side.portrait.localScale = new Vector3(side.foe ? -1 : 1, 1, 1); StartCoroutine(Enter(side, side.foe ? 420 : -420)); }
                if (e.t == "faint") StartCoroutine(Faint(e.side == "me" ? me : foe));
                if (e.t == "caught") StartCoroutine(Faint(foe));
                if (text != null || e.t == "damage") yield return new WaitForSecondsRealtime(e.t == "end" ? 0.4f : 0.75f);
            }
            playing = false;
            Fill(me, Rules.Battle.Active(b, "me")); Fill(foe, Rules.Battle.Active(b, "foe"));
            me.portrait.localScale = new Vector3(1, 1, 1); foe.portrait.localScale = new Vector3(-1, 1, 1);
            me.portrait.anchoredPosition = foe.portrait.anchoredPosition = Vector2.zero;
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

        // a pet slides in from the side when the battle starts or it is sent out
        IEnumerator Enter(Side s, float from)
        {
            for (float t = 0; t < 0.35f; t += Time.unscaledDeltaTime)
            {
                float k = 1 - Mathf.Pow(1 - t / 0.35f, 3);
                s.portrait.anchoredPosition = new Vector2(Mathf.Lerp(from, 0, k), 0);
                yield return null;
            }
            s.portrait.anchoredPosition = Vector2.zero;
        }

        // the attacker leans toward the other side and back
        IEnumerator Lunge(Side s)
        {
            var dir = s.foe ? new Vector2(-60, -24) : new Vector2(60, 24);
            for (float t = 0; t < 0.26f; t += Time.unscaledDeltaTime) { s.portrait.anchoredPosition = dir * Mathf.Sin(t / 0.26f * Mathf.PI); yield return null; }
            s.portrait.anchoredPosition = Vector2.zero;
        }

        // shake, with a short warm flash on the hit pet
        IEnumerator Shake(Side s)
        {
            var r = s.portrait;
            for (float t = 0; t < 0.3f; t += Time.unscaledDeltaTime)
            {
                r.anchoredPosition = new Vector2(Mathf.Sin(t * 70) * 14, 0);
                s.art.color = t < 0.14f ? new Color(1, 0.62f, 0.55f) : Color.white;
                yield return null;
            }
            r.anchoredPosition = Vector2.zero; s.art.color = Color.white;
        }

        // a number floats up from the pet and fades (damage, healing)
        IEnumerator Popup(Side s, string text, Color color, float size)
        {
            var t = Label(transform, text, size, color, true);
            t.outlineWidth = 0.3f; t.outlineColor = new Color32(90, 63, 50, 255); t.textWrappingMode = TextWrappingModes.NoWrap;
            var r = t.rectTransform; r.anchorMin = r.anchorMax = s.root.anchorMin; r.pivot = new Vector2(0.5f, 0.5f); r.sizeDelta = new Vector2(320, 100);
            var start = new Vector2(s.foe ? -40 : 40, s.root.sizeDelta.y * 0.32f);
            for (float k = 0; k < 0.9f; k += Time.unscaledDeltaTime)
            {
                r.anchoredPosition = start + new Vector2(0, 80 * k);
                r.localScale = Vector3.one * (k < 0.12f ? Mathf.Lerp(1.35f, 1, k / 0.12f) : 1);
                t.alpha = 1 - Mathf.Clamp01((k - 0.5f) / 0.4f);
                yield return null;
            }
            Destroy(t.gameObject);
        }

        IEnumerator Faint(Side s)
        {
            var sc = s.portrait.localScale;
            for (float t = 0; t < 0.4f; t += Time.unscaledDeltaTime) { s.portrait.localScale = new Vector3(sc.x * (1 - t * 2), sc.y * (1 - t * 2), 1); yield return null; }
            s.portrait.localScale = Vector3.zero;
        }

        IEnumerator GrowBar(Bar bar, float from, float to, string text, float delay)
        {
            SetBar(bar, from, text);
            for (float t = -delay; t < 0.8f; t += Time.unscaledDeltaTime) { SetBar(bar, Mathf.Lerp(from, to, Mathf.Clamp01(t / 0.8f)), text); yield return null; }
            SetBar(bar, to, text);
        }

        // ---------- the result card: who got how much exp (bars grow), level-ups, clover, the caught pet ----------
        void ShowResult()
        {
            actions.gameObject.SetActive(false);
            quickBtn.gameObject.SetActive(false);
            var over = b.over;
            var summary = session.FinishBattle();
            GameAudio.Play(over == "win" || over == "caught" ? "win" : over == "lose" ? "lose" : "flee");
            if (summary.levelUps.Count > 0) GameAudio.Play("levelup", 0.8f);
            var s = session.S;
            int rows = summary.exp.Count + (summary.clover > 0 ? 1 : 0) + (summary.caught != null ? 1 : 0) + (over == "lose" ? 1 : 0) + (summary.firstWin ? 1 : 0);
            float h = Mathf.Max(460, 250 + rows * 92);
            result = Panel(transform, "result", Cream, null, true, true).rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900, h));
            UiMotion.PopIn(result);
            GameUI.Decorate(result);
            bool good = over == "win" || over == "caught";
            var head = Panel(result, "head", good ? Yellow : over == "lose" ? Hex("cdb894") : Sky, null, false, true).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(0, -6), new Vector2(440, 84));
            var ht = Label(head, over switch { "win" => "胜利！", "caught" => "抓到啦！", "flee" => "溜走了", _ => "伙伴们累倒了" }, 40, WoodDark, true); ht.rectTransform.Fill();
            if (good)
                for (int i = 0; i < 2; i++)
                {
                    var sp = KitImage(result, "sparkle", 56); sp.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 0.5f), new Vector2(i == 0 ? -270 : 270, -4), new Vector2(56, 56));
                    UiMotion.Bob(sp, 7, 1.1f, i * 0.5f);
                }
            float y = -76;
            RectTransform Row(float height = 84) { var r = Rect("row", result).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(780, height)); y -= height + 8; return r; }
            if (summary.firstWin)
            {
                var r = Row(56);
                Chip(r, "今天第一场胜利：经验 ×2！", Picked, 440, 52).Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(440, 52));
            }
            int k = 0;
            foreach (var (name, amount) in summary.exp)
            {
                var r = Row();
                var pet = s.pets.FirstOrDefault(p => PetMath.DisplayName(p) == name);
                if (pet != null)
                {
                    var art = Rect("art", r).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(0, 0), new Vector2(80, 80)).gameObject.AddComponent<Image>();
                    art.sprite = Resources.Load<Sprite>("Icons/Pets/pet_" + pet.species + (pet.evolved ? "_evo" : "")) ?? Resources.Load<Sprite>("Icons/Pets/pet_" + pet.species); art.preserveAspect = true; art.raycastTarget = false;
                }
                var n = Label(r, $"{name}  <size=26>经验 +{amount}</size>", FsSub, WoodDark, true, TextAlignmentOptions.Left); n.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(96, 2), new Vector2(460, 42));
                var up = summary.levelUps.FirstOrDefault(x => x.name == name);
                if (up.name != null) { var c = Chip(r, $"升级！Lv.{up.level}", Yellow, 170, 44); c.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(0, 0), new Vector2(170, 44)); UiMotion.Pulse(c, 0.06f); }
                var bar = MakeBar(r, "exp", Sky); bar.root.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(96, 4), new Vector2(684, 30));
                if (pet != null)
                {
                    int next = PetMath.ExpToNext(pet.level);
                    bool maxed = pet.level >= PetMath.MaxLevel;
                    float to = maxed ? 1 : pet.exp / (float)next, from = up.name != null || maxed ? 0 : Mathf.Max(0, pet.exp - amount) / (float)next;
                    StartCoroutine(GrowBar(bar, from, to, maxed ? "满级" : $"{pet.exp}/{next}", 0.25f + k * 0.2f));
                }
                k++;
            }
            if (summary.clover > 0)
            {
                var r = Row(56);
                Clover(r, 48).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(16, 0), new Vector2(48, 48));
                Label(r, $"四叶草 +{summary.clover}", FsBody, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(96, 0), new Vector2(500, 50));
            }
            if (summary.caught != null)
            {
                var r = Row(96);
                var caught = s.pets.LastOrDefault(p => PetMath.DisplayName(p) == summary.caught.name);
                if (caught != null) { var art = Rect("art", r).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(96, 96)).gameObject.AddComponent<Image>(); art.sprite = Resources.Load<Sprite>("Icons/Pets/pet_" + caught.species); art.preserveAspect = true; art.raycastTarget = false; UiMotion.Bob(art, 5, 1); }
                Label(r, summary.caught.joined ? $"{summary.caught.name} 加入了队伍（好感 {summary.caught.affection}）" : $"{summary.caught.name} 去家园等你了", FsSub, WoodDark, true, TextAlignmentOptions.Left).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(110, 0), new Vector2(670, 50));
            }
            if (over == "lose")
            {
                var r = Row(56);
                Label(r, "野生宠物跑开了。回家让伙伴们休息一下吧", FsSub, Ink, false).rectTransform.Fill();
            }
            var ok = Button(result, "继续", Yellow, WoodDark, 36, () => { gameObject.SetActive(false); Closed?.Invoke(); });
            ((RectTransform)ok.transform).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 30), new Vector2(300, 92));
        }
    }
}
