// Shared pieces for building the game's scenes from code: sun and sky, cloud sea, putting a model on a tile, the player
// (rigged, with an idle ↔ walk animator), the third-person camera, colour grading, the game session and the screen,
// the runtime model library (Resources/ModelLibrary.asset) and saving scenes into the build in the right order.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.UI;
using Lingmu.World;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class SceneKit
{
    public const string Props = "Assets/Art/Props/";
    public const string Chars = "Assets/Art/Characters/";
    public const string Gen = "Assets/Generated";
    public const float FrontSouth = 90;    // Tripo props face +X after import (measured from where their porches / awnings lean); turned 90° their front looks south
    public static readonly string[] BuildOrder = { "Title", "HomeIsland", "Expedition", "Town", "House" };

    public enum Fit { Width, Height }

    public static string Folder(string name) { var d = $"{Gen}/{name}"; Directory.CreateDirectory(d); return d; }

    public static Material SaveMat(Material m, string folder, string name)
    {
        var path = $"{folder}/{name}.mat";
        AssetDatabase.DeleteAsset(path);
        AssetDatabase.CreateAsset(m, path);
        return m;
    }

    // ---------- light, sky, clouds ----------
    public static Light SkyAndSun(string folder, bool indoor = false)
    {
        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional; sun.color = new Color(1f, 0.93f, 0.8f); sun.intensity = indoor ? 1.1f : 1.9f; sun.shadows = LightShadows.Soft; sun.shadowStrength = 0.75f;
        sun.transform.rotation = Quaternion.Euler(indoor ? 62 : 48, -32, 0);
        var shared = EnsureSharedMaterials();
        Material sky = shared.sky;
        if (!sky)
        {
            sky = SaveMat(new Material(Shader.Find("Skybox/Procedural")), folder, "Sky");
            sky.SetFloat("_SunSize", 0.035f); sky.SetFloat("_AtmosphereThickness", 0.75f); sky.SetColor("_SkyTint", new Color(0.55f, 0.72f, 0.95f));
            sky.SetColor("_GroundColor", new Color(0.93f, 0.96f, 1f)); sky.SetFloat("_Exposure", 1.25f);
        }
        RenderSettings.skybox = sky; RenderSettings.sun = sun;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        if (indoor) { RenderSettings.ambientSkyColor = new Color(0.85f, 0.78f, 0.68f); RenderSettings.ambientEquatorColor = new Color(0.7f, 0.6f, 0.5f); RenderSettings.ambientGroundColor = new Color(0.45f, 0.36f, 0.28f); }
        else { RenderSettings.ambientSkyColor = new Color(0.72f, 0.82f, 0.95f); RenderSettings.ambientEquatorColor = new Color(0.62f, 0.72f, 0.62f); RenderSettings.ambientGroundColor = new Color(0.4f, 0.47f, 0.33f); }
        RenderSettings.fog = !indoor; RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogStartDistance = 30; RenderSettings.fogEndDistance = 150; RenderSettings.fogColor = new Color(0.8f, 0.88f, 0.95f);
        return sun;
    }

    // the sea of clouds and the cloud cards around an island (Lingmu.World.Backdrop, built at runtime)
    public static void CloudSea(string folder, Vector3 centre, float islandRadius = 22)
    {
        var b = new GameObject("Backdrop").AddComponent<Backdrop>();
        b.centre = centre; b.islandRadius = islandRadius;
    }

    // ---------- shared materials (Resources/Materials): their shader variants are always in the build ----------
    public struct Shared { public Material sky; }

    [MenuItem("Lingmu/Update Shared Materials")]
    public static Shared EnsureSharedMaterials()
    {
        const string dir = "Assets/Resources/Materials";
        Directory.CreateDirectory(dir);
        var lit = Shader.Find("Universal Render Pipeline/Lit"); var unlit = Shader.Find("Universal Render Pipeline/Unlit");
        Texture2D Tex(string path) => AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        Material Make(string name, Shader sh, System.Action<Material> setup)
        {
            var path = $"{dir}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (!m) { m = new Material(sh); AssetDatabase.CreateAsset(m, path); }
            if (m.shader != sh) m.shader = sh;
            setup(m);
            EditorUtility.SetDirty(m);
            return m;
        }
        void Cutout(Material m) { m.SetFloat("_AlphaClip", 1); m.SetFloat("_Cutoff", 0.5f); m.EnableKeyword("_ALPHATEST_ON"); m.SetOverrideTag("RenderType", "TransparentCutout"); m.renderQueue = 2450; }
        void Transparent(Material m)
        {
            m.SetFloat("_Surface", 1); m.SetFloat("_Blend", 0); m.SetFloat("_ZWrite", 0);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One); m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); m.SetOverrideTag("RenderType", "Transparent"); m.renderQueue = 3000;
        }
        var detail = Tex("Assets/Art/Ground/grass_detail.png"); var detailN = Tex("Assets/Art/Ground/grass_detail_n.png");
        Make("IslandTop", lit, m =>
        {
            Cutout(m); m.SetFloat("_Smoothness", 0.08f);
            if (detail) { m.SetTexture("_DetailAlbedoMap", detail); m.SetFloat("_DetailAlbedoMapScale", 1f); m.EnableKeyword("_DETAIL_MULX2"); }
            if (detailN) { m.SetTexture("_DetailNormalMap", detailN); m.SetFloat("_DetailNormalMapScale", 0.6f); }
        });
        Make("IslandCliff", lit, m => { m.SetFloat("_Smoothness", 0.05f); m.SetFloat("_Cull", (float)CullMode.Off); });
        var seaTex = Tex("Assets/Art/Sky/cloud_sea.png");
        Make("CloudSea", unlit, m => { if (seaTex) m.SetTexture("_BaseMap", seaTex); m.SetTextureScale("_BaseMap", new Vector2(9, 9)); m.SetColor("_BaseColor", new Color(0.97f, 0.98f, 1f)); });
        var layerTex = Tex("Assets/Art/Sky/cloud_layer.png");     // separate puffs a little above the sea (tools/art/make_clouds.py)
        Make("CloudLayer", unlit, m => { Transparent(m); if (layerTex) m.SetTexture("_BaseMap", layerTex); m.SetTextureScale("_BaseMap", new Vector2(6, 6)); m.SetColor("_BaseColor", new Color(1, 1, 1, 0.85f)); });
        var puff = Tex("Assets/Art/Sky/cloud_cards.png"); var mist = Tex("Assets/Art/Sky/mist_cards.png");   // 2×2 sheets painted by the image model (prompts in tools/ai/prompts)
        Make("CloudCard", unlit, m => { Transparent(m); if (puff) m.SetTexture("_BaseMap", puff); m.SetColor("_BaseColor", new Color(1, 1, 1, 0.95f)); });
        Make("MistCard", unlit, m => { Transparent(m); if (mist) m.SetTexture("_BaseMap", mist); m.SetColor("_BaseColor", new Color(1, 1, 1, 0.9f)); });
        Make("TransparentUnlit", unlit, m => { Transparent(m); });
        // particles (fire, embers, smoke, water): URP's particle shader, additive for light, alpha for smoke and water
        var particle = Shader.Find("Universal Render Pipeline/Particles/Unlit");
        var fxSoft = Tex("Assets/Art/FX/fx_soft.png"); var fxFlame = Tex("Assets/Art/FX/fx_flame.png"); var fxRing = Tex("Assets/Art/FX/fx_ring.png");
        void Particle(Material m, Texture t, bool additive)
        {
            Transparent(m); m.SetFloat("_Blend", additive ? 2 : 0);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); m.SetFloat("_DstBlend", (float)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            if (t) m.SetTexture("_BaseMap", t); m.SetColor("_BaseColor", Color.white);
        }
        Make("FxFlame", particle, m => Particle(m, fxFlame, true));
        Make("FxAdd", particle, m => Particle(m, fxSoft, true));
        Make("FxAlpha", particle, m => Particle(m, fxSoft, false));
        Make("FxRing", particle, m => Particle(m, fxRing, false));
        Make("LitEmissive", lit, m => { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", Color.white); m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive; });
        var grassShader = Shader.Find("Lingmu/Grass");
        if (grassShader)
        {
            Material Grass(string name, string tex, float cutoff, float root, float wind, float cells = 1, float vary = 0)
                => Make(name, grassShader, m => { var t = Tex(tex); if (t) m.SetTexture("_BaseMap", t); m.SetFloat("_Cutoff", cutoff); m.SetFloat("_RootShade", root); m.SetFloat("_Wind", wind); m.SetFloat("_Cells", cells); m.SetFloat("_Vary", vary); m.enableInstancing = true; });
            // grass and flowers painted by the image model (tools/ai/prompts, cut with tools/art/sprite_sheet.py): four tuft shapes in one sheet
            var tufts = Grass("Grass", "Assets/Art/Ground/grass_tufts.png", 0.45f, 0.6f, 0.07f, 2, 1);
            tufts.SetColor("_Color", new Color(0.86f, 0.9f, 0.78f));       // the painted tufts are a bright lime: calm them to the ground's greens
            Grass("FlowerDaisy", "Assets/Art/Ground/flower_daisy.png", 0.5f, 1f, 0.03f, 1, 0.3f);
            Grass("FlowerYellow", "Assets/Art/Ground/flower_yellow.png", 0.5f, 1f, 0.03f, 1, 0.3f);
            Grass("FlowerBlue", "Assets/Art/Ground/flower_blue.png", 0.5f, 1f, 0.03f, 1, 0.3f);
            Grass("FlowerPink", "Assets/Art/Ground/flower_pink.png", 0.5f, 1f, 0.03f, 1, 0.3f);
            // farm crops (tools/art/make_farm.py): leaves sway like the grass
            Grass("CropLeaf", "Assets/Art/Farm/leaf.png", 0.45f, 0.8f, 0.05f);
            Grass("CropLeafThin", "Assets/Art/Farm/leaf_thin.png", 0.45f, 0.75f, 0.06f);
            Grass("CropHead", "Assets/Art/Farm/sunflower.png", 0.4f, 1f, 0.015f);
            Grass("CropEar", "Assets/Art/Farm/wheat_ear.png", 0.4f, 0.85f, 0.05f);
        }
        var soil = Tex("Assets/Art/Farm/soil.png"); var soilN = Tex("Assets/Art/Farm/soil_n.png");
        Make("SoilDry", lit, m => { if (soil) m.SetTexture("_BaseMap", soil); if (soilN) { m.SetTexture("_BumpMap", soilN); m.SetFloat("_BumpScale", 1f); m.EnableKeyword("_NORMALMAP"); } m.SetFloat("_Smoothness", 0.05f); m.SetColor("_BaseColor", Color.white); });
        Make("SoilWet", lit, m => { if (soil) m.SetTexture("_BaseMap", soil); if (soilN) { m.SetTexture("_BumpMap", soilN); m.SetFloat("_BumpScale", 0.7f); m.EnableKeyword("_NORMALMAP"); } m.SetFloat("_Smoothness", 0.42f); m.SetColor("_BaseColor", new Color(0.58f, 0.52f, 0.5f)); });
        Make("Produce", lit, m => { m.SetFloat("_Smoothness", 0.35f); m.SetColor("_BaseColor", Color.white); m.enableInstancing = true; });
        var stoneTex = Tex("Assets/Art/Stone/stone.png"); var stoneN = Tex("Assets/Art/Stone/stone_n.png");     // StoneKit rocks (tools/art/make_stone.py)
        Make("Stone", lit, m => { if (stoneTex) m.SetTexture("_BaseMap", stoneTex); if (stoneN) { m.SetTexture("_BumpMap", stoneN); m.SetFloat("_BumpScale", 1.2f); m.EnableKeyword("_NORMALMAP"); } m.SetFloat("_Smoothness", 0.12f); m.SetColor("_BaseColor", Color.white); m.enableInstancing = true; });
        void Glow(Material m, Color c, Color e) { m.SetColor("_BaseColor", c); m.SetFloat("_Smoothness", 0.85f); m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", e); m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive; m.enableInstancing = true; }
        Make("Crystal", lit, m => Glow(m, new Color(0.55f, 0.85f, 0.95f), new Color(0.15f, 0.45f, 0.55f)));
        Make("CrystalRare", lit, m => Glow(m, new Color(0.75f, 0.6f, 1f), new Color(0.4f, 0.25f, 0.7f)));
        var waterShader = Shader.Find("Lingmu/Water"); var waterN = Tex("Assets/Art/Water/water_normal.png");   // pond surface (tools/art/make_water.py)
        if (waterShader) Make("Water", waterShader, m =>
        {
            if (waterN) m.SetTexture("_NormalMap", waterN);
            m.SetColor("_Shallow", new Color(0.3f, 0.78f, 0.8f)); m.SetColor("_Deep", new Color(0.07f, 0.38f, 0.64f)); m.SetColor("_Sky", new Color(0.62f, 0.8f, 0.96f));
        });
        var skyTex = Tex("Assets/Art/Sky/sky_day.jpg");
        Material sky = null;
        if (skyTex)
            sky = Make("SkyDay", Shader.Find("Skybox/Panoramic"), m =>
            {
                m.SetTexture("_MainTex", skyTex); m.SetFloat("_Mapping", 1); m.SetFloat("_ImageType", 0); m.SetFloat("_MirrorOnBack", 0);
                m.SetFloat("_Exposure", 1.05f); m.SetFloat("_Rotation", SkyRotation); m.SetColor("_Tint", new Color(0.5f, 0.5f, 0.5f, 0.5f));
            });
        AssetDatabase.SaveAssets();
        return new Shared { sky = sky };
    }

    // turns the panorama so its cloud banks and floating islands are in front of the starting camera (looking north)
    public const float SkyRotation = 180;

    // ---------- models ----------
    public static GameObject Asset(string folder) => AssetDatabase.LoadAssetAtPath<GameObject>($"{folder}/{Path.GetFileName(folder)}.fbx");

    // a model on a tile (tile centre, web coordinates), scaled so its width or height is `size` metres, standing on the ground
    public static GameObject Place(Transform parent, string folder, float tx, float ty, float size, Fit fit, float yaw)
    {
        var asset = Asset(folder);
        if (!asset) { Debug.LogWarning("[Lingmu] missing model " + folder); var miss = new GameObject("missing " + folder); miss.transform.SetParent(parent, false); return miss; }
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

    // flames, embers, smoke and a flickering light on a campfire model (its bed is about a fifth of the way up)
    public static FxEmitter AddFire(GameObject campfire, bool light = true)
    {
        var b = Bounds(campfire);
        var fx = new GameObject("fire").AddComponent<FxEmitter>(); fx.transform.SetParent(campfire.transform, true);
        fx.transform.position = new Vector3(b.center.x, b.min.y + 0.22f * b.size.y, b.center.z);
        fx.kind = "fire"; fx.size = 0.55f * b.size.y; fx.addLight = light;
        return fx;
    }

    // visible size, also for skinned characters
    public static Bounds Bounds(GameObject g)
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

    // ---------- animation ----------
    // idle ↔ walk on the "Speed" parameter (PlayerMover / WildPet set it). Pets with only a run clip: slow run as idle.
    public static RuntimeAnimatorController Locomotion(string folder)
    {
        var fbx = $"{folder}/{Path.GetFileName(folder)}.fbx";
        var clips = AssetDatabase.LoadAllAssetsAtPath(fbx).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview")).ToList();
        if (clips.Count == 0) return null;
        AnimationClip Find(params string[] keys) => clips.FirstOrDefault(c => keys.Any(k => c.name.ToLowerInvariant().Contains(k)));
        var walk = Find("walk") ?? Find("run", "跑") ?? clips[0];
        var run = Find("run", "跑");
        var idle = Find("idle", "breath", "look");
        var path = $"{Folder("Animators")}/{Path.GetFileName(folder)}.controller";
        AssetDatabase.DeleteAsset(path);
        var ctrl = AnimatorController.CreateAnimatorControllerAtPath(path);
        ctrl.AddParameter("Speed", AnimatorControllerParameterType.Float);
        var state = ctrl.CreateBlendTreeInController("Move", out var tree);
        tree.blendParameter = "Speed"; tree.useAutomaticThresholds = false;
        tree.AddChild(idle ?? walk, 0);
        tree.AddChild(walk, 1);
        if (run != null && run != walk) tree.AddChild(run, 2);          // Speed 2: fleeing / charging pets
        if (idle == null) { var ch = tree.children; ch[0].timeScale = 0.12f; tree.children = ch; }
        // action clips (chop, pick_up, water, hit …): a state each, named after the clip, played by PlayerMover.PlayAction /
        // CrossFade; one-shot clips go back to Move by themselves
        var sm = ctrl.layers[0].stateMachine;
        foreach (var c in clips)
        {
            if (c == walk || c == run || c == idle || sm.states.Any(s => s.state.name == c.name)) continue;
            var st = sm.AddState(c.name); st.motion = c;
            if (!c.isLooping) { var back = st.AddTransition(state); back.hasExitTime = true; back.exitTime = 0.95f; back.duration = 0.2f; }
        }
        return ctrl;
    }

    // ---------- the player and the camera ----------
    public static (Transform player, PlayerMover mover) MakePlayer(Vector3 at, IslandWalkMap walk)
    {
        var player = new GameObject("Player");
        player.transform.position = at;
        var rigged = Asset(Chars + "A01_player_rig");
        var folder = Chars + (rigged ? "A01_player_rig" : "A01_player_unrigged");
        var body = Place(player.transform, folder, at.x - 0.5f, -at.z - 0.5f, 1.35f, Fit.Height, 0);
        body.transform.localPosition = new Vector3(0, body.transform.localPosition.y, 0);
        if (rigged)
        {
            var anim = body.GetComponentInChildren<Animator>() ?? body.AddComponent<Animator>();
            anim.runtimeAnimatorController = Locomotion(folder); anim.applyRootMotion = false;
        }
        var mover = player.AddComponent<PlayerMover>(); mover.map = walk; mover.model = body.transform;
        return (player.transform, mover);
    }

    public static Camera MakeCamera(Transform target, PlayerMover mover, float distance = 330f / 48f, float pitch = 0.34f)
    {
        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        var cam = camGo.AddComponent<Camera>(); cam.fieldOfView = 50; cam.nearClipPlane = 0.1f; cam.farClipPlane = 300;
        var data = camGo.AddComponent<UniversalAdditionalCameraData>(); data.renderPostProcessing = true; data.antialiasing = AntialiasingMode.None;   // edges are smoothed by 4× MSAA in the render pipeline asset (cheap on phone GPUs)
        var orbit = camGo.AddComponent<OrbitCamera>(); orbit.target = target; orbit.distance = distance; orbit.pitch = pitch;
        if (mover) mover.cameraTransform = camGo.transform;
        orbit.Snap();
        return cam;
    }

    // soft bloom, neutral tone mapping, a little more saturation, light vignette
    public static void Grading(string folder)
    {
        var volume = new GameObject("Grading").AddComponent<Volume>(); volume.isGlobal = true;
        var path = folder + "/Grading.asset";
        AssetDatabase.DeleteAsset(path);
        var profile = ScriptableObject.CreateInstance<VolumeProfile>();
        AssetDatabase.CreateAsset(profile, path);
        var bloom = profile.Add<Bloom>(true); bloom.intensity.Override(0.28f); bloom.threshold.Override(1.15f); bloom.scatter.Override(0.6f);   // 11-21: lower, so the bright cloud sea no longer veils the picture
        profile.Add<Tonemapping>(true).mode.Override(TonemappingMode.Neutral);
        var ca = profile.Add<ColorAdjustments>(true); ca.postExposure.Override(0.15f); ca.saturation.Override(14f); ca.contrast.Override(6f);
        profile.Add<Vignette>(true).intensity.Override(0.18f);
        foreach (var comp in profile.components) AssetDatabase.AddObjectToAsset(comp, profile);
        volume.sharedProfile = profile;
    }

    public static GameSession AddGame(Transform player, Light sun, bool indoor = false)
    {
        var game = new GameObject("Game");
        var session = game.AddComponent<GameSession>(); session.player = player; session.sun = sun; session.indoor = indoor;
        new GameObject("UI").AddComponent<GameUI>();
        return session;
    }

    public static void SaveScene(UnityEngine.SceneManagement.Scene scene, string name)
    {
        var path = $"Assets/Scenes/{name}.unity";
        EditorSceneManager.SaveScene(scene, path);
        var all = EditorBuildSettings.scenes.Select(s => s.path).Where(p => !BuildOrder.Any(n => p.EndsWith("/" + n + ".unity"))).ToList();
        var ordered = BuildOrder.Select(n => $"Assets/Scenes/{n}.unity").Where(File.Exists).Concat(all).Select(p => new EditorBuildSettingsScene(p, true)).ToArray();
        EditorBuildSettings.scenes = ordered;
        AssetDatabase.SaveAssets();
    }

    // ---------- the runtime model library ----------
    static readonly (string key, string folder, bool animated)[] Library =
    {
        ("tree", Props + "C38-C40_tree_round", false), ("pine", Props + "C39_tree_b", false), ("bush", Props + "C41_bush", false), ("shrub", Props + "C40_shrub_leafy", false),
        ("thorn", Props + "C42_thorn", false), ("chest", Props + "C08_chest", false), ("chest_open", Props + "C09_chest_open", false), ("airship", Props + "C05_airship", false),
        ("campfire", Props + "C15_campfire_lit", false), ("tent", Props + "C07_tent", false), ("lamp", Props + "C14_lamp", false), ("fountain", Props + "C06_fountain", false),
        ("bld_shop_granny", Props + "C02_bld_shop_granny", false), ("bld_workshop", Props + "C03_bld_workshop", false), ("bld_lab", Props + "C04_bld_lab", false),
        ("pet_acorn", Chars + "A03_acorn_rig", true), ("pet_shark", Chars + "A04_shark_rig", true), ("pet_starbear", Chars + "A05_starbear_rig", true),
        ("pet_shadecat", Chars + "A06_shadecat_rig", true), ("pet_pup", Chars + "A02_pup_rig", true), ("pet_fox", Chars + "P00_fox", true),   // round 2 (11-22)
        ("npc_granny", Chars + "B01_npc_granny", true), ("npc_ali", Chars + "B02_npc_ali", true), ("npc_lumi", Chars + "B03_npc_lumi", true), ("npc_innkeeper", Chars + "B11_npc_innkeeper", true),
        ("player", Chars + "A01_player_rig", true),
        ("hero", Chars + "H01_hero", true),   // round 2 (Tripo website, 11-22): replaces the player model when a scene starts (GameSession.SwapHero)
    };

    // after new models arrive: short clip names, then the runtime library (batch: -executeMethod SceneKit.RefreshModels)
    public static void RefreshModels() { AssetDatabase.Refresh(); LingmuModelImport.FixClips(); UpdateLibrary(); }

    [MenuItem("Lingmu/Update Model Library")]
    public static ModelLibrary UpdateLibrary()
    {
        const string path = "Assets/Resources/ModelLibrary.asset";
        var lib = AssetDatabase.LoadAssetAtPath<ModelLibrary>(path);
        if (!lib) { lib = ScriptableObject.CreateInstance<ModelLibrary>(); AssetDatabase.CreateAsset(lib, path); }
        lib.entries = new List<ModelLibrary.Entry>();
        foreach (var (key, folder, animated) in Library)
        {
            var model = Asset(folder);
            if (!model) { Debug.LogWarning("[Lingmu] library: missing " + folder); continue; }
            lib.entries.Add(new ModelLibrary.Entry { key = key, model = model, animator = animated ? Locomotion(folder) : null });
        }
        EditorUtility.SetDirty(lib);
        AssetDatabase.SaveAssets();
        Debug.Log($"[Lingmu] model library: {lib.entries.Count} models");
        return lib;
    }
}
