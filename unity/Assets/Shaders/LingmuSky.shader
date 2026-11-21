// The sky (owner 11-21: clouds and sky like the Ghibli / fan-made reference videos): a clean painted gradient instead of
// the old panorama, deep blue overhead, pale and warm at the horizon, a soft glow around the sun, and below the horizon
// the colour of the cloud sea. _Tint (0.5 = neutral) and _Exposure are driven by GameSession.ApplyLight for the time of
// day, like the panorama shader they replace. The big clouds and the far islands are separate cards (World/Backdrop).
Shader "Lingmu/Sky"
{
    Properties
    {
        _Zenith ("Overhead", Color) = (0.24, 0.49, 0.82, 1)
        _Horizon ("Horizon", Color) = (0.74, 0.86, 0.95, 1)
        _Below ("Below the horizon", Color) = (0.86, 0.91, 0.97, 1)
        _Warm ("Warm band at the horizon", Color) = (1.0, 0.93, 0.82, 1)
        _SunGlow ("Sun glow", Range(0, 2)) = 0.6
        _Tint ("Tint (0.5 = none)", Color) = (0.5, 0.5, 0.5, 0.5)
        _Exposure ("Exposure", Range(0, 8)) = 1
        [HideInInspector] _Rotation ("Rotation", Float) = 0
        [HideInInspector] _MainTex ("unused", 2D) = "white" {}
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/RealtimeLights.hlsl"
            CBUFFER_START(UnityPerMaterial)
                half4 _Zenith, _Horizon, _Below, _Warm, _Tint;
                half _SunGlow, _Exposure;
                float _Rotation;
            CBUFFER_END
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; };
            Varyings vert(Attributes v) { Varyings o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.dir = v.positionOS.xyz; return o; }
            half4 frag(Varyings i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float y = d.y;
                half3 col = lerp(_Horizon.rgb, _Zenith.rgb, pow(saturate(y), 0.55));        // up: horizon → deep blue
                col = lerp(col, _Warm.rgb, exp(-abs(y) * 18) * 0.3);                     // a warm haze right at the horizon
                col = lerp(col, _Below.rgb, smoothstep(0, -0.12, y));                     // below: the cloud sea's colour
                Light sun = GetMainLight();
                float s = saturate(dot(d, sun.direction));
                col += sun.color * (pow(s, 600) * 2.5 + pow(s, 40) * 0.35 + pow(s, 6) * 0.12) * _SunGlow;
                col *= _Tint.rgb * 2 * _Exposure;
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
