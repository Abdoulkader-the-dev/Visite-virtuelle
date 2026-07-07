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

    window.initXRControls = initXRControls;
    window.pollXRGamepads = pollXRGamepads;
})();