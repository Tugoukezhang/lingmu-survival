// Grass tufts and little flowers scattered over the islands (drawn instanced by GrassField).
// Alpha-cut card, sways in the wind (more at the tip), lit like the ground under it (up-facing normal, so both sides
// look the same), darker at the root, receives the sun's shadows, fog. Cheap enough for phones.
// _Cells 2: the texture is a 2×2 sheet and every clump picks one picture from where it stands; _Vary: every clump and
// every patch of meadow gets a slightly different shade (bluer and darker or warmer and lighter), so it isn't a carpet.
Shader "Lingmu/Grass"
{
    Properties
    {
        _BaseMap ("Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _Cutoff ("Alpha cutoff", Range(0, 1)) = 0.45
        _Wind ("Wind strength (m)", Float) = 0.06
        _WindSpeed ("Wind speed", Float) = 1.6
        _RootShade ("Root shade", Range(0, 1)) = 0.55
        _Cells ("Sheet cells per side (1 or 2)", Float) = 1
        _Vary ("Shade variation", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "AlphaTest" "RenderType" = "TransparentCutout" "IgnoreProjector" = "True" }
        Cull Off

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4 _Color;
                half _Cutoff;
                float _Wind;
                float _WindSpeed;
                half _RootShade;
                float _Cells;
                half _Vary;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                half fog : TEXCOORD2;
                half3 tint : TEXCOORD3;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            Varyings vert(Attributes v)
            {
                Varyings o = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_TRANSFER_INSTANCE_ID(v, o);
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                float3 origin = TransformObjectToWorld(float3(0, 0, 0));   // where this clump stands
                float r1 = frac(sin(dot(origin.xz, float2(12.9898, 78.233))) * 43758.5453);
                float r2 = frac(sin(dot(origin.xz, float2(39.346, 11.135))) * 24634.6345);
                float h = v.uv.y;                                   // 0 at the root, 1 at the tip
                float phase = ws.x * 0.73 + ws.z * 0.51;
                float t = _Time.y * _WindSpeed;
                float sway = sin(t + phase) * 0.7 + sin(t * 2.31 + phase * 1.7) * 0.3;
                ws.xz += float2(sway, sway * 0.45) * _Wind * h * h;
                o.positionWS = ws;
                o.positionCS = TransformWorldToHClip(ws);
                float2 uv = TRANSFORM_TEX(v.uv, _BaseMap);
                if (_Cells > 1.5) uv = (uv + float2(floor(r1 * 2), floor(r2 * 2))) * 0.5;
                o.uv = uv;
                float patch = sin(origin.x * 0.21 + 1.3) * sin(origin.z * 0.17 + 0.4) * 0.5 + 0.5;   // big soft patches
                float k = saturate(lerp(r2, patch, 0.6));
                o.tint = lerp(half3(1, 1, 1), lerp(half3(0.72, 0.84, 0.8), half3(1.02, 1.0, 0.84), k), _Vary);
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                half4 c = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv) * _Color;
                clip(c.a - _Cutoff);
                float4 shadowCoord = TransformWorldToShadowCoord(i.positionWS);
                Light sun = GetMainLight(shadowCoord);
                half3 up = half3(0, 1, 0);
                half ndl = saturate(dot(up, sun.direction)) * 0.75 + 0.25;
                half3 light = sun.color * ndl * sun.shadowAttenuation + SampleSH(up);
                float tipT = _Cells > 1.5 ? frac(i.uv.y * 2) : i.uv.y;  // height inside its own picture
                half3 col = c.rgb * i.tint * light * lerp(_RootShade, 1.05, saturate(tipT * 1.4));
                col = MixFog(col, i.fog);
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
