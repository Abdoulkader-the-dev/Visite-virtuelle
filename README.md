# Dynamic Virtual Tour - Google Street View Architecture

This project is a high-performance, vanilla JavaScript 360° virtual tour utilizing Three.js. It features a custom "Smart Navigation" system that perfectly mimics the mechanics of Google Street View.

## Core Mechanics
1. **Interactive Panoramic Graph**: There are no static buttons floating in 3D space. The system treats the entire spherical canvas as an interactive surface.
2. **Magnetic Cursor Navigation**: A dynamic directional cursor (the chevron arrow) tracks the user's mouse in real time. It calculates the mathematical raycast from the camera to the floor. If a linked panorama exists in the general direction the user is pointing, the cursor automatically rotates to point toward that physical destination.
3. **Double-Click Dolly-In**: Double-clicking the floor triggers a seamless 3D spatial translation (linear forward movement). The sphere's edges naturally stretch (Radial Stretch/Optical Flow) before executing a zero-black-screen crossfade into the target panorama.

---

## 1. Image and Data Architecture (The Panorama Graph)

The entire application state and navigation topology is defined as a directed graph in JSON format inside `js/config.js`. 

Each panorama is a "Node" in the graph, and the `hotspots` array defines the "Edges" (links) to neighboring panoramas.

### The Structure
```javascript
window.TOUR_CONFIG = {
    scenes: {
        'node_id_1': { // Unique identifier for the panorama
            name: 'Main Hall', // Human-readable name
            image: './images/pano1.jpg', // Path to the equirectangular image
            minimapX: 50, // UI Coordinate (0-100)
            minimapY: 85, // UI Coordinate (0-100)
            hotspots: [ // Edges/Links to neighboring panoramas
                { 
                    target: 'node_id_2', 
                    type: 'transition', 
                    position: { x: 0, y: -20, z: -280 }, 
                    label: 'Next Room' 
                }
            ]
        }
    }
}
```

### Understanding Spatial Coordinates (Bearings)
The `position` object dictates the **direction** the target panorama is located physically relative to the current panorama's center.
* `x`: Left (-) to Right (+)
* `y`: Down (-) to Up (+) *(Usually set to -20 for floor navigation)*
* `z`: Forward (-) to Backward (+)

The system uses these coordinates to calculate the `Math.atan2()` angle. When the user looks at the floor, the system checks the angular distance between the mouse pointer and all `transition` hotspots, snapping the cursor to the nearest one.

---

## 2. How to Modify / Scale (Adding New Panoramas)

Scaling the tour is purely a data-entry task. No core JavaScript logic needs to be modified to add 10 or 10,000 panoramas.

### Step-by-Step Guide: Adding a new connected room

#### 1. Add the Image
Place your equirectangular 360° image (e.g., `new_room.jpg`) into the `images/` directory.

#### 2. Define the New Node
Open `js/config.js` and add a new entry to `window.TOUR_CONFIG.scenes`:
```javascript
'new_room_id': {
    name: 'The New Room',
    image: './images/new_room.jpg',
    minimapX: 60,
    minimapY: 40,
    hotspots: [
        // We must provide a way BACK to the previous room
        { position: { x: 0, y: -20, z: 280 }, type: 'transition', target: 'existing_room_id' }
    ]
}
```

#### 3. Link the Existing Room to the New Room
Find the node you want to connect FROM (e.g., `'existing_room_id'`), and add an edge pointing TO your new room. You must determine the relative physical direction.

If the new room is straight ahead:
```javascript
{ position: { x: 0, y: -20, z: -280 }, type: 'transition', target: 'new_room_id' }
```

If the new room is to the right:
```javascript
{ position: { x: 280, y: -20, z: 0 }, type: 'transition', target: 'new_room_id' }
```

#### 4. Adjusting the Angle (Bearing)
If the magnetic cursor points slightly off from where you want it:
1. Open the tour in your browser.
2. Adjust the `x` and `z` values of the `position` object.
3. **Formula**: `Direction Angle = Math.atan2(x, -z)`. 
   - `x: 0, z: -100` = 0° (Straight ahead)
   - `x: 100, z: 0` = 90° (Right)
   - `x: 0, z: 100` = 180° (Behind)
   - `x: -100, z: 0` = -90° (Left)

### Optional: Information Nodes
You can also add static floating information panels using `type: 'info'`:
```javascript
{ position: { x: 100, y: 10, z: -150 }, type: 'info', icon: 'i', title: 'Machine', description: 'Technical specs here.' }
```
These trigger on a **single click**, while transitions trigger on a **double click**.

---

## 3. Customizing the Dynamic Cursor

The chevron arrow is a pure SVG injected into the DOM and managed via CSS/JS.

**To change the shape:**
Edit the `<svg id="floor-arrow-svg">` path in `index.html`.

**To change the color/opacity:**
Edit the `fill` attribute of the SVG in `index.html`. For example, `fill="rgba(200, 200, 200, 0.6)"` creates a sleek, transparent gray.

**To change the detection threshold (When it appears):**
In `js/hotspots.js`, locate:
```javascript
var onFloor = sphereLat < -10;
```
Change `-10` to `-20` if you want the user to look further down before the cursor appears.
