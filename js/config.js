(function () {
    'use strict';

    // =========================================================================
    //  CONFIG — VISITE VIRTUELLE
    // =========================================================================
    //
    //  ┌─────────────────────────────────────────────────────────────────────┐
    //  │  PROPRIÉTÉS D'UNE SCÈNE                                            │
    //  ├─────────────────────────────────────────────────────────────────────┤
    //  │  name           string   Nom affiché dans l'UI (menu, minimap)     │
    //  │  image          string   Chemin vers la photo 360° (.webp)          │
    //  │  defaultBearing number   Direction de vue PAR DÉFAUT (en degrés)   │
    //  │                         → vers où regarde la caméra au chargement   │
    //  │                         → 0 = nord, 90 = est, 180 = sud, 270 = ouest│
    //  │  defaultLat     number   Vertical offset (in degrees) to align horizon│
    //  │                         → rotates the sphere on the X‑axis           │
    //  │  minimapX       number   Position X sur la minimap (0-100)         │
    //  │  minimapY       number   Position Y sur la minimap (0-100)         │
    //  │  hotspots       array    Liste des hotspots de cette scène          │
    //  └─────────────────────────────────────────────────────────────────────┘
    //
    //  ┌─────────────────────────────────────────────────────────────────────┐
    //  │  PROPRIÉTÉS D'UN HOTSPOT                                           │
    //  ├─────────────────────────────────────────────────────────────────────┤
    //  │  position       {x,y,z}  Position 3D dans la sphère (read-only)    │
    //  │     .x          number   gauche(−) / droite(+)                     │
    //  │     .y          number   bas(−)    / haut(+)                       │
    //  │     .z          number   devant(−) / derrière(+)  → −250 = devant  │
    //  │  type           string   'transition' ou 'info'                    │
    //  │  target         string   ID de la scène cible (transition)         │
    //  │  bearing        number   Direction de TRANSITION (en degrés)       │
    //  │                         → direction du dolly-in pendant la transition│
    //  │                         → direction de vue APRÈS la transition     │
    //  │                         → 0 = nord, 90 = est, 180 = sud, 270 = ouest│
    //  │                         → NE définit PAS la vue par défaut!        │
    //  │  arrivalLon     number   (optionnel) Forcer la direction de vue    │
    //  │                         APRÈS transition (remplace le calcul auto) │
    //  │                         null = à calibrer, number = calibré         │
    //  │  arrivalLat     number   (optionnel) Forcer la verticalité         │
    //  │                         APRÈS transition (défaut = 0)             │
    //  │  label          string   Texte affiché dans le tooltip             │
    //  │  icon           string   Icône pour les hotspots info (ex: '💡')   │
    //  │  title          string   Titre de la fiche info                    │
    //  │  description    string   Texte de la fiche info                    │
    //  └─────────────────────────────────────────────────────────────────────┘
    //
    //  ┌─────────────────────────────────────────────────────────────────────┐
    //  │  RÉSUMÉ DES DIRECTIONS                                             │
    //  ├─────────────────────────────────────────────────────────────────────┤
    //  │  defaultBearing (scène) → vue au chargement initial (sans transition)│
    //  │  bearing (hotspot)      → vue APRÈS transition (arrivée en scène)   │
    //  │  arrivalLon (hotspot)   → direction forcée APRÈS transition        │
    //  │  Les deux sont INDÉPENDANTS — ne pas les confondre!                │
    //  └─────────────────────────────────────────────────────────────────────┘
    //
    //  Pour repositionner un hotspot visuellement :
    //    Ouvrir  hotspot-editor.html  dans votre navigateur.
    //    Cliquer sur la scène → le panneau affiche les coordonnées x,y,z.
    //    Copier les valeurs ici dans position: { x:_, y:_, z:_ }.
    // =========================================================================

    window.TOUR_CONFIG = {
        scenes: {

            // ── ENTRÉE ────────────────────────────────────────────────────────
            '12': {
                name: 'Entrée',
                image: './images/12.webp',
                defaultBearing: 181.0,
                defaultLat: 0,
                minimapX: 50, minimapY: 85,
                hotspots: [
                    { position: { x: -71, y: -227, z: -439 }, type: 'transition', target: '13', bearing: 180, arrivalLon: 197, label: 'Salla d\'attente' },
                    { position: { x: -441, y: -203, z: -117 }, type: 'transition', target: '16', bearing: 180, arrivalLon: 181, label: 'Bureau' },
                    { position: { x: -367, y: -141, z: 307 }, type: 'transition', target: '17', bearing: 180, arrivalLon: 214, label: 'Salla collaboratif' }
                ]
            },

            // ── SALLE D'ATTENTE ───────────────────────────────────────────────
            '13': {
                name: "Salle d'attente",
                image: './images/13.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 35, minimapY: 65,
                hotspots: [
                    { position: { x: -281, y: -132, z: 391 }, type: 'transition', target: '14', bearing: 325.7, arrivalLon: 48, arrivalLat: 0, label: 'Zone 14' },
                    { position: { x: -491, y: -82, z: -33 }, type: 'transition', target: '15', bearing: 34.3, arrivalLon: 31, arrivalLat: 0, label: 'Zone 15' },
                    { position: { x: 324, y: -333, z: 183 }, type: 'transition', target: '12', bearing: 181.0, arrivalLon: 89, arrivalLat: 0, label: 'Entrée' }
                ]
            },

            // ── ZONES 14 & 15 (liées à la salle d'attente) ───────────────────
            '14': {
                name: 'Zone 14',
                image: './images/14.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 20, minimapY: 50,
                hotspots: [
                    { position: { x: -184, y: -126, z: -446 }, type: 'transition', target: '13', bearing: 180, arrivalLon: 298, arrivalLat: 0, label: "Retour salle d'attente" },
                    { position: { x: -485, y: -59, z: 103 }, type: 'transition', target: '15', bearing: 34.3, arrivalLon: 50, arrivalLat: 0, label: 'Zone 15' }
                ]
            },
            '15': {
                name: 'Zone 15',
                image: './images/15.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 50, minimapY: 50,
                hotspots: [
                    { position: { x: -134, y: -87, z: -473 }, type: 'transition', target: '14', bearing: 325.7, arrivalLon: 0, arrivalLat: 0, label: 'Zone 14' },
                    { position: { x: -478, y: -32, z: -140 }, type: 'transition', target: '13', bearing: 180, arrivalLon: 17, arrivalLat: 0, label: "Retour salle d'attente" }
                ]
            },

            // ── ZONE 16 ───────────────────────────────────────────────────────
            '16': {
                name: 'Zone 16',
                image: './images/16.webp',
                defaultBearing: 177,
                defaultLat: 0,
                minimapX: 65, minimapY: 70,
                hotspots: [
                    { position: { x: -497, y: 40, z: 26 }, type: 'info' },
                    { position: { x: 243, y: -177, z: 399 }, type: 'transition', target: '12', bearing: 158, arrivalLon: 0, arrivalLat: 0, label: 'Retour Entrée' },
                    { position: { x: -298, y: -154, z: 370 }, type: 'transition', target: '17', bearing: 312, arrivalLon: 214, arrivalLat: 0, label: 'Salle collaborative' },
                    { position: { x: 450, y: -216, z: 18 }, type: 'transition', target: '13', bearing: 180, arrivalLon: 284, arrivalLat: 0, label: "Retour salle d'attente" },
                ]
            },

            // ── SALLE COLLABORATIVE ───────────────────────────────────────────
            '17': {
                name: 'Salle collaborative',
                image: './images/17.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 30, minimapY: 40,
                hotspots: [
                    { position: { x: -273, y: -101, z: -405 }, type: 'transition', target: '18', bearing: 301, arrivalLon: 265, arrivalLat: 0, label: 'Zone 18' },
                    { position: { x: -424, y: -38, z: -261 }, type: 'transition', target: '19', bearing: 325.7, arrivalLon: 296, arrivalLat: 0, label: 'Zone 19' },
                    { position: { x: -498, y: -25, z: -12 }, type: 'transition', target: '20', bearing: 0, arrivalLon: 345, arrivalLat: 0, label: 'Zone 20' },
                    { position: { x: -464, y: -13, z: 184 }, type: 'transition', target: '21', bearing: 34.3, arrivalLon: 49, arrivalLat: 0, label: 'Zone 21' },
                    { position: { x: 371, y: -165, z: 291 }, type: 'transition', target: '16', bearing: 181.0, arrivalLon: 308, arrivalLat: 0, label: 'Entrée' },
                    { position: { x: 222, y: -258, z: -366 }, type: 'transition', target: '22', bearing: 59, arrivalLon: 183, arrivalLat: 0, label: 'Couloire' }
                ]
            },

            // ── ZONES 18-21 (salle collaborative) ─────────────────────────────
            '18': {
                name: 'Zone 18',
                image: './images/18.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 15, minimapY: 28,
                hotspots: [
                    { position: { x: 0, y: -20, z: 280 }, type: 'transition', target: '17', bearing: 180, arrivalLon: 39, arrivalLat: 0, label: 'Retour salle collaborative' },
                    { position: { x: -345, y: -57, z: -356 }, type: 'transition', target: '19', bearing: 325.7, arrivalLon: 200, arrivalLat: 0, label: 'Zone 19' },
                    { position: { x: -435, y: -6, z: -246 }, type: 'transition', target: '20', bearing: 0, arrivalLon: 283, arrivalLat: 0, label: 'Zone 20' },
                    { position: { x: -497, y: 40, z: -32 }, type: 'transition', target: '21', bearing: 34.3, arrivalLon: 0, arrivalLat: 0, label: 'Zone 21' },
                ]
            },
            '19': {
                name: 'Zone 19',
                image: './images/19.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 25, minimapY: 20,
                hotspots: [
                    { position: { x: -172, y: -82, z: 462 }, type: 'transition', target: '17', bearing: 180, arrivalLon: 27, arrivalLat: 0, label: 'Retour salle collaborative' },
                    { position: { x: 192, y: -136, z: 429 }, type: 'transition', target: '18', bearing: 301, arrivalLon: 60, arrivalLat: 0, label: 'Zone 18' },
                    { position: { x: -362, y: -91, z: -332 }, type: 'transition', target: '20', bearing: 0, arrivalLon: 260, arrivalLat: 0, label: 'Zone 20' },
                    { position: { x: -484, y: -26, z: -117 }, type: 'transition', target: '21', bearing: 34.3, arrivalLon: 352, arrivalLat: 0, label: 'Zone 21' },
                ]
            },
            '20': {
                name: 'Zone 20',
                image: './images/20.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 40, minimapY: 15,
                hotspots: [
                    { position: { x: -428, y: -38, z: 255 }, type: 'transition', target: '17', bearing: 180, arrivalLon: 9, arrivalLat: 0, label: 'Retour salle collaborative' },
                    { position: { x: -272, y: -52, z: 415 }, type: 'transition', target: '18', bearing: 301, arrivalLon: 18, arrivalLat: 0, label: 'Zone 18' },
                    { position: { x: -134, y: -110, z: 468 }, type: 'transition', target: '19', bearing: 325.7, arrivalLon: 77, arrivalLat: 0, label: 'Zone 19' },
                    { position: { x: -334, y: -144, z: -342 }, type: 'transition', target: '21', bearing: 34.3, arrivalLon: 276, arrivalLat: 0, label: 'Zone 21' },
                ]
            },
            '21': {
                name: 'Zone 21',
                image: './images/21.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 55, minimapY: 20,
                hotspots: [
                    { position: { x: -419, y: -61, z: -264 }, type: 'transition', target: '17', bearing: 180, arrivalLon: 337, arrivalLat: 0, label: 'Retour salle collaborative' },
                    { position: { x: -495, y: -61, z: -24 }, type: 'transition', target: '18', bearing: 301, arrivalLon: 4, arrivalLat: 0, label: 'Zone 18' },
                    { position: { x: -474, y: -49, z: 151 }, type: 'transition', target: '19', bearing: 325.7, arrivalLon: 13, arrivalLat: 0, label: 'Zone 19' },
                    { position: { x: -276, y: -136, z: 393 }, type: 'transition', target: '20', bearing: 0, arrivalLon: 66, arrivalLat: 0, label: 'Zone 20' },
                ]
            },

            // ── COULOIRE ──────────────────────────────────────────────────────
            '22': {
                name: 'Couloire — début',
                image: './images/22.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 70, minimapY: 40,
                hotspots: [
                    { position: { x: -454, y: -187, z: -92 }, type: 'transition', target: '23', bearing: 0, arrivalLon: 179, arrivalLat: 0, label: 'Suite couloire' },
                    { position: { x: 472, y: -162, z: 17 }, type: 'transition', target: '17', bearing: 180, arrivalLon: 124, arrivalLat: 0, label: 'Retour salle collaborative' }
                ]
            },
            '23': {
                name: 'Couloire — milieu',
                image: './images/23.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 70, minimapY: 30,
                hotspots: [
                    { position: { x: -467, y: -173, z: 35 }, type: 'transition', target: '24', bearing: 0, arrivalLon: 89, arrivalLat: 0, label: 'Suite couloire' },
                    { position: { x: 457, y: -200, z: 25 }, type: 'transition', target: '22', bearing: 180, arrivalLon: 357, arrivalLat: 0, label: 'Retour couloire' },
                    { position: { x: -59, y: -156, z: 471 }, type: 'transition', target: '27', bearing: 90, arrivalLon: 183, arrivalLat: 0, label: 'Design Lab' }
                ]
            },
            '24': {
                name: 'Couloire — section 3',
                image: './images/24.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 70, minimapY: 20,
                hotspots: [
                    { position: { x: -38, y: -153, z: 474 }, type: 'transition', target: '25', bearing: 0, arrivalLon: 207, arrivalLat: 0, label: 'Suite couloire' },
                    { position: { x: -85, y: -168, z: -462 }, type: 'transition', target: '23', bearing: 180, arrivalLon: 0, arrivalLat: 0, label: 'Retour couloire' }
                ]
            },
            '25': {
                name: 'Couloire — section 4',
                image: './images/25.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 70, minimapY: 10,
                hotspots: [
                    { position: { x: -433, y: -149, z: -199 }, type: 'transition', target: '26', bearing: 0, arrivalLon: 174, arrivalLat: 0, label: 'Suite couloire' },
                    { position: { x: 410, y: -105, z: 264 }, type: 'transition', target: '24', bearing: 180, arrivalLon: 270, arrivalLat: 0, label: 'Retour couloire' },
                    { position: { x: -353, y: -352, z: 28 }, type: 'transition', target: '32', bearing: 270, arrivalLon: 178, arrivalLat: 0, label: 'Makerspace' }
                ]
            },
            '26': {
                name: 'Couloire — fin',
                image: './images/26.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 70, minimapY: 2,
                hotspots: [
                    { position: { x: 483, y: -121, z: -38 }, type: 'transition', target: '25', bearing: 180, arrivalLon: 20, arrivalLat: 0, label: 'Retour couloire' }
                ]
            },

            // ── DESIGN LAB ────────────────────────────────────────────────────
            '27': {
                name: 'Design Lab',
                image: './images/27.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 85, minimapY: 30,
                hotspots: [
                    { position: { x: -3, y: -179, z: 466 }, type: 'transition', target: '28', bearing: 315, arrivalLon: 0, arrivalLat: 0, label: 'Design Lab 28' },
                    { position: { x: -47, y: -231, z: -441 }, type: 'transition', target: '29', bearing: 45, arrivalLon: 174, arrivalLat: 0, label: 'Design Lab 29' },
                    { position: { x: 429, y: -254, z: 17 }, type: 'transition', target: '23', bearing: 180, arrivalLon: 269, arrivalLat: 0, label: 'Retour couloire' }
                ]
            },
            '28': {
                name: 'Design Lab 28',
                image: './images/28.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 90, minimapY: 22,
                hotspots: [
                    { position: { x: 0, y: -20, z: 280 }, type: 'transition', target: '27', bearing: 180, arrivalLon: 262, arrivalLat: 0, label: 'Retour Design Lab' },
                ]
            },
            '29': {
                name: 'Design Lab 29',
                image: './images/29.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 95, minimapY: 30,
                hotspots: [
                    { position: { x: 448, y: -216, z: -42 }, type: 'transition', target: '27', bearing: 180, arrivalLon: 88, arrivalLat: 0, label: 'Retour Design Lab' },
                    { position: { x: -461, y: -192, z: -22 }, type: 'transition', target: '30', bearing: 225, arrivalLon: 179, arrivalLat: 0, label: 'Design Lab 30' },
                    { position: { x: -107, y: -188, z: 450 }, type: 'transition', target: '31', bearing: 135, arrivalLon: 142, arrivalLat: 0, label: 'Design Lab 31' }
                ]
            },
            '30': {
                name: 'Design Lab 30',
                image: './images/30.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 90, minimapY: 38,
                hotspots: [
                    { position: { x: 464, y: -178, z: 48 }, type: 'transition', target: '29', bearing: 45, arrivalLon: 352, arrivalLat: 0, label: 'Design Lab 29' },
                ]
            },
            '31': {
                name: 'Design Lab 31',
                image: './images/31.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 95, minimapY: 46,
                hotspots: [
                    { position: { x: 458, y: -183, z: -74 }, type: 'transition', target: '29', bearing: 45, arrivalLon: 280, arrivalLat: 0, label: 'Design Lab 29' },
                ]
            },

            // ── MAKERSPACE ────────────────────────────────────────────────────
            '32': {
                name: 'Makerspace',
                image: './images/32.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 55, minimapY: 10,
                hotspots: [
                    { position: { x: -157, y: -192, z: 433 }, type: 'transition', target: '33', bearing: 315, arrivalLon: 12, arrivalLat: 0, label: 'Makerspace 33' },
                    { position: { x: -403, y: -175, z: -237 }, type: 'transition', target: '34', bearing: 45, arrivalLon: 20, arrivalLat: 0, label: 'Makerspace 34' },
                    { position: { x: -464, y: -151, z: 106 }, type: 'transition', target: '35', bearing: 0, arrivalLon: 154, arrivalLat: 0, label: 'Makerspace 35' },
                    { position: { x: 486, y: -55, z: 100 }, type: 'transition', target: '25', bearing: 180, arrivalLon: 0, arrivalLat: 0, label: 'Retour couloire' }
                ]
            },
            '33': {
                name: 'Makerspace 33',
                image: './images/33.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 45, minimapY: 4,
                hotspots: [
                    { position: { x: -390, y: -153, z: -272 }, type: 'transition', target: '32', bearing: 180, arrivalLon: 283, arrivalLat: 0, label: 'Retour Makerspace' },
                    { position: { x: -293, y: -198, z: 352 }, type: 'transition', target: '35', bearing: 0, arrivalLon: 158, arrivalLat: 0, label: 'Makerspace 35' },
                ]
            },
            '34': {
                name: 'Makerspace 34',
                image: './images/34.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 55, minimapY: 2,
                hotspots: [
                    { position: { x: -400, y: -180, z: -238 }, type: 'transition', target: '32', bearing: 180, arrivalLon: 0, arrivalLat: 0, label: 'Retour Makerspace' },
                    { position: { x: 177, y: -191, z: -426 }, type: 'transition', target: '35', bearing: 0, arrivalLon: 158, arrivalLat: 0, label: 'Makerspace 35' },
                ]
            },
            '35': {
                name: 'Makerspace 35',
                image: './images/35.webp',
                defaultBearing: 0,
                defaultLat: 0,
                minimapX: 65, minimapY: 4,
                hotspots: [
                    { position: { x: 387, y: -114, z: -295 }, type: 'transition', target: '32', bearing: 180, arrivalLon: 0, arrivalLat: 0, label: 'Retour Makerspace' },
                ]
            }
        }
    };

})();