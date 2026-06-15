---
name: vr-ui-hud
description: WebXR HUD pattern — attach UI group to scene (not camera) with yaw-only rotation for reliable Three.js r128 raycasting
source: auto-skill
extracted_at: '2026-06-15T14:31:20.166Z'
---

## VR HUD — Scene-Attached UI with Yaw-Only Rotation

### Context
When building WebXR (VR) interfaces for Three.js r128 virtual tours, HTML overlays are invisible in the headset. The solution is 3D `PlaneGeometry` buttons with `CanvasTexture`, but **attaching them to the camera via `camera.add()` breaks WebXR raycasting** — Three.js handles the camera's matrix differently in XR mode, so controller raycasts fail to intersect child objects.

### Architecture

**Three-layer approach:**

| Layer | What | How |
|-------|------|-----|
| HUD group | 3D buttons (back, menu, exit) | Added to `scene`, repositioned each frame |
| Menu panel | Grid of scene buttons | Added to `scene` on demand, positioned in front of user |
| Reticle | Small crosshair mesh | Child of HUD group, always at z=0 relative to HUD |

### Critical Pattern — Attach to Scene, Not Camera

```javascript
// WRONG — breaks WebXR raycasting:
window.tourState.camera.add(vrHudGroup);

// RIGHT — added to scene, repositioned each frame:
window.tourState.scene.add(vrHudGroup);
```

### updateVRUI() — Called Every Frame

This function runs in the render loop (`renderFrame()` in `main.js`). It:

1. Copies camera position to the HUD group
2. Extracts **only the yaw** (rotation Y) — ignores pitch and roll so buttons stay horizontal
3. Offsets the HUD to a fixed distance in front of the user (z = -2)

```javascript
function updateVRUI() {
    if (!vrUiGroup || !vrUiGroup.visible) { return; }

    var camera = window.tourState.camera;

    // 1. Copy camera position
    vrUiGroup.position.copy(camera.position);

    // 2. Yaw only — no pitch/roll (buttons stay horizontal)
    var euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    euler.x = 0; // cancel pitch
    euler.z = 0; // cancel roll
    vrUiGroup.quaternion.setFromEuler(euler);

    // 3. Offset to z = -2 in front of user
    var forward = new THREE.Vector3(0, 0, -2);
    forward.applyQuaternion(vrUiGroup.quaternion);
    vrUiGroup.position.add(forward);
}
```

**Why `YXZ` order?** Three.js's default `XYZ` Euler order causes gimbal lock issues when extracting yaw from a camera that can look up/down. `YXZ` extracts Y (yaw) first, which is the only rotation we want for a horizontal HUD.

### Button Creation Pattern

Buttons are `PlaneGeometry` meshes with `CanvasTexture` maps:

```javascript
function createVRButton(label, icon, bgColor, action, userData) {
    var texture = createButtonTexture(label, icon, bgColor, '#ffffff');
    var material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true,
        side: THREE.DoubleSide, depthWrite: false
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), material);
    mesh.userData = Object.assign({ action: action, isVRButton: true }, userData || {});
    mesh.renderOrder = 10;
    return mesh;
}
```

### XR Select Handler — Raycasting Order

In `handleXRSelect()`, always test VR buttons **before** 3D hotspots:

```javascript
function handleXRSelect(event) {
    var controller = event.target;
    var tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    var raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // 1. Test VR buttons first (closer to controller, higher priority)
    if (vrUiGroup && vrUiGroup.visible) {
        var buttonHits = raycaster.intersectObjects(vrButtons, false);
        if (buttonHits.length > 0 && buttonHits[0].distance < 3.0) {
            executeVRButtonAction(buttonHits[0].object.userData.action);
            return;
        }
    }

    // 2. Then test 3D hotspots on the ground
    // ... (standard hotspot raycast)
}
```

### Session Lifecycle

```javascript
renderer.xr.addEventListener('sessionstart', function () {
    showVRUI();  // vrUiGroup.visible = true
});
renderer.xr.addEventListener('sessionend', function () {
    hideVRUI();
    hideVRSceneMenu();
});
```

### Common Pitfalls

1. **`camera.add(hudGroup)`** — breaks WebXR raycasting. Always use `scene.add()`.
2. **Full quaternion copy** — if you copy `camera.quaternion` directly, buttons tilt with head pitch. Always extract yaw-only.
3. **Menu panel not in scene** — the scene menu (grid of scene buttons) must also be `scene.add()`, not `camera.add()`. Position it in front of the user at show time, it stays in world space.
4. **Forgetting `depthWrite: false`** — without it, transparent canvas textures cause z-fighting with the panoramic sphere.
5. **renderOrder** — buttons need `renderOrder >= 10` to render on top of the panoramic sphere (default order 0).
