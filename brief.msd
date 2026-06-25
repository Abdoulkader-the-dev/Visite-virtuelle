# Documentation complète — Visite Virtuelle 360° style Google Street View

---

## Table des matières

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Architecture modulaire](#2-architecture-modulaire)
3. [Stack technique](#3-stack-technique)
4. [Objet d'état global `window.tourState`](#4-objet-détat-global-windowtourstate)
5. [Fichier de configuration (`config.js`)](#5-fichier-de-configuration-configjs)
6. [Initialisation et boucle de rendu (`main.js`)](#6-initialisation-et-boucle-de-rendu-mainjs)
7. [Système de hotspots (`hotspots.js`)](#7-système-de-hotspots-hotspotsjs)
8. [Transition style GSV (`transition.js`)](#8-transition-style-gsv-transitionjs)
9. [Contrôles utilisateur (`controls.js`)](#9-contrôles-utilisateur-controlsjs)
10. [Interface utilisateur (`ui.js`)](#10-interface-utilisateur-uijs)
11. [Mode VR / WebXR (`vr-ui.js` + `xr-controls.js`)](#11-mode-vr--webxr-vr-uijs--xr-controlsjs)
12. [Éditeur de hotspots (`hotspot-editor.html`)](#12-éditeur-de-hotspots-hotspot-editorhtml)
13. [Feuille de style (`style.css`)](#13-feuille-de-style-stylecss)
14. [Pipeline de rendu des textures](#14-pipeline-de-rendu-des-textures)
15. [Navigation clavier](#15-navigation-clavier)
16. [Système de bearings et orientations](#16-système-de-bearings-et-orientations)
17. [Points d'attention et conventions](#17-points-dattention-et-conventions)

---

## 1. Vue d'ensemble du projet

Ce projet est une **visite virtuelle 360°** reproduisant les mécaniques de navigation de **Google Street View (GSV)**. L'utilisateur peut :

- **Naviguer** entre des scènes panoramiques (photos 360° équirectangulaires) via des hotspots au sol.
- **Se déplacer** avec une transition cinématique en 3 couches : dolly-in 3D, fondu croisé, et étirement radial (shader GLSL).
- **Explorer** en mode souris/clavier, tactile (pinch-to-zoom), ou en **VR WebXR** (Meta Quest).
- **Conserver son regard** d'une scène à l'autre sans saut visuel (continuité optique).

Le projet comprend **24 scènes** (ID 12 à 35) couvrant un parcours complet :
**Entrée → Salle d'attente → Zones 14/15 → Zone 16 → Salle collaborative → Zones 18-21 → Couloire → Design Lab → Makerspace**.

---

## 2. Architecture modulaire

Le code est organisé en **8 modules IIFE** (Immediately Invoked Function Expression), chargés dans un ordre précis via les balises `<script>` de `index.html` :

```
Ordre de chargement :
  config.js → state.js → controls.js → transition.js → hotspots.js → ui.js → vr-ui.js → xr-controls.js → main.js
```

| Fichier | Rôle | Expose sur `window` |
|---|---|---|
| `config.js` | Définition des scènes et hotspots (données statiques) | `TOUR_CONFIG` |
| `state.js` | Objet d'état global mutable | `tourState` |
| `controls.js` | Entrées souris, tactile, clavier | `initControls`, `trackMouseOnSphere`, `setTourFov`, `stopAutoRotation` |
| `transition.js` | Cinématique de changement de scène | `triggerGSVTransition`, `startTransition`, `animateTourFov`, `animateTourBlur` |
| `hotspots.js` | Hotspots 3D au sol, marqueurs info, clic, VR raycast | `initHotspots`, `updateHotspots`, `onValidClick`, `onDoubleClick`, `handleXRSelect`, `rebuildHotspots`, `getActiveController`, `getGroundHotspotMeshes` |
| `ui.js` | Menu, minimap, boussole, zoom, plein écran, partage, fiche info | `initUI`, `updateNavMenu`, `updateMinimap`, `updateMinimapArrow`, `updateCompass`, `updateBackButton`, `goBack`, `toggleFullscreen`, `updateZoomLevel`, `showInfoCard`, `hideInfoCard`, `showVRInfoPanel`, `hideVRInfoPanel`, `updateVRInfoPanelFrame`, `exitVR` |
| `vr-ui.js` | HUD WebXR (bouton Quitter VR), joystick VR | `initVRUI`, `handleXRSelect`, `updateVRUI`, `showVRUI`, `hideVRUI`, `doExitVR`, `handleVRJoystick` |
| `xr-controls.js` | Support joystick Meta Quest (rotation, déplacement) | `initXRControls`, `setupControllerEvents` |
| `main.js` | Bootstrap Three.js, boucle de rendu, chargement scènes | `loadScene`, `preloadAllScenes`, `updateCameraLookAt`, `createSphere`, `loadTourTexture` |

**Principe** : chaque module est auto-contenu (IIFE) et communique via l'objet global `window`. Aucun module n'importe un autre explicitement.

---

## 3. Stack technologique

| Technologie | Version / Source | Rôle |
|---|---|---|
| **Three.js** | r128 (CDN) | Rendu 3D WebGL : scène, caméra, sphères, meshes, raycasting, WebXR |
| **GSAP** | locale (`js/gsap.min.js`) | Timelines d'animation : transition GSV, pulsation cercles, zoom |
| **JavaScript** | Vanilla (ES5, pas de transpilation) | Logique métier, pas de framework |
| **WebXR API** | Native navigateur | Mode VR immersif (Meta Quest) |
| **GLSL** | Shaders personnalisés | Radial Stretch (vertex shader), Crossfade, Motion Blur (fragment shaders) |

---

## 4. Objet d'état global `window.tourState`

Défini dans `state.js`, cet objet centralise tout l'état mutable de l'application :

```javascript
window.tourState = {
    // ── Navigation ──
    currentScene: '12',       // ID de la scène courante (string)
    lon: 0,                   // Direction horizontale de vue (degrés, 0-360)
    lat: 0,                   // Direction verticale de vue (degrés, -85 à +85)
    fov: 75,                  // Champ de vision (40-100 degrés)

    // ── Flags ──
    isTransitioning: false,   // true pendant une transition GSV
    isDragging: false,        // true pendant un clic-glisser
    controlsEnabled: true,    // false pendant les transitions
    isXRActive: false,        // true pendant une session WebXR
    isFullscreen: false,      // true en mode plein écran
    autoRotating: false,      // true quand la rotation auto est active

    // ── Souris ──
    mouseDownX: 0,            // X au moment du mousedown
    mouseDownY: 0,            // Y au moment du mousedown
    mouseDelta: 0,            // Distance totale parcourue pendant le drag
    lastMouseX: 0,            // Dernière position X de la souris
    lastMouseY: 0,            // Dernière position Y de la souris
    mouseSphereLat: null,     // Latitude du pointeur sur la sphère
    mouseSpherePoint: null,   // Point 3D du pointeur sur la sphère

    // ── Temporel ──
    lastInteractionTime: Date.now(),  // Timestamp de la dernière interaction

    // ── Three.js ──
    camera: null,             // THREE.PerspectiveCamera
    renderer: null,           // THREE.WebGLRenderer
    scene: null,              // THREE.Scene
    sphere: null,             // Mesh sphère principale (scène active)
    sphere2: null,            // Mesh sphère secondaire (transition)

    // ── Hotspots ──
    activeFloorHotspot: null, // Hotspot au sol actuellement actif

    // ── Historique ──
    history: [],              // Pile des scènes visitées (max 50)

    // ── VR ──
    xrControllers: [],        // Tableau des contrôleurs WebXR
    xrInfoPanel: null,        // Groupe 3D du panneau d'info VR
    gazeTarget: null,         // Hotspot actuellement regardé en VR
    gazeStartTime: 0,         // Timestamp du début du regard

    // ── Texture ──
    currentTexture: null,     // Texture Three.js de la scène courante
};
```

---

## 5. Fichier de configuration (`config.js`)

### 5.1 Structure

`config.js` définit l'objet `window.TOUR_CONFIG` contenant toutes les données statiques de la visite sous forme de **graphe orienté** : chaque scène est un nœud, chaque hotspot de type `transition` est une arête vers un autre nœud.

```javascript
window.TOUR_CONFIG = {
    scenes: {
        '12': {                    // ID unique de la scène (string)
            name: 'Entrée',        // Nom affiché dans l'UI
            image: './images/12.JPG',  // Chemin vers la photo 360°
            defaultBearing: 181.0, // Direction de vue au chargement initial (degrés)
            minimapX: 50,          // Position X sur la minimap (0-100)
            minimapY: 85,          // Position Y sur la minimap (0-100)
            hotspots: [...]        // Tableau des hotspots
        },
        // ... 23 autres scènes
    }
};
```

### 5.2 Propriétés d'une scène

| Propriété | Type | Description |
|---|---|---|
| `name` | `string` | Nom affiché dans le menu latéral et la minimap |
| `image` | `string` | Chemin vers l'image équirectangulaire 360° |
| `defaultBearing` | `number` | Direction de vue au chargement initial (0=nord, 90=est, 180=sud, 270=ouest). Non utilisé après une transition GSV. |
| `minimapX` | `number` | Position X sur la minimap (0-100%) |
| `minimapY` | `number` | Position Y sur la minimap (0-100%) |
| `hotspots` | `array` | Liste des hotspots de la scène |

### 5.3 Propriétés d'un hotspot

**Type `transition`** (navigation entre scènes) :

| Propriété | Type | Description |
|---|---|---|
| `position` | `{x, y, z}` | Position 3D dans la sphère (read-only, ne pas modifier sans l'éditeur) |
| `type` | `'transition'` | Type du hotspot |
| `target` | `string` | ID de la scène cible |
| `bearing` | `number` | Direction de transition en degrés (direction du dolly-in ET vue après transition) |
| `label` | `string` | Texte affiché dans le tooltip |

**Type `info`** (point d'information) :

| Propriété | Type | Description |
|---|---|---|
| `position` | `{x, y, z}` | Position 3D dans la sphère |
| `type` | `'info'` | Type du hotspot |
| `icon` | `string` | Icône affichée (ex: `'💡'`, `'i'`) |
| `title` | `string` | Titre de la fiche info |
| `description` | `string` | Texte de la fiche info |

### 5.4 Conventions de coordonnées 3D

La sphère a un rayon de **500 unités Three.js**. Les coordonnées suivent ce repère :

- `x` : gauche (−) / droite (+)
- `y` : bas (−) / haut (+)
- `z` : devant (−) / derrière (+)

Formule de conversion position → angle : `bearing = atan2(x, -z) × (180/π)`, normalisé 0–360°.

### 5.5 Les 24 scènes

| ID | Nom | Hotspots transition |
|---|---|---|
| 12 | Entrée | → 13, 16, 17 |
| 13 | Salle d'attente | → 14, 15, 12 |
| 14 | Zone 14 | → 13, 15 |
| 15 | Zone 15 | → 14, 13, 12 |
| 16 | Zone 16 | → 12, 17, 13 |
| 17 | Salle collaborative | → 18, 19, 20, 21, 12, 22 |
| 18 | Zone 18 | → 17, 19, 20, 21 |
| 19 | Zone 19 | → 17, 18, 20, 21 |
| 20 | Zone 20 | → 17, 18, 19, 21 |
| 21 | Zone 21 | → 17, 18, 19, 20, 22 |
| 22 | Couloire — début | → 23, 17 |
| 23 | Couloire — milieu | → 24, 22, 27 |
| 24 | Couloire — section 3 | → 25, 23 |
| 25 | Couloire — section 4 | → 26, 24, 32 |
| 26 | Couloire — fin | → 25 |
| 27 | Design Lab | → 28, 29, 23 |
| 28 | Design Lab 28 | → 27 |
| 29 | Design Lab 29 | → 27, 30, 31 |
| 30 | Design Lab 30 | → 29 |
| 31 | Design Lab 31 | → 29 |
| 32 | Makerspace | → 33, 34, 35, 25 |
| 33 | Makerspace 33 | → 32, 35 |
| 34 | Makerspace 34 | → 32, 35 |
| 35 | Makerspace 35 | → 32 |

---

## 6. Initialisation et boucle de rendu (`main.js`)

### 6.1 Fonction `init()`

Le point d'entrée de l'application, exécuté au `DOMContentLoaded` (ou immédiatement si le DOM est déjà prêt) :

```
1. normalizeConfigPositions()
   → Pré-calcule hotspot.positionVector (Vector3) pour chaque hotspot
   → Calcule hotspot.bearing si absent via atan2(x, -z)

2. Création de la scène Three.js
   → THREE.Scene avec fond noir (0x000000)

3. Création de la caméra
   → THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
   → Position : (0, 0, 0.001)

4. Création du renderer
   → THREE.WebGLRenderer({ canvas, antialias: true })
   → outputEncoding = THREE.sRGBEncoding
   → toneMapping = THREE.LinearToneMapping
   → toneMappingExposure = 1.4
   → xr.enabled = true

5. Création des deux sphères
   → sphere (principale) : SphereGeometry(500, 60, 40), scale(-1,1,1)
   → sphere2 (transition) : identique, opacity 0, invisible, scale(0.99)

6. Sauvegarde dans tourState
   → camera, renderer, scene, sphere, sphere2

7. Initialisation des modules
   → initControls(), initUI(), initVRUI(), initXRControls()

8. Configuration des contrôleurs XR
   → setupXRControllers() : 2 contrôleurs avec rayon laser bleu

9. Écouteur de redimensionnement
   → window.addEventListener('resize', onResize)

10. Chargement de la scène de départ
    → getStartParams() lit ?scene=X&lon=Y&lat=Z dans l'URL
    → loadScene(sceneId, { isInitialLoad: true })
    → Si ?lon= est présent, il écrase le defaultBearing

11. Préchargement global
    → preloadAllScenes() charge les textures en arrière-plan

12. Lancement de la boucle de rendu
    → renderer.setAnimationLoop(renderFrame)
```

### 6.2 Boucle de rendu (`renderFrame`)

Appelée à chaque frame d'animation (~60fps) :

```
renderFrame():
  1. updateAutoRotation()         — Rotation auto si inactif > 5s
  2. updateCameraLookAt()         — Oriente la caméra selon lon/lat (sauf XR)
  3. updateHotspots()             — Positionne les hotspots info + sol
  4. updateMinimapArrow()         — Rotation de la flèche minimap
  5. updateCompass()              — Mise à jour boussole
  6. updateVRUI()                 — Repositionne le HUD VR
  7. renderer.render(scene, camera)
```

### 6.3 Orientation de la caméra (`updateCameraLookAt`)

Convertit les coordonnées sphériques (`lon`, `lat`) en point cible 3D :

```javascript
var phi = (90 - lat) * Math.PI / 180;
var theta = lon * Math.PI / 180;
camera.lookAt(
    500 * Math.sin(phi) * Math.cos(theta),
    500 * Math.cos(phi),
    500 * Math.sin(phi) * Math.sin(theta)
);
```

Le point cible est toujours sur la sphère de rayon 500. La caméra reste à l'origine et ne fait que pivoter.

### 6.4 Rotation automatique

Si aucune interaction depuis 5 secondes et pas en transition :
```javascript
tourState.lon += 0.03;  // ~1.8°/seconde
```

### 6.5 Chargement de scène (`loadScene`)

```javascript
loadScene(sceneId, options) → Promise<boolean>
```

Étapes :
1. Récupère la config de la scène cible.
2. Active `isTransitioning` et affiche l'écran de chargement.
3. Charge la texture via `loadTexture()` (avec cache et fallback).
4. Assigne la texture à `sphere.material.map`.
5. Met à jour `currentScene`, `lon`, `lat`, `fov`.
6. Rebuild les hotspots (`initHotspots()`), menu (`updateNavMenu()`), minimap (`updateMinimap()`), bouton retour (`updateBackButton()`).
7. Met à jour l'annonceur d'accessibilité.
8. Précharge les scènes liées.
9. Masque l'écran de chargement après 120ms.
10. Désactive `isTransitioning`.

### 6.6 Préchargement des textures

Deux niveaux de préchargement :

- **Préchargement lié** (`preloadLinkedScenes`) : immédiatement après un changement de scène, les textures de toutes les scènes accessibles par hotspot sont chargées en priorité.
- **Préchargement global** (`preloadAllScenes`) : les scènes restantes sont chargées via `requestIdleCallback` (ou `setTimeout` en fallback) avec un délai progressif de 200ms × index pour ne pas saturer la bande passante.

### 6.7 Paramètres URL de départ (`getStartParams`)

```
?scene=12&lon=180&lat=0
```

- `scene` : ID de la scène de départ (défaut : `'12'`)
- `lon` : orientation horizontale initiale (écrase `defaultBearing`)
- `lat` : orientation verticale initiale (clamp -85 à +85)

---

## 7. Système de hotspots (`hotspots.js`)

### 7.1 Architecture du système

Le système de hotspots repose sur un **mesh 3D unique** (anneau + flèche) positionné sur un **plan invisible au sol** (`Y = -2`), distinct de la sphère panoramique. Ce mesh suit le curseur de l'utilisateur et pointe vers le hotspot de transition le plus proche.

**Constantes clés :**

```javascript
var GROUND_Y = -2;                        // Hauteur du plan au sol
var GROUND_RADIUS = 3.5;                  // Rayon du hotspot au sol
var GROUND_HOTSPOT_INNER_RADIUS = 0.12;   // Rayon intérieur de l'anneau
var GROUND_HOTSPOT_OUTER_RADIUS = 0.36;   // Rayon extérieur de l'anneau
var GROUND_HOTSPOT_ARROW_SCALE = 0.38;    // Échelle de la flèche
var MIN_FOLLOW_RADIUS = 1.2;              // Distance min du centre
var MAX_FOLLOW_RADIUS = 8;                // Distance max du centre
```

### 7.2 Détection au sol — Raycaster planaire

Le système utilise un **plan horizontal** défini par :
```javascript
var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
```

À chaque mouvement de souris :
1. `controls.js → trackMouseOnSphere()` calcule la position 3D du curseur sur la sphère (`mouseSpherePoint`) et sa latitude (`mouseSphereLat`).
2. `updateGroundHotspots()` crée un rayon depuis la caméra vers les coordonnées NDC de la souris.
3. Le rayon intersecte le plan `Y = -2` → point d'intersection `groundPoint`.
4. **Condition d'activation** : `mouseSphereLat < -10` (le curseur doit être dans le tiers inférieur du panorama, le "sol" visuel).
5. Le point est clampé entre `MIN_FOLLOW_RADIUS` (1.2) et `MAX_FOLLOW_RADIUS` (8) pour éviter qu'il ne colle au centre ou ne s'échappe.

### 7.3 Aimantation vers le hotspot le plus proche

```javascript
function nearestTransitionHotspot(point) {
    // Parcourt tous les hotspots de type 'transition'
    // Calcule distanceToSquared entre chaque position et le point au sol
    // Retourne le plus proche
}
```

Le mesh (anneau + flèche) est positionné à `groundPoint` (là où pointe la souris), **pas** à la position 3D du hotspot cible. C'est l'aimantation : le curseur colle au sol à l'endroit du pointeur, mais c'est le hotspot le plus proche qui est activé.

### 7.4 Rotation directionnelle de la flèche

La flèche pointe vers la position 3D réelle du hotspot cible depuis la position du curseur au sol :

```javascript
var dx = nearest.positionVector.x - groundPoint.x;
var dz = nearest.positionVector.z - groundPoint.z;
var angleToTarget = Math.atan2(-dx, -dz);
groundHotspotEntry.ring.rotation.y = angleToTarget;
groundHotspotEntry.arrow.rotation.y = angleToTarget;
```

### 7.5 Animation d'opacité (lerp)

L'opacité du hotspot au sol est animée par interpolation linéaire :

```javascript
groundHotspotEntry.opacity = THREE.MathUtils.lerp(
    groundHotspotEntry.opacity,
    targetOpacity,    // 0.85 si hotspot trouvé, 0 sinon
    0.12              // Vitesse d'interpolation
);
```

Cela produit un fondu progressif à l'apparition/disparition, sans flash.

### 7.6 Mode VR — Visée au poignet

Quand `isXRActive === true`, le système utilise le **pointeur laser de la manette** (pas le regard de la caméra) :

```javascript
function getActiveController() {
    // Retourne la première manette avec matrixWorld valide
}
```

1. Extraction de la position et direction mondiales via `matrixWorld`.
2. Calcul manuel de l'intersection rayon ↔ plan `Y = -2` :
   ```javascript
   var t = (-2 - rayOrigin.y) / rayDir.y;
   ```
3. **Guard #1** : si `|rayDir.y| < 0.001` (manette parallèle au sol) → pas d'intersection.
4. **Guard #2** : si `t < 0` (sol derrière la manette) → pas d'intersection.
5. Le même algorithme d'aimantation s'applique ensuite.

### 7.7 Création du mesh 3D (`createGroundHotspot`)

Deux meshes composent le hotspot au sol :

**Anneau (RingGeometry) :**
```javascript
var ringGeo = new THREE.RingGeometry(0.12, 0.36, 64);
ringGeo.rotateX(-Math.PI / 2);  // Couché au sol
// MeshBasicMaterial blanc, transparent, opacity 0
// renderOrder: 5
```

**Flèche (ShapeGeometry) :**
```javascript
var arrowShape = new THREE.Shape();
arrowShape.moveTo(0, 0.3 * 0.38);
arrowShape.lineTo(0.2 * 0.38, 0);
arrowShape.lineTo(0, 0.1 * 0.38);
arrowShape.lineTo(-0.2 * 0.38, 0);
arrowShape.closePath();
// ShapeGeometry, rotateX(-Math.PI / 2)
// MeshBasicMaterial blanc, transparent, opacity 0
// renderOrder: 6
```

Les deux meshes ont `userData.isGroundHotspot = true` pour le raycasting VR.

### 7.8 Cercles rouges de pulsation (indicateurs de destination)

Chaque hotspot de transition dispose d'un **disque rouge** projeté sur le sol, visible même à distance.

**Projection sur le sol (`projectHotspotToGround`) :**
```javascript
function projectHotspotToGround(position) {
    var dir = new THREE.Vector3(position.x, position.y, position.z).normalize();
    var t = GROUND_Y / dir.y;  // Facteur d'échelle pour amener y à -2
    if (t < 0) t = Math.abs(t);
    // Clamp à 200 unités max
    return new THREE.Vector3(dir.x * t, GROUND_Y, dir.z * t);
}
```

**Texture Canvas partagée (`createPulseCircleTexture`) :**
- Canvas 128×128
- Gradient radial rouge (centre opaque → bord transparent)
- Point central net pour ancrage visuel
- Mise en cache dans `pulseCircleTexture`

**Animation GSAP :**
```javascript
gsap.to(mesh.scale, {
    x: 1.3, y: 1.3, z: 1.3,
    duration: 0.8,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    delay: index * 0.15,  // Déphasage
    onUpdate: function () {
        // Opacité pulsante : 0.6 → 0.35
        var normalized = (mesh.scale.x - 1.0) / 0.3;
        mesh.material.opacity = 0.6 - normalized * 0.25;
    }
});
```

### 7.9 Marqueurs info

Les hotspots de type `info` sont rendus de deux façons :
- **Bouton HTML** positionné par projection 3D→écran dans `updateHotspots()`.
- **Sprite Three.js** (canvas 64×64 avec icône) ajouté au groupe `hotspotGroup` pour le raycasting XR.

### 7.10 Flèches directionnelles avant/arrière

Deux boutons HTML (`#dir-arrow-fwd`, `#dir-arrow-bwd`) permettent d'avancer ou reculer sans tourner la caméra :

```javascript
function bestHotspotInView(direction) {
    // Calcule l'angle relatif de chaque hotspot :
    //   hotspotAngleDeg = atan2(pos.z, pos.x) * (180/PI)
    //   relativeAngle = hotspotAngleDeg - tourState.lon
    // direction > 0 : cherche le plus proche de l'axe avant (0°)
    // direction < 0 : cherche le plus proche de l'axe arrière (180°)
}
```

### 7.11 Gestion du clic

**Clic simple (`onValidClick`) :**
1. Test d'intersection avec le hotspot au sol → si touché : déclenche la transition.
2. Test d'intersection avec un hotspot info → si touché : affiche la fiche info.

**Double-clic (`onDoubleClick`) :**
- Test d'intersection avec le hotspot au sol → déclenche la transition.

### 7.12 Gestionnaire VR (`handleXRSelect`)

Appelé lors de l'événement `select` (gâchette) d'un contrôleur WebXR :

1. **Étape 1** : Test d'intersection avec `window.vrExitButton` (bouton Quitter VR). Si touché → `doExitVR()` + `return`.
2. **Étape 2** : Collecte de tous les meshes de hotspots au sol depuis `groundHotspotGroup`.
3. **Étape 3** : Raycasting sur les meshes. Si un hotspot est trouvé → déclenche la transition.
4. **Fallback** : Si pas de hit direct mais un hotspot actif est à moins de 50 unités → déclenche la transition.

---

## 8. Transition style GSV (`transition.js`)

### 8.1 Cinématique d'ensemble

La transition est orchestrée par une **timeline GSAP unique de 900ms** avec des animations parallèles :

```
0.0s ──────── 0.45s : uStretch monte (0 → 0.4)
0.0s ──────── 0.45s : uBlur monte (0 → 1.0)
0.0s ──────── 0.45s : uOpacity sphère A (1 → 0.5)
0.0s ──────── 0.9s  : dolly-in caméra (startPos → endPos)
0.4s ──────── 0.76s : uOpacity sphère B (0 → 1)
0.45s ─────── 0.9s  : uStretch décroît (0.4 → 0)
0.45s ─────── 0.9s  : uBlur décroît (1.0 → 0)
0.45s ─────── 0.9s  : uOpacity sphère A (0.5 → 0)
0.9s         ─────── : finalize()
```

### 8.2 Dolly-In — Propulsion 3D vers le hotspot

La direction du mouvement est calculée depuis la **position 3D réelle du hotspot cliqué** :

```javascript
var hx = clickedHotspot.position.x;
var hy = clickedHotspot.position.y || 0;
var hz = clickedHotspot.position.z;
var len = Math.sqrt(hx*hx + hy*hy + hz*hz);
dollyDir = new THREE.Vector3(hx/len, hy/len, hz/len);
```

Le vecteur est normalisé. La position cible est `startPos + dollyDir * 80` (80 unités, soit 16% du rayon de 500). GSAP anime `camera.position.x/y/z` simultanément avec easing `power2.inOut` sur 900ms.

**Stabilité de l'horizon** : la caméra ne fait que se translater, `updateCameraLookAt()` continue d'orienter le `lookAt` à chaque frame. L'horizon reste fixe, c'est le paysage qui "passe" devant.

### 8.3 Fondu croisé — Double sphère, double shader

**Sphère A (ancienne scène)** : reçoit un `RadialStretchMaterial` (shader GLSL) avec fondu sortant.
**Sphère B (nouvelle scène)** : créée via `createSphere()`, reçoit un `CrossfadeMaterial` (shader GLSL) avec fondu entrant.

Le chevauchement des deux fondues (les deux sont semi-opaques entre ~40% et 50% de la timeline) garantit l'absence de flash noir.

### 8.4 Radial Stretch — Shader GLSL (sphère A)

**Vertex Shader :**
- Transforme les coordonnées en NDC (Normalized Device Coordinates).
- Calcule le rayon : `radius = length(ndc.xy)`.
- Applique un `smoothstep(0.2, 1.3, radius)` : le centre (radius < 0.2) reste immobile, la périphérie (radius > 1.3) est pleinement étirée.
- Déforme les coordonnées le long de la direction radiale :
  ```glsl
  projected.xy += dir * uStretch * mask * projected.w;
  ```
- Le `projected.w` assure l'homogénéité en perspective.

**Fragment Shader :**
- **Motion blur radial** : 5 échantillons le long du vecteur vers le centre (0.5, 0.5) avec `blurStrength = uBlur * 0.015`.
- Mix avec la couleur originale selon `uBlur`.
- Opacité : `color.a * uOpacity`.

**Paramètres animés par GSAP :**
- `uStretch` : 0 → 0.4 (0-450ms), puis 0.4 → 0 (450-900ms)
- `uBlur` : 0 → 1.0 (0-450ms), puis 1.0 → 0 (450-900ms)
- `uOpacity` : 1 → 0.5 (0-450ms), puis 0.5 → 0 (450-900ms)

### 8.5 Crossfade — Shader GLSL (sphère B)

Shader minimaliste : pas de distorsion, pas de blur. Échantillonne la texture avec les UV d'origine et multiplie l'alpha par `uOpacity` (animé de 0 à 1 entre 360ms et 720ms).

### 8.6 Orientation à l'arrivée — Conservation relative du regard

L'orientation finale n'est **jamais** forcée vers un angle fixe. Elle est calculée pour préserver la direction relative du regard :

**Au clic :**
```javascript
var movementAngle = Math.atan2(dollyDir.x, -dollyDir.z) * (180 / Math.PI);
tourState.relativeLookOffset = tourState.lon - movementAngle;
```

**À l'arrivée (`finalize()`) :**
```javascript
var newLon = normalizeDegrees(movementAngle + 180 - tourState.relativeLookOffset);
tourState.lon = newLon;
```

- `movementAngle` : angle mondial du déplacement (bearing de marche).
- `relativeLookOffset` : décalage entre le regard et l'axe de marche.
- `+180°` : compense l'inversion native de la sphère (`geo.scale(-1, 1, 1)`).
- L'offset est **soustrait** car l'inversion en miroir renverse le sens trigonométrique.

**Exemple :** Utilisateur à `lon=120°`, clique sur hotspot avec `movementAngle=-145°` (215°). Offset = 265°. Arrivée : `normalizeDegrees(-145 + 180 - 265) = 130°`. Le décalage n'est que de 10°, pas de 180°.

### 8.7 Nettoyage post-transition

Dans `finalize()` :
1. L'ancienne sphère est retirée de la scène et disposée.
2. La caméra est réinitialisée à `(0, 0, 0.001)`.
3. La nouvelle sphère devient la sphère active avec matériau standard (non-transparent, depthWrite activé).
4. FOV remis à 75°.
5. `isTransitioning` → `false`, `controlsEnabled` → `true`.

### 8.8 Mise à jour dynamique du bearing

Après chaque transition, le bearing du hotspot inverse est mis à jour :
```javascript
var reverseBearing = getReverseHotspotBearing(targetId, previousSceneId);
if (reverseBearing !== null) {
    updateHotspotBearing(previousSceneId, targetId, reverseBearing);
} else {
    var fallbackBearing = normalizeDegrees(newLon + 180);
    updateHotspotBearing(previousSceneId, targetId, fallbackBearing);
}
```

---

## 9. Contrôles utilisateur (`controls.js`)

### 9.1 Souris

| Action | Comportement |
|---|---|
| Clic-glisser horizontal | Pivote la caméra (`lon -= dx * 0.18`) |
| Clic-glisser vertical | Pivote la caméra (`lat += dy * 0.12`, clamp ±85°) |
| Molette | Zoom (`fov += deltaY * 0.05`, clamp 40-100) |
| Clic simple (delta < 5px) | Déclenche `onValidClick()` |
| Double-clic | Déclenche `onDoubleClick()` |

### 9.2 Tactile

| Action | Comportement |
|---|---|
| Doigt unique | Pivote (même coefficients que souris) |
| Deux doigts (pinch) | Zoom (`fov -= delta * 0.08`) |

### 9.3 Clavier

| Touche | Action |
|---|---|
| `←` / `→` | Pivoter horizontalement (±3°) |
| `↑` / `↓` | Pivoter verticalement (±2°) |
| `+` / `=` | Zoomer (FOV −2°) |
| `-` | Dézoomer (FOV +2°) |
| `F` | Plein écran |
| `Backspace` | Retour scène précédente |
| `Alt + ←` | Retour scène précédente |
| `Échap` | Fermer fiche info |
| `1`–`9` | Aller à la scène correspondante (si existe) |

### 9.4 Tracking de la souris sur la sphère

`trackMouseOnSphere(event)` est appelé à chaque `mousemove` :
1. Convertit les coordonnées écran en NDC.
2. Lance un rayon depuis la caméra.
3. Intersecte la sphère principale.
4. Calcule la latitude : `lat = asin(point.y / 500) * 180/PI`.
5. Stocke `mouseSphereLat` et `mouseSpherePoint` dans `tourState`.
6. Appelle `updateFloorHotspot()` si défini.

### 9.5 Zone morte de clic

Un clic n'est considéré comme "valide" (non-drag) que si `mouseDelta < 5` pixels. Cela distingue un clic d'un début de glissement.

---

## 10. Interface utilisateur (`ui.js`)

### 10.1 Menu latéral

- Construit dynamiquement depuis `TOUR_CONFIG.scènes`.
- Chaque item est un `<div class="scene-item">` cliquable.
- L'item actif a la classe `active` (fond bleu `#3B82F6`).
- Accessible au clavier (`tabIndex=0`, `role="button"`, `Enter`/`Espace`).
- Bouton **Partager** : génère `?scene=X&lon=Y&lat=Z` et copie dans le presse-papiers.

### 10.2 Minimap

- SVG 160×160px avec :
  - **Lignes** connectant les scènes liées (détection bidirectionnelle).
  - **Points** cliquables positionnés selon `minimapX`/`minimapY`.
  - **Flèche** triangulaire sur la scène active, tournée selon `tourState.lon`.
- Le point actif a une animation `pulse` (box-shadow animé).

### 10.3 Boussole

- SVG avec rose des vents (N/S/E/W) et aiguille rouge/blanche.
- 16 points cardinaux via `compassDirection(degrees)`.
- Affichage texte : `"180 S"`.

### 10.4 Zoom

- Contrôles `+`/`-` avec animation custom (easing `t * (2 - t)` sur 260ms).
- Affichage : pourcentage `(100 / fov) * 100 + '%'`.
- Plage : FOV 40° (zoom max) à 100° (dézoom max).

### 10.5 Plein écran

- API standard + préfixes webkit/moz/ms.
- Icône SVG bascule entre expand/compress.

### 10.6 Fiche info

- Carte positionnée près du curseur (`grid-template-columns: 38px 1fr`).
- Contient icône, titre, description.
- Fermeture via bouton × ou touche Échap.
- En VR : délègue à `showVRInfoPanel()`.

### 10.7 Partage

```javascript
// URL générée :
baseUrl + '?scene=' + sceneId + '&lon=' + lon + '&lat=' + lat
```

Copie via `navigator.clipboard.writeText()` avec fallback `document.execCommand('copy')`.

### 10.8 Historique et bouton Retour

- Chaque transition empile `currentScene` dans `history[]` (max 50).
- Le bouton retour dépile et déclenche `startTransition(previousScene, { isBack: true })`.
- Pendant un retour, `pushHistory()` n'empile pas (flag `isBack`).

### 10.9 Bouton VR

Créé dynamiquement dans `setupVRButton()` :
- Vérifie la support WebXR via `navigator.xr.isSessionSupported('immersive-vr')`.
- Si supporté : bouton "ENTRER EN VR" → clique → `navigator.xr.requestSession()`.
- Pendant la session : bouton → "QUITTER LA VR".
- Si non supporté : bouton grisé "VR NON SUPPORTÉE".

### 10.10 Panneau d'info VR

- Panneau 3D (2.4 × 1.2 unités) avec texture canvas.
- Contient icône dans un cercle bleu, titre, description avec retour à la ligne automatique.
- Bouton de fermeture (×) détecté par gaze (1.5 secondes de regard continu).
- Positionné à 2 unités devant la caméra, suit la rotation de celle-ci.

---

## 11. Mode VR / WebXR (`vr-ui.js` + `xr-controls.js`)

### 11.1 Contrôleurs WebXR

Deux contrôleurs sont créés dans `main.js → setupXRControllers()` :
- **Rayon laser** : ligne bleue de 4 unités (`LineBasicMaterial`).
- **Événement `select`** (gâchette) → appelle `handleXRSelect()`.
- **Événement `thumbstickmoved`** → appelle `handleVRJoystick()`.

### 11.2 HUD VR (`vr-ui.js`)

Le HUD est un **groupe Three.js ajouté à la scène mondiale** (pas à la caméra) pour éviter le bug de matrice WebXR.

**`updateVRUI()`** repositionne le HUD chaque frame :
1. Copie la position de la caméra.
2. Extrait uniquement le **yaw** (rotation Y) — pitch et roll annulés.
3. Décale le HUD à `z = -1.5` devant l'utilisateur.

**Bouton "Quitter VR" :**
- Canvas 256×64 avec texte "Quitter VR".
- Mesh `PlaneGeometry(0.4, 0.1)` positionné à `(0, -0.6, -1.5)`.
- Exposé globalement via `window.vrExitButton`.
- `renderOrder: 10`.

### 11.3 Gestionnaire de sélection VR (`handleXRSelect` dans `vr-ui.js`)

1. Extrait la rotation de la manette via `matrixWorld`.
2. Crée un rayon depuis la position de la manette.
3. Teste l'intersection avec `window.vrExitButton`.
4. Si touché → `doExitVR()` (termine la session WebXR).

### 11.4 Joystick VR (`handleVRJoystick` dans `vr-ui.js`)

```javascript
function handleVRJoystick(event) {
    var x = event.data.axes[0];  // Horizontal
    var y = event.data.axes[1];  // Vertical
    var deadZone = 0.2;

    // Rotation horizontale
    if (Math.abs(x) > deadZone) {
        tourState.lon -= x * 1.5;
    }

    // Avancer/Reculer : cherche un hotspot dans la direction du regard
    if (Math.abs(y) > deadZone) {
        var direction = y < 0 ? 1 : -1;
        // Calcule la direction du regard (forwardDir)
        // Cherche le hotspot le plus proche dans cette direction
        // Si angle < 45° → déclenche la transition
    }
}
```

### 11.5 Contrôleurs avancés (`xr-controls.js`)

Module supplémentaire pour le support complet des manettes Meta Quest :

- **Joystick** : mouvement continu avec `setInterval(50ms)`, zone morte 0.3.
- **Squeeze** (pression latérale) : retour arrière (`goBack()`).
- **Bouton A/X** : ouvre le menu latéral.

### 11.6 Réticule VR

Cercle SVG (20px) avec anneau de progression, affiché uniquement en session XR (`#reticle.active`). Positionné au centre de l'écran.

### 11.7 Masquage de l'interface en VR

Quand `body.xr-active` est présent, tous les éléments UI (menu, minimap, zoom, boussole, etc.) sont masqués via CSS :
```css
body.xr-active #nav-menu,
body.xr-active #nav-toggle,
/* ... */ {
    opacity: 0;
    pointer-events: none;
}
```

---

## 12. Éditeur de hotspots (`hotspot-editor.html`)

Outil autonome pour positionner visuellement les hotspots dans les scènes 360°.

### 12.1 Fonctionnement

1. **Panneau gauche** : visualiseur Three.js avec la scène 360° navigable (clic-glisser).
2. **Panneau droit** : formulaire de configuration du hotspot.

### 12.2 Fonctionnalités

- **Sélecteur de scène** : liste déroulante de toutes les scènes.
- **Capture de coordonnées** : clic sur le panorama → calcule le point d'intersection rayon-sphère → affiche `{x, y, z}`.
- **Boussole temps réel** : affiche le bearing actuel de la caméra (direction de regard).
- **Calcul de bearing** :
  - "Utiliser la direction actuelle" : copie le `lon` actuel dans le champ bearing.
  - "Calculer depuis position" : calcule `atan2(x, -z)` depuis les coordonnées capturées.
- **Propriétés du hotspot** : type (transition/info), scène cible, bearing, label.
- **Copie en un clic** : génère le code JavaScript prêt à coller dans `config.js`.
- **Historique des clics** : liste des derniers clics avec code généré, cliquable pour copier.

### 12.3 Formule de calcul du bearing depuis la position

```javascript
function bearingFromPosition(x, z) {
    var b = Math.atan2(x, -z) * 180 / Math.PI;
    return ((b % 360) + 360) % 360;  // Normalisation 0-360°
}
```

---

## 13. Feuille de style (`style.css`)

### 13.1 Principes

- Reset CSS minimal (`margin: 0`, `box-sizing: border-box`).
- Police : `system-ui` (native).
- Fond noir, texte blanc.
- Canvas plein écran (`100vw × 100vh`).
- Curseur `grab` / `dragging`.

### 13.2 Thème UI

Tous les panneaux partagent le même style :
```css
background: rgba(0, 0, 0, 0.6);
backdrop-filter: blur(10px);
border: 1px solid rgba(255, 255, 255, 0.15);
border-radius: 12px;
```

### 13.3 Couleurs

| Usage | Couleur |
|---|---|
| Accent / actif | `#3B82F6` (bleu) |
| Erreur / point rouge | `#EF4444` (rouge) |
| Texte secondaire | `rgba(255,255,255, 0.5-0.82)` |
| Fond panneau | `rgba(0,0,0, 0.6-0.86)` |

### 13.4 Animations CSS

- **Spinner** : rotation 360° en 0.85s (loading).
- **Pulse** : box-shadow animée (minimap dot actif).
- **Spin** : rotation 360° (VR reticle progress).

### 13.5 Responsive

À `max-width: 700px` :
- Menu : largeur réduite à `min(220px, calc(100vw - 36px))`.
- Minimap : 132×132px au lieu de 160×160px.
- Logo : texte masqué.

---

## 14. Pipeline de rendu des textures

### 14.1 Chargement (`loadTexture`)

```javascript
loadTexture(path) → Promise<Texture>
```

1. Vérifie le cache `textureCache[path]`.
2. Génère des candidats : `.jpg` → `.JPG` → `.jpeg` → `.JPEG`.
3. Essaie chaque candidat séquentiellement jusqu'au succès.
4. Configure la texture :
   - `minFilter = THREE.LinearFilter`
   - `magFilter = THREE.LinearFilter`
   - `encoding = THREE.sRGBEncoding`
   - `needsUpdate = true`
5. Met en cache et résout la promesse.

### 14.2 Correction luminosité

```javascript
renderer.outputEncoding = THREE.sRGBEncoding;  // Couleurs fidèles
renderer.toneMapping = THREE.LinearToneMapping;  // Pas de tone mapping cinématique
renderer.toneMappingExposure = 1.4;  // +40% luminosité
```

Ajuster `toneMappingExposure` pour modifier la luminosité globale (1.0 = neutre).

---

## 15. Navigation clavier

| Touche | Action | Détail |
|---|---|---|
| `←` | Pivoter gauche | `lon -= 3°` |
| `→` | Pivoter droite | `lon += 3°` |
| `↑` | Pivoter haut | `lat += 2°` (clamp +85°) |
| `↓` | Pivoter bas | `lat -= 2°` (clamp -85°) |
| `+` / `=` | Zoomer | `fov -= 2°` |
| `-` | Dézoomer | `fov += 2°` |
| `F` | Plein écran | Toggle via API Fullscreen |
| `Backspace` | Retour | Dépile l'historique |
| `Alt + ←` | Retour | Alternative |
| `Échap` | Fermer | Ferme la fiche info |
| `1`–`9` | Raccourci scène | Si `TOUR_CONFIG.scenes[String(num)]` existe |

Toutes les touches qui modifient l'orientation appellent `stopAutoRotation()`.

---

## 16. Système de bearings et orientations

### 16.1 Convention d'angles

- `0°` = nord (vers `-Z`)
- `90°` = est (vers `+X`)
- `180°` = sud (vers `+Z`)
- `270°` = ouest (vers `-X`)

### 16.2 `defaultBearing` (scène)

- Défini dans `config.js` pour chaque scène.
- Utilisé **uniquement** au chargement initial (URL directe ou premier accès).
- **Ignoré** après une transition GSV (c'est la formule de conservation du regard qui prévaut).
- **Écrasé** par `?lon=` dans l'URL.

### 16.3 `bearing` (hotspot)

- Défini dans `config.js` pour chaque hotspot de type `transition`.
- Représente la direction vers laquelle la caméra avance pendant le dolly-in.
- Sert aussi de direction de vue après transition (via la formule de conservation).
- Si absent, calculé automatiquement via `atan2(x, -z)` au chargement.

### 16.4 Formule de conversion position → angle

```javascript
bearing = Math.atan2(position.x, -position.z) * 180 / Math.PI;
if (bearing < 0) bearing += 360;
```

### 16.5 Scènes sans `defaultBearing`

Les scènes 18 à 35 n'ont pas de `defaultBearing` défini dans `config.js`. Elles utilisent `0` par défaut (nord). Seules les scènes 12, 13, 14, 15, 16, 17 ont un `defaultBearing` explicite.

---

## 17. Points d'attention et conventions

### 17.1 Interdiction de modifier les coordonnées hotspots

Les positions `{x, y, z}` des hotspots dans `config.js` sont **read-only**. Les modifier sans utiliser `hotspot-editor.html` produit un décalage visuel. Toute modification doit passer par l'éditeur.

### 17.2 Ordre de chargement des scripts

L'ordre des `<script>` dans `index.html` est critique :
```
config.js → state.js → controls.js → transition.js → hotspots.js → ui.js → vr-ui.js → xr-controls.js → main.js
```

Chaque module expose ses fonctions sur `window` pour les modules suivants. Modifier cet ordre peut casser les dépendances.

### 17.3 Deux systèmes `handleXRSelect` coexistent

- `vr-ui.js` expose `handleXRSelect` sur `window` → teste uniquement le bouton Quitter VR.
- `hotspots.js` expose aussi `handleXRSelect` sur `window` → écrase la version de `vr-ui.js` et teste les hotspots au sol + le bouton Quitter VR (en deux étapes).

C'est `hotspots.js` qui a la priorité (chargé après). La version dans `vr-ui.js` n'est utilisée que si `handleXRSelect` n'est pas écrasé.

### 17.4 Deux systèmes `initXRControls` coexistent

- `xr-controls.js` définit `initXRControls` avec support joystick complet.
- `main.js` appelle `window.initXRControls()` dans `init()`.

### 17.5 Performance

- Les textures sont mises en cache globalement (une seule instance par image).
- Le préchargement utilise `requestIdleCallback` pour ne pas bloquer le thread principal.
- Le raycaster au sol est recréé à chaque frame (pas de réutilisation).
- Les cercles pulse partagent une seule CanvasTexture.

### 17.6 Accessibilité

- Annonceur ARIA (`aria-live="polite"`) pour les changements de scène.
- Attributs `aria-label` sur tous les boutons interactifs.
- Navigation clavier complète (Tab, Enter, Espace).
- Focus visible (`:focus-visible` avec outline bleu).

### 17.7 Scène par défaut

La scène `12` (Entrée) est la scène par défaut. L'URL `?scene=X&lon=Y&lat=Z` permet de démarrer sur n'importe quelle scène avec une orientation spécifique.

---

*Documentation générée le 22 juin 2026 — Visite Virtuelle 360° style Google Street View*
