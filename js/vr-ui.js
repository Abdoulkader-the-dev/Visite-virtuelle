(function () {
    'use strict';

    // =========================================================================
    //  VR UI — Strict minimum : HUD avec bouton "Quitter VR" uniquement
    // =========================================================================
    //  Aucun menu, aucune grille de scènes, aucun panneau flottant.
    //  La navigation se fait uniquement via la flèche 3D au sol (hotspots.js).
    // =========================================================================

    var vrUiGroup = null;
    var exitButton = null;

    // -------------------------------------------------------------------------
    //  buildVRUI() — Crée le HUD dans la scène mondiale (pas sur la caméra)
    // -------------------------------------------------------------------------
    function buildVRUI() {
        if (vrUiGroup) { return; }

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

        // ── Bouton Quitter VR (petit, discret, en bas du champ de vision) ──
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(30, 30, 30, 0.75)';
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Quitter VR', 128, 32);

        var texture = new THREE.CanvasTexture(canvas);
        var material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), material);
        exitButton.position.set(0, -0.6, -1.5);
        exitButton.userData = { action: 'exitVR', isVRButton: true };
        exitButton.renderOrder = 10;
        vrUiGroup.add(exitButton);

        // Exposer le bouton globalement pour handleXRSelect()
        window.vrExitButton = exitButton;

        window.tourState.scene.add(vrUiGroup);
    }

    // -------------------------------------------------------------------------
    //  showVRUI() / hideVRUI()
    // -------------------------------------------------------------------------
    function showVRUI() {
        if (!vrUiGroup) { buildVRUI(); }
        vrUiGroup.visible = true;
    }

    function hideVRUI() {
        if (vrUiGroup) { vrUiGroup.visible = false; }
    }

    // -------------------------------------------------------------------------
    //  handleXRSelect() — Trigger/squeeze sur un contrôleur
    //  Teste uniquement le bouton Quitter VR.
    // -------------------------------------------------------------------------
    function handleXRSelect(event) {
        var controller = event.target;
        var tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        var raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        if (exitButton) {
            var hits = raycaster.intersectObject(exitButton, false);
            if (hits.length > 0 && hits[0].distance < 3.0) {
                doExitVR();
            }
        }
    }

    // -------------------------------------------------------------------------
    //  doExitVR() — Ferme proprement la session WebXR
    // -------------------------------------------------------------------------
    function doExitVR() {
        var renderer = window.tourState.renderer;
        if (!renderer) { return; }

        var session = renderer.xr.getSession();
        if (session) {
            session.end().then(function () {
                window.tourState.isXRActive = false;
            }).catch(function (err) {
                console.error('[VR] Erreur fin de session:', err);
                window.tourState.isXRActive = false;
            });
        } else {
            window.tourState.isXRActive = false;
        }
    }

    // -------------------------------------------------------------------------
    //  updateVRUI() — Repositionne le HUD devant la caméra chaque frame
    //  Copie position caméra + yaw seulement (pas de pitch/roll).
    // -------------------------------------------------------------------------
    function updateVRUI() {
        if (!vrUiGroup || !vrUiGroup.visible) { return; }

        var camera = window.tourState.camera;

        vrUiGroup.position.copy(camera.position);

        var euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        euler.x = 0;
        euler.z = 0;
        vrUiGroup.quaternion.setFromEuler(euler);

        var forward = new THREE.Vector3(0, 0, -1.5);
        forward.applyQuaternion(vrUiGroup.quaternion);
        vrUiGroup.position.add(forward);
    }

    // -------------------------------------------------------------------------
    //  initVRUI() — Initialisation + hooks session start/end
    // -------------------------------------------------------------------------
    function initVRUI() {
        buildVRUI();
        hideVRUI();

        var renderer = window.tourState.renderer;
        if (renderer) {
            renderer.xr.addEventListener('sessionstart', function () {
                showVRUI();
            });
            renderer.xr.addEventListener('sessionend', function () {
                hideVRUI();
            });
        }
    }

    // -------------------------------------------------------------------------
    //  handleVRJoystick() — Gestion du joystick VR
    // -------------------------------------------------------------------------
    function handleVRJoystick(event) {
        var controller = event.target;
        var axes = event.data.axes;

        if (!axes || axes.length < 2) return;

        var x = axes[0];
        var y = axes[1];
        var deadZone = 0.2;

        // Zone morte
        if (Math.abs(x) < deadZone && Math.abs(y) < deadZone) {
            return;
        }

        // Normaliser
        var magnitude = Math.sqrt(x * x + y * y);
        if (magnitude > 1) {
            x /= magnitude;
            y /= magnitude;
        }

        // Rotation horizontale
        if (Math.abs(x) > deadZone) {
            window.tourState.lon -= x * 1.5;
            window.tourState.lastInteractionTime = Date.now();
        }

        // Avancer/Reculer (cherche un hotspot)
        if (Math.abs(y) > deadZone) {
            var direction = y < 0 ? 1 : -1; // Joystick haut = avancer
            var camera = window.tourState.camera;

            if (camera) {
                // Direction du regard
                var forwardDir = new THREE.Vector3(0, 0, -1);
                forwardDir.applyQuaternion(camera.quaternion);
                forwardDir.y = 0;
                forwardDir.normalize();

                // Chercher un hotspot dans cette direction
                var scene = window.TOUR_CONFIG.scenes[window.tourState.currentScene];
                if (scene && scene.hotspots) {
                    var bestHotspot = null;
                    var bestAngle = Infinity;

                    scene.hotspots.forEach(function (hotspot) {
                        if (hotspot.type !== 'transition') return;

                        var pos = hotspot.positionVector;
                        var dirToHotspot = new THREE.Vector3(pos.x, 0, pos.z).normalize();
                        var dot = forwardDir.dot(dirToHotspot);
                        var angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

                        if (direction < 0) {
                            angle = 180 - angle;
                        }

                        if (angle < bestAngle) {
                            bestAngle = angle;
                            bestHotspot = hotspot;
                        }
                    });

                    if (bestHotspot && bestAngle < 45 && window.triggerGSVTransition) {
                        window.triggerGSVTransition(bestHotspot.target, bearingForHotspot(bestHotspot), { hotspot: bestHotspot });
                    }
                }
            }
        }
    }
    window.handleVRJoystick = handleVRJoystick;
    window.initVRUI = initVRUI;
    window.handleXRSelect = handleXRSelect;
    window.updateVRUI = updateVRUI;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.doExitVR = doExitVR;
})();
