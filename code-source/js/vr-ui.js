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
    var hudEuler = new THREE.Euler(); // [PERF] réutilisé chaque frame, plus de "new" dans updateVRUI()
    var hudForward = new THREE.Vector3();

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

        hudEuler.setFromQuaternion(camera.quaternion, 'YXZ');
        hudEuler.x = 0;
        hudEuler.z = 0;
        vrUiGroup.quaternion.setFromEuler(hudEuler);

        hudForward.set(0, 0, -1.5).applyQuaternion(vrUiGroup.quaternion);
        vrUiGroup.position.add(hudForward);
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

    window.initVRUI = initVRUI;
    window.updateVRUI = updateVRUI;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.doExitVR = doExitVR;
})();