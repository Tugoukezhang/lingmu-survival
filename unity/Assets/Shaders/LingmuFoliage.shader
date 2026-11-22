// Trees and bushes that move in the wind (owner 11-21: "现在的树木也是不会动的"). Replaces the imported Lit material of
// the tree / bush models at runtime (World/Foliage.cs), keeping their texture. The higher a vertex is above the model's
// foot, the further it sways (squared, so the trunk stays put); every tree gets its own phase from where it stands, a
// slow gust rolls across the island, and the leaves add a small quick flutter. Soft wrapped light so the painted
// clumps keep their shading, light coming through the leaves when the sun is behind them, sun shadows, fog.
// The shadow and depth passes move the same way, so the shadows sway with the tree.
// Near the camera the leaves dissolve (ordered dither, gone within 1.2 m, solid beyond 3.5 m), so the third-person camera
// swinging into a canopy shows the hero instead of a wall of green; the depth passes dissolve the same way.
Shader "Lingmu/Foliage"
{
    Properties
    {
        _BaseMap ("Texture", 2D) = "white" {}
        _BaseColor ("Tint", Color) = (1, 1, 1, 1)
        _Height ("Model height (m)", Float) = 3
        _Base ("Foot below the pivot (m)", Float) = 0
        _Wind ("Sway at the top (m)", Float) = 0.12
        _WindSpeed ("Wind speed", Float) = 1.1
        _Flutter ("Leaf flutter (m)", Float) = 0.025
        _Wrap ("Light wrap", Range(0, 1)) = 0.45
        _Translucency ("Light through leaves", Range(0, 1)) = 0.35
        _Sphere ("Round canopy shading", Range(0, 1)) = 0.65
        _CanopyAt ("Canopy centre (share of the height)", Range(0.2, 0.9)) = 0.62
        _Bands ("Light / shade bands", Range(0, 1)) = 0.45
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Opaque" "Queue" = "Geometry" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            half4 _BaseColor;
            float _Height, _Base, _Wind, _WindSpeed, _Flutter;
            float _Sphere, _CanopyAt, _Bands;
            half _Wrap, _Translucency;
        CBUFFER_END

        // dissolve near the camera (screen-door), call from fragment shaders with the pixel position
        void CameraFade(float3 ws, float4 positionCS)
        {
            float a = saturate((distance(ws, _WorldSpaceCameraPos) - 1.2) / 2.3);
            if (a >= 1) return;
            uint2 q = uint2(positionCS.xy) % 4;
            const float bayer[16] = { 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 };
            clip(a - (bayer[q.y * 4 + q.x] + 0.5) / 16);
        }

        // where a vertex is pushed by the wind (world space)
        float3 Sway(float3 ws)
        {
            float3 origin = TransformObjectToWorld(float3(0, 0, 0));
            float h = saturate((ws.y - origin.y + _Base) / max(_Height, 0.1));
            float bend = h * h;
            float phase = origin.x * 0.37 + origin.z * 0.29;
            float t = _Time.y * _WindSpeed;
            float gust = 0.65 + 0.35 * sin(t * 0.23 + origin.x * 0.05 + origin.z * 0.03);   // a slow wave across the island
            float s = (sin(t + phase) * 0.75 + sin(t * 1.9 + phase * 1.3) * 0.25) * gust;
            ws.xz += float2(1.0, 0.45) * s * _Wind * bend;
            float f = sin(t * 7.3 + dot(ws, float3(3.1, 2.3, 2.7)));                         // leaves: small and quick
            ws += float3(f, f * 0.6, -f * 0.8) * _Flutter * bend;
            return ws;
        }
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; float3 positionWS : TEXCOORD1; float3 normalWS : TEXCOORD2; half fog : TEXCOORD3; UNITY_VERTEX_INPUT_INSTANCE_ID };

            Varyings vert(Attributes v)
            {
                Varyings o = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(v); UNITY_TRANSFER_INSTANCE_ID(v, o);
                float3 ws = Sway(TransformObjectToWorld(v.positionOS.xyz));
                o.positionWS = ws;
                o.positionCS = TransformWorldToHClip(ws);
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                // round canopy shading (reference video 11-22, "animated cloud trees"): leaf normals lean out from the
                // canopy's centre, so the crown lights as soft clumps instead of a speckle of single leaves; the trunk
                // (low part) keeps its own normals
                float3 origin = TransformObjectToWorld(float3(0, 0, 0));
                float baseY = origin.y - _Base;
                float3 centre = float3(origin.x, baseY + _Height * _CanopyAt, origin.z);
                float3 d = ws - centre; d.y *= 1.25;
                float leaf = smoothstep(0.28, 0.45, saturate((ws.y - baseY) / max(_Height, 0.1)));
                o.normalWS = normalize(lerp(o.normalWS, normalize(d + 1e-4), _Sphere * leaf));
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                CameraFade(i.positionWS, i.positionCS);
                half4 c = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv) * _BaseColor;
                half3 n = normalize(i.normalWS);
                Light sun = GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half ndl = dot(n, sun.direction);
                half wrap = saturate((ndl + _Wrap) / (1 + _Wrap));
                wrap = lerp(wrap, smoothstep(0.32, 0.68, wrap) * 0.85 + wrap * 0.15, _Bands);   // cleaner light / shade, like painted cels
                half3 view = normalize(GetWorldSpaceViewDir(i.positionWS));
                half through = pow(saturate(dot(view, -sun.direction)), 4) * _Translucency * (1 - saturate(ndl));
                half3 light = sun.color * (wrap + through) * lerp(0.35, 1, sun.shadowAttenuation) + SampleSH(n);
                #if defined(_ADDITIONAL_LIGHTS)
                uint count = GetAdditionalLightsCount();
                for (uint li = 0; li < count; li++) { Light l = GetAdditionalLight(li, i.positionWS); light += l.color * l.distanceAttenuation * saturate(dot(n, l.direction) * 0.5 + 0.5); }
                #endif
                half3 col = MixFog(c.rgb * light, i.fog);
                return half4(col, 1);
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
            #pragma multi_compile_instancing
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
            float3 _LightDirection; float3 _LightPosition;
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; };
            Varyings vert(Attributes v)
            {
                Varyings o; UNITY_SETUP_INSTANCE_ID(v);
                float3 ws = Sway(TransformObjectToWorld(v.positionOS.xyz));
                float3 n = TransformObjectToWorldNormal(v.normalOS);
                #if _CASTING_PUNCTUAL_LIGHT_SHADOW
                float3 dir = normalize(_LightPosition - ws);
                #else
                float3 dir = _LightDirection;
                #endif
                float4 cs = TransformWorldToHClip(ApplyShadowBias(ws, n, dir));
                #if UNITY_REVERSED_Z
                cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
                #else
                cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                o.positionCS = cs;
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
            #pragma multi_compile_instancing
            struct Attributes { float4 positionOS : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; };
            Varyings vert(Attributes v) { Varyings o; UNITY_SETUP_INSTANCE_ID(v); o.positionWS = Sway(TransformObjectToWorld(v.positionOS.xyz)); o.positionCS = TransformWorldToHClip(o.positionWS); return o; }
            half4 frag(Varyings i) : SV_Target { CameraFade(i.positionWS, i.positionCS); return 0; }
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
            #pragma multi_compile_instancing
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD0; float3 positionWS : TEXCOORD1; };
            Varyings vert(Attributes v) { Varyings o; UNITY_SETUP_INSTANCE_ID(v); o.positionWS = Sway(TransformObjectToWorld(v.positionOS.xyz)); o.positionCS = TransformWorldToHClip(o.positionWS); o.normalWS = TransformObjectToWorldNormal(v.normalOS); return o; }
            half4 frag(Varyings i) : SV_Target { CameraFade(i.positionWS, i.positionCS); return half4(normalize(i.normalWS), 0); }
            ENDHLSL
        }
    }
    FallBack Off
}
