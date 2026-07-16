// =============================================================================
//  hotspots.js  —  Fichier complet avec les corrections pour le mode VR
// =============================================================================
(function () {
    'use strict';

    var infoLayer;
    var infoElements = [];
    var groundRaycaster = new THREE.Raycaster();
    var mouseNDC = new THREE.Vector2(0, 0);
    var GROUND_Y = -1; // modifié de -2 à -1
    var GROUND_HOTSPOT_INNER_RADIUS = 0.12;
    var GROUND_HOTSPOT_OUTER_RADIUS = 0.36;
    var GROUND_HOTSPOT_ARROW_SCALE = 0.38;
    var MIN_FOLLOW_RADIUS = 1.2;
    var MAX_FOLLOW_RADIUS = 8;
    var MAX_HOTSPOT_DISTANCE = 0.4; // Nouvelle constante pour limiter la distance en VR
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
    var groundPoint = new THREE.Vector3();

    var hotspotGroup = new THREE.Group();
    var hotspotMarkers = [];
    var groundHotspotGroup = new THREE.Group();
    var groundHotspotEntry = null;
    var allGroundHotspotMeshes = [];

    var pulseCircles = [];
    var PULSE_CIRCLE_RADIUS = 0.5;
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
        var vrGroup = window.tourState.vrGroup;
        if (vrGroup) {
            vrGroup.remove(groundHotspotGroup);
        }
        disposeObject3D(groundHotspotGroup);
        groundHotspotGroup = new THREE.Group();
        groundHotspotEntry = null;
        allGroundHotspotMeshes = [];
        clearPulseCircles();
    }

    // Texture générique (bleu par défaut, sera teintée par la couleur du matériau)
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

        // Dégradé en niveaux de gris pour pouvoir le teinter avec la couleur du matériau
        var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.7)');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
        grad.addColorStop(0.85, 'rgba(255,255,255,0.3)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Point central blanc
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
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
                entry.tween = null;
            }
            if (entry.mesh) {
                if (entry.mesh.parent) {
                    entry.mesh.parent.remove(entry.mesh);
                }
                if (entry.mesh.geometry) {
                    entry.mesh.geometry.dispose();
                }
                if (entry.mesh.material) {
                    if (entry.mesh.material.map) {
                        entry.mesh.material.map = null;
                    }
                    entry.mesh.material.dispose();
                }
                var index = allGroundHotspotMeshes.indexOf(entry.mesh);
                if (index !== -1) {
                    allGroundHotspotMeshes.splice(index, 1);
                }
                entry.mesh = null;
            }
        });
        pulseCircles = [];
        if (pulseCircleTexture) {
            pulseCircleTexture.dispose();
            pulseCircleTexture = null;
        }
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

    // Mise à jour des couleurs uniquement en VR
    function updatePulseColors(highlightedHotspot) {
        if (!window.tourState.isXRActive) return; // ← Correction 1 : survol réservé au VR

        // Réinitialise tous les cercles en bleu, puis met en bleu plus soutenu celui qui est survolé
        pulseCircles.forEach(function (entry) {
            var mesh = entry.mesh;
            if (!mesh) return;
            mesh.material.color.setHex(0x1E90FF);
        });
        if (highlightedHotspot) {
            pulseCircles.forEach(function (entry) {
                var mesh = entry.mesh;
                if (!mesh) return;
                if (mesh.userData.hotspot === highlightedHotspot) {
                    mesh.material.color.setHex(0x4169E1);
                }
            });
        }
    }

    function createPulseCircles() {
        clearPulseCircles();

        var texture = createPulseCircleTexture();
        var hotspots = transitionHotspots();
        var vrGroup = window.tourState.vrGroup;
        if (!vrGroup) return;

        var isVR = window.tourState.isXRActive; // ← Correction 1 : conditionner le style

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
                opacity: isVR ? 0.85 : 0.6,      // ← Correction 1 : opacité différente
                side: THREE.DoubleSide,
                depthWrite: false,
                color: isVR ? 0x1E90FF : 0xFF0000 // ← Correction 1 : bleu en VR, rouge en 2D
            });

            var mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(groundPos.x, groundPos.y + 0.02, groundPos.z);
            mesh.renderOrder = 4;
            mesh.userData.hotspot = hotspot;

            vrGroup.add(mesh);

            allGroundHotspotMeshes.push(mesh);

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
                    if (!mesh || !mesh.material) return;
                    var s = mesh.scale.x;
                    var normalized = (s - 1.0) / 0.3;
                    mesh.material.opacity = (isVR ? 0.85 : 0.6) - normalized * 0.25;
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

        var vrGroup = window.tourState.vrGroup;
        if (vrGroup && !vrGroup.children.includes(groundHotspotGroup)) {
            vrGroup.add(groundHotspotGroup);
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

        allGroundHotspotMeshes = [];

        var vrGroup = window.tourState.vrGroup;
        if (vrGroup) {
            vrGroup.remove(hotspotGroup);
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

        if (vrGroup) {
            vrGroup.add(hotspotGroup);
            if (!vrGroup.children.includes(groundHotspotGroup)) {
                vrGroup.add(groundHotspotGroup);
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
    //  VR: LASER-DRIVEN ARROW (modifié : détection directe, plus de flèche)
    // --------------------------------------------------------------
    function getDominantController() {
        var controllers = window.tourState.xrControllers;
        if (!controllers || controllers.length === 0) return null;
        return controllers[1] || controllers[0];
    }

    function updateVRArrowFromLaser() {
        if (!window.tourState.isXRActive) return;
        // Masquer la flèche au sol en VR
        groundHotspotGroup.visible = false;

        var controller = getDominantController();
        if (!controller) {
            updatePulseColors(null);
            return;
        }

        var raycaster = window.xrRaycasterFromController ? window.xrRaycasterFromController(controller) : null;
        if (!raycaster) {
            updatePulseColors(null);
            return;
        }

        // Détection directe sur les cercles pulsants
        if (allGroundHotspotMeshes.length === 0) {
            updatePulseColors(null);
            return;
        }

        var hits = raycaster.intersectObjects(allGroundHotspotMeshes, false);
        if (hits.length > 0) {
            var hitMesh = hits[0].object;
            var hotspot = hitMesh.userData.hotspot;
            if (hotspot) {
                updatePulseColors(hotspot);
                return;
            }
        }

        updatePulseColors(null);
    }

    // --------------------------------------------------------------
    //  UPDATE HOTSPOTS
    // --------------------------------------------------------------
    function updateHotspots() {
        if (!window.tourState.camera) return;

        if (window.tourState.isXRActive) {
            updateVRArrowFromLaser();
        } else {
            // En mode 2D, on réaffiche la flèche au sol si besoin
            groundHotspotGroup.visible = true;
            updateMouseArrow();
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

    // --------------------------------------------------------------
    //  2D MOUSE ARROW
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
            var hitHotspot = intersects[0].object.userData.hotspot;
            if (hitHotspot) {
                return hitHotspot;
            }
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

    // --------------------------------------------------------------
    //  VR: HANDLE TRIGGER SELECT
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
            console.warn('[XR] No raycaster available');
            return;
        }

        // 1. Check HUD panels (exit button)
        if (window.vrHudPanels && window.vrHudPanels.length) {
            var hudHits = raycaster.intersectObjects(window.vrHudPanels, false);
            if (hudHits.length > 0) {
                var action = hudHits[0].object.userData.action;
                if (action === 'exitVR' && window.doExitVR) {
                    window.doExitVR();
                }
                return;
            }
        }

        // 2. Check VR info panel close
        if (window.checkVRInfoPanelClose && window.checkVRInfoPanelClose(raycaster)) {
            return;
        }

        // 3. Check ground hotspot meshes (ring, arrow, pulse circles)
        var groundMeshes = window.getGroundHotspotMeshes ? window.getGroundHotspotMeshes() : [];
        if (groundMeshes.length) {
            var groundHits = raycaster.intersectObjects(groundMeshes, false);
            if (groundHits.length > 0) {
                var directHotspot = groundHits[0].object.userData.hotspot;
                if (directHotspot && window.triggerGSVTransition) {
                    console.log('[XR] Direct ground hit: ' + directHotspot.target);
                    window.triggerGSVTransition(directHotspot.target, bearingForHotspot(directHotspot), { hotspot: directHotspot });
                    return;
                }
            }
        }

        console.log('[XR] No interactable target hit');
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
    window.goToSequentialScene = getSequentialSceneIds;
    window.getGroundHotspotMeshes = function () { return allGroundHotspotMeshes; };
})();