(function () {
    'use strict';

    // =========================================================================
    // FLOOR NAVIGATION HOTSPOT — Style Google Street View
    // =========================================================================
    //
    // Le hotspot de navigation suit la souris sur la partie basse du panorama.
    // Il affiche une FLÈCHE SVG couchée au sol dont la DIRECTION pointe vers
    // la scène cible la plus proche.
    //
    // STRUCTURE HTML (dans index.html) :
    //   <div id="floor-hotspot">
    //     <svg id="floor-arrow-svg">...</svg>   ← flèche directionnelle
    //     <div id="floor-hotspot-label"></div>  ← nom de la scène cible
    //   </div>
    //
    // COMMENT MODIFIER LA FLÈCHE :
    //   Le style visuel est dans css/style.css, section "Floor hotspot arrow".
    //   - Couleur de la flèche   → variable --arrow-color dans #floor-hotspot
    //   - Taille                 → width/height sur #floor-hotspot et #floor-arrow-svg
    //   - Animation de pulsation → @keyframes arrowPulse
    //
    // COMMENT MODIFIER LA LOGIQUE DE DIRECTION :
    //   La fonction computeArrowAngle() ci-dessous calcule l'angle en degrés
    //   entre la caméra et le hotspot cible en projetant les deux points sur
    //   le plan horizontal (XZ) de la sphère panoramique.
    //   - Pour désactiver la rotation directionnelle : retourner toujours 0
    //   - Pour inverser la direction : remplacer atan2(dx, dz) par atan2(-dx, -dz)
    //
    // DONNÉES HOTSPOT (dans js/config.js) :
    //   {
    //     position: { x: 150, y: 0, z: -250 },  ← point 3D dans la sphère
    //     type: 'transition',
    //     target: '2',                            ← ID de la scène cible
    //     label: 'Cuisine'                        ← texte affiché sous la flèche
    //   }
    //   La position Y est ignorée pour le calcul de direction (plan au sol).
    // =========================================================================

    var floorHotspot;
    var floorLabel;
    var floorArrowSvg;
    var cameraMarker;
    var dirArrows;
    var infoLayer;
    var infoElements = [];
    var xrRaycaster = new THREE.Raycaster();
    var tempMatrix = new THREE.Matrix4();
    var groundRaycaster = new THREE.Raycaster();
    var mouseNDC = new THREE.Vector2(0, 0);
    var GROUND_RADIUS = 3.5;
    var GROUND_Y = -2;
    var GROUND_HOTSPOT_INNER_RADIUS = 0.12; // [CORRECTION GSV] réduit de 50%
    var GROUND_HOTSPOT_OUTER_RADIUS = 0.36; // [CORRECTION GSV] réduit de 50%
    var GROUND_HOTSPOT_ARROW_SCALE  = 0.38; // [CORRECTION GSV] réduit de ~44%
    var MIN_FOLLOW_RADIUS = 1.2;
    var MAX_FOLLOW_RADIUS = 8;
    var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
    var groundPoint = new THREE.Vector3();

    // Groupes pour les hotspots 3D (visibles en VR)
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

    function screenPointForHotspot(hotspot) {
        var vec = hotspot.positionVector.clone();
        vec.project(window.tourState.camera);

        if (vec.z > 1 || vec.z < -1) {
            return null;
        }

        return {
            x: (vec.x + 1) / 2 * window.innerWidth,
            y: (-vec.y + 1) / 2 * window.innerHeight
        };
    }

    // -------------------------------------------------------------------------
    // computeArrowAngle(hotspot)
    //
    // Calcule l'angle de rotation (en degrés) que doit avoir la flèche pour
    // pointer vers le hotspot cible, en tenant compte de l'orientation actuelle
    // de la caméra (window.tourState.lon).
    //
    // Fonctionnement :
    //   1. On récupère la position 3D du hotspot (plan XZ, Y ignoré).
    //   2. On calcule l'angle absolu du hotspot dans la sphère via atan2.
    //   3. On soustrait le cap caméra (lon) pour obtenir l'angle RELATIF à la vue.
    //
    // Modifier cette fonction pour changer la logique directionnelle.
    // -------------------------------------------------------------------------
    function computeArrowAngle(hotspot) {
        var pos = hotspot.positionVector;
        // Angle absolu du hotspot dans le plan horizontal (XZ) de la sphère
        // atan2(x, -z) : z négatif = devant, cohérent avec le système Three.js
        var hotspotAngleDeg = Math.atan2(pos.z, pos.x) * (180 / Math.PI);
        // Angle relatif : on retire le cap caméra pour que la flèche soit
        // toujours dans le repère de l'écran et non du monde
        var relativeAngle = hotspotAngleDeg - window.tourState.lon;
        return relativeAngle;
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
        var bearingRad = 0;
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
        hotspotMesh.position.set(
            Math.sin(bearingRad) * GROUND_RADIUS,
            GROUND_Y,
            -Math.cos(bearingRad) * GROUND_RADIUS
        );
        hotspotMesh.rotation.y = bearingRad;
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
        arrowMesh.position.copy(hotspotMesh.position);
        arrowMesh.position.y += 0.01;
        arrowMesh.rotation.y = bearingRad;
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
        floorHotspot = document.getElementById('floor-hotspot');
        floorLabel = document.getElementById('floor-hotspot-label');
        floorArrowSvg = document.getElementById('floor-arrow-svg');
        cameraMarker = document.getElementById('camera-marker');
        dirArrows = document.getElementById('dir-arrows');
        infoLayer = document.getElementById('info-hotspot-layer');
        if (floorHotspot) {
            floorHotspot.style.display = 'flex'; // [CORRECTION GSV] 'none' → 'flex' : le CSS définit display:flex, contrôler uniquement l'opacity
        }
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
            // --- Logique HTML existante ---
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

            // --- NOUVEAU : Création du marqueur 3D pour la VR ---
            if (hotspot.type === 'transition') {
                createGroundHotspot();
            }

            var marker = null;
            if (hotspot.type !== 'transition') {
                // Sprite pour les infos
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

        // --- Bouton Quitter VR (3D) ---
        var exitCanvas = document.createElement('canvas');
        exitCanvas.width = 128;
        exitCanvas.height = 48;
        var exitCtx = exitCanvas.getContext('2d');
        exitCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        exitCtx.roundRect ? exitCtx.roundRect(0, 0, 128, 48, 8) : exitCtx.fillRect(0, 0, 128, 48);
        exitCtx.fill();
        exitCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        exitCtx.lineWidth = 2;
        exitCtx.stroke();
        exitCtx.fillStyle = 'white';
        exitCtx.font = 'bold 16px Arial';
        exitCtx.textAlign = 'center';
        exitCtx.textBaseline = 'middle';
        exitCtx.fillText('QUITTER VR', 64, 24);
        
        var exitTexture = new THREE.CanvasTexture(exitCanvas);
        var exitMat = new THREE.SpriteMaterial({ map: exitTexture, transparent: true });
        var exitSprite = new THREE.Sprite(exitMat);
        exitSprite.scale.set(30, 12, 1);
        // Positionné vers le bas pour ne pas gêner la vue centrale
        exitSprite.position.set(0, -60, -150); 
        hotspotGroup.add(exitSprite);
        hotspotMarkers.push({ hotspot: { type: 'exit' }, marker: exitSprite });

        // ---- Flèches directionnelles : avancer / reculer par ordre de nom ----
        // Navigation séquentielle selon le numéro du fichier image :
        //   1.JPG → 2.JPG → 3.JPG → ... → 10.JPG → 1.JPG  (circulaire)
        // Indépendant des hotspots de sol définis dans config.js.
        var fwdBtn = document.getElementById('dir-arrow-fwd');
        var bwdBtn = document.getElementById('dir-arrow-bwd');

        if (fwdBtn) {
            fwdBtn.onclick = function () {
                var hotspot = bestHotspotInView(+1);
                if (hotspot && window.triggerGSVTransition) {
                    window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot));
                }
            };
        }
        if (bwdBtn) {
            bwdBtn.onclick = function () {
                var hotspot = bestHotspotInView(-1);
                if (hotspot && window.triggerGSVTransition) {
                    window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot));
                }
            };
        }
    }

    // -------------------------------------------------------------------------
    // getSequentialSceneIds()
    // Retourne les IDs triés numériquement : ['1','2',...,'10']
    // Construit dynamiquement depuis config.js — s'adapte sans modification
    // si on ajoute/retire des scènes.
    // -------------------------------------------------------------------------
    function getSequentialSceneIds() {
        var ids = Object.keys(window.TOUR_CONFIG.scenes);
        ids.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        return ids;
    }

    // -------------------------------------------------------------------------
    // getAdjacentSceneId(direction)
    // direction = +1 → scène suivante  |  -1 → scène précédente
    // Navigation circulaire : 10 → 1  et  1 → 10
    // Retourne null si une seule scène ou config vide.
    // -------------------------------------------------------------------------
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
            var relative = normalizeRelativeAngle(computeArrowAngle(hotspot));
            var forwardScore = Math.abs(relative);
            var backwardScore = Math.abs(Math.abs(relative) - 180);
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

        // En mode VR, on cache les hotspots HTML (car ils sont invisibles dans le casque
        // et polluent l'écran du PC) et on s'assure que les hotspots 3D sont visibles.
        var isVR = window.tourState.isXRActive;
        if (hotspotGroup) {
            hotspotGroup.visible = true; // Toujours visible pour servir de base
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

    function updateGroundHotspots() {
        var camera = window.tourState.camera;
        var targetOpacity = 0;
        var horizontalLength;
        var scale;
        var nearest;
        var bearingRad;

        if (!camera || !groundHotspotEntry) {
            return;
        }

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
                bearingRad = bearingForHotspot(nearest) * Math.PI / 180;
                groundHotspotEntry.hotspot = nearest;
                groundHotspotEntry.ring.position.copy(groundPoint);
                groundHotspotEntry.arrow.position.copy(groundPoint);
                groundHotspotEntry.arrow.position.y += 0.01;
                groundHotspotEntry.ring.rotation.y = bearingRad;
                groundHotspotEntry.arrow.rotation.y = bearingRad;
                groundHotspotEntry.ring.userData.hotspot = nearest;
                groundHotspotEntry.arrow.userData.hotspot = nearest;
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

    function updateFloorHotspot(mouseX, mouseY, sphereLat) {
        // [CORRECTION GSV] suppression de hideFloorHotspot(); return; qui court-circuitaient la fonction
        if (!floorHotspot || !window.tourState.mouseSpherePoint || window.tourState.isTransitioning) {
            return;
        }

        var onFloor = sphereLat < -10;

        // Croix X : visible dès que la souris est sur le sol
        if (cameraMarker) {
            cameraMarker.classList.toggle('visible', onFloor);
        }

        // Flèches directionnelles fixes : visibles sur le sol
        if (dirArrows) {
            dirArrows.classList.toggle('visible', onFloor);
        }

        if (onFloor) {
            var nearest = nearestTransitionHotspot(window.tourState.mouseSpherePoint);
            var screenPoint = nearest ? screenPointForHotspot(nearest) : null;
            if (nearest && screenPoint) {
                floorHotspot.style.left = screenPoint.x + 'px';
                floorHotspot.style.top = screenPoint.y + 'px';
                floorHotspot.style.opacity = '1';
                floorLabel.textContent = nearest.label || window.TOUR_CONFIG.scenes[nearest.target].name;
                window.tourState.activeFloorHotspot = nearest;

                // ---- Rotation directionnelle de la flèche ----
                // computeArrowAngle() retourne l'angle relatif à la vue caméra.
                // On applique la rotation via transform sur le conteneur SVG.
                var angle = computeArrowAngle(nearest);
                var arrow = document.getElementById('floor-arrow-svg');
                if (arrow) {
                    arrow.style.transform = 'rotate(' + angle + 'deg)';
                }
            } else {
                floorHotspot.style.opacity = '0';
                window.tourState.activeFloorHotspot = null;
            }
        } else {
            floorHotspot.style.opacity = '0';
            window.tourState.activeFloorHotspot = null;
        }
    }

    function hideFloorHotspot() {
        if (floorHotspot) {
            floorHotspot.style.opacity = '0';
        }
        if (cameraMarker) {
            cameraMarker.classList.remove('visible');
        }
        if (dirArrows) {
            dirArrows.classList.remove('visible');
        }
        window.tourState.activeFloorHotspot = null;
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
            window.triggerGSVTransition(meshHit.target, bearingForHotspot(meshHit));
            return;
        }

        if (infoHit && window.showInfoCard) {
            window.showInfoCard(infoHit.hotspot, event.clientX, event.clientY);
        }
    }

    function onDoubleClick(event) {
        var meshHit = groundHotspotFromEvent(event);

        if (meshHit && window.triggerGSVTransition) {
            window.triggerGSVTransition(meshHit.target, bearingForHotspot(meshHit));
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
            groundHotspotEntry.opacity > 0.2 &&
            window.tourState.mouseDelta < 5
        ) {
            return groundHotspotEntry.hotspot;
        }

        return null;
    }

    function rayDistanceToPoint(ray, point) {
        var closest = new THREE.Vector3();
        ray.closestPointToPoint(point, closest);
        return closest.distanceTo(point);
    }

    function findHotspotFromRay(ray, types, threshold) {
        var best = null;
        var bestDistance = threshold || 36;

        // On inclut le bouton exit s'il est dans les types recherchés
        var searchHotspots = currentHotspots().concat([{
            type: 'exit',
            positionVector: new THREE.Vector3(0, -60, -150)
        }]);

        searchHotspots.forEach(function (hotspot) {
            if (types.indexOf(hotspot.type) === -1) {
                return;
            }
            var distance = rayDistanceToPoint(ray, hotspot.positionVector);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = hotspot;
            }
        });

        return best;
    }

    function rayFromController(controller) {
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        xrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        xrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        return xrRaycaster.ray;
    }

    function handleXRSelect(controller) {
        var hotspot = findHotspotFromRay(rayFromController(controller), ['transition', 'info', 'exit'], 46);
        if (!hotspot) {
            return;
        }

        if (hotspot.type === 'transition' && window.triggerGSVTransition) {
            window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot));
        } else if (hotspot.type === 'info' && window.showVRInfoPanel) {
            window.showVRInfoPanel(hotspot);
        } else if (hotspot.type === 'exit' && window.exitVR) {
            window.exitVR();
        }
    }

    function updateXRGaze() {
        if (!window.tourState.isXRActive || window.tourState.isTransitioning) {
            return;
        }

        var ray = new THREE.Ray(
            window.tourState.camera.getWorldPosition(new THREE.Vector3()),
            window.tourState.camera.getWorldDirection(new THREE.Vector3())
        );
        var hotspot = findHotspotFromRay(ray, ['transition', 'info', 'exit'], 38);
        var progress = document.getElementById('reticle-progress');

        // Réinitialisation de l'ancien hotspot survolé
        if (window.tourState.gazeTarget && window.tourState.gazeTarget !== hotspot) {
            var oldMarker = getMarkerForHotspot(window.tourState.gazeTarget);
            if (oldMarker) {
                if (oldMarker.material.color) oldMarker.material.color.set(0xffffff);
                if (oldMarker.scale.x > 20) oldMarker.scale.set(20, 20, 1);
            }
        }

        if (!hotspot) {
            window.tourState.gazeTarget = null;
            window.tourState.gazeStartTime = 0;
            progress.classList.remove('active');
            return;
        }

        // Highlight du nouveau hotspot
        var marker = getMarkerForHotspot(hotspot);
        if (marker) {
            if (marker.material.color) marker.material.color.set(0x3B82F6);
        }

        if (window.tourState.gazeTarget !== hotspot) {
            window.tourState.gazeTarget = hotspot;
            window.tourState.gazeStartTime = Date.now();
            progress.classList.add('active');
            return;
        }

        if (hotspot.type === 'transition' && Date.now() - window.tourState.gazeStartTime > 2000) {
            progress.classList.remove('active');
            window.tourState.gazeTarget = null;
            window.triggerGSVTransition(hotspot.target, bearingForHotspot(hotspot));
        } else if (hotspot.type === 'info' && Date.now() - window.tourState.gazeStartTime > 1500) {
            progress.classList.remove('active');
            window.tourState.gazeTarget = null;
            if (window.showVRInfoPanel) {
                window.showVRInfoPanel(hotspot);
            }
        } else if (hotspot.type === 'exit' && Date.now() - window.tourState.gazeStartTime > 1500) {
            progress.classList.remove('active');
            window.tourState.gazeTarget = null;
            if (window.exitVR) {
                window.exitVR();
            }
        }
    }

    function getMarkerForHotspot(hotspot) {
        for (var i = 0; i < hotspotMarkers.length; i++) {
            if (hotspotMarkers[i].hotspot === hotspot) {
                return hotspotMarkers[i].marker;
            }
        }
        return null;
    }

    window.initHotspots = initHotspots;
    window.updateHotspots = updateHotspots;
    window.updateFloorHotspot = updateFloorHotspot;
    window.hideFloorHotspot = hideFloorHotspot;
    window.onValidClick = onValidClick;
    window.onDoubleClick = onDoubleClick;
    window.handleXRSelect = handleXRSelect;
    window.updateXRGaze = updateXRGaze;
    window.findHotspotFromRay = findHotspotFromRay;
    window.rebuildHotspots = initHotspots;
    window.getGroundHotspotMeshes = function () {
        return allGroundHotspotMeshes.slice();
    };
})();
