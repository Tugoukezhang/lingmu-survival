// Pressing ▶ in the editor always starts the game from the title page, whatever scene happens to be open (the owner
// opens the play copy and just presses play). Batch runs (scene builds, tests) are left alone.
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
static class LingmuPlayFromTitle
{
    const string Title = "Assets/Scenes/Title.unity";

    static LingmuPlayFromTitle()
    {
        if (Application.isBatchMode) return;
        EditorApplication.delayCall += () => EditorSceneManager.playModeStartScene = AssetDatabase.LoadAssetAtPath<SceneAsset>(Title);
    }
}
