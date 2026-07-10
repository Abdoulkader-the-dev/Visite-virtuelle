(function () {
    'use strict';

    var textureLoader;
    var MAX_CACHED_TEXTURES = 50;
    var textureCache = new Map();

    function isTextureInUse(texture) {
        var ts = window.tourState;
        if (!ts) return false;
        if (texture === ts.currentTexture) return true;
        if (ts.sphere && ts.sphere.material && ts.sphere.material.map === texture) return true;
        if (ts.sphere2 && ts.sphere2.material && ts.sphere2.material.map === texture) return true;
        return false;
    }

    function evictLRUIfNeeded() {
        if (textureCache.size <= MAX_CACHED_TEXTURES) {
            return;
        }
        var it = textureCache.keys();
        var toCheck = Array.from(it);
        for (var i = 0; i < toCheck.length && textureCache.size > MAX_CACHED_TEXTURES; i += 1) {
            var key = toCheck[i];
            var texture = textureCache.get(key);
            if (!texture || isTextureInUse(texture)) {
                continue;
            }
            texture.dispose();
            textureCache.delete(key);
        }
    }

    function vectorFromConfig(position) {
        return new THREE.Vector3(position.x, position.y, position.z);
    }

    function normalizeConfigPositions() {
        Object.keys(window.TOUR_CONFIG.scenes).forEach(function (sceneId) {
            window.TOUR_CONFIG.scenes[sceneId].hotspots.forEach(function (hotspot) {
                if (!hotspot.positionVector) {
                    hotspot.positionVector = vectorFromConfig(hotspot.position);
                }
                if (hotspot.type === 'transition' && typeof hotspot.bearing !== 'number') {
                    hotspot.bearing = Math.atan2(hotspot.position.x, -hotspot.position.z) * 180 / Math.PI;
                    if (hotspot.bearing < 0) {
                        hotspot.bearing += 360;
                    }
                }
            });
        });
    }

    function imageCandidates(path) {
        var base = path.replace(/\.(jpg|jpeg|png|webp)$/i, '');
        return [base + '.webp', base + '.jpg', base + '.JPG', base + '.jpeg', base + '.JPEG'];
    }

    function loadTexture(path) {
        if (textureCache.has(path)) {
            var cached = textureCache.get(path);
            textureCache.delete(path);
            textureCache.set(path, cached);
            return Promise.resolve(cached);
        }

        var candidates = imageCandidates(path);
        var index = 0;

        return new Promise(function (resolve, reject) {
            function tryNext() {
                if (index >= candidates.length) {
                    reject(new Error('Image introuvable: ' + path));
                    return;
                }

                var candidate = candidates[index];
                index += 1;

                textureLoader.load(
                    candidate,
                    function (texture) {
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        texture.generateMipmaps = false;
                        texture.encoding = THREE.sRGBEncoding;
                        texture.needsUpdate = true;
                        textureCache.set(path, texture);
                        if (candidate !== path) {
                            textureCache.set(candidate, texture);
                        }
                        evictLRUIfNeeded();
                        resolve(texture);
                    },
                    undefined,
                    tryNext
                );
            }

            tryNext();
        });
    }

    window.loadTourTexture = loadTexture;

    function preloadLinkedScenes(sceneId) {
        var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
        if (!sceneConfig) return;

        sceneConfig.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && window.TOUR_CONFIG.scenes[hotspot.target]) {
                loadTexture(window.TOUR_CONFIG.scenes[hotspot.target].image).catch(function () { });
            }
        });
    }

    function preloadAllScenes() {
        var allSceneIds = Object.keys(window.TOUR_CONFIG.scenes);
        allSceneIds.forEach(function (sceneId) {
            var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
            if (sceneConfig && sceneConfig.image) {
                loadTexture(sceneConfig.image).catch(function (err) {
                    console.warn('[Preload] Could not load ' + sceneConfig.image, err);
                });
            }
        });
        console.log('[Preload] All scene images loading started');
    }

    function createSphere() {
        var geo = new THREE.SphereGeometry(500, 60, 40);
        geo.scale(-1, 1, 1);
        var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: true });
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

    function loadScene(sceneId, loadOptions) {
        var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
        var options = typeof loadOptions === 'object' ? loadOptions : {
            keepTransitionActive: !!loadOptions
        };

        if (!sceneConfig) {
            return Promise.reject(new Error('Scène inconnue: ' + sceneId));
        }

        window.tourState.isTransitioning = true;
        if (!options.skipLoadingScreen) {
            showLoading(sceneConfig.name);
        }

        return loadTexture(sceneConfig.image).then(function (texture) {
            window.tourState.sphere.material.map = texture;
            window.tourState.sphere.material.needsUpdate = true;
            window.tourState.currentTexture = texture;
            window.tourState.currentScene = sceneId;

            var defaultLat = sceneConfig.defaultLat || 0;
            window.tourState.sphere.rotation.x = -defaultLat * Math.PI / 180;

            if (options.isInitialLoad && typeof sceneConfig.defaultBearing === 'number') {
                window.tourState.lon = ((sceneConfig.defaultBearing % 360) + 360) % 360;
            } else if (typeof options.initialLon === 'number') {
                window.tourState.lon = options.initialLon;
            }

            window.tourState.lat = typeof options.initialLat === 'number' ? options.initialLat : 0;
            window.tourState.fov = typeof options.initialFov === 'number' ? options.initialFov : 75;
            window.tourState.camera.fov = window.tourState.fov;
            window.tourState.camera.updateProjectionMatrix();
            window.tourState.activeFloorHotspot = null;
            window.tourState.mouseSphereLat = null;
            window.tourState.mouseSpherePoint = null;

            if (window.initHotspots) {
                window.initHotspots();
            }
            if (window.updateNavMenu) {
                window.updateNavMenu();
            }
            if (window.updateMinimap) {
                window.updateMinimap();
            }
            if (window.updateBackButton) {
                window.updateBackButton();
            }

            var announcer = document.getElementById('scene-announcer');
            if (announcer) {
                announcer.textContent = 'Vue : ' + sceneConfig.name;
            }

            preloadLinkedScenes(sceneId);
            if (!options.skipLoadingScreen) {
                setTimeout(hideLoading, 120);
            }
            if (!options.keepTransitionActive) {
                window.tourState.isTransitioning = false;
            }
            window.tourState.lastInteractionTime = Date.now();
            return true;
        }).catch(function (error) {
            document.getElementById('loading-text').textContent = error.message;
            console.error(error);
            throw error;
        });
    }

    function updateAutoRotation() {
        if (window.tourState.isXRActive) {
            window.tourState.autoRotating = false;
            return;
        }
        if (
            Date.now() - window.tourState.lastInteractionTime > 5000 &&
            !window.tourState.isTransitioning &&
            !window.tourState.isDragging
        ) {
            window.tourState.lon += 0.03;
            window.tourState.autoRotating = true;
        } else {
            window.tourState.autoRotating = false;
        }
    }

    function updateCameraLookAt() {
        if (window.tourState.isXRActive) {
            return;
        }

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

        if (frame && window.tourState.isXRActive) {
            if (window.pollXRGamepads) {
                window.pollXRGamepads();
            }
            if (window.updateXRLasers) {
                window.updateXRLasers();
            }
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

    // --------------------------------------------------------------
    //  XR SESSION MANAGEMENT
    // --------------------------------------------------------------
    function onXRSessionStart() {
        console.log('[XR] Session start event');

        window.tourState.isXRActive = true;
        document.body.classList.add('xr-active');

        if (window.updateVRButtonState) {
            window.updateVRButtonState(true);
        }

        if (window.showVRUI) {
            window.showVRUI();
        }

        if (window.clearXRControllers) {
            window.clearXRControllers();
        }

        if (window.setupXRControllers) {
            window.setupXRControllers();
        }
        if (window.ensureVRUIReady) {
            window.ensureVRUIReady();
        }
        console.log('[XR] Controller setup complete (immediate)');
    }

    function onXRSessionEnd() {
        console.log('[XR] Session end event');

        window.tourState.isXRActive = false;

        if (window.hideVRUI) {
            window.hideVRUI();
        }
        if (window.hideVRInfoPanel) {
            window.hideVRInfoPanel();
        }

        if (window.clearXRControllers) {
            window.clearXRControllers();
        }

        if (window.destroyVRUI) {
            window.destroyVRUI();
        }

        document.body.classList.remove('xr-active');

        if (window.updateVRButtonState) {
            window.updateVRButtonState(true);
        }

        // --- CRITICAL FIX: Reset renderer XR session to allow re-entry ---
        var renderer = window.tourState.renderer;
        if (renderer && renderer.xr) {
            // Clear the session reference so a new session can be started
            renderer.xr.setSession(null);
            console.log('[XR] Renderer session cleared');
        }

        window.tourState.camera.position.set(0, 0, 0.001);
        window.tourState.camera.quaternion.identity();

        console.log('[XR] Session end cleanup complete');
    }

    // --------------------------------------------------------------
    //  INIT
    // --------------------------------------------------------------
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
        renderer.xr.enabled = true;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.4;

        renderer.xr.addEventListener('sessionstart', onXRSessionStart);
        renderer.xr.addEventListener('sessionend', onXRSessionEnd);

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
        window.tourState.isXRActive = false;

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

        window.addEventListener('resize', onResize);

        var startParams = getStartParams();

        loadScene(startParams.scene, { isInitialLoad: true }).then(function () {
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
    window.onXRSessionStart = onXRSessionStart;
    window.onXRSessionEnd = onXRSessionEnd;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();