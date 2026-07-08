(function () {
    'use strict';

    // ========================================================================
    //  XR CONTROLS — Meta Quest controller support
    // ========================================================================

    var joystickDeadZone = 0.3;

    function initXRControls() {
        console.log('[XR] Controls module initialized');
    }

    /**
     * Polling des gamepads XR pour lire les joysticks.
     * Cette fonction est appelée à chaque frame en mode VR.
     */
    function pollXRGamepads() {
        if (!window.tourState.isXRActive) return;

        var renderer = window.tourState.renderer;
        if (!renderer) return;

        var session = renderer.xr.getSession();
        if (!session) return;

        var inputSources = session.inputSources;
        if (!inputSources) return;

        for (var i = 0; i < inputSources.length; i++) {
            var source = inputSources[i];
            var gamepad = source.gamepad;
            if (!gamepad) continue;

            var axes = gamepad.axes;
            if (axes && axes.length >= 2) {
                var x = axes[0] || 0;
                var y = axes[1] || 0;
                var magnitude = Math.sqrt(x * x + y * y);

                if (magnitude > joystickDeadZone) {
                    if (window.moveGroundArrowWithJoystick) {
                        window.moveGroundArrowWithJoystick(x, y);
                    }
                    window.tourState.lastInteractionTime = Date.now();
                }
            }
        }
    }

    /**
     * Cleanup – remove all controller objects and clear the array.
     * Also clears lasers via the global function.
     */
    function clearXRControllers() {
        if (window.tourState.xrControllers) {
            window.tourState.xrControllers.forEach(function (ctrl) {
                if (ctrl && ctrl.parent) {
                    ctrl.removeFromParent();
                }
                // Also remove any children (lasers, etc.)
                while (ctrl && ctrl.children.length > 0) {
                    var child = ctrl.children[0];
                    ctrl.remove(child);
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }
            });
            window.tourState.xrControllers = [];
        }
        // Also clear lasers if the module is loaded
        if (window.clearXRLasers) {
            window.clearXRLasers();
        }
    }

    /**
     * Setup controllers – called on sessionstart.
     * Cleans up any old ones first, then creates fresh controllers.
     */
    function setupXRControllers() {
        clearXRControllers(); // ensure clean slate

        var renderer = window.tourState.renderer;
        if (!renderer) return;

        var controllers = [];
        for (var i = 0; i < 2; i++) {
            var controller = renderer.xr.getController(i);
            controller.userData = { index: i };

            // Add to scene
            window.tourState.scene.add(controller);

            // SELECT (Trigger)
            controller.addEventListener('selectstart', function (event) {
                console.log('[XR] Trigger pressed');
                if (window.handleXRSelect) {
                    window.handleXRSelect(this);
                }
            });

            // SQUEEZE (Grip)
            controller.addEventListener('squeezestart', function () {
                console.log('[XR] Grip pressed');
                if (window.goBack) {
                    window.goBack();
                }
            });

            // BUTTON A/X
            controller.addEventListener('buttondown', function (event) {
                if (event.button === 2) {
                    console.log('[XR] Button A/X pressed');
                    var menu = document.getElementById('nav-menu');
                    if (menu) {
                        menu.classList.toggle('open');
                    }
                }
            });

            controllers.push(controller);
        }

        window.tourState.xrControllers = controllers;
        console.log('[XR] Meta Quest controllers initialized (joystick via polling)');

        // Setup lasers after controllers exist
        if (window.setupXRLasers) {
            window.setupXRLasers(controllers);
        }
    }

    // Expose
    window.initXRControls = initXRControls;
    window.pollXRGamepads = pollXRGamepads;
    window.clearXRControllers = clearXRControllers;
    window.setupXRControllers = setupXRControllers;
})();