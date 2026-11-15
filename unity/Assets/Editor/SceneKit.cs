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
    public const float FrontSouth = 270;   // Tripo props face -X after import; turned 270° their front looks south
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
        var sky = SaveMat(new Material(Shader.Find("Skybox/Procedural")), folder, "Sky");
        sky.SetFloat("_SunSize", 0.035f); sky.SetFloat("_AtmosphereThickness", 0.75f); sky.SetColor("_SkyTint", new Color(0.55f, 0.72f, 0.95f));
        sky.SetColor("_GroundColor", new Color(0.93f, 0.96f, 1f)); sky.SetFloat("_Exposure", 1.25f);
        RenderSettings.skybox = sky; RenderSettings.sun = sun;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        if (indoor) { RenderSettings.ambientSkyColor = new Color(0.85f, 0.78f, 0.68f); RenderSettings.ambientEquatorColor = new Color(0.7f, 0.6f, 0.5f); RenderSettings.ambientGroundColor = new Color(0.45f, 0.36f, 0.28f); }
        else { RenderSettings.ambientSkyColor = new Color(0.72f, 0.82f, 0.95f); RenderSettings.ambientEquatorColor = new Color(0.62f, 0.72f, 0.62f); RenderSettings.ambientGroundColor = new Color(0.4f, 0.47f, 0.33f); }
        RenderSettings.fog = !indoor; RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogStartDistance = 32; RenderSettings.fogEndDistance = 95; RenderSettings.fogColor = new Color(0.8f, 0.89f, 0.96f);
        return sun;
    }

    public static void CloudSea(string folder, Vector3 centre)
    {
        var sea = GameObject.CreatePrimitive(PrimitiveType.Plane);
        sea.name = "CloudSea"; Object.DestroyImmediate(sea.GetComponent<Collider>());
        sea.transform.position = centre + new Vector3(0, -8, 0); sea.transform.localScale = new Vector3(60, 1, 60);
        var m = SaveMat(new Material(Shader.Find("Universal Render Pipeline/Unlit")), folder, "CloudSea"); m.SetColor("_BaseColor", new Color(0.93f, 0.96f, 0.98f));
        sea.GetComponent<Renderer>().sharedMaterial = m;
    }

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
        var walk = Find("walk", "run", "跑") ?? clips[0];
        var idle = Find("idle", "breath", "look");
        var path = $"{Folder("Animators")}/{Path.GetFileName(folder)}.controller";
        AssetDatabase.DeleteAsset(path);
        var ctrl = AnimatorController.CreateAnimatorControllerAtPath(path);
        ctrl.AddParameter("Speed", AnimatorControllerParameterType.Float);
        var state = ctrl.CreateBlendTreeInController("Move", out var tree);
        tree.blendParameter = "Speed"; tree.useAutomaticThresholds = false;
        tree.AddChild(idle ?? walk, 0);
        tree.AddChild(walk, 1);
        if (idle == null) { var ch = tree.children; ch[0].timeScale = 0.12f; tree.children = ch; }
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

    public static Camera MakeCamera(Transform target, PlayerMover mover, float distance = 330f / 48f, float pitch = 0.42f)
    {
        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        var cam = camGo.AddComponent<Camera>(); cam.fieldOfView = 50; cam.nearClipPlane = 0.1f; cam.farClipPlane = 300;
        var data = camGo.AddComponent<UniversalAdditionalCameraData>(); data.renderPostProcessing = true; data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
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
        var bloom = profile.Add<Bloom>(true); bloom.intensity.Override(0.45f); bloom.threshold.Override(0.95f); bloom.scatter.Override(0.7f);
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
        ("pet_acorn", Chars + "A03_acorn_unrigged", false), ("pet_shark", Chars + "A04_shark_rig", true), ("pet_starbear", Chars + "A05_starbear_rig", true),
        ("pet_shadecat", Chars + "A06_shadecat_rig", true), ("pet_pup", Chars + "A02_pup_rig", true), ("pet_fox", Chars + "A00_fox_rig", true),
        ("npc_granny", Chars + "B01_npc_granny", false), ("npc_ali", Chars + "B02_npc_ali", false), ("npc_lumi", Chars + "B03_npc_lumi", false), ("npc_innkeeper", Chars + "B11_npc_innkeeper", true),
        ("player", Chars + "A01_player_rig", true),
    };

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
