(function () {
    'use strict';

    var infoElements = [];
    var groundRaycaster = new THREE.Raycaster();
    var mouseNDC = new THREE.Vector2(0, 0);
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), window.VR_EYE_HEIGHT || 1.6);
    var groundPoint = new THREE.Vector3();

    var groundHotspotEntry = null;
    var activeHotspot = null;

    function currentHotspots() {
        if (!window.tourState || !window.tourState.currentScene || !window.TOUR_CONFIG.scenes[window.tourState.currentScene]) {
            return [];
        }
        return window.TOUR_CONFIG.scenes[window.tourState.currentScene].hotspots || [];
    }

    function transitionHotspots() {
        return currentHotspots().filter(h => h.type === 'transition');
    }

    function projectToGround(position) {
        var p = position.clone().normalize();
        var eyeHeight = window.VR_EYE_HEIGHT || 1.6;
        if (p.y >= 0) return new THREE.Vector3(p.x, -eyeHeight, p.z); // Evite division par zero
        var t = -eyeHeight / p.y;
        return new THREE.Vector3(p.x * t, -eyeHeight, p.z * t);
    }

    function nearestTransitionHotspot(point) {
        var nearest = null;
        var nearestDistance = Infinity;
        transitionHotspots().forEach(function (hotspot) {
            var hPos = projectToGround(hotspot.positionVector);
            var distance = hPos.distanceToSquared(point);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = hotspot;
            }
        });
        return nearest;
    }

    function createGroundHotspot() {
        if (groundHotspotEntry) return;

        var group = new THREE.Group();
        group.name = "GroundHotspot";

        var ringGeo = new THREE.RingGeometry(0.25, 0.4, 64);
        ringGeo.rotateX(-Math.PI / 2);
        var ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
        var ring = new THREE.Mesh(ringGeo, ringMat);
        group.add(ring);

        // Correction Définitive pour la création de la flèche
        var arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.3);
        arrowShape.lineTo(0.2, 0);
        arrowShape.lineTo(0, 0.1);
        arrowShape.lineTo(-0.2, 0);
        arrowShape.closePath();

        var arrowGeo = new THREE.ShapeGeometry(arrowShape);
        arrowGeo.rotateX(-Math.PI / 2);
        var arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
        var arrow = new THREE.Mesh(arrowGeo, arrowMat);
        group.add(arrow);

        groundHotspotEntry = { ring: ring, arrow: arrow, group: group, opacity: 0 };
        window.tourState.groundHotspotGroup = group;
        window.tourState.scene.add(group);
    }

    function initHotspots() {
        if (!window.tourState.scene) return;

        if (window.tourState.hotspotGroup) window.tourState.scene.remove(window.tourState.hotspotGroup);
        if (window.tourState.groundHotspotGroup) window.tourState.scene.remove(window.tourState.groundHotspotGroup);

        infoElements.forEach(el => el.element.remove());
        infoElements = [];
        groundHotspotEntry = null;
        activeHotspot = null;

        window.tourState.hotspotGroup = new THREE.Group();

        currentHotspots().forEach(function (hotspot) {
            if (hotspot.type === 'info') {
                var el = document.createElement('button');
                el.className = 'info-hotspot';
                el.textContent = hotspot.icon || 'i';
                document.getElementById('info-hotspot-layer').appendChild(el);
                el.addEventListener('click', e => window.showInfoCard(hotspot, e.clientX, e.clientY));
                infoElements.push({ hotspot: hotspot, element: el });

                var spriteMat = new THREE.SpriteMaterial({ color: 0x3B82F6, transparent: true, opacity: 0.5, depthWrite: false });
                var sprite = new THREE.Sprite(spriteMat);
                sprite.position.copy(hotspot.positionVector);
                sprite.scale.set(20, 20, 1);
                sprite.userData.hotspot = hotspot;
                window.tourState.hotspotGroup.add(sprite);
            }
        });

        if (transitionHotspots().length > 0) {
            createGroundHotspot();
        }
        window.tourState.scene.add(window.tourState.hotspotGroup);
    }

    function moveGroundArrowWithJoystick(x, y) {
        if (!window.tourState.isXRActive || !groundHotspotEntry) return;
        var camera = window.tourState.camera;
        var forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        var right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        groundHotspotEntry.group.position.addScaledVector(forward, -y * 0.05);
        groundHotspotEntry.group.position.addScaledVector(right, x * 0.05);

        groundHotspotEntry.group.position.y = -(window.VR_EYE_HEIGHT || 1.6);
    }

    function updateHotspots() {
        var camera = window.tourState.camera;
        if (!camera || !groundHotspotEntry && infoElements.length === 0) return; // Correction de la race condition

        var targetOpacity = 0;
        var newActiveHotspot = null;

        if (groundHotspotEntry) { // S'assurer que l'objet existe
            if (window.tourState.isXRActive) {
                newActiveHotspot = nearestTransitionHotspot(groundHotspotEntry.group.position);
                if (newActiveHotspot) {
                    var targetPos = projectToGround(newActiveHotspot.positionVector);
                    var angle = Math.atan2(targetPos.x - groundHotspotEntry.group.position.x, targetPos.z - groundHotspotEntry.group.position.z);
                    groundHotspotEntry.arrow.rotation.y = angle;
                    targetOpacity = 0.85;
                }
            } else { // Mode 2D
                mouseNDC.set((window.tourState.lastMouseX / window.innerWidth) * 2 - 1, -(window.tourState.lastMouseY / window.innerHeight) * 2 + 1);
                groundRaycaster.setFromCamera(mouseNDC, camera);
                if (window.tourState.mouseSphereLat < -10 && groundRaycaster.ray.intersectPlane(groundPlane, groundPoint)) {
                    groundHotspotEntry.group.position.copy(groundPoint);
                    newActiveHotspot = nearestTransitionHotspot(groundPoint);
                    if (newActiveHotspot) {
                        var targetPos2D = projectToGround(newActiveHotspot.positionVector);
                        var angle2D = Math.atan2(targetPos2D.x - groundPoint.x, targetPos2D.z - groundPoint.z);
                        groundHotspotEntry.arrow.rotation.y = angle2D;
                        targetOpacity = 0.85;
                    }
                }
            }
            activeHotspot = newActiveHotspot;
            groundHotspotEntry.opacity = THREE.MathUtils.lerp(groundHotspotEntry.opacity, targetOpacity, 0.12);
            groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
            groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
        }

        infoElements.forEach(function (entry) {
            var vec = entry.hotspot.positionVector.clone().project(camera);
            var isVisible = vec.z < 1;
            entry.element.classList.toggle('visible', isVisible);
            if (isVisible) {
                entry.element.style.left = ((vec.x + 1) / 2 * window.innerWidth) + 'px';
                entry.element.style.top = (-(vec.y - 1) / 2 * window.innerHeight) + 'px';
            }
        });
    }

    function onValidClick(event) {
        if (activeHotspot && !window.tourState.isXRActive) {
            window.startTransition(activeHotspot.target, { hotspot: activeHotspot });
        }
    }

    function handleXRSelect(controller) {
        if (!controller) return;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromXRController(controller);

        if (window.vrExitButton) {
            var exitHits = raycaster.intersectObject(window.vrExitButton);
            if (exitHits.length > 0) {
                window.tourState.renderer.xr.getSession()?.end();
                return;
            }
        }

        if (activeHotspot) {
            window.startTransition(activeHotspot.target, { hotspot: activeHotspot });
            return;
        }

        var infoIntersects = raycaster.intersectObjects(window.tourState.hotspotGroup.children, true);
        if (infoIntersects.length > 0) {
            var intersected = infoIntersects[0];
            var hotspot = intersected.object.userData.hotspot;
            if (hotspot && window.showVRInfoPanel) {
                window.showVRInfoPanel(hotspot, intersected.point);
            }
        } else if (window.vrInfoPanel.visible) {
            window.hideVRInfoPanel();
        }
    }

    window.initHotspots = initHotspots;
    window.updateHotspots = updateHotspots;
    window.onValidClick = onValidClick;
    window.handleXRSelect = handleXRSelect;
    window.moveGroundArrowWithJoystick = moveGroundArrowWithJoystick;
})();
