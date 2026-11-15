// Import settings for the Tripo models (docs/16):
//  - Art/Characters/<name>/      rigged characters → Humanoid avatar, so any humanoid motion can be shared between them
//  - Art/Characters/*_unrigged/  characters without a skeleton yet → plain mesh
//  - Art/Props/                  scenery → plain mesh, no animation
// Each model's texture sits next to it in a Textures folder (that is where Unity looks for it).
// Clip names are tidied ("Armature|walk.001" → "walk") and walk / run / idle style clips loop: LingmuModelImport.FixClips.
using System.Linq;
using UnityEditor;
using UnityEngine;

public class LingmuModelImport : AssetPostprocessor
{
    static bool IsArt(string p) => p.StartsWith("Assets/Art/");
    static bool IsRigged(string p) => p.StartsWith("Assets/Art/Characters/") && !p.Contains("_unrigged");
    static readonly string[] Looping = { "walk", "run", "idle", "look_around", "breath" };

    void OnPreprocessModel()
    {
        if (!IsArt(assetPath)) return;
        var mi = (ModelImporter)assetImporter;
        mi.importCameras = false;
        mi.bakeAxisConversion = true;      // Tripo exports Z-up: bake the turn into the mesh, so the model's own rotation is plain (otherwise placing it with a yaw tips it over)
        mi.importLights = false;
        mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
        mi.materialSearch = ModelImporterMaterialSearch.Local;
        if (IsRigged(assetPath))
        {
            mi.animationType = ModelImporterAnimationType.Human;
            mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            mi.importAnimation = true;
            mi.animationCompression = ModelImporterAnimationCompression.Optimal;
        }
        else
        {
            mi.animationType = ModelImporterAnimationType.None;
            mi.importAnimation = false;
        }
    }

    // Tripo delivers 4096 x 4096 textures. Phones (and the dev PC's 1 GB integrated GPU) want far less:
    // 1024 for every model texture, compressed, with mipmaps. The original file is left untouched.
    void OnPreprocessTexture()
    {
        if (assetPath.StartsWith("Assets/Resources/Icons/"))
        {
            // UI icons (128 px): sprites, no mipmaps, crisp on phones
            var ui = (TextureImporter)assetImporter;
            ui.textureType = TextureImporterType.Sprite; ui.spriteImportMode = SpriteImportMode.Single;
            ui.mipmapEnabled = false; ui.alphaIsTransparency = true; ui.maxTextureSize = 512;
            var a = ui.GetPlatformTextureSettings("Android");
            a.overridden = true; a.maxTextureSize = 512; a.format = TextureImporterFormat.ASTC_4x4;
            ui.SetPlatformTextureSettings(a);
            return;
        }
        if (!IsArt(assetPath)) return;
        var ti = (TextureImporter)assetImporter;
        ti.maxTextureSize = 1024;
        ti.textureCompression = TextureImporterCompression.Compressed;
        ti.mipmapEnabled = true;
        ti.sRGBTexture = true;
        var android = ti.GetPlatformTextureSettings("Android");
        android.overridden = true; android.maxTextureSize = 1024; android.format = TextureImporterFormat.ASTC_6x6;
        ti.SetPlatformTextureSettings(android);
    }

    // Short clip names and looping, for every rigged character (run once after new models arrive; safe to repeat).
    public static void FixClips()
    {
        foreach (var p in AssetDatabase.FindAssets("t:Model", new[] { "Assets/Art/Characters" }).Select(AssetDatabase.GUIDToAssetPath).Where(IsRigged))
        {
            var mi = (ModelImporter)AssetImporter.GetAtPath(p);
            var clips = (mi.clipAnimations != null && mi.clipAnimations.Length > 0) ? mi.clipAnimations : mi.defaultClipAnimations;
            if (clips == null || clips.Length == 0) continue;
            bool changed = false;
            foreach (var c in clips)
            {
                var shortName = c.takeName.Split('|').Last().Replace(".001", "").Replace("_Armature", "");
                bool loop = Looping.Any(k => shortName.ToLowerInvariant().Contains(k));
                if (c.name != shortName || c.loopTime != loop) { c.name = shortName; c.loopTime = loop; changed = true; }
            }
            if (!changed) continue;
            mi.clipAnimations = clips;
            mi.SaveAndReimport();
        }
    }
}
