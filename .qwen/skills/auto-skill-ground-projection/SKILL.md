---
name: ground-projection
description: Project 3D hotspot positions onto a ground plane (Y=const) for visible floor markers in Three.js 360° tours
source: auto-skill
extracted_at: '2026-06-16T08:54:27.817Z'
---

## Ground Projection for Floor Markers in Three.js 360° Tours

### Problem
Hotspot positions in `config.js` are 3D coordinates on a sphere (e.g., `{x: -71, y: -227, z: -440}`). Placing a small `PlaneGeometry` marker directly at `(x, groundY, z)` puts it hundreds of units from the camera — invisible.

### Solution
Project the hotspot's **direction vector** from the camera origin onto the ground plane:

```js
function projectHotspotToGround(position, groundY) {
    var dir = new THREE.Vector3(position.x, position.y, position.z).normalize();
    // Guard: hotspot directly above/below (no horizontal component)
    var horizontalDist = Math.sqrt(position.x * position.x + position.z * position.z);
    if (horizontalDist < 0.001) {
        return new THREE.Vector3(0, groundY, 0);
    }
    // Scale factor to reach Y = groundY
    var t = groundY / dir.y;
    if (t < 0) { t = Math.abs(t); }  // clamp if behind
    var px = dir.x * t;
    var pz = dir.z * t;
    // Clamp to max distance so marker stays in view
    var maxDist = 200;
    var dist = Math.sqrt(px * px + pz * pz);
    if (dist > maxDist) {
        var s = maxDist / dist;
        px *= s;
        pz *= s;
    }
    return new THREE.Vector3(px, groundY, pz);
}
```

### Key Rules
1. **Never use raw hotspot `{x,z}` as ground position** — always project via direction vector
2. **Guard `dir.y ≈ 0`** (division by zero) and **`t < 0`** (hotspot behind camera)
3. **Clamp horizontal distance** — markers beyond ~200 units are too far to see
4. **Offset Y slightly** (`groundY + 0.02`) to avoid z-fighting with the floor
5. **`depthWrite: false`** on material — prevents occlusion conflicts with other floor meshes
6. **`renderOrder`** below the arrow (5-6) but above the floor (0)

### When to Use
- Any floor-level marker, indicator, or hotspot that must appear at the "foot" of a 3D hotspot
- Pulse circles, destination markers, navigation hints on the ground plane Y = -2
