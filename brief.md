# Brief Technique — Visite Virtuelle 360°

## Architecture générale

Le projet est une visite virtuelle panoramique basée sur **Three.js (r128)**. Il n'utilise aucun framework, uniquement du JavaScript vanilla organisé en modules IIFE (Immediately Invoked Function Modules). Sept fichiers JS constituent le cœur de l'application :

| Fichier | Rôle |
|---|---|
| `config.js` | Définition des scènes et de leurs hotspots |
| `state.js` | Objet global d'état partagé (`window.tourState`) |
| `main.js` | Initialisation Three.js, boucle de rendu, chargement de scènes |
| `controls.js` | Gestion des entrées souris/touch/clavier |
| `hotspots.js` | Système de hotspots (navigation + info) |
| `transition.js` | Effets de transition entre scènes |
| `ui.js` | Interface utilisateur (menu, minimap, boussole, VR, etc.) |

---

## 1. Système de Hotspots

### 1.1. Données — `config.js`

Chaque scène dans `window.TOUR_CONFIG.scenes` contient un tableau `hotspots[]`. Chaque hotspot est un objet avec cette structure :

```js
{
  position: { x: 150, y: -20, z: -280 },  // Coordonnées 3D sur la sphère
  type: 'transition',                        // 'transition' ou 'info'
  target: '13',                              // ID de la scène cible (transition)
  bearing: 0,                                // Direction en degrés (optionnel)
  label: "Salle d'attente"                   // Texte affiché
}
```

- **`type: 'transition'`** — Déclenche un changement de scène au clic.
- **`type: 'info'`** — Affiche une carte d'information (titre + description + icône).

Au démarrage, `main.js` normalise les positions en vecteurs Three.js (`hotspot.positionVector`) et calcule automatiquement le `bearing` s'il n'est pas fourni, via `Math.atan2(x, -z)`.

### 1.2. Initialisation — `initHotspots()` dans `hotspots.js`

À chaque changement de scène, `initHotspots()` est appelé et effectue :

1. **Création des éléments HTML** pour les hotspots de type `info` :
   - Un `<button>` positionné en absolu est ajouté dans `#info-hotspot-layer`.
   - Chaque bouton écoute le clic pour appeler `window.showInfoCard()`.

2. **Création des marqueurs 3D (sprites)** pour la VR :
   - Un canvas 64×64 est généré dynamiquement avec l'icône du hotspot.
   - Un `THREE.Sprite` est positionné dans la scène 3D aux coordonnées du hotspot.
   - Tous les sprites sont ajoutés à un `THREE.Group` (`hotspotGroup`).

3. **Création du hotspot de sol** (`createGroundHotspot()`) :
   - Un anneau (`THREE.RingGeometry`) et une flèche (`THREE.ShapeGeometry`) sont créés avec les constantes `GROUND_HOTSPOT_INNER_RADIUS` (0.12), `GROUND_HOTSPOT_OUTER_RADIUS` (0.36) et `GROUND_HOTSPOT_ARROW_SCALE` (0.38).
   - Ils sont ajoutés à `groundHotspotGroup`, un groupe 3D positionné au sol.
   - Ce hotspot de sol est le marqueur visible en VR quand on regarde le sol.

4. **Flèches directionnelles** (`#dir-arrow-fwd`, `#dir-arrow-bwd`) :
   - Les boutons avant/arrière appellent `bestHotspotInView(+1)` / `bestHotspotInView(-1)` pour trouver le hotspot le plus centré dans la direction demandée, puis déclenchent la transition.

5. **Affichage initial du floor hotspot** : `floorHotspot.style.display = 'flex'` (le CSS définit `display:flex` sur `#floor-hotspot`). L'élément est invisible par défaut grâce à `opacity: 0` dans le CSS. On contrôle uniquement l'opacity via JavaScript, jamais le display — cela évite une race condition où l'élément resterait invisible.

### 1.3. Positionnement à l'écran — `updateHotspots()`

Appelé à chaque frame dans la boucle de rendu :

- **Hotspots info HTML** : La position 3D est projetée en coordonnées écran via `vec.project(camera)`. Si le point est dans le frustum (`-1 < z < 1`), l'élément HTML est positionné avec `left`/`top` en pixels et rendu visible via la classe `visible`.

- **Hotspots de sol (3D)** : `updateGroundHotspots()` gère leur positionnement (voir section suivante).

### 1.4. Hotspot de sol directionnel — `updateFloorHotspot()`

> **Historique** : Cette fonction était initialement sabotée par `hideFloorHotspot(); return;` en première ligne. Corrigée — elle est désormais pleinement active.

La logique fonctionne ainsi :

1. **Détection du sol** : Quand la souris survole la partie basse du panorama (latitude sur la sphère < -10°), le système considère que la souris est « au sol ».

2. **Marqueur de caméra** (`#camera-marker`) : Une croix X blanche fixe au centre-bas de l'écran, indiquant la position actuelle. Visible uniquement quand la souris est sur le sol.

3. **Ellipse + flèche directionnelle** (`#floor-hotspot`) :
   - Le système trouve le hotspot de transition le plus proche du point pointé au sol (`nearestTransitionHotspot()`).
   - La position écran du hotspot est calculée via `screenPointForHotspot()`.
   - L'ellipse est positionnée à cet endroit.
   - **Rotation de la flèche** : `computeArrowAngle()` calcule l'angle relatif entre la direction du hotspot et le cap caméra :
     ```js
     var hotspotAngleDeg = Math.atan2(pos.z, pos.x) * (180 / Math.PI);
     var relativeAngle = hotspotAngleDeg - window.tourState.lon;
     ```
   - La flèche SVG est tournée via `transform: rotate(angle)`.

4. **Flèches directionnelles fixes** (`#dir-arrows`) : Deux flèches haut/bas fixes au centre de l'écran, permettant d'avancer/reculer dans la séquence de scènes.

### 1.5. Hotspot de sol 3D (VR) — `updateGroundHotspots()`

C'est la version **active** du hotspot de sol, utilisée en VR :

1. La position de la souris en NDC (Normalized Device Coordinates) est convertie en rayon via un `Raycaster`.
2. Le rayon intersecte un plan horizontal (`groundPlane`) positionné à `y = -2`.
3. Le point d'intersection est clampé entre un rayon min (1.2) et max (8) pour éviter que le marqueur ne soit trop près ou trop loin.
4. Le hotspot de transition le plus proche du point au sol est trouvé.
5. L'anneau et la flèche 3D sont positionnés à ce point, orientés vers le hotspot cible via `bearingForHotspot()`.
6. L'opacité est interpolée (lerp) vers 0.85 quand un hotspot est ciblé, sinon vers 0.

### 1.6. Calcul du bearing — `bearingForHotspot()`

```js
bearing = Math.atan2(position.x, -position.z) * 180 / Math.PI;
```

- `position.x` = gauche(-) / droite(+)
- `position.z` = devant(-) / derrière(+)
- Le résultat est normalisé entre 0° et 360°.
- Si le hotspot a un `bearing` explicite dans la config, il est utilisé directement (valeur prioritaire).

### 1.7. Interaction au clic — `onValidClick()` et `onDoubleClick()`

- `onValidClick` est appelé quand la souris est relâchée avec un déplacement < 5px (clic net, pas un drag).
- Il vérifie d'abord si le clic touche un hotspot de sol 3D (`groundHotspotFromEvent()`), puis un hotspot info HTML (`infoHitFromScreen()`).
- `onDoubleClick` ne vérifie que le hotspot de sol 3D et déclenche `triggerGSVTransition` directement.

### 1.8. Navigation VR — `handleXRSelect()` et `updateXRGaze()`

- **`handleXRSelect()`** : Quand on appuie sur le bouton d'un contrôleur VR, un rayon est lancé depuis le contrôleur. `findHotspotFromRay()` cherche le hotspot (transition/info/exit) le plus proche du rayon (seuil : 46 unités). Selon le type : transition, affichage info, ou sortie VR.

- **`updateXRGaze()`** : Système de « gaze » (regard) pour les casques sans contrôleur :
  - Un rayon est lancé depuis la direction de la caméra.
  - Si le regard fixe un hotspot de transition pendant **2 secondes**, la transition se déclenche automatiquement.
  - Si le regard fixe un hotspot info pendant **1.5 seconde**, le panneau info s'affiche.
  - Un réticule avec barre de progression indique le temps de fixation restant.

### 1.9. Éditeur de hotspots — `hotspot-editor.html`

Un outil séparé permettant de :
1. Charger une scène dans un visualiseur Three.js.
2. Cliquer sur la sphère pour capturer les coordonnées 3D (`x, y, z`) du point cliqué.
3. Copier ces coordonnées au format `{ x: _, y: _, z: _ }` pour les coller dans `config.js`.
4. Un historique des clics est conservé dans le panneau latéral.

---

## 2. Système de Transitions

### 2.1. Fonction principale — `triggerGSVTransition()`

C'est le cœur de la transition entre deux scènes. Elle est appelée par `startTransition()` qui lui passe l'ID de la scène cible et le bearing du hotspot.

La transition est orchestrée par **GSAP** (`gsap.timeline`) et se déroule en **0.9 seconde** avec quatre effets simultanés.

### 2.2. Constantes de timing et distance

| Constante | Valeur | Rôle |
|---|---|---|
| `TOTAL_DURATION` | 0.9s | Durée totale de la transition (GSAP travaille en secondes) |
| `DOLLY_DISTANCE` | 80.0 | Distance de translation caméra (16% du rayon 500) |
| `MAX_STRETCH` | 0.38 | Intensité maximale du stretch radial shader |

### 2.3. Déroulement de la transition

**Phase de préparation :**
1. Gardes : pas de transition si déjà en transition, si on est déjà sur la scène cible, ou si la config n'existe pas.
2. L'historique est mis à jour via `pushHistory()`.
3. Les contrôles sont désactivés (`controlsEnabled = false`).
4. La carte info et le hotspot de sol sont masqués.
5. La texture de la scène cible est chargée en arrière-plan (`loadTextureAsync()`). Un flag `textureReady` est mis à `true` quand le chargement est terminé.
6. Une **nouvelle sphère** (`nextSphere`) est créée via `window.createSphere()` et ajoutée à la scène avec `opacity: 0`, `renderOrder: 2`.
7. L'ancienne sphère (`oldSphere`) reçoit un **matériau shader spécial** (`createRadialStretchMaterial()`) qui permet l'effet d'étirement radial. L'ancien matériau est disposé.

**Timeline GSAP :**

```
0.0s ──────── 0.45s : stretch monte (0 → MAX_STRETCH, power2.inOut)
0.0s ──────── 0.45s : opacité vieille sphère (1 → 0, power1.in)
0.0s ──────── 0.9s  : dolly-in caméra (startPos → endPos, power2.inOut)
0.36s ─────── 0.72s : opacité nouvelle sphère (0 → 1, power1.out)
0.9s          ───── : onComplete → finalize()
```

**Phase de finalisation (`finalize()`) :**
1. Si la texture n'est pas encore prête, boucle `waitTexture` de 32ms.
2. L'ancienne sphère est supprimée de la scène et ses ressources libérées (`geometry.dispose()`, `material.dispose()`).
3. La nouvelle sphère devient la sphère principale : `opacity: 1`, `transparent: false`, `depthWrite: true`.
4. La caméra est repositionnée à `(0, 0, 0.001)`.
5. La scène courante est mise à jour.
6. Le cap caméra est orienté vers `bearing + 180°` (on regarde « depuis » la scène d'où on vient).
7. Le FOV est réinitialisé à 75°.
8. L'interface est mise à jour via `updateSceneUi()` (hotspots, menu, minimap).
9. Les contrôles sont réactivés.

### 2.4. Direction du dolly

Le vecteur de direction est calculé à partir du **bearing du hotspot cible** (pas du `lon` caméra) :

```js
var dollyDir = new THREE.Vector3(
    Math.sin(bearingRad),
    0,
    -Math.cos(bearingRad)
).normalize();
var endPos = new THREE.Vector3(
    startPos.x + dollyDir.x * DOLLY_DISTANCE,
    startPos.y,    // Y conservé pour rester dans le plan horizontal
    startPos.z + dollyDir.z * DOLLY_DISTANCE
);
```

GSAP anime directement `camera.position.x/y/z` via `tl.to(camera.position, { x, y, z, duration, ease })`. GSAP détecte nativement les objets avec des propriétés numériques.

### 2.5. Effet de stretch radial — `createRadialStretchMaterial()`

Un shader GLSL personnalisé qui produit un effet de « warp tunnel » sur les bords de l'ancienne sphère.

**Pourquoi ce shader ne produit pas d'écran noir :**
- Il utilise `texture2D(uMap, vUv)` avec `vUv = uv` (les coordonnées UV natives de la SphereGeometry, NON modifiées dans le fragment shader).
- La distorsion est appliquée uniquement dans le vertex shader, en déplaçant la position projetée à l'écran — la texture elle-même est lue normalement depuis ses UV d'origine.
- Quand `uStretch = 0.0` (valeur initiale), le shader est visuellement identique à un MeshBasicMaterial standard. Aucun artefact.
- `side: THREE.DoubleSide` est obligatoire car `geo.scale(-1,1,1)` inverse les normales : sans DoubleSide la sphère serait invisible de l'intérieur.
- `depthWrite: false` évite les conflits de z-buffer entre oldSphere et nextSphere pendant le chevauchement du crossfade.

**Vertex shader :**
- Calcule la position en NDC (Normalized Device Coordinates) : `(-1,-1)` = coin bas-gauche, `(+1,+1)` = coin haut-droit.
- Mesure le rayon par rapport au centre de l'écran : `radius = length(ndc)`.
- Applique un masque `smoothstep(0.25, 1.4, radius)` :
  - **Centre immobile** : pour `radius < 0.25`, edge = 0 → aucun déplacement. L'horizon au centre de l'écran reste net et fixe.
  - **Périphérie étirée** : pour `radius > 0.25`, edge monte vers 1 → les murs latéraux et les coins s'étirent vers l'extérieur.
- Le déplacement est proportionnel à `edge² * uStretch` dans la direction radiale.
- `uStretch` est animé de 0.0 à 0.38 pendant 0.45s avec easing `power2.inOut` via GSAP.

**Pourquoi `smoothstep(0.25, 1.4)` et pas `smoothstep(0.10, 1.15)` :**
- radius est la distance au centre en NDC (0 = centre, ~1.41 = coin d'écran).
- Avec 0.10 comme borne basse, la distorsion commence à 10% du rayon écran ce qui étire aussi l'horizon central.
- Avec 0.25 comme borne basse, les 25% centraux de l'écran (l'horizon, le point de fuite devant la caméra) restent STRICTEMENT à scale 1.
- C'est le « secret » de l'effet GSV : l'horizon reste net et fixe, seule la périphérie (les murs latéraux, le plafond, le sol) s'étire vers les bords de l'écran.

**Fragment shader :**
- Simple sampling de la texture avec opacité variable.
- `uOpacity` est animé de 1.0 à 0.0 pour le fondu de disparition de la vieille sphère.

**Résultat visuel** : l'horizon central reste stable pendant que les bords s'étirent et disparaissent — c'est l'effet « tunnel » caractéristique de Google Street View.

### 2.6. Fonctions utilitaires de transition

- **`easeIn(t)`** : `t * t` — accélération quadratique.
- **`easeOut(t)`** : `t * (2 - t)` — décélération quadratique.
- **`easeInOut(t)`** : courbe en S, accélération puis décélération.
- **`normalizeDegrees(degrees)`** : Normalise un angle entre 0° et 360°.
- **`shortestAngleDelta(from, to)`** : Calcule le plus court chemin angulaire entre deux angles (résultat entre -180° et +180°).
- **`angleForPosition(position)`** : Calcule l'angle horizontal d'une position 3D via `atan2(z, x)`.
- **`bearingForPosition(position)`** : Calcule le bearing d'une position 3D via `atan2(x, -z)`.
- **`bearingForHotspot(hotspot)`** : Retourne le bearing explicite du hotspot ou le calcule depuis sa position.
- **`findTransitionHotspot(sceneId, targetSceneId)`** : Recherche un hotspot de transition pointant vers une scène donnée.
- **`arrivalLonForTransition(from, to)`** : Calcule le cap d'arrivée en trouvant le hotspot inverse dans la scène cible et en ajoutant 180°.
- **`pushHistory(options)`** : Empile la scène courante dans l'historique (max 50 entrées).
- **`loadTextureAsync(url)`** : Charge une texture via `window.loadTourTexture` ou un fallback TextureLoader.
- **`disposeSphere(sphere)`** : Libère la géométrie et le matériau d'une sphère.
- **`updateSceneUi()`** : Met à jour l'UI (hotspots, menu, minimap, annonceur).

### 2.7. Ancien système de transition (non utilisé mais conservé)

Plusieurs fonctions de transition alternatives existent dans le code mais ne sont pas appelées dans le flux principal :

- **`animateTranslationAndCrossfade()`** : Translation de la caméra + crossfade entre deux sphères (utilisait `sphere2`).
- **`animateFov()`** : Animation du FOV (zoom avant/arrière).
- **`animateBlur()`** : Animation du flou CSS sur le canvas.
- **`fadeOverlay()`** : Fondu au noir via un overlay CSS.
- **`animateLon()`** : Rotation de la caméra vers un cap cible.

Ces fonctions sont exposées via `window.*` mais ne sont référencées nulle part dans le code actif — elles constituent des vestiges d'itérations précédentes.

### 2.8. Chargement et cache des textures

- **`loadTexture(path)`** : Charge une texture avec fallback sur plusieurs extensions (.jpg, .JPG, .jpeg, .JPEG). Les textures sont mises en cache dans `textureCache`. `texture.needsUpdate = true` est appelé après `encoding` pour forcer l'upload GPU.
- **`preloadLinkedScenes(sceneId)`** : Précharge les textures des scènes accessibles depuis la scène courante (hotspots de transition).
- **`preloadAllScenes()`** : Précharge toutes les restantes via `requestIdleCallback` avec un délai progressif de 200ms entre chaque chargement, pour ne pas bloquer le thread principal.

---

## 3. Bugs corrigés

### Bug #1 — Écran noir au démarrage (`state.js`)

**Problème** : `window.tourState.currentScene` était initialisé à `'1'`, mais `config.js` ne contient aucune scène avec cet ID. La première scène est `'12'`. Au démarrage, toute lecture de `TOUR_CONFIG.scenes['1']` retournait `undefined`, empêchant le chargement de texture et laissant la sphère noire.

**Correction** : `currentScene: '1'` → `currentScene: '12'`.

### Bug #2 — Hotspot de sol invisible (`hotspots.js`)

**Problème** : La fonction `updateFloorHotspot()` commençait par `hideFloorHotspot(); return;`, ce qui forçait le masquage et sortait immédiatement. Tout le code de détection au sol (latitude < -10°, recherche du hotspot le plus proche, projection écran, rotation de la flèche) était du code mort (unreachable).

**Corrections :**
1. Suppression des deux lignes sabotées.
2. Constantes de taille réduites de ~50% : `INNER_RADIUS` 0.24→0.12, `OUTER_RADIUS` 0.72→0.36, `ARROW_SCALE` 0.68→0.38.
3. `floorHotspot.style.display` passé de `'none'` à `'flex'` dans `initHotspots()` pour respecter le CSS et contrôler uniquement l'opacity.

### Bug #3 — Transition inefficace (`transition.js`)

**Problème** : La transition utilisait un `requestAnimationFrame` manuel avec des constantes inadaptées et un shader incorrect.

**Corrections :**
1. **Migration vers GSAP** : `triggerGSVTransition()` réécrit avec `gsap.timeline()` pour orchestrer le dolly-in, le stretch radial, le fade out et le crossfade de manière synchrone.
2. **Dolly trop faible** : `DOLLY_DISTANCE = 2.5` sur un rayon de 500 = mouvement de 0.5%, imperceptible. Corrigé à `80.0` (16% du rayon).
3. **Durée trop longue** : `TOTAL_DURATION = 1400ms` créait une sensation de latence. Réduit à `0.9s` (GSAP travaille en secondes).
4. **Shader de distorsion incorrect** : `smoothstep(0.10, 1.15, radius)` commençait à distordre dès radius=0.10, trop proche du centre — l'horizon bougeait. Corrigé en `smoothstep(0.25, 1.4, radius)` : le centre (radius < 0.25) reste immobile, seule la périphérie s'étire.
5. **Direction du dolly incorrecte** : Le calcul utilisait `camera.position` directement et le `lon` caméra au lieu du bearing du hotspot cible. Corrigé avec un vecteur `dollyDir` normalisé basé sur le bearing du hotspot, et conservation de la composante Y.

### Bug #4 — Texture non uploadée au GPU (`main.js`)

**Problème** : Après avoir défini `texture.encoding = THREE.sRGBEncoding`, le GPU ne recevait pas la nouvelle texture car `needsUpdate` n'était pas mis à `true`. C'est la cause la plus fréquente d'écran noir après un changement de texture en Three.js r128.

**Corrections :**
1. Ajout de `texture.needsUpdate = true` dans `loadTexture()` après `texture.encoding`.
2. Ajout de `depthWrite: true` dans `createSphere()` pour éviter le z-fight entre sphères.
3. `sphere.material.needsUpdate = true` déjà présent dans `loadScene()` — vérifié, non modifié.
