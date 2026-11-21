// 风铃小镇 residents as a "航行便笺" (docs/19 居民对话; idea from docs/参考资料/拆解/负责人参考2_资源包与视频.md):
// a big portrait on the left, a cream note along the bottom with a honey name plate (paw mark), hearts and the line
// typed out (tap the note to show it all), and 送礼 / 任务 / 杂货铺 / 再见 down the right. 送礼 opens a slot grid with
// 最爱 / 喜欢 badges; 任务 opens quest cards (what is needed with have / need, the reward, one button).
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
    public partial class GameUI
    {
        string typedFor, selectedGift, subFor;

        // a full-screen layer for panels that are not one box (the residents)
        RectTransform NewScreen()
        {
            if (box) Destroy(box.gameObject);
            box = Rect("screen", modal).Fill();
            dim.color = new Color(0.08f, 0.05f, 0.03f, 0.3f);   // the town stays visible behind a resident
            return box;
        }

        void FillNpc(string npc)
        {
            var s = session.S; var n = GameData.Npcs[npc];
            bool first = poppedFor != openPanel; poppedFor = openPanel;
            var scr = NewScreen();

            // the portrait, breathing a little
            var art = Rect("portrait", scr).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 0), new Vector2(620, 860)).gameObject.AddComponent<Image>();
            art.sprite = Resources.Load<Sprite>("Icons/Npcs/npc_" + npc); art.preserveAspect = true; art.raycastTarget = false;
            UiMotion.Bob(art, 5, 0.35f);

            // the note
            var note = Panel(scr, "note", Cream, null, true, true).rectTransform;
            note.anchorMin = new Vector2(0, 0); note.anchorMax = new Vector2(1, 0); note.pivot = new Vector2(0.5f, 0);
            note.offsetMin = new Vector2(560, 36); note.offsetMax = new Vector2(-40, 286);
            if (first) UiMotion.PopIn(note);
            var plate = Panel(note, "name", Yellow, null, false, true).rectTransform;
            var nm = Label(plate, n.name, FsTitle, WoodDark, true, TextAlignmentOptions.Left); nm.rectTransform.Fill(); nm.rectTransform.offsetMin = new Vector2(76, 4);
            float plateW = 104 + nm.GetPreferredValues(n.name).x;
            plate.Place(new Vector2(0, 1), new Vector2(0, 0.5f), new Vector2(40, 0), new Vector2(plateW, 76));
            KitImage(plate, "hud_pets", 48).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(18, 2), new Vector2(48, 48));
            var role = Label(note, n.role, FsSub, Hex("8a7458"), false, TextAlignmentOptions.Left); role.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 0.5f), new Vector2(60 + plateW, -30), new Vector2(360, 44));
            int f = Town.FriendOf(s, npc), h = Town.Hearts(f);
            var hearts = Rect("hearts", note).Place(new Vector2(1, 1), new Vector2(1, 0.5f), new Vector2(-36, -32), new Vector2(5 * 42, 40));
            for (int i = 0; i < 5; i++) { var hi = KitImage(hearts, "heart", 38); hi.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(i * 42, 0), new Vector2(38, 38)); if (i >= h) hi.color = new Color(1, 1, 1, 0.28f); }
            var fv = Label(note, $"好感 {f}/100", FsMin, Hex("8a7458"), false, TextAlignmentOptions.Right); fv.rectTransform.Place(new Vector2(1, 1), new Vector2(1, 0.5f), new Vector2(-260, -32), new Vector2(200, 40));
            string line = talkNpc == npc ? talkLine : "";
            var t = Label(note, "「" + line + "」", FsBody + 2, Ink, false, TextAlignmentOptions.TopLeft);
            t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(56, 30); t.rectTransform.offsetMax = new Vector2(-56, -66);
            if (typedFor != line) { typedFor = line; StartCoroutine(TypeOut(t)); }
            var tap = note.gameObject.AddComponent<Button>(); tap.transition = Selectable.Transition.None; tap.onClick.AddListener(() => { if (t) t.maxVisibleCharacters = 99999; });

            // what you can do, down the right side (bottom up: 再见 last)
            bool questReady = Town.Offers(s, npc).Any() || Town.ActiveOf(s, npc).Any(q => Town.Missing(s, q.id).Count == 0);
            var acts = new List<(string key, string label, string icon, bool dot)>
            {
                ("gift", $"送礼（剩 {Town.GiftsLeft(s, npc)} 次）", "heart", false),
                ("quest", "委托", "quest_mark", questReady),
            };
            if (n.shop) acts.Add(("shop", "杂货铺", "hud_shop", false));
            acts.Add(("bye", "再见", "btn_back", false));
            for (int i = 0; i < acts.Count; i++)
            {
                var (key, label, icon, dot) = acts[i];
                var bt = IconPill(scr, label, Kit(icon), Picked, npcTab == key, () =>
                {
                    if (key == "bye") { Close(); return; }
                    if (key == "shop") { Open("shop"); return; }
                    npcTab = npcTab == key ? "talk" : key; selectedGift = null; Fill(openPanel);
                }, 340);
                ((RectTransform)bt.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-40, 316 + (acts.Count - 1 - i) * 102), new Vector2(340, TouchMin));
                if (dot) { var d = Panel(bt.transform, "dot", Red, Circle, false).rectTransform.Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-14, -12), new Vector2(26, 26)); UiMotion.Pulse(d, 0.12f); }
            }

            if (npcTab == "gift") GiftBox(scr, s, npc, n);
            else if (npcTab == "quest") QuestBox(scr, s, npc, n);
            subFor = npcTab;
        }

        IEnumerator TypeOut(TextMeshProUGUI t)
        {
            t.maxVisibleCharacters = 0;
            t.ForceMeshUpdate();
            int total = t.textInfo.characterCount;
            for (float k = 0; t && t.maxVisibleCharacters < total; k += Time.unscaledDeltaTime)
            {
                t.maxVisibleCharacters = Mathf.Max(t.maxVisibleCharacters, Mathf.FloorToInt(k * 30));
                yield return null;
            }
        }

        RectTransform SubBox(RectTransform scr, string title)
        {
            var bx = Panel(scr, "sub", Cream, null, true, true).rectTransform.Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-400, 316), new Vector2(900, 660));
            if (subFor != npcTab) UiMotion.PopIn(bx);
            var t = Label(bx, title, FsBody + 2, WoodDark, true, TextAlignmentOptions.Left); t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(30, -18), new Vector2(720, 54));
            ((RectTransform)CloseButton(bx, () => { npcTab = "talk"; Fill(openPanel); }, 88).transform).Place(new Vector2(1, 1), new Vector2(0.5f, 0.5f), new Vector2(-14, -14), new Vector2(88, 88));
            return bx;
        }

        // ---------- 送礼 ----------
        void GiftBox(RectTransform scr, GameState s, string npc, NpcDef n)
        {
            var bx = SubBox(scr, $"送{n.name}一件礼物");
            // what they like, as icons
            float x = 30;
            void Likes(string word, Color c, IEnumerable<string> ids)
            {
                Chip(bx, word, c, 96, 42).Place(new Vector2(0, 1), new Vector2(0, 0.5f), new Vector2(x, -104), new Vector2(96, 42)); x += 106;
                foreach (var id in ids) { var ic = Rect("like", bx).Place(new Vector2(0, 1), new Vector2(0, 0.5f), new Vector2(x, -104), new Vector2(54, 54)).gameObject.AddComponent<Image>(); ic.sprite = Icon(id); ic.preserveAspect = true; ic.raycastTarget = false; x += 60; }
                x += 24;
            }
            Likes("最爱", Hex("f08aa0"), n.loves); Likes("喜欢", Picked, n.likes);

            bool can = !(s.town?.giftDay?.TryGetValue(npc, out var gd) == true && gd == s.day) && Town.GiftsLeft(s, npc) > 0;
            var items = s.inventory.Where(st => !(GameData.Item(st.id)?.tool ?? true)).ToList();
            if (selectedGift != null && !items.Any(st => st.id == selectedGift)) selectedGift = null;
            var grid = SlotGrid(bx, "gift", new Vector2(24, -148), new Vector2(856, 362), new Vector2(112, 112), 12, 7);
            foreach (var st in items)
            {
                var id = st.id; var taste = Town.GiftTaste(npc, id);
                var cell = Slot(grid, id, st.count, id == selectedGift, () => { selectedGift = id; Fill(openPanel); });
                if (taste == "love") Chip(cell, "最爱", Hex("f08aa0"), 66, 32).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(2, -2), new Vector2(66, 32));
                else if (taste == "like") Chip(cell, "喜欢", Picked, 66, 32).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(2, -2), new Vector2(66, 32));
            }
            if (items.Count == 0) Hint(bx, "背包里没有能送的东西", new Vector2(0.5f, 0.5f), new Vector2(0, -20), new Vector2(600, 60));

            string status = !can ? (s.town?.giftDay?.TryGetValue(npc, out var gd2) == true && gd2 == s.day ? "今天已经送过了，明天再来吧" : "这周已经送了 2 次")
                : selectedGift == null ? "选一件礼物" : GiftLine(npc, selectedGift);
            var st2 = Label(bx, status, FsSub, Ink, false, TextAlignmentOptions.Left); st2.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 40), new Vector2(540, 80));
            var give = Button(bx, "送给 TA", Yellow, WoodDark, FsBody, () =>
            {
                var gid = selectedGift; if (gid == null) return;
                var r = Town.Gift(s, npc, gid);
                if (r.ok) GameAudio.Play(r.taste == "love" || r.taste == "like" ? "happy" : "pick");
                session.Say(r.ok ? $"{n.name}{(r.taste == "love" ? "非常开心！" : r.taste == "like" ? "很高兴" : r.taste == "dislike" ? "不太喜欢……" : "收下了")}（好感 {(r.gain >= 0 ? "+" : "")}{r.gain}）" : r.reason == "gifted" ? "今天已经送过了" : "这周已经送了 2 次");
                selectedGift = null; session.AfterAction();
            });
            ((RectTransform)give.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-24, 24), new Vector2(260, 96));
            give.interactable = can && selectedGift != null;
        }

        static string GiftLine(string npc, string id) => $"送出{Name(id)}：" + Town.GiftTaste(npc, id) switch { "love" => "最喜欢！好感 +10", "like" => "喜欢，好感 +5", "dislike" => "不太喜欢，好感 −3", _ => "好感 +2" };

        // ---------- 委托 ----------
        void QuestBox(RectTransform scr, GameState s, string npc, NpcDef n)
        {
            var bx = SubBox(scr, $"{n.name}的委托");
            var list = ScrollList(bx, new Vector2(24, -88), new Vector2(852, 536), 12);
            foreach (var q in Town.ActiveOf(s, npc)) QuestCard(list, s, q, true, n);
            foreach (var q in Town.Offers(s, npc)) QuestCard(list, s, q, false, n);
            var locked = Town.HeartLocked(s, npc);
            if (locked != null)
            {
                var card = Panel(list, "locked", CreamDark, RoundSmall, false).rectTransform; card.sizeDelta = new Vector2(0, 110);
                KitImage(card, "lock", 50).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(22, 0), new Vector2(50, 50));
                var t = Label(card, $"再熟一点（{locked.hearts} 颗心），{n.name}会拜托你新的事", FsSub, Hex("8a7458"), false, TextAlignmentOptions.Left); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(90, 6);
            }
            if (!Town.ActiveOf(s, npc).Any() && !Town.Offers(s, npc).Any() && locked == null) Hint(bx, "现在没有委托，过几天再来看看吧", new Vector2(0.5f, 0.5f), new Vector2(0, -20), new Vector2(700, 60));
        }

        void QuestCard(RectTransform list, GameState s, QuestDef q, bool active, NpcDef n)
        {
            var card = Panel(list, "quest " + q.id, CreamDark, RoundSmall, false).rectTransform; card.sizeDelta = new Vector2(0, 214);
            KitImage(card, active ? "quest_mark" : "sparkle", 52).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -14), new Vector2(52, 52));
            var title = Label(card, (active ? "进行中 · " : "新委托 · ") + q.title, FsBody, WoodDark, true, TextAlignmentOptions.Left); title.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(82, -12), new Vector2(560, 50));
            title.textWrappingMode = TextWrappingModes.NoWrap; title.overflowMode = TextOverflowModes.Ellipsis;
            var ask = Label(card, q.ask, FsMin, Ink, false, TextAlignmentOptions.Left); ask.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(82, -60), new Vector2(560, 40));
            ask.textWrappingMode = TextWrappingModes.NoWrap; ask.overflowMode = TextOverflowModes.Ellipsis;
            // what is needed: icon + have / need (red when short); "party" = bring a pet along
            float x = 82;
            foreach (var kv in q.need)
            {
                if (kv.Key == "party")
                {
                    var sp = (string)kv.Value; bool with = s.party.Any(u => s.Pet(u)?.species == sp);
                    var pa = Rect("pet", card).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, -102), new Vector2(54, 54)).gameObject.AddComponent<Image>(); pa.sprite = Resources.Load<Sprite>("Icons/Pets/pet_" + sp); pa.preserveAspect = true; pa.raycastTarget = false;
                    var pl = Label(card, "带上" + GameData.Species(sp).name, FsMin, with ? WoodDark : Red, true, TextAlignmentOptions.Left); pl.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x + 58, -110), new Vector2(180, 40));
                    x += 240; continue;
                }
                int need = (int)kv.Value, have = Inventory.CountOf(s.inventory, kv.Key);
                var ic = Rect("need", card).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, -102), new Vector2(54, 54)).gameObject.AddComponent<Image>(); ic.sprite = Icon(kv.Key); ic.preserveAspect = true; ic.raycastTarget = false;
                var c = Label(card, $"{have}/{need}", FsSub, have >= need ? WoodDark : Red, true, TextAlignmentOptions.Left); c.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x + 58, -110), new Vector2(100, 40));
                x += 160;
            }
            // the reward
            var parts = new List<string>();
            if (q.reward?.clover != null) parts.Add($"四叶草 {q.reward.clover}");
            if (q.reward?.items != null) parts.AddRange(q.reward.items.Select(kv => $"{Name(kv.Key)} ×{kv.Value}"));
            if (q.reward?.recipe != null) parts.Add("配方：" + (GameData.Recipe(q.reward.recipe) is RecipeDef rd ? Name(rd.@out) : q.reward.recipe));
            if (q.reward?.friend != null) parts.Add($"好感 +{q.reward.friend}");
            var rw = Label(card, "奖励　" + string.Join("　", parts), FsMin, Hex("8a6a2a"), true, TextAlignmentOptions.Left); rw.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(82, 12), new Vector2(560, 40));
            var qid = q.id;
            if (active)
            {
                bool ready = Town.Missing(s, qid).Count == 0;
                var bt = Button(card, "交委托", ready ? Yellow : Cream, WoodDark, FsSub, () => { var r = Town.Complete(s, qid); if (r.ok) GameAudio.Play("quest"); session.Say(r.ok ? $"{n.name}：{q.thanks}" : r.reason == "full" ? "背包满了" : "东西还不够"); if (r.ok) talkLine = q.thanks; session.AfterAction(); });
                ((RectTransform)bt.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-18, 0), new Vector2(190, TouchMin));
                bt.interactable = ready;
            }
            else
            {
                var bt = Button(card, "接受", Grass, Color.white, FsSub, () => { Town.Accept(s, qid); talkLine = q.ask; session.AfterAction(); });
                ((RectTransform)bt.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-18, 0), new Vector2(190, TouchMin));
            }
        }
    }
}
