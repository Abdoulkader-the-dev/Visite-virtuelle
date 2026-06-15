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
    var xrRaycaster = new THREE.Raycaster();
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

        groundHotspotGroup.add(hotspotMesh);
        groundHotspotGroup.add(arrowMesh);
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

        // Nettoyage des anciens marqueurs 3D
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
            window.tourState.scene.add(groundHotspotGroup);
        }

        // ---- Flèches directionnelles : avancer / reculer par ordre de nom ----
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

    function updateHotspots() {
        if (!window.tourState.camera) {
            return;
        }

        updateGroundHotspots();

        var isVR = window.tourState.isXRActive;
        if (hotspotGroup) {
            hotspotGroup.visible = true;
        }

        infoElements.forEach(function (entry) {
            if (isVR) {
                entry.element.classList.remove('visible');
                return;
            }
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

    // -------------------------------------------------------------------------
    // getActiveController()
    //
    // Retourne la manette WebXR active (celle qui a le focus ou la dernière
    // utilisée). Parcourt tourState.xrControllers et retourne la première
    // manette valide avec une matrixWorld à jour. Fallback sur le contrôleur 0.
    // -------------------------------------------------------------------------
    function getActiveController() {
        var controllers = window.tourState.xrControllers;
        if (!controllers || controllers.length === 0) {
            return null;
        }
        // Parcourir pour trouver une manette avec matrixWorld valide
        for (var i = 0; i < controllers.length; i += 1) {
            if (controllers[i] && controllers[i].matrixWorld) {
                return controllers[i];
            }
        }
        return controllers[0] || null;
    }

    // -------------------------------------------------------------------------
    // updateGroundHotspots()
    //
    // Aimantation du mesh au sol + rotation directionnelle vers le hotspot
    // cible le plus proche (atan2 sur position relative, pas bearing mondial).
    //
    // Mode VR : utilise le pointeur laser de la manette active (pointer-based),
    //           pas le regard de la caméra (gaze-based), pour éviter la fatigue
    //           du cou. Guards anti-division-par-zéro et anti-sol-derrière.
    // -------------------------------------------------------------------------
    function updateGroundHotspots() {
        var camera = window.tourState.camera;
        var targetOpacity = 0;
        var horizontalLength;
        var scale;
        var nearest;

        if (!camera || !groundHotspotEntry) {
            return;
        }

        // ── VR Mode : rayon depuis la manette active vers le sol ──
        if (window.tourState.isXRActive) {
            var controller = getActiveController();
            if (!controller) {
                // Pas de manette disponible : masquer le hotspot
                groundHotspotEntry.hotspot = null;
                groundHotspotEntry.ring.userData.hotspot = null;
                groundHotspotEntry.arrow.userData.hotspot = null;
                groundHotspotEntry.opacity = THREE.MathUtils.lerp(groundHotspotEntry.opacity, 0, 0.12);
                groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
                groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
                return;
            }

            // Extraire position et direction mondiales de la manette via matrixWorld
            var ctrlMatrix = new THREE.Matrix4();
            ctrlMatrix.identity().extractRotation(controller.matrixWorld);
            var rayOrigin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
            var rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(ctrlMatrix).normalize();

            // Guard #1 : manette parallèle au sol (dir.y ≈ 0) → division par zéro imminente
            if (Math.abs(rayDir.y) < 0.001) {
                groundHotspotEntry.hotspot = null;
                groundHotspotEntry.ring.userData.hotspot = null;
                groundHotspotEntry.arrow.userData.hotspot = null;
                groundHotspotEntry.opacity = THREE.MathUtils.lerp(groundHotspotEntry.opacity, 0, 0.12);
                groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
                groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
                return;
            }

            // Calcul manuel de l'intersection rayon ↔ plan Y = -2
            // Évite le crash silencieux de Ray.intersectPlane() quand dir.y ≈ 0
            var t = (-2 - rayOrigin.y) / rayDir.y;

            // Guard #2 : t < 0 → le sol est derrière la manette
            if (t < 0) {
                groundHotspotEntry.hotspot = null;
                groundHotspotEntry.ring.userData.hotspot = null;
                groundHotspotEntry.arrow.userData.hotspot = null;
                groundHotspotEntry.opacity = THREE.MathUtils.lerp(groundHotspotEntry.opacity, 0, 0.12);
                groundHotspotEntry.ring.material.opacity = groundHotspotEntry.opacity;
                groundHotspotEntry.arrow.material.opacity = groundHotspotEntry.opacity;
                return;
            }

            if (!window.tourState.isTransitioning) {
                groundPoint.set(
                    rayOrigin.x + rayDir.x * t,
                    -2,
                    rayOrigin.z + rayDir.z * t
                );

                horizontalLength = Math.sqrt(groundPoint.x * groundPoint.x + groundPoint.z * groundPoint.z);
                if (horizontalLength > MAX_FOLLOW_RADIUS) {
                    scale = MAX_FOLLOW_RADIUS / horizontalLength;
                    groundPoint.x *= scale;
                    groundPoint.z *= scale;
                } else if (horizontalLength < MIN_FOLLOW_RADIUS && horizontalLength > 0) {
                    scale = MIN_FOLLOW_RADIUS / horizontalLength;
                    groundPoint.x *= scale;
                    groundPoint.z *= scale;
                }

                nearest = nearestTransitionHotspot(groundPoint);
                if (nearest) {
                    groundHotspotEntry.hotspot = nearest;
                    groundHotspotEntry.ring.position.copy(groundPoint);
                    groundHotspotEntry.arrow.position.copy(groundPoint);
                    groundHotspotEntry.arrow.position.y += 0.01;
                    groundHotspotEntry.ring.userData.hotspot = nearest;
                    groundHotspotEntry.arrow.userData.hotspot = nearest;

                    var dx = nearest.positionVector.x - groundPoint.x;
                    var dz = nearest.positionVector.z - groundPoint.z;
                    var angleToTarget = Math.atan2(-dx, -dz);
                    groundHotspotEntry.ring.rotation.y = angleToTarget;
                    groundHotspotEntry.arrow.rotation.y = angleToTarget;

                    targetOpacity = 0.85;
                }
            }
        } else {
            // ── Mode souris classique ──
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
                horizontalLength = Math.sqrt(groundPoint.x * groundPoint.x + groundPoint.z * groundPoint.z);
                if (horizontalLength > MAX_FOLLOW_RADIUS) {
                    scale = MAX_FOLLOW_RADIUS / horizontalLength;
                    groundPoint.x *= scale;
                    groundPoint.z *= scale;
                } else if (horizontalLength < MIN_FOLLOW_RADIUS && horizontalLength > 0) {
                    scale = MIN_FOLLOW_RADIUS / horizontalLength;
                    groundPoint.x *= scale;
                    groundPoint.z *= scale;
                }

                nearest = nearestTransitionHotspot(window.tourState.mouseSpherePoint || groundPoint);
                if (nearest) {
                    groundHotspotEntry.hotspot = nearest;
                    groundHotspotEntry.ring.position.copy(groundPoint);
                    groundHotspotEntry.arrow.position.copy(groundPoint);
                    groundHotspotEntry.arrow.position.y += 0.01;
                    groundHotspotEntry.ring.userData.hotspot = nearest;
                    groundHotspotEntry.arrow.userData.hotspot = nearest;

                    var dx = nearest.positionVector.x - groundPoint.x;
                    var dz = nearest.positionVector.z - groundPoint.z;
                    var angleToTarget = Math.atan2(-dx, -dz);
                    groundHotspotEntry.ring.rotation.y = angleToTarget;
                    groundHotspotEntry.arrow.rotation.y = angleToTarget;

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

    // -------------------------------------------------------------------------
    // handleXRSelect() — Gâchette manette : teste uniquement la flèche au sol
    // -------------------------------------------------------------------------
    function handleXRSelect(event) {
        var controller = event.target;
        var tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        var raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        if (allGroundHotspotMeshes.length > 0) {
            var hits = raycaster.intersectObjects(allGroundHotspotMeshes, false);
            if (hits.length > 0) {
                var hotspot = hits[0].object.userData.hotspot;
                if (hotspot && hotspot.type === 'transition' && window.triggerGSVTransition) {
                    window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot), { hotspot: hotspot });
                }
            }
        }
    }

    window.initHotspots = initHotspots;
    window.updateHotspots = updateHotspots;
    window.onValidClick = onValidClick;
    window.onDoubleClick = onDoubleClick;
    window.handleXRSelect = handleXRSelect;
    window.rebuildHotspots = initHotspots;
    window.getActiveController = getActiveController;
    window.getGroundHotspotMeshes = function () {
        return allGroundHotspotMeshes.slice();
    };
})();
