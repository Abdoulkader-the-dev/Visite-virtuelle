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

    function startTransition(targetSceneId, options) {
        var sourceSceneId = window.tourState.currentScene;
        var sourceHotspot;
        var sourceLon;
        var targetLon;

        if (window.tourState.isTransitioning || targetSceneId === window.tourState.currentScene) {
            return;
        }
        if (!window.TOUR_CONFIG.scenes[targetSceneId]) {
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

        animateLon(sourceLon, 360)
            .then(function () {
                return animateFov(window.tourState.fov, 38, 420, easeIn);
            })
            .then(function () {
                return animateBlur(0, 4, 180);
            })
            .then(function () {
                return fadeOverlay(true);
            })
            .then(function () {
                return window.loadScene(targetSceneId, {
                    keepTransitionActive: true,
                    initialLon: targetLon === null ? sourceLon : targetLon,
                    initialLat: 0,
                    initialFov: 38
                });
            })
            .then(function () {
                return fadeOverlay(false);
            })
            .then(function () {
                return animateBlur(4, 0, 220);
            })
            .then(function () {
                return animateFov(38, 75, 520, easeOut);
            })
            .then(function () {
                window.tourState.fov = 75;
                window.tourState.isTransitioning = false;
                window.tourState.controlsEnabled = true;
                window.tourState.lastInteractionTime = Date.now();
            })
            .catch(function (error) {
                console.error(error);
                window.tourState.isTransitioning = false;
                window.tourState.controlsEnabled = true;
                var canvas = document.getElementById('tour-canvas');
                if (canvas) {
                    canvas.style.filter = 'blur(0)';
                }
                fadeOverlay(false);
            });
    }

    window.startTransition = startTransition;
    window.animateTourFov = animateFov;
    window.animateTourBlur = animateBlur;
})();
