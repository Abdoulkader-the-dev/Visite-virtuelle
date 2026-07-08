(function () {
    'use strict';

    var joystickDeadZone = 0.3;
    var controllerSetupAttempts = 0;
    var MAX_SETUP_ATTEMPTS = 3;

    function initXRControls() {
        console.log('[XR] Controls module initialized');
    }

    // --------------------------------------------------------------
    //  POLL GAMEPADS (joystick input)
    // --------------------------------------------------------------
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

    // --------------------------------------------------------------
    //  CLEAR — remove ALL controller state
    // --------------------------------------------------------------
    function clearXRControllers() {
        console.log('[XR] Clearing controllers...');

        // 1. Remove all controllers from the scene
        if (window.tourState.xrControllers) {
            window.tourState.xrControllers.forEach(function (ctrl) {
                if (ctrl && ctrl.parent) {
                    ctrl.removeFromParent();
                }
                // Dispose children (lasers, models, etc.)
                while (ctrl && ctrl.children.length > 0) {
                    var child = ctrl.children[0];
                    ctrl.remove(child);
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (child.material.map) child.material.map = null;
                        child.material.dispose();
                    }
                }
            });
            window.tourState.xrControllers = [];
        }

        // 2. Clear lasers (via xr-laser module)
        if (window.clearXRLasers) {
            window.clearXRLasers();
        }

        // 3. CLEAR THREE.JS CONTROLLER CACHE — key for re-entry
        var renderer = window.tourState.renderer;
        if (renderer && renderer.xr && renderer.xr.controllers) {
            renderer.xr.controllers = [];
            console.log('[XR] Three.js controller cache cleared');
        }

        controllerSetupAttempts = 0;
        console.log('[XR] Controllers cleared completely');
    }

    // --------------------------------------------------------------
    //  SETUP — create fresh controllers with event listeners
    // --------------------------------------------------------------
    function setupXRControllers() {
        console.log('[XR] Setting up controllers (attempt ' + (controllerSetupAttempts + 1) + ')');

        clearXRControllers();

        var renderer = window.tourState.renderer;
        if (!renderer) {
            console.error('[XR] No renderer available');
            return;
        }

        var controllers = [];

        for (var i = 0; i < 2; i++) {
            var controller = renderer.xr.getController(i);

            if (!controller) {
                console.warn('[XR] Controller ' + i + ' not available');
                continue;
            }

            controller.userData = { index: i, active: true };

            window.tourState.scene.add(controller);

            // Remove any previous listeners by cloning? Better to use fresh controller.
            // We'll attach new listeners.

            controller.addEventListener('selectstart', function onSelectStart(event) {
                if (!window.tourState.isXRActive) {
                    console.warn('[XR] Select event ignored (not in VR)');
                    return;
                }
                console.log('[XR] Trigger pressed on controller ' + (this.userData ? this.userData.index : '?'));
                if (window.handleXRSelect) {
                    window.handleXRSelect(this);
                }
            });

            controller.addEventListener('squeezestart', function onSqueezeStart() {
                if (!window.tourState.isXRActive) return;
                console.log('[XR] Grip pressed');
                if (window.goBack) {
                    window.goBack();
                }
            });

            controller.addEventListener('buttondown', function onButtonDown(event) {
                if (!window.tourState.isXRActive) return;
                if (event.button === 2) {
                    console.log('[XR] Menu button pressed');
                    var menu = document.getElementById('nav-menu');
                    if (menu) {
                        menu.classList.toggle('open');
                    }
                }
            });

            controllers.push(controller);
            console.log('[XR] Controller ' + i + ' initialized');
        }

        window.tourState.xrControllers = controllers;
        console.log('[XR] ' + controllers.length + ' controller(s) ready');

        if (window.setupXRLasers) {
            window.setupXRLasers(controllers);
        }

        if (window.ensureVRUIReady) {
            window.ensureVRUIReady();
        }

        controllerSetupAttempts = 0;
    }

    // --------------------------------------------------------------
    //  FORCE SETUP — called from main.js on session start
    // --------------------------------------------------------------
    function ensureControllersReady() {
        if (window.tourState.isXRActive) {
            if (window.tourState.xrControllers && window.tourState.xrControllers.length > 0) {
                console.log('[XR] Re-initializing controllers (fresh session)');
                clearXRControllers();
                setTimeout(function () {
                    setupXRControllers();
                }, 50);
            } else {
                setupXRControllers();
            }
        } else {
            console.log('[XR] Not in VR, skipping controller setup');
        }
    }

    // --------------------------------------------------------------
    //  EXPOSE
    // --------------------------------------------------------------
    window.initXRControls = initXRControls;
    window.pollXRGamepads = pollXRGamepads;
    window.clearXRControllers = clearXRControllers;
    window.setupXRControllers = setupXRControllers;
    window.ensureControllersReady = ensureControllersReady;
})();