(function () {
    'use strict';

    // =========================================================================
    //  CONFIG — VISITE VIRTUELLE
    // =========================================================================
    //  Pour repositionner un hotspot visuellement :
    //    Ouvrir  hotspot-editor.html  dans votre navigateur.
    //    Cliquer sur la scène → le panneau affiche les coordonnées x,y,z.
    //    Copier les valeurs ici dans position: { x:_, y:_, z:_ }.
    //
    //  STRUCTURE D'UN HOTSPOT :
    //    Transition : { position:{x,y,z}, type:'transition', target:'ID', label:'Nom' }
    //    Info       : { position:{x,y,z}, type:'info', icon:'💡', title:'', description:'' }
    //
    //  position.x  : gauche(−) / droite(+)
    //  position.y  : bas(−)    / haut(+)
    //  position.z  : devant(−) / derrière(+)   → −250 = bien devant la caméra
    // =========================================================================

    window.TOUR_CONFIG = {
        scenes: {

            // ── ENTRÉE ────────────────────────────────────────────────────────
            '12': {
                name: 'Entrée',
                image: './images/12.JPG',
                minimapX: 50, minimapY: 85,
                hotspots: [
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '13', bearing: 0, label: "Salle d'attente" },
                    { position: { x: 200, y: -20, z: -180 }, type: 'transition', target: '16', bearing: 48, label: 'Zone 16' },
                    { position: { x:-200, y: -20, z: -180 }, type: 'transition', target: '17', bearing: 312, label: 'Salle collaborative' }
                ]
            },

            // ── SALLE D'ATTENTE ───────────────────────────────────────────────
            '13': {
                name: "Salle d'attente",
                image: './images/13.JPG',
                minimapX: 35, minimapY: 65,
                hotspots: [
                    { position: { x:-150, y: -20, z: -220 }, type: 'transition', target: '14', bearing: 325.7, label: 'Zone 14' },
                    { position: { x: 150, y: -20, z: -220 }, type: 'transition', target: '15', bearing: 34.3, label: 'Zone 15' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '12', bearing: 180, label: 'Entrée' }
                ]
            },

            // ── ZONES 14 & 15 (liées à la salle d'attente) ───────────────────
            '14': {
                name: 'Zone 14',
                image: './images/14.JPG',
                minimapX: 20, minimapY: 50,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '13', bearing: 180, label: "Retour salle d'attente" }
                ]
            },
            '15': {
                name: 'Zone 15',
                image: './images/15.JPG',
                minimapX: 50, minimapY: 50,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '13', bearing: 180, label: "Retour salle d'attente" }
                ]
            },

            // ── ZONE 16 ───────────────────────────────────────────────────────
            '16': {
                name: 'Zone 16',
                image: './images/16.JPG',
                minimapX: 65, minimapY: 70,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '12', bearing: 180, label: 'Retour Entrée' }
                ]
            },

            // ── SALLE COLLABORATIVE ───────────────────────────────────────────
            '17': {
                name: 'Salle collaborative',
                image: './images/17.JPG',
                minimapX: 30, minimapY: 40,
                hotspots: [
                    { position: { x:-250, y: -20, z: -150 }, type: 'transition', target: '18', bearing: 301, label: 'Zone 18' },
                    { position: { x:-150, y: -20, z: -220 }, type: 'transition', target: '19', bearing: 325.7, label: 'Zone 19' },
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '20', bearing: 0, label: 'Zone 20' },
                    { position: { x: 150, y: -20, z: -220 }, type: 'transition', target: '21', bearing: 34.3, label: 'Zone 21' },
                    { position: { x: 280, y: -20, z:    0 }, type: 'transition', target: '12', bearing: 90, label: 'Entrée' },
                    { position: { x: 250, y: -20, z: -150 }, type: 'transition', target: '22', bearing: 59, label: 'Couloire' }
                ]
            },

            // ── ZONES 18-21 (salle collaborative) ─────────────────────────────
            '18': {
                name: 'Zone 18',
                image: './images/18.JPG',
                minimapX: 15, minimapY: 28,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '17', bearing: 180, label: 'Retour salle collaborative' }
                ]
            },
            '19': {
                name: 'Zone 19',
                image: './images/19.JPG',
                minimapX: 25, minimapY: 20,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '17', bearing: 180, label: 'Retour salle collaborative' }
                ]
            },
            '20': {
                name: 'Zone 20',
                image: './images/20.JPG',
                minimapX: 40, minimapY: 15,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '17', bearing: 180, label: 'Retour salle collaborative' }
                ]
            },
            '21': {
                name: 'Zone 21',
                image: './images/21.JPG',
                minimapX: 55, minimapY: 20,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '17', bearing: 180, label: 'Retour salle collaborative' }
                ]
            },

            // ── COULOIRE ──────────────────────────────────────────────────────
            '22': {
                name: 'Couloire — début',
                image: './images/22.JPG',
                minimapX: 70, minimapY: 40,
                hotspots: [
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '23', bearing: 0, label: 'Suite couloire' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '17', bearing: 180, label: 'Retour salle collaborative' }
                ]
            },
            '23': {
                name: 'Couloire — milieu',
                image: './images/23.JPG',
                minimapX: 70, minimapY: 30,
                hotspots: [
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '24', bearing: 0, label: 'Suite couloire' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '22', bearing: 180, label: 'Retour couloire' },
                    { position: { x: 280, y: -20, z:    0 }, type: 'transition', target: '27', bearing: 90, label: 'Design Lab' }
                ]
            },
            '24': {
                name: 'Couloire — section 3',
                image: './images/24.JPG',
                minimapX: 70, minimapY: 20,
                hotspots: [
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '25', bearing: 0, label: 'Suite couloire' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '23', bearing: 180, label: 'Retour couloire' }
                ]
            },
            '25': {
                name: 'Couloire — section 4',
                image: './images/25.JPG',
                minimapX: 70, minimapY: 10,
                hotspots: [
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '26', bearing: 0, label: 'Suite couloire' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '24', bearing: 180, label: 'Retour couloire' },
                    { position: { x:-280, y: -20, z:    0 }, type: 'transition', target: '32', bearing: 270, label: 'Makerspace' }
                ]
            },
            '26': {
                name: 'Couloire — fin',
                image: './images/26.JPG',
                minimapX: 70, minimapY: 2,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '25', bearing: 180, label: 'Retour couloire' }
                ]
            },

            // ── DESIGN LAB ────────────────────────────────────────────────────
            '27': {
                name: 'Design Lab',
                image: './images/27.JPG',
                minimapX: 85, minimapY: 30,
                hotspots: [
                    { position: { x:-200, y: -20, z: -200 }, type: 'transition', target: '28', bearing: 315, label: 'Design Lab 28' },
                    { position: { x: 200, y: -20, z: -200 }, type: 'transition', target: '29', bearing: 45, label: 'Design Lab 29' },
                    { position: { x:-200, y: -20, z:  200 }, type: 'transition', target: '30', bearing: 225, label: 'Design Lab 30' },
                    { position: { x: 200, y: -20, z:  200 }, type: 'transition', target: '31', bearing: 135, label: 'Design Lab 31' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '23', bearing: 180, label: 'Retour couloire' }
                ]
            },
            '28': {
                name: 'Design Lab 28',
                image: './images/28.JPG',
                minimapX: 90, minimapY: 22,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '27', bearing: 180, label: 'Retour Design Lab' }
                ]
            },
            '29': {
                name: 'Design Lab 29',
                image: './images/29.JPG',
                minimapX: 95, minimapY: 30,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '27', bearing: 180, label: 'Retour Design Lab' }
                ]
            },
            '30': {
                name: 'Design Lab 30',
                image: './images/30.JPG',
                minimapX: 90, minimapY: 38,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '27', bearing: 180, label: 'Retour Design Lab' }
                ]
            },
            '31': {
                name: 'Design Lab 31',
                image: './images/31.JPG',
                minimapX: 95, minimapY: 46,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '27', bearing: 180, label: 'Retour Design Lab' }
                ]
            },

            // ── MAKERSPACE ────────────────────────────────────────────────────
            '32': {
                name: 'Makerspace',
                image: './images/32.JPG',
                minimapX: 55, minimapY: 10,
                hotspots: [
                    { position: { x:-200, y: -20, z: -200 }, type: 'transition', target: '33', bearing: 315, label: 'Makerspace 33' },
                    { position: { x: 200, y: -20, z: -200 }, type: 'transition', target: '34', bearing: 45, label: 'Makerspace 34' },
                    { position: { x:   0, y: -20, z: -280 }, type: 'transition', target: '35', bearing: 0, label: 'Makerspace 35' },
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '25', bearing: 180, label: 'Retour couloire' }
                ]
            },
            '33': {
                name: 'Makerspace 33',
                image: './images/33.JPG',
                minimapX: 45, minimapY: 4,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '32', bearing: 180, label: 'Retour Makerspace' }
                ]
            },
            '34': {
                name: 'Makerspace 34',
                image: './images/34.JPG',
                minimapX: 55, minimapY: 2,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '32', bearing: 180, label: 'Retour Makerspace' }
                ]
            },
            '35': {
                name: 'Makerspace 35',
                image: './images/35.JPG',
                minimapX: 65, minimapY: 4,
                hotspots: [
                    { position: { x:   0, y: -20, z:  280 }, type: 'transition', target: '32', bearing: 180, label: 'Retour Makerspace' }
                ]
            }
        }
    };

})();
