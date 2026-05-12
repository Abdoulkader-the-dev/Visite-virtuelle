# Google Street View Style 360 Virtual Tour

This project is a vanilla JavaScript 360 virtual tour built with Three.js r128 from a CDN. It uses classic scripts only: no ES modules, npm, bundler, or build step.

## Prerequisites

- A modern browser.
- VS Code with the Live Server extension, or any simple local static server.
- Optional: a WebXR-compatible device for VR mode, such as Meta Quest, HTC Vive, or a supported mobile browser.

## Add Your 360 Photos

Put your equirectangular 360 photos in the `images/` folder.

The default tour expects:

- `images/1.jpg`
- `images/2.jpg`
- `images/3.jpg`
- `images/4.jpg`
- `images/5.jpg`
- `images/6.jpg`

The loader also tries `.JPG`, `.jpeg`, and `.JPEG`, so camera-exported uppercase filenames can still work.

## Add A New Scene

All scene data lives in [js/config.js](js/config.js).

Add a new scene inside `window.TOUR_CONFIG.scenes`:

```javascript
'7': {
    name: 'Bureau',
    image: './images/7.jpg',
    minimapX: 45,
    minimapY: 30,
    hotspots: [
        {
            position: { x: 200, y: 0, z: -220 },
            type: 'transition',
            target: '1',
            label: 'Retour'
        }
    ]
}
```

Then add transition hotspots from other scenes that point to the new scene.

## Hotspot Positions

Hotspot positions use a 3D coordinate system inside the panorama sphere:

- `x`: left/right direction.
- `y`: vertical direction. Positive is up, negative is down.
- `z`: forward/back direction. Negative Z = in front of the camera at start.

Examples:

```javascript
{ x: 150, y: 0, z: -250 }   // slightly right, in front
{ x: -250, y: 0, z: -150 }  // left, slightly in front
{ x: 0, y: 200, z: -250 }   // straight ahead, high up (info hotspot)
```

Navigation hotspots are not drawn at their fixed 3D position. Instead, the app tracks the mouse ray on the floor and shows the nearest transition hotspot as a moving directional arrow. Info hotspots are projected to the screen every frame and shown as glowing dots.

---

## Floor Navigation Arrow — How It Works

The floor hotspot is a **directional arrow** that appears when the mouse moves toward the bottom of the panorama (the "floor" area). It works like Google Street View: the arrow pivots to point toward the destination scene.

### Visual structure

The arrow is an inline SVG defined in `index.html` inside `#hotspot-container`:

```html
<div id="floor-hotspot">
  <svg id="floor-arrow-svg" ...>
    <ellipse .../>          <!-- ground shadow -->
    <polygon .../>          <!-- arrowhead -->
    <polygon .../>          <!-- arrow tail -->
    <circle  .../>          <!-- center dot (accent color) -->
  </svg>
  <div id="floor-hotspot-label"></div>
</div>
```

### How to change the arrow color

Edit the `fill` attributes directly on the `<polygon>` elements in `index.html`:

```html
<!-- White arrow (default) -->
<polygon points="40,8 54,38 40,30 26,38" fill="#ffffff" fill-opacity="0.95" />

<!-- Blue arrow -->
<polygon points="40,8 54,38 40,30 26,38" fill="#3B82F6" fill-opacity="0.95" />
```

Or override via CSS in `css/style.css`:

```css
#floor-arrow-svg polygon { fill: #your-color; }
```

The center dot color is set in CSS on the `<circle>` fill attribute. It uses `#3B82F6` (the project accent color) by default.

### How to change the arrow size

Change `width` and `height` on both `#floor-hotspot` (the wrapper) and `#floor-arrow-svg` (the SVG) in `css/style.css`. Keep them the same value so centering stays correct:

```css
#floor-hotspot { width: 80px; }      /* change both */
#floor-arrow-svg { width: 80px; height: 80px; }
```

### How to change the pulse animation

Edit `@keyframes arrowPulse` in `css/style.css`:

```css
@keyframes arrowPulse {
    0%   { opacity: 0.80; transform: scale(0.92); }
    50%  { opacity: 1.00; transform: scale(1.05); }  /* peak brightness */
    100% { opacity: 0.80; transform: scale(0.92); }
}
```

### How the direction is calculated

The rotation is computed in `js/hotspots.js` inside `computeArrowAngle()`:

```javascript
function computeArrowAngle(hotspot) {
    var pos = hotspot.positionVector;
    // Absolute angle of the hotspot in the horizontal plane
    var hotspotAngleDeg = Math.atan2(pos.x, -pos.z) * (180 / Math.PI);
    // Subtract the current camera heading so the arrow is screen-relative
    var relativeAngle = hotspotAngleDeg - window.tourState.lon;
    return relativeAngle;
}
```

To **disable** directional rotation (always point up): `return 0;`  
To **invert** the direction: change `atan2(pos.x, -pos.z)` to `atan2(-pos.x, pos.z)`

The computed angle is applied in `updateFloorHotspot()` as a CSS `transform: rotate(Xdeg)` on `#floor-arrow-svg`.

### How to change the floor detection threshold

The arrow only appears when the mouse is below a certain vertical angle. Adjust the threshold in `js/hotspots.js` → `updateFloorHotspot()`:

```javascript
if (sphereLat < -10) {   // -10° = 10 degrees below the horizon
```

Increase toward 0 to make the arrow appear sooner (higher on screen).  
Decrease toward -30 to require the mouse to be much lower before it appears.

---

## Minimap Positions

Each scene has:

```javascript
minimapX: 50,
minimapY: 80
```

These values are percentages from `0` to `100`.

- `minimapX: 0` is the left edge.
- `minimapX: 100` is the right edge.
- `minimapY: 0` is the top edge.
- `minimapY: 100` is the bottom edge.

The minimap automatically draws dots and connection lines based on transition hotspots.

## Branding And Colors

The bottom-center camera watermark is in [index.html](index.html), inside `#camera-logo`.

The visual theme is in [css/style.css](css/style.css). The main accent color is:

```css
#3B82F6
```

Change this value in the CSS to customize active states, minimap highlights, zoom accents, and VR reticle progress.

## Run The Project

Recommended:

1. Open the project folder in VS Code.
2. Right-click `index.html`.
3. Choose `Open with Live Server`.

Directly opening `index.html` may work in some browsers, but a local server is more reliable for image loading, CDN scripts, and WebXR.

## Controls

- Drag mouse or one finger: rotate view.
- Mouse wheel: zoom field of view.
- Pinch with two fingers: zoom field of view.
- Idle for 5 seconds: slow auto-rotation starts.
- Move mouse toward the floor: navigation hotspot appears and follows the pointer.
- Click without dragging: activates the current floor hotspot.
- Click glowing info dots: opens an info card.
- Use the menu or minimap dots to move between scenes.
- Use `+` and `-` to smoothly zoom.

## VR Mode

On supported devices, a VR button appears near the bottom center.

In VR:

- Three.js uses `renderer.xr.enabled = true`.
- The animation loop uses `renderer.setAnimationLoop(...)`.
- HTML panels are hidden during the XR session.
- Controller rays are visible.
- Controller select can trigger transition or info hotspots.
- A center reticle supports gaze-based navigation.
- VR info cards are rendered as Three.js canvas-textured panels in world space.
