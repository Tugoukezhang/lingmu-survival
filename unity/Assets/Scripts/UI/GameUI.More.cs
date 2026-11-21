// HUD panels ported from the web version's top-right buttons: daily tasks (任务), the island map (地图) and settings (设置).
using System.Collections.Generic;
using System.Linq;
using Lingmu.Game;
using Lingmu.Player;
using Lingmu.Rules;
using Lingmu.World;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using static Lingmu.UI.UiKit;

namespace Lingmu.UI
{
    public partial class GameUI
    {
        // ---------- settings ----------
        void FillSettings()
        {
            var s = session.S;
            var b = NewBox("设置", new Vector2(1180, 900));
            var when = s.savedAt > 0 ? System.DateTimeOffset.FromUnixTimeMilliseconds(s.savedAt).ToLocalTime().ToString("HH:mm") : "--:--";
            var saved = Label(b, $"进度会自动保存（上次 {when}）", FsSub, Hex("8a7458"));
            saved.rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -96), new Vector2(1000, 44));
            float y = -156;
            RectTransform Row(string label)
            {
                var row = Panel(b, "row " + label, CreamDark, RoundSmall, false).rectTransform.Place(new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, y), new Vector2(1060, 108));
                var t = Label(row, label, FsBody, WoodDark, true, TextAlignmentOptions.Left); t.rectTransform.Place(new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(30, 0), new Vector2(300, 60));
                y -= 120;
                return row;
            }
            void Choice(RectTransform row, string[] options, int current, System.Action<int> pick)
            {
                for (int i = 0; i < options.Length; i++)
                {
                    int k = i;
                    var bt = Button(row, options[i], i == current ? Picked : Cream, WoodDark, FsSub, () => { pick(k); Fill("settings"); });
                    ((RectTransform)bt.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-20 - (options.Length - 1 - i) * 232, 0), new Vector2(220, TouchMin));
                }
            }
            void Volume(RectTransform row, float value, System.Action<float> set)
            {
                var bar = MakeBar(row, "volume", Grass); bar.root.Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-130, 0), new Vector2(330, 40));
                SetBar(bar, value, Mathf.RoundToInt(value * 100) + "%");
                var minus = Button(row, "−", Cream, WoodDark, 44, () => { set(Mathf.Max(0, Mathf.Round(value * 10 - 1) / 10)); Fill("settings"); }, Circle);
                ((RectTransform)minus.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-474, 0), new Vector2(TouchMin, TouchMin));
                var plus = Button(row, "+", Cream, WoodDark, 44, () => { set(Mathf.Min(1, Mathf.Round(value * 10 + 1) / 10)); Fill("settings"); }, Circle);
                ((RectTransform)plus.transform).Place(new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-20, 0), new Vector2(TouchMin, TouchMin));
            }
            Choice(Row("字号"), new[] { "标准", "大" }, Prefs.LargeText ? 1 : 0, k => { Prefs.LargeText = k == 1; ApplyTextScale(transform); });
            Choice(Row("画质"), new[] { "流畅", "精美" }, Prefs.Quality, k => Prefs.Quality = k);
            Choice(Row("帧率"), new[] { "省电 30", "流畅 60" }, Prefs.Fps60 ? 1 : 0, k => Prefs.Fps60 = k == 1);
            Volume(Row("音乐"), Prefs.Music, v => { Prefs.Music = v; GameAudio.Refresh(); });
            Volume(Row("音效"), Prefs.Sfx, v => { Prefs.Sfx = v; GameAudio.Refresh(); });

            bool guideLeft = !Guide.Done(s);
            if (guideLeft)
            {
                bool off = Guide.State(s).off;
                var g = Button(b, off ? "打开新手目标" : "关闭新手目标", Grass, Color.white, FsBody, () => { Guide.SetOff(s, !off); session.Save(); RefreshHud(); Fill("settings"); });
                ((RectTransform)g.transform).Place(new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(-14, 40), new Vector2(340, 96));
            }
            var title = Button(b, "回到标题页", Yellow, WoodDark, FsBody, () => { session.Save(); Close(); SceneManager.LoadScene("Title"); });
            ((RectTransform)title.transform).Place(new Vector2(0.5f, 0), new Vector2(guideLeft ? 0 : 0.5f, 0), new Vector2(guideLeft ? 14 : 0, 40), new Vector2(340, 96));
        }
    }
}
