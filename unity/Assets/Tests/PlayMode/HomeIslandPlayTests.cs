// Plays the real scenes for a moment, the way a player would go through them with one save: the title page, the home
// island (farm, panels stop the clock, sleeping), an expedition island (gathering, a chest, a battle on 自动, the night),
// the airship home, 风铃小镇 (talking to a resident) and the cottage room (placing furniture).
// Screenshots go to D:\ClaudeTools\unity\ui_*.png (dev PC only) so the layout can be checked without a phone.
using System.Collections;
using System.IO;
using System.Linq;
using Lingmu.Game;
using Lingmu.Rules;
using Lingmu.UI;
using Lingmu.World;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UI;

public class HomeIslandPlayTests
{
    const string ShotDir = @"D:\ClaudeTools\unity";
    string saveDir;

    [SetUp] public void UseTempSave()
    {
        saveDir = Path.Combine(Path.GetTempPath(), "lingmu-playtest-" + System.Guid.NewGuid().ToString("N"));
        GameSession.SaveDirOverride = saveDir;
        GameSession.ForgetState();
    }

    [TearDown] public void Clean()
    {
        GameSession.SaveDirOverride = null;
        GameSession.ForgetState();
        try { Directory.Delete(saveDir, true); } catch { }
    }

    static void Shot(string name, Canvas canvas = null)
    {
        if (!Directory.Exists(ShotDir)) return;
        canvas ??= Object.FindAnyObjectByType<GameUI>()?.canvas;
        var cam = Camera.main;
        var rt = new RenderTexture(1600, 900, 24);
        var mode = canvas ? canvas.renderMode : RenderMode.ScreenSpaceOverlay;
        if (canvas) { canvas.renderMode = RenderMode.ScreenSpaceCamera; canvas.worldCamera = cam; canvas.planeDistance = 1; }
        cam.targetTexture = rt;
        Canvas.ForceUpdateCanvases();
        for (int i = 0; i < 4; i++) cam.Render();   // first frames on this PC can come out with the wrong textures
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); tex.Apply();
        File.WriteAllBytes(Path.Combine(ShotDir, $"ui_{name}.png"), tex.EncodeToPNG());
        RenderTexture.active = null; cam.targetTexture = null; rt.Release();
        if (canvas) canvas.renderMode = mode;
    }

    static IEnumerator Frames(int n) { for (int i = 0; i < n; i++) yield return null; }
    static IEnumerator Load(string scene) { SceneManager.LoadScene(scene); yield return Frames(6); }
    static IEnumerator WaitArea(string id) { for (int i = 0; i < 120 && (GameSession.I == null || GameSession.I.Area == null || GameSession.I.Area.Id != id); i++) yield return null; yield return Frames(4); }
    static void Click(string label) { var b = Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(x => x.name == "button " + label && x.isActiveAndEnabled); Assert.IsNotNull(b, "按钮 " + label); b.onClick.Invoke(); }
    static void Stand(Vector3 at) { var p = GameSession.I.player; p.position = new Vector3(at.x, p.position.y, at.z); }

    [UnityTest] public IEnumerator 标题页()
    {
        yield return Load("Title");
        var t = Object.FindAnyObjectByType<TitleUI>();
        Assert.IsNotNull(t, "标题页");
        Shot("title", t.canvas);
        Click("开始游戏");
        yield return null;
        Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(x => x.name == "card fox").onClick.Invoke();
        yield return null;
        Shot("choose", t.canvas);
        Click("就选它"); yield return null;
        Click("开始冒险");
        yield return WaitArea("home");
        Assert.AreEqual("fox", GameSession.I.S.flags.starter, "选了焰尾狐开局");
        Assert.AreEqual(1, GameSession.I.S.pets.Count);
    }

    // every crop at every stage, ripe ones in front, for a close look at the farm (picture: ui_farm_showcase.png)
    [UnityTest] public IEnumerator 农田展示()
    {
        var st = SaveRules.NewGameState(starter: "fox");
        var f = HomeIslandLayout.Generate().FarmRect;
        var crops = GameData.CropIds;
        for (int row = 0; row < f.h; row++)
            for (int col = 0; col < f.w; col++)
            {
                var p = new FarmPlot { tilled = true, watered = (col + row) % 2 == 0 };
                if (col < crops.Count) { var c = crops[col]; int days = GameData.Crops[c].days; p.crop = c; p.days = row == 0 ? 0 : row == 1 ? days / 2 : row == 2 ? days - 1 : days; }
                Farm.Of(st).plots[Farm.PlotKey(f.x + col, f.y + row)] = p;
            }
        GameSession.UseState(st);
        yield return Load("HomeIsland");
        Stand(HomeIslandLayout.TileToWorld(f.x + 2.5f, f.y + f.h + 1.2f));
        yield return new WaitForSeconds(0.6f);
        Shot("farm_showcase");
        var shown = Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None).Where(r => r.name == "produce" && r.gameObject.activeInHierarchy).Select(r => r.transform.parent.name).OrderBy(n => n).ToList();
        Assert.AreEqual(5, shown.Count, "五种成熟作物都显示出来：" + string.Join(" ", shown) + " day " + GameSession.I.S.day);
    }

    [UnityTest] public IEnumerator 家园岛_种地与睡觉()
    {
        GameSession.UseState(SaveRules.NewGameState(starter: "fox"));
        yield return Load("HomeIsland");
        var s = GameSession.I; var home = (HomeArea)s.Area; var ui = Object.FindAnyObjectByType<GameUI>();
        Shot("hud");
        var f = home.Layout.FarmRect;
        string key = Farm.PlotKey(f.x + 1, f.y + 1);
        Stand(HomeIslandLayout.TileToWorld(f.x + 1, f.y + 1));
        yield return null;
        Assert.AreEqual("开垦", s.CurrentSpot()?.verb, "站在农田上：动作是开垦");
        s.Act(s.CurrentSpot()); s.Act(s.CurrentSpot()); s.Act(s.CurrentSpot());
        var plot = Farm.PlotOf(s.S, key);
        Assert.IsTrue(plot.tilled && plot.crop == "carrot" && plot.watered, "开垦、播种、浇水");
        yield return new WaitForSeconds(0.4f);
        Shot("farm");
        ui.Open("bag");
        int clock = s.S.clock;
        yield return new WaitForSeconds(1.2f);
        Assert.AreEqual(clock, s.S.clock, "打开背包时时间暂停");
        Shot("bag");
        ui.Close(); ui.Open("party"); yield return null; Shot("party"); ui.Close();
        Stand(HomeIslandLayout.TileToWorld(home.Layout.DockTile.x, home.Layout.DockTile.y + 0.5f)); yield return null;
        Assert.AreEqual("dock", s.CurrentSpot()?.kind, "码头");
        ui.Open("dock"); yield return null; Shot("dock"); ui.Close();
        ui.Open("daily"); yield return null; Shot("daily"); ui.Close();
        ui.Open("map"); yield return null; Shot("map_home"); ui.Close();
        ui.Open("settings"); yield return null; Shot("settings"); ui.Close();
        Stand(HomeIslandLayout.TileToWorld(home.Layout.Tent.x, home.Layout.Tent.y + 0.6f)); yield return null;
        Assert.AreEqual("tent", s.CurrentSpot()?.kind, "帐篷");
        s.Act(s.CurrentSpot()); yield return null;
        Assert.AreEqual(2, s.S.day, "睡觉后第 2 天");
        Assert.IsTrue(File.Exists(Path.Combine(saveDir, SaveCodec.KeyMain + ".txt")), "睡觉后存档");
        Shot("report");
        ui.Close(); yield return Frames(3);
        Assert.IsFalse(s.Clock.Paused, "新的一天开始走");
    }

    [UnityTest] public IEnumerator 远征岛_采集_对战_夜晚_回家()
    {
        var st = SaveRules.NewGameState(starter: "fox");
        st.day = 5;   // no new-player protection; groups of 2
        Travel.Depart(st, "new");
        GameSession.UseState(st);
        yield return Load("Expedition");
        var s = GameSession.I; var ex = (ExpeditionArea)s.Area;
        Assert.IsNotNull(ex, "远征岛场景");
        foreach (var w in Object.FindObjectsByType<WildPet>(FindObjectsSortMode.None)) w.cooldown = Time.time + 999;   // keep them calm for the pictures
        yield return new WaitForSeconds(0.3f);
        Shot("expedition");
        var exUi = Object.FindAnyObjectByType<GameUI>(); exUi.Open("map"); yield return null; Shot("map_expedition"); exUi.Close();
        // gathering: stand next to a resource
        var res = ex.Island.resources.First(r => !r.rare && !ex.Island.water[r.ty][r.tx]);
        Stand(HomeIslandLayout.TileToWorld(res.tx, res.ty + 0.75f)); yield return null;
        var spot = s.CurrentSpot();
        Assert.AreEqual("gather", spot?.kind, "资源旁：动作是采集");
        s.Act(spot);
        Assert.IsTrue(s.S.expedition.changes.collected.Count > 0, "采集记入岛屿记录");
        // a chest
        var chest = ex.Island.chests.First(c => !c.bonus);
        Stand(HomeIslandLayout.TileToWorld(chest.tx, chest.ty + 0.8f)); yield return null;
        if (s.CurrentSpot()?.kind == "chest") { s.Act(s.CurrentSpot()); Assert.Contains(chest.id, s.S.expedition.changes.chests, "宝箱打开了"); }
        // a battle with a wild pet, played with 自动
        var wild = Object.FindObjectsByType<WildPet>(FindObjectsSortMode.None).First();
        Assert.IsTrue(ex.Encounter(wild, true), "碰到野生宠物：开始对战");
        yield return new WaitForSeconds(0.5f);
        Shot("battle");
        Assert.IsTrue(s.Clock.Paused, "对战中时间暂停");
        for (int i = 0; i < 60 && s.Battle != null; i++)
        {
            var auto = Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(x => x.name == "button 自动" && x.isActiveAndEnabled && x.interactable);
            if (auto) auto.onClick.Invoke();
            else
            {
                var sw = Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(x => x.transform.parent && x.transform.parent.name == "grid" && x.interactable);
                if (sw) sw.onClick.Invoke();
            }
            yield return new WaitForSeconds(1.2f);
        }
        Assert.IsNull(s.Battle, "对战打完");
        yield return new WaitForSeconds(0.3f);
        Shot("battle_result");
        Click("继续"); yield return null;
        Assert.IsFalse(s.Clock.Paused, "对战结束后时间继续");
        // the night: fog, monsters
        Stand(ex.ArrivePoint(s.S));
        s.S.clock = 20 * 60 + 15; s.ApplyLight();
        yield return new WaitForSeconds(1.5f);
        Assert.IsTrue(Object.FindObjectsByType<Transform>(FindObjectsSortMode.None).Any(t => t.name == "fog monster"), "20:10 后雾怪出现");
        Shot("night");
        // the airship home
        var ship = ex.Island.airship;
        Stand(HomeIslandLayout.TileToWorld(ship.tx, ship.ty - 1)); yield return null;
        Assert.AreEqual("airship", s.CurrentSpot()?.kind, "飞艇");
        s.Act(s.CurrentSpot());
        yield return WaitArea("home");
        Assert.AreEqual("home", GameSession.I.S.player.area, "坐飞艇回到家园");
    }

    [UnityTest] public IEnumerator 小镇与小屋()
    {
        var st = SaveRules.NewGameState(starter: "fox");
        st.inventory.Add(new ItemStack("item_furn_table", 1)); st.inventory.Add(new ItemStack("item_furn_lamp", 1)); st.inventory.Add(new ItemStack("item_furn_rug", 1));
        GameSession.UseState(st);
        yield return Load("HomeIsland");
        GameSession.I.GoTo("town");
        yield return WaitArea("town");
        var s = GameSession.I; var ui = Object.FindAnyObjectByType<GameUI>();
        Assert.AreEqual(6 * 60 + 10, s.S.clock, "过吊桥 10 分钟");
        Shot("town");
        var granny = TownArea.Houses[0];
        Stand(HomeIslandLayout.TileToWorld(granny.sx, granny.sy + 2.5f)); yield return new WaitForSeconds(1.2f);   // she turns to look at the player
        Shot("town_granny");
        Stand(HomeIslandLayout.TileToWorld(granny.sx, granny.sy + 1)); yield return null;
        Assert.AreEqual("npc", s.CurrentSpot()?.kind, "站在铃奶奶面前：聊天");
        ui.OpenNpc("granny"); yield return null;
        Assert.AreEqual(1, Town.FriendOf(s.S, "granny"), "第一次聊天好感 +1");
        Shot("town_npc");
        ui.Close();
        s.GoTo("home"); yield return WaitArea("home");
        GameSession.I.GoTo("house"); yield return WaitArea("house");
        s = GameSession.I;
        var room = (HouseArea)s.Area;
        room.PlaceInFront("item_furn_table"); room.PlaceInFront("item_furn_rug");
        Stand(HouseArea.Cell(9, 4)); yield return null;
        room.PlaceInFront("item_furn_lamp");
        Assert.AreEqual(3, House.Of(s.S).items.Count, "摆了 3 件家具");
        Stand(HouseArea.Cell(5.5f, 6.5f)); yield return Frames(3);
        Shot("house");
    }
}
