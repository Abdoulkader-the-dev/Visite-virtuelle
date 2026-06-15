---
name: vr-ui-hud
description: WebXR HUD pattern — minimal single-button HUD attached to scene (not camera) with yaw-only rotation; exit via session.end()
source: auto-skill
extracted_at: '2026-06-15T16:14:12.132Z'
---

## VR HUD — Minimal Scene-Attached Exit Button

### Context
When building WebXR (VR) interfaces for Three.js r128 virtual tours, HTML overlays are invisible in the headset. The solution is 3D `PlaneGeometry` buttons with `CanvasTexture`, but **attaching them to the camera via `camera.add()` breaks WebXR raycasting** — Three.js handles the camera's matrix differently in XR mode, so controller raycasts fail to intersect child objects.

### Architecture — Strict Minimum

The VR UI contains **only one element**: a small "Quitter VR" button fixed at the bottom of the user's field of view. Navigation between scenes is handled exclusively by the 3D floor arrow (managed in `hotspots.js`).

| Element | Location | Purpose |
|---------|----------|---------|
| Exit button | HUD group in scene | Leave VR via `session.end()` |
| Floor arrow | `hotspots.js` | Navigate between scenes (pointer-based) |

**Anti-pattern — what NOT to do:**
- No floating scene menus or grids of buttons in front of the user's eyes
- No gaze-based dwell timers (causes neck fatigue, unreliable)
- No reticle meshes (unnecessary visual clutter)
- No multi-button HUDs that obscure the panorama

### Critical Pattern — Attach to Scene, Not Camera

```javascript
// WRONG — breaks WebXR raycasting:
window.tourState.camera.add(vrHudGroup);

// RIGHT — added to scene, repositioned each frame:
window.tourState.scene.add(vrHudGroup);
```

### Exit VR — Must Use `session.end()`

Calling `window.tourState.isXRActive = false` alone does **not** end the WebXR session. You must retrieve the active session and call `.end()`:

```javascript
function doExitVR() {
    var renderer = window.tourState.renderer;
    if (!renderer) { return; }

    var session = renderer.xr.getSession();
    if (session) {
        session.end().then(function () {
            window.tourState.isXRActive = false;
        }).catch(function (err) {
            console.error('[VR] Erreur fin de session:', err);
            window.tourState.isXRActive = false;
        });
    } else {
        window.tourState.isXRActive = false;
    }
}
```

### updateVRUI() — Called Every Frame

This function runs in the render loop (`renderFrame()` in `main.js`). It:

1. Copies camera position to the HUD group
2. Extracts **only the yaw** (rotation Y) — ignores pitch and roll so the button stays horizontal
3. Offsets the HUD to a fixed distance in front of the user (z = -1.5)

```javascript
function updateVRUI() {
    if (!vrUiGroup || !vrUiGroup.visible) { return; }

    var camera = window.tourState.camera;

    vrUiGroup.position.copy(camera.position);

    var euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    euler.x = 0; // cancel pitch
    euler.z = 0; // cancel roll
    vrUiGroup.quaternion.setFromEuler(euler);

    var forward = new THREE.Vector3(0, 0, -1.5);
    forward.applyQuaternion(vrUiGroup.quaternion);
    vrUiGroup.position.add(forward);
}
```

**Why `YXZ` order?** Three.js's default `XYZ` Euler order causes gimbal lock issues when extracting yaw from a camera that can look up/down. `YXZ` extracts Y (yaw) first, which is the only rotation we want for a horizontal HUD.

### XR Select Handler — Exit Button Only

The select handler tests only the exit button. Floor arrow selection is handled by `hotspots.js`:

```javascript
function handleXRSelect(event) {
    var controller = event.target;
    var tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    var raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    if (exitButton) {
        var hits = raycaster.intersectObject(exitButton, false);
        if (hits.length > 0 && hits[0].distance < 3.0) {
            doExitVR();
        }
    }
}
```

### Session Lifecycle

```javascript
renderer.xr.addEventListener('sessionstart', function () {
    showVRUI();  // vrUiGroup.visible = true
});
renderer.xr.addEventListener('sessionend', function () {
    hideVRUI();
});
```

### Common Pitfalls

1. **`camera.add(hudGroup)`** — breaks WebXR raycasting. Always use `scene.add()`.
2. **Full quaternion copy** — if you copy `camera.quaternion` directly, buttons tilt with head pitch. Always extract yaw-only.
3. **Setting `isXRActive = false` without `session.end()`** — the WebXR session keeps running. Always call `renderer.xr.getSession().end()`.
4. **Forgetting `depthWrite: false`** — without it, transparent canvas textures cause z-fighting with the panoramic sphere.
5. **renderOrder** — buttons need `renderOrder >= 10` to render on top of the panoramic sphere (default order 0).
6. **Floating menus in the user's face** — avoid any 3D panels or grids positioned close to the camera. They obscure the panorama and degrade the VR experience.
