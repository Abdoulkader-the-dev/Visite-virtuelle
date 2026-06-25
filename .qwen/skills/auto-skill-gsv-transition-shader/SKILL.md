---
name: gsv-transition-shader
description: Custom ShaderMaterial pair (radial stretch + crossfade) for 900ms Google Street View-style transition in Three.js r128
source: auto-skill
extracted_at: '2026-06-15T14:31:20.166Z'
---

## GSV 900ms Transition — Dual ShaderMaterial Technique

### Context
When implementing a Google Street View-style transition between 360° panoramic scenes in Three.js r128, a single 900ms timeline orchestrates two custom shaders: one on the outgoing sphere (A) and one on the incoming sphere (B). Both are `ShaderMaterial` with uniforms animated by GSAP.

### Architecture

**Two separate shader materials, two spheres:**

| Sphere | Shader | Purpose |
|--------|--------|---------|
| A (outgoing) | `createRadialStretchMaterial()` | Radial stretch + motion blur + fade out |
| B (incoming) | `createCrossfadeMaterial()` | Pure opacity crossfade (no mosaic) |

### Shader A — Radial Stretch + Motion Blur

**Vertex shader:** Transforms position to NDC, computes `radius = length(ndc.xy)`, applies `smoothstep(0.2, 1.2, radius)` mask, stretches peripherally via `uStretch` uniform.

**Fragment shader:** 5-sample radial motion blur along the vector from current UV toward center `(0.5, 0.5)`, weighted by `uBlur` uniform. Final opacity via `uOpacity`.

**Key GLSL snippet (vertex):**
```glsl
vec2 ndc = projected.xy / projected.w;
float radius = length(ndc.xy);
float mask = smoothstep(0.2, 1.2, radius);
vec2 dir = (radius > 0.0001) ? (ndc / radius) : vec2(0.0);
projected.xy += dir * uStretch * mask * projected.w;
```

**Key GLSL snippet (fragment — motion blur):**
```glsl
if (uBlur > 0.001) {
    vec2 toCenter = vUv - vec2(0.5);
    float blurStrength = uBlur * 0.012;
    vec4 blurSum = vec4(0.0);
    for (float i = 0.0; i < 5.0; i += 1.0) {
        float t = (i - 2.0) / 2.0;
        vec2 offset = toCenter * blurStrength * t;
        blurSum += texture2D(uMap, vUv - offset);
    }
    blurSum /= 5.0;
    color = mix(color, blurSum, uBlur);
}
```

### Shader B — Crossfade (No Mosaic)

**Vertex shader:** Pass-through.

**Fragment shader:** Pure opacity crossfade. The mosaic/pixellation effect (`uMosaic`) has been **completely removed** — it caused unnecessary visual degradation and made transitions less smooth. The crossfade shader is intentionally minimalist:

```glsl
gl_FragColor = vec4(color.rgb, color.a * uOpacity);
```

**Why no mosaic?** The radial stretch + motion blur on sphere A already creates the characteristic GSV speed effect. Adding mosaic on sphere B was redundant and degraded image quality during the critical reveal moment.

### GSAP Timeline (900ms) — Actual Code Values

```
0.0s ──────── 0.45s : uStretch A (0 → 0.4),      ease power2.out
0.0s ──────── 0.45s : uBlur A (0 → 1.0),         ease power2.out
0.0s ──────── 0.45s : uOpacity A (1 → 0.5),      ease power1.in
0.0s ──────── 0.9s  : dolly camera,              ease power2.inOut
0.4s ──────── 0.76s : uOpacity B (0 → 1),        ease power1.out
0.45s ─────── 0.9s  : uStretch A (0.4 → 0),     ease power2.in
0.45s ─────── 0.9s  : uBlur A (1.0 → 0),         ease power2.in
0.45s ─────── 0.9s  : uOpacity A (0.5 → 0),      ease power1.in
0.9s         ─────── : finalize()
```

Key constants in actual code: `TOTAL_DURATION = 0.9`, `DOLLY_DISTANCE = 80.0`, `MAX_STRETCH = 0.4`.

### Critical Implementation Detail — Async Texture Loading

The crossfade shader (B) depends on the target texture being loaded. The GSAP tweens for sphere B **must** be added inside the `.then()` of `loadTextureAsync()`, not at timeline construction time. At timeline build time, `crossfadeMat` is still `null`.

```javascript
var crossfadeMat = null;
var textureReady = false;

loadTextureAsync(sceneConfig.image).then(function (tex) {
    crossfadeMat = createCrossfadeMaterial(tex);
    nextSphere.material = crossfadeMat;
    nextSphere.material.needsUpdate = true;
    textureReady = true;

    // Add tweens to existing timeline AFTER texture is ready
    tl.to(crossfadeMat.uniforms.uOpacity, {
        value: 1,
        duration: TOTAL_DURATION * 0.4,
        ease: 'power1.out'
    }, TOTAL_DURATION * 0.4);
});
```

The timeline's `onComplete` callback waits for `textureReady` before calling `finalize()`:
```javascript
onComplete: function () {
    (function waitTexture() {
        if (textureReady) {
            finalize(nextSphere, oldSphere, targetSceneId);
        } else {
            setTimeout(waitTexture, 32);
        }
    })();
}
```

### Common Pitfalls

1. **Adding B-sphere tweens at timeline construction** — `crossfadeMat` is `null`, tweens silently fail. Always defer to `.then()`.
2. **Blur samples going out of bounds** — keep `blurStrength` small (≤ 0.015) to avoid sampling outside [0,1] UV range.
3. **Stretch mask edge values** — `smoothstep(0.2, 1.3)` keeps the center sharp and fades by 1.3, matching GSV's fixed-center-periphery-stretch look.
4. **Forgetting `depthWrite: false`** on both sphere materials during transition — without it, z-fighting causes flickering between the two spheres.
