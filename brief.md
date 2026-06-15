# Brief technique — Visite Virtuelle 360° style Google Street View

---

## Architecture globale

Le projet est une visite virtuelle 360° construite avec **Three.js r128** et **GSAP**, organisée en **8 fichiers IIFE** (Immediately Invoked Function Modules) chargés dans cet ordre via `index.html` :

```
config.js → state.js → controls.js → transition.js → hotspots.js → ui.js → vr-ui.js → main.js
```

| Fichier | Rôle |
|---|---|
| `config.js` | Définition des 24 scènes (ID 12–35) : nom, image 360°, `defaultBearing`, position minimap, hotspots |
| `state.js` | Objet global `window.tourState` — état caméra, scène courante, historique, flags XR |
| `controls.js` | Entrées utilisateur : souris, tactile (pinch-to-zoom), clavier (flèches, +/-, F, Backspace, Échap) |
| `transition.js` | Cinématique de changement de scène style GSV (dolly + stretch + crossfade) |
| `hotspots.js` | Hotspots 3D au sol (anneau + flèche), marqueurs info, gaze VR, détection de clic |
| `ui.js` | Menu latéral scènes, minimap SVG, boussole, zoom, plein écran, partage URL, fiche info |
| `vr-ui.js` | HUD WebXR (boutons Retour/Scènes/Quitter), menu scènes 3D, réticule |
| `main.js` | Bootstrap Three.js (scène, caméra, renderer, sphères), boucle de rendu, préchargement textures |

### Objet global `window.tourState`

```js
{
  currentScene: '12',   // ID scène courante
  lon: 0,               // Direction de vue horizontale (degrés)
  lat: 0,               // Direction de vue verticale (degrés)
  fov: 75,              // Champ de vision (40–100)
  isTransitioning: false,
  isDragging: false,
  history: [],          // Pile pour le bouton Retour (max 50 entrées)
  isXRActive: false,
  xrControllers: [],
  gazeTarget: null,     // Hotspot actuellement regardé en VR
  gazeStartTime: 0,
  camera, renderer, scene, sphere, sphere2
}
```

---

## 1. Système de hotspots

### 1.1 Données de configuration (`config.js`)

Chaque scène contient un tableau `hotspots` avec deux types :

- **`transition`** — Flèche au sol cliquable menant à une autre scène. Possède `position`, `target` (ID scène cible), `bearing` (direction en degrés), `label`.
- **`info`** — Bouton sphérique flottant avec icône. Possède `position`, `icon`, `title`, `description`.

Les coordonnées `{x, y, z}` sont des positions 3D sur la sphère de rayon 500. Elles sont **en lecture seule** — les modifier décale visuellement le hotspot. Au chargement, `main.js` pré-calcule `hotspot.positionVector` (Vector3) et `hotspot.bearing` (si absent) via `atan2(x, -z)`.

### 1.2 Détection au sol — Raycaster + plan horizontal

Le système repose sur un Raycaster dédié au sol, distinct de celui du panorama sphérique :

- Un plan invisible est défini à `Y = -2` via `new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y)`. C'est un plan horizontal qui coupe l'espace 2 unités sous le centre de la sphère.
- À chaque mouvement de souris, `controls.js → trackMouseOnSphere()` calcule la position 3D du pointeur sur la sphère (`mouseSpherePoint`) et sa latitude (`mouseSphereLat`).
- Dans `updateGroundHotspots()`, le Raycaster est recréé à chaque frame avec les coordonnées NDC de la souris. La détection du sol n'active le hotspot que si `mouseSphereLat < -10` — c'est-à-dire quand le curseur est dans le tiers inférieur du panorama (le "sol" visuel du 360°).
- Si le rayon intersecte le plan, le point d'intersection (`groundPoint`) est récupéré. Ce point est ensuite clampé entre un rayon minimal (`MIN_FOLLOW_RADIUS = 1.2`) et maximal (`MAX_FOLLOW_RADIUS = 8`) pour éviter que le hotspot ne colle au centre ou ne s'échappe trop loin.

### 1.3 Aimantation (snapping) vers le hotspot le plus proche

Une fois le point d'intersection au sol obtenu :

- `nearestTransitionHotspot(groundPoint)` parcourt tous les hotspots de type `transition` de la scène actuelle et calcule la distance au carré (`distanceToSquared`) entre chaque position de hotspot et le point au sol. Le plus proche est retenu.
- Le mesh du hotspot (anneau + flèche Three.js) est positionné à la coordonnée `groundPoint`, **pas** à la coordonnée 3D du hotspot cible. C'est ça l'aimantation : le curseur "colle" au sol à l'endroit où pointe la souris, mais c'est le hotspot le plus proche qui est visuellement activé.
- L'opacité est gérée par un lerp (`THREE.MathUtils.lerp(opacity, targetOpacity, 0.12)`) pour un fondu progressif. L'opacité cible est `0.85` si un hotspot est trouvé, `0` sinon.

### 1.4 Rotation directionnelle de la flèche 3D

La flèche au sol est un mesh Three.js (pas un overlay HTML). Sa rotation est calculée dans le **repère mondiel** :

```js
var dx = nearest.positionVector.x - groundPoint.x;
var dz = nearest.positionVector.z - groundPoint.z;
var angleToTarget = Math.atan2(-dx, -dz);
groundHotspotEntry.ring.rotation.y = angleToTarget;
groundHotspotEntry.arrow.rotation.y = angleToTarget;
```

La flèche pointe donc vers la position 3D réelle du hotspot cible depuis la position du curseur au sol. Cette rotation est recalculée à chaque frame.

### 1.5 Mode VR — Rayon depuis le regard

Quand `isXRActive === true`, le système utilise un rayon depuis la position et la direction de la caméra (pas la souris) pour intersecter le plan au sol. Le même algorithme d'aimantation s'applique ensuite.

### 1.6 Flèches directionnelles avant/arrière

Deux boutons HTML (`#dir-arrow-fwd`, `#dir-arrow-bwd`) permettent d'avancer ou reculer sans tourner la caméra. La fonction `bestHotspotInView(direction)` calcule le hotspot dont l'angle relatif (`atan2(pos.z, pos.x) - tourState.lon`) est le plus proche de l'axe avant (direction `+1`) ou arrière (direction `-1`).

### 1.7 Marqueurs info

Les hotspots de type `info` sont rendus de deux façons :
- Un **bouton HTML** positionné par projection 3D→écran dans `updateHotspots()`.
- Un **sprite Three.js** (canvas avec icône) ajouté au groupe `hotspotGroup` pour le raycasting XR.

---

## 2. Animation de transition style GSV

### 2.1 Cinématique d'ensemble — Timeline GSAP

La transition est orchestrée par une timeline GSAP unique de **900ms** avec des animations parallèles positionnées via le paramètre de délai :

```
0.0s ──────── 0.45s : uStretch monte (0 → 0.38)
0.0s ──────── 0.45s : uBlur monte (0 → 1.0)
0.0s ──────── 0.45s : uOpacity sphère A (1 → 0, fondu sortant)
0.0s ──────── 0.9s  : dolly-in caméra (startPos → endPos)
0.4s ──────── 0.76s : uOpacity sphère B (0 → 1, fondu entrant)
0.45s ─────── 0.9s  : uStretch décroît (0.38 → 0)
0.45s ─────── 0.9s  : uBlur décroît (1.0 → 0)
0.9s         ─────── : finalize()
```

### 2.2 Dolly-In — Déplacement physique de la caméra

La direction du mouvement est dérivée de la **position 3D réelle du hotspot cliqué** (pas du bearing) :

```js
var hx = clickedHotspot.position.x;
var hy = clickedHotspot.position.y || 0;
var hz = clickedHotspot.position.z;
var len = Math.sqrt(hx*hx + hy*hy + hz*hz);
dollyDir = new THREE.Vector3(hx/len, hy/len, hz/len);
```

Le bearing configuré dans `config.js` n'est utilisé qu'en **fallback** si aucun hotspot n'est fourni. La position cible est `startPos + dollyDir * 80` (80 unités Three.js, soit 16% du rayon de sphère de 500). GSAP anime `camera.position.x/y/z` simultanément avec un easing `power2.inOut` sur les 900ms complets.

**Pourquoi l'horizon reste stable** : la caméra ne fait que se translater, elle ne change pas son `lookAt()`. La fonction `updateCameraLookAt()` dans `main.js` continue d'orienter la caméra vers le point cible sphérique à chaque frame. Donc pendant le dolly-in, la caméra avance tout en continuant à regarder autour d'elle normalement — l'horizon ne bouge pas, c'est le paysage qui "passe" devant.

### 2.3 Fondu croisé — Double sphère, double shader

Le système utilise deux sphères :
- `window.tourState.sphere` — la sphère active (scène A au moment du clic)
- Une **nouvelle sphère** créée à chaque transition via `window.createSphere()` pour la scène B

Au déclenchement :
1. La nouvelle sphère (B) est ajoutée à la scène avec opacity 0 et un `CrossfadeMaterial` (shader GLSL).
2. La texture de la scène B est chargée asynchrone et assignée au shader.
3. L'ancienne sphère (A) reçoit un `RadialStretchMaterial` (shader GLSL) avec fondu sortant.
4. **Fondu sortant (A)** : `uOpacity` passe de 1 à 0 sur les 450ms premiers (`power1.in`).
5. **Fondu entrant (B)** : `uOpacity` passe de 0 à 1 entre 360ms et 720ms (`power1.out`), décalée à 40% de la timeline.

Le chevauchement des deux fondues (les deux sont semi-opaques entre 360ms et 450ms) garantit qu'il n'y a jamais de flash noir.

### 2.4 Radial Stretch — Shader GLSL personnalisé (sphère A)

Un `ShaderMaterial` custom remplace le matériau de la vieille sphère pendant la transition :

**Vertex Shader :**
- Les coordonnées de position sont transformées en NDC (Normalized Device Coord).
- Un rayon est calculé : `radius = length(ndc.xy)` — la distance au centre de l'écran en coordonnées projetées.
- Un `smoothstep(0.2, 1.2, radius)` crée une zone de transition : le centre de l'écran (radius < 0.2) reste immobile, la périphérie (radius > 1.2) est pleinement étirée.
- L'étirement est appliqué le long de la direction radiale : `projected.xy += dir * uStretch * mask * projected.w`. Le `projected.w` assure que l'effet est homogène en perspective.
- Le paramètre `uStretch` est animé de 0 à 0.38 par GSAP sur les 450ms premiers, puis de 0.38 à 0 sur les 450ms suivants.

**Fragment Shader :**
- **Motion blur directionnel radial** : 5 échantillons le long du vecteur vers le centre (0.5, 0.5) avec un blurStrength proportionnel à `uBlur * 0.012`. Le résultat est mixé avec la couleur originale selon `uBlur`.
- L'opacité est appliquée via `color.a * uOpacity`.

**Pourquoi pas un simple `.scale` ?** Un scale global agrandirait uniformément la sphère, y compris son centre, et créerait un zoom perceptible. Le shader radial stretch ne touche que la périphérie, créant un effet de tunnel/vitesse où le centre reste net et les bords s'étirent — exactement le comportement de Google Street View.

### 2.5 Crossfade — Shader GLSL (sphère B)

Shader minimaliste : pas de distorsion, pas de blur — uniquement un fondu d'opacité progressif. Le fragment shader sample la texture avec les UV d'origine et multiplie l'alpha par `uOpacity` (animé de 0 à 1).

### 2.6 Orientation à l'arrivée

Dans la fonction `finalize()` :

```js
// On NE touche PAS à window.tourState.lon
// La transition GSAP a déjà orienté la caméra de manière fluide
// vers l'axe du dolly-in. Forcer un saut vers defaultLon créerait
// un "pop" visuel. La vue en cours est conservée telle quelle.
```

La caméra est réinitialisée à `(0, 0, 0.001)` (le dolly-in est annulé), le FOV est remis à 75°, et la nouvelle sphère devient la sphère active avec un matériau standard (non-transparent, depthWrite activé).

**Important** : le `defaultBearing` de la scène cible (défini dans `config.js`) n'est **pas** utilisé après une transition. Il sert uniquement au chargement initial de la scène (via `loadScene()` dans `main.js` quand `options.initialLon` n'est pas fourni). Après une transition GSV, c'est la direction du dolly-in qui détermine l'orientation finale.

---

## 3. Rendu et boucle de rendu

### 3.1 Initialisation Three.js (`main.js → init()`)

- **Scène** : `THREE.Scene` avec fond noir.
- **Caméra** : `THREE.PerspectiveCamera(75, aspect, 0.1, 1000)`, positionnée à `(0, 0, 0.001)`.
- **Renderer** : `THREE.WebGLRenderer` avec :
  - `outputEncoding = THREE.sRGBEncoding` (couleurs fidèles)
  - `toneMapping = THREE.LinearToneMapping`
  - `toneMappingExposure = 1.4` (luminosité +40%)
  - `xr.enabled = true` (WebXR activé)
- **Sphère principale** : `SphereGeometry(500, 60, 40)` avec `scale(-1, 1, 1)` (normale inversée pour voir l'intérieur).
- **Sphère de transition** : deuxième sphère identique, initialement invisible, réutilisée pendant les transitions.

### 3.2 Boucle de rendu (`renderFrame`)

Appelée via `renderer.setAnimationLoop(renderFrame)` :

1. `updateAutoRotation()` — Rotation automatique de 0.03°/frame si aucune interaction depuis 5s.
2. `updateCameraLookAt()` — Recalcule le `lookAt` de la caméra selon `lon`/`lat` (sauf en XR).
3. `updateHotspots()` — Positionne les hotspots info HTML et met à jour le hotspot au sol.
4. `updateMinimapArrow()` — Rotation de la flèche sur la minimap.
5. `updateCompass()` — Met à jour l'aiguille et le cap de la boussole.
6. `updateXRGaze()` — Gaze tracking VR (voir section 5).
7. `updateVRInfoPanelFrame()` — Positionne le panneau d'info VR devant la caméra.
8. `updateVRUI()` — Repositionne le HUD VR devant l'utilisateur.
9. `renderer.render(scene, camera)`

### 3.3 Chargement de scène (`loadScene`)

```
loadScene(sceneId, options) → Promise
```

- Charge la texture via `loadTexture()` (avec cache et fallback .jpg/.JPG/.jpeg/.JPEG).
- Assigne la texture à `sphere.material.map`.
- Met à jour `currentScene`, `lon` (depuis `options.initialLon` ou `defaultBearing`), `lat`, `fov`.
- Rebuild les hotspots, menu, minimap, bouton retour.
- Précharge les scènes liées (accessibles par hotspot).
- Masque l'écran de chargement après 120ms.

### 3.4 Préchargement des textures

- **Préchargement lié** : après chaque changement de scène, les textures des scènes accessibles par hotspot sont chargées en priorité.
- **Préchargement global** : les scènes restantes sont chargées via `requestIdleCallback` (ou `setTimeout` en fallback) avec un délai progressif (200ms × index) pour ne pas saturer la bande passante.

---

## 4. Interface utilisateur (`ui.js`)

### 4.1 Menu latéral

- Liste des scènes construite dynamiquement depuis `TOUR_CONFIG`.
- Chaque item est cliquable et déclenche `startTransition(sceneId)`.
- L'item actif est surligné en bleu (`#3B82F6`).
- Bouton **Partager** : génère une URL `?scene=X&lon=Y&lat=Z` et la copie dans le presse-papiers.

### 4.2 Minimap

- SVG généré dynamiquement avec :
  - Des **lignes** connectant les scènes liées (détection bidirectionnelle via `sceneHasLink()`).
  - Des **points** cliquables positionnés selon `minimapX`/`minimapY` (0–100%).
  - Une **flèche** triangulaire sur la scène active, tournée selon `tourState.lon`.

### 4.3 Boussole

- SVG avec rose des vents (N/S/E/W) et aiguille rouge/blanche.
- Le cap est calculé via `compassDirection(degrees)` (16 points cardinaux).
- Affichage texte : `« 180 S »`.

### 4.4 Zoom

- Contrôles `+`/`-` avec animation GSAP-like (easing `t * (2 - t)` sur 260ms).
- Molette souris : `deltaY * 0.05` par tick.
- Pinch tactile : delta distance × 0.08.
- Plage : FOV 40° (zoom max) à 100° (dézoom max).
- Affichage : pourcentage `(100 / fov) * 100 + '%'`.

### 4.5 Plein écran

- API standard + préfixes webkit/moz/ms.
- Icône SVG bascule entre expand/compress.

### 4.6 Fiche info

- Carte positionnée près du curseur avec `grid-template-columns: 38px 1fr`.
- Contient icône, titre, description du hotspot.
- Fermeture via bouton × ou touche Échap.

### 4.7 Historique et bouton Retour

- Chaque transition empile `currentScene` dans `history[]` (max 50).
- Le bouton retour (`#back-btn`) dépile et déclenche `startTransition(previousScene, { isBack: true })`.
- Pendant un retour, `pushHistory()` n'empile pas (grâce au flag `isBack`).

---

## 5. Réalité virtuelle (WebXR)

### 5.1 Contrôleurs

Deux contrôleurs sont créés dans `setupXRControllers()` :
- Un rayon visuel (ligne bleue de 4 unités) est attaché à chaque contrôleur.
- L'événement `select` (trigger/squeeze) appelle `handleXRSelect()`.

### 5.2 HUD 3D (`vr-ui.js`)

Le HUD est un groupe Three.js ajouté à la **scène mondiale** (pas à la caméra) pour éviter le bug de matrice WebXR où `camera.add()` fausse le raycasting des contrôleurs.

**`updateVRUI()`** repositionne le HUD chaque frame :
1. Copie la position exacte de la caméra.
2. Extrait uniquement le **yaw** (rotation Y) — le pitch et roll sont annulés pour que le HUD reste horizontal.
3. Décale le HUD à `z = -2` devant l'utilisateur.

**Boutons HUD :**
- **Retour** (`←`) — Appelle `goBack()`.
- **Scènes** (`☰`) — Ouvre le menu scènes 3D.
- **Quitter** (`✕`) — Termine la session XR.

### 5.3 Menu scènes VR

Panneau 3D créé dynamiquement avec :
- Un fond canvas semi-transparent.
- Une grille de boutons (3 colonnes) avec le nom de chaque scène.
- La scène active est surlignée en bleu.
- Chaque bouton a `userData: { action: 'loadScene', sceneId }`.
- Le panneau est positionné à 1.8 unités devant la caméra.

### 5.4 Gaze tracking

`updateXRGaze()` est appelé à chaque frame quand `isXRActive` :
- Un rayon depuis la caméra détecte les hotspots dans un seuil de 38 unités.
- Le marqueur du hotspot regardé change de couleur (bleu).
- **Transition** : déclenchée après 2 secondes de regard continu.
- **Info** : fiche VR affichée après 1.5 seconde.
- **Exit** : quitte la VR après 1.5 seconde.
- La progression est indiquée par un anneau animé autour du réticule.

### 5.5 Fiche info VR

Panneau 3D (2.4 × 1.2 unités) avec texture canvas contenant :
- Icône dans un cercle bleu.
- Titre en gras.
- Description avec retour à la ligne automatique.
- Bouton de fermeture (×) détecté par gaze (1.5s).

### 5.6 Réticule

Cercle SVG (20px) avec anneau de progression, affiché uniquement en session XR. Positionné au centre de l'écran.

---

## 6. Rendu des textures et couleurs

### 6.1 Pipeline de chargement

```
loadTexture(path) → Promise<Texture>
```

- Cache global `textureCache` (par chemin et par candidat).
- Fallback automatique : `.jpg` → `.JPG` → `.jpeg` → `.JPEG`.
- Paramètres texture : `minFilter = LinearFilter`, `magFilter = LinearFilter`, `encoding = sRGBEncoding`.

### 6.2 Correction luminosité

```js
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.4;
```

Les photos intérieures apparaissent sombres sans ces paramètres. `exposure = 1.4` éclaircit globalement. Ajuster cette valeur pour modifier la luminosité.

---

## 7. Navigation clavier

| Touche | Action |
|---|---|
| `←` / `→` | Pivoter horizontalement (±3°) |
| `↑` / `↓` | Pivoter verticalement (±2°, clamp ±85°) |
| `+` / `=` | Zoomer (FOV −2°) |
| `-` | Dézoomer (FOV +2°) |
| `F` | Plein écran |
| `Backscene` | Retour scène précédente |
| `Alt + ←` | Retour scène précédente |
| `Échap` | Fermer fiche info |
| `1`–`9` | Aller à la scène correspondante (si existe) |

---

## 8. Résumé des bearings et orientations

### 8.1 Définitions

| Propriété | Portée | Usage |
|---|---|---|
| `defaultBearing` (scène) | Définit la direction de vue au **chargement initial** de la scène (sans transition). Utilisé dans `loadScene()` comme valeur de fallback pour `tourState.lon`. | Chargement direct, retour arrière |
| `bearing` (hotspot) | Définit la **direction du dolly-in** pendant la transition et la **direction de vue après la transition**. | Clic sur hotspot, transition GSV |
| `tourState.lon` | Direction de vue courante de la caméra (degrés). | Rendu, boussole, minimap |

### 8.2 Convention d'angles

- `0°` = nord (vers `-Z`)
- `90°` = est (vers `+X`)
- `180°` = sud (vers `+Z`)
- `270°` = ouest (vers `-X`)

### 8.3 Réciprocité

Pour une paire de scènes connectées A ↔ B, les bearings réciproques devraient idéalement respecter : `bearing(B→A) ≈ normalizeDegrees(bearing(A→B) + 180)`. La fonction `arrivalLonForTransition()` implémente cette logique mais **n'est pas utilisée dans le flux actuel** — c'est la position 3D du hotspot source qui détermine la direction du dolly-in.

---

## 9. Points d'attention

- **Ne pas modifier les coordonnées `{x, y, z}`** des hotspots dans `config.js` sans utiliser `hotspot-editor.html` — un décalage visuel en résulte.
- **Le `defaultBearing`** n'est utilisé que lors d'un chargement direct (URL ou retour). Après une transition GSV, l'orientation est déterminée par le dolly-in.
- **Le bearing d'un hotspot** sert à la fois pour la direction du dolly-in (via la position 3D du hotspot) et comme fallback si le hotspot n'a pas de position exploitable.
- **Les scènes 22 à 26** (couloire) et **27 à 35** (Design Lab / Makerspace) n'ont pas de `defaultBearing` — elles utilisent `0` par défaut.
- **La scène 21** n'a pas de `defaultBearing` non plus.
- **La scène par défaut** est `12` (Entrée). L'URL `?scene=X&lon=Y&lat=Z` permet de démarrer sur n'importe quelle scène.
