(function () {
    'use strict';

    var raycaster = new THREE.Raycaster();
    var lastMouseX = 0;
    var lastMouseY = 0;
    var lastTouchDistance = 0;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function stopAutoRotation() {
        window.tourState.lastInteractionTime = Date.now();
        window.tourState.autoRotating = false;
    }

    function getTouchDistance(touchA, touchB) {
        var dx = touchA.clientX - touchB.clientX;
        var dy = touchA.clientY - touchB.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function beginPointer(clientX, clientY) {
        if (!window.tourState.controlsEnabled || window.tourState.isTransitioning) {
            return;
        }

        window.tourState.mouseDownX = clientX;
        window.tourState.mouseDownY = clientY;
        window.tourState.mouseDelta = 0;
        window.tourState.isDragging = true;
        lastMouseX = clientX;
        lastMouseY = clientY;
        window.tourState.lastMouseX = clientX;
        window.tourState.lastMouseY = clientY;
        stopAutoRotation();
        document.body.classList.add('dragging');
    }

    function movePointer(clientX, clientY) {
        if (window.tourState.isDragging && window.tourState.controlsEnabled && !window.tourState.isTransitioning) {
            var dx = clientX - lastMouseX;
            var dy = clientY - lastMouseY;
            window.tourState.lon -= dx * 0.18;
            window.tourState.lat += dy * 0.12;
            window.tourState.lat = clamp(window.tourState.lat, -85, 85);
            window.tourState.mouseDelta += Math.sqrt(dx * dx + dy * dy);
            stopAutoRotation();
        }

        lastMouseX = clientX;
        lastMouseY = clientY;
        window.tourState.lastMouseX = clientX;
        window.tourState.lastMouseY = clientY;
    }

    function endPointer(event) {
        if (!window.tourState.isDragging) {
            return;
        }

        window.tourState.isDragging = false;
        document.body.classList.remove('dragging');
        stopAutoRotation();

        if (window.tourState.mouseDelta < 5 && window.onValidClick) {
            window.onValidClick(event);
        }
    }

    function setFov(value) {
        window.tourState.fov = clamp(value, 40, 100);
        if (window.updateZoomLevel) {
            window.updateZoomLevel();
        }
    }

    function trackMouseOnSphere(event) {
        if (!window.tourState.camera || !window.tourState.sphere) {
            return;
        }

        var ndc = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

        raycaster.setFromCamera(ndc, window.tourState.camera);
        var intersections = raycaster.intersectObject(window.tourState.sphere);

        if (intersections.length) {
            var point = intersections[0].point.clone();
            var lat = Math.asin(point.y / 500) * 180 / Math.PI;
            window.tourState.mouseSphereLat = lat;
            window.tourState.mouseSpherePoint = point;

            if (window.updateFloorHotspot) {
                window.updateFloorHotspot(event.clientX, event.clientY, lat);
            }
        }
    }

    function initControls() {
        var dom = window.tourState.renderer.domElement;

        dom.addEventListener('mousedown', function (event) {
            beginPointer(event.clientX, event.clientY);
            trackMouseOnSphere(event);
        });

        window.addEventListener('mousemove', function (event) {
            movePointer(event.clientX, event.clientY);
            trackMouseOnSphere(event);
        });

        window.addEventListener('mouseup', endPointer);

        dom.addEventListener('wheel', function (event) {
            event.preventDefault();
            if (!window.tourState.controlsEnabled || window.tourState.isTransitioning) {
                return;
            }
            stopAutoRotation();
            setFov(window.tourState.fov + event.deltaY * 0.05);
        }, { passive: false });

        dom.addEventListener('touchstart', function (event) {
            if (!window.tourState.controlsEnabled || window.tourState.isTransitioning) {
                return;
            }

            if (event.touches.length === 1) {
                beginPointer(event.touches[0].clientX, event.touches[0].clientY);
                trackMouseOnSphere(event.touches[0]);
            } else if (event.touches.length === 2) {
                window.tourState.isDragging = false;
                lastTouchDistance = getTouchDistance(event.touches[0], event.touches[1]);
                stopAutoRotation();
            }
        }, { passive: false });

        dom.addEventListener('touchmove', function (event) {
            if (!window.tourState.controlsEnabled || window.tourState.isTransitioning) {
                return;
            }

            event.preventDefault();

            if (event.touches.length === 1) {
                movePointer(event.touches[0].clientX, event.touches[0].clientY);
                trackMouseOnSphere(event.touches[0]);
            } else if (event.touches.length === 2) {
                var distance = getTouchDistance(event.touches[0], event.touches[1]);
                var delta = distance - lastTouchDistance;
                lastTouchDistance = distance;
                stopAutoRotation();
                setFov(window.tourState.fov - delta * 0.08);
            }
        }, { passive: false });

        dom.addEventListener('touchend', function (event) {
            if (event.touches.length === 0) {
                endPointer(event.changedTouches[0]);
            }
        });

        window.addEventListener('keydown', function (event) {
            var tag = document.activeElement && document.activeElement.tagName;
            var key = event.key;
            var num;

            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                return;
            }

            if (key === 'Escape') {
                if (window.hideInfoCard) {
                    window.hideInfoCard();
                }
                return;
            }

            if (window.tourState.isTransitioning) {
                return;
            }

            if (event.altKey && key === 'ArrowLeft') {
                if (window.goBack) {
                    window.goBack();
                }
                event.preventDefault();
                return;
            }

            switch (key) {
                case 'ArrowLeft':
                    window.tourState.lon -= 3;
                    stopAutoRotation();
                    event.preventDefault();
                    break;
                case 'ArrowRight':
                    window.tourState.lon += 3;
                    stopAutoRotation();
                    event.preventDefault();
                    break;
                case 'ArrowUp':
                    window.tourState.lat = Math.min(85, window.tourState.lat + 2);
                    stopAutoRotation();
                    event.preventDefault();
                    break;
                case 'ArrowDown':
                    window.tourState.lat = Math.max(-85, window.tourState.lat - 2);
                    stopAutoRotation();
                    event.preventDefault();
                    break;
                case '+':
                case '=':
                    setFov(window.tourState.fov - 2);
                    event.preventDefault();
                    break;
                case '-':
                    setFov(window.tourState.fov + 2);
                    event.preventDefault();
                    break;
                case 'f':
                case 'F':
                    if (window.toggleFullscreen) {
                        window.toggleFullscreen();
                    }
                    event.preventDefault();
                    break;
                case 'Backspace':
                    if (window.goBack) {
                        window.goBack();
                    }
                    event.preventDefault();
                    break;
                default:
                    num = parseInt(key, 10);
                    if (!isNaN(num) && num >= 1 && num <= 9 && window.TOUR_CONFIG.scenes[String(num)]) {
                        window.startTransition(String(num));
                        event.preventDefault();
                    }
            }
        });
    }

    window.initControls = initControls;
    window.trackMouseOnSphere = trackMouseOnSphere;
    window.setTourFov = setFov;
    window.stopAutoRotation = stopAutoRotation;
})();
