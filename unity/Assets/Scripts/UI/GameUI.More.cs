// HUD panels ported from the web version's top-right buttons: daily tasks (任务), the island map (地图) and settings (设置).
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.Rules;
using Lingmu.World;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public partial class GameUI
    {
        // ---------- daily tasks: three a day, +20 clover each, +30 and a seed packet for all three ----------
        void FillDaily()
        {
            var s = session.S;
            var d = Daily.Ensure(s);
            var b = NewBox($"每日任务 · 第 {s.day} 天", new Vector2(1180, 760));
            for (int i = 0; i < d.tasks.Count; i++)
            {
                var t = d.tasks[i];
                int prog = Mathf.Max(0, Daily.Progress(s, t));
                var row = Panel(b, "task", t.done ? Hex("e4f2cf") : CreamDark, Round, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -110 - i * 150), new Vector2(1060, 130));
                var name = Label(row, t.text, 32, Ink, true, TextAlignmentOptions.Left); name.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(34, -12), new Vector2(760, 50));
                var bar = MakeBar(row, "progress", t.done ? Grass : Orange); bar.root.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(34, 18), new Vector2(620, 34));
                SetBar(bar, prog / (float)t.n, $"{prog}/{t.n}");
                var reward = Label(row, t.done ? "✔ 已领" : $"+{Daily.TaskReward} 四叶草", 30, t.done ? GrassDark : Hex("c99a1e"), true, TextAlignmentOptions.Right);
                reward.rectTransform.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-34, 0), new Vector2(300, 60));
            }
            var note = Label(b, d.bonus ? "今天的奖励都领完了，明天再来！" : $"三个都完成：再得 {Daily.AllBonus} 四叶草 + 一包种子（睡醒后刷新任务）", 28, Hex("7a6450"));
            note.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 40), new Vector2(1060, 60));
        }

        // ---------- island map: land, the player and what can be used, from the area's own walk map ----------
        static readonly Dictionary<string, (Color color, string label)> MapKinds = new Dictionary<string, (Color, string)>
        {
            { "airship", (WoodDark, "飞艇") }, { "dock", (WoodDark, "飞艇码头") }, { "fire", (Orange, "营火") }, { "campfire", (Orange, "营火") },
            { "tent", (Hex("f0a9a0"), "帐篷") }, { "lostbag", (Hex("c99a5a"), "失物包") }, { "chest", (Yellow, "宝箱") }, { "thorn", (Hex("6a5a32"), "荆棘") },
            { "npc", (Sky, "居民") }, { "door", (Hex("b07a4a"), "门") }, { "bridge", (Hex("b07a4a"), "吊桥") }, { "home", (Hex("b07a4a"), "回家园") },
            { "north", (Hex("9a8468"), "断桥") }, { "bed", (Hex("f0a9a0"), "床") }, { "storage", (Hex("a07850"), "储物箱") }, { "ship", (Hex("a07850"), "出货箱") },
            { "seeds", (Grass, "种子摊") }, { "expand", (Hex("9a8468"), "扩建用地") }, { "decorate", (Hex("a07850"), "布置板") },
        };
        Texture2D mapTex;

        void FillMap()
        {
            var title = session.Area?.Id switch { "home" => "地图 · 家园岛", "town" => "地图 · 风铃小镇", "house" => "地图 · 我的小屋", _ => "地图 · 雾林浮岛" };
            var b = NewBox(title, new Vector2(1600, 900));
            var walk = mover ? mover.map : null;
            if (!walk || walk.Cols == 0) { var t = Label(b, "这里没有地图", 34, Ink); t.rectTransform.Fill(); return; }
            int cols = walk.Cols, rows = walk.Rows;
            if (mapTex) Destroy(mapTex);
            mapTex = new Texture2D(cols, rows, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            var land = Hex("8cc66a"); var busy = Hex("6fa552"); var sea = new Color(0, 0, 0, 0);
            for (int y = 0; y < rows; y++) for (int x = 0; x < cols; x++)
                mapTex.SetPixel(x, rows - 1 - y, walk.IsFree(x, y) ? land : walk.IsLand(x, y) ? busy : sea);
            mapTex.Apply();
            // fit the island into the left part of the panel
            float cell = Mathf.Floor(Mathf.Min(1060f / cols, 740f / rows));
            var water = Panel(b, "water", Hex("bfe3ef"), Round, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(40, -100), new Vector2(cols * cell + 40, rows * cell + 40));
            var img = Rect("island", water).Place(new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(cols * cell, rows * cell)).gameObject.AddComponent<RawImage>();
            img.texture = mapTex; img.raycastTarget = false;
            Vector2 At(Vector3 p) => new Vector2(p.x / HomeIslandLayout.TileSize * cell, p.z / HomeIslandLayout.TileSize * cell);   // tiles: x east, y south (= −z)
            void Dot(Vector3 p, Color c, float size)
            {
                var d = Panel(img.transform, "mark", c, Circle, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 0.5f), At(p), new Vector2(size, size));
                d.gameObject.AddComponent<Outline>().effectColor = new Color(1, 1, 1, 0.8f);
            }
            var used = new List<string>();
            foreach (var sp in session.Area.MapSpots())
            {
                if (!MapKinds.TryGetValue(sp.kind, out var k)) continue;
                Dot(sp.pos, k.color, Mathf.Max(18, cell * 1.3f));
                if (!used.Contains(k.label)) used.Add(k.label);
            }
            if (session.player) Dot(session.player.position, Red, Mathf.Max(26, cell * 1.8f));
            // legend
            var legend = Rect("legend", b).Place(new Vector2(1, 1), new Vector2(1, 1), new Vector2(-40, -110), new Vector2(380, 720));
            var rowsL = new List<(Color, string)> { (Red, "你") };
            rowsL.AddRange(used.Select(l => (MapKinds.Values.First(v => v.label == l).color, l)));
            if (session.Area.Id == "expedition") rowsL.Add((Hex("6fa552"), "树、石头（走不过去）"));
            for (int i = 0; i < rowsL.Count; i++)
            {
                var (c, l) = rowsL[i];
                Panel(legend, "dot", c, Circle, false).rectTransform.Place(new Vector2(0, 1), new Vector2(0.5f, 0.5f), new Vector2(20, -24 - i * 52), new Vector2(30, 30));
                var t = Label(legend, l, 28, Ink, false, TextAlignmentOptions.Left); t.rectTransform.Place(new Vector2(0, 1), new Vector2(0, 0.5f), new Vector2(50, -24 - i * 52), new Vector2(330, 48));
            }
            if (session.Area.Id == "expedition" && Explore.TreasureSense(session.S) == 0)
            {
                var hint = Label(legend, "带上会寻宝的宠物，地图上会标出宝箱", 24, Hex("9a8468"), false, TextAlignmentOptions.Left);
                hint.rectTransform.Place(new Vector2(0, 0), new Vector2(0, 0), new Vector2(0, 0), new Vector2(380, 90));
            }
        }

        // ---------- settings ----------
        void FillSettings()
        {
            var s = session.S;
            var b = NewBox("设置", new Vector2(1000, 640));
            var when = s.savedAt > 0 ? System.DateTimeOffset.FromUnixTimeMilliseconds(s.savedAt).ToLocalTime().ToString("HH:mm") : "--:--";
            var t = Label(b, $"进度会自动保存（上次 {when}）\n音乐、音效、画质等选项以后加入", 30, Ink);
            t.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -120), new Vector2(880, 140));
            bool guideLeft = !Guide.Done(s);
            if (guideLeft)
            {
                bool off = Guide.State(s).off;
                var g = Button(b, off ? "打开新手目标" : "关闭新手目标", Grass, Color.white, 32, () => { Guide.SetOff(s, !off); session.Save(); RefreshHud(); });
                ((RectTransform)g.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-14, 50), new Vector2(330, 96));
            }
            var title = Button(b, "回到标题页", Yellow, WoodDark, 32, () => { session.Save(); Close(); SceneManager.LoadScene("Title"); });
            ((RectTransform)title.transform).Place(new Vector2(0.5f, 0), new Vector2(guideLeft ? 0 : 0.5f, 0), new Vector2(guideLeft ? 14 : 0, 50), new Vector2(330, 96));
            var tip = Label(b, "标题页可以继续游戏，也可以重新开始", 24, Hex("9a8468"));
            tip.rectTransform.Place(new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 160), new Vector2(880, 50));
        }
    }
}
