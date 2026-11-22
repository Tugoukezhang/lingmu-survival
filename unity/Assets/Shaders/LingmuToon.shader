// Characters and pets in the painted-film look (reference video 11-22, "cel wanderer"): three tones instead of smooth
// realistic shading — the lit colour, a separate cool shadow tone (not just darker) and a deeper tone in the folds —
// a soft rim light on the edge away from the camera, and a thin warm-brown outline (never black: the base colour pressed
// darker and warmer). Cheap enough for phones: one light, spherical-harmonics fill, an inverted-hull outline pass.
// World/Toon.cs puts it on the hero and the pets at runtime, keeping each model's own texture.
Shader "Lingmu/Toon"
{
    Properties
    {
        _BaseMap ("Texture", 2D) = "white" {}
        _BaseColor ("Tint", Color) = (1, 1, 1, 1)
        _ShadowTint ("Shadow tone (cool)", Color) = (0.70, 0.74, 0.92, 1)
        _DeepTint ("Fold tone", Color) = (0.55, 0.52, 0.72, 1)
        _Step ("Light / shadow edge", Range(0, 1)) = 0.48
        _Soft ("Edge softness", Range(0.001, 0.3)) = 0.07
        _Ambient ("Sky fill", Range(0, 1)) = 0.35
        _RimColor ("Rim light", Color) = (1, 0.95, 0.85, 1)
        _Rim ("Rim strength", Range(0, 1)) = 0.35
        _OutlineColor ("Outline (× base colour)", Color) = (0.42, 0.30, 0.26, 1)
        _OutlineWidth ("Outline width", Range(0, 0.01)) = 0.0028
        _Blink ("Blink (0 open, 1 shut)", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Opaque" "Queue" = "Geometry" }

        HLSLINCLUDE
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4 _BaseColor, _ShadowTint, _DeepTint, _RimColor, _OutlineColor;
                half _Step, _Soft, _Ambient, _Rim, _OutlineWidth, _Blink;
            CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; float3 positionWS : TEXCOORD1; float3 normalWS : TEXCOORD2; half fog : TEXCOORD3; };

            Varyings vert(Attributes v)
            {
                Varyings o;
                o.positionWS = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(o.positionWS);
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                half4 base = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv) * _BaseColor;
                half3 n = normalize(i.normalWS);
                half3 v = normalize(GetWorldSpaceViewDir(i.positionWS));
                Light sun = GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half ndl = dot(n, sun.direction) * 0.5 + 0.5;
                half shade = smoothstep(_Step - _Soft, _Step + _Soft, ndl);
                half shadow = smoothstep(0.35, 0.65, sun.shadowAttenuation);
                half lit = shade * shadow;
                half deep = smoothstep(_Step * 0.55 + _Soft, _Step * 0.55 - _Soft, ndl);     // the folds turned well away
                half3 tone = lerp(lerp(_ShadowTint.rgb, _DeepTint.rgb, deep), half3(1, 1, 1), lit);
                half3 sunCol = sun.color / max(1, max(sun.color.r, max(sun.color.g, sun.color.b)) * 0.85);   // keep the cels from blowing out
                half3 col = base.rgb * tone * sunCol;
                col += base.rgb * SampleSH(n) * _Ambient;
                half rim = pow(saturate(1 - dot(n, v)), 3) * _Rim * (0.4 + 0.6 * lit);
                col += _RimColor.rgb * rim;
                #if defined(_ADDITIONAL_LIGHTS)
                uint count = GetAdditionalLightsCount();
                for (uint li = 0; li < count; li++) { Light l = GetAdditionalLight(li, i.positionWS); col += base.rgb * l.color * l.distanceAttenuation * smoothstep(0.4, 0.6, dot(n, l.direction) * 0.5 + 0.5) * 0.6; }
                #endif
                return half4(MixFog(col, i.fog), 1);
            }
            ENDHLSL
        }

        // the outline: the back faces pushed out a little along the normals (constant width on screen), coloured from the
        // texture pressed darker and warmer
        Pass
        {
            Name "Outline"
            Tags { "LightMode" = "SRPDefaultUnlit" }
            Cull Front
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; half fog : TEXCOORD1; };
            Varyings vert(Attributes v)
            {
                Varyings o;
                float4 cs = TransformObjectToHClip(v.positionOS.xyz);
                float3 nCS = mul((float3x3)UNITY_MATRIX_VP, TransformObjectToWorldNormal(v.normalOS));
                float2 off = normalize(nCS.xy + 1e-5) * _OutlineWidth * cs.w;
                off.x *= _ScreenParams.y / _ScreenParams.x;
                cs.xy += off * 2;
                o.positionCS = cs;
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.fog = ComputeFogFactor(cs.z);
                return o;
            }
            half4 frag(Varyings i) : SV_Target
            {
                half3 base = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).rgb * _BaseColor.rgb;
                return half4(MixFog(base * _OutlineColor.rgb, i.fog), 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            float3 _LightDirection;
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes v)
            {
                Varyings o;
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                float3 n = TransformObjectToWorldNormal(v.normalOS);
                o.positionCS = TransformWorldToHClip(ApplyShadowBias(ws, n, _LightDirection));
                #if UNITY_REVERSED_Z
                o.positionCS.z = min(o.positionCS.z, UNITY_NEAR_CLIP_VALUE);
                #else
                o.positionCS.z = max(o.positionCS.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                return o;
            }
            half4 frag(Varyings i) : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On ColorMask R
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes v) { Varyings o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); return o; }
            half4 frag(Varyings i) : SV_Target { return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }
            ZWrite On
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD0; };
            Varyings vert(Attributes v) { Varyings o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.normalWS = TransformObjectToWorldNormal(v.normalOS); return o; }
            half4 frag(Varyings i) : SV_Target { return half4(normalize(i.normalWS), 0); }
            ENDHLSL
        }
    }
}
