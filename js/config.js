(function () {
    'use strict';

    window.TOUR_CONFIG = {
        scenes: {
            '1': {
                name: 'Rez-de-chaussée',
                image: './images/1.jpg',
                minimapX: 50,
                minimapY: 80,
                hotspots: [
                    {
                        position: { x: 150, y: 0, z: -250 },
                        type: 'transition',
                        target: '2',
                        label: 'Cuisine'
                    },
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '3',
                        label: 'Salon'
                    },
                    {
                        position: { x: 0, y: 200, z: -250 },
                        type: 'info',
                        icon: '💡',
                        title: 'Éclairage intelligent',
                        description: "Système d'éclairage LED avec détection de présence."
                    }
                ]
            },
            '2': {
                name: 'Cuisine',
                image: './images/2.jpg',
                minimapX: 20,
                minimapY: 50,
                hotspots: [
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '1',
                        label: 'Rez-de-chaussée'
                    },
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '4',
                        label: 'Jardin'
                    }
                ]
            },
            '3': {
                name: 'Salon',
                image: './images/3.jpg',
                minimapX: 80,
                minimapY: 50,
                hotspots: [
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '1',
                        label: 'Rez-de-chaussée'
                    },
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '5',
                        label: 'Escalier'
                    },
                    {
                        position: { x: 0, y: 150, z: -250 },
                        type: 'info',
                        icon: '💡',
                        title: 'Lustre design',
                        description: "Éclairage d'ambiance avec cristaux Swarovski."
                    }
                ]
            },
            '4': {
                name: 'Jardin',
                image: './images/4.jpg',
                minimapX: 20,
                minimapY: 20,
                hotspots: [
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '2',
                        label: 'Cuisine'
                    },
                    {
                        position: { x: 0, y: 50, z: 250 },
                        type: 'info',
                        icon: '🏊',
                        title: 'Piscine extérieure',
                        description: 'Piscine chauffée avec éclairage nocturne.'
                    }
                ]
            },
            '5': {
                name: 'Escalier',
                image: './images/5.jpg',
                minimapX: 65,
                minimapY: 35,
                hotspots: [
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '3',
                        label: 'Salon'
                    },
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '6',
                        label: 'Étage'
                    }
                ]
            },
            '6': {
                name: 'Chambre parentale',
                image: './images/6.jpg',
                minimapX: 65,
                minimapY: 15,
                hotspots: [
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '5',
                        label: 'Escalier'
                    },
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '7',
                        label: 'Salle de bain'
                    }
                ]
            },
            '7': {
                name: 'Salle de bain',
                image: './images/7.jpg',
                minimapX: 86,
                minimapY: 18,
                hotspots: [
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '6',
                        label: 'Chambre parentale'
                    },
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '8',
                        label: 'Bureau'
                    },
                    {
                        position: { x: 0, y: 120, z: -260 },
                        type: 'info',
                        icon: 'i',
                        title: 'Espace bien-etre',
                        description: 'Douche moderne avec finitions premium.'
                    }
                ]
            },
            '8': {
                name: 'Bureau',
                image: './images/8.jpg',
                minimapX: 88,
                minimapY: 42,
                hotspots: [
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '7',
                        label: 'Salle de bain'
                    },
                    {
                        position: { x: -240, y: 0, z: -170 },
                        type: 'transition',
                        target: '9',
                        label: 'Terrasse'
                    },
                    {
                        position: { x: 0, y: 150, z: -250 },
                        type: 'info',
                        icon: 'i',
                        title: 'Poste de travail',
                        description: 'Espace calme pour le travail et les appels video.'
                    }
                ]
            },
            '9': {
                name: 'Terrasse',
                image: './images/9.jpg',
                minimapX: 72,
                minimapY: 70,
                hotspots: [
                    {
                        position: { x: 245, y: 0, z: -160 },
                        type: 'transition',
                        target: '8',
                        label: 'Bureau'
                    },
                    {
                        position: { x: -245, y: 0, z: -160 },
                        type: 'transition',
                        target: '10',
                        label: 'Entree'
                    },
                    {
                        position: { x: 0, y: 80, z: 260 },
                        type: 'info',
                        icon: 'i',
                        title: 'Vue exterieure',
                        description: 'Zone ouverte pour recevoir et profiter de la lumiere naturelle.'
                    }
                ]
            },
            '10': {
                name: 'Entree',
                image: './images/10.jpg',
                minimapX: 42,
                minimapY: 96,
                hotspots: [
                    {
                        position: { x: 250, y: 0, z: -150 },
                        type: 'transition',
                        target: '9',
                        label: 'Terrasse'
                    },
                    {
                        position: { x: -250, y: 0, z: -150 },
                        type: 'transition',
                        target: '1',
                        label: 'Rez-de-chaussee'
                    }
                ]
            }
        }
    };
})();
