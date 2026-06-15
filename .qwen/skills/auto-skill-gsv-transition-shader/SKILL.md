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

### Shader B — Mosaic Load

**Vertex shader:** Pass-through.

**Fragment shader:** If `uMosaic > 1.5`, quantizes UV coordinates into blocks via `floor(uv * 512.0 / blockSize) / (512.0 / blockSize)`. Final opacity via `uOpacity`.

**Key GLSL snippet:**
```glsl
if (uMosaic > 1.5) {
    float blockSize = uMosaic;
    vec2 mosaicUV = floor(uv * 512.0 / blockSize) / (512.0 / blockSize);
    uv = mosaicUV;
}
```

### GSAP Timeline (900ms)

```
0.0s ──────── 0.45s : uStretch A (0 → MAX_STRETCH), uBlur A (0 → 1)
0.0s ──────── 0.45s : uOpacity A (1 → 0)
0.0s ──────── 0.9s  : dolly camera (startPos → endPos)
0.36s ─────── 0.72s : uOpacity B (0 → 1), uMosaic B (20 → 1)
0.45s ─────── 0.9s  : uStretch A (MAX_STRETCH → 0), uBlur A (1 → 0)
0.9s          ───── : finalize()
```

### Critical Implementation Detail — Async Texture Loading

The mosaic shader (B) depends on the target texture being loaded. The GSAP tweens for sphere B **must** be added inside the `.then()` of `loadTextureAsync()`, not at timeline construction time. At timeline build time, `mosaicMat` is still `null`.

```javascript
var mosaicMat = null;
loadTextureAsync(sceneConfig.image).then(function (tex) {
    mosaicMat = createMosaicLoadMaterial(tex);
    nextSphere.material = mosaicMat;
    textureReady = true;

    // Add tweens to existing timeline AFTER texture is ready
    tl.to(mosaicMat.uniforms.uOpacity, { value: 1, ... }, TOTAL_DURATION * 0.4);
    tl.to(mosaicMat.uniforms.uMosaic, { value: 1, ... }, TOTAL_DURATION * 0.4);
});
```

### Common Pitfalls

1. **Adding B-sphere tweens at timeline construction** — `mosaicMat` is `null`, tweens silently fail. Always defer to `.then()`.
2. **Blur samples going out of bounds** — keep `blurStrength` small (≤ 0.012) to avoid sampling outside [0,1] UV range.
3. **Mosaic blockSize = 1** — the `if (uMosaic > 1.5)` guard prevents division-by-zero artifacts when fully resolved.
4. **Stretch mask edge values** — `smoothstep(0.2, 1.2)` keeps the center (0.2) sharp and fades by 1.2, matching GSV's fixed-center-periphery-stretch look.
