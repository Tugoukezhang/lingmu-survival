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
    // bump when the rules below change: Unity then imports the affected models and textures again by itself
    // 2: textures 2048 (was 1024), sky / ground textures, pets as Generic
    // 3: pets re-rigged in Blender (tools/blender/rig_pet.py): idle / walk / run / happy clips, "happy" loops
    // 4: the player too (two-legged clips), so A01 is Generic as well
    // 5: model textures 4096 on PC with Kaiser mips, mip bias and 8x aniso (2048 on phones / web)
    public override uint GetVersion() => 5;

    static bool IsArt(string p) => p.StartsWith("Assets/Art/");
    // pets and the player (A0x) are rigged by tools/blender/rig_pet.py with their own skeleton: Generic; Tripo-rigged NPCs: Humanoid
    static bool IsOwnRig(string p) => p.StartsWith("Assets/Art/Characters/A0") && !p.Contains("_unrigged");
    static bool IsRigged(string p) => p.StartsWith("Assets/Art/Characters/") && !p.Contains("_unrigged");
    static readonly string[] Looping = { "walk", "run", "idle", "look_around", "breath", "happy" };

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
            // pets are animals: their skeletons don't map to a human one, so they keep their own clips (Generic)
            mi.animationType = IsOwnRig(assetPath) ? ModelImporterAnimationType.Generic : ModelImporterAnimationType.Human;
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
    // 2048 for every model texture (ASTC 6×6 on Android), compressed, with mipmaps. The original file is left untouched.
    // Ground detail textures (Art/Ground) tile across the islands: grayscale detail and a normal map.
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
        if (assetPath.StartsWith("Assets/Art/Sky/"))
        {
            // the panorama: full width, no mipmaps (mipmaps show a seam where its ends meet); cloud textures tile
            var k = (TextureImporter)assetImporter;
            bool pano = assetPath.Contains("sky_");
            k.textureType = TextureImporterType.Default; k.sRGBTexture = true; k.alphaIsTransparency = !pano;
            k.mipmapEnabled = !pano; k.maxTextureSize = pano ? 4096 : 1024; k.wrapModeU = TextureWrapMode.Repeat; k.wrapModeV = pano ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
            k.textureCompression = TextureImporterCompression.Compressed;
            var ka = k.GetPlatformTextureSettings("Android");
            ka.overridden = true; ka.maxTextureSize = pano ? 4096 : 1024; ka.format = TextureImporterFormat.ASTC_6x6;
            k.SetPlatformTextureSettings(ka);
            return;
        }
        if (assetPath.StartsWith("Assets/Art/Ground/"))
        {
            var g = (TextureImporter)assetImporter;
            bool normal = assetPath.EndsWith("_n.png");
            g.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            g.sRGBTexture = !normal && !assetPath.EndsWith("_mask.png");
            g.wrapMode = TextureWrapMode.Repeat; g.mipmapEnabled = true; g.anisoLevel = 4; g.maxTextureSize = 1024;
            g.textureCompression = TextureImporterCompression.Compressed;
            var ga = g.GetPlatformTextureSettings("Android");
            ga.overridden = true; ga.maxTextureSize = 1024; ga.format = TextureImporterFormat.ASTC_6x6;
            g.SetPlatformTextureSettings(ga);
            return;
        }
        if (assetPath.StartsWith("Assets/Art/Farm/"))
        {
            var fm = (TextureImporter)assetImporter;
            bool normal = assetPath.EndsWith("_n.png"), tile = assetPath.Contains("soil");
            fm.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            fm.alphaIsTransparency = !tile; fm.sRGBTexture = !normal; fm.mipmapEnabled = true; fm.anisoLevel = 4;
            fm.wrapMode = tile ? TextureWrapMode.Repeat : TextureWrapMode.Clamp; fm.maxTextureSize = 512;
            fm.textureCompression = TextureImporterCompression.CompressedHQ;
            return;
        }
        if (assetPath.StartsWith("Assets/Art/FX/"))
        {
            var fx = (TextureImporter)assetImporter;
            fx.textureType = TextureImporterType.Default; fx.alphaIsTransparency = true; fx.sRGBTexture = true;
            fx.mipmapEnabled = true; fx.wrapMode = TextureWrapMode.Clamp; fx.maxTextureSize = 256;
            fx.textureCompression = TextureImporterCompression.CompressedHQ;
            return;
        }
        if (!IsArt(assetPath)) return;
        var ti = (TextureImporter)assetImporter;
        // Tripo textures are 4096 atlases cut into many small islands: at 2048 the props looked soft on a PC screen,
        // and far mip levels smear neighbouring islands together. PC / editor: full 4096 with sharper (Kaiser) mips,
        // a small negative mip bias and 8x anisotropic filtering. Phones keep 2048 (memory); they look sharp at that size.
        ti.maxTextureSize = 4096;
        ti.textureCompression = TextureImporterCompression.CompressedHQ;
        ti.mipmapEnabled = true; ti.mipmapFilter = TextureImporterMipFilter.KaiserFilter; ti.mipMapBias = -0.4f;
        ti.anisoLevel = 8;
        ti.sRGBTexture = true;
        var android = ti.GetPlatformTextureSettings("Android");
        android.overridden = true; android.maxTextureSize = 2048; android.format = TextureImporterFormat.ASTC_6x6;
        ti.SetPlatformTextureSettings(android);
        var web = ti.GetPlatformTextureSettings("WebGL");
        web.overridden = true; web.maxTextureSize = 2048;
        ti.SetPlatformTextureSettings(web);
    }

    // Short clip names and looping, for every rigged character (run once after new models arrive; safe to repeat).
    public static void FixClips()
    {
        foreach (var p in AssetDatabase.FindAssets("t:Model", new[] { "Assets/Art/Characters" }).Select(AssetDatabase.GUIDToAssetPath).Where(IsRigged))
        {
            var mi = (ModelImporter)AssetImporter.GetAtPath(p);
            var defaults = mi.defaultClipAnimations;
            var clips = (mi.clipAnimations != null && mi.clipAnimations.Length > 0) ? mi.clipAnimations : defaults;
            if (clips == null || clips.Length == 0) continue;
            bool changed = false;
            // the model was exported again with other takes: start from its own takes, not the old list
            var takes = defaults.Select(d => d.takeName).ToList();
            if (clips != defaults && (clips.Length != defaults.Length || clips.Any(c => !takes.Contains(c.takeName)))) { clips = defaults; changed = true; }
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
