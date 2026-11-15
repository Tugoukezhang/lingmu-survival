// One-time UI setup (safe to repeat): imports the TextMeshPro essentials (shaders, settings) and makes dynamic
// font assets from Noto Sans SC (SIL Open Font License, Assets/Fonts/OFL.txt) in Resources/Fonts, so every Chinese
// character works without baking a fixed character list.
//   Unity.exe -batchmode -projectPath unity -executeMethod LingmuUISetup.Setup -quit
using System.IO;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;

public static class LingmuUISetup
{
    [MenuItem("Lingmu/Setup UI Fonts")]
    public static void Setup()
    {
        if (!AssetDatabase.IsValidFolder("Assets/TextMesh Pro"))
        {
            var pkg = Path.GetFullPath("Packages/com.unity.ugui/Package Resources/TMP Essential Resources.unitypackage");
            Debug.Log("[Lingmu] importing " + pkg);
            AssetDatabase.ImportPackage(pkg, false);
            AssetDatabase.Refresh();
        }
        if (!AssetDatabase.IsValidFolder("Assets/Resources/Fonts")) AssetDatabase.CreateFolder("Assets/Resources", "Fonts");
        foreach (var w in new[] { "Regular", "Bold" }) MakeFont(w);
        AssetDatabase.SaveAssets();
        Debug.Log("[Lingmu] UI fonts ready");
    }

    static void MakeFont(string weight)
    {
        var src = $"Assets/Fonts/NotoSansSC-{weight}.otf";
        var dst = $"Assets/Resources/Fonts/NotoSansSC-{weight} SDF.asset";
        var font = AssetDatabase.LoadAssetAtPath<Font>(src);
        if (!font) { Debug.LogError("[Lingmu] missing font " + src); return; }
        if (AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(dst)) { Debug.Log("[Lingmu] exists " + dst); return; }
        var fa = TMP_FontAsset.CreateFontAsset(font, 56, 6, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, true);
        fa.name = Path.GetFileNameWithoutExtension(dst);
        AssetDatabase.CreateAsset(fa, dst);
        var tex = fa.atlasTextures[0]; tex.name = fa.name + " Atlas";
        AssetDatabase.AddObjectToAsset(tex, fa);
        fa.material.name = fa.name + " Material";
        AssetDatabase.AddObjectToAsset(fa.material, fa);
        // keep the saved asset small: glyphs are added while playing and dropped again on build
        var so = new SerializedObject(fa);
        var clear = so.FindProperty("m_ClearDynamicDataOnBuild");
        if (clear != null) { clear.boolValue = true; so.ApplyModifiedPropertiesWithoutUndo(); }
        EditorUtility.SetDirty(fa);
        Debug.Log("[Lingmu] made " + dst);
    }
}
