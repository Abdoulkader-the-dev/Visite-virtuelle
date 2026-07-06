(function () {
    'use strict';

    // ========================================================================
    //  XR CONTROLS — Support des joysticks Meta Quest
    //  Joystick → déplace la flèche au sol (gauche/droite + avant/arrière)
    //  Select (gâchette) → déclenche la transition vers le hotspot visé
    //  Squeeze → retour arrière
    //  Bouton A/X → menu
    // ========================================================================

    var joystickDeadZone = 0.3;

    function initXRControls() {
        // Nothing needed here - events are bound in main.js
        console.log('[XR] Controls initialized');
    }

    // ==============================================================
    //  Handle joystick movement - moves arrow in VR
    // ==============================================================
    function handleXRJoystick(event, controllerIndex) {
        var x = event.data.axes[0] || 0;
        var y = event.data.axes[1] || 0;

        var magnitude = Math.sqrt(x * x + y * y);
        if (magnitude < joystickDeadZone) {
            return;
        }

        // In VR: move the ground arrow with joystick
        if (window.tourState.isXRActive) {
            if (window.moveGroundArrowWithJoystick) {
                window.moveGroundArrowWithJoystick(x, y);
            }
            window.tourState.lastInteractionTime = Date.now();
        }
    }

    // ==============================================================
    //  EXPOSE
    // ==============================================================
    window.initXRControls = initXRControls;
    window.handleXRJoystick = handleXRJoystick;
})();