(function () {
    'use strict';

    var textureLoader;
    var MAX_CACHED_TEXTURES = 5;
    var textureCache = new Map();

    // Hauteur des yeux en VR (mètres)
    var VR_EYE_HEIGHT = 1.6;
    window.VR_EYE_HEIGHT = VR_EYE_HEIGHT; // Exposer pour les autres fichiers

    function isTextureInUse(texture) {
        var ts = window.tourState;
        if (!ts) return false;
        return texture === ts.currentTexture ||
            (ts.sphere && ts.sphere.material.map === texture) ||
            (ts.sphere2 && ts.sphere2.material.map === texture);
    }

    function evictLRUIfNeeded() {
        if (textureCache.size <= MAX_CACHED_TEXTURES) return;
        var keys = Array.from(textureCache.keys());
        for (var i = 0; i < keys.length && textureCache.size > MAX_CACHED_TEXTURES; i++) {
            var key = keys[i];
            var texture = textureCache.get(key);
            if (texture && !isTextureInUse(texture)) {
                texture.dispose();
                textureCache.delete(key);
            }
        }
    }

    function setupXRControllers() {
        var renderer = window.tourState.renderer;
        if (!renderer) return;

        if (window.tourState.xrControllers) {
            window.tourState.xrControllers.forEach(c => c.parent && c.parent.remove(c));
        }

        var controllers = [];
        for (var i = 0; i < 2; i++) {
            var controller = renderer.xr.getController(i);
            controller.userData = { index: i, isSelecting: false };

            var lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)]);
            var lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.5 });
            var line = new THREE.Line(lineGeo, lineMat);
            line.name = 'line';
            controller.add(line);

            window.tourState.scene.add(controller);

            controller.addEventListener('selectstart', function () {
                this.userData.isSelecting = true;
                if (window.handleXRSelect) window.handleXRSelect(this);
            });
            controller.addEventListener('selectend', function () {
                this.userData.isSelecting = false;
            });
            controller.addEventListener('squeezestart', function () {
                if (window.goBack) window.goBack();
            });

            controllers.push(controller);
        }
        window.tourState.xrControllers = controllers;
        console.log('[XR] Meta Quest controllers initialized');
    }

    function vectorFromConfig(position) {
        return new THREE.Vector3(position.x, position.y, position.z);
    }

    function normalizeConfigPositions() {
        Object.values(window.TOUR_CONFIG.scenes).forEach(function (scene) {
            (scene.hotspots || []).forEach(function (hotspot) {
                if (!hotspot.positionVector) {
                    hotspot.positionVector = vectorFromConfig(hotspot.position);
                }
                if (hotspot.type === 'transition' && typeof hotspot.bearing !== 'number') {
                    hotspot.bearing = (Math.atan2(hotspot.position.x, -hotspot.position.z) * 180 / Math.PI + 360) % 360;
                }
            });
        });
    }

    function loadTexture(path) {
        if (textureCache.has(path)) {
            var cached = textureCache.get(path);
            textureCache.delete(path);
            textureCache.set(path, cached);
            return Promise.resolve(cached);
        }

        return new Promise(function (resolve, reject) {
            textureLoader.load(path,
                function (texture) {
                    texture.minFilter = THREE.LinearFilter;
                    texture.encoding = THREE.sRGBEncoding;
                    textureCache.set(path, texture);
                    evictLRUIfNeeded();
                    resolve(texture);
                },
                undefined,
                () => reject(new Error('Image not found: ' + path))
            );
        });
    }
    window.loadTourTexture = loadTexture;

    function preloadLinkedScenes(sceneId) {
        var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
        if (!sceneConfig) return;
        sceneConfig.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && window.TOUR_CONFIG.scenes[hotspot.target]) {
                loadTexture(window.TOUR_CONFIG.scenes[hotspot.target].image).catch(() => { });
            }
        });
    }

    function createSphere() {
        var geo = new THREE.SphereGeometry(500, 60, 40);
        geo.scale(-1, 1, 1);
        var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        return new THREE.Mesh(geo, mat);
    }

    function showLoading(sceneName) {
        var overlay = document.getElementById('loading-overlay');
        var text = document.getElementById('loading-text');
        text.textContent = sceneName ? 'Chargement : ' + sceneName : 'Chargement...';
        overlay.classList.add('visible');
    }

    function hideLoading() {
        document.getElementById('loading-overlay').classList.remove('visible');
    }

    function loadScene(sceneId, loadOptions = {}) {
        var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
        if (!sceneConfig) return Promise.reject(new Error('Scene unknown: ' + sceneId));

        window.tourState.isTransitioning = true;
        if (!loadOptions.skipLoadingScreen) showLoading(sceneConfig.name);

        return loadTexture(sceneConfig.image).then(function (texture) {
            window.tourState.sphere.material.map = texture;
            window.tourState.sphere.material.needsUpdate = true;
            window.tourState.currentTexture = texture;
            window.tourState.currentScene = sceneId;

            if (loadOptions.isInitialLoad && typeof sceneConfig.defaultBearing === 'number') {
                window.tourState.lon = sceneConfig.defaultBearing;
            } else if (typeof loadOptions.initialLon === 'number') {
                window.tourState.lon = loadOptions.initialLon;
            }
            window.tourState.lat = loadOptions.initialLat || 0;

            if (window.updateNavMenu) window.updateNavMenu();
            if (window.updateMinimap) window.updateMinimap();
            if (window.updateBackButton) window.updateBackButton();

            var announcer = document.getElementById('scene-announcer');
            if (announcer) announcer.textContent = 'Vue : ' + sceneConfig.name;

            setTimeout(hideLoading, 120);
            if (!loadOptions.keepTransitionActive) window.tourState.isTransitioning = false;
            window.tourState.lastInteractionTime = Date.now();
            return true;
        }).catch(function (error) {
            document.getElementById('loading-text').textContent = error.message;
            console.error(error);
            return false;
        });
    }

    function updateAutoRotation() {
        if (window.tourState.isXRActive || window.tourState.isDragging || window.tourState.isTransitioning) {
            window.tourState.autoRotating = false;
            return;
        }
        if (Date.now() - window.tourState.lastInteractionTime > 5000) {
            window.tourState.lon += 0.03;
            window.tourState.autoRotating = true;
        }
    }

    function updateCameraLookAt() {
        if (window.tourState.isXRActive) return;
        var phi = THREE.MathUtils.degToRad(90 - window.tourState.lat);
        var theta = THREE.MathUtils.degToRad(window.tourState.lon);
        var target = new THREE.Vector3(
            500 * Math.sin(phi) * Math.cos(theta),
            500 * Math.cos(phi),
            500 * Math.sin(phi) * Math.sin(theta)
        );
        window.tourState.camera.lookAt(target);
    }

    function renderFrame(timestamp, frame) {
        updateAutoRotation();
        updateCameraLookAt();

        if (window.updateHotspots) window.updateHotspots();
        if (window.updateMinimapArrow) window.updateMinimapArrow();
        if (window.updateCompass) window.updateCompass();
        if (window.updateVRUI) window.updateVRUI();

        if (frame && window.tourState.isXRActive && window.pollXRGamepads) {
            window.pollXRGamepads();
        }
        window.tourState.renderer.render(window.tourState.scene, window.tourState.camera);
    }

    function onResize() {
        var camera = window.tourState.camera;
        var renderer = window.tourState.renderer;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function getStartParams() {
        var params = new URLSearchParams(window.location.search);
        var sceneId = params.get('scene') || '12';
        return {
            scene: window.TOUR_CONFIG.scenes[sceneId] ? sceneId : '12',
            lon: parseFloat(params.get('lon')) || 0,
            lat: parseFloat(params.get('lat')) || 0
        };
    }

    function onXRSessionStart() {
        window.tourState.isXRActive = true;
        document.body.classList.add('xr-active');
        console.log('[XR] Session started');

        var offset = VR_EYE_HEIGHT;
        if (window.tourState.sphere) window.tourState.sphere.position.y = offset;
        if (window.tourState.sphere2) window.tourState.sphere2.position.y = offset;
        if (window.tourState.hotspotGroup) window.tourState.hotspotGroup.position.y = offset;
        if (window.tourState.groundHotspotGroup) window.tourState.groundHotspotGroup.position.y = offset;

        if (window.updateVRButtonState) window.updateVRButtonState(true);
        if (window.showVRUI) window.showVRUI();
        setTimeout(setupXRControllers, 500);
    }

    function onXRSessionEnd() {
        window.tourState.isXRActive = false;
        document.body.classList.remove('xr-active');
        console.log('[XR] Session ended');

        if (window.tourState.sphere) window.tourState.sphere.position.y = 0;
        if (window.tourState.sphere2) window.tourState.sphere2.position.y = 0;
        if (window.tourState.hotspotGroup) window.tourState.hotspotGroup.position.y = 0;
        if (window.tourState.groundHotspotGroup) window.tourState.groundHotspotGroup.position.y = 0;

        if (window.tourState.xrControllers) {
            window.tourState.xrControllers.forEach(c => c.parent && c.parent.remove(c));
            window.tourState.xrControllers = [];
        }

        if (window.updateVRButtonState) window.updateVRButtonState(true);
        if (window.hideVRUI) window.hideVRUI();
        if (window.hideVRInfoPanel) window.hideVRInfoPanel();

        window.tourState.camera.position.set(0, 0, 0.001);
        window.tourState.camera.quaternion.identity();
        updateCameraLookAt();
    }

    function init() {
        normalizeConfigPositions();
        var canvas = document.getElementById('tour-canvas');
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.outputEncoding = THREE.sRGBEncoding;

        renderer.xr.addEventListener('sessionstart', onXRSessionStart);
        renderer.xr.addEventListener('sessionend', onXRSessionEnd);

        var sphere = createSphere();
        scene.add(sphere);
        var sphere2 = createSphere();
        sphere2.material.opacity = 0;
        sphere2.visible = false;
        scene.add(sphere2);

        textureLoader = new THREE.TextureLoader();

        window.tourState.camera = camera;
        window.tourState.renderer = renderer;
        window.tourState.scene = scene;
        window.tourState.sphere = sphere;
        window.tourState.sphere2 = sphere2;

        if (window.initControls) window.initControls();
        if (window.initUI) window.initUI();
        if (window.initVRUI) window.initVRUI();
        if (window.initXRControls) window.initXRControls();

        window.addEventListener('resize', onResize);
        var startParams = getStartParams();

        loadScene(startParams.scene, { isInitialLoad: true, initialLon: startParams.lon, initialLat: startParams.lat })
            .then((sceneLoaded) => {
                if (sceneLoaded) {
                    if (window.initHotspots) window.initHotspots();
                    preloadLinkedScenes(startParams.scene);
                }
            });

        renderer.setAnimationLoop(renderFrame);
    }

    window.loadScene = loadScene;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
