(function () {
    'use strict';

    // =========================================================================
    //  VR UI — Strict minimum : HUD avec bouton "Quitter VR" uniquement
    // =========================================================================
    //  Aucun menu, aucune grille de scènes, aucun panneau flottant.
    //  La navigation se fait uniquement via la flèche 3D au sol (hotspots.js).
    // =========================================================================

    // Polyfill for roundRect
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
            var r = typeof radii === 'number' ? radii : (radii || 0);
            this.moveTo(x + r, y);
            this.arcTo(x + w, y, x + w, y + h, r);
            this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r);
            this.arcTo(x, y, x + w, y, r);
            return this;
        };
    }

    var vrUiGroup = null;
    var exitButton = null;
    var hudEuler = new THREE.Euler();
    var hudForward = new THREE.Vector3();
    var textureLoader = null;

    // -------------------------------------------------------------------------
    //  buildVRUI() — Crée le HUD dans la scène mondiale (pas sur la caméra)
    // -------------------------------------------------------------------------
    function buildVRUI() {
        if (vrUiGroup) { return; }

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

        // ── Bouton Quitter VR (petit, discret, en bas du champ de vision) ──
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(30, 30, 30, 0.75)';
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Quitter VR', 128, 32);

        var texture = new THREE.CanvasTexture(canvas);
        var material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), material);
        exitButton.position.set(0, -0.6, -1.5);
        exitButton.userData = { action: 'exitVR', isVRButton: true };
        exitButton.renderOrder = 10;
        vrUiGroup.add(exitButton);

        // Exposer le bouton globalement pour handleXRSelect()
        window.vrExitButton = exitButton;

        window.tourState.scene.add(vrUiGroup);
    }

    // -------------------------------------------------------------------------
    //  showVRUI() / hideVRUI()
    // -------------------------------------------------------------------------
    function showVRUI() {
        if (!vrUiGroup) { buildVRUI(); }
        if (vrUiGroup) { vrUiGroup.visible = true; }
    }

    function hideVRUI() {
        if (vrUiGroup) { vrUiGroup.visible = false; }
    }

    // -------------------------------------------------------------------------
    //  initVRUI() — Initialisation du VR UI
    // -------------------------------------------------------------------------
    function initVRUI() {
        buildVRUI();
        hideVRUI();
    }

    // -------------------------------------------------------------------------
    //  doExitVR() — Ferme proprement la session WebXR
    // -------------------------------------------------------------------------
    function doExitVR() {
        var renderer = window.tourState.renderer;
        if (!renderer) { return; }

        var session = renderer.xr.getSession();
        if (session) {
            session.end().then(function () {
                window.tourState.isXRActive = false;
                hideVRUI();
            }).catch(function (err) {
                console.error('[VR] Erreur fin de session:', err);
                window.tourState.isXRActive = false;
                hideVRUI();
            });
        } else {
            window.tourState.isXRActive = false;
            hideVRUI();
        }
    }

    // -------------------------------------------------------------------------
    //  updateVRUI() — Repositionne le HUD devant la caméra chaque frame
    //  Copie position caméra + yaw seulement (pas de pitch/roll).
    // -------------------------------------------------------------------------
    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive) {
            return;
        }

        var camera = window.tourState.camera;
        var position = new THREE.Vector3();
        camera.getWorldPosition(position);

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        var hudPosition = position.clone().add(forward.clone().multiplyScalar(1.5));
        hudPosition.y -= 0.6;

        vrUiGroup.position.copy(hudPosition);
        vrUiGroup.lookAt(camera.position);
        vrUiGroup.rotateY(Math.PI);
        vrUiGroup.visible = true;
    }

    // -------------------------------------------------------------------------
    //  setupXRControllers() — Gère les contrôleurs XR
    // -------------------------------------------------------------------------
    function setupXRControllers() {
        var renderer = window.tourState.renderer;
        if (!renderer || !renderer.xr) return;

        renderer.xr.addEventListener('select', function (event) {
            var controller = event.target;
            if (!controller || !exitButton) return;

            var raycaster = new THREE.Raycaster();
            var tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

            var intersects = raycaster.intersectObject(exitButton);
            if (intersects.length > 0) {
                doExitVR();
            }
        });
    }

    // -------------------------------------------------------------------------
    //  updateAutoRotation() — Gère la rotation automatique
    // -------------------------------------------------------------------------
    function updateAutoRotation() {
        // Désactiver l'auto-rotation en mode VR
        if (window.tourState.isXRActive) {
            window.tourState.autoRotating = false;
            return;
        }

        if (!window.tourState.isDragging) {
            window.tourState.lon += 0.03;
            window.tourState.autoRotating = true;
        } else {
            window.tourState.autoRotating = false;
        }
    }

    // -------------------------------------------------------------------------
    //  updateCameraLookAt() — Met à jour la caméra
    // -------------------------------------------------------------------------
    function updateCameraLookAt() {
        var phi = (90 - window.tourState.lat) * Math.PI / 180;
        var theta = window.tourState.lon * Math.PI / 180;

        window.tourState.camera.lookAt(
            500 * Math.sin(phi) * Math.cos(theta),
            500 * Math.cos(phi),
            500 * Math.sin(phi) * Math.sin(theta)
        );

        if (window.tourState.camera.fov !== window.tourState.fov) {
            window.tourState.camera.fov = window.tourState.fov;
            window.tourState.camera.updateProjectionMatrix();
        }
    }

    // -------------------------------------------------------------------------
    //  createSphere() — Crée la sphère de la visite
    // -------------------------------------------------------------------------
    function createSphere() {
        var geometry = new THREE.SphereGeometry(500, 64, 64);
        var material = new THREE.MeshBasicMaterial({
            side: THREE.BackSide,
            transparent: true,
            opacity: 1
        });
        return new THREE.Mesh(geometry, material);
    }

    // -------------------------------------------------------------------------
    //  normalizeConfigPositions() — Normalise les positions des scènes
    // -------------------------------------------------------------------------
    function normalizeConfigPositions() {
        if (!window.TOUR_CONFIG || !window.TOUR_CONFIG.scenes) return;

        var scenes = window.TOUR_CONFIG.scenes;
        for (var key in scenes) {
            if (scenes.hasOwnProperty(key)) {
                var scene = scenes[key];
                if (scene.lon === undefined) scene.lon = 0;
                if (scene.lat === undefined) scene.lat = 0;
                if (scene.fov === undefined) scene.fov = 75;
            }
        }
    }

    // -------------------------------------------------------------------------
    //  loadScene() — Charge une scène
    // -------------------------------------------------------------------------
    function loadScene(sceneId, options) {
        return new Promise(function (resolve, reject) {
            var scenes = window.TOUR_CONFIG.scenes;
            var sceneData = scenes[sceneId];
            if (!sceneData) {
                reject(new Error('Scene not found: ' + sceneId));
                return;
            }

            window.tourState.currentScene = sceneId;
            window.tourState.lon = sceneData.lon || 0;
            window.tourState.lat = sceneData.lat || 0;
            window.tourState.fov = sceneData.fov || 75;

            if (sceneData.image) {
                textureLoader.load(sceneData.image, function (texture) {
                    window.tourState.sphere.material.map = texture;
                    window.tourState.sphere.material.needsUpdate = true;

                    if (options && options.isInitialLoad) {
                        updateCameraLookAt();
                    }
                    resolve();
                }, undefined, function (err) {
                    reject(err);
                });
            } else {
                resolve();
            }
        });
    }

    // -------------------------------------------------------------------------
    //  preloadAllScenes() — Précharge toutes les scènes
    // -------------------------------------------------------------------------
    function preloadAllScenes() {
        var scenes = window.TOUR_CONFIG.scenes;
        for (var key in scenes) {
            if (scenes.hasOwnProperty(key) && scenes[key].image) {
                textureLoader.load(scenes[key].image, function () { }, undefined, function () { });
            }
        }
    }

    // -------------------------------------------------------------------------
    //  renderFrame() — Boucle de rendu
    // -------------------------------------------------------------------------
    function renderFrame(timestamp, frame) {
        updateAutoRotation();
        updateCameraLookAt();

        if (window.updateHotspots) {
            window.updateHotspots();
        }
        if (window.updateMinimapArrow) {
            window.updateMinimapArrow();
        }
        if (window.updateCompass) {
            window.updateCompass();
        }

        updateVRUI();

        window.tourState.renderer.render(window.tourState.scene, window.tourState.camera);
    }

    // -------------------------------------------------------------------------
    //  onResize() — Gère le redimensionnement
    // -------------------------------------------------------------------------
    function onResize() {
        var camera = window.tourState.camera;
        var renderer = window.tourState.renderer;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
    }

    // -------------------------------------------------------------------------
    //  getStartParams() — Récupère les paramètres de démarrage
    // -------------------------------------------------------------------------
    function getStartParams() {
        var params = new URLSearchParams(window.location.search);
        var sceneId = params.get('scene') || '12';
        var lon = parseFloat(params.get('lon'));
        var lat = parseFloat(params.get('lat'));

        if (!window.TOUR_CONFIG.scenes[sceneId]) {
            sceneId = '12';
        }

        return {
            scene: sceneId,
            lon: isNaN(lon) ? 0 : lon,
            lat: isNaN(lat) ? 0 : Math.max(-85, Math.min(85, lat))
        };
    }

    // -------------------------------------------------------------------------
    //  init() — Initialisation principale
    // -------------------------------------------------------------------------
    function init() {
        // Vérifier que TOUR_CONFIG existe
        if (!window.TOUR_CONFIG) {
            console.error('[VR] TOUR_CONFIG manquant');
            return;
        }

        normalizeConfigPositions();

        var canvas = document.getElementById('tour-canvas');
        if (!canvas) {
            console.error('[VR] Canvas #tour-canvas introuvable');
            return;
        }

        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 0.001);

        var renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: false,
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.xr.enabled = true;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.4;

        // Track XR session state
        renderer.xr.addEventListener('sessionstart', function () {
            window.tourState.isXRActive = true;
            showVRUI();
            console.log('[VR] Session started');
        });

        renderer.xr.addEventListener('sessionend', function () {
            window.tourState.isXRActive = false;
            hideVRUI();
            console.log('[VR] Session ended');
        });

        var sphere = createSphere();
        scene.add(sphere);

        var sphere2 = createSphere();
        sphere2.material.opacity = 0;
        sphere2.material.depthWrite = false;
        sphere2.scale.set(0.99, 0.99, 0.99);
        sphere2.visible = false;
        scene.add(sphere2);

        textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');

        // Initialiser tourState
        window.tourState = window.tourState || {};
        window.tourState.camera = camera;
        window.tourState.renderer = renderer;
        window.tourState.scene = scene;
        window.tourState.sphere = sphere;
        window.tourState.sphere2 = sphere2;
        window.tourState.isXRActive = false;
        window.tourState.isDragging = false;
        window.tourState.autoRotating = true;
        window.tourState.lon = 0;
        window.tourState.lat = 0;
        window.tourState.fov = 75;
        window.tourState.currentScene = null;

        // Initialiser les modules
        if (window.initControls) {
            window.initControls();
        }
        if (window.initUI) {
            window.initUI();
        }

        initVRUI();
        setupXRControllers();

        window.addEventListener('resize', onResize);

        var startParams = getStartParams();

        loadScene(startParams.scene, { isInitialLoad: true }).then(function () {
            if (startParams.lon !== 0) {
                window.tourState.lon = startParams.lon;
            }
            window.tourState.lat = startParams.lat;
            preloadAllScenes();
        }).catch(function (err) {
            console.error('[VR] Erreur chargement scène:', err);
        });

        renderer.setAnimationLoop(renderFrame);
    }

    // Exposer les fonctions globalement
    window.loadScene = loadScene;
    window.preloadAllScenes = preloadAllScenes;
    window.updateCameraLookAt = updateCameraLookAt;
    window.createSphere = createSphere;
    window.updateVRUI = updateVRUI;
    window.initVRUI = initVRUI;
    window.buildVRUI = buildVRUI;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.doExitVR = doExitVR;

    // Démarrer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();