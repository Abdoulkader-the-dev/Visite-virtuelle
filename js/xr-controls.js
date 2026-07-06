(function () {
    'use strict';

    // ========================================================================
    //  XR CONTROLS — Meta Quest controller support
    // ========================================================================

    var joystickDeadZone = 0.3;

    function initXRControls() {
        console.log('[XR] Controls module initialized');
    }

    function handleXRJoystick(event, controllerIndex) {
        var x = event.data.axes[0] || 0;
        var y = event.data.axes[1] || 0;

        var magnitude = Math.sqrt(x * x + y * y);
        if (magnitude < joystickDeadZone) {
            return;
        }

        if (window.tourState.isXRActive) {
            if (window.moveGroundArrowWithJoystick) {
                window.moveGroundArrowWithJoystick(x, y);
            }
            window.tourState.lastInteractionTime = Date.now();
        }
    }

    window.initXRControls = initXRControls;
    window.handleXRJoystick = handleXRJoystick;
})();