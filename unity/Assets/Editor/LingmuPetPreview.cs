// Renders every animated pet in the model library at a few moments of its idle / walk / happy clips into one picture,
// to check rigs and clips after re-exporting them (orientation, scale, textures, motion) without opening a scene.
//   menu Lingmu/Render Pet Previews, or batch: -executeMethod LingmuPetPreview.Render  → D:/ClaudeTools/unity/pets_preview.png
using System.IO;
using System.Linq;
using Lingmu.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

public static class LingmuPetPreview
{
    const int Cell = 300;
    static readonly (string clip, float t)[] Moments = { ("idle", 0f), ("idle", 0.5f), ("walk", 0f), ("walk", 0.25f), ("walk", 0.5f), ("happy", 0.25f) };

    [MenuItem("Lingmu/Render Pet Previews")]
    public static void Render()
    {
        var lib = Resources.Load<ModelLibrary>("ModelLibrary");
        var pets = lib.entries.Where(e => e.key.StartsWith("pet_") && e.model).ToList();
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var sun = new GameObject("sun").AddComponent<Light>(); sun.type = LightType.Directional; sun.transform.rotation = Quaternion.Euler(40, 150, 0); sun.intensity = 1.3f;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat; RenderSettings.ambientLight = new Color(0.62f, 0.62f, 0.66f);
        var cam = new GameObject("cam").AddComponent<Camera>(); cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
        cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.55f, 0.6f, 0.66f); cam.orthographic = true; cam.orthographicSize = 0.62f;
        cam.transform.position = new Vector3(1.2f, 1.25f, 3f); cam.transform.LookAt(new Vector3(0, 0.5f, 0));   // in front of the pets (they face +Z), a little to their left
        var rt = new RenderTexture(Cell, Cell, 24) { antiAliasing = 4 }; cam.targetTexture = rt;
        var sheet = new Texture2D(Cell * Moments.Length, Cell * pets.Count, TextureFormat.RGB24, false);
        var read = new Texture2D(Cell, Cell, TextureFormat.RGB24, false);
        for (int row = 0; row < pets.Count; row++)
        {
            var go = (GameObject)PrefabUtility.InstantiatePrefab(pets[row].model);
            var b = new Bounds(go.transform.position, Vector3.zero);
            foreach (var r in go.GetComponentsInChildren<Renderer>()) b.Encapsulate(r.bounds);
            float k = 1f / Mathf.Max(0.01f, b.size.y);
            go.transform.localScale *= k;                                       // 1 unit tall, standing on 0, facing +Z (towards the camera side)
            go.transform.position = new Vector3(-b.center.x * k, -b.min.y * k, -b.center.z * k);
            var clips = AssetDatabase.LoadAllAssetsAtPath(AssetDatabase.GetAssetPath(pets[row].model)).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview")).ToList();
            for (int col = 0; col < Moments.Length; col++)
            {
                var clip = clips.FirstOrDefault(c => c.name == Moments[col].clip);
                if (clip) clip.SampleAnimation(go, Moments[col].t * clip.length);
                cam.Render();
                RenderTexture.active = rt; read.ReadPixels(new Rect(0, 0, Cell, Cell), 0, 0); read.Apply(); RenderTexture.active = null;
                sheet.SetPixels(col * Cell, (pets.Count - 1 - row) * Cell, Cell, Cell, read.GetPixels());
            }
            Object.DestroyImmediate(go);
            Debug.Log($"[Lingmu] preview {pets[row].key}: clips {string.Join(", ", clips.Select(c => c.name))}");
        }
        sheet.Apply();
        Directory.CreateDirectory("D:/ClaudeTools/unity");
        File.WriteAllBytes("D:/ClaudeTools/unity/pets_preview.png", sheet.EncodeToPNG());
        Debug.Log("[Lingmu] pet previews: D:/ClaudeTools/unity/pets_preview.png");
    }
}
