(function () {
    'use strict';

    // ========================================================================
    //  XR CONTROLS — Support des joysticks Meta Quest
    //  Rotation gauche/droite : continue (chaque evt thumbstickmoved)
    //  Forward/backward         : ONE-SHOT + cooldown 800ms → trigger hotspot
    //  Select (gâchette)        : géré par main.js (handleXRSelect de hotspots.js)
    // ========================================================================

    var joystickDeadZone = 0.3;
    var rotationSpeed = 0.03;
    var lastTriggerTime = 0;
    var TRIGGER_COOLDOWN = 800;

    var controllerEventsAttached = false;

    function initXRControls() {
        var renderer = window.tourState.renderer;
        if (!renderer) return;

        renderer.xr.addEventListener('sessionstart', function () {
            setupControllerEvents();
        });
    }

    function setupControllerEvents() {
        var controllers = window.tourState.xrControllers;

        // [FIX] Sans ce garde, remettre le casque (2e, 3e... sessionstart)
        // réattachait de nouveaux listeners par-dessus les anciens à chaque
        // fois → chaque mouvement de joystick / gâchette se déclenchait
        // deux, trois, quatre fois en même temps (rotation trop rapide,
        // hotspots qui semblent "buguer" ou se déclencher plusieurs fois).
        if (controllerEventsAttached) {
            return;
        }
        controllerEventsAttached = true;

        controllers.forEach(function (controller, index) {
            // ── 1. Joystick (thumbstick) — rotation continue + trigger hotspot ──
            controller.addEventListener('thumbstickmoved', function (event) {
                handleJoystick(event, index);
            });

            // ── 2. Squeeze (pression latérale) — Retour arrière ──
            controller.addEventListener('squeezestart', handleSqueezeStart);

            // ── 3. Bouton A / X — Ouvrir le menu ──
            controller.addEventListener('buttondown', function (event) {
                if (event.button === 2) { handleButtonA(); }
            });

            // NOTE: 'select' (gâchette) n'est PAS enregistré ici — il est déjà
            //       géré par main.js → setupXRControllers() avec handleXRSelect
            //       de hotspots.js. Ne pas le ré-enregistrer pour éviter le
            //       double appel (appelait handleXRSelect deux fois par clic).
        });

        console.log('[XR] Contrôleurs configurés — joystick rot+trigger, squeeze=retour');
    }

    // ========================================================================
    //  GESTION DU JOYSTICK
    //  axe X (gauche/droite) : rotation fluide à chaque événement
    //  axe Y (haut/bas)       : one-shot + cooldown → déclenche transition
    // ========================================================================

    function handleJoystick(event, controllerIndex) {
        var x = event.data.axes[0] || 0;
        var y = event.data.axes[1] || 0;

        var magnitude = Math.sqrt(x * x + y * y);
        if (magnitude < joystickDeadZone) {
            return;
        }

        // ── Rotation horizontale (gauche/droite) — continue ──
        if (Math.abs(x) > joystickDeadZone) {
            window.tourState.lon += x * rotationSpeed * 3;
            window.tourState.lastInteractionTime = Date.now();
        }

        // ── Forward/backward (haut/bas) — ONE-SHOT avec cooldown ──
        if (Math.abs(y) > joystickDeadZone) {
            var now = Date.now();
            if (now - lastTriggerTime < TRIGGER_COOLDOWN && lastTriggerTime > 0) {
                return;
            }

            var forward = y < -0.3;
            var backward = y > 0.3;

            if (forward || backward) {
                lastTriggerTime = now;
                triggerHotspotInDirection(forward ? 1 : -1);
            }
        }
    }

    function triggerHotspotInDirection(direction) {
        if (window.tourState.isTransitioning) {
            return;
        }

        var camera = window.tourState.camera;
        if (!camera) return;

        var forwardDir = new THREE.Vector3(0, 0, -1);
        forwardDir.applyQuaternion(camera.quaternion);
        forwardDir.y = 0;
        forwardDir.normalize();

        var hotspot = findHotspotInDirection(forwardDir, direction);

        if (hotspot && window.triggerGSVTransition) {
            var bearing = (typeof hotspot.bearing === 'number') ? hotspot.bearing :
                Math.atan2(hotspot.position.x, -hotspot.position.z) * 180 / Math.PI;
            if (bearing < 0) {
                bearing += 360;
            }

            window.triggerGSVTransition(hotspot.target, bearing, { hotspot: hotspot });
            console.log('[XR] Transition declenchee:', hotspot.label, '->', hotspot.target);
        }
    }

    // ========================================================================
    //  RECHERCHE DE HOTSPOT DANS LA DIRECTION
    // ========================================================================

    function findHotspotInDirection(direction, directionSign) {
        var currentScene = window.tourState.currentScene;
        var scene = window.TOUR_CONFIG.scenes[currentScene];
        if (!scene || !scene.hotspots) return null;

        var bestHotspot = null;
        var bestScore = Infinity;

        scene.hotspots.forEach(function (hotspot) {
            if (hotspot.type !== 'transition') return;

            var pos = hotspot.positionVector;
            var dirToHotspot = new THREE.Vector3(pos.x, 0, pos.z).normalize();

            // Calculer l'angle entre la direction du regard et le hotspot
            var dot = direction.dot(dirToHotspot);
            var angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

            // Score : plus l'angle est petit, mieux c'est
            var score = angle;
            if (directionSign < 0) {
                score = 180 - angle; // Privilégier les hotspots derrière
            }

            if (score < bestScore) {
                bestScore = score;
                bestHotspot = hotspot;
            }
        });

        // Seuil : ne détecter que si l'angle est < 45°
        if (bestScore < 45) {
            return bestHotspot;
        }
        return null;
    }

    // ========================================================================
    //  SQUEEZE (pression latérale) — Retour arrière
    // ========================================================================

    function handleSqueezeStart() {
        if (window.goBack) {
            window.goBack();
        }
    }

    // ========================================================================
    //  BOUTON A / X — Ouvrir le menu
    // ========================================================================

    function handleButtonA() {
        var menu = document.getElementById('nav-menu');
        if (menu) {
            menu.classList.toggle('open');
        }
    }

    // Exposer les fonctions
    window.initXRControls = initXRControls;
    window.setupControllerEvents = setupControllerEvents;
})();