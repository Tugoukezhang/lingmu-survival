// Shallow pond water (IslandTerrain builds the surface from the pond tiles; vertex colour red = depth, 0 at the shore
// … 1 in the middle). Bright stylised look like the reference worlds:
//  - clear turquoise at the edge, deeper blue in the middle; see-through near the shore so the painted sand shows
//  - two ripple normal maps drifting in different directions, plus little rings that appear here and there and spread
//    out (like a fish or a falling leaf), so the surface is never still
//  - the sky reflected at a glancing angle (fresnel), a sharp sun glint and sparkles on the ripples
//  - a soft foam line that laps at the shore
// Receives the sun's shadows (trees), fog. One pass, cheap enough for phones.
Shader "Lingmu/Water"
{
    Properties
    {
        _NormalMap ("Ripple normal map", 2D) = "bump" {}
        _Shallow ("Shallow colour", Color) = (0.3, 0.78, 0.8, 1)
        _Deep ("Deep colour", Color) = (0.07, 0.38, 0.64, 1)
        _Sky ("Reflected sky", Color) = (0.62, 0.8, 0.96, 1)
        _Foam ("Foam colour", Color) = (1, 1, 1, 1)
        _RippleScale ("Ripple size (tiles per metre)", Float) = 0.45
        _RippleSpeed ("Ripple drift", Float) = 0.05
        _RippleStrength ("Ripple strength", Range(0, 1.5)) = 0.7
        _Rings ("Ring ripples", Range(0, 1)) = 1
        _Gloss ("Sun glint sharpness", Float) = 220
        _Glint ("Sun glint strength", Float) = 2.2
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "Transparent-10" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Back

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_NormalMap); SAMPLER(sampler_NormalMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _NormalMap_ST;
                half4 _Shallow, _Deep, _Sky, _Foam;
                float _RippleScale, _RippleSpeed;
                half _RippleStrength, _Rings, _Gloss, _Glint;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; half4 color : COLOR; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                half depth : TEXCOORD1;
                half fog : TEXCOORD2;
            };

            Varyings vert(Attributes v)
            {
                Varyings o;
                o.positionWS = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(o.positionWS);
                o.depth = v.color.r;
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            float hash21(float2 p) { p = frac(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return frac(p.x * p.y); }

            // spreading rings: one per 2 m cell, each at its own spot and time; returns the slope (xz) they add
            float2 rings(float2 p, float t)
            {
                float2 slope = 0;
                float2 cell = floor(p / 2);
                for (int j = -1; j <= 1; j++)
                for (int i = -1; i <= 1; i++)
                {
                    float2 c = cell + float2(i, j);
                    float r1 = hash21(c), r2 = hash21(c + 17.3), r3 = hash21(c + 41.7);
                    float period = 3.5 + r3 * 3;
                    float age = frac(t / period + r1) * period;      // seconds since this cell's ring started
                    float2 centre = (c + 0.2 + 0.6 * float2(r1, r2)) * 2;
                    float2 d = p - centre; float dist = length(d);
                    float radius = age * 0.55;
                    float x = dist - radius;
                    float wave = sin(x * 26) * exp(-x * x * 90) * saturate(1 - age / 2.6) * saturate(age * 4);
                    slope += d / max(dist, 1e-3) * wave;
                }
                return slope;
            }

            half4 frag(Varyings i) : SV_Target
            {
                float t = _Time.y;
                float2 p = i.positionWS.xz;
                half d = saturate(i.depth);
                // ripples: two drifting normal maps (whiteout blend) and the rings
                float2 uv1 = p * _RippleScale + float2(t * _RippleSpeed, t * _RippleSpeed * 0.6);
                float2 uv2 = p * _RippleScale * 1.9 + float2(-t * _RippleSpeed * 0.8, t * _RippleSpeed * 1.1);
                half3 n1 = UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap, sampler_NormalMap, uv1));
                half3 n2 = UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap, sampler_NormalMap, uv2));
                half2 slope = (n1.xy + n2.xy) * _RippleStrength * 0.5 + rings(p, t) * 0.35 * _Rings;
                half3 n = normalize(half3(slope.x, 1, slope.y));         // tangent space → world (the pond is flat, facing up)

                float4 shadowCoord = TransformWorldToShadowCoord(i.positionWS);
                Light sun = GetMainLight(shadowCoord);
                half shadow = lerp(0.55, 1, sun.shadowAttenuation);
                half3 V = normalize(GetWorldSpaceViewDir(i.positionWS));
                half3 H = normalize(sun.direction + V);

                // body colour: turquoise at the edge, blue in the middle, a little light and dark from the ripples
                half3 body = lerp(_Shallow.rgb, _Deep.rgb, smoothstep(0.35, 0.8, d));
                half3 ambient = SampleSH(half3(0, 1, 0));
                body *= (saturate(dot(n, sun.direction)) * 0.35 + 0.65) * sun.color * shadow + ambient * 0.35;
                // the sky at a glancing angle
                half fres = pow(1 - saturate(dot(n, V)), 4);
                half3 col = lerp(body, _Sky.rgb * (sun.color * 0.5 + ambient * 0.6), saturate(fres * 0.55 + 0.04));
                // sun glint and sparkles where the ripples catch the sun
                half spec = pow(saturate(dot(n, H)), _Gloss) * _Glint;
                half sparkle = step(0.985, saturate(dot(n, H))) * step(0.6, hash21(floor(p * 40) + floor(t * 6)));
                col += sun.color * (spec + sparkle * 0.8) * sun.shadowAttenuation;
                // foam lapping at the shore: a thin line near the edge that comes and goes, broken up by the ripples
                half lap = sin(t * 1.3 + p.x * 0.9 + p.y * 0.7) * 0.03;
                half edge = d - 0.4 - lap + (n1.x + n2.y) * 0.04;
                half broken = saturate(0.55 + (n1.y - n2.x) * 2.5);
                half foam = smoothstep(0.045, 0.01, abs(edge)) * broken * 0.75;
                col = lerp(col, _Foam.rgb * (sun.color * shadow * 0.8 + ambient * 0.4), saturate(foam));
                // see-through at the shore (the painted sand rim shows), solid towards the middle
                half alpha = smoothstep(0.3, 0.46, d) * lerp(0.8, 0.95, d) + saturate(foam) * 0.5 + spec * 0.2;
                col = MixFog(col, i.fog);
                return half4(col, saturate(alpha));
            }
            ENDHLSL
        }
    }
    FallBack Off
}
