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
        if (window.tourState.isTransitioning || targetSceneId === window.tourState.currentScene) {
            return;
        }
        if (!window.TOUR_CONFIG.scenes[targetSceneId]) {
            return;
        }

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;

        if (window.hideInfoCard) {
            window.hideInfoCard();
        }
        if (window.hideFloorHotspot) {
            window.hideFloorHotspot();
        }

        animateFov(window.tourState.fov, 35, 600, easeIn)
            .then(function () {
                return animateBlur(0, 8, 350);
            })
            .then(function () {
                return fadeOverlay(true);
            })
            .then(function () {
                return window.loadScene(targetSceneId, true);
            })
            .then(function () {
                return fadeOverlay(false);
            })
            .then(function () {
                return animateBlur(8, 0, 350);
            })
            .then(function () {
                return animateFov(35, 75, 500, easeOut);
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
