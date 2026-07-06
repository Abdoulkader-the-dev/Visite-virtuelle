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
    var controllerEventsAttached = false;

    function initXRControls() {
        var renderer = window.tourState.renderer;
        if (!renderer) return;

        renderer.xr.addEventListener('sessionstart', function () {
            console.log('[XR] Session started');
        });
    }

    // ==============================================================
    //  [FIX] Handle joystick movement - moves arrow in VR
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
        // Fallback for 2D mode (for testing without VR)
        else {
            if (Math.abs(x) > joystickDeadZone) {
                window.tourState.lon += x * 0.03 * 3;
                window.tourState.lastInteractionTime = Date.now();
            }
        }
    }

    // ==============================================================
    //  SQUEEZE (pression latérale) — Retour arrière
    // ==============================================================
    function handleSqueezeStart() {
        if (window.goBack) {
            window.goBack();
        }
    }

    // ==============================================================
    //  BOUTON A / X — Ouvrir le menu
    // ==============================================================
    function handleButtonA() {
        var menu = document.getElementById('nav-menu');
        if (menu) {
            menu.classList.toggle('open');
        }
    }

    // ==============================================================
    //  EXPOSE
    // ==============================================================
    window.initXRControls = initXRControls;
    window.handleXRJoystick = handleXRJoystick;
})();