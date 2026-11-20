// Player settings kept on the device (PlayerPrefs), not in the save: text size, picture quality, frame rate,
// music and sound volume. Applied once when the game starts and again whenever the settings panel changes them.
using UnityEngine;

namespace Lingmu.UI
{
    public static class Prefs
    {
        const string KText = "lm_text_large", KQuality = "lm_quality", KFps = "lm_fps60", KMusic = "lm_music", KSfx = "lm_sfx";

        public static bool LargeText { get => PlayerPrefs.GetInt(KText, 0) == 1; set { PlayerPrefs.SetInt(KText, value ? 1 : 0); PlayerPrefs.Save(); } }

        // 0 = 流畅 (the "Mobile" quality level), 1 = 精美 ("PC")
        public static int Quality { get => Mathf.Clamp(PlayerPrefs.GetInt(KQuality, DefaultQuality), 0, QualitySettings.names.Length - 1); set { PlayerPrefs.SetInt(KQuality, value); PlayerPrefs.Save(); Apply(); } }
        static int DefaultQuality => Application.isMobilePlatform ? 0 : QualitySettings.names.Length - 1;

        public static bool Fps60 { get => PlayerPrefs.GetInt(KFps, 1) == 1; set { PlayerPrefs.SetInt(KFps, value ? 1 : 0); PlayerPrefs.Save(); Apply(); } }

        public static float Music { get => PlayerPrefs.GetFloat(KMusic, 0.7f); set { PlayerPrefs.SetFloat(KMusic, Mathf.Clamp01(value)); PlayerPrefs.Save(); } }
        public static float Sfx { get => PlayerPrefs.GetFloat(KSfx, 0.8f); set { PlayerPrefs.SetFloat(KSfx, Mathf.Clamp01(value)); PlayerPrefs.Save(); } }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        public static void Apply()
        {
            if (QualitySettings.GetQualityLevel() != Quality) QualitySettings.SetQualityLevel(Quality, true);
            Application.targetFrameRate = Fps60 ? 60 : 30;
        }
    }
}
