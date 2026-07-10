Voici ton fichier README.md complet, formaté en Markdown prêt à être copié-collé :

```markdown
# Visite Virtuelle 360° — avec mode VR WebXR

Visiteur panoramique 360° avec transitions instantanées, hotspots interactifs et mode VR (Meta Quest).  
Développé en JavaScript vanilla avec Three.js r128 et GSAP.

---

## ✨ Fonctionnalités principales

- **Panoramas 360° équirectangulaires** – affichés sur une sphère inversée.
- **Hotspots au sol** – cercles rouges pulsants cliquables pour naviguer entre les scènes.
- **Transition instantanée (blink)** – fondu au noir de 150 ms, changement de sphère, fondu enchaîné. Pas de dolly, pas de flou – confortable en VR.
- **Interface 2D complète** :
  - Menu latéral avec liste des scènes
  - Minimap SVG interactive
  - Boussole (16 points cardinaux)
  - Zoom (molette / + / -)
  - Plein écran
  - Bouton retour (historique 50 entrées)
  - Fiches d'information pour les hotspots `info`
  - Partage d'URL (scene/lon/lat)
- **Mode VR WebXR** (Meta Quest) :
  - Contrôleurs avec lasers bleus
  - **Joystick inactif** – la flèche suit exclusivement le laser du contrôleur dominant
  - HUD minimal : bouton "Quitter VR" en 3D
  - Panneaux d'information flottants pour les hotspots `info`
  - Nettoyage complet à la sortie → ré‑entrée sans rechargement
- **Cache LRU** – 50 textures maximum, évite les rechargements inutiles.
- **Éditeur de hotspots intégré** – `hotspot-editor.html` pour capturer les coordonnées visuellement.

---

## 🧱 Stack technique

| Technologie | Version | Usage |
|-------------|---------|-------|
| Three.js    | r128    | Rendu 3D, sphères, raycasting, WebXR |
| GSAP        | 3.12.5  | Animations (pulsation, zoom, transitions) |
| JavaScript  | ES5+    | Logique métier, modules IIFE |
| WebXR API   | Native  | Mode VR immersif |
| HTML / CSS  | —       | Interface overlay, minimap SVG |

**Aucun framework, aucune étape de build.**  
Le projet tourne dans n'importe quel navigateur compatible WebGL2 / WebXR.

---

## 📁 Architecture

```
js/
├── config.js         → Toutes les scènes et hotspots
├── state.js          → État global mutable
├── controls.js       → Souris, tactile, clavier, raycaster sphérique
├── hotspots.js       → Hotspots 3D, flèche, raycasting VR/2D
├── transition.js     → Transition blink (150ms)
├── ui.js             → Menu, minimap, boussole, zoom, fullscreen
├── vr-ui.js          → HUD VR (bouton Quitter) et panneaux info
├── xr-controls.js    → Contrôleurs VR, lasers, nettoyage
└── main.js           → Initialisation Three.js, boucle de rendu

index.html            → Structure HTML
hotspot-editor.html   → Éditeur visuel de hotspots
docs/index.html       → Documentation technique complète (FR)
css/style.css         → Styles
images/               → Panoramas 360° (24 scènes)
```

---

## ⚡ Quick start — Ajouter une scène

1. Ouvre `js/config.js`.
2. Copie un bloc de scène existant (ex: `'12'`), change l'ID, le `name`, le chemin `image`.
3. Ajuste `defaultBearing` (direction initiale) et `defaultLat` (alignement vertical).
4. Définis les `hotspots` (ou utilise l'éditeur visuel).
5. Rafraîchis la page – la scène apparaît automatiquement dans le menu et la minimap.

📌 **L'identifiant peut être n'importe quel nombre ou chaîne** – le code itère sur `Object.keys(window.TOUR_CONFIG.scenes)`.

---

## 🎯 Configuration d'un hotspot

```javascript
{
    position: { x: -71, y: -227, z: -439 },   // Coordonnées 3D
    type: 'transition',                        // 'transition' ou 'info'
    target: '13',                             // ID de la scène cible
    bearing: 180,                             // Direction de transition (0-359°)
    arrivalLon: 197,                          // Direction après transition (optionnel)
    arrivalLat: 0,                            // Verticalité après transition (optionnel)
    label: 'Salle d\'attente',                // Texte du tooltip
    icon: '🚪',                               // Emoji pour les hotspots info
    title: 'Salle d\'attente',                // Titre de la fiche info
    description: 'Espace confortable...'      // Description de la fiche info
}
```

📌 **`bearing` et `arrivalLon` sont indépendants** – `bearing` est la direction vers laquelle la caméra "avance" pendant la transition, `arrivalLon` est la direction finale après la transition.

---

## 🖱️ Contrôles (2D)

| Action | Contrôle |
|--------|----------|
| Pivoter | Clic‑glisser |
| Zoomer | Molette / + / - |
| Naviguer | Double‑clic sur un hotspot |
| Plein écran | F |
| Retour arrière | Backspace |
| Fermer fiche info | Échap |
| Aller à la scène N | 1‑9 |

---

## 🥽 Mode VR (Meta Quest)

| Contrôle | Action |
|----------|--------|
| Gâchette (trigger) | Sélectionner le hotspot visé par le laser |
| Squeeze | Retour arrière |
| Bouton A / X | Ouvrir / fermer le menu |
| Joystick | **Inactif** (la flèche suit le laser) |
| Laser (pointeur) | Viser les hotspots et les boutons |

---

## 🛠️ Éditeur de hotspots

Ouvre `hotspot-editor.html` dans ton navigateur :

1. Navigue dans le panorama (clic‑glisser).
2. Clique sur l'image pour capturer les coordonnées `{x, y, z}`.
3. Remplis les champs (type, target, bearing, label, etc.).
4. Clique sur **"Copier hotspot complet"**.
5. Colle le code dans `config.js`.

L'éditeur gère aussi `arrivalLon`, `arrivalLat`, `icon`, `title` et `description`.

---

## 📚 Documentation complète

Une documentation technique détaillée est disponible dans `docs/index.html`.  
Elle couvre :

- L'affichage des images (sphère, projection équirectangulaire)
- La création des composants 3D
- La configuration (`config.js`)
- La flexibilité du code (ajout de scènes sans modifier d'autres fichiers)
- Les transitions (blink)
- Les hotspots (2D et VR)
- Le mode VR (contrôleurs, lasers, HUD, nettoyage)
- Le cache LRU (performance)
- Les limites importantes (à ne pas modifier)

---

## ⚙️ Installation et lancement

```bash
# Cloner le dépôt
git clone <URL>
cd visite-virtuelle

# Lancer un serveur statique
npx serve .
# ou
python -m http.server 8080
```

Ouvrir `http://localhost:8080` dans un navigateur compatible WebGL2.

**Pour VR** : utiliser le navigateur Meta Quest ou servir en HTTPS (ex: `npx serve --ssl`).

---

## 📦 Dépendances

- Three.js r128 (CDN)
- GSAP 3.12.5 (local, dans `js/gsap.min.js`)

---

## ⚠️ Notes importantes

- **Ne jamais déplacer la caméra en Y** – elle doit rester en `(0, 0, 0.001)` sous peine de déformer l'image.
- **Ne pas désactiver le cache LRU** – il limite la mémoire à 50 textures.
- **Ne pas supprimer le nettoyage VR** (`clearXRControllers` / `destroyVRUI`) – la ré‑entrée en VR en dépend.
- **La documentation complète est dans `docs/index.html`** – consulte‑la avant de modifier des parties critiques.

---

## 🧑‍💻 Auteur

Projet développé pour une visite virtuelle interactive, avec une attention particulière à l'expérience VR et à la flexibilité du code.

---

## 📄 Licence

À définir selon vos besoins.
```

Tu peux copier tout ce bloc (depuis le premier `#` jusqu'à la fin) et le coller directement dans ton fichier `README.md`. Il remplace l'ancien contenu et est parfaitement à jour avec l'état actuel du projet.