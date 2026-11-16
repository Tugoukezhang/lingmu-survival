// Top-down picture of a scene with its walk map on top, to find invisible walls (tiles blocked with nothing there)
// and things standing off the land: red = blocked, orange = blocked while playing (home expansion lot), dark = not land.
//   menu Lingmu/Render Walk Maps, or batch: -executeMethod LingmuWalkDebug.Render  → D:/ClaudeTools/unity/walk_<scene>.png
using System.IO;
using Lingmu.World;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

public static class LingmuWalkDebug
{
    const int Px = 24;   // pixels per tile

    [MenuItem("Lingmu/Render Walk Maps")]
    public static void Render()
    {
        foreach (var scene in new[] { "HomeIsland", "Town" })
        {
            EditorSceneManager.OpenScene($"Assets/Scenes/{scene}.unity", OpenSceneMode.Single);
            var walk = Object.FindAnyObjectByType<IslandWalkMap>();
            if (!walk) { Debug.Log($"[Lingmu] walk map: none in {scene}"); continue; }
            int cols = walk.Cols, rows = walk.Rows;
            var cam = new GameObject("walkcam").AddComponent<Camera>(); cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
            cam.orthographic = true; cam.orthographicSize = rows / 2f; cam.aspect = cols / (float)rows;
            cam.transform.position = new Vector3(cols / 2f, 80, -rows / 2f); cam.transform.rotation = Quaternion.Euler(90, 0, 0);
            cam.nearClipPlane = 1; cam.farClipPlane = 200; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.2f, 0.25f, 0.35f);
            var rt = new RenderTexture(cols * Px, rows * Px, 24); cam.targetTexture = rt; cam.Render();
            var tex = new Texture2D(cols * Px, rows * Px, TextureFormat.RGB24, false);
            RenderTexture.active = rt; tex.ReadPixels(new Rect(0, 0, cols * Px, rows * Px), 0, 0); RenderTexture.active = null;
            var lot = scene == "HomeIsland" ? HomeIslandLayout.Generate().ExpandRect : new TileRect(-1, -1, 0, 0);
            for (int ty = 0; ty < rows; ty++)
                for (int tx = 0; tx < cols; tx++)
                {
                    bool inLot = tx >= lot.x && tx < lot.x + lot.w && ty >= lot.y && ty < lot.y + lot.h;
                    Color tint; float k;
                    if (!walk.IsLand(tx, ty)) { tint = Color.black; k = 0.55f; }
                    else if (!walk.IsFree(tx, ty)) { tint = Color.red; k = 0.45f; }
                    else if (inLot) { tint = new Color(1, 0.55f, 0); k = 0.4f; }
                    else continue;
                    for (int py = 0; py < Px; py++)
                        for (int px = 0; px < Px; px++)
                        {
                            int X = tx * Px + px, Y = (rows - 1 - ty) * Px + py;   // texture rows go up, tile rows go down
                            tex.SetPixel(X, Y, Color.Lerp(tex.GetPixel(X, Y), tint, k));
                        }
                }
            for (int t = 0; t <= Mathf.Max(cols, rows); t++)                          // grid: every tile faint, every 5th stronger
                for (int i = 0; i < Mathf.Max(cols, rows) * Px; i++)
                {
                    var c = t % 5 == 0 ? new Color(1, 1, 1, 1) : new Color(1, 1, 1, 0.25f);
                    if (t <= cols && i < rows * Px) { int X = Mathf.Min(t * Px, cols * Px - 1); tex.SetPixel(X, i, Color.Lerp(tex.GetPixel(X, i), c, c.a * 0.5f)); }
                    if (t <= rows && i < cols * Px) { int Y = Mathf.Min(t * Px, rows * Px - 1); tex.SetPixel(i, Y, Color.Lerp(tex.GetPixel(i, Y), c, c.a * 0.5f)); }
                }
            tex.Apply();
            Directory.CreateDirectory("D:/ClaudeTools/unity");
            File.WriteAllBytes($"D:/ClaudeTools/unity/walk_{scene}.png", tex.EncodeToPNG());
            Object.DestroyImmediate(cam.gameObject);
            Debug.Log($"[Lingmu] walk map {scene}: {cols}x{rows}");
        }
    }
}
