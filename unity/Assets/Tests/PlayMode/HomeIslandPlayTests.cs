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

    // The game draws its UI as an overlay after the camera's colour grading. Rendering the canvas through the 3D camera
    // (the old way) graded the UI too and made every panel look grey. Now the scene is rendered on its own, the UI is
    // rendered by a plain camera once over black and once over white, and the two give each pixel's colour and
    // coverage exactly, so the UI is laid over the scene the way the player sees it.
    static void Shot(string name, Canvas canvas = null)
    {
        if (!Directory.Exists(ShotDir)) return;
        canvas ??= Object.FindAnyObjectByType<GameUI>()?.canvas;
        const int W = 1600, H = 900;
        var px = Grab(Camera.main, W, H);
        if (canvas)
        {
            var mode = canvas.renderMode;
            var ui = new GameObject("shot ui camera").AddComponent<Camera>();
            ui.enabled = false; ui.cullingMask = 1 << canvas.gameObject.layer; ui.clearFlags = CameraClearFlags.SolidColor; ui.orthographic = true;
            canvas.renderMode = RenderMode.ScreenSpaceCamera; canvas.worldCamera = ui; canvas.planeDistance = 1;
            ui.backgroundColor = Color.black; var onBlack = Grab(ui, W, H);
            ui.backgroundColor = Color.white; var onWhite = Grab(ui, W, H);
            canvas.renderMode = mode;
            Object.DestroyImmediate(ui.gameObject);
            bool linear = QualitySettings.activeColorSpace == ColorSpace.Linear;
            var toLin = new float[256]; for (int i = 0; i < 256; i++) toLin[i] = linear ? Mathf.GammaToLinearSpace(i / 255f) : i / 255f;
            byte ToByte(float v) => (byte)Mathf.Clamp(Mathf.RoundToInt((linear ? Mathf.LinearToGammaSpace(Mathf.Clamp01(v)) : v) * 255), 0, 255);
            for (int i = 0; i < px.Length; i++)
            {
                Color32 b = onBlack[i], w = onWhite[i], s = px[i];
                if (b.r == 0 && b.g == 0 && b.b == 0 && w.r == 255 && w.g == 255 && w.b == 255) continue;   // no UI here
                float cover = 1 - ((toLin[w.r] - toLin[b.r]) + (toLin[w.g] - toLin[b.g]) + (toLin[w.b] - toLin[b.b])) / 3f;
                float k = 1 - Mathf.Clamp01(cover);
                px[i] = new Color32(ToByte(toLin[b.r] + toLin[s.r] * k), ToByte(toLin[b.g] + toLin[s.g] * k), ToByte(toLin[b.b] + toLin[s.b] * k), 255);
            }
        }
        var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
        tex.SetPixels32(px); tex.Apply();
        File.WriteAllBytes(Path.Combine(ShotDir, $"ui_{name}.png"), tex.EncodeToPNG());
        Object.Destroy(tex);
    }

    static Color32[] Grab(Camera cam, int w, int h)
    {
        var rt = new RenderTexture(w, h, 24);
        cam.targetTexture = rt;
        Canvas.ForceUpdateCanvases();
        for (int i = 0; i < 4; i++) cam.Render();   // first frames on this PC can come out with the wrong textures
        RenderTexture.active = rt;
        var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, w, h), 0, 0); tex.Apply();
        RenderTexture.active = null; cam.targetTexture = null; rt.Release();
        var px = tex.GetPixels32();
        Object.Destroy(tex);
        return px;
    }

    static IEnumerator Frames(int n) { for (int i = 0; i < n; i++) yield return null; }
    static IEnumerator Load(string scene) { SceneManager.LoadScene(scene); yield return Frames(6); }
    static IEnumerator WaitArea(string id) { for (int i = 0; i < 120 && (GameSession.I == null || GameSession.I.Area == null || GameSession.I.Area.Id != id); i++) yield return null; yield return Frames(4); }
    static void Click(string label) { var b = Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(x => x.name == "button " + label && x.isActiveAndEnabled); Assert.IsNotNull(b, "按钮 " + label); b.onClick.Invoke(); }
    static void Stand(Vector3 at) { var p = GameSession.I.player; p.position = new Vector3(at.x, p.position.y, at.z); }

    // the look of the world from a few camera angles, without the HUD (docs/18: scene step; owner 11-21 feedback)
    [UnityTest] public IEnumerator 画面()
    {
        var st = SaveRules.NewGameState(starter: "fox"); st.clock = 10 * 60;
        GameSession.UseState(st);
        yield return Load("HomeIsland");
        var cam = Object.FindAnyObjectByType<Lingmu.Player.OrbitCamera>();
        var ui = Object.FindAnyObjectByType<GameUI>(); if (ui) ui.canvas.enabled = false;
        float[] yaws = { 0, 2.4f, 4.2f };
        for (int i = 0; i < yaws.Length; i++) { cam.yaw = yaws[i]; cam.Snap(); yield return new WaitForSeconds(0.4f); Shot("look_home_" + i); }
        cam.pitch = 0.2f; cam.yaw = 1.2f; cam.Snap(); yield return new WaitForSeconds(0.4f); Shot("look_home_low");
        // the round-2 hero up close (docs/21): both sides, then walking
        var L = ((HomeArea)GameSession.I.Area).Layout;
        Stand(HomeIslandLayout.TileToWorld(L.CottageRect.x + L.CottageRect.w / 2f - 0.5f, L.CottageRect.y + L.CottageRect.h + 3f));
        cam.distance = 3.0f; cam.pitch = 0.16f;
        for (int k = 0; k < 4; k++) { cam.yaw = k * Mathf.PI / 2; cam.Snap(); yield return new WaitForSeconds(0.5f); Shot("hero_" + k); }
        cam.yaw = 0.8f; cam.Snap();
        Lingmu.Player.PlayerMover.Stick = new Vector2(0.6f, -0.8f); yield return new WaitForSeconds(0.7f); Shot("hero_walk");
        Lingmu.Player.PlayerMover.Stick = Vector2.zero; yield return new WaitForSeconds(0.4f);
        // action clips: the hero's body follows what the player does (chop strike, bending to pick up, net throw)
        var mv = GameSession.I.player.GetComponent<Lingmu.Player.PlayerMover>();
        Assert.IsTrue(GameSession.I.HeroAction("chop", 1.2f, 1.8f), "主角动作：砍树");
        Assert.IsTrue(mv.Acting, "做动作时站定");
        yield return new WaitForSeconds(0.55f); Shot("hero_chop_a"); yield return new WaitForSeconds(0.45f); Shot("hero_chop_b");
        GameSession.I.HeroAction("pick_up", 0.2f, 1.8f); yield return new WaitForSeconds(0.85f); Shot("hero_pick");
        GameSession.I.HeroAction("net_throw", 0f, 1.5f, "cheer", 0.3f, 1.8f); yield return new WaitForSeconds(0.7f); Shot("hero_net");
        yield return new WaitForSeconds(1.6f); Shot("hero_cheer");
        yield return new WaitForSeconds(1.8f); Assert.IsFalse(mv.Acting, "动作做完回到待机");
        // the round-2 fox next to the hero
        var fox = ModelLibrary.Place("pet_fox", null, GameSession.I.player.position + new Vector3(0.9f, 0, 0), 0.65f, true, 0);
        cam.yaw = Mathf.PI; cam.distance = 2.6f; cam.Snap(); yield return new WaitForSeconds(0.5f); Shot("pet_fox_0");
        cam.yaw = Mathf.PI * 1.5f; cam.Snap(); yield return new WaitForSeconds(0.5f); Shot("pet_fox_1");
        Object.Destroy(fox);
        cam.distance = 6.875f;
        var ex = SaveRules.NewGameState(starter: "fox"); ex.day = 3; Travel.Depart(ex, "new"); ex.clock = 10 * 60;
        GameSession.ForgetState(); GameSession.UseState(ex);          // like pressing 继续 on the title page: no session yet
        yield return Load("Expedition");
        Assert.IsNotNull(((ExpeditionArea)GameSession.I.Area).Island, "从标题页直接进远征岛：岛上东西都要生成");
        Assert.IsTrue(Object.FindObjectsByType<WildPet>(FindObjectsSortMode.None).Length > 0, "远征岛上有野生宠物");
        cam = Object.FindAnyObjectByType<Lingmu.Player.OrbitCamera>();
        ui = Object.FindAnyObjectByType<GameUI>(); if (ui) ui.canvas.enabled = false;
        foreach (var w in Object.FindObjectsByType<WildPet>(FindObjectsSortMode.None)) w.cooldown = Time.time + 999;
        cam.yaw = 3.1f; cam.Snap(); yield return new WaitForSeconds(0.5f); Shot("look_exp_0");
        cam.yaw = 0.6f; cam.pitch = 0.26f; cam.Snap(); yield return new WaitForSeconds(0.4f); Shot("look_exp_1");
        GameSession.I.S.clock = 18 * 60 + 40; GameSession.I.ApplyLight(); yield return new WaitForSeconds(0.4f); Shot("look_exp_dusk");
    }

    [UnityTest] public IEnumerator 标题页()
    {
        yield return Load("Title");
        var t = Object.FindAnyObjectByType<TitleUI>();
        Assert.IsNotNull(t, "标题页");
        yield return new WaitForSeconds(0.3f); Shot("title_advice", t.canvas);
        yield return new WaitForSeconds(2.6f);                         // the healthy-gaming notice moves on by itself
        yield return new WaitForSeconds(3f); Shot("title", t.canvas);   // the push-in has mostly settled
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
        yield return Frames(2);
        Assert.IsTrue(Object.FindObjectsByType<RectTransform>(FindObjectsSortMode.None).Any(r => r.name == "goal" && r.gameObject.activeInHierarchy), "新档：目标纸条在");
        Assert.IsTrue(Object.FindObjectsByType<RectTransform>(FindObjectsSortMode.None).Any(r => (r.name == "goal mark" || r.name == "goal arrow") && r.gameObject.activeInHierarchy), "新档：指路标记指向码头");
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
        ui.Open("goals"); yield return null; Shot("goals"); ui.Close();
        ui.Open("bag");
        int clock = s.S.clock;
        yield return new WaitForSeconds(1.2f);
        Assert.AreEqual(clock, s.S.clock, "打开背包时时间暂停");
        Shot("bag");
        ui.Close();
        // storage: tap a stack in the chest and it comes back to the bag; shipping box; seed stand
        s.S.storage = new System.Collections.Generic.List<ItemStack> { new ItemStack("item_wood", 12), new ItemStack("item_stone", 6), new ItemStack("item_crystal", 2) };
        int wood = Inventory.CountOf(s.S.inventory, "item_wood");
        ui.Open("storage"); yield return null; Shot("storage");
        Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(x => x.name == "slot item_wood" && x.GetComponentInParent<ScrollRect>().name == "grid chest").onClick.Invoke();
        yield return null;
        Assert.AreEqual(wood + 12, Inventory.CountOf(s.S.inventory, "item_wood"), "仓库：点一格，整堆木材回到背包");
        ui.Close();
        s.Ship("item_berry", 2);
        ui.Open("ship"); yield return null; Shot("ship"); ui.Close();
        ui.Open("seeds"); yield return null; Shot("seeds"); ui.Close();
        ui.Open("craft"); yield return null; Shot("craft"); ui.Close();
        // partner panel: the three tabs, learning from a skill book, the dex
        s.S.inventory.Add(new ItemStack("item_book_puff", 1));
        ui.OpenParty("care"); yield return null; Shot("party");
        ui.OpenParty("skills"); yield return null; Shot("party_skills");
        var lead = s.S.Pet(s.S.party[0]); int known = lead.skills.Count;
        s.LearnSkill(lead.uid, "item_book_puff", known);
        Assert.IsTrue(lead.skills.Contains("puff") && lead.skills.Count == known + 1 && Inventory.CountOf(s.S.inventory, "item_book_puff") == 0, "伙伴面板：用技能书学会毛茸茸");
        ui.OpenParty("growth"); yield return null; Shot("party_growth");
        ui.Open("dex"); yield return null; Shot("dex"); ui.Close();
        ui.Celebrate(Resources.Load<Sprite>("Icons/Pets/pet_fox_evo"), "进化成功！", "灯焰狐学会了新技能，属性也变强了"); yield return new WaitForSecondsRealtime(0.4f);
        Shot("celebrate"); Click("继续"); yield return null;
        ui.Ask("去新的浮岛？", "上次的岛上还有失物包（3 件）。\n去新的岛，失物包就找不回来了。", "还是去新的", () => { }); yield return null;
        Shot("confirm"); ui.Close();
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
        yield return Frames(2);
        Assert.IsTrue(Object.FindObjectsByType<SpriteRenderer>(FindObjectsSortMode.None).Any(r => r.name == "action ring" && r.gameObject.activeInHierarchy), "能互动的东西脚下有光圈");
        Shot("gather_ring");
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
        // before the fog: the strip slides in (19:00 at the latest), with the way back to the airship
        Stand(ex.ArrivePoint(s.S));
        s.S.clock = 19 * 60 + 2; s.ApplyLight();
        yield return new WaitForSecondsRealtime(0.6f);
        Assert.IsTrue(Object.FindObjectsByType<RectTransform>(FindObjectsSortMode.None).Any(r => r.name == "fog strip" && r.gameObject.activeInHierarchy), "19 点：起雾提醒");
        Shot("fog_strip");
        Click("指路回飞艇"); yield return new WaitForSecondsRealtime(0.3f);
        Shot("fog_follow");
        // the night: fog, monsters
        Stand(ex.ArrivePoint(s.S));
        s.S.clock = 20 * 60 + 15; s.ApplyLight();
        yield return new WaitForSeconds(1.5f);
        Assert.IsTrue(Object.FindObjectsByType<Transform>(FindObjectsSortMode.None).Any(t => t.name == "fog monster"), "20:10 后雾怪出现");
        Shot("night");
        // a campfire for the night: the camp card
        s.Use("item_campfire"); yield return null;
        var fireSpot = s.CurrentSpot();
        if (fireSpot?.kind == "fire") { var panel = s.Act(fireSpot); if (panel != null) { exUi.Open(panel); yield return new WaitForSecondsRealtime(0.3f); Shot("camp"); exUi.Close(); } }
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
        var pool = GameObject.Find("fountain pool");                  // the fountain and its rippling pool, seen from a little above
        Assert.IsNotNull(pool, "喷泉池水面");
        yield return new WaitForSeconds(0.6f);
        var cam = Camera.main.transform; var (camPos, camRot) = (cam.position, cam.rotation);
        cam.position = pool.transform.position + new Vector3(0, 2.6f, -3.6f); cam.LookAt(pool.transform.position + Vector3.up * 0.5f);
        Shot("town_fountain");
        cam.SetPositionAndRotation(camPos, camRot);
        var granny = TownArea.Houses[0];
        Stand(HomeIslandLayout.TileToWorld(granny.sx, granny.sy + 2.5f)); yield return new WaitForSeconds(1.2f);   // she turns to look at the player
        Shot("town_granny");
        Stand(HomeIslandLayout.TileToWorld(granny.sx, granny.sy + 1)); yield return null;
        Assert.AreEqual("npc", s.CurrentSpot()?.kind, "站在铃奶奶面前：聊天");
        ui.OpenNpc("granny"); yield return null;
        Assert.AreEqual(1, Town.FriendOf(s.S, "granny"), "第一次聊天好感 +1");
        yield return new WaitForSecondsRealtime(1.6f);   // the line types out
        Shot("town_npc");
        ui.Open("npc:granny"); // 送礼 and 委托 boxes
        Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(x => x.name == "button 委托").onClick.Invoke(); yield return new WaitForSecondsRealtime(0.3f);
        Shot("town_npc_quest");
        Object.FindObjectsByType<Button>(FindObjectsSortMode.None).First(x => x.name.StartsWith("button 送礼")).onClick.Invoke(); yield return new WaitForSecondsRealtime(0.3f);
        Shot("town_npc_gift");
        ui.Close();
        ui.Open("shop"); yield return null; Shot("shop"); ui.Close();
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
        var hui = Object.FindAnyObjectByType<GameUI>();
        hui.Open("decorate"); yield return new WaitForSecondsRealtime(0.3f); Shot("decorate");
        Click("已摆好  3"); yield return null; Shot("decorate_placed"); hui.Close();
    }
}
