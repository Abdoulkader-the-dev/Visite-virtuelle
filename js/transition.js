(function () {
    'use strict';

    function easeIn(t) {
        return t * t;
    }

    function easeOut(t) {
        return t * (2 - t);
    }

    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function animateFov(startFov, endFov, duration, easing) {
        return new Promise(function (resolve) {
            var start = performance.now();

            function frame(now) {
                var progress = Math.min(1, (now - start) / duration);
                window.tourState.fov = startFov + (endFov - startFov) * easing(progress);
                if (window.updateZoomLevel) {
                    window.updateZoomLevel();
                }
                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function normalizeDegrees(degrees) {
        return ((degrees % 360) + 360) % 360;
    }

    function shortestAngleDelta(fromDeg, toDeg) {
        return ((toDeg - fromDeg + 540) % 360) - 180;
    }

    function angleForPosition(position) {
        return Math.atan2(position.z, position.x) * (180 / Math.PI);
    }

    function bearingForPosition(position) {
        var bearing = Math.atan2(position.x, -position.z) * 180 / Math.PI;
        return bearing < 0 ? bearing + 360 : bearing;
    }

    function bearingForHotspot(hotspot) {
        if (hotspot && typeof hotspot.bearing === 'number') {
            return hotspot.bearing;
        }
        return hotspot && hotspot.position ? bearingForPosition(hotspot.position) : window.tourState.lon;
    }

    function findTransitionHotspot(sceneId, targetSceneId) {
        var scene = window.TOUR_CONFIG.scenes[sceneId];
        var match = null;

        if (!scene || !scene.hotspots) {
            return null;
        }

        scene.hotspots.some(function (hotspot) {
            if (hotspot.type === 'transition' && hotspot.target === targetSceneId) {
                match = hotspot;
                return true;
            }
            return false;
        });

        return match;
    }

    function arrivalLonForTransition(fromSceneId, targetSceneId) {
        var reverseHotspot = findTransitionHotspot(targetSceneId, fromSceneId);

        if (!reverseHotspot) {
            return null;
        }

        return normalizeDegrees(angleForPosition(reverseHotspot.position) + 180);
    }

    function updateHotspotBearing(fromSceneId, toSceneId, newBearing) {
        var scene = window.TOUR_CONFIG.scenes[fromSceneId];
        if (!scene || !scene.hotspots) { return false; }

        var found = false;
        scene.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && hotspot.target === toSceneId) {
                hotspot.bearing = newBearing;
                found = true;
            }
        });
        return found;
    }

    function getReverseHotspotBearing(targetSceneId, sourceSceneId) {
        var targetScene = window.TOUR_CONFIG.scenes[targetSceneId];
        if (!targetScene || !targetScene.hotspots) { return null; }

        var reverseBearing = null;
        targetScene.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && hotspot.target === sourceSceneId) {
                if (typeof hotspot.bearing === 'number') {
                    reverseBearing = hotspot.bearing;
                } else {
                    reverseBearing = Math.atan2(hotspot.position.x, -hotspot.position.z) * 180 / Math.PI;
                    if (reverseBearing < 0) { reverseBearing += 360; }
                }
            }
        });
        return reverseBearing;
    }

    function animateLon(targetLon, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var startLon = window.tourState.lon;
            var delta = shortestAngleDelta(startLon, targetLon);

            function frame(now) {
                var progress = Math.min(1, (now - start) / duration);
                var eased = progress * (2 - progress);
                window.tourState.lon = startLon + delta * eased;

                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    window.tourState.lon = targetLon;
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function animateLatTransition(targetLat, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var startLat = window.tourState.lat;
            var delta = targetLat - startLat;

            function frame(now) {
                var progress = Math.min(1, (now - start) / duration);
                var eased = progress * (2 - progress);
                window.tourState.lat = startLat + delta * eased;

                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    window.tourState.lat = targetLat;
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function fadeOverlay(visible) {
        return new Promise(function (resolve) {
            var overlay = document.getElementById('transition-overlay');
            overlay.classList.toggle('visible', visible);
            setTimeout(resolve, 250);
        });
    }

    function animateBlur(fromPx, toPx, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var canvas = document.getElementById('tour-canvas');

            if (!canvas) {
                resolve();
                return;
            }

            function frame(now) {
                var t = Math.min(1, (now - start) / duration);
                var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                var blur = fromPx + (toPx - fromPx) * eased;
                canvas.style.filter = 'blur(' + blur.toFixed(1) + 'px)';

                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function pushHistory(options) {
        var opts = options || {};

        if (!opts.isBack && window.tourState.currentScene) {
            window.tourState.history.push(window.tourState.currentScene);
            if (window.tourState.history.length > 50) {
                window.tourState.history.shift();
            }
        }

        if (window.updateBackButton) {
            window.updateBackButton();
        }
    }

    function loadTextureAsync(url) {
        if (window.loadTourTexture) {
            return window.loadTourTexture(url);
        }

        return new Promise(function (resolve) {
            new THREE.TextureLoader().load(url, function (texture) {
                if (THREE.SRGBColorSpace) {
                    texture.colorSpace = THREE.SRGBColorSpace;
                }
                if (THREE.sRGBEncoding) {
                    texture.encoding = THREE.sRGBEncoding;
                }
                resolve(texture);
            });
        });
    }

    function updateSceneUi() {
        var sceneConfig = window.TOUR_CONFIG.scenes[window.tourState.currentScene];
        var announcer = document.getElementById('scene-announcer');

        if (window.rebuildHotspots) {
            window.rebuildHotspots();
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
        if (announcer && sceneConfig) {
            announcer.textContent = 'Vue : ' + sceneConfig.name;
        }
    }

    // ========================================================================
    // triggerGSVTransition() – instant blink
    // ========================================================================

    function triggerGSVTransition(targetSceneId, bearing, options) {

        if (window.tourState.isTransitioning) { return; }
        if (targetSceneId === window.tourState.currentScene) { return; }
        var sceneConfig = window.TOUR_CONFIG.scenes[targetSceneId];
        if (!sceneConfig) { return; }

        var camera = window.tourState.camera;
        var scene = window.tourState.scene;
        var oldSphere = window.tourState.sphere;

        var clickedHotspot = (options && options.hotspot) || null;

        // Si aucun hotspot n'est fourni, on ne peut pas déterminer la direction d'arrivée
        if (!clickedHotspot) {
            console.warn('[Transition] No hotspot provided, cannot determine arrival direction. Cancelling transition.');
            window.tourState.isTransitioning = false;
            window.tourState.controlsEnabled = true;
            return;
        }

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;
        if (window.hideInfoCard) { window.hideInfoCard(); }

        // Determine arrival lon/lat from hotspot (or fallback)
        var arrivalTargetLon, arrivalTargetLat;
        if (clickedHotspot && typeof clickedHotspot.arrivalLon === 'number') {
            arrivalTargetLon = normalizeDegrees(clickedHotspot.arrivalLon);
        } else {
            // fallback: opposite direction of the clicked hotspot
            var movementAngle = Math.atan2(clickedHotspot.position.x, -clickedHotspot.position.z) * (180 / Math.PI);
            arrivalTargetLon = normalizeDegrees(movementAngle + 180);
        }
        arrivalTargetLat = (clickedHotspot && typeof clickedHotspot.arrivalLat === 'number')
            ? clickedHotspot.arrivalLat
            : 0;

        var overlay = document.getElementById('transition-overlay');

        // 1. Fade to black (0.15s)
        overlay.style.transition = 'opacity 0.15s ease';
        overlay.style.opacity = '1';

        // 2. Start loading the new texture
        var texturePromise = loadTextureAsync(sceneConfig.image);

        // 3. After fade-out, wait for texture, then switch instantly
        var switched = false;
        var switchOnce = function (tex) {
            if (switched) return;
            switched = true;

            // --- Swap spheres ---
            var newSphere = window.createSphere();
            newSphere.material.map = tex;
            newSphere.material.needsUpdate = true;
            newSphere.material.transparent = false;
            newSphere.material.depthWrite = true;
            // Apply defaultLat rotation
            var defaultLat = sceneConfig.defaultLat || 0;
            newSphere.rotation.x = -defaultLat * Math.PI / 180;

            scene.add(newSphere);
            if (oldSphere) {
                scene.remove(oldSphere);
                oldSphere.geometry.dispose();
                oldSphere.material.dispose();
            }
            window.tourState.sphere = newSphere;
            window.tourState.currentTexture = tex;

            // --- Apply lon/lat ---
            window.tourState.lon = arrivalTargetLon;
            window.tourState.lat = arrivalTargetLat;
            camera.position.set(0, 0, 0.001);
            window.tourState.fov = 75;
            camera.fov = 75;
            camera.updateProjectionMatrix();

            // --- Update scene metadata ---
            var previousSceneId = window.tourState.currentScene;
            window.tourState.currentScene = targetSceneId;

            // Update reverse hotspot bearing (optional)
            var reverseBearing = getReverseHotspotBearing(targetSceneId, previousSceneId);
            if (reverseBearing !== null) {
                updateHotspotBearing(previousSceneId, targetSceneId, reverseBearing);
            }

            // Rebuild UI
            updateSceneUi();

            // --- Fade back in (0.15s) ---
            overlay.style.transition = 'opacity 0.15s ease';
            overlay.style.opacity = '0';

            // === CRITICAL: reset transition state ===
            window.tourState.isTransitioning = false;
            window.tourState.controlsEnabled = true;
            window.tourState.lastInteractionTime = Date.now();
        };

        // Wait for fade-out to complete (150ms), then try to switch
        setTimeout(function () {
            texturePromise.then(function (tex) {
                switchOnce(tex);
            }).catch(function (err) {
                console.error('[Transition] Texture load failed:', err);
                // Still get out of black
                if (!switched) {
                    switched = true;
                    overlay.style.opacity = '0';
                    window.tourState.isTransitioning = false;
                    window.tourState.controlsEnabled = true;
                }
            });
        }, 150);
    }

    function startTransition(targetSceneId, options) {
        var opts = options || {};
        var hotspot = opts.hotspot
            ? opts.hotspot
            : findTransitionHotspot(window.tourState.currentScene, targetSceneId);
        opts.hotspot = hotspot;
        triggerGSVTransition(targetSceneId, bearingForHotspot(hotspot), opts);
    }

    window.triggerGSVTransition = triggerGSVTransition;
    window.startTransition = startTransition;
    window.animateTourFov = animateFov;
    window.animateTourBlur = animateBlur;
})();