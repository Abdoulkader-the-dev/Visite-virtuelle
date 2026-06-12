---
name: three-js-vr-debugging
description: Bug-fixing methodology for Three.js r128 360° virtual tour projects
source: auto-skill
extracted_at: '2026-06-10T09:38:06.357Z'
---

# Three.js 360° Virtual Tour Debugging

## Context

This skill applies to panoramic virtual tour projects built with:
- **Three.js r128** (SphereGeometry, WebGLRenderer, Raycaster, ShaderMaterial)
- **JavaScript Vanilla** (IIFE module pattern — no framework)
- Architecture: `config.js → state.js → controls.js → transition.js → hotspots.js → ui.js → main.js`
- Global state: `window.tourState`
- Configuration: `window.TOUR_CONFIG.scenes[id].hotspots[]`
- Geometry: `SphereGeometry(500, 60, 40)` with `geo.scale(-1, 1, 1)` for inside-face rendering

## Common Bug Patterns and How to Diagnose Them

### 1. Black Screen — `currentScene` Mismatch

**Symptom:** Screen stays black after loading, no panoramic image visible.

**Root cause pattern:** `tourState.currentScene` initialized to an ID that doesn't exist in `config.js`.

**Diagnosis steps:**
1. Open `state.js`, find the initial value of `currentScene`.
2. Open `config.js`, check what IDs exist in `window.TOUR_CONFIG.scenes` (the keys of the object).
3. Verify the initial ID exists in the config.

**Fix:** Change `currentScene` in `state.js` to match a valid first scene in `config.js`.

**Why it's easy to miss:** `main.js` has a fallback in `getStartParams()` (reading `?scene=` from URL), but `currentScene` is used by other modules *before* `loadScene()` runs (e.g., `initHotspots()`, `updateNavMenu()`).

---

### 2. Feature Silently Dead — Early `return;` Sabotage

**Symptom:** A feature (e.g., floor hotspot) never appears, but the code looks complete and correct.

**Root cause pattern:** The function has been sabotaged with an early `return;` or `hideFeature(); return;` right after the function signature, making all subsequent code unreachable (dead code).

**Diagnosis steps:**
1. Find the function in question (e.g., `updateFloorHotspot`).
2. Look at the **first statements** inside the function body.
3. If you see a pattern like:
   ```js
   function updateFeature(param) {
       hideFeature();  // or: returnFeatureToDefault();
       return;         // ← kills everything below
       // ... 200 lines of correct-looking code ...
   }
   ```
   Then the function is short-circuited.

**Fix:** Remove the premature `hideFeature();` and `return;` lines. Preserve all the code below — it's the real logic.

**How to search systematically:** For any "non-working" feature in a virtual tour, always inspect the first 3 lines of the update/render function for early returns before reading the rest.

---

### 3. Transition Effect Too Subtle — Constants Too Small

**Symptom:** Transitions feel laggy or effects (dolly-in, radial stretch) are invisible.

**Root cause pattern:** Numerical constants are too small relative to the scene scale.

**Key ratios to check on a sphere of radius 500:**

| Constant | Too small | Correct range | Ratio |
|---|---|---|---|
| `DOLLY_DISTANCE` | 2.5–5 | 60–100 | ~12–20% of radius |
| `TOTAL_DURATION` | 1200–1400ms | 700–1000ms | — |
| `STRETCH_DURATION` | 500ms+ | 350–500ms | ≤ TOTAL_DURATION |

**Diagnosis steps:**
1. Read `transition.js` → `triggerGSVTransition()` → variable declarations.
2. Calculate: `DOLLY_DISTANCE / 500 * 100` = percentage of radius. If < 2%, the dolly is imperceptible.
3. Compare `TOTAL_DURATION` against user's expectation (snappy = ≤ 900ms, cinematic = 1000–1200ms).

---

### 4. Radial Stretch Shader — Center Also Stretching

**Symptom:** The entire image warps including the center/horizon, causing visual discomfort.

**Root cause pattern:** The `smoothstep` threshold in the vertex shader starts too close to the center.

**Diagnosis steps:**
1. Find `createRadialStretchMaterial()` in `transition.js`.
2. Look for the line: `float edge = smoothstep(A, B, radius);`
3. If `A < 0.20`, the center is being stretched.

**Fix:** Change `smoothstep(A, B, radius)` to `smoothstep(0.25, 1.4, radius)`.

**Why:** In NDC space, radius 0 = center of screen, radius ~1.4 = corner. With smoothstep(0.25, 1.4):
- radius < 0.25 (center 25% of screen) → edge = 0 → no displacement (horizon stays fixed)
- radius > 1.4 (far periphery) → edge = 1 → full stretch
- The `uStretch` uniform controls max displacement (typical: 0.0 → 0.38)
- The variable should also be renamed from `direction` (reserved in newer GLSL) to `dir`.

Also apply `stretch = edge * edge * uStretch` (squared) for smoother falloff.

---

### 5. Dolly Moving in Wrong Direction

**Symptom:** Camera dolly-in goes toward screen center instead of toward the hotspot the user clicked.

**Root cause pattern:** `dollyTarget` calculated from `window.tourState.lon` (camera heading) instead of the actual hotspot bearing.

**Diagnosis steps:**
1. In `triggerGSVTransition()`, check what value feeds `bearingRad`.
2. It should be `transitionBearing` (the hotspot's bearing), NOT `window.tourState.lon`.
3. Also verify: `startPosition = camera.position.clone()` is captured BEFORE any camera movement.
4. The `dollyTarget` should derive from `startPosition`, not from `camera.position` (which changes during animation).

**Modern defensive code:**
```js
var dollyDir = new THREE.Vector3(
    Math.sin(bearingRad), 0, -Math.cos(bearingRad)
).normalize();
dollyTarget = new THREE.Vector3(
    startPosition.x + dollyDir.x * DOLLY_DISTANCE,
    startPosition.y,  // preserve Y
    startPosition.z + dollyDir.z * DOLLY_DISTANCE
);
```

---

## Verification Checklist After Applying Fixes

1. **Scene loads on first visit** — no black screen, texture visible immediately
2. **Floor hotspot appears** when mouse is in lower half of panorama (lat < -10°)
3. **Transition is visible** — dolly moves camera noticeably (check ~16% of radius)
4. **Transition duration feels snappy** — ≤ 900ms total
5. **Center of image stays stable** during transition stretch effect
6. **Camera dolly goes in correct direction** — toward the clicked hotspot
7. **Finalize resets camera** — `camera.position.set(0, 0, 0.001)` after transition ends
8. **All existing functions preserved** — no dead code paths accidentally removed

## Approved Modules for Bug Fixes

These are the only files that should be modified during bug fixes:
- `state.js` — 1 line typically
- `hotspots.js` — early-return removal
- `transition.js` — constants + shader + dolly target

These files must NOT be modified:
- `config.js` — scene configuration is data, not logic
- `controls.js` — input handling works correctly
- `ui.js` — interface layer works correctly
- `main.js` — renderer/scene setup works correctly
- `index.html` — load order must not change
- `style.css` — visual styling
