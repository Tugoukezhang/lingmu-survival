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
                case "confirm": FillConfirm(); break;
                case "leave": FillLeave(); break;
                case "dock": FillDock(); break;
                case "party": FillParty(); break;
                case "dex": FillDex(); break;
                case "shop": FillStore("shop"); break;
                case "expand": FillBuild("扩建家园", Progress.ExpandCost, "把家园岛东边的空地买下来，农田会变大", () => Progress.BuyExpansion(session.S), session.S.world?.expanded ?? false); break;
                case "repair": FillBuild("修好小镇的桥", Progress.BridgeCost, "阿栗会帮你一起修，修好就能去更远的地方", () => Progress.RepairBridge(session.S), session.S.world?.bridge ?? false); break;
                case "decorate": FillDecorate(); break;
                case "daily": FillDaily(); break;
                case "map": FillMap(); break;
                case "settings": FillSettings(); break;
            }
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

    }
}
