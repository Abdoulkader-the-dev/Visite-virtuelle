# Visite Virtuelle 360° — Clone Google Street View

Reproduction fidèle des mécaniques de navigation de **Google Street View** en JavaScript vanilla avec Three.js r128 et GSAP. 24 scènes panoramiques 360° reliées par des hotspots, avec une transition cinématique en 3 couches (dolly-in, fondu croisé, étraction radiale), le tout fonctionnant en mode desktop ET en VR WebXR.

---

## Table des matières

1. [Fonctionnalités](#fonctionnalités)
2. [Stack technique](#stack-technique)
3. [Architecture](#architecture)
4. [Installation et lancement](#installation-et-lancement)
5. [Configuration des scènes](#configuration-des-scènes)
6. [Système de bearings et d'orientation](#système-de-bearings-et-dorientation)
7. [Contrôles](#contrôles)
8. [Mode VR (WebXR)](#mode-vr-webxr)
9. [Éditeur de hotspots](#éditeur-de-hotspots)
10. [Pipeline de transition GSV](#pipeline-de-transition-gsv)
11. [Reste à faire pour un clone GSV complet](#reste-à-faire-pour-un-clone-gsv-complet)
12. [Performances et optimisations](#performances-et-optimisations)

---

## Fonctionnalités

### ✅ Implémentées

- **Navigation par hotspots magnétiques au sol** — La flèche 3D suit le curseur et pointe vers le hotspot le plus proche (aimantation)
- **Transition GSV en 3 couches simultanées (900ms)** :
  - Dolly-in 3placement physique vers le hotspot, pas un glissement)
  - Fondu croisé entre les deux sphères (sans flash noir/blanc)
  - Radial Stretch shader GLSL (étirement périphérique, flou de mouvement radial)
- **Conservation relative du regard** — L'utilisateur garde la même direction relative après chaque transition (sans saut visuel)
- **24 scènes panoramiques** — Graphe orienté complet avec liaisons bidirectionnelles
- **Interface complète** :
  - Menu latéral avec liste des scènes
  - Minimap SVG interactive avec lignes de connexion
  - Boussole 16 points cardinaux
  - Zoom (0.7x à 2.5x)
  - Plein écran
  - Bouton retour (historique 50 entrées)
  - Fiche info pour les hotspots information
  - Partage d'URL avec paramètres scene/lon/lat
- **Support complet souris/tactile/clavier** :
  - Clic-glisser pour pivoter
  - Double-clic pour naviguer
  - Molette/pinch pour zoomer
  - Flèches directionnelles, zoom +/-, F pour plein écran, Échap pour fermer
- **Rotation automatique** — Activée après 5 secondes d'inactivité
- **Mode VR WebXR** (Meta Quest) :
  - Visée poignet (pointer-based) pour les hotspots
  - HUD minimaliste unique : bouton "Quitter VR" dans la scène mondiale
  - Joystick : rotation continue + marche avant/arrière (one-shot avec cooldown)
  - Rayons laser bleus sur les contrôleurs
  - Retour arrière par squeeze
  - Réticule central
- **Éditeur de hotspots intégré** (`hotspot-editor.html`) :
  - Navigation dans toutes les scènes
  - Capture de coordonnées au clic
  - Boussole temps réel pour calibrer le bearing
  - Gestion du bearing ET de l'arrivalLon séparément
  - Marqueurs visuels sur la scène (points colorés)
  - Liste des hotspots avec statut de calibration
  - Code à copier-coller pour config.js
  - Barre de progression de calibration globale
- **Préchargement intelligent des textures** — Chargement prioritaire des scènes liées, puis arrière-plan pour le reste
- **Accessibilité** — Annonceur ARIA, attributs role/aria-label, navigation clavier complète

### � Ce qui distingue ce projet d'une simple visite 360°

| Fonctionnalité | GSV original | Ce projet |
|---|---|---|
| Dolly-in 3D vers hotspot | ✅ | ✅ |
| Radial stretch (motion blur) | ✅ | ✅ (shader GLSL) |
| Crossfade sans flash | ✅ | ✅ |
| Conservation du regard | ✅ | ✅ (relatif, pas absolu) |
| Hotspots au sol aimantés | ✅ | ✅ |
| Pulsation indicateur | ✅ | ✅ (cercles rouges GSAP) |
| Lignes de connexion minimap | ✅ | ❌ (pas de flèches courbes) |
| Plein écran | ✅ | ✅ |
| VR WebXR | ❌ | ✅ (Meta Quest) |

---

## Stack technique

| Technologie | Version | Usage |
|---|---|---|
| **Three.js** | r128 (CDN) | Rendu WebGL 3D, sphères, raycasting, WebXR |
| **GSAP** | locale (`js/gsap.min.js`) | Animations (transition, pulsation, zoom, translation) |
| **JavaScript** | ES5+ vanilla | Logique métier, modules IIFE |
| **WebXR API** | Native | Mode VR immersif (Meta Quest, etc.) |
| **GLSL** | Shaders personnalisés | Radial Stretch, Crossfade, Motion Blur |
| **HTML/CSS** | — | Interface overlay, minimap SVG |

**Aucun framework, aucune dépendance TypeScript, aucune étape de build.** Le projet tourne dans n'importe quel navigateur moderne compatible WebGL2/WebXR.

---

## Architecture

```
js/
├── config.js         → Tour_CONFIG (graphe orienté 24 scènes + hotspots)
├── state.js          → tourState (état mutable global)
├── controls.js       → Entrées souris/tactile/clavier, raycaster sphérique
├── hotspots.js       → Hotspots 3D au sol, marqueurs info, VR raycast, clic
├── transition.js     → GSV 900ms : dolly + stretch + crossfade + finalize()
├── ui.js             → Menu, minimap, boussole, zoom, fullscreen, partage
├── vr-ui.js          → HUD VR minimal (bouton Quitter VR dans scène mondiale)
├── xr-controls.js    → Support Meta Quest (joystick, squeeze, base rotation)
└── main.js           → Bootstrap Three.js, boucle de rendu, chargement

index.html            → Structure HTML + ordre de chargement des scripts
hotspot-editor.html   → Outil d'édition visuelle des hotspots
css/style.css         → Styles glassmorphism + animations
images/12-35.JPG      → Photos 360° équirectangulaires (24 scènes)
js/gsap.min.js        → Bibliothèque GSAP (locale)
```

### Principe de modularité

Chaque fichier est une **IIFE** (Immediately Invoked Function Expression) qui expose ses fonctions utilitaires sur `window`. Aucun import/export — la communication entre modules se fait via l'objet global `window`.

Ordre de chargement critique :
```
config.js → state.js → controls.js → transition.js → hotspots.js → ui.js → vr-ui.js → xr-controls.js → main.js
```

---

## Installation et lancement

```bash
# Cloner le dépôt
git clone <URL>
cd Visite-virtuelle

# Lancer avec n'importe quel serveur statique
npx serve .
# ou
python -m http.server 8080
```

Ouvrir `http://localhost:8080` dans un navigateur compatible WebGL2.

**Pour VR** : Ouvrir dans le navigateur Quest (via `https://` local avec certificat, ou via Internet avec un tunnel comme ngrok), ou servir en local avec `npx serve --ssl`.

---

## Configuration des scènes

### Structure d'une scène

```javascript
'12': {                           // ID unique (string)
    name: 'Entrée',               // Nom affiché
    image: './images/12.JPG',     // Chemin photo 360° équirectangulaire
    defaultBearing: 181.0,        // Direction de vue au chargement (degrés)
                                   // 0=N, 90=E, 180=S, 270=O
    minimapX: 50,                 // Position X minimap (0-100%)
    minimapY: 85,                 // Position Y minimap (0-100%)
    hotspots: [
        {
            position: { x: -71, y: -227, z: -439 },  // Coordonnées 3D (read-only)
            type: 'transition',                        // 'transition' ou 'info'
            target: '13',                             // Scène cible
            bearing: 180,                             // Direction après transition (degrés)
            arrivalLon: 0,                            // (optionnel) Vue forcée après transition
            label: "Salle d'attente"                   // Texte tooltip
        }
    ]
}
```

### Conventions de coordonnées

La sphère a un rayon de **500 unités**. Les coordonnées suivent :

| Axe | Positif | Négatif |
|---|---|---|
| **x** | Droite | Gauche |
| **y** | Haut | Bas |
| **z** | Derrière | Devant |

Formule vers bearing : `atan2(x, -z) × (180/π)`, normalisé 0-360°.

Pour repositionner un hotspot : utiliser `hotspot-editor.html` — cliquez pour capturer les coordonnées, puis copiez dans `config.js`.

> ⚠️ **Ne modifiez jamais les coordonnées `{x,y,z}` à la main** — un mauvais positionnement casse l'aimantation de la flèche.

### Les 24 scènes

| ID | Nom | Connexions |
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
| 22 | Couloir — début | → 23, 17 |
| 23 | Couloir — milieu | → 24, 22, 27 |
| 24 | Couloir — section 3 | → 25, 23 |
| 25 | Couloir — section 4 | → 26, 24, 32 |
| 26 | Couloir — fin | → 25 |
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

## Système de bearings et d'orientation

Le système définit **deux types de bearings** indépendants :

| Propriété | Quand c'est utilisé | Description |
|---|---|---|
| `defaultBearing` (scène) | Au chargement initial seulement | Direction de vue quand aucune transition n'a eu lieu |
| `bearing` (hotspot) | Après une transition GSV | Direction de vue dans la nouvelle scène |
| `arrivalLon` (hotspot) | Optionnel, override `bearing` | Direction forcée (pour calibration manuelle) |

### Calcul automatique à l'arrivée

```
newLon = normalize(movementAngle + 180 - relativeLookOffset)
```

- `+180` : Compense l'inversion native de la sphère (geo.scale(-1,1,1))
- `- relativeLookOffset` : Inversion du sens due au miroir
- Résultat : l'utilisateur garde sa direction relative gauche/droite sans saut de 180°

### Pourquoi ne pas simplement fixer un angle ?

Parce que GSV préserve le **décalage relatif** : si vous regardez à 30° à gauche de la direction de marche, vous arriverez dans la nouvelle scène en regardant à 30° à gauche de la nouvelle direction de marche. Pas de "pop" à 180°.

---

## Contrôles

### Souris

| Action | Contrôle |
|---|---|
| Pivoter | Clic-glisser |
| Naviguer (transition) | Double-clic sur hotspot |
| Zoomer | Molette |
| Voir label hotspot | Survol |

### Tactile (mobile)

| Action | Contrôle |
|---|---|
| Pivoter | Doigt-glisser |
| Zoomer | Pincer/écarter |
| Naviguer | Double-tap |

### Clavier

| Touche | Action |
|---|---|
| ← / → | Pivoter horizontal ±3° |
| ↑ / ↓ | Pivoter vertical ±2° |
| + / = | Zoomer (FOV -2°) |
| - | Dézoomer (FOV +2°) |
| F | Plein écran |
| Backspace | Retour (historique) |
| Échap | Fermer fiche info |
| Alt + ← | Retour rapide |
| 1-9 | Aller à la scène N |

### VR (Meta Quest)

| Contrôle | Action |
|---|---|
| Joystick gauche/droite | Rotation continue |
| Joystick haut/bas | Marcher (one-shot + cooldown 800ms) |
| Gâchette (trigger) | Sélection hotspot actif |
| Squeeze | Retour en arrière |
| Bouton A/O | Ouvrir menu |

---

## Mode VR WebXR

### Architecture VR

- **Visée poignet (pointer-based)** : La manette projette un laser bleu. Le hotspot du poignet intersecte le plan au sol `Y=-2`.
- **HUD mondial** : Le bouton "Quitter VR" est dans `scene.add()` (pas attaché à la caméra). Repositionné chaque frame devant l'utilisateur en yaw-only (pas de pitch/roll).
- **Gestionnaire de sélection** : `handleXRSelect()` dans `hotspots.js` — teste d'abord le bouton Quitter, puis la flèche au sol.

### Fonctionnalités VR

- ✅ Hotspots au sol visibles et cliquables (anneau + flèche 3D)
- ✅ Cercles de pulsation rouges
- ✅ Rayons laser bleus sur les contrôleurs
- ✅ Réticule central
- ✅ HUD minimaliste : 1 seul bouton "Quitter VR"
- ✅ Joystick : rotation continue + déplacement one-shot
- ✅ Squeeze pour retour arrière
- ✅ Fiche info VR (panneau 3D devant la caméra)
- ✅ Session propre via `renderer.xr.getSession().end()`

---

## Éditeur de hotspots

Ouvrir `hotspot-editor.html` dans un navigateur pour :

1. **Naviguer** dans les 24 scènes
2. **Cliquer** sur la scène pour capturer les coordonnées `{x, y, z}` d'un hotspot
3. **Tourner la caméra** pour calibrer :
   - **bearing** : la direction de transition/vue après transition
   - **arrivalLon** : la vue forcée dans la scène cible
4. **Utiliser les boutons** :
   - "Utiliser la direction actuelle" ← bearing = regard actuel
   - "Calculer depuis position" ← bearing = atan2(x, -z)
   - "Capturer direction d'arrivée" ← arrivalLon = regard actuel
5. **Visualiser** les hotspots existants sur la scène (marqueurs colorés)
6. **Copier** le code formaté et le coller dans `config.js`

### Indicateur de progression

L'éditeur affiche une barre globale de calibration : combien de hotspots (sur le total) ont un `arrivalLon` calibré.

> **Un hotspot sans `arrivalLon` utilise le calcul automatique** (qui est correct dans ~90% des cas). `arrivalLon` sert pour les ~10% de cas où l'automatique produit un offset visible.

---

## Pipeline de transition GSV

Durée totale : **900ms**

```
0.0s ──────────────────────────────────────────────── 0.9s
  │                                                 │
  ├─ Dolly-in : camera.position ─── power2.inOut ───�
  │                                                 │
  ├─ uStretch : 0 → 0.4 (0-450ms) → 0 (450-900ms) │
  │                                                 │
  ├─ uBlur : 0 → 1.0 (0-450ms) → 0 (450-900ms)    │                                                 │
  ├─ uOpacity sphèreA : 1 → 0.5 (0-450ms) → 0 (450-900ms)
  │                                                 │
  ├─ uOpacity sphèreB : 0 ── power1.out ──→ 1      │
  │                  décalé à 360ms                  │
  │                                                 │
  └─ finalize() à 900ms                             │
       → reset camera.position                      │
       → calcul tourState.lon (relatif)             │
       → mise à jour bearing dynamique              │
       → échange sphère active                      │
```

### Les 3 couches simultanées

1. **Dolly-in 3D** : `GSAP.to(camera.position, {...})` déplace physiquement la caméra de 80 unités vers le hotspot. Power2.inOut easing. L'horizon reste stable car `updateCameraLookAt()` continue de pivoter normalement.

2. **Fondu croisé** : La nouvelle sphère (créée à chaque transition) crossfade avec l'ancienne. `CrossfadeMaterial` GLSL anime `uOpacity` de 0 à 1, décalé à 40% de la timeline.

3. **Radial Stretch** : Shader GLSL appliqué à l'ancienne sphère. Le vertex shader étire les coordonnées NDC selon leur rayon (centre fixe, périphérie étirée). Le fragment shader applique un blur directionnel 5-échantillons le long du vecteur vers le centre. L'effet reproduit fidèlement le "tunnel de vitesse" de GSV.

---

## Reste à faire pour un clone GSV complet

### � Critique (manques visibles)

| Fonctionnalité GSV | Statut actuel | Ce qu'il faut faire |
|---|---|---|
| **Thumbnails/aperçus des scènes** | ❌ Absent | Générer des miniatures de chaque scène (rendu hors écran depuis le point de vue du hotspot) ou ajouter photos手动 |
| **Itinéraire (Directions) | ❌ Absent | Calculer le chemin entre 2 points (BFS sur le graphe), afficher la distance, l'estimation du temps |
| **Flèches de direction courbes** | ⚠️ Lignes droites sur minimap | Remplacer les lignes SVG par des courbes de Bézier entre les nœuds |
| **Rotation de la vue pendant le dolly** | ⚠️ Horizon fixe | GSV fait tourner légèrement la vue vers la direction de marche pendant le dolly (1-2°/frame) |
| **Apparition progressive du panneau d'arrivée** | ⚠️ Immédiat | Le panneau de la scène cible devrait glisser depuis le bas (300ms ease-out) |
| **Noms de rues / adresses** | ❌ Absent | Couche de données osm/override par scène avec texte flottant |

### 🟠 Important (améliorations UX)

| Fonctionnalité | Description |
|---|---|
| **Couverture nuage de points (Photo Sphere)** | En lieu et place des sphères, projeter les textures sur un nuage de points 3D — plus réaliste, surtout en VR |
| **Street labels flottants** | Dans GSV, les noms de rues apparaissent comme des pancartes 3D flottantes dans le décor |
| **Side-by-side transition** | Parfois GSV affiche les deux scènes côte à côte avec un glissement horizontal avant le crossfade |
| **Boussole interactive** | Cliquer sur la boussole pour tourer vers le point cardinal |
| **Géolocalisation** | Bouton "Où suis-je ?" qui centre la vue sur la position réelle de la scène |
| **Vignettes de prévisualisation** | Quand on survole un hotspot, afficher un thumbnail de la scène cible (CSS tooltip ou projection caméra) |
| **Marqueurs de position (pins)** | GSV affiche des pins rouges sur la minimap pour les POI — les ajouter en SVG |
| **Rotation libre en VR** | Actuellement le HUD suit le yaw ; la rotation libre complète manque (snap-turn) |

### � Optionnel (polish)

| Fonctionnalité | Description |
|---|---|
| **Mode "Marche" continu** | GSV permet d'avancer même entre hotspots (par interpolation linéaire entre 2�acements) |
| **Animation d'introduction** | Une sphère qui tourne de 360° avant de se placer sur la scène de départ |
| **Effet Ken-Burns au chargement** | Léger zoom progressif (FOV 85→75) sur les 500ms après chargement |
| **Coverflow des scènes** | En bas, un défilement horizontal de thumbnails (à la Apple Photos) |
| **History state API** | `history.pushState()` pour que le bouton navigateur natif fonctionne |
| **Progressive Web App (PWA)** | Manifest, service worker pour mode offline |
| **Marqueurs de profondeur** | En VR, afficher la distance aux hotspots en mètres |

### 🔵 Idées avancées

| Fonctionnalité | Description |
|---|---|
| **Real-time reflections** | CubeMap capturé à la caméra pour des reflets réalistes sur objets 3D |
| **WebGPU renderer** | Migrer vers three.js WebGPU pour performances x10 |
| **AI-driven thumbnails** | Utiliser un modèle pour générer des miniatures style GSV de chaque scène |
| **Multiplayer WebRTC** | Permettre à plusieurs utilisateurs de visiter ensemble (partage d'état) |
| **Annotation vocale** | Synthèse vocale qui décrit la scène actuelle |

---

## Performances et optimisations

### Texture Loading

- **Cache global** : Une texture n'est chargée qu'une fois et réutilisée
- **Fallback intelligent** : `.jpg` → `.JPG` → `.jpeg` → `.JPEG`
- **Préchargement lié** : Les scènes accessibles par hotspot sont préchargées immédiatement
- **Préchargement global** : Les autres scènes chargées en arrière-plan via `requestIdleCallback` avec délai progressif (200ms × index)

### Render Pipeline

- **Double sphèrique** : `THREE.SphereGeometry(500, 60, 40)` avec inversion de normale
- **Encoding sRGB** : Couleurs fidèles avec `outputEncoding = THREE.sRGBEncoding`
- **Linear Tone Mapping** : `toneMappingExposure = 1.4` pour luminosité adaptée aux photos intérieures
- **Depth Write différencié** : Pas de depthWrite sur les objets transparents pour éviter z-fighting

### VR

- **Single draw call hotspot** : Les cercles rouges partagent tous la même CanvasTexture
- **Raycaster au sol** : Teste uniquement les meshes marqués `userData.isGroundHotspot`
- **Cooldown joystick** : Évite les transitions en rafale (800ms entre chaque)

### Bonnes pratiques respectées

- Zéro fuite mémoire (dispose geometry/material à chaque changement de scène)
- Touch events avec `passive: false` pour éviter le scroll
- `prefers-reduced-motion` non implémenté (à ajouter pour accessibilité)
- Viewport meta tag pour mobile

---

## Licence

Projet éducatif / démonstration de techniques de navigation 360°. Three.js est sous licence MIT.
