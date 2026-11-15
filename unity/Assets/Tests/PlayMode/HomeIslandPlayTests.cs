// Plays the real HomeIsland scene for a moment: the screen is built, the farm works through the action button,
// panels open and stop the clock, sleeping ends the day and saves. Screenshots go to D:\ClaudeTools\unity\ui_*.png
// (dev PC only) so the layout can be looked at without a phone.
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

public class HomeIslandPlayTests
{
    const string ShotDir = @"D:\ClaudeTools\unity";
    string saveDir;

    [SetUp] public void UseTempSave()
    {
        saveDir = Path.Combine(Path.GetTempPath(), "lingmu-playtest-" + System.Guid.NewGuid().ToString("N"));
        GameSession.SaveDirOverride = saveDir;
    }

    [TearDown] public void Clean()
    {
        GameSession.SaveDirOverride = null;
        try { Directory.Delete(saveDir, true); } catch { }
    }

    static void Shot(string name)
    {
        if (!Directory.Exists(ShotDir)) return;
        var ui = Object.FindAnyObjectByType<GameUI>();
        var cam = Camera.main;
        var rt = new RenderTexture(1600, 900, 24);
        var mode = ui.canvas.renderMode;
        ui.canvas.renderMode = RenderMode.ScreenSpaceCamera; ui.canvas.worldCamera = cam; ui.canvas.planeDistance = 1;
        cam.targetTexture = rt;
        Canvas.ForceUpdateCanvases();
        for (int i = 0; i < 4; i++) cam.Render();   // first frames on this PC can come out with the wrong textures
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); tex.Apply();
        File.WriteAllBytes(Path.Combine(ShotDir, $"ui_{name}.png"), tex.EncodeToPNG());
        RenderTexture.active = null; cam.targetTexture = null; rt.Release();
        ui.canvas.renderMode = mode;
    }

    static IEnumerator Frames(int n) { for (int i = 0; i < n; i++) yield return null; }

    [UnityTest] public IEnumerator 家园岛_界面与一天的循环()
    {
        SceneManager.LoadScene("HomeIsland");
        yield return Frames(5);
        var s = GameSession.I;
        var ui = Object.FindAnyObjectByType<GameUI>();
        Assert.IsNotNull(s, "场景里有 GameSession");
        Assert.IsNotNull(ui, "场景里有新界面");
        Assert.AreEqual("fox", s.S.flags.starter, "没有存档时开新档：带焰尾狐");
        Shot("hud");

        // farm: stand on a plot and press the action button a few times
        var f = s.Layout.FarmRect;
        string key = Farm.PlotKey(f.x + 1, f.y + 1);
        s.player.position = HomeIslandLayout.TileToWorld(f.x + 1, f.y + 1) + Vector3.up * s.player.position.y;
        yield return Frames(2);
        var spot = s.CurrentSpot();
        Assert.AreEqual("plot", spot?.kind, "站在农田上：动作是种地");
        Assert.AreEqual("开垦", spot.verb);
        s.Act(spot);
        Assert.IsTrue(Farm.PlotOf(s.S, key).tilled, "按一下：开垦");
        s.Act(s.CurrentSpot());
        Assert.AreEqual("carrot", Farm.PlotOf(s.S, key).crop, "再按：种下萝卜");
        s.Act(s.CurrentSpot());
        Assert.IsTrue(Farm.PlotOf(s.S, key).watered, "再按：浇水");
        for (int dx = 2; dx <= 3; dx++)
        {
            s.player.position = HomeIslandLayout.TileToWorld(f.x + dx, f.y + 1) + Vector3.up * s.player.position.y;
            yield return null;
            s.Act(s.CurrentSpot()); s.Act(s.CurrentSpot());
        }
        yield return new WaitForSeconds(0.4f);
        Shot("farm");

        // panels stop the clock
        ui.Open("bag");
        int clock = s.S.clock;
        yield return new WaitForSeconds(1.5f);
        Assert.AreEqual(clock, s.S.clock, "打开背包时时间暂停");
        Shot("bag");
        ui.Close();
        ui.Open("craft");
        yield return null;
        Shot("craft");
        ui.Close();
        ui.Open("seeds");
        yield return null;
        Shot("seeds");
        ui.Close();

        // sleep in the tent: the day ends, a report shows, the game is saved
        s.player.position = HomeIslandLayout.TileToWorld(s.Layout.Tent.x, s.Layout.Tent.y + 0.6f) + Vector3.up * s.player.position.y;
        yield return null;
        spot = s.CurrentSpot();
        Assert.AreEqual("tent", spot?.kind, "走到帐篷边：动作是睡觉");
        s.Act(spot);
        yield return null;
        Assert.AreEqual(2, s.S.day, "睡觉后进入第 2 天");
        Assert.AreEqual(1, Farm.PlotOf(s.S, key).days, "浇过水的萝卜长了 1 天");
        Assert.IsTrue(File.Exists(Path.Combine(saveDir, SaveCodec.KeyMain + ".txt")), "睡觉后存档");
        Shot("report");
        ui.Close();
        yield return Frames(3);
        Assert.IsFalse(s.Clock.Paused, "关掉结算面板后新的一天开始走");
        Shot("day2");
    }
}
