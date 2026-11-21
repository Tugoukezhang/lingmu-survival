// The item screens (docs/19 背包 / 仓库 / 出货箱 / 种子摊 / 杂货铺) share one layout: category tabs along the top, a grid
// of slots or product cards on the left, and a detail card on the right with the item's art, tag, description and quip.
// The reference screens put the details on the left; ours sit on the right so the main button stays bottom-right
// (docs/18 主操作在右下)【建议】. Amounts use a − / + stepper with 最多.
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
        string itemTab = "all", selectedShop, selectedShip;
        int qty = 1;
        string poppedFor;                                    // the panel the pop-in played for (re-filling a panel does not pop it again)
        readonly Dictionary<string, float> scrollAt = new Dictionary<string, float>();   // scroll positions survive a re-fill
        readonly List<(ScrollRect sr, string key, bool horizontal)> scrollPending = new List<(ScrollRect, string, bool)>();

        static readonly Vector2 ItemBox = new Vector2(1600, 900);
        static readonly Vector2 DetailAt = new Vector2(-44, -92), DetailSize = new Vector2(560, 768);

        // item categories for the tabs 【建议】
        static readonly (string key, string label, string icon)[] ItemTabs =
        {
            ("all", "全部", null), ("tool", "工具", "item_axe"), ("food", "吃的", "item_berry"),
            ("mat", "材料", "item_wood"), ("seed", "种子", "item_seed_carrot"), ("other", "其他", "item_book_heal"),
        };

        static string TabOf(string id) => GameData.Item(id)?.tag switch
        {
            "工具" or "捕捉" or "装置" or "照明" or "道具" => "tool",
            "食物" or "作物" => "food",
            "材料" or "进化石" => "mat",
            "种子" => "seed",
            _ => "other",
        };

        static Color TabColor(string tab) => tab switch
        {
            "tool" => Sky, "food" => Orange, "mat" => Hex("c9a27e"), "seed" => Grass, _ => Hex("b9a0d0"),
        };

        static string ShortName(string id) { var n = Name(id); int dot = n.IndexOf('·'); return dot >= 0 ? n.Substring(dot + 1) : n; }

        // a row of category tabs (icon + word); 全部 always, the others only when something is in them
        void ItemTabsRow(RectTransform parent, Vector2 pos, IEnumerable<string> ids)
        {
            var have = new HashSet<string>(ids.Select(TabOf));
            if (itemTab != "all" && !have.Contains(itemTab)) itemTab = "all";
            float x = pos.x;
            foreach (var (key, label, icon) in ItemTabs)
            {
                if (key != "all" && !have.Contains(key)) continue;
                var k = key;
                var tab = Button(parent, "", key == itemTab ? Picked : Cream, WoodDark, FsMin, () => { if (itemTab == k) return; itemTab = k; Fill(openPanel); });
                tab.name = "tab " + label;
                ((RectTransform)tab.transform).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, pos.y), new Vector2(118, 104));
                var img = Rect("icon", tab.transform).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -8), new Vector2(54, 54)).gameObject.AddComponent<Image>();
                img.sprite = icon == null ? Kit("hud_bag") : Icon(icon); img.preserveAspect = true; img.raycastTarget = false;
                var t = Label(tab.transform, label, FsMin, WoodDark, true); t.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 12), new Vector2(118, 34));
                x += 128;
            }
        }

        // a scrolling grid (vertical, or one horizontal row); the scroll position is kept across re-fills (ApplyScrolls)
        RectTransform SlotGrid(RectTransform parent, string key, Vector2 pos, Vector2 size, Vector2 cell, float gap, int cols, bool horizontal = false)
        {
            var view = Rect("grid " + key, parent).Place(new Vector2(0, 1), new Vector2(0, 1), pos, size);
            view.gameObject.AddComponent<RectMask2D>();
            view.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0);   // catches drags for scrolling
            var content = Rect("content", view);
            if (horizontal) { content.anchorMin = new Vector2(0, 0); content.anchorMax = new Vector2(0, 1); content.pivot = new Vector2(0, 0.5f); }
            else { content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); }
            content.offsetMin = content.offsetMax = Vector2.zero;
            var g = content.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = cell; g.spacing = new Vector2(gap, gap);
            g.constraint = horizontal ? GridLayoutGroup.Constraint.FixedRowCount : GridLayoutGroup.Constraint.FixedColumnCount; g.constraintCount = horizontal ? 1 : cols;
            var fit = content.gameObject.AddComponent<ContentSizeFitter>();
            if (horizontal) fit.horizontalFit = ContentSizeFitter.FitMode.PreferredSize; else fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = view.gameObject.AddComponent<ScrollRect>(); sr.content = content; sr.horizontal = horizontal; sr.vertical = !horizontal;
            sr.movementType = ScrollRect.MovementType.Clamped; sr.scrollSensitivity = 40;
            scrollPending.Add((sr, openPanel + "/" + key, horizontal));
            return content;
        }

        void ApplyScrolls()
        {
            foreach (var (sr, key, hor) in scrollPending)
            {
                if (!sr) continue;
                LayoutRebuilder.ForceRebuildLayoutImmediate(sr.content);
                if (scrollAt.TryGetValue(key, out var v)) { if (hor) sr.horizontalNormalizedPosition = v; else sr.verticalNormalizedPosition = v; }
                var k = key; var h = hor;
                sr.onValueChanged.AddListener(p => scrollAt[k] = h ? p.x : p.y);
            }
            scrollPending.Clear();
        }

        // a tappable cell: flat when not chosen, a honey ring when chosen
        Image Cell(RectTransform parent, string name, Color fill, bool selected, Action onClick)
        {
            var cell = Panel(parent, name, selected ? Yellow : fill, RoundSmall, onClick != null);
            if (selected) Panel(cell.transform, "inner", Hex("fff7e2"), FlatSmall, false).rectTransform.Fill(7);
            if (onClick == null) return cell;
            var b = cell.gameObject.AddComponent<Button>(); b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => { GameAudio.Play("click", 0.5f); onClick(); });
            cell.gameObject.AddComponent<UiPress>();
            return cell;
        }

        // one bag slot: the item's icon, the count bottom-right; id null = an empty slot
        RectTransform Slot(RectTransform grid, string id, int count, bool selected, Action onClick, Color? fill = null)
        {
            var cell = Cell(grid, id == null ? "slot" : "slot " + id, fill ?? CreamDark, selected, id == null ? null : onClick);
            if (id == null) return cell.rectTransform;
            var icon = Rect("icon", cell.transform).Fill(12).gameObject.AddComponent<Image>(); icon.sprite = Icon(id); icon.preserveAspect = true; icon.raycastTarget = false;
            if (!icon.sprite) { icon.enabled = false; var n = Label(cell.transform, Name(id), FsMin, Ink); n.rectTransform.Fill(8); }
            if (count > 1)
            {
                var c = Label(cell.transform, count.ToString(), FsSub, WoodDark, true, TextAlignmentOptions.BottomRight); c.rectTransform.Fill(8);
                c.outlineWidth = 0.28f; c.outlineColor = new Color32(251, 245, 230, 255);
            }
            return cell.rectTransform;
        }

        // a product card: icon, short name, clover price (red when it is too dear), an optional corner badge (今日)
        void ProductCard(RectTransform grid, string id, int price, bool selected, bool affordable, string badge, Action onClick)
        {
            var card = Cell(grid, "card " + id, Cream, selected, onClick).rectTransform;
            var icon = Rect("icon", card).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -12), new Vector2(100, 100)).gameObject.AddComponent<Image>();
            icon.sprite = Icon(id); icon.preserveAspect = true; icon.raycastTarget = false;
            var n = Label(card, ShortName(id), FsMin, WoodDark, true); n.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 50), new Vector2(156, 42));
            n.textWrappingMode = TextWrappingModes.NoWrap; n.overflowMode = TextOverflowModes.Ellipsis;
            var row = Rect("price", card).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 14), new Vector2(140, 40));
            Clover(row, 34).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(10, 0), new Vector2(34, 34));
            var p = Label(row, price.ToString(), FsSub, affordable ? WoodDark : Red, true, TextAlignmentOptions.Left); p.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(52, 0), new Vector2(88, 40));
            if (badge != null) Chip(card, badge, Red, 76, 38).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(-6, 8), new Vector2(76, 38));
        }

        // the detail card: art on a soft round well, name, category chip, description and quip. Buttons go along the
        // bottom (main action bottom-right); compact leaves room for a stepper and a total line above them.
        RectTransform DetailCard(RectTransform parent, string id, string extra, bool compact = false)
        {
            var card = Panel(parent, "detail", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), DetailAt, DetailSize);
            var def = GameData.Item(id);
            if (def == null) return card;
            float well = compact ? 150 : 186, y = compact ? -16 : -22;
            var w = Panel(card, "well", Hex("f6efe0"), FlatCircle, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(well, well));
            var art = Rect("art", w).Fill(well * 0.09f).gameObject.AddComponent<Image>(); art.sprite = Icon(id); art.preserveAspect = true; art.raycastTarget = false;
            y -= well + 8;
            var name = Label(card, def.name, FsTitle + 2, WoodDark, true); name.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(DetailSize.x - 40, 66));
            name.textWrappingMode = TextWrappingModes.NoWrap; name.overflowMode = TextOverflowModes.Ellipsis;   // the box must be taller than a line, or Ellipsis hides it all
            y -= 64;
            Chip(card, def.tag ?? "", TabColor(TabOf(id)), 132, 44).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(132, 44));
            y -= 60;
            string text = (def.desc ?? "") + (string.IsNullOrEmpty(extra) ? "" : "\n" + extra);
            float width = DetailSize.x - 64;
            var desc = Label(card, text, FsSub, Ink, false, TextAlignmentOptions.TopLeft); desc.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(width, 200));
            desc.lineSpacing = -4;
            if (!compact && !string.IsNullOrEmpty(def.quip))   // compact cards need the room for materials / amount / total
            {
                y -= desc.GetPreferredValues(text, width, 0).y + 10;
                var q = Label(card, "「" + def.quip + "」", FsMin, Hex("a08a70"), false, TextAlignmentOptions.TopLeft);
                q.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(width, 40));
            }
            return card;
        }

        // − amount + and 最多 (buying, shipping); qty stays within 1..max
        void Stepper(RectTransform parent, Vector2 pos, int max)
        {
            max = Mathf.Max(1, max);
            qty = Mathf.Clamp(qty, 1, max);
            var row = Rect("stepper", parent).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), pos, new Vector2(476, TouchMin));
            var minus = Button(row, "−", Cream, WoodDark, 44, () => { qty = Mathf.Max(1, qty - 1); Fill(openPanel); }, Circle);
            ((RectTransform)minus.transform).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(TouchMin, TouchMin));
            minus.interactable = qty > 1;
            var amount = Panel(row, "amount", Cream, RoundSmall, false).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(98, 0), new Vector2(140, 76));
            var t = Label(amount, qty.ToString(), FsTitle, WoodDark, true); t.rectTransform.Fill();
            var plus = Button(row, "+", Cream, WoodDark, 44, () => { qty = Mathf.Min(max, qty + 1); Fill(openPanel); }, Circle);
            ((RectTransform)plus.transform).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(248, 0), new Vector2(TouchMin, TouchMin));
            plus.interactable = qty < max;
            var most = Button(row, $"最多 {max}", Cream, WoodDark, FsSub, () => { qty = max; Fill(openPanel); });
            ((RectTransform)most.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), Vector2.zero, new Vector2(124, TouchMin));
            most.interactable = qty < max;
        }

        // a line with the clover mark: "label 🍀 value"
        void CloverLine(RectTransform parent, Vector2 pos, string label, string value, Color valueColor)
        {
            var row = Rect("clover line", parent).Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), pos, new Vector2(500, 44));
            var l = Label(row, label, FsSub, Ink, false, TextAlignmentOptions.Right); l.rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(1, 0.5f), new Vector2(-30, 0), new Vector2(220, 44));
            Clover(row, 38).Place(new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-6, 0), new Vector2(38, 38));
            var v = Label(row, value, FsBody, valueColor, true, TextAlignmentOptions.Left); v.rectTransform.Place(new Vector2(0.5f, 0.5f), new Vector2(0, 0.5f), new Vector2(20, 0), new Vector2(220, 44));
        }

        // the player's clover, top right of a shop panel (next to the close button)
        void CloverChip(RectTransform box)
        {
            var chip = Panel(box, "clover chip", Cream, RoundSmall, false, true).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 0.5f), new Vector2(-112, -6), new Vector2(200, 62));
            Clover(chip, 44).Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(12, 0), new Vector2(44, 44));
            var t = Label(chip, session.S.clover.ToString(), FsBody, WoodDark, true, TextAlignmentOptions.Right); t.rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-18, 0), new Vector2(120, 50));
        }

        Button MainButton(RectTransform card, string label, Action act)
        {
            var b = Button(card, label, Yellow, WoodDark, FsBody + 2, act);
            ((RectTransform)b.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-24, 24), new Vector2(270, 96));
            return b;
        }

        void Hint(RectTransform parent, string text, Vector2 anchor, Vector2 pos, Vector2 size)
        {
            var h = Label(parent, text, FsSub, Hex("75604d"), false); h.rectTransform.Place(anchor, new Vector2(0.5f, 0.5f), pos, size);
        }

        // how to use an item that has no button: a light strip with dark text and a tip mark at the card's bottom
        void HowTo(RectTransform card, string text)
        {
            var strip = Panel(card, "how to", Hex("f6efe0"), FlatSmall, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 24), new Vector2(DetailSize.x - 48, 110));
            KitImage(strip, "quest_mark", 52).rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(16, 0), new Vector2(52, 52));
            var t = Label(strip, text, FsSub, Hex("705541"), false, TextAlignmentOptions.Left); t.rectTransform.Fill(); t.rectTransform.offsetMin = new Vector2(82, 6); t.rectTransform.offsetMax = new Vector2(-16, -6);
        }

        // ---------- 背包 ----------
        void FillBag()
        {
            var s = session.S;
            int slots = Crafting.BagSlots(s);
            var b = NewBox($"背包  {s.inventory.Count}/{slots}", ItemBox);
            ItemTabsRow(b, new Vector2(44, -92), s.inventory.Select(x => x.id));
            var shown = s.inventory.Where(x => itemTab == "all" || TabOf(x.id) == itemTab).ToList();
            if (selectedItem == null || !shown.Any(x => x.id == selectedItem)) selectedItem = shown.FirstOrDefault()?.id;
            // 7 columns of 118: 28 slots (the most a bag can have) fit without scrolling
            var grid = SlotGrid(b, "bag", new Vector2(44, -212), new Vector2(904, 648), new Vector2(118, 118), 12, 7);
            foreach (var st in shown) { var id = st.id; Slot(grid, id, st.count, id == selectedItem, () => { selectedItem = id; Fill("bag"); }); }
            if (itemTab == "all") for (int i = shown.Count; i < slots; i++) Slot(grid, null, 0, false, null);

            var def = GameData.Item(selectedItem);
            if (def == null)
            {
                var empty = Panel(b, "detail", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), DetailAt, DetailSize);
                Hint(empty, s.inventory.Count == 0 ? "背包是空的" : "这一类还没有东西", new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(480, 60));
                return;
            }
            string extra = !(def.desc ?? "").Contains("出货") && Farm.PriceOf(selectedItem) is int price ? $"出货价 {price}" : null;
            var card = DetailCard(b, selectedItem, extra);
            var (label, act, hint) = BagAction(selectedItem);
            if (act != null) MainButton(card, label, act);
            else if (hint != null) HowTo(card, hint);
        }

        // what the detail card's button does for an item, or a hint when there is nothing to press
        (string label, Action act, string hint) BagAction(string id)
        {
            var def = GameData.Item(id); var s = session.S;
            if (def.food != null) return ("吃掉", () => session.Eat(id), null);
            if (def.book != null) return ("去学技能", () => OpenParty("skills"), null);
            if (id == "item_fox_bell")
            {
                var fox = s.pets.FirstOrDefault(p => !string.IsNullOrEmpty(GameData.Species(p.species).humanForm))?.uid;
                return ("去化形", () => { if (fox != null) OpenParty("growth", fox); else session.Say("要先有一只焰尾狐"); }, null);
            }
            if (def.tag == "进化石") return ("去进化", () => OpenParty("growth"), null);
            if (id == "item_torch") return ("点亮", () => session.Use(id), null);
            if (id == "item_campfire")
                return session.Area is ExpeditionArea ? ("放下营火", () => { Close(); session.Use(id); }, null) : (null, null, "在远征岛上放下：取暖、烤东西，雾怪不敢靠近");
            if (id == "item_tent") return (null, null, "在点着的营火旁按「互动」，就能睡一晚");
            if (House.IsFurniture(id)) return session.Area is HouseArea ? ("去布置", () => Open("decorate"), null) : (null, null, "进小屋后，在「布置」里摆放");
            return def.tag switch
            {
                "捕捉" => (null, null, "靠近野生宠物按「扔网」\n对战里也能用"),
                "种子" => (null, null, "站在开垦好的农田上按「播种」"),
                "材料" => (null, null, "「制作」时用得上"),
                "作物" => (null, null, "放进出货箱，明早换成四叶草"),
                _ => (null, null, def.tool ? "带在身上就会自动用上" : null),
            };
        }

        // ---------- 仓库: the bag on the left, the chest on the right; tap a slot to move the whole stack across ----------
        void FillStorage()
        {
            var s = session.S; int slots = Crafting.BagSlots(s);
            var store = s.storage ?? new List<ItemStack>();
            var b = NewBox("仓库", ItemBox);
            const float colW = 698, top = -160, height = 590;
            void Column(float x, string head, string tip, List<ItemStack> list, int cap, string key, Action<string> move)
            {
                var h = Label(b, head, FsBody, WoodDark, true, TextAlignmentOptions.Left); h.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x + 4, -104), new Vector2(colW, 48));
                var t = Label(b, tip, FsMin, Hex("75604d"), false, TextAlignmentOptions.Right); t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(x, -108), new Vector2(colW - 4, 44));
                var grid = SlotGrid(b, key, new Vector2(x, top), new Vector2(colW, height), new Vector2(108, 108), 10, 6);
                foreach (var st in list) { var id = st.id; Slot(grid, id, st.count, false, () => move(id)); }
                for (int i = list.Count; i < cap; i++) Slot(grid, null, 0, false, null);
            }
            Column(44, $"背包  {s.inventory.Count}/{slots}", "点一格，整堆存入 →", s.inventory, slots, "bag", id => session.Deposit(id));
            Column(ItemBox.x - 44 - colW, $"仓库  {store.Count} 种", "← 点一格，整堆取回", store, Mathf.Max(24, (store.Count + 5) / 6 * 6), "chest", id => session.Withdraw(id));
            Panel(b, "divider", Hex("e6dac4"), FlatSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, top), new Vector2(6, height));
            var put = Button(b, "全部存入", Yellow, WoodDark, FsBody, () => session.DepositAll()); ((RectTransform)put.transform).Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(44, 40), new Vector2(280, 96));
            var note = Label(b, "工具和食物会留在身上", FsMin, Hex("75604d"), false, TextAlignmentOptions.Left); note.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0.5f), new Vector2(344, 88), new Vector2(400, 40));
            var take = Button(b, "全部取回", Grass, Color.white, FsBody, () => session.WithdrawAll()); ((RectTransform)take.transform).Place(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-44, 40), new Vector2(280, 96));
            take.interactable = store.Count > 0;
            put.interactable = s.inventory.Count > 0;
        }

        // ---------- 出货箱: sellable things from the bag, the box's contents along the bottom, details with an amount ----------
        void FillShip()
        {
            var s = session.S; var box = Farm.Of(s).shipping;
            var b = NewBox("出货箱", ItemBox);
            var sell = s.inventory.Where(x => Farm.PriceOf(x.id) != null).ToList();
            if (selectedShip == null || !sell.Any(x => x.id == selectedShip)) { selectedShip = sell.FirstOrDefault()?.id; qty = 1; }
            var h = Label(b, "背包里能卖的", FsBody, WoodDark, true, TextAlignmentOptions.Left); h.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(48, -96), new Vector2(600, 48));
            var grid = SlotGrid(b, "sell", new Vector2(44, -150), new Vector2(904, 380), new Vector2(118, 118), 12, 7);
            foreach (var st in sell) { var id = st.id; Slot(grid, id, st.count, id == selectedShip, () => { if (selectedShip != id) qty = 1; selectedShip = id; Fill("ship"); }); }
            if (sell.Count == 0) Hint(b, "没有能出货的东西：作物、浆果、鱼、雾晶都能卖", new Vector2(0, 1), new Vector2(496, -330), new Vector2(860, 60));

            // the box: what is already in it, and what it brings tomorrow morning
            var tray = Panel(b, "box", Hex("f1e6cf"), null, false).rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(44, 40), new Vector2(904, 270));
            KitImage(tray, "act_ship", 60).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -10), new Vector2(60, 60));
            var th = Label(tray, $"已装箱 {box.Sum(x => x.count)} 件　明早到账", FsBody, WoodDark, true, TextAlignmentOptions.Left); th.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(90, -14), new Vector2(420, 52));
            Clover(tray, 40).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(472, -20), new Vector2(40, 40));
            var tv = Label(tray, "+" + Farm.ShippingValue(s), FsTitle, GrassDark, true, TextAlignmentOptions.Left); tv.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(520, -12), new Vector2(200, 56));
            if (box.Count > 0) { var tip = Label(tray, "点一格取回", FsMin, Hex("75604d"), false, TextAlignmentOptions.Right); tip.rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-20, -20), new Vector2(200, 40)); }
            var row = SlotGrid(tray, "box", new Vector2(20, -84), new Vector2(864, 118), new Vector2(118, 118), 12, 1, true);
            foreach (var st in box) { var id = st.id; Slot(row, id, st.count, false, () => session.Unship(id), Cream); }
            if (box.Count == 0) Hint(tray, "还是空的。放进去的东西，明早 6 点换成四叶草", new Vector2(0.5f, 0), new Vector2(0, 86), new Vector2(840, 50));

            if (selectedShip == null)
            {
                var empty = Panel(b, "detail", CreamDark, null, false).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), DetailAt, DetailSize);
                Hint(empty, "去远征岛采集、在农田种点东西吧", new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(480, 80));
                return;
            }
            var sel = selectedShip;
            int have = Inventory.CountOf(s.inventory, sel), each = Farm.PriceOf(sel) ?? 0;
            var card = DetailCard(b, sel, $"背包里有 {have}", true);
            Stepper(card, new Vector2(0, 136), have);
            CloverLine(card, new Vector2(0, 238), $"放入 {qty} 个，值", "+" + each * qty, GrassDark);
            MainButton(card, $"放入 {qty} 个", () => { session.Ship(sel, qty); qty = 1; });
        }

        // ---------- 制作: recipe cards (what you can make now has a tick), materials with have / need, make N ----------
        string selectedRecipe;

        // how many times a recipe can be made from what is in the bag
        static int Makeable(GameState s, RecipeDef r) => r.cost.Count == 0 ? 99 : r.cost.Min(kv => Inventory.CountOf(s.inventory, kv.Key) / Math.Max(1, kv.Value));

        void FillCraft()
        {
            var s = session.S;
            var recipes = GameData.Recipes.Where(r => Crafting.Unlocked(s, r.id)).ToList();
            var b = NewBox("制作", ItemBox);
            ItemTabsRow(b, new Vector2(44, -92), recipes.Select(r => r.@out));
            var shown = recipes.Where(r => itemTab == "all" || TabOf(r.@out) == itemTab)
                .OrderByDescending(r => Makeable(s, r) > 0 && Crafting.StationOk(s, r.id)).ToList();   // what can be made now comes first
            if (selectedRecipe == null || !shown.Any(r => r.id == selectedRecipe)) { selectedRecipe = shown.FirstOrDefault()?.id; qty = 1; }
            var grid = SlotGrid(b, "craft", new Vector2(44, -212), new Vector2(904, 648), new Vector2(168, 204), 12, 5);
            foreach (var r in shown)
            {
                var id = r.id; bool here = Crafting.StationOk(s, id); int can = Makeable(s, r);
                var card = Cell(grid, "recipe " + id, Cream, id == selectedRecipe, () => { if (selectedRecipe != id) qty = 1; selectedRecipe = id; Fill("craft"); }).rectTransform;
                var icon = Rect("icon", card).Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -12), new Vector2(100, 100)).gameObject.AddComponent<Image>();
                icon.sprite = Icon(r.@out); icon.preserveAspect = true; icon.raycastTarget = false;
                if (can == 0) icon.color = new Color(1, 1, 1, 0.55f);
                var n = Label(card, ShortName(r.@out) + (r.n > 1 ? $" ×{r.n}" : ""), FsMin, WoodDark, true); n.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 50), new Vector2(156, 42));
                n.textWrappingMode = TextWrappingModes.NoWrap; n.overflowMode = TextOverflowModes.Ellipsis;
                string state = !here ? "回家做" : can > 0 ? "能做" : "缺材料";
                var st = Label(card, state, FsMin, can > 0 && here ? GrassDark : Hex("a08a70"), can > 0 && here); st.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(can > 0 && here ? 14 : 0, 12), new Vector2(140, 40));
                if (can > 0 && here) KitImage(card, "tick", 34).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(-40, 32), new Vector2(34, 34));
                if (r.station == "workbench") KitImage(card, "act_build", 40).rectTransform.Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-10, -10), new Vector2(40, 40));
            }
            var sel = GameData.Recipe(selectedRecipe);
            if (sel == null) return;
            bool atStation = Crafting.StationOk(s, sel.id); int most = Makeable(s, sel);
            var card2 = DetailCard(b, sel.@out, (sel.n > 1 ? $"一次做 {sel.n} 个　" : "") + (sel.station == "workbench" ? "在家园的工作台做" : ""), true);
            // materials: icon, have / need (red when short)
            var mats = sel.cost.ToList();
            float w = 112, x0 = -(mats.Count - 1) * w / 2;
            for (int i = 0; i < mats.Count; i++)
            {
                var (mid, need) = (mats[i].Key, mats[i].Value);
                int have = Inventory.CountOf(s.inventory, mid);
                int use = need * Math.Max(1, qty);
                var slot = Panel(card2, "material", Hex("f6efe0"), FlatSmall, false).rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(x0 + i * w, 232), new Vector2(104, 116));
                var mi = Rect("icon", slot).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(6, -6), new Vector2(48, 48)).gameObject.AddComponent<Image>(); mi.sprite = Icon(mid); mi.preserveAspect = true; mi.raycastTarget = false;
                var c = Label(slot, $"×{use}", FsSub, have >= use ? WoodDark : Red, true, TextAlignmentOptions.Left); c.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(56, -10), new Vector2(48, 40));
                var hv = Label(slot, $"有 {have}", FsMin, have >= use ? Hex("75604d") : Red, false); hv.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 6), new Vector2(104, 38));
            }
            Stepper(card2, new Vector2(0, 136), Math.Min(20, most));
            var make = MainButton(card2, !atStation ? "回家园做" : most == 0 ? "材料不够" : $"制作 {qty} 个", () => { if (session.CraftMany(sel.id, qty) > 0) qty = 1; });
            make.interactable = atStation && most > 0;
        }

        // ---------- 种子摊 (home) and 杂货铺 (town): product cards, details, amount, buy ----------
        void FillStore(string panel)
        {
            var s = session.S;
            bool seeds = panel == "seeds";
            var stock = seeds
                ? GameData.CropIds.Select(c => (id: GameData.Crops[c].seed, price: GameData.Crops[c].seedPrice, crop: c)).ToList()
                : Town.Stock(s).Select(e => (id: e.id, price: e.price, crop: (string)null)).ToList();
            var today = seeds ? new HashSet<string>() : new HashSet<string>(stock.Skip(GameData.Shop.Count).Select(e => e.id));   // the two skill books of the day
            var b = NewBox(seeds ? "种子摊" : "杂货铺", ItemBox);
            CloverChip(b);
            float top = -92;
            if (!seeds) { ItemTabsRow(b, new Vector2(44, -92), stock.Select(x => x.id)); top = -212; }
            var shown = stock.Where(x => itemTab == "all" || TabOf(x.id) == itemTab).ToList();
            if (selectedShop == null || !shown.Any(x => x.id == selectedShop)) { selectedShop = shown.FirstOrDefault().id; qty = 1; }
            var grid = SlotGrid(b, "shop", new Vector2(44, top), new Vector2(904, ItemBox.y - 40 + top), new Vector2(168, 204), 12, 5);
            foreach (var e in shown)
            {
                var id = e.id;
                ProductCard(grid, id, e.price, id == selectedShop, s.clover >= e.price, today.Contains(id) ? "今日" : null, () => { if (selectedShop != id) qty = 1; selectedShop = id; Fill(panel); });
            }
            var sel = shown.FirstOrDefault(x => x.id == selectedShop);
            if (sel.id == null) return;
            string extra = seeds ? $"果实出货价 {Farm.PriceOf(GameData.Crops[sel.crop].crop)}" : null;
            int have = Inventory.CountOf(s.inventory, sel.id);
            if (have > 0) extra = (extra == null ? "" : extra + "　") + $"背包里有 {have}";
            var card = DetailCard(b, sel.id, extra, true);
            Stepper(card, new Vector2(0, 136), Mathf.Min(99, s.clover / Mathf.Max(1, sel.price)));
            int cost = qty * sel.price;
            CloverLine(card, new Vector2(0, 238), "共", cost.ToString(), cost <= s.clover ? WoodDark : Red);
            var buy = MainButton(card, cost <= s.clover ? $"买 {qty} 个" : $"还差 {cost - s.clover}", () => { bool ok = seeds ? session.BuySeed(sel.crop, qty) : session.Buy(sel.id, qty); if (ok) qty = 1; });
            buy.interactable = cost <= s.clover;
        }
    }
}
