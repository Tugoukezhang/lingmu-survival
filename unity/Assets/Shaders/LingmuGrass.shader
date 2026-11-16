// Grass tufts and little flowers scattered over the islands (drawn instanced by GrassField).
// Alpha-cut card, sways in the wind (more at the tip), lit like the ground under it (up-facing normal, so both sides
// look the same), darker at the root, receives the sun's shadows, fog. Cheap enough for phones.
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
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            Varyings vert(Attributes v)
            {
                Varyings o = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_TRANSFER_INSTANCE_ID(v, o);
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                float h = v.uv.y;                                   // 0 at the root, 1 at the tip
                float phase = ws.x * 0.73 + ws.z * 0.51;
                float t = _Time.y * _WindSpeed;
                float sway = sin(t + phase) * 0.7 + sin(t * 2.31 + phase * 1.7) * 0.3;
                ws.xz += float2(sway, sway * 0.45) * _Wind * h * h;
                o.positionWS = ws;
                o.positionCS = TransformWorldToHClip(ws);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
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
                half3 col = c.rgb * light * lerp(_RootShade, 1.05, saturate(i.uv.y * 1.4));
                col = MixFog(col, i.fog);
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
