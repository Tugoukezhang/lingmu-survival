// Builds the home island scene (Assets/Scenes/HomeIsland.unity) from the ported layout rules and the Tripo models:
// ground and cliff (IslandTerrain), camp, cottage, farm stand, dock and airship, the 50 trees and 6 rocks at the web
// version's tiles, the player and a pet, the third-person camera, sun, sky, sea of clouds and the colour grading.
// Menu: Lingmu ▸ Build Home Island. Batch: -executeMethod HomeIslandBuilder.BuildAndShoot (pictures in D:\ClaudeTools\unity\).
using System.IO;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.UI;
using Lingmu.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class HomeIslandBuilder
{
    const string ScenePath = "Assets/Scenes/HomeIsland.unity";
    const string Gen = "Assets/Generated/HomeIsland";
    const string Props = "Assets/Art/Props/";
    const string Chars = "Assets/Art/Characters/";

    enum Fit { Width, Height }
    // The Tripo props face -X after import; turned 270° their front looks south (toward the camera at the start). See LingmuTools.Turntable.
    const float FrontSouth = 270;

    [MenuItem("Lingmu/Build Home Island")]
    public static void Build()
    {
        var L = HomeIslandLayout.Generate();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        Directory.CreateDirectory(Gen);

        // ---- light, sky, fog ----
        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional; sun.color = new Color(1f, 0.93f, 0.8f); sun.intensity = 1.9f; sun.shadows = LightShadows.Soft; sun.shadowStrength = 0.75f;
        sun.transform.rotation = Quaternion.Euler(48, -32, 0);
        var sky = SaveMat(new Material(Shader.Find("Skybox/Procedural")), "Sky");
        sky.SetFloat("_SunSize", 0.035f); sky.SetFloat("_AtmosphereThickness", 0.75f); sky.SetColor("_SkyTint", new Color(0.55f, 0.72f, 0.95f));
        sky.SetColor("_GroundColor", new Color(0.93f, 0.96f, 1f)); sky.SetFloat("_Exposure", 1.25f);
        RenderSettings.skybox = sky; RenderSettings.sun = sun;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.72f, 0.82f, 0.95f); RenderSettings.ambientEquatorColor = new Color(0.62f, 0.72f, 0.62f); RenderSettings.ambientGroundColor = new Color(0.4f, 0.47f, 0.33f);
        RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogStartDistance = 32; RenderSettings.fogEndDistance = 95; RenderSettings.fogColor = new Color(0.8f, 0.89f, 0.96f);

        // ---- ground ----
        var island = new GameObject("Island");
        island.AddComponent<IslandTerrain>().seed = L.Seed;
        var walk = island.AddComponent<IslandWalkMap>();
        walk.Init(L);
        var sea = GameObject.CreatePrimitive(PrimitiveType.Plane);
        sea.name = "CloudSea"; Object.DestroyImmediate(sea.GetComponent<Collider>());
        sea.transform.position = new Vector3(25, -8, -17); sea.transform.localScale = new Vector3(60, 1, 60);
        var seaMat = SaveMat(new Material(Shader.Find("Universal Render Pipeline/Unlit")), "CloudSea"); seaMat.SetColor("_BaseColor", new Color(0.93f, 0.96f, 0.98f));
        sea.GetComponent<Renderer>().sharedMaterial = seaMat;

        // ---- props at the web version's tiles ----
        var props = new GameObject("Props").transform;
        var c = L.CottageRect;
        Place(props, Props + "C01_bld_cottage", L.CottageRect.x + c.w / 2f - 0.5f, c.y + c.h / 2f - 0.5f, 4.4f, Fit.Width, FrontSouth); walk.Block(c);
        Place(props, Props + "C07_tent", L.Tent.x, L.Tent.y, 1.8f, Fit.Width, 90); walk.Block(L.Tent.x, L.Tent.y);
        Place(props, Props + "C15_campfire_lit", L.Campfire.x, L.Campfire.y, 1.0f, Fit.Width, 0); walk.Block(L.Campfire.x, L.Campfire.y);
        Place(props, Props + "C10_storage", L.Storage.x, L.Storage.y, 0.95f, Fit.Width, FrontSouth); walk.Block(L.Storage.x, L.Storage.y);
        Place(props, Props + "C11_shipbox", L.ShipBox.x, L.ShipBox.y, 0.95f, Fit.Width, FrontSouth); walk.Block(L.ShipBox.x, L.ShipBox.y);
        Place(props, Props + "C12_seedstand", L.SeedStand.x, L.SeedStand.y, 1.5f, Fit.Width, FrontSouth); walk.Block(L.SeedStand.x, L.SeedStand.y);
        Place(props, Props + "C13_dock", L.DockTile.x, L.DockTile.y + 1.9f, 3.2f, Fit.Width, 90);
        var ship = Place(props, Props + "C05_airship", L.DockTile.x + 2.2f, L.DockTile.y + 2.2f, 3.4f, Fit.Width, 90);
        ship.transform.position += Vector3.up * 0.6f;
        var rnd = new System.Random(L.Seed);
        foreach (var t in L.Trees)
        {
            bool pine = t.kind == "pine";
            Place(props, Props + (pine ? "C39_tree_b" : "C38-C40_tree_round"), t.x, t.y, (pine ? 3.6f : 3.0f) * (0.88f + (float)rnd.NextDouble() * 0.3f), Fit.Height, (float)rnd.NextDouble() * 360);
            walk.Block(t.x, t.y);
        }
        foreach (var r in L.Rocks) { Place(props, Props + "C41_bush", r.x, r.y, 0.9f, Fit.Height, (float)rnd.NextDouble() * 360); walk.Block(r.x, r.y); }   // stand-in until the rock models arrive (C33 / C34)

        // ---- player, pet, camera ----
        var player = new GameObject("Player");
        player.transform.position = HomeIslandLayout.TileToWorld(L.Spawn.x, L.Spawn.y);
        var body = Place(player.transform, Chars + "A01_player_unrigged", L.Spawn.x, L.Spawn.y, 1.35f, Fit.Height, 0);
        body.transform.localPosition = Vector3.zero;
        var mover = player.AddComponent<PlayerMover>(); mover.map = walk; mover.model = body.transform;
        Place(null, Chars + "A02_pup_rig", L.Spawn.x - 1.1f, L.Spawn.y + 0.5f, 0.8f, Fit.Height, 160);

        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        var cam = camGo.AddComponent<Camera>(); cam.fieldOfView = 50; cam.nearClipPlane = 0.1f; cam.farClipPlane = 300;
        var data = camGo.AddComponent<UniversalAdditionalCameraData>(); data.renderPostProcessing = true; data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
        var orbit = camGo.AddComponent<OrbitCamera>(); orbit.target = player.transform;
        mover.cameraTransform = camGo.transform;
        orbit.Snap();

        // ---- colour grading: soft bloom, neutral tone mapping, a little more saturation, light vignette ----
        var volume = new GameObject("Grading").AddComponent<Volume>(); volume.isGlobal = true;
        var profile = ScriptableObject.CreateInstance<VolumeProfile>();
        AssetDatabase.CreateAsset(profile, Gen + "/Grading.asset");
        var bloom = profile.Add<Bloom>(true); bloom.intensity.Override(0.45f); bloom.threshold.Override(0.95f); bloom.scatter.Override(0.7f);
        profile.Add<Tonemapping>(true).mode.Override(TonemappingMode.Neutral);
        var ca = profile.Add<ColorAdjustments>(true); ca.postExposure.Override(0.15f); ca.saturation.Override(14f); ca.contrast.Override(6f);
        profile.Add<Vignette>(true).intensity.Override(0.18f);
        foreach (var comp in profile.components) AssetDatabase.AddObjectToAsset(comp, profile);
        volume.sharedProfile = profile;

        // ---- the game: rules session, farm plots, the screen ----
        var game = new GameObject("Game");
        var session = game.AddComponent<GameSession>(); session.player = player.transform; session.sun = sun;
        game.AddComponent<FarmField>();
        new GameObject("UI").AddComponent<GameUI>();

        EditorSceneManager.SaveScene(scene, ScenePath);
        var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
        scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
        EditorBuildSettings.scenes = scenes.ToArray();
        AssetDatabase.SaveAssets();
        Debug.Log($"[Lingmu] home island built: {L.Trees.Count} trees, {L.Rocks.Count} rocks");
    }

    static Material SaveMat(Material m, string name)
    {
        var path = $"{Gen}/{name}.mat";
        AssetDatabase.DeleteAsset(path);
        AssetDatabase.CreateAsset(m, path);
        return m;
    }

    // Puts a model on a tile (tile centre, web coordinates), scaled so its width or height is `size` metres, standing on the ground.
    static GameObject Place(Transform parent, string folder, float tx, float ty, float size, Fit fit, float yaw)
    {
        var path = $"{folder}/{Path.GetFileName(folder)}.fbx";
        var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (!asset) { Debug.LogWarning("[Lingmu] missing model " + path); return new GameObject("missing " + folder); }
        var g = (GameObject)PrefabUtility.InstantiatePrefab(asset, parent);
        g.transform.rotation = Quaternion.Euler(0, yaw, 0) * g.transform.rotation;      // keep whatever turn the import gave it
        var b = Bounds(g);
        float now = fit == Fit.Height ? b.size.y : Mathf.Max(b.size.x, b.size.z);
        g.transform.localScale *= size / Mathf.Max(now, 1e-4f);
        b = Bounds(g);
        var at = HomeIslandLayout.TileToWorld(tx, ty);
        g.transform.position += new Vector3(at.x - b.center.x, -b.min.y, at.z - b.center.z);
        return g;
    }

    // visible size, also for skinned characters (their renderer bounds include the whole skeleton)
    static Bounds Bounds(GameObject g)
    {
        bool any = false; var bb = new Bounds();
        void Add(Vector3 p) { if (!any) { bb = new Bounds(p, Vector3.zero); any = true; } else bb.Encapsulate(p); }
        foreach (var mf in g.GetComponentsInChildren<MeshFilter>()) if (mf.sharedMesh) foreach (var v in mf.sharedMesh.vertices) Add(mf.transform.TransformPoint(v));
        foreach (var s in g.GetComponentsInChildren<SkinnedMeshRenderer>())
        {
            if (!s.sharedMesh) continue;
            var m = new Mesh(); s.BakeMesh(m, true);
            foreach (var v in m.vertices) Add(s.transform.TransformPoint(v));
            Object.DestroyImmediate(m);
        }
        return bb;
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
            // whole island from high up
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
