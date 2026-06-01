(function () {
    'use strict';

    function easeIn(t) {
        return t * t;
    }

    function easeOut(t) {
        return t * (2 - t);
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

    function animateTranslationAndCrossfade(targetTexture, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var sphere1 = window.tourState.sphere;
            var sphere2 = window.tourState.sphere2;
            var camera = window.tourState.camera;
            
            sphere2.material.map = targetTexture;
            sphere2.material.needsUpdate = true;
            sphere2.material.opacity = 0;
            sphere2.visible = true;

            // Compute forward direction
            var phi = (90 - window.tourState.lat) * Math.PI / 180;
            var theta = window.tourState.lon * Math.PI / 180;
            var targetDir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();

            function frame(now) {
                var t = Math.min(1, (now - start) / duration);
                var easeInOut = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                var easeIn = t * t * t; // Cubic ease in for strong translation effect
                
                // Crossfade
                sphere2.material.opacity = easeInOut;
                
                // Camera translation (move up to 350 units forward out of 500 radius)
                // This causes the natural radial stretch effect at the edges
                var distance = easeIn * 350;
                camera.position.copy(targetDir).multiplyScalar(distance);

                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function startTransition(targetSceneId, options) {
        var sourceSceneId = window.tourState.currentScene;
        var sourceHotspot;
        var sourceLon;
        var targetLon;
        var sceneConfig = window.TOUR_CONFIG.scenes[targetSceneId];

        if (window.tourState.isTransitioning || targetSceneId === window.tourState.currentScene) {
            return;
        }
        if (!sceneConfig) {
            return;
        }

        sourceHotspot = options && options.hotspot ? options.hotspot : findTransitionHotspot(sourceSceneId, targetSceneId);
        sourceLon = sourceHotspot ? angleForPosition(sourceHotspot.position) : window.tourState.lon;
        targetLon = arrivalLonForTransition(sourceSceneId, targetSceneId);

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;

        if (window.hideInfoCard) {
            window.hideInfoCard();
        }
        if (window.hideFloorHotspot) {
            window.hideFloorHotspot();
        }

        // 1. Align camera to hotspot
        animateLon(sourceLon, 250)
            .then(function () {
                // 2. Load next scene texture in background
                return window.loadTourTexture(sceneConfig.image);
            })
            .then(function (targetTexture) {
                // 3. Perform 3D translation & crossfade
                return animateTranslationAndCrossfade(targetTexture, 650);
            })
            .then(function () {
                // 4. Reset camera position and setup new scene natively
                window.tourState.camera.position.set(0, 0, 0);
                window.tourState.sphere2.visible = false;
                window.tourState.sphere2.material.opacity = 0;
                
                return window.loadScene(targetSceneId, {
                    keepTransitionActive: true,
                    skipLoadingScreen: true,
                    initialLon: targetLon === null ? sourceLon : targetLon,
                    initialLat: 0,
                    initialFov: 75
                });
            })
            .then(function () {
                window.tourState.isTransitioning = false;
                window.tourState.controlsEnabled = true;
                window.tourState.lastInteractionTime = Date.now();
            })
            .catch(function (error) {
                console.error(error);
                window.tourState.isTransitioning = false;
                window.tourState.controlsEnabled = true;
                if (window.tourState.camera) window.tourState.camera.position.set(0, 0, 0);
                if (window.tourState.sphere2) window.tourState.sphere2.visible = false;
            });
    }

    window.startTransition = startTransition;
    window.animateTourFov = animateFov;
    window.animateTourBlur = animateBlur;
})();
