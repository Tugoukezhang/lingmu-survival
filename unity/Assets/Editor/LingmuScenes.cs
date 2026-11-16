// Builds the other scenes of the game from code: the title page, the expedition island (its ground and things are
// made at runtime from the save's seed), 风铃小镇 and the cottage room. BuildAll rebuilds everything in build order.
//   Unity.exe -batchmode -force-d3d11 -projectPath unity -executeMethod LingmuScenes.BuildAll -quit
using Lingmu.Game;
using Lingmu.UI;
using Lingmu.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using static SceneKit;

public static class LingmuScenes
{
    [MenuItem("Lingmu/Build All Scenes")]
    public static void BuildAll()
    {
        // models whose import settings or files changed: import them again (player texture name, pets as Generic)
        foreach (var f in new[] { "A01_player_rig", "A00_fox_rig", "A02_pup_rig", "A04_shark_rig", "A05_starbear_rig", "A06_shadecat_rig" }) AssetDatabase.ImportAsset($"{Chars}{f}/{f}.fbx", ImportAssetOptions.ForceUpdate);
        LingmuModelImport.FixClips();
        UpdateLibrary();
        BuildTitle();
        HomeIslandBuilder.Build();
        BuildExpedition();
        BuildTown();
        BuildHouse();
        Debug.Log("[Lingmu] all scenes built");
    }

    static UnityEngine.SceneManagement.Scene NewScene() => EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

    [MenuItem("Lingmu/Build Title")]
    public static void BuildTitle()
    {
        var scene = NewScene();
        var cam = new GameObject("Main Camera") { tag = "MainCamera" }.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.75f, 0.89f, 0.95f);
        new GameObject("Title").AddComponent<TitleUI>();
        SaveScene(scene, "Title");
    }

    [MenuItem("Lingmu/Build Expedition")]
    public static void BuildExpedition()
    {
        var scene = NewScene();
        var gen = Folder("Expedition");
        var sun = SkyAndSun(gen);
        CloudSea(gen, new Vector3(20, 0, -15));
        var (player, mover) = MakePlayer(new Vector3(20, 0, -20), null);
        MakeCamera(player, mover);
        Grading(gen);
        new GameObject("Expedition").AddComponent<ExpeditionArea>();   // makes the island from the save at runtime
        AddGame(player, sun);
        SaveScene(scene, "Expedition");
    }

    [MenuItem("Lingmu/Build Town")]
    public static void BuildTown()
    {
        var scene = NewScene();
        var gen = Folder("Town");
        var sun = SkyAndSun(gen);
        int W = TownArea.W, H = TownArea.H;
        var (east, north) = TownArea.Bridges();
        var plaza = new Vector2(W / 2f, H / 2f);
        var shape = new IslandShape { cols = W, rows = H, seed = 777, land = TownArea.Land, meadow = plaza - new Vector2(0.5f, 0.5f) };
        shape.curves.Add((new Vector2(east.x + 0.5f, east.y + 0.5f), plaza, 0.04f, 1.0f));
        shape.curves.Add((plaza + new Vector2(-2.2f, 0), plaza + new Vector2(2.2f, 0), 0, -3.6f));
        shape.curves.Add((plaza, new Vector2(north.x + 0.5f, north.y + 0.5f), 0, 0.9f));
        foreach (var h in TownArea.Houses) shape.curves.Add((plaza, new Vector2(h.sx + 0.5f, h.sy + 0.5f), 0.1f, 0.9f));
        var ground = new GameObject("Island"); ground.SetActive(false);
        ground.AddComponent<IslandTerrain>().shape = shape;
        ground.SetActive(true);
        var walk = ground.AddComponent<IslandWalkMap>();
        walk.Init(W, H, TownArea.Land);
        ground.AddComponent<GrassField>().seed = 777;
        CloudSea(gen, new Vector3(W / 2f, 0, -H / 2f));
        var props = new GameObject("Props").transform;
        foreach (var h in TownArea.Houses)
        {
            Place(props, Props + (h.npc == "granny" ? "C02_bld_shop_granny" : h.npc == "ali" ? "C03_bld_workshop" : "C04_bld_lab"), h.x + h.w / 2f - 0.5f, h.y + h.h / 2f - 0.5f, 4.6f, Fit.Width, h.yaw);
            for (int y = h.y; y < h.y + h.h; y++) for (int x = h.x; x < h.x + h.w; x++) walk.Block(x, y);
            var who = h.npc == "granny" ? "B01_npc_granny" : h.npc == "ali" ? "B02_npc_ali" : "B03_npc_lumi";
            Place(props, Chars + who, h.sx, h.sy, 1.3f, Fit.Height, h.y < H / 2 ? 0 : 180);
            walk.Block(h.sx, h.sy);
        }
        Place(props, Props + "C06_fountain", plaza.x - 0.5f, plaza.y - 0.5f, 2.2f, Fit.Width, 0);
        foreach (var (fx, fy) in new[] { (-1, -1), (0, -1), (-1, 0), (0, 0) }) walk.Block((int)plaza.x + fx, (int)plaza.y + fy);
        foreach (var (dx, dy) in new[] { (-5.5f, -3f), (5.5f, -3f), (-5.5f, 3f), (5.5f, 3f) })
        {
            float lx = plaza.x + dx - 0.5f, ly = plaza.y + dy - 0.5f;
            var lamp = Place(props, Props + "C14_lamp", lx, ly, 1.8f, Fit.Height, 0);
            var l = new GameObject("lamp light").AddComponent<Light>(); l.transform.SetParent(lamp.transform, false);
            l.transform.position = HomeIslandLayout.TileToWorld(lx, ly) + Vector3.up * 1.6f; l.type = LightType.Point; l.color = new Color(1f, 0.8f, 0.5f); l.range = 5; l.intensity = 1.2f; l.shadows = LightShadows.None;
            walk.Block(Mathf.FloorToInt(lx + 0.5f), Mathf.FloorToInt(ly + 0.5f));
        }
        RopeBridge(props, east.x + 0.5f, east.y, 1);
        RopeBridge(props, north.x, north.y - 0.5f, 0, broken: true);
        var (player, mover) = MakePlayer(HomeIslandLayout.TileToWorld(east.x - 1, east.y), walk);
        MakeCamera(player, mover);
        Grading(gen);
        var area = new GameObject("Town").AddComponent<TownArea>(); area.walk = walk;
        AddGame(player, sun);
        SaveScene(scene, "Town");
    }

    [MenuItem("Lingmu/Build House")]
    public static void BuildHouse()
    {
        var scene = NewScene();
        var gen = Folder("House");
        var sun = SkyAndSun(gen, indoor: true);
        int cols = HouseArea.Cols, rows = HouseArea.Rows, rw = Lingmu.Rules.House.RoomW, rh = Lingmu.Rules.House.RoomH;
        var room = new GameObject("Room").transform;
        var walk = room.gameObject.AddComponent<IslandWalkMap>();
        walk.Init(cols, rows, (x, y) => x >= HouseArea.OX && x < HouseArea.OX + rw && y >= HouseArea.OY && y < HouseArea.OY + rh);
        Material M(string n, Color c) { var m = SaveMat(new Material(Shader.Find("Universal Render Pipeline/Lit")), gen, n); m.SetColor("_BaseColor", c); m.SetFloat("_Smoothness", 0.15f); return m; }
        var floorM = M("Floor", new Color(0.78f, 0.58f, 0.38f)); var plankM = M("Plank", new Color(0.7f, 0.5f, 0.32f)); var wallM = M("Wall", new Color(0.96f, 0.9f, 0.78f)); var trimM = M("Trim", new Color(0.55f, 0.36f, 0.22f));
        var bedM = M("Bed", new Color(0.92f, 0.5f, 0.45f)); var sheetM = M("Sheet", new Color(0.98f, 0.96f, 0.9f)); var boardM = M("Board", new Color(0.48f, 0.32f, 0.2f));
        GameObject Box(string n, Material m, Vector3 centre, Vector3 size) { var g = GameObject.CreatePrimitive(PrimitiveType.Cube); g.name = n; g.transform.SetParent(room, false); g.transform.position = centre; g.transform.localScale = size; g.GetComponent<Renderer>().sharedMaterial = m; Object.DestroyImmediate(g.GetComponent<Collider>()); return g; }
        Vector3 C(float x, float y) => HouseArea.Cell(x, y);
        var mid = (C(0, 0) + C(rw - 1, rh - 1)) / 2;
        var floor = Box("floor", floorM, mid + Vector3.down * 0.05f, new Vector3(rw, 0.1f, rh));
        floor.AddComponent<BoxCollider>();   // the camera keeps clear of it
        for (int i = 0; i < rh; i += 2) Box("plank", plankM, new Vector3(mid.x, 0.002f, C(0, i).z), new Vector3(rw, 0.004f, 0.06f));
        Box("wall north", wallM, new Vector3(mid.x, 1.5f, C(0, -0.5f).z - 0.1f), new Vector3(rw + 0.4f, 3, 0.2f));
        Box("wall west", wallM, new Vector3(C(-0.5f, 0).x - 0.1f, 1.5f, mid.z), new Vector3(0.2f, 3, rh + 0.4f));
        Box("wall east", wallM, new Vector3(C(rw - 0.5f, 0).x + 0.1f, 1.5f, mid.z), new Vector3(0.2f, 3, rh + 0.4f));
        Box("skirting", trimM, new Vector3(mid.x, 0.08f, C(0, -0.5f).z), new Vector3(rw, 0.16f, 0.06f));
        // front wall low, so the camera sees in; a gap for the door at cells 5–6
        float fz = C(0, rh - 0.5f).z + 0.1f;
        Box("wall south left", wallM, new Vector3(C(2f, 0).x, 0.35f, fz), new Vector3(5, 0.7f, 0.2f));
        Box("wall south right", wallM, new Vector3(C(9f, 0).x, 0.35f, fz), new Vector3(5, 0.7f, 0.2f));
        Box("door mat", trimM, new Vector3(C(5.5f, 0).x, 0.01f, C(0, rh - 0.4f).z), new Vector3(1.6f, 0.02f, 0.6f));
        // bed (TEMPORARY boxes) top left, decorate board on the north wall
        Box("bed frame", trimM, (C(0, 0) + C(1, 1)) / 2 + Vector3.up * 0.2f, new Vector3(1.8f, 0.4f, 1.9f));
        Box("bed sheet", bedM, (C(0, 0) + C(1, 1)) / 2 + new Vector3(0, 0.45f, -0.15f), new Vector3(1.7f, 0.12f, 1.4f));
        Box("pillow", sheetM, (C(0, 0) + C(1, 0)) / 2 + new Vector3(0, 0.5f, 0.1f), new Vector3(1.2f, 0.16f, 0.45f));
        Box("decorate board", boardM, new Vector3(C(8f, 0).x, 1.4f, C(0, -0.5f).z + 0.02f), new Vector3(1.4f, 0.9f, 0.06f));
        var lamp = new GameObject("room light").AddComponent<Light>(); lamp.type = LightType.Point; lamp.transform.position = mid + Vector3.up * 2.6f; lamp.range = 12; lamp.intensity = 1.4f; lamp.color = new Color(1f, 0.88f, 0.72f); lamp.shadows = LightShadows.Soft;
        var (player, mover) = MakePlayer(C(5.5f, rh - 1.2f), walk);
        MakeCamera(player, mover, 5.2f, 0.62f);
        Grading(gen);
        var area = new GameObject("House").AddComponent<HouseArea>(); area.walk = walk;
        AddGame(player, sun, indoor: true);
        SaveScene(scene, "House");
    }

    // ---------- small builds shared by the scenes (TEMPORARY until the bridge / fence models arrive: C29 …) ----------
    // dir 1 = rope bridge going east from (tx, ty); dir 0 = going north. broken: a gap in the middle.
    public static void RopeBridge(Transform parent, float tx, float ty, int dir, bool broken = false)
    {
        var plank = new Material(Shader.Find("Universal Render Pipeline/Lit")); plank.SetColor("_BaseColor", new Color(0.62f, 0.43f, 0.27f));
        var rope = new Material(Shader.Find("Universal Render Pipeline/Lit")); rope.SetColor("_BaseColor", new Color(0.85f, 0.75f, 0.55f));
        var root = new GameObject(broken ? "broken bridge" : "rope bridge").transform; root.SetParent(parent, false);
        var start = HomeIslandLayout.TileToWorld(tx, ty);
        var along = dir == 1 ? Vector3.right : Vector3.forward; var side = dir == 1 ? Vector3.forward : Vector3.right;
        for (int i = 0; i < 9; i++)
        {
            if (broken && (i == 4 || i == 5)) continue;
            var p = GameObject.CreatePrimitive(PrimitiveType.Cube); Object.DestroyImmediate(p.GetComponent<Collider>());
            p.transform.SetParent(root, false);
            float sag = Mathf.Sin(i / 8f * Mathf.PI) * 0.25f;
            p.transform.position = start + along * (0.3f + i * 0.45f) + Vector3.down * (0.05f + sag);
            p.transform.localScale = dir == 1 ? new Vector3(0.36f, 0.06f, 1.1f) : new Vector3(1.1f, 0.06f, 0.36f);
            p.GetComponent<Renderer>().sharedMaterial = plank;
        }
        foreach (var s in new[] { -0.55f, 0.55f })
            for (int i = 0; i < 2; i++)
            {
                var post = GameObject.CreatePrimitive(PrimitiveType.Cylinder); Object.DestroyImmediate(post.GetComponent<Collider>());
                post.transform.SetParent(root, false); post.transform.position = start + side * s + along * (i * 4.1f) + Vector3.up * 0.35f; post.transform.localScale = new Vector3(0.1f, 0.4f, 0.1f);
                post.GetComponent<Renderer>().sharedMaterial = rope;
            }
    }

    public static void Fence(Transform parent, int x, int y, int w, int h)
    {
        var wood = new Material(Shader.Find("Universal Render Pipeline/Lit")); wood.SetColor("_BaseColor", new Color(0.55f, 0.36f, 0.22f));
        var root = new GameObject("expansion fence").transform; root.SetParent(parent, false);
        var a = HomeIslandLayout.TileToWorld(x - 0.5f, y - 0.5f); var b = HomeIslandLayout.TileToWorld(x + w - 0.5f, y + h - 0.5f);
        void Post(Vector3 p) { var g = GameObject.CreatePrimitive(PrimitiveType.Cube); Object.DestroyImmediate(g.GetComponent<Collider>()); g.transform.SetParent(root, false); g.transform.position = p + Vector3.up * 0.3f; g.transform.localScale = new Vector3(0.12f, 0.6f, 0.12f); g.GetComponent<Renderer>().sharedMaterial = wood; }
        void Rail(Vector3 p, Vector3 q) { var g = GameObject.CreatePrimitive(PrimitiveType.Cube); Object.DestroyImmediate(g.GetComponent<Collider>()); g.transform.SetParent(root, false); g.transform.position = (p + q) / 2 + Vector3.up * 0.42f; g.transform.localScale = new Vector3(Mathf.Abs(q.x - p.x) + 0.08f, 0.08f, Mathf.Abs(q.z - p.z) + 0.08f); g.GetComponent<Renderer>().sharedMaterial = wood; }
        var c = new[] { a, new Vector3(b.x, 0, a.z), b, new Vector3(a.x, 0, b.z) };
        for (int i = 0; i < 4; i++) { Rail(c[i], c[(i + 1) % 4]); int n = Mathf.RoundToInt(Vector3.Distance(c[i], c[(i + 1) % 4])); for (int k = 0; k < n; k++) Post(Vector3.Lerp(c[i], c[(i + 1) % 4], k / (float)n)); }
    }
}
