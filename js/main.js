(function () {
    'use strict';

    var textureLoader;
    var textureCache = {};

    function vectorFromConfig(position) {
        return new THREE.Vector3(position.x, position.y, position.z);
    }

    function normalizeConfigPositions() {
        Object.keys(window.TOUR_CONFIG.scenes).forEach(function (sceneId) {
            window.TOUR_CONFIG.scenes[sceneId].hotspots.forEach(function (hotspot) {
                if (!hotspot.positionVector) {
                    hotspot.positionVector = vectorFromConfig(hotspot.position);
                }
            });
        });
    }

    function imageCandidates(path) {
        var base = path.replace(/\.(jpg|jpeg)$/i, '');
        return [base + '.jpg', base + '.JPG', base + '.jpeg', base + '.JPEG'];
    }

    function loadTexture(path) {
        if (textureCache[path]) {
            return Promise.resolve(textureCache[path]);
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
                        // encoding doit correspondre à renderer.outputEncoding = sRGBEncoding
                        texture.encoding = THREE.sRGBEncoding;
                        textureCache[path] = texture;
                        textureCache[candidate] = texture;
                        resolve(texture);
                    },
                    undefined,
                    tryNext
                );
            }

            tryNext();
        });
    }

    function preloadLinkedScenes(sceneId) {
        var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
        if (!sceneConfig) {
            return;
        }

        sceneConfig.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && window.TOUR_CONFIG.scenes[hotspot.target]) {
                loadTexture(window.TOUR_CONFIG.scenes[hotspot.target].image).catch(function () {});
            }
        });
    }

    function preloadAllScenes() {
        var allIds = Object.keys(window.TOUR_CONFIG.scenes);
        var currentId = window.tourState.currentScene;
        var currentConfig = window.TOUR_CONFIG.scenes[currentId];
        var linkedIds = [];
        var remainingIds;

        if (currentConfig) {
            linkedIds = (currentConfig.hotspots || [])
                .filter(function (hotspot) {
                    return hotspot.type === 'transition';
                })
                .map(function (hotspot) {
                    return hotspot.target;
                });
        }

        remainingIds = allIds.filter(function (id) {
            return id !== currentId && linkedIds.indexOf(id) === -1;
        });

        function loadNext(ids, index) {
            var idle;

            if (index >= ids.length) {
                return;
            }

            idle = function () {
                loadTexture(window.TOUR_CONFIG.scenes[ids[index]].image)
                    .catch(function () {})
                    .then(function () {
                        loadNext(ids, index + 1);
                    });
            };

            if (window.requestIdleCallback) {
                window.requestIdleCallback(idle, { timeout: 3000 });
            } else {
                setTimeout(idle, 200 * index);
            }
        }

        loadNext(remainingIds, 0);
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
        showLoading(sceneConfig.name);

        return loadTexture(sceneConfig.image).then(function (texture) {
            window.tourState.sphere.material.map = texture;
            window.tourState.sphere.material.needsUpdate = true;
            window.tourState.currentTexture = texture;
            window.tourState.currentScene = sceneId;
            window.tourState.lon = typeof options.initialLon === 'number' ? options.initialLon : 0;
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
            setTimeout(hideLoading, 120);
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
        if (window.tourState.isXRActive) return;

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

    function setupXRControllers() {
        var renderer = window.tourState.renderer;
        var scene = window.tourState.scene;

        for (var i = 0; i < 2; i += 1) {
            var controller = renderer.xr.getController(i);
            var geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -4)
            ]);
            var material = new THREE.LineBasicMaterial({ color: 0x3B82F6 });
            var line = new THREE.Line(geometry, material);
            line.name = 'controller-ray';
            line.scale.z = 1;
            controller.add(line);
            controller.addEventListener('select', function (event) {
                if (window.handleXRSelect) {
                    window.handleXRSelect(event.target);
                }
            });
            scene.add(controller);
            window.tourState.xrControllers.push(controller);
        }

        renderer.xr.addEventListener('sessionstart', function () {
            window.tourState.isXRActive = true;
            document.body.classList.add('xr-active');
            document.getElementById('reticle').classList.add('active');
        });

        renderer.xr.addEventListener('sessionend', function () {
            window.tourState.isXRActive = false;
            document.body.classList.remove('xr-active');
            document.getElementById('reticle').classList.remove('active');
            document.getElementById('reticle-progress').classList.remove('active');
            if (window.hideVRInfoPanel) {
                window.hideVRInfoPanel();
            }
        });
    }

    function renderFrame() {
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
        if (window.updateXRGaze) {
            window.updateXRGaze();
        }
        if (window.updateVRInfoPanelFrame) {
            window.updateVRInfoPanelFrame();
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

        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.xr.enabled = true;
        // Correction luminosité — les photos prises en intérieur apparaissent
        // sombres sans ces deux paramètres. outputEncoding sRGB = couleurs fidèles.
        // toneMapping LinearToneMapping + exposure = contrôle de la luminosité globale.
        // Pour ajuster : changer renderer.toneMappingExposure (1.0 = neutre, >1 = plus clair)
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.4;

        var geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);
        var material = new THREE.MeshBasicMaterial({ map: null, side: THREE.DoubleSide });
        var sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');

        window.tourState.camera = camera;
        window.tourState.renderer = renderer;
        window.tourState.scene = scene;
        window.tourState.sphere = sphere;

        if (window.initControls) {
            window.initControls();
        }
        if (window.initUI) {
            window.initUI();
        }

        setupXRControllers();
        window.addEventListener('resize', onResize);

        var startParams = getStartParams();

        loadScene(startParams.scene).then(function () {
            window.tourState.lon = startParams.lon;
            window.tourState.lat = startParams.lat;
            preloadAllScenes();
        });
        renderer.setAnimationLoop(renderFrame);
    }

    window.loadScene = loadScene;
    window.preloadAllScenes = preloadAllScenes;
    window.updateCameraLookAt = updateCameraLookAt;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
