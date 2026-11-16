// Builds the home island scene (Assets/Scenes/HomeIsland.unity) from the ported layout rules and the Tripo models:
// ground and cliff (IslandTerrain), camp, cottage, farm stand, dock and airship, the 50 trees and 6 rocks at the web
// version's tiles, the player, the third-person camera, sun, sky, sea of clouds, colour grading, the game and the screen.
// Menu: Lingmu ▸ Build Home Island. Batch: -executeMethod HomeIslandBuilder.BuildAndShoot (pictures in D:\ClaudeTools\unity\).
using System.IO;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using static SceneKit;

public static class HomeIslandBuilder
{
    [MenuItem("Lingmu/Build Home Island")]
    public static void Build()
    {
        var L = HomeIslandLayout.Generate();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var gen = Folder("HomeIsland");
        var sun = SkyAndSun(gen);

        // ---- ground ----
        var island = new GameObject("Island");
        island.AddComponent<IslandTerrain>().seed = L.Seed;
        var walk = island.AddComponent<IslandWalkMap>();
        walk.Init(L);
        CloudSea(gen, new Vector3(25, 0, -17), 26);

        // ---- props at the web version's tiles ----
        var props = new GameObject("Props").transform;
        var c = L.CottageRect;
        Place(props, Props + "C01_bld_cottage", L.CottageRect.x + c.w / 2f - 0.5f, c.y + c.h / 2f - 0.5f, 4.4f, Fit.Width, FrontSouth); walk.Block(c);
        Place(props, Props + "C07_tent", L.Tent.x, L.Tent.y, 1.8f, Fit.Width, 90); walk.Block(L.Tent.x, L.Tent.y);
        var fire = Place(props, Props + "C15_campfire_lit", L.Campfire.x, L.Campfire.y, 1.0f, Fit.Width, 0); walk.Block(L.Campfire.x, L.Campfire.y);
        SceneKit.AddFire(fire);
        Place(props, Props + "C10_storage", L.Storage.x, L.Storage.y, 0.95f, Fit.Width, FrontSouth); walk.Block(L.Storage.x, L.Storage.y);
        Place(props, Props + "C11_shipbox", L.ShipBox.x, L.ShipBox.y, 0.95f, Fit.Width, FrontSouth); walk.Block(L.ShipBox.x, L.ShipBox.y);
        Place(props, Props + "C12_seedstand", L.SeedStand.x, L.SeedStand.y, 1.5f, Fit.Width, FrontSouth); walk.Block(L.SeedStand.x, L.SeedStand.y);
        Place(props, Props + "C13_dock", L.DockTile.x, L.DockTile.y + 1.9f, 3.2f, Fit.Width, 90);
        var ship = Place(props, Props + "C05_airship", L.DockTile.x + 2.2f, L.DockTile.y + 2.2f, 3.4f, Fit.Width, 90);
        ship.transform.position += Vector3.up * 0.6f;
        var rnd = new System.Random(L.Seed);
        // trees and rocks that the layout put on or right next to a path are left out: their blocked tile would stop
        // the player in the middle of the path (the canopy hides the trunk, so it felt like an invisible wall)
        var shape = IslandShape.Home(L);
        bool OffPath(PlacedProp p) => shape.PathClearance(new Vector2(p.x + 0.5f, p.y + 0.5f)) > 0.9f;
        int dropped = L.Trees.Count(t => !OffPath(t)) + L.Rocks.Count(r => !OffPath(r));
        foreach (var t in L.Trees.Where(OffPath))
        {
            bool pine = t.kind == "pine";
            Place(props, Props + (pine ? "C39_tree_b" : "C38-C40_tree_round"), t.x, t.y, (pine ? 3.6f : 3.0f) * (0.88f + (float)rnd.NextDouble() * 0.3f), Fit.Height, (float)rnd.NextDouble() * 360);
            walk.Block(t.x, t.y);
        }
        foreach (var r in L.Rocks.Where(OffPath))                           // rocks made in code (StoneKit), built when the game starts
        {
            var rock = new GameObject("rock").AddComponent<RockView>(); rock.transform.SetParent(props, false);
            rock.transform.position = HomeIslandLayout.TileToWorld(r.x, r.y); rock.seed = r.x * 131 + r.y * 17 + L.Seed % 97; rock.size = r.kind == "rock_b" ? 0.8f : 1.05f;
            walk.Block(r.x, r.y);
        }
        LingmuScenes.RopeBridge(props, L.BridgeTile.x + 0.5f, L.BridgeTile.y, 1);
        LingmuScenes.Fence(props, L.ExpandRect.x, L.ExpandRect.y, L.ExpandRect.w, L.ExpandRect.h);
        var grass = island.AddComponent<GrassField>(); grass.seed = L.Seed;   // 3D grass and flowers (built when the game starts)

        // ---- player, camera, grading, the game ----
        var (player, mover) = MakePlayer(HomeIslandLayout.TileToWorld(L.Spawn.x, L.Spawn.y), walk);
        MakeCamera(player, mover);
        Grading(gen);
        var area = new GameObject("Home").AddComponent<HomeArea>(); area.walk = walk;
        var session = AddGame(player, sun);
        session.gameObject.AddComponent<FarmField>();
        SaveScene(scene, "HomeIsland");
        Debug.Log($"[Lingmu] home island built: {L.Trees.Count} trees, {L.Rocks.Count} rocks, {dropped} left out (on a path)");
    }

    // ---------- pictures for checking from the command line ----------
    public static void BuildAndShoot()
    {
        bool batcher = GraphicsSettings.useScriptableRenderPipelineBatching;
        GraphicsSettings.useScriptableRenderPipelineBatching = false;     // see LingmuTools.Shoot
        try
        {
            Build();
            var cam = Camera.main; var orbit = cam.GetComponent<OrbitCamera>();
            orbit.Snap();
            Save(cam, "home_player.png");
            orbit.yaw = 2.6f; orbit.pitch = 0.5f; orbit.Snap();
            Save(cam, "home_player_back.png");
            orbit.yaw = 0; orbit.pitch = 0.42f; orbit.Snap();
            var t = cam.transform; var keep = (t.position, t.rotation); orbit.enabled = false;
            t.position = new Vector3(25, 26, -48); t.LookAt(new Vector3(25, 0, -18));
            Save(cam, "home_overview.png");
            t.position = keep.position; t.rotation = keep.rotation; orbit.enabled = true;
        }
        finally { GraphicsSettings.useScriptableRenderPipelineBatching = batcher; }
    }

    static void Save(Camera cam, string file)
    {
        var rt = new RenderTexture(1600, 900, 24) { antiAliasing = 4 };
        cam.targetTexture = rt;
        LingmuTools.Shoot(cam);
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); tex.Apply();
        File.WriteAllBytes(@"D:\ClaudeTools\unity\" + file, tex.EncodeToPNG());
        RenderTexture.active = null; cam.targetTexture = null; Object.DestroyImmediate(rt);
    }
}
