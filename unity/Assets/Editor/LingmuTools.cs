// Command-line helpers (run from batch mode with -executeMethod), so the AI can check the project without the editor UI.
//   LingmuTools.ImportReport  → D:\ClaudeTools\unity\import_report.txt : every model, its avatar, its clips, its size
//   LingmuTools.PreviewShot   → D:\ClaudeTools\unity\preview.png        : all models lined up in one picture
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class LingmuTools
{
    const string Out = @"D:\ClaudeTools\unity\";

    static string[] Models() => AssetDatabase.FindAssets("t:Model", new[] { "Assets/Art" })
        .Select(AssetDatabase.GUIDToAssetPath).OrderBy(p => p).ToArray();

    static Bounds BoundsOf(GameObject g)
    {
        var rs = g.GetComponentsInChildren<Renderer>();
        if (rs.Length == 0) return new Bounds(g.transform.position, Vector3.zero);
        var b = rs[0].bounds;
        foreach (var r in rs) b.Encapsulate(r.bounds);
        return b;
    }

    public static void ImportReport()
    {
        AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate);
        var sb = new StringBuilder();
        foreach (var p in Models())
        {
            var mi = (ModelImporter)AssetImporter.GetAtPath(p);
            var go = AssetDatabase.LoadAssetAtPath<GameObject>(p);
            var avatar = AssetDatabase.LoadAllAssetsAtPath(p).OfType<Avatar>().FirstOrDefault();
            var clips = AssetDatabase.LoadAllAssetsAtPath(p).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).ToArray();
            var inst = Object.Instantiate(go);
            var b = BoundsOf(inst);
            int tris = inst.GetComponentsInChildren<MeshFilter>().Sum(f => f.sharedMesh ? f.sharedMesh.triangles.Length / 3 : 0)
                     + inst.GetComponentsInChildren<SkinnedMeshRenderer>().Sum(s => s.sharedMesh ? s.sharedMesh.triangles.Length / 3 : 0);
            int texMissing = inst.GetComponentsInChildren<Renderer>().SelectMany(r => r.sharedMaterials).Count(m => m && !m.mainTexture);
            Object.DestroyImmediate(inst);
            sb.AppendLine($"{Path.GetFileNameWithoutExtension(p)} | type {mi.animationType} | avatar {(avatar ? (avatar.isHuman ? "human" : "generic") + (avatar.isValid ? " ok" : " INVALID") : "none")} | tris {tris} | size {b.size.x:0.00} x {b.size.y:0.00} x {b.size.z:0.00} | materials without texture {texMissing} | clips {string.Join(", ", clips.Select(c => c.name + (c.isLooping ? "(loop)" : "")))}");
        }
        Directory.CreateDirectory(Out);
        File.WriteAllText(Out + "import_report.txt", sb.ToString(), Encoding.UTF8);
        Debug.Log("[Lingmu] import report written: " + Models().Length + " models");
    }

    public static void PreviewShot()
    {
        bool batcher = GraphicsSettings.useScriptableRenderPipelineBatching;
        GraphicsSettings.useScriptableRenderPipelineBatching = false;      // off before anything is built (see Shoot)
        try { BuildPreview(); } finally { GraphicsSettings.useScriptableRenderPipelineBatching = batcher; }
    }

    static void BuildPreview()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional; sun.intensity = 1.6f; sun.color = new Color(1f, 0.95f, 0.85f); sun.shadows = LightShadows.Soft;
        sun.transform.rotation = Quaternion.Euler(45, -35, 0);
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.72f, 0.82f, 0.95f); RenderSettings.ambientEquatorColor = new Color(0.6f, 0.7f, 0.6f); RenderSettings.ambientGroundColor = new Color(0.35f, 0.45f, 0.3f);
        var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.transform.localScale = new Vector3(8, 1, 4);
        var gm = new Material(Shader.Find("Universal Render Pipeline/Lit")); gm.color = new Color(0.52f, 0.78f, 0.36f); ground.GetComponent<Renderer>().sharedMaterial = gm;

        // characters 1 m tall in the front row, props 1.6 m in two rows behind
        var models = Models();
        var chars = models.Where(p => p.Contains("/Characters/")).ToArray();
        var props = models.Where(p => p.Contains("/Props/")).ToArray();
        void Row(string[] list, float z, float height, float gap)
        {
            float x0 = -(list.Length - 1) * gap / 2;
            for (int i = 0; i < list.Length; i++)
            {
                var g = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(list[i]));
                var b = BoundsOf(g);
                float k = height / Mathf.Max(b.size.y, 1e-4f);
                g.transform.localScale *= k;
                b = BoundsOf(g);
                g.transform.position += new Vector3(x0 + i * gap - b.center.x, -b.min.y, z - b.center.z);
            }
        }
        Row(chars, -2.2f, 1.0f, 1.25f);
        Row(props.Take(10).ToArray(), 0.4f, 1.6f, 1.9f);
        Row(props.Skip(10).ToArray(), 3.0f, 1.6f, 1.9f);

        var cam = new GameObject("Cam").AddComponent<Camera>();
        cam.transform.position = new Vector3(0, 5.2f, -12.5f); cam.transform.LookAt(new Vector3(0, 0.6f, 0.6f));
        cam.fieldOfView = 52; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.62f, 0.8f, 0.92f);
        cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
        var rt = new RenderTexture(1920, 900, 24) { antiAliasing = 4 };
        cam.targetTexture = rt;
        Shoot(cam);
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); tex.Apply();
        Directory.CreateDirectory(Out);
        File.WriteAllBytes(Out + "preview.png", tex.EncodeToPNG());
        RenderTexture.active = null;
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/ModelPreview.unity");
        Debug.Log("[Lingmu] preview written");
    }

    // which texture each material really uses, and the bounds used for scaling (to find mix-ups)
    public static void MaterialReport()
    {
        var sb = new StringBuilder();
        foreach (var p in Models())
        {
            var go = AssetDatabase.LoadAssetAtPath<GameObject>(p);
            var inst = Object.Instantiate(go);
            var b = BoundsOf(inst);
            foreach (var r in inst.GetComponentsInChildren<Renderer>())
                foreach (var m in r.sharedMaterials)
                    sb.AppendLine($"{Path.GetFileNameWithoutExtension(p)} | renderer {r.name} enabled {r.enabled} | material {(m ? m.name : "null")} | shader {(m ? m.shader.name : "-")} | tex {(m && m.mainTexture ? AssetDatabase.GetAssetPath(m.mainTexture) : "none")} | bounds {b.size}");
            Object.DestroyImmediate(inst);
        }
        File.WriteAllText(Out + "material_report.txt", sb.ToString(), Encoding.UTF8);
        Debug.Log("[Lingmu] material report written");
    }

    // small render test: ground + cottage + granny, with and without the SRP batcher (to find a rendering problem)
    public static void RenderTest()
    {
        string api = SystemInfo.graphicsDeviceType.ToString();
        foreach (bool batcher in new[] { true, false })
        {
            GraphicsSettings.useScriptableRenderPipelineBatching = batcher;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var sun = new GameObject("Sun").AddComponent<Light>(); sun.type = LightType.Directional; sun.intensity = 1.5f; sun.transform.rotation = Quaternion.Euler(45, -35, 0);
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            var gm = new Material(Shader.Find("Universal Render Pipeline/Lit")); gm.SetColor("_BaseColor", new Color(0.52f, 0.78f, 0.36f)); ground.GetComponent<Renderer>().sharedMaterial = gm;
            var a1 = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/Props/C01_bld_cottage/C01_bld_cottage.fbx")); a1.transform.position = new Vector3(-0.8f, 0, 0); a1.transform.localScale *= 1.4f;
            var a2 = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/Characters/B01_npc_granny/B01_npc_granny.fbx")); a2.transform.position = new Vector3(0.9f, 0, -0.3f);
            var cam = new GameObject("Cam").AddComponent<Camera>(); cam.transform.position = new Vector3(0, 1.6f, -3.6f); cam.transform.LookAt(new Vector3(0, 0.5f, 0));
            cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.62f, 0.8f, 0.92f); cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
            var rt = new RenderTexture(800, 500, 24); cam.targetTexture = rt; cam.Render();
            RenderTexture.active = rt; var tex = new Texture2D(800, 500, TextureFormat.RGB24, false); tex.ReadPixels(new Rect(0, 0, 800, 500), 0, 0); tex.Apply();
            File.WriteAllBytes(Out + $"rendertest_{api}_{(batcher ? "batcher" : "nobatcher")}.png", tex.EncodeToPNG()); RenderTexture.active = null;
        }
        Debug.Log("[Lingmu] render test done on " + api + " / pipeline " + (GraphicsSettings.currentRenderPipeline ? GraphicsSettings.currentRenderPipeline.name : "none"));
    }

    // Rendering from batch mode: the first frames of a new scene show one and the same texture on every object
    // (textures are not bound yet). A few warm-up renders first, then the real one. The SRP batcher is also kept off
    // while a picture scene is built; the project setting itself stays on (it helps phones).
    public static void Shoot(Camera cam) { for (int i = 0; i < 4; i++) cam.Render(); }

    // Each model at yaw 0 / 90 / 180 / 270, seen from the south (-Z), one row per model: to find which way its front points.
    public static void Turntable()
    {
        string[] names = { "C01_bld_cottage", "C07_tent", "C10_storage", "C11_shipbox", "C12_seedstand", "C13_dock", "C05_airship", "C15_campfire_lit", "C08_chest" };
        bool batcher = GraphicsSettings.useScriptableRenderPipelineBatching; GraphicsSettings.useScriptableRenderPipelineBatching = false;
        try
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var sun = new GameObject("Sun").AddComponent<Light>(); sun.type = LightType.Directional; sun.intensity = 1.5f; sun.transform.rotation = Quaternion.Euler(40, -20, 0);
            RenderSettings.ambientLight = new Color(0.55f, 0.6f, 0.65f);
            for (int r = 0; r < names.Length; r++)
                for (int k = 0; k < 4; k++)
                {
                    var asset = AssetDatabase.LoadAssetAtPath<GameObject>($"Assets/Art/Props/{names[r]}/{names[r]}.fbx");
                    var g = (GameObject)PrefabUtility.InstantiatePrefab(asset);
                    g.transform.rotation = Quaternion.Euler(0, k * 90, 0) * g.transform.rotation;
                    var b = BoundsOf(g); g.transform.localScale *= 1f / Mathf.Max(b.size.x, b.size.z, b.size.y);
                    b = BoundsOf(g); g.transform.position += new Vector3(k * 1.4f - b.center.x, -b.min.y, -r * 1.4f - b.center.z);
                }
            var cam = new GameObject("Cam").AddComponent<Camera>();
            cam.transform.position = new Vector3(2.1f, 9f, -17f); cam.transform.LookAt(new Vector3(2.1f, 0, -5.6f));
            cam.fieldOfView = 42; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.62f, 0.8f, 0.92f); cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
            var rt = new RenderTexture(900, 1400, 24); cam.targetTexture = rt; Shoot(cam);
            RenderTexture.active = rt; var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false); tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); tex.Apply();
            File.WriteAllBytes(Out + "turntable.png", tex.EncodeToPNG()); RenderTexture.active = null;
        }
        finally { GraphicsSettings.useScriptableRenderPipelineBatching = batcher; }
        Debug.Log("[Lingmu] turntable written");
    }

    public static void ReportAndPreview() { AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate); LingmuModelImport.FixClips(); ImportReport(); PreviewShot(); }
}
