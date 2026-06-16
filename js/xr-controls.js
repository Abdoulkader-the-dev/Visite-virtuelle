(function () {
    'use strict';

    // ========================================================================
    //  XR CONTROLS — Support des joysticks Meta Quest
    // ========================================================================

    var joystickDeadZone = 0.3;
    var moveSpeed = 0.02;
    var rotationSpeed = 0.03;
    var joystickTimers = {};

    function initXRControls() {
        var renderer = window.tourState.renderer;
        if (!renderer) return;

        // ── Écouter les événements des contrôleurs ──
        renderer.xr.addEventListener('sessionstart', function () {
            setupControllerEvents();
        });
    }

    function setupControllerEvents() {
        var renderer = window.tourState.renderer;
        var controllers = window.tourState.xrControllers;

        controllers.forEach(function (controller, index) {
            // Supprimer les anciens écouteurs
            controller.removeEventListener('select', window.handleXRSelect);

            // ── 1. Clic (select) ──
            controller.addEventListener('select', function (event) {
                if (window.handleXRSelect) {
                    window.handleXRSelect(event);
                }
            });

            // ── 2. Joystick (thumbstick) ──
            controller.addEventListener('thumbstickmoved', function (event) {
                handleJoystick(event, index);
            });

            // ── 3. Squeeze (pression latérale) ──
            controller.addEventListener('squeezestart', function (event) {
                handleSqueezeStart(event, index);
            });

            controller.addEventListener('squeezeend', function (event) {
                handleSqueezeEnd(event, index);
            });

            // ── 4. Bouton A / X (touche principale) ──
            controller.addEventListener('buttondown', function (event) {
                if (event.button === 2) { // Bouton A sur Quest
                    handleButtonA(event, index);
                }
            });
        });

        console.log('[XR] Contrôleurs configurés avec joystick support');
    }

    // ========================================================================
    //  GESTION DU JOYSTICK
    // ========================================================================

    function handleJoystick(event, controllerIndex) {
        var x = event.data.axes[0] || 0; // Horizontal
        var y = event.data.axes[1] || 0; // Vertical

        // ── Zone morte ──
        var magnitude = Math.sqrt(x * x + y * y);
        if (magnitude < joystickDeadZone) {
            stopJoystickMovement(controllerIndex);
            return;
        }

        // ── Normaliser ──
        x = x / magnitude;
        y = y / magnitude;

        // ── Directions ──
        var forward = y < -0.3;   // Joystick vers le haut → avancer
        var backward = y > 0.3;   // Joystick vers le bas → reculer
        var left = x < -0.3;      // Joystick vers la gauche → tourner à gauche
        var right = x > 0.3;      // Joystick vers la droite → tourner à droite

        // ── Mouvement continu ──
        if (!joystickTimers[controllerIndex]) {
            joystickTimers[controllerIndex] = {
                forward: false,
                backward: false,
                left: false,
                right: false,
                interval: null
            };
        }

        var state = joystickTimers[controllerIndex];

        // Mettre à jour les états
        state.forward = forward;
        state.backward = backward;
        state.left = left;
        state.right = right;

        // Démarrer l'intervalle si pas encore fait
        if (!state.interval) {
            state.interval = setInterval(function () {
                applyJoystickMovement(controllerIndex);
            }, 50);
        }
    }

    function applyJoystickMovement(controllerIndex) {
        var state = joystickTimers[controllerIndex];
        if (!state) return;

        var camera = window.tourState.camera;
        if (!camera) return;

        // ── Rotation horizontale ──
        if (state.left) {
            window.tourState.lon -= rotationSpeed * 3;
        }
        if (state.right) {
            window.tourState.lon += rotationSpeed * 3;
        }

        // ── Avancer / Reculer ──
        if (state.forward || state.backward) {
            // Obtenir la direction du regard
            var forwardDir = new THREE.Vector3(0, 0, -1);
            forwardDir.applyQuaternion(camera.quaternion);
            forwardDir.y = 0;
            forwardDir.normalize();

            var direction = state.forward ? 1 : -1;
            var distance = moveSpeed * 5;

            // Vérifier s'il y a un hotspot dans la direction
            var hotspot = findHotspotInDirection(forwardDir, direction);

            if (hotspot && window.triggerGSVTransition) {
                // Si un hotspot est détecté, déclencher la transition
                window.triggerGSVTransition(hotspot.target, hotspot.bearing, { hotspot: hotspot });
                stopJoystickMovement(controllerIndex);
            } else {
                // Sinon, déplacer la caméra (simulation de marche)
                camera.position.x += forwardDir.x * distance * direction;
                camera.position.z += forwardDir.z * distance * direction;
            }

            window.tourState.lastInteractionTime = Date.now();
        }
    }

    function stopJoystickMovement(controllerIndex) {
        var state = joystickTimers[controllerIndex];
        if (state && state.interval) {
            clearInterval(state.interval);
            state.interval = null;
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
            // directionSign = 1 pour avancer, -1 pour reculer
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

    function handleSqueezeStart(event, controllerIndex) {
        if (window.goBack) {
            window.goBack();
        }
    }

    function handleSqueezeEnd(event, controllerIndex) {
        // Rien à faire
    }

    // ========================================================================
    //  BOUTON A / X — Ouvrir le menu
    // ========================================================================

    function handleButtonA(event, controllerIndex) {
        var menu = document.getElementById('nav-menu');
        if (menu) {
            menu.classList.toggle('open');
        }
    }

    // ========================================================================
    //  INITIALISATION
    // ========================================================================

    function initXRControls() {
        var renderer = window.tourState.renderer;
        if (!renderer) return;

        renderer.xr.addEventListener('sessionstart', function () {
            // Attendre que les contrôleurs soient prêts
            setTimeout(setupControllerEvents, 500);
        });

        console.log('[XR] Contrôle XR initialisé');
    }

    // Exposer les fonctions
    window.initXRControls = initXRControls;
    window.setupControllerEvents = setupControllerEvents;

})();