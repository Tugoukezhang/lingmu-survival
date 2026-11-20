// Import settings for the game audio (Resources/Audio, made by tools/audio/make_audio.py):
//  - Music/ and Ambience/  long loops → streamed from disk, Vorbis
//  - Sfx/                  short sounds → mono, decompressed on load so they start instantly
using UnityEditor;
using UnityEngine;

public class LingmuAudioImport : AssetPostprocessor
{
    public override uint GetVersion() => 1;

    void OnPreprocessAudio()
    {
        if (!assetPath.StartsWith("Assets/Resources/Audio/")) return;
        var ai = (AudioImporter)assetImporter;
        var s = ai.defaultSampleSettings;
        bool loop = assetPath.Contains("/Music/") || assetPath.Contains("/Ambience/");
        s.compressionFormat = AudioCompressionFormat.Vorbis;
        s.loadType = loop ? AudioClipLoadType.Streaming : AudioClipLoadType.DecompressOnLoad;
        s.quality = loop ? 0.6f : 0.7f;
        s.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
        ai.defaultSampleSettings = s;
        ai.forceToMono = !loop;
        ai.loadInBackground = loop;
    }
}
