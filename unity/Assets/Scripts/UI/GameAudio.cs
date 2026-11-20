// Music, ambience and sound effects. Clips live in Resources/Audio (made by tools/audio/make_audio.py, all our own
// synthesized sound): Music/<track>, Ambience/<loop>, Sfx/<name>. A missing clip is simply skipped.
// Which music and ambience play is decided here every half second from the game state (area, day phase, battle),
// so the rest of the code only calls GameAudio.Play("…") for one-off sounds.
using System.Collections.Generic;
using Lingmu.Game;
using Lingmu.Rules;
using UnityEngine;

namespace Lingmu.UI
{
    public class GameAudio : MonoBehaviour
    {
        static GameAudio inst;
        static readonly Dictionary<string, AudioClip> cache = new Dictionary<string, AudioClip>();

        AudioSource[] music = new AudioSource[2]; int activeMusic;
        AudioSource amb, sfx;
        string musicName, ambName;
        float ambGain = 1, musicGain = 1, nextCheck;
        float fade = 1;   // 0 → 1 while crossfading

        static GameAudio I
        {
            get
            {
                if (!inst)
                {
                    var go = new GameObject("GameAudio");
                    DontDestroyOnLoad(go);
                    inst = go.AddComponent<GameAudio>();
                }
                return inst;
            }
        }

        void Awake()
        {
            for (int i = 0; i < 2; i++) { music[i] = gameObject.AddComponent<AudioSource>(); music[i].loop = true; music[i].playOnAwake = false; }
            amb = gameObject.AddComponent<AudioSource>(); amb.loop = true; amb.playOnAwake = false;
            sfx = gameObject.AddComponent<AudioSource>(); sfx.playOnAwake = false;
            // the generated scenes have no AudioListener; all our sounds are 2D, so one on this object is enough
            if (!FindAnyObjectByType<AudioListener>()) gameObject.AddComponent<AudioListener>();
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot() { if (Application.isPlaying) { var _ = I; } }

        static AudioClip Clip(string path)
        {
            if (!cache.TryGetValue(path, out var c)) cache[path] = c = Resources.Load<AudioClip>("Audio/" + path);
            return c;
        }

        // ---------- one-off sounds ----------
        static readonly Dictionary<string, float> lastPlayed = new Dictionary<string, float>();
        public static void Play(string name, float volume = 1, float pitchJitter = 0.04f)
        {
            if (!Application.isPlaying) return;
            var c = Clip("Sfx/" + name);
            if (!c) return;
            float now = Time.unscaledTime;
            if (lastPlayed.TryGetValue(name, out var t) && now - t < 0.05f) return;   // the same sound twice in one frame
            lastPlayed[name] = now;
            var s = I.sfx;
            s.pitch = 1 + Random.Range(-pitchJitter, pitchJitter);
            s.PlayOneShot(c, volume * Prefs.Sfx);
        }

        public static void Refresh() { if (inst) inst.ApplyVolumes(); }

        // a sound for the verb of an action spot (farm, gathering)
        public static void Verb(string verb)
        {
            if (string.IsNullOrEmpty(verb)) return;
            string n = verb.Contains("浇") ? "water" : verb.Contains("播") ? "plant" : verb.Contains("收获") ? "harvest" : verb.Contains("开垦") ? "dig"
                : verb.Contains("砍") ? "chop" : verb.Contains("敲") || verb.Contains("挖") ? "mine" : verb.Contains("摘") || verb.Contains("捡") ? "pick"
                : verb.Contains("打开") ? "chest" : null;
            if (n != null) Play(n);
        }

        // ---------- music and ambience ----------
        void Update()
        {
            if (fade < 1)
            {
                fade = Mathf.Min(1, fade + Time.unscaledDeltaTime / 1.2f);
                ApplyVolumes();
                if (fade >= 1) music[1 - activeMusic].Stop();
            }
            if (Time.unscaledTime < nextCheck) return;
            nextCheck = Time.unscaledTime + 0.5f;
            var g = GameSession.I;
            string m, a; float ag = 1, mg = 1;
            if (!g || g.S == null) { m = "home"; a = null; }
            else
            {
                bool night = GameTime.PhaseAt(g.S.clock) == "night";
                string area = g.Area ? g.Area.Id : "home";
                if (g.Battle != null && g.Battle.over == null) { m = "battle"; a = null; }
                else if (area == "expedition") { m = "explore"; a = night ? "fog" : "wind"; mg = night ? 0.6f : 1; }
                else { m = "home"; a = night ? "night" : "day"; ag = area == "house" ? 0.35f : 1; mg = night ? 0.7f : 1; }
            }
            SetMusic(m); SetAmbience(a);
            if (ag != ambGain || mg != musicGain) { ambGain = ag; musicGain = mg; ApplyVolumes(); }
        }

        void SetMusic(string name)
        {
            if (name == musicName) return;
            var c = name != null ? Clip("Music/" + name) : null;
            musicName = name;
            activeMusic = 1 - activeMusic;
            var src = music[activeMusic];
            src.clip = c;
            if (c) src.Play(); else src.Stop();
            fade = 0;
            ApplyVolumes();
        }

        void SetAmbience(string name)
        {
            if (name == ambName) return;
            ambName = name;
            var c = name != null ? Clip("Ambience/" + name) : null;
            amb.clip = c;
            if (c) amb.Play(); else amb.Stop();
            ApplyVolumes();
        }

        void ApplyVolumes()
        {
            float mv = Prefs.Music * 0.55f * musicGain;
            music[activeMusic].volume = mv * fade;
            music[1 - activeMusic].volume = mv * (1 - fade);
            amb.volume = Prefs.Sfx * 0.45f * ambGain;
        }
    }
}
