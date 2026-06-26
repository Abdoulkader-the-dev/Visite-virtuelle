## **Cahier des Charges Technique : Moteur WebXR 360 Immersif** 

Ce document définit de manière exhaustive et rigoureuse les spécifications techniques et d'architecture pour le développement d'un moteur de visite virtuelle immersive à 360° stéréoscopique. Ce système est optimisé pour les casques de réalité virtuelle (VR) et s'appuie de façon stricte sur la stack Three.js et l'API WebXR. 

## **1. Structure des Données (Schema JSON)** 

L'application ingère un graphe de navigation de type strict. Chaque point de vue (nœud) et ses connexions (hotspots) doivent respecter les structures de types définies ci-dessous pour prévenir toute erreur d'exécution dynamique. 

interface Vector3D { x: number; y: number; z: number; } 

interface Hotspot { id_target: string; position: Vector3D; label: string; rotation_offset?: number; } 

interface Node360 { id: string; texture_url: string; title: string; hotspots: Hotspot[]; } 

interface TourConfig { initial_node: string; nodes: Record<string, Node360>; } 

## **2. Pipeline d'Assets et Compression VRAM** 

L'utilisation de formats d'image traditionnels (JPG, PNG) est strictement interdite pour les textures panoramiques en production afin d'empêcher la saturation de la mémoire vidéo (VRAM). 

- **Format imposé :** KTX2 utilisant la compression Basis Universal (UASTC). 

- **Outil de traitement :** Utilisation du CLI toktx issu du SDK officiel Khronos. 

Commande de compression à intégrer impérativement dans le pipeline de déploiement automatisé : 

toktx --t2 --zcmp 22 --uastc 2 output_file.ktx2 input_file.jpg 

Le chargement de l'asset côté client doit s'exécuter via le KTX2Loader configuré avec un pool dédié de 4 Web Workers au minimum afin de déporter le décodage hors du thread principal. 

## **3. Initialisation du Contexte WebGL et WebXR** 

La configuration du moteur de rendu doit prioriser l'efficacité matérielle brute et désactiver les options de post-traitement coûteuses. 

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false, depth: true }); renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight); renderer.xr.enabled = true; 

renderer.xr.setReferenceSpaceType('local'); 

## **4. Modélisation de l'Environnement (Double Sphère)** 

Pour éviter les latences d'affichage ou les écrans noirs lors des changements de scène, deux sphères distinctes doivent être présentes en mémoire (SphereA active, SphereB tampon). 

const geometry = new THREE.SphereGeometry(500, 64, 32); const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 1 }); const sphere = new THREE.Mesh(geometry, material); sphere.scale.x = -1; 

## **5. Mécanique des Contrôleurs VR et Raycasting** 

Les intéractions en contexte VR s'affranchissent totalement des événements de souris. Elles se basent exclusivement sur l'orientation et la position physique des contrôleurs de la manette. 

## **5.1. Instanciation des pointeurs matériels** 

const controllerRig = new THREE.Group(); scene.add(controllerRig); 

const controller1 = renderer.xr.getController(0); const controller2 = renderer.xr.getController(1); controllerRig.add(controller1, controller2); 

const laserGeometry = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -50) ]); 

const laserMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 }); controller1.add(new THREE.Line(laserGeometry, laserMaterial)); controller2.add(new THREE.Line(laserGeometry, laserMaterial)); 

## **5.2. Boucle de calcul des intersections** 

La mise à jour s'exécute à la fréquence nominale du rafraîchissement du casque (90Hz / 120Hz) via la méthode setAnimationLoop. Le calcul effectue des tests d'intersection géométrique entre le rayon du contrôleur et les volumes de collision (Bounding Box) des hotspots. 

## **6. Algorithme de Transition Immersive (Logique Street** 

## **View)** 

En mode VR, la modification du champ de vision de la caméra (FOV) étant bloquée par le matériel matériel, le déplacement cinématique doit être simulé par une translation physique du conteneur des contrôleurs (Rig). 

- **Phase 1 : Translation spatiale (400ms) :** Animation via GSAP du controllerRig.position vers les coordonnées du hotspot cible avec une courbe d'atténuation de type power2.in. 

- **Phase 2 : Fondu enchaîné (300ms) :** Modification de l'opacité linéaire (Alpha) faisant 

passer SphereA de 1.0 à 0.0 et SphereB de 0.0 à 1.0. 

- **Phase 3 : Normalisation (0ms) :** Réinitialisation instantanée du controllerRig.position à (0,0,0) et réaffectation des pointeurs de texture actifs. 

## **7. Design System UI 3D (Zéro Glassmorphism)** 

L'ensemble de l'interface graphique projetée dans l'espace VR doit s'en tenir à un rendu opaque strict pour garantir des performances élevées et éviter la cinétose chez l'utilisateur final. 

const panelOptions = { width: 1.2, height: 0.5, padding: 0.05, justifyContent: 'center', alignContent: 'center', fontFamily: 'assets/fonts/Roboto-Bold-msdf.json', fontTexture: 'assets/fonts/Roboto-Bold.png', fontColor: new THREE.Color(0xffffff), backgroundOpacity: 1.0, backgroundColor: new THREE.Color(0x1a1a1a), borderRadius: 0.05, borderColor: new THREE.Color(0x333333), borderWidth: 0.01 }; 

## **8. Gestion de la Mémoire (Garbage Collection)** 

Pour assurer la stabilité à long terme de l'application sur le navigateur du casque autonome, une libération explicite des ressources matérielles est impérative à chaque changement de nœud : 

- Mise en place d'un mécanisme de cache LRU limité à un maximum de 5 textures simultanées. 

- Appel impératif aux méthodes de destruction de bas niveau texture.dispose(), geometry.dispose(), et material.dispose() lors du déchargement d'un composant de la scène. 

