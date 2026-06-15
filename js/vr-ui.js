(function () {
    'use strict';

    // =========================================================================
    //  VR UI — Boutons 3D HUD pour WebXR
    // =========================================================================
    //  Crée des boutons PlaneGeometry avec textures Canvas, attachés à la
    //  caméra (HUD). Détectés par le raycaster XR via userData.action.
    // =========================================================================

    var vrUiGroup = null;
    var vrButtons = [];
    var vrReticle = null;
    var vrReticleMesh = null;

    // -------------------------------------------------------------------------
    //  createButtonTexture() — Génère un canvas avec icône + label
    // -------------------------------------------------------------------------
    function createButtonTexture(label, icon, bgColor, textColor) {
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');

        // Fond arrondi
        ctx.fillStyle = bgColor || 'rgba(30, 30, 30, 0.85)';
        ctx.beginPath();
        ctx.roundRect(4, 4, 248, 120, 16);
        ctx.fill();

        // Bordure subtile
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(4, 4, 248, 120, 16);
        ctx.stroke();

        // Icône (gros, centré gauche)
        ctx.fillStyle = textColor || '#ffffff';
        ctx.font = 'bold 48px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon || '', 70, 64);

        // Label (droite)
        ctx.font = 'bold 28px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(label || '', 120, 64);

        return new THREE.CanvasTexture(canvas);
    }

    // -------------------------------------------------------------------------
    //  createVRButton() — Crée un mesh bouton 3D avec texture Canvas
    // -------------------------------------------------------------------------
    function createVRButton(label, icon, bgColor, action, userData) {
        var texture = createButtonTexture(label, icon, bgColor, '#ffffff');
        var material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), material);
        mesh.userData = Object.assign({ action: action, isVRButton: true }, userData || {});
        mesh.renderOrder = 10;
        return mesh;
    }

    // -------------------------------------------------------------------------
    //  buildVRUI() — Construit le groupe HUD attaché à la caméra
    // -------------------------------------------------------------------------
    function buildVRUI() {
        if (vrUiGroup) { return; }

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

        // ── Bouton Retour ────────────────────────────────────────────
        var backBtn = createVRButton('Retour', '←', 'rgba(60,60,60,0.85)', 'goBack');
        backBtn.position.set(-0.35, -0.5, -1.5);
        vrUiGroup.add(backBtn);
        vrButtons.push(backBtn);

        // ── Bouton Menu Scènes ───────────────────────────────────────
        var menuBtn = createVRButton('Scènes', '☰', 'rgba(60,60,60,0.85)', 'toggleMenu');
        menuBtn.position.set(0.35, -0.5, -1.5);
        vrUiGroup.add(menuBtn);
        vrButtons.push(menuBtn);

        // ── Bouton Quitter VR ────────────────────────────────────────
        var exitBtn = createVRButton('Quitter', '✕', 'rgba(120,30,30,0.85)', 'exitVR');
        exitBtn.position.set(0, -0.8, -1.5);
        vrUiGroup.add(exitBtn);
        vrButtons.push(exitBtn);

        // ── Reticule central (point de visée) ────────────────────────
        var reticleCanvas = document.createElement('canvas');
        reticleCanvas.width = 64;
        reticleCanvas.height = 64;
        var rCtx = reticleCanvas.getContext('2d');
        rCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        rCtx.lineWidth = 2;
        rCtx.beginPath();
        rCtx.arc(32, 32, 20, 0, Math.PI * 2);
        rCtx.stroke();
        rCtx.beginPath();
        rCtx.arc(32, 32, 4, 0, Math.PI * 2);
        rCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        rCtx.fill();

        var reticleTexture = new THREE.CanvasTexture(reticleCanvas);
        var reticleMat = new THREE.MeshBasicMaterial({
            map: reticleTexture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        vrReticleMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), reticleMat);
        vrReticleMesh.position.set(0, 0, -1.5);
        vrReticleMesh.renderOrder = 11;
        vrUiGroup.add(vrReticleMesh);

        // Attacher le HUD à la caméra
        window.tourState.camera.add(vrUiGroup);
    }

    // -------------------------------------------------------------------------
    //  showVRUI() / hideVRUI() — Active/désactive le HUD
    // -------------------------------------------------------------------------
    function showVRUI() {
        if (!vrUiGroup) { buildVRUI(); }
        vrUiGroup.visible = true;
    }

    function hideVRUI() {
        if (vrUiGroup) { vrUiGroup.visible = false; }
    }

    // -------------------------------------------------------------------------
    //  handleXRSelect() — Appelé lors d'un trigger/squeeze sur un contrôleur
    //  Intersecte le rayon XR avec les boutons VR et les hotspots 3D.
    // -------------------------------------------------------------------------
    function handleXRSelect(event) {
        var controller = event.target;
        var tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        var raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        // ── 1. Tester les boutons VR HUD ─────────────────────────────
        if (vrUiGroup && vrUiGroup.visible) {
            var buttonHits = raycaster.intersectObjects(vrButtons, false);
            if (buttonHits.length > 0 && buttonHits[0].distance < 3.0) {
                var hit = buttonHits[0].object;
                executeVRButtonAction(hit.userData.action, hit.userData);
                return;
            }
        }

        // ── 2. Tester les hotspots 3D au sol ─────────────────────────
        if (window.tourState.scene) {
            var allMeshes = [];
            window.tourState.scene.traverse(function (child) {
                if (child.isMesh && child.userData && child.userData.hotspot) {
                    allMeshes.push(child);
                }
            });
            var hotspotHits = raycaster.intersectObjects(allMeshes, false);
            if (hotspotHits.length > 0) {
                var hotspot = hotspotHits[0].object.userData.hotspot;
                if (hotspot && hotspot.type === 'transition' && window.startTransition) {
                    window.startTransition(hotspot.target, { hotspot: hotspot });
                } else if (hotspot && hotspot.type === 'info' && window.showInfoCard) {
                    window.showInfoCard(hotspot, window.innerWidth / 2, window.innerHeight / 2);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    //  executeVRButtonAction() — Exécute l'action associée à un bouton
    // -------------------------------------------------------------------------
    function executeVRButtonAction(action, data) {
        switch (action) {
            case 'goBack':
                if (window.goBack) { window.goBack(); }
                break;
            case 'toggleMenu':
                toggleVRSceneMenu();
                break;
            case 'exitVR':
                if (window.exitVR) { window.exitVR(); }
                break;
            case 'loadScene':
                if (data && data.sceneId && window.startTransition) {
                    window.startTransition(data.sceneId);
                    hideVRSceneMenu();
                }
                break;
            default:
                break;
        }
    }

    // -------------------------------------------------------------------------
    //  Menu Scènes VR — Panneau 3D avec la liste des scènes
    // -------------------------------------------------------------------------
    var vrSceneMenuGroup = null;

    function toggleVRSceneMenu() {
        if (vrSceneMenuGroup && vrSceneMenuGroup.parent) {
            hideVRSceneMenu();
            return;
        }
        showVRSceneMenu();
    }

    function showVRSceneMenu() {
        hideVRSceneMenu();

        vrSceneMenuGroup = new THREE.Group();
        vrSceneMenuGroup.name = 'vr-scene-menu';

        // Fond du panneau
        var bgCanvas = document.createElement('canvas');
        bgCanvas.width = 512;
        bgCanvas.height = 512;
        var bgCtx = bgCanvas.getContext('2d');
        bgCtx.fillStyle = 'rgba(20, 20, 20, 0.92)';
        bgCtx.beginPath();
        bgCtx.roundRect(8, 8, 496, 496, 24);
        bgCtx.fill();
        bgCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        bgCtx.lineWidth = 3;
        bgCtx.beginPath();
        bgCtx.roundRect(8, 8, 496, 496, 24);
        bgCtx.stroke();

        var bgTexture = new THREE.CanvasTexture(bgCanvas);
        var bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
            map: bgTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false
        }));
        vrSceneMenuGroup.add(bgMesh);

        // Boutons de scène (grille 3 colonnes)
        var sceneIds = Object.keys(window.TOUR_CONFIG.scenes);
        var cols = 3;
        var btnW = 0.32;
        var btnH = 0.12;
        var startX = -0.48;
        var startY = 0.4;
        var gapX = 0.04;
        var gapY = 0.04;

        sceneIds.forEach(function (sceneId, index) {
            var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
            var col = index % cols;
            var row = Math.floor(index / cols);

            var btnCanvas = document.createElement('canvas');
            btnCanvas.width = 256;
            btnCanvas.height = 96;
            var bCtx = btnCanvas.getContext('2d');

            var isActive = sceneId === window.tourState.currentScene;
            bCtx.fillStyle = isActive ? 'rgba(59, 130, 246, 0.9)' : 'rgba(60, 60, 60, 0.85)';
            bCtx.beginPath();
            bCtx.roundRect(4, 4, 248, 88, 12);
            bCtx.fill();
            bCtx.strokeStyle = isActive ? 'rgba(120,180,255,0.6)' : 'rgba(255,255,255,0.15)';
            bCtx.lineWidth = 2;
            bCtx.beginPath();
            bCtx.roundRect(4, 4, 248, 88, 12);
            bCtx.stroke();

            bCtx.fillStyle = '#ffffff';
            bCtx.font = 'bold 22px system-ui';
            bCtx.textAlign = 'center';
            bCtx.textBaseline = 'middle';
            bCtx.fillText(sceneConfig.name, 128, 48);

            var btnTexture = new THREE.CanvasTexture(btnCanvas);
            var btnMesh = new THREE.Mesh(new THREE.PlaneGeometry(btnW, btnH), new THREE.MeshBasicMaterial({
                map: btnTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false
            }));
            btnMesh.position.set(startX + col * (btnW + gapX), startY - row * (btnH + gapY), 0.01);
            btnMesh.userData = { action: 'loadScene', sceneId: sceneId, isVRButton: true };
            vrSceneMenuGroup.add(btnMesh);
        });

        // Positionner le panneau devant la caméra
        var camera = window.tourState.camera;
        var direction = camera.getWorldDirection(new THREE.Vector3());
        var pos = camera.getWorldPosition(new THREE.Vector3()).add(direction.multiplyScalar(1.8));
        vrSceneMenuGroup.position.copy(pos);
        vrSceneMenuGroup.quaternion.copy(camera.quaternion);
        vrSceneMenuGroup.renderOrder = 20;

        window.tourState.scene.add(vrSceneMenuGroup);
    }

    function hideVRSceneMenu() {
        if (vrSceneMenuGroup && vrSceneMenuGroup.parent) {
            vrSceneMenuGroup.parent.remove(vrSceneMenuGroup);
        }
    }

    // -------------------------------------------------------------------------
    //  updateVRUIFrame() — Met à jour la position du HUD chaque frame
    // -------------------------------------------------------------------------
    function updateVRUIFrame() {
        if (!vrUiGroup || !vrUiGroup.visible) { return; }
        // Le HUD est attaché à la caméra, il suit automatiquement.
        // On met à jour uniquement le reticule si besoin.
    }

    // -------------------------------------------------------------------------
    //  Intégration : brancher handleXRSelect sur les contrôleurs
    // -------------------------------------------------------------------------
    function initVRUI() {
        buildVRUI();
        hideVRUI();

        // Hook session start/end pour afficher/masquer le HUD
        var renderer = window.tourState.renderer;
        if (renderer) {
            renderer.xr.addEventListener('sessionstart', function () {
                showVRUI();
            });
            renderer.xr.addEventListener('sessionend', function () {
                hideVRUI();
                hideVRSceneMenu();
            });
        }
    }

    window.initVRUI = initVRUI;
    window.handleXRSelect = handleXRSelect;
    window.updateVRUIFrame = updateVRUIFrame;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.showVRSceneMenu = showVRSceneMenu;
    window.hideVRSceneMenu = hideVRSceneMenu;
})();
