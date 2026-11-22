// Pressing ▶ in the editor always starts the game from the title page, whatever scene happens to be open (the owner
// opens the play copy and just presses play). Batch runs (scene builds, tests) are left alone.
// Every scene is built by code (LingmuScenes / HomeIslandBuilder) and nobody edits them by hand, so before play the
// open scene is read again from disk: when the play copy is updated underneath an open editor, Unity kept running the
// old scene from memory (owner 11-22: the title page came up as a blue screen with text — the old title scene with the
// new title code on top).
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
        EditorApplication.playModeStateChanged += s =>
        {
            if (s != PlayModeStateChange.ExitingEditMode) return;
            AssetDatabase.Refresh();
            var open = EditorSceneManager.GetActiveScene();
            if (!string.IsNullOrEmpty(open.path) && !open.isDirty) EditorSceneManager.OpenScene(open.path, OpenSceneMode.Single);
            EditorSceneManager.playModeStartScene = AssetDatabase.LoadAssetAtPath<SceneAsset>(Title);
        };
    }
}
