// Builds the game for the web (a preview to look at in the browser, not a release):
//   Unity.exe -batchmode -projectPath unity -executeMethod LingmuBuild.WebGL -quit   → D:\ClaudeTools\webgl\
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class LingmuBuild
{
    public static void WebGL()
    {
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;   // plain files: any local web server can serve them
        PlayerSettings.WebGL.dataCaching = true;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
        PlayerSettings.productName = "暖云";
        PlayerSettings.defaultWebScreenWidth = 1280; PlayerSettings.defaultWebScreenHeight = 720;
        var scenes = SceneKit.BuildOrder.Select(n => $"Assets/Scenes/{n}.unity").ToArray();
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = scenes, locationPathName = @"D:\ClaudeTools\webgl", target = BuildTarget.WebGL, options = BuildOptions.None });
        Debug.Log($"[Lingmu] WebGL build: {report.summary.result}, {report.summary.totalSize / 1048576} MB, {report.summary.totalTime}, errors {report.summary.totalErrors}");
        if (report.summary.result != BuildResult.Succeeded) EditorApplication.Exit(1);
    }
}
