---
name: arrival-orientation
description: Optional per-hotspot arrivalLon/arrivalLat to override post-transition camera direction in Three.js 360° tours
source: auto-skill
extracted_at: '2026-06-22T12:25:39.406Z'
---

## arrivalLon / arrivalLat — Per-Hotspot Post-Transition Camera Orientation

### Problem
After a GSV-style transition, the camera arrival direction is computed automatically from the geometric angle of the hotspot position in the sphere:
```js
var newLon = normalizeDegrees(movementAngle + 180 - relativeLookOffset);
```
This means the arrival view is determined by *where the hotspot is placed in 3D space*, not by the *intended viewing direction* of the destination scene. For scenes where the interesting view is in a different direction from the doorway/hotspot, the user arrives looking at a wall.

### Solution — Optional Override Fields

Add optional `arrivalLon` and `arrivalLat` fields to transition hotspots in `config.js`:

```js
{
    position: { x: -71, y: -227, z: -439 },
    type: 'transition',
    target: '13',
    bearing: 180,          // dolly-in direction (unchanged)
    arrivalLon: 0,         // OPTIONAL: force camera lon after transition
    arrivalLat: 0,         // OPTIONAL: force camera lat after transition (default 0)
    label: "Salle d'attente"
}
```

**Convention:** Same as bearing — 0° = north (-Z), 90° = east (+X), 180° = south (+Z), 270° = west (-X).

### Implementation — 3 Files

#### 1. `config.js` — Add optional fields to hotspots

Only add `arrivalLon`/`arrivalLat` to hotspots where the automatic direction is wrong. Leave all others unchanged (backward compatible — the code falls back to auto-calculation when fields are absent).

#### 2. `transition.js` — Modify `finalize()` to accept and use the hotspot

**Step A:** Pass `clickedHotspot` through the GSAP timeline `onComplete` closure:
```js
// In triggerGSVTransition(), the onComplete callback:
onComplete: function () {
    (function waitTexture() {
        if (textureReady) {
            finalize(nextSphere, oldSphere, targetSceneId, clickedHotspot);
        } else {
            setTimeout(waitTexture, 32);
        }
    })();
}
```

**Step B:** In `finalize()`, use `arrivalLon`/`arrivalLat` if present, else fall back to auto:
```js
function finalize(next, old, targetId, clickedHotspot) {
    // ... (existing sphere cleanup, camera reset, scene change) ...

    // Arrival direction: forced or automatic
    if (clickedHotspot && typeof clickedHotspot.arrivalLon === 'number') {
        window.tourState.lon = normalizeDegrees(clickedHotspot.arrivalLon);
    } else {
        // Original formula (unchanged fallback)
        var newLon = normalizeDegrees(
            movementAngle + 180 - window.tourState.relativeLookOffset
        );
        window.tourState.lon = newLon;
    }

    // Arrival vertical angle: forced or default 0
    window.tourState.lat = (clickedHotspot && typeof clickedHotspot.arrivalLat === 'number')
        ? clickedHotspot.arrivalLat
        : 0;

    // ... (rest of finalize unchanged) ...
}
```

**Key constraint:** Do NOT modify the dolly-in logic (`dollyDir`, `movementAngle`, `relativeLookOffset`). Only the final orientation in `finalize()` changes.

#### 3. `hotspot-editor.html` — Add UI for capturing arrivalLon

Add an input field and a "capture current view direction" button:

```html
<div class="field-row">
    <div class="field">
        <label>Bearing (direction de transition)</label>
        <input type="number" id="hs-bearing" min="0" max="359" step="1">
    </div>
    <div class="field">
        <label>Arrival Lon (direction d'arrivée)</label>
        <input type="number" id="hs-arrival-lon" min="0" max="359" step="1"
               placeholder="ex: 90 (laisser vide = auto)">
    </div>
</div>
<button id="use-cam-arrival-lon">
    🎯 Capturer direction d'arrivée (arrivalLon)
</button>
```

In `buildCode()`, include `arrivalLon` in the generated code string when the field is non-empty:
```js
if (hsArrivalLon.value !== '') {
    parts.push('arrivalLon: ' + Math.round(parseFloat(hsArrivalLon.value) || 0));
}
```

### When to Use

- **Use `arrivalLon`** when the automatic post-transition direction points at a wall, ceiling, or uninteresting area
- **Leave empty** (auto) when the geometric hotspot direction already produces a good arrival view
- **Use `arrivalLat`** sparingly — typically only for scenes where the user should look up or down on arrival (default 0 = horizon)

### Backward Compatibility

Fully backward compatible. Hotspots without `arrivalLon` use the original automatic formula. No existing behavior changes.

### Debugging

If the arrival direction is wrong:
1. Check that `arrivalLon` is a `number` (not a string) in config.js
2. Verify `clickedHotspot` is passed through the GSAP `onComplete` closure (not lost)
3. Confirm `finalize()` receives the 4th parameter — add a `console.log('arrivalLon:', clickedHotspot && clickedHotspot.arrivalLon)` temporarily
