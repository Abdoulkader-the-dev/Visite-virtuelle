(function () {
    'use strict';

    // =========================================================================
    //  VR UI — Strict minimum : HUD avec bouton "Quitter VR" uniquement
    // =========================================================================
    //  Aucun menu, aucune grille de scènes, aucun panneau flottant.
    //  La navigation se fait uniquement via la flèche 3D au sol (hotspots.js).
    // =========================================================================

    var vrUiGroup = null;
    var exitButton = null;
    var hudEuler = new THREE.Euler(); // [PERF] réutilisé chaque frame, plus de "new" dans updateVRUI()
    var hudForward = new THREE.Vector3();

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
        vrUiGroup.visible = true;
    }

    function hideVRUI() {
        if (vrUiGroup) { vrUiGroup.visible = false; }
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
            }).catch(function (err) {
                console.error('[VR] Erreur fin de session:', err);
                window.tourState.isXRActive = false;
            });
        } else {
            window.tourState.isXRActive = false;
        }
    }

    // -------------------------------------------------------------------------
    //  updateVRUI() — Repositionne le HUD devant la caméra chaque frame
    //  Copie position caméra + yaw seulement (pas de pitch/roll).
    // -------------------------------------------------------------------------
    function updateVRUI() {
        if (!window.tourState.isXRActive && !window.tourState.isDragging) {
            window.tourState.lon += 0.03;
            window.tourState.autoRotating = true;
        } else {
            window.tourState.autoRotating = false;
        }
    }

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
        if (window.updateVRUI) {
            window.updateVRUI();
        }

        window.tourState.renderer.render(window.tourState.scene, window.tourState.camera);
    }

    function onResize() {
        var camera = window.tourState.camera;
        var renderer = window.tourState.renderer;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
    }

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

    function init() {
        normalizeConfigPositions();

        var canvas = document.getElementById('tour-canvas');
        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 0.001);

        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.xr.enabled = true; // Enable VR/AR
        // Correction luminosité — les photos prises en intérieur apparaissent
        // sombres sans ces deux paramètres. outputEncoding sRGB = couleurs fidèles.
        // toneMapping LinearToneMapping + exposure = contrôle de la luminosité globale.
        // Pour ajuster : changer renderer.toneMappingExposure (1.0 = neutre, >1 = plus clair)
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.4;

        // Track XR session state
        renderer.xr.addEventListener('sessionstart', function () {
            window.tourState.isXRActive = true;
            console.log('[VR] Session started');
        });

        renderer.xr.addEventListener('sessionend', function () {
            window.tourState.isXRActive = false;
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

        window.tourState.camera = camera;
        window.tourState.renderer = renderer;
        window.tourState.scene = scene;
        window.tourState.sphere = sphere;
        window.tourState.sphere2 = sphere2;

        if (window.initControls) {
            window.initControls();
        }
        if (window.initUI) {
            window.initUI();
        }
        if (window.initVRUI) {
            window.initVRUI();
        }
        if (window.initXRControls) {
            window.initXRControls();
        }

        setupXRControllers();
        window.addEventListener('resize', onResize);

        var startParams = getStartParams();

        loadScene(startParams.scene, { isInitialLoad: true }).then(function () {
            // Si un lon explicite est passé en URL, il écrase le defaultLon
            if (startParams.lon !== 0) {
                window.tourState.lon = startParams.lon;
            }
            window.tourState.lat = startParams.lat;
            preloadAllScenes();
        });
        renderer.setAnimationLoop(renderFrame);
    }

    window.loadScene = loadScene;
    window.preloadAllScenes = preloadAllScenes;
    window.updateCameraLookAt = updateCameraLookAt;
    window.createSphere = createSphere;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();