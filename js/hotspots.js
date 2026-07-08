(function () {
    'use strict';

    var infoLayer;
    var infoElements = [];
    var groundRaycaster = new THREE.Raycaster();
    var mouseNDC = new THREE.Vector2(0, 0);
    var GROUND_Y = -2;
    var GROUND_HOTSPOT_INNER_RADIUS = 0.12;
    var GROUND_HOTSPOT_OUTER_RADIUS = 0.36;
    var GROUND_HOTSPOT_ARROW_SCALE = 0.38;
    var MIN_FOLLOW_RADIUS = 1.2;
    var MAX_FOLLOW_RADIUS = 8;
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
    var groundPoint = new THREE.Vector3();

    var hotspotGroup = new THREE.Group();
    var hotspotMarkers = [];
    var groundHotspotGroup = new THREE.Group();
    var groundHotspotEntry = null;
    var allGroundHotspotMeshes = [];

    var pulseCircles = [];
    var PULSE_CIRCLE_RADIUS = 0.25;
    var pulseCircleTexture = null;

    // --------------------------------------------------------------
    //  HELPERS
    // --------------------------------------------------------------
    function currentHotspots() {
        return window.TOUR_CONFIG.scenes[window.tourState.currentScene].hotspots;
    }

    function transitionHotspots() {
        return currentHotspots().filter(function (hotspot) {
            return hotspot.type === 'transition';
        });
    }

    function infoHotspots() {
        return currentHotspots().filter(function (hotspot) {
            return hotspot.type === 'info';
        });
    }

    function nearestTransitionHotspot(point) {
        var hotspots = transitionHotspots();
        var nearest = null;
        var nearestDistance = Infinity;

        hotspots.forEach(function (hotspot) {
            var distance = hotspot.positionVector.distanceToSquared(point);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = hotspot;
            }
        });

        return nearest;
    }

    function bearingForHotspot(hotspot) {
        var bearing;

        if (typeof hotspot.bearing === 'number') {
            return hotspot.bearing;
        }

        bearing = Math.atan2(hotspot.position.x, -hotspot.position.z) * 180 / Math.PI;
        if (bearing < 0) {
            bearing += 360;
        }
        hotspot.bearing = bearing;
        return bearing;
    }

    function disposeMaterial(material) {
        if (!material) return;
        if (Array.isArray(material)) {
            material.forEach(disposeMaterial);
            return;
        }
        if (material.map) {
            material.map.dispose();
        }
        material.dispose();
    }

    function disposeObject3D(object) {
        object.traverse(function (child) {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                disposeMaterial(child.material);
            }
        });
    }

    function clearGroundHotspots() {
        if (window.tourState.scene) {
            window.tourState.scene.remove(groundHotspotGroup);
        }
        disposeObject3D(groundHotspotGroup);
        groundHotspotGroup = new THREE.Group();
        groundHotspotEntry = null;
        allGroundHotspotMeshes = [];
        clearPulseCircles();
    }

    function createPulseCircleTexture() {
        if (pulseCircleTexture) {
            return pulseCircleTexture;
        }

        var size = 128;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var cx = size / 2;
        var cy = size / 2;
        var r = size / 2 - 2;

        var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(220, 38, 38, 0.7)');
        grad.addColorStop(0.6, 'rgba(220, 38, 38, 0.55)');
        grad.addColorStop(0.85, 'rgba(220, 38, 38, 0.3)');
        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();

        pulseCircleTexture = new THREE.CanvasTexture(canvas);
        return pulseCircleTexture;
    }

    function clearPulseCircles() {
        pulseCircles.forEach(function (entry) {
            if (entry.tween) {
                entry.tween.kill();
            }
            if (entry.mesh) {
                window.tourState.scene.remove(entry.mesh);
                entry.mesh.geometry.dispose();
                if (entry.mesh.material) {
                    entry.mesh.material.dispose();
                }
            }
        });
        pulseCircles = [];
    }

    function projectHotspotToGround(position) {
        var dir = new THREE.Vector3(position.x, position.y, position.z).normalize();
        var horizontalDist = Math.sqrt(position.x * position.x + position.z * position.z);
        if (horizontalDist < 0.001) {
            return new THREE.Vector3(0, GROUND_Y, 0);
        }
        var t = GROUND_Y / dir.y;
        if (t < 0) {
            t = Math.abs(t);
        }
        var maxGroundDist = 200;
        var px = dir.x * t;
        var pz = dir.z * t;
        var groundDist = Math.sqrt(px * px + pz * pz);
        if (groundDist > maxGroundDist) {
            var scale = maxGroundDist / groundDist;
            px *= scale;
            pz *= scale;
        }
        return new THREE.Vector3(px, GROUND_Y, pz);
    }

    function createPulseCircles() {
        clearPulseCircles();

        var texture = createPulseCircleTexture();
        var hotspots = transitionHotspots();

        hotspots.forEach(function (hotspot, index) {
            var groundPos = projectHotspotToGround(hotspot.position);

            var geo = new THREE.PlaneGeometry(
                PULSE_CIRCLE_RADIUS * 2,
                PULSE_CIRCLE_RADIUS * 2
            );
            geo.rotateX(-Math.PI / 2);

            var mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            var mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(groundPos.x, groundPos.y + 0.02, groundPos.z);
            mesh.renderOrder = 4;
            mesh.userData.hotspot = hotspot;

            window.tourState.scene.add(mesh);

            var delay = index * 0.15;

            var tween = gsap.to(mesh.scale, {
                x: 1.3,
                y: 1.3,
                z: 1.3,
                duration: 0.8,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1,
                delay: delay,
                onUpdate: function () {
                    var s = mesh.scale.x;
                    var normalized = (s - 1.0) / 0.3;
                    mesh.material.opacity = 0.6 - normalized * 0.25;
                }
            });

            pulseCircles.push({ mesh: mesh, tween: tween });
        });
    }

    function createGroundHotspot() {
        var ringGeo = new THREE.RingGeometry(GROUND_HOTSPOT_INNER_RADIUS, GROUND_HOTSPOT_OUTER_RADIUS, 64);
        var ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        var hotspotMesh;
        var arrowShape;
        var arrowGeo;
        var arrowMesh;
        var arrowMat;

        if (groundHotspotEntry) {
            return;
        }

        ringGeo.rotateX(-Math.PI / 2);
        hotspotMesh = new THREE.Mesh(ringGeo, ringMat);
        hotspotMesh.position.set(0, GROUND_Y, 0);
        hotspotMesh.renderOrder = 5;
        hotspotMesh.userData.isGroundHotspot = true;

        arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.3 * GROUND_HOTSPOT_ARROW_SCALE);
        arrowShape.lineTo(0.2 * GROUND_HOTSPOT_ARROW_SCALE, 0);
        arrowShape.lineTo(0, 0.1 * GROUND_HOTSPOT_ARROW_SCALE);
        arrowShape.lineTo(-0.2 * GROUND_HOTSPOT_ARROW_SCALE, 0);
        arrowShape.closePath();

        arrowGeo = new THREE.ShapeGeometry(arrowShape);
        arrowGeo.rotateX(-Math.PI / 2);
        arrowMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        arrowMesh.position.set(0, GROUND_Y + 0.01, 0);
        arrowMesh.renderOrder = 6;
        arrowMesh.userData.isGroundHotspot = true;

        groundHotspotGroup.add(hotspotMesh);
        groundHotspotGroup.add(arrowMesh);

        if (window.tourState.scene && !window.tourState.scene.children.includes(groundHotspotGroup)) {
            window.tourState.scene.add(groundHotspotGroup);
        }

        groundHotspotEntry = {
            hotspot: null,
            ring: hotspotMesh,
            arrow: arrowMesh,
            opacity: 0
        };
        allGroundHotspotMeshes.push(hotspotMesh, arrowMesh);
    }

    // --------------------------------------------------------------
    //  INIT HOTSPOTS
    // --------------------------------------------------------------
    function initHotspots() {
        infoLayer = document.getElementById('info-hotspot-layer');
        infoLayer.innerHTML = '';
        infoElements = [];

        clearGroundHotspots();

        if (window.tourState.scene) {
            window.tourState.scene.remove(hotspotGroup);
        }
        disposeObject3D(hotspotGroup);
        hotspotGroup = new THREE.Group();
        hotspotMarkers = [];

        currentHotspots().forEach(function (hotspot) {
            if (hotspot.type === 'info') {
                var element = document.createElement('button');
                element.type = 'button';
                element.className = 'info-hotspot';
                element.textContent = hotspot.icon || 'i';
                element.setAttribute('aria-label', hotspot.title || 'Information');
                element.addEventListener('click', function (event) {
                    event.stopPropagation();
                    if (window.showInfoCard) {
                        var rect = element.getBoundingClientRect();
                        window.showInfoCard(hotspot, rect.left + rect.width / 2, rect.top + rect.height / 2);
                    }
                });
                infoLayer.appendChild(element);
                infoElements.push({ hotspot: hotspot, element: element });
            }

            if (hotspot.type === 'transition') {
                createGroundHotspot();
            }

            var marker = null;
            if (hotspot.type !== 'transition') {
                var canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#3B82F6';
                ctx.beginPath();
                ctx.arc(32, 32, 30, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = 'bold 40px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(hotspot.icon || 'i', 32, 32);

                var texture = new THREE.CanvasTexture(canvas);
                var spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
                marker = new THREE.Sprite(spriteMat);
                marker.scale.set(20, 20, 1);

                marker.position.copy(hotspot.positionVector);
                hotspotGroup.add(marker);
                hotspotMarkers.push({ hotspot: hotspot, marker: marker });
            }
        });

        if (window.tourState.scene) {
            window.tourState.scene.add(hotspotGroup);
            if (!window.tourState.scene.children.includes(groundHotspotGroup)) {
                window.tourState.scene.add(groundHotspotGroup);
            }
        }

        window.tourState.hotspotGroup = hotspotGroup;
        window.tourState.groundHotspotGroup = groundHotspotGroup;

        createPulseCircles();

        var fwdBtn = document.getElementById('dir-arrow-fwd');
        var bwdBtn = document.getElementById('dir-arrow-bwd');

        if (fwdBtn) {
            fwdBtn.onclick = function () {
                var hotspot = bestHotspotInView(+1);
                if (hotspot && window.triggerGSVTransition) {
                    window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot), { hotspot: hotspot });
                }
            };
        }
        if (bwdBtn) {
            bwdBtn.onclick = function () {
                var hotspot = bestHotspotInView(-1);
                if (hotspot && window.triggerGSVTransition) {
                    window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot), { hotspot: hotspot });
                }
            };
        }
    }

    // --------------------------------------------------------------
    //  SEQUENTIAL NAVIGATION (not used for buttons, but kept)
    // --------------------------------------------------------------
    function getSequentialSceneIds() {
        var ids = Object.keys(window.TOUR_CONFIG.scenes);
        ids.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        return ids;
    }

    function bestHotspotInView(direction) {
        var best = null;
        var bestScore = Infinity;

        transitionHotspots().forEach(function (hotspot) {
            var pos = hotspot.positionVector;
            var hotspotAngleDeg = Math.atan2(pos.z, pos.x) * (180 / Math.PI);
            var relativeAngle = hotspotAngleDeg - window.tourState.lon;
            var forwardScore = Math.abs(normalizeRelativeAngle(relativeAngle));
            var backwardScore = Math.abs(normalizeRelativeAngle(relativeAngle) - 180);
            var score = direction > 0 ? forwardScore : backwardScore;

            if (score < bestScore) {
                bestScore = score;
                best = hotspot;
            }
        });

        return best;
    }

    function normalizeRelativeAngle(degrees) {
        return ((degrees + 540) % 360) - 180;
    }

    // --------------------------------------------------------------
    //  VR: LASER-DRIVEN ARROW (replaces joystick)
    // --------------------------------------------------------------
    function getDominantController() {
        var controllers = window.tourState.xrControllers;
        if (!controllers || controllers.length === 0) return null;
        // Prefer right controller (index 1) if available, else use first
        return controllers[1] || controllers[0];
    }

    function updateVRArrowFromLaser() {
        if (!groundHotspotEntry) return;
        if (!window.tourState.isXRActive) return;

        var controller = getDominantController();
        if (!controller) return;

        // Get raycaster from the controller (same as used for lasers)
        var raycaster = window.xrRaycasterFromController ? window.xrRaycasterFromController(controller) : null;
        if (!raycaster) return;

        // Intersect with ground plane
        var intersectPoint = new THREE.Vector3();
        var hit = raycaster.ray.intersectPlane(groundPlane, intersectPoint);
        if (!hit) {
            // No ground hit: hide arrow
            groundHotspotEntry.opacity = 0;
            groundHotspotEntry.ring.material.opacity = 0;
            groundHotspotEntry.arrow.material.opacity = 0;
            groundHotspotEntry.hotspot = null;
            groundHotspotEntry.ring.userData.hotspot = null;
            groundHotspotEntry.arrow.userData.hotspot = null;
            return;
        }

        // Clamp distance to limits
        var horizontalLength = Math.sqrt(intersectPoint.x * intersectPoint.x + intersectPoint.z * intersectPoint.z);
        if (horizontalLength > MAX_FOLLOW_RADIUS) {
            var scale = MAX_FOLLOW_RADIUS / horizontalLength;
            intersectPoint.x *= scale;
            intersectPoint.z *= scale;
        } else if (horizontalLength < MIN_FOLLOW_RADIUS && horizontalLength > 0.01) {
            var scale2 = MIN_FOLLOW_RADIUS / horizontalLength;
            intersectPoint.x *= scale2;
            intersectPoint.z *= scale2;
        }

        // Find nearest hotspot
        var nearest = nearestTransitionHotspot(intersectPoint);

        // Update arrow position
        groundHotspotEntry.ring.position.copy(intersectPoint);
        groundHotspotEntry.arrow.position.copy(intersectPoint);
        groundHotspotEntry.arrow.position.y += 0.01;

        if (nearest) {
            groundHotspotEntry.hotspot = nearest;
            groundHotspotEntry.ring.userData.hotspot = nearest;
            groundHotspotEntry.arrow.userData.hotspot = nearest;

            // Compute angle to point toward hotspot
            var dx = nearest.positionVector.x - intersectPoint.x;
            var dz = nearest.positionVector.z - intersectPoint.z;
            var angle = Math.atan2(-dx, -dz);
            groundHotspotEntry.ring.rotation.y = angle;
            groundHotspotEntry.arrow.rotation.y = angle;

            groundHotspotEntry.opacity = 0.85;
        } else {
            groundHotspotEntry.hotspot = null;
            groundHotspotEntry.ring.userData.hotspot = null;
            groundHotspotEntry.arrow.userData.hotspot = null;
            groundHotspotEntry.opacity = 0.3; // show arrow even without hotspot (dim)
        }

        groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
        groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
    }

    // --------------------------------------------------------------
    //  UPDATE HOTSPOTS (2D and VR)
    // --------------------------------------------------------------
    function updateHotspots() {
        if (!window.tourState.camera) return;

        if (window.tourState.isXRActive) {
            // VR: arrow follows laser
            updateVRArrowFromLaser();
        } else {
            // 2D: arrow follows mouse
            updateMouseArrow();
        }

        // Info hotspots (same for both)
        infoElements.forEach(function (entry) {
            var vec = entry.hotspot.positionVector.clone();
            vec.project(window.tourState.camera);

            if (vec.z > 1 || vec.z < -1) {
                entry.element.classList.remove('visible');
                return;
            }

            var screenX = (vec.x + 1) / 2 * window.innerWidth;
            var screenY = (-vec.y + 1) / 2 * window.innerHeight;
            entry.element.style.left = screenX + 'px';
            entry.element.style.top = screenY + 'px';
            entry.element.classList.add('visible');
        });
    }

    // --------------------------------------------------------------
    //  2D MOUSE ARROW (unchanged)
    // --------------------------------------------------------------
    function updateMouseArrow() {
        var camera = window.tourState.camera;
        var targetOpacity = 0;
        var nearest = null;

        if (!camera || !groundHotspotEntry) return;

        if (typeof window.tourState.lastMouseX === 'number' && typeof window.tourState.lastMouseY === 'number') {
            mouseNDC.set(
                (window.tourState.lastMouseX / window.innerWidth) * 2 - 1,
                -(window.tourState.lastMouseY / window.innerHeight) * 2 + 1
            );
        }

        groundRaycaster.setFromCamera(mouseNDC, camera);

        if (
            !window.tourState.isTransitioning &&
            window.tourState.mouseSphereLat !== null &&
            window.tourState.mouseSphereLat < -10 &&
            groundRaycaster.ray.intersectPlane(groundPlane, groundPoint)
        ) {
            var horizontalLength = Math.sqrt(groundPoint.x * groundPoint.x + groundPoint.z * groundPoint.z);
            if (horizontalLength > MAX_FOLLOW_RADIUS) {
                var scale = MAX_FOLLOW_RADIUS / horizontalLength;
                groundPoint.x *= scale;
                groundPoint.z *= scale;
            } else if (horizontalLength < MIN_FOLLOW_RADIUS && horizontalLength > 0) {
                var scale2 = MIN_FOLLOW_RADIUS / horizontalLength;
                groundPoint.x *= scale2;
                groundPoint.z *= scale2;
            }

            nearest = nearestTransitionHotspot(window.tourState.mouseSpherePoint || groundPoint);
            if (nearest) {
                groundHotspotEntry.hotspot = nearest;
                groundHotspotEntry.ring.position.copy(groundPoint);
                groundHotspotEntry.arrow.position.copy(groundPoint);
                groundHotspotEntry.arrow.position.y += 0.01;
                groundHotspotEntry.ring.userData.hotspot = nearest;
                groundHotspotEntry.arrow.userData.hotspot = nearest;

                var dx2 = nearest.positionVector.x - groundPoint.x;
                var dz2 = nearest.positionVector.z - groundPoint.z;
                var angleToTarget2 = Math.atan2(-dx2, -dz2);
                groundHotspotEntry.ring.rotation.y = angleToTarget2;
                groundHotspotEntry.arrow.rotation.y = angleToTarget2;

                targetOpacity = 0.85;
            }
        }

        if (!nearest) {
            groundHotspotEntry.hotspot = null;
            groundHotspotEntry.ring.userData.hotspot = null;
            groundHotspotEntry.arrow.userData.hotspot = null;
        }

        groundHotspotEntry.opacity = THREE.MathUtils.lerp(groundHotspotEntry.opacity, targetOpacity, 0.12);
        groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
        groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
    }

    // --------------------------------------------------------------
    //  CLICK HANDLERS (2D)
    // --------------------------------------------------------------
    function infoHitFromScreen(event) {
        var target = event.target;
        while (target && target !== document.body) {
            if (target.classList && target.classList.contains('info-hotspot')) {
                for (var i = 0; i < infoElements.length; i += 1) {
                    if (infoElements[i].element === target) {
                        return infoElements[i];
                    }
                }
            }
            target = target.parentNode;
        }
        return null;
    }

    function onValidClick(event) {
        var infoHit = infoHitFromScreen(event);
        var meshHit = groundHotspotFromEvent(event);

        if (meshHit && window.triggerGSVTransition) {
            window.triggerGSVTransition(meshHit.target, bearingForHotspot(meshHit), { hotspot: meshHit });
            return;
        }

        if (infoHit && window.showInfoCard) {
            window.showInfoCard(infoHit.hotspot, event.clientX, event.clientY);
        }
    }

    function onDoubleClick(event) {
        var meshHit = groundHotspotFromEvent(event);
        if (meshHit && window.triggerGSVTransition) {
            window.triggerGSVTransition(meshHit.target, bearingForHotspot(meshHit), { hotspot: meshHit });
        }
    }

    function groundHotspotFromEvent(event) {
        if (!event || !window.tourState.camera || window.tourState.isTransitioning || allGroundHotspotMeshes.length === 0) {
            return null;
        }

        mouseNDC.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        groundRaycaster.setFromCamera(mouseNDC, window.tourState.camera);
        var intersects = groundRaycaster.intersectObjects(allGroundHotspotMeshes, false);

        if (intersects.length > 0 && window.tourState.mouseDelta < 5) {
            return intersects[0].object.userData.hotspot || null;
        }

        if (groundHotspotEntry && groundHotspotEntry.hotspot && window.tourState.mouseDelta < 5) {
            return groundHotspotEntry.hotspot;
        }

        return null;
    }

    // --------------------------------------------------------------
    //  VR: HANDLE TRIGGER SELECT (unchanged, already uses raycaster)
    // --------------------------------------------------------------
    function handleXRSelect(controller) {
        if (!controller) {
            console.warn('[XR] handleXRSelect: no controller');
            return;
        }

        var raycaster = window.xrRaycasterFromController
            ? window.xrRaycasterFromController(controller)
            : null;

        if (!raycaster) {
            console.warn('[XR] No raycaster available, using fallback');
            var fallbackHotspot = groundHotspotEntry ? groundHotspotEntry.hotspot : null;
            if (fallbackHotspot && window.triggerGSVTransition) {
                window.triggerGSVTransition(fallbackHotspot.target, bearingForHotspot(fallbackHotspot), { hotspot: fallbackHotspot });
            }
            return;
        }

        // 1. Check ground hotspots FIRST
        var groundMeshes = window.getGroundHotspotMeshes ? window.getGroundHotspotMeshes() : [];
        if (groundMeshes.length) {
            var groundHits = raycaster.intersectObjects(groundMeshes, false);
            if (groundHits.length > 0) {
                var directHotspot = groundHits[0].object.userData.hotspot;
                if (directHotspot && window.triggerGSVTransition) {
                    console.log('[XR] Ground hit: ' + directHotspot.target);
                    window.triggerGSVTransition(directHotspot.target, bearingForHotspot(directHotspot), { hotspot: directHotspot });
                    return;
                }
            }
        }

        // 2. Check exit button
        var exitBtn = window.vrExitButton;
        if (exitBtn) {
            var exitHits = raycaster.intersectObject(exitBtn);
            if (exitHits.length > 0) {
                console.log('[XR] Exit button hit');
                if (window.doExitVR) {
                    window.doExitVR();
                }
                return;
            }
        }

        // 3. Check VR info panel close
        if (window.checkVRInfoPanelClose && window.checkVRInfoPanelClose(raycaster)) {
            return;
        }

        // 4. Fallback: joystick-selected hotspot (if any)
        var hotspot = groundHotspotEntry ? groundHotspotEntry.hotspot : null;
        if (hotspot && window.triggerGSVTransition) {
            console.log('[XR] Fallback to joystick hotspot: ' + hotspot.target);
            window.triggerGSVTransition(
                hotspot.target,
                bearingForHotspot(hotspot),
                { hotspot: hotspot }
            );
        } else {
            console.log('[XR] No interactable target hit');
        }
    }

    // --------------------------------------------------------------
    //  EXPOSE
    // --------------------------------------------------------------
    window.initHotspots = initHotspots;
    window.updateHotspots = updateHotspots;
    window.onValidClick = onValidClick;
    window.onDoubleClick = onDoubleClick;
    window.rebuildHotspots = initHotspots;
    window.handleXRSelect = handleXRSelect;
    window.goToSequentialScene = getSequentialSceneIds; // not used, but keep
    window.getGroundHotspotMeshes = function () { return allGroundHotspotMeshes; };
})();