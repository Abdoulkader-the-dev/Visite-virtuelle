(function () {
    'use strict';

    var infoElements = [];

    // Les variables pour la navigation au sol (2D)
    var groundRaycaster = new THREE.Raycaster();
    var mouseNDC = new THREE.Vector2(0, 0);
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2); // y = -2
    var groundPoint = new THREE.Vector3();

    var groundHotspotEntry = null; // Pour la flèche au sol en 2D

    // Variables pour la navigation VR
    var vrArrowPosition = new THREE.Vector3(0, -1.6, -2); // Position de base
    var vrArrowHotspot = null;
    var vrArrowVisible = false;

    function currentHotspots() {
        return window.TOUR_CONFIG.scenes[window.tourState.currentScene].hotspots;
    }

    function transitionHotspots() {
        return currentHotspots().filter(function (h) { return h.type === 'transition'; });
    }

    function nearestTransitionHotspot(point) {
        var hotspots = transitionHotspots();
        var nearest = null;
        var nearestDistance = Infinity;
        hotspots.forEach(function (hotspot) {
            // On compare sur un plan 2D (x, z)
            var hPos = projectHotspotToGround(hotspot.position);
            var distance = hPos.distanceToSquared(point);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = hotspot;
            }
        });
        return nearest;
    }

    function projectHotspotToGround(position) {
        var p = new THREE.Vector3(position.x, position.y, position.z).normalize();
        var t = -window.VR_EYE_HEIGHT / p.y;
        return new THREE.Vector3(p.x * t, -window.VR_EYE_HEIGHT, p.z * t);
    }

    function createGroundHotspot() {
        // ... (Le code pour la flèche 2D reste largement inchangé)
        // Assurez-vous que groundHotspotEntry est bien initialisé.
        if (groundHotspotEntry) return;

        var ringGeo = new THREE.RingGeometry(0.2, 0.4, 64);
        ringGeo.rotateX(-Math.PI / 2);
        var ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        var hotspotMesh = new THREE.Mesh(ringGeo, ringMat);

        var arrowShape = new THREE.Shape().moveTo(0, 0.3).lineTo(0.2, 0).lineTo(0, 0.1).lineTo(-0.2, 0).closePath();
        var arrowGeo = new THREE.ShapeGeometry(arrowShape);
        arrowGeo.rotateX(-Math.PI / 2);
        var arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        var arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);

        groundHotspotEntry = {
            hotspot: null, ring: hotspotMesh, arrow: arrowMesh, opacity: 0
        };
        var group = new THREE.Group();
        group.add(hotspotMesh);
        group.add(arrowMesh);
        window.tourState.groundHotspotGroup = group;
        window.tourState.scene.add(group);
    }

    function initHotspots() {
        // Nettoyage
        if (window.tourState.hotspotGroup) window.tourState.scene.remove(window.tourState.hotspotGroup);
        if (window.tourState.groundHotspotGroup) window.tourState.scene.remove(window.tourState.groundHotspotGroup);
        infoElements.forEach(function (el) { el.element.remove(); });
        infoElements = [];

        window.tourState.hotspotGroup = new THREE.Group();

        currentHotspots().forEach(function (hotspot) {
            if (hotspot.type === 'info') {
                var el = document.createElement('button');
                el.className = 'info-hotspot';
                el.textContent = hotspot.icon || 'i';
                document.getElementById('info-hotspot-layer').appendChild(el);
                el.addEventListener('click', function (e) {
                    window.showInfoCard(hotspot, e.clientX, e.clientY);
                });
                infoElements.push({ hotspot: hotspot, element: el });
            }
        });

        createGroundHotspot();
        window.tourState.scene.add(window.tourState.hotspotGroup);
    }

    function moveGroundArrowWithJoystick(x, y) {
        if (!window.tourState.isXRActive) return;

        var camera = window.tourState.camera;
        var forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        var right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        var speed = 0.05;
        vrArrowPosition.addScaledVector(forward, -y * speed);
        vrArrowPosition.addScaledVector(right, x * speed);

        vrArrowVisible = true;
    }

    function updateHotspots() {
        var camera = window.tourState.camera;
        if (!camera) return;

        if (window.tourState.isXRActive) {
            // Logique VR
            if (vrArrowVisible && groundHotspotEntry) {
                vrArrowHotspot = nearestTransitionHotspot(vrArrowPosition);
                if (vrArrowHotspot) {
                    var targetPos = projectHotspotToGround(vrArrowHotspot.position);
                    var angle = Math.atan2(targetPos.x - vrArrowPosition.x, targetPos.z - vrArrowPosition.z);
                    groundHotspotEntry.ring.position.copy(vrArrowPosition);
                    groundHotspotEntry.arrow.position.copy(vrArrowPosition);
                    groundHotspotEntry.arrow.rotation.y = angle;
                    groundHotspotEntry.opacity = 0.85;
                } else {
                    groundHotspotEntry.opacity = 0;
                }
                groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
                groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
            }
        } else {
            // Logique 2D
            mouseNDC.set((window.tourState.lastMouseX / window.innerWidth) * 2 - 1, -(window.tourState.lastMouseY / window.innerHeight) * 2 + 1);
            groundRaycaster.setFromCamera(mouseNDC, camera);

            var targetOpacity = 0;
            if (window.tourState.mouseSphereLat < -10 && groundRaycaster.ray.intersectPlane(groundPlane, groundPoint)) {
                vrArrowHotspot = nearestTransitionHotspot(groundPoint);
                if (vrArrowHotspot) {
                    var targetPos2D = projectHotspotToGround(vrArrowHotspot.position);
                    var angle2D = Math.atan2(targetPos2D.x - groundPoint.x, targetPos2D.z - groundPoint.z);
                    groundHotspotEntry.ring.position.copy(groundPoint);
                    groundHotspotEntry.arrow.position.copy(groundPoint);
                    groundHotspotEntry.arrow.rotation.y = angle2D;
                    targetOpacity = 0.85;
                }
            }
            groundHotspotEntry.opacity = THREE.MathUtils.lerp(groundHotspotEntry.opacity, targetOpacity, 0.1);
            groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
            groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
        }

        // MàJ des hotspots d'info (pour la 2D)
        infoElements.forEach(function (entry) {
            var vec = entry.hotspot.positionVector.clone().project(camera);
            if (vec.z > 1) {
                entry.element.classList.remove('visible');
            } else {
                entry.element.style.left = ((vec.x + 1) / 2 * window.innerWidth) + 'px';
                entry.element.style.top = (-(vec.y - 1) / 2 * window.innerHeight) + 'px';
                entry.element.classList.add('visible');
            }
        });
    }

    function onValidClick(event) {
        if (vrArrowHotspot && !window.tourState.isXRActive) {
            window.startTransition(vrArrowHotspot.target, { hotspot: vrArrowHotspot });
        }
    }

    function handleXRSelect(controller) {
        if (!controller) return;

        // Bouton Exit VR
        if (window.vrExitButton) {
            var raycaster = new THREE.Raycaster();
            raycaster.setFromXRController(controller);
            var intersects = raycaster.intersectObject(window.vrExitButton);
            if (intersects.length > 0) {
                var session = window.tourState.renderer.xr.getSession();
                if (session) session.end();
                return;
            }
        }

        // Hotspot de transition
        if (vrArrowHotspot) {
            window.startTransition(vrArrowHotspot.target, { hotspot: vrArrowHotspot });
            return;
        }

        // Hotspots d'info
        var infoRaycaster = new THREE.Raycaster();
        infoRaycaster.setFromXRController(controller);
        var infoHotspotMeshes = window.tourState.hotspotGroup.children.filter(c => c.userData.hotspot && c.userData.hotspot.type === 'info');
        var infoIntersects = infoRaycaster.intersectObjects(infoHotspotMeshes);
        if (infoIntersects.length > 0) {
            var intersected = infoIntersects[0];
            var hotspot = intersected.object.userData.hotspot;
            if (hotspot && window.showVRInfoPanel) {
                window.showVRInfoPanel(hotspot, intersected.point);
            }
        }
    }

    // Expositions
    window.initHotspots = initHotspots;
    window.updateHotspots = updateHotspots;
    window.onValidClick = onValidClick;
    window.handleXRSelect = handleXRSelect;
    window.moveGroundArrowWithJoystick = moveGroundArrowWithJoystick;

})();
