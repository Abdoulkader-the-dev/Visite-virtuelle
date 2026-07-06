(function () {
    'use strict';

    // =========================================================================
    // FLOOR NAVIGATION HOTSPOT — 3D mesh uniquement (plus aucun overlay HTML)
    // =========================================================================
    //
    // Le hotspot de navigation suit la souris sur la partie basse du panorama.
    // Il affiche un ANNEAU + une FLÈCHE 3D couchés au sol, dont la DIRECTION
    // pointe dynamiquement vers le hotspot cible le plus proche.
    //
    // DONNÉES HOTSPOT (dans js/config.js — EN LECTURE SEULE) :
    //   {
    //     position: { x: 150, y: 0, z: -250 },  ← point 3D dans la sphère
    //     type: 'transition',
    //     target: '2',                            ← ID de la scène cible
    //     label: 'Cuisine'                        ← texte affiché
    //   }
    // =========================================================================

    var infoLayer;
    var infoElements = [];
    var tempMatrix = new THREE.Matrix4();
    var groundRaycaster = new THREE.Raycaster();
    var mouseNDC = new THREE.Vector2(0, 0);
    var GROUND_RADIUS = 3.5;
    var GROUND_Y = -2;
    var GROUND_HOTSPOT_INNER_RADIUS = 0.12;
    var GROUND_HOTSPOT_OUTER_RADIUS = 0.36;
    var GROUND_HOTSPOT_ARROW_SCALE = 0.38;
    var MIN_FOLLOW_RADIUS = 1.2;
    var MAX_FOLLOW_RADIUS = 8;
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
    var groundPoint = new THREE.Vector3();

    // Groupes pour les hotspots 3D
    var hotspotGroup = new THREE.Group();
    var hotspotMarkers = [];
    var groundHotspotGroup = new THREE.Group();
    var groundHotspotEntry = null;
    var allGroundHotspotMeshes = [];

    // Cercles de positionnement rouges au sol (pulse)
    var pulseCircles = [];
    var PULSE_CIRCLE_RADIUS = 0.25;
    var pulseCircleTexture = null;

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
        if (!material) {
            return;
        }
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

    function getSequentialSceneIds() {
        var ids = Object.keys(window.TOUR_CONFIG.scenes);
        ids.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        return ids;
    }

    function getAdjacentSceneId(direction) {
        var ids = getSequentialSceneIds();
        if (ids.length <= 1) { return null; }
        var currentIndex = ids.indexOf(window.tourState.currentScene);
        if (currentIndex === -1) { currentIndex = 0; }
        var nextIndex = ((currentIndex + direction) % ids.length + ids.length) % ids.length;
        return ids[nextIndex];
    }

    function normalizeRelativeAngle(degrees) {
        return ((degrees + 540) % 360) - 180;
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

    // ==============================================================
    //  VR: Get headset gaze direction on ground plane
    // ==============================================================
    function getVRGazeGroundPosition() {
        var camera = window.tourState.camera;
        if (!camera) return null;

        var gazeDir = new THREE.Vector3(0, 0, -1);
        gazeDir.applyQuaternion(camera.quaternion);
        gazeDir.y = 0;
        gazeDir.normalize();

        var groundDistance = 3.5;
        var pos = new THREE.Vector3(
            gazeDir.x * groundDistance,
            GROUND_Y,
            gazeDir.z * groundDistance
        );

        var hLen = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        if (hLen > MAX_FOLLOW_RADIUS) {
            var s = MAX_FOLLOW_RADIUS / hLen;
            pos.x *= s;
            pos.z *= s;
        } else if (hLen < MIN_FOLLOW_RADIUS && hLen > 0.01) {
            var s2 = MIN_FOLLOW_RADIUS / hLen;
            pos.x *= s2;
            pos.z *= s2;
        }

        return pos;
    }

    // ==============================================================
    //  VR: Move ground arrow with joystick
    // ==============================================================
    function moveGroundArrowWithJoystick(x, y) {
        if (!groundHotspotEntry || !window.tourState.isXRActive) return;

        var camera = window.tourState.camera;
        var forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();

        var right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();

        var speed = 0.05;
        var move = new THREE.Vector3()
            .addScaledVector(forward, -y * speed)
            .addScaledVector(right, x * speed);

        var currentPos = groundHotspotEntry.ring.position;
        var newPos = currentPos.clone().add(move);

        var hLen = Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z);
        if (hLen > MAX_FOLLOW_RADIUS) {
            var s = MAX_FOLLOW_RADIUS / hLen;
            newPos.x *= s;
            newPos.z *= s;
        }

        groundHotspotEntry.ring.position.copy(newPos);
        groundHotspotEntry.arrow.position.copy(newPos);
        groundHotspotEntry.arrow.position.y += 0.01;

        var nearest = nearestTransitionHotspot(new THREE.Vector3(newPos.x, 0, newPos.z));
        if (nearest) {
            groundHotspotEntry.hotspot = nearest;
            groundHotspotEntry.ring.userData.hotspot = nearest;
            groundHotspotEntry.arrow.userData.hotspot = nearest;

            var dx = nearest.positionVector.x - newPos.x;
            var dz = nearest.positionVector.z - newPos.z;
            var angle = Math.atan2(-dx, -dz);
            groundHotspotEntry.ring.rotation.y = angle;
            groundHotspotEntry.arrow.rotation.y = angle;
        }
    }

    function updateHotspots() {
        if (!window.tourState.camera) {
            return;
        }

        updateGroundHotspots();

        if (hotspotGroup) {
            hotspotGroup.visible = true;
        }

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

    // ==============================================================
    //  UPDATE GROUND HOTSPOTS - VR + 2D
    // ==============================================================
    function updateGroundHotspots() {
        var camera = window.tourState.camera;
        var targetOpacity = 0;
        var nearest = null;

        if (!camera || !groundHotspotEntry) {
            return;
        }

        // ==============================================================
        //  VR MODE: Use headset gaze direction
        // ==============================================================
        if (window.tourState.isXRActive) {
            var gazePos = getVRGazeGroundPosition();
            if (gazePos) {
                nearest = nearestTransitionHotspot(new THREE.Vector3(gazePos.x, 0, gazePos.z));
                if (nearest) {
                    groundHotspotEntry.hotspot = nearest;
                    groundHotspotEntry.ring.position.copy(gazePos);
                    groundHotspotEntry.arrow.position.copy(gazePos);
                    groundHotspotEntry.arrow.position.y += 0.01;
                    groundHotspotEntry.ring.userData.hotspot = nearest;
                    groundHotspotEntry.arrow.userData.hotspot = nearest;

                    var dx = nearest.positionVector.x - gazePos.x;
                    var dz = nearest.positionVector.z - gazePos.z;
                    var angleToTarget = Math.atan2(-dx, -dz);
                    groundHotspotEntry.ring.rotation.y = angleToTarget;
                    groundHotspotEntry.arrow.rotation.y = angleToTarget;

                    targetOpacity = 0.85;
                }
            }
        }
        // ==============================================================
        //  2D MODE: Use mouse position
        // ==============================================================
        else {
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
        var intersects;

        if (!event || !window.tourState.camera || window.tourState.isTransitioning || allGroundHotspotMeshes.length === 0) {
            return null;
        }

        mouseNDC.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );
        groundRaycaster.setFromCamera(mouseNDC, window.tourState.camera);
        intersects = groundRaycaster.intersectObjects(allGroundHotspotMeshes, false);

        if (intersects.length > 0 && window.tourState.mouseDelta < 5) {
            return intersects[0].object.userData.hotspot || null;
        }

        if (
            groundHotspotEntry &&
            groundHotspotEntry.hotspot &&
            window.tourState.mouseDelta < 5
        ) {
            return groundHotspotEntry.hotspot;
        }

        return null;
    }

    function getVRGazeHotspot() {
        if (!window.tourState.isXRActive || !groundHotspotEntry) {
            return null;
        }
        return groundHotspotEntry.hotspot;
    }

    function handleXRSelect(controller) {
        if (!controller) { return; }

        var raycaster = new THREE.Raycaster();
        var tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        if (window.vrExitButton) {
            var exitHits = raycaster.intersectObject(window.vrExitButton);
            if (exitHits.length > 0) {
                if (window.doExitVR) {
                    window.doExitVR();
                }
                return;
            }
        }

        if (window.checkVRInfoPanelClose && window.checkVRInfoPanelClose(raycaster)) {
            return;
        }

        // Use the gaze-following hotspot in VR
        var hotspot = getVRGazeHotspot();
        if (hotspot && window.triggerGSVTransition) {
            window.triggerGSVTransition(
                hotspot.target,
                bearingForHotspot(hotspot),
                { hotspot: hotspot }
            );
        }
    }

    // ==============================================================
    //  EXPOSE
    // ==============================================================
    window.initHotspots = initHotspots;
    window.updateHotspots = updateHotspots;
    window.onValidClick = onValidClick;
    window.onDoubleClick = onDoubleClick;
    window.rebuildHotspots = initHotspots;
    window.getActiveController = function () {
        var controllers = window.tourState.xrControllers;
        if (!controllers) { return null; }
        for (var i = 0; i < controllers.length; i++) {
            if (controllers[i] && controllers[i].matrixWorld) {
                return controllers[i];
            }
        }
        return controllers.length > 0 ? controllers[0] : null;
    };
    window.getGroundHotspotMeshes = function () { return allGroundHotspotMeshes; };
    window.handleXRSelect = handleXRSelect;
    window.moveGroundArrowWithJoystick = moveGroundArrowWithJoystick;
    window.getVRGazeHotspot = getVRGazeHotspot;
})();