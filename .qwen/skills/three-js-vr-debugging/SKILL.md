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

### 6. Dolly Direction Uses Bearing Instead of Actual Hotspot Position

**Symptom:** Camera dolly-in goes in a direction that doesn't match the 3D arrow on the floor.

**Root cause pattern:** `dollyDir` computed from a fixed `bearing` value (from config) instead of the real 3D position of the clicked hotspot.

**Diagnosis steps:**
1. In `triggerGSVTransition()`, check how `dollyDir` is computed.
2. If it uses `Math.sin(bearingRad)` / `-Math.cos(bearingRad)` from a config bearing, it ignores the actual hotspot position.
3. The correct approach: compute direction from camera position to hotspot position:
   ```js
   var dx = hotspot.position.x - camera.position.x;
   var dy = (hotspot.position.y || 0) - camera.position.y;
   var dz = hotspot.position.z - camera.position.z;
   var len = Math.sqrt(dx*dx + dy*dy + dz*dz);
   dollyDir = new THREE.Vector3(dx/len, dy/len, dz/len);
   ```
4. The hotspot must be passed via `options.hotspot` from the click handler.

**Fix:** Pass `{ hotspot: meshHit }` from `onDoubleClick`/`onValidClick`/`handleXRSelect` to `triggerGSVTransition`, then use `options.hotspot.position` for direction.

---

### 7. 3D Arrow Points in Wrong Direction (Bearing vs Relative Angle)

**Symptom:** The floor arrow (3D mesh) doesn't point toward the target scene.

**Root cause pattern:** Arrow rotation uses `bearingForHotspot(nearest)` (absolute world bearing) instead of computing the relative angle from the arrow's position to the hotspot's position.

**Diagnosis steps:**
1. In `updateGroundHotspots()`, check what value feeds `rotation.y` on the arrow mesh.
2. If it's `bearingForHotspot(nearest)`, the arrow points in world space, not toward the target.
3. The correct approach:
   ```js
   var dx = nearest.positionVector.x - groundPoint.x;
   var dz = nearest.positionVector.z - groundPoint.z;
   var angleToTarget = Math.atan2(dz, dx);
   ```

**Fix:** Replace `bearingForHotspot(nearest)` with `Math.atan2(dz, dx)` computed from the relative position.

---

### 8. Camera Looks Backward After Transition (Missing 180° Inversion)

**Symptom:** After completing a transition, the camera faces the opposite direction from the movement.

**Root cause pattern:** Panoramas are inherently "upside down" in 360° sphere mapping. The `finalize()` function sets `lon = normalizeDegrees(finalBearing)` without compensating.

**Diagnosis steps:**
1. In `finalize()` inside `triggerGSVTransition()`, find the line setting `window.tourState.lon`.
2. If it's `normalizeDegrees(finalBearing)`, the camera looks backward.
3. The correct value: `normalizeDegrees(finalBearing + 180)`.

**Fix:** Add `+ 180` to the final longitude assignment. This compensates for the native inversion of 360° panoramic images.

---

### 9. HTML Overlay Hotspots Should Be Removed

**Symptom:** HTML-based floor hotspots (CSS arrows, labels) interfere with or duplicate the 3D mesh hotspots.

**Root cause pattern:** Legacy HTML/CSS overlay code remains in `hotspots.js` alongside the 3D mesh system.

**Diagnosis steps:**
1. Search `hotspots.js` for `document.getElementById('floor-hotspot')`, `floorArrowSvg`, `computeArrowAngle`, `updateFloorHotspot`, `hideFloorHotspot`.
2. If these exist, they are legacy HTML overlay code.

**Fix:** Remove all HTML overlay logic. Keep only:
- 3D mesh creation (`createGroundHotspot`, `groundHotspotGroup`)
- Raycaster-based interaction (`groundRaycaster`, `allGroundHotspotMeshes`)
- Dynamic rotation via `Math.atan2(dz, dx)`
- Opacity lerp for fade in/out

Remove these functions entirely: `computeArrowAngle`, `updateFloorHotspot`, `hideFloorHotspot`, `screenPointForHotspot`.
Remove these variables: `floorHotspot`, `floorLabel`, `floorArrowSvg`, `cameraMarker`, `dirArrows`.

---

### 10. Controllers Not Detected — `event.target` Passed Instead of `event`

**Symptom:** VR controllers are visible (ray line shows) but pressing the trigger does nothing — no button clicks, no hotspot activation.

**Root cause pattern:** In `setupXRControllers()` (main.js), the `select` event listener passes `event.target` (the controller object) to `window.handleXRSelect()`, but the handler expects a full `event` object and accesses `event.target` internally to build the raycaster.

```javascript
// WRONG — passes controller directly:
controller.addEventListener('select', function (event) {
    window.handleXRSelect(event.target);  // event.target is the controller
});

// RIGHT — passes the full event object:
controller.addEventListener('select', function (event) {
    window.handleXRSelect(event);  // handler does event.target to get controller
});
```

**Diagnosis steps:**
1. In `main.js`, find `setupXRControllers()` → the `select` listener.
2. Check what is passed to `window.handleXRSelect()`.
3. In `vr-ui.js`, find `handleXRSelect(event)` → verify it does `var controller = event.target`.
4. If the call site passes `event.target` and the handler also accesses `.target`, the handler receives the controller as `event`, and `event.target` is `undefined`.

**Fix:** Pass the full `event` object, not `event.target`.

**Why it's easy to miss:** The controllers still render (the ray line is visible) because `scene.add(controller)` works independently. Only the interaction path is broken.

---

### 11. "Quitter VR" Button Crashes — Null `getSession()`

**Symptom:** Clicking the "Quitter VR" button in the HUD throws `Cannot read property 'end' of null` and the session doesn't end.

**Root cause pattern:** `exitVR()` calls `renderer.xr.getSession().end()` without checking if `getSession()` returns `null` (which it does when no session is active).

```javascript
// WRONG — crashes if no active session:
function exitVR() {
    renderer.xr.getSession().end();
}

// RIGHT — null-safe:
function exitVR() {
    var renderer = window.tourState.renderer;
    if (!renderer) { return; }
    var session = renderer.xr.getSession();
    if (session) {
        session.end();
    }
}
```

**Diagnosis steps:**
1. In `ui.js`, find `exitVR()`.
2. Check if there's a null check on `getSession()` before calling `.end()`.

**Fix:** Store `getSession()` in a variable, check for null before calling `.end()`.

---

### 12. Ground Arrow Disappears in VR — No Mouse Input

**Symptom:** The 3D floor arrow (ring + chevron) works in desktop mode but is completely invisible in VR.

**Root cause pattern:** `updateGroundHotspots()` relies on `window.tourState.lastMouseX`/`lastMouseY` and `mouseSphereLat < -10` to position the arrow. In VR, there is no mouse input, so these values are never set, and the arrow stays at opacity 0.

**Diagnosis steps:**
1. In `hotspots.js`, find `updateGroundHotspots()`.
2. Check if there's a branch for `window.tourState.isXRActive`.
3. If the only ground detection path uses mouse NDC coordinates, it won't work in VR.

**Fix:** Add a VR branch that raycasts from the camera's gaze direction to the ground plane:

```javascript
function updateGroundHotspots() {
    // ... (existing setup)

    if (window.tourState.isXRActive) {
        // VR: ray from camera gaze to ground plane
        var vrRay = new THREE.Ray(
            camera.getWorldPosition(new THREE.Vector3()),
            camera.getWorldDirection(new THREE.Vector3())
        );
        if (!window.tourState.isTransitioning && vrRay.intersectPlane(groundPlane, groundPoint)) {
            // Same clamping + arrow positioning logic as mouse mode
            // ...
        }
    } else {
        // Desktop: existing mouse-based raycaster
        // ...
    }

    // Shared opacity lerp (same for both modes)
    groundHotspotEntry.opacity = THREE.MathUtils.lerp(
        groundHotspotEntry.opacity, targetOpacity, 0.12
    );
}
```

**Key insight:** The VR branch uses `camera.getWorldPosition()` + `camera.getWorldDirection()` instead of mouse NDC. The rest of the algorithm (clamping, nearest hotspot search, `atan2(-dx, -dz)` rotation, opacity lerp) is identical.

**Why it's easy to miss:** The arrow meshes still exist in the scene and are still rendered — they're just at opacity 0 because the update function never activates them.

---

## Approved Modules for Bug Fixes

These are the only files that should be modified during bug fixes:
- `state.js` — 1 line typically
- `hotspots.js` — early-return removal, HTML cleanup, 3D arrow rotation fix
- `transition.js` — constants + shader + dolly direction + 180° inversion

These files must NOT be modified:
- `config.js` — scene configuration is data, not logic
- `controls.js` — input handling works correctly
- `ui.js` — interface layer works correctly
- `main.js` — renderer/scene setup works correctly
- `index.html` — load order must not change
- `style.css` — visual styling
