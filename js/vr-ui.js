(function () {
    'use strict';

    // =========================================================================
    //  VR UI — Strict minimum : HUD avec bouton "Quitter VR" uniquement
    // =========================================================================
    //  Aucun menu, aucune grille de scènes, aucun panneau flottant.
    //  La navigation se fait uniquement via la flèche 3D au sol (hotspots.js).
    // =========================================================================

    // Polyfill for roundRect
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
            var r = typeof radii === 'number' ? radii : (radii || 0);
            this.moveTo(x + r, y);
            this.arcTo(x + w, y, x + w, y + h, r);
            this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r);
            this.arcTo(x, y, x + w, y, r);
            return this;
        };
    }

    var vrUiGroup = null;
    var exitButton = null;
    var vrInfoPanel = null;
    var vrInfoCanvas = null;
    var vrInfoTexture = null;
    var vrInfoMaterial = null;
    var vrInfoMesh = null;
    var vrInfoVisible = false;
    var currentHotspot = null;
    var textureLoader = null;
    var hudEuler = new THREE.Euler();
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

        window.tourState.scene.add(vrUiGroup);
    }

    // -------------------------------------------------------------------------
    //  showVRUI() / hideVRUI()
    // -------------------------------------------------------------------------
    function showVRUI() {
        if (!vrUiGroup) { buildVRUI(); }
        if (vrUiGroup) { vrUiGroup.visible = true; }
    }

    function hideVRUI() {
        if (vrUiGroup) { vrUiGroup.visible = false; }
    }

    // -------------------------------------------------------------------------
    //  initVRUI() — Initialisation du VR UI
    // -------------------------------------------------------------------------
    function initVRUI() {
        buildVRUI();
        hideVRUI();
        buildVRInfoPanel();
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
                hideVRUI();
                hideVRInfoPanel();
            }).catch(function (err) {
                console.error('[VR] Erreur fin de session:', err);
                window.tourState.isXRActive = false;
                hideVRUI();
                hideVRInfoPanel();
            });
        } else {
            window.tourState.isXRActive = false;
            hideVRUI();
            hideVRInfoPanel();
        }
    }

    // -------------------------------------------------------------------------
    //  updateVRUI() — Repositionne le HUD devant la caméra chaque frame
    // -------------------------------------------------------------------------
    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive) {
            return;
        }

        var camera = window.tourState.camera;
        var position = new THREE.Vector3();
        camera.getWorldPosition(position);

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        var hudPosition = position.clone().add(forward.clone().multiplyScalar(1.5));
        hudPosition.y -= 0.6;

        vrUiGroup.position.copy(hudPosition);
        vrUiGroup.lookAt(camera.position);
        vrUiGroup.rotateY(Math.PI);
        vrUiGroup.visible = true;

        // Update VR info panel if visible
        if (vrInfoVisible && vrInfoMesh) {
            updateVRInfoPanelPosition();
        }
    }

    // -------------------------------------------------------------------------
    //  buildVRInfoPanel() — Crée le panneau d'information VR
    // -------------------------------------------------------------------------
    function buildVRInfoPanel() {
        vrInfoCanvas = document.createElement('canvas');
        vrInfoCanvas.width = 768;
        vrInfoCanvas.height = 384;

        vrInfoTexture = new THREE.CanvasTexture(vrInfoCanvas);
        vrInfoMaterial = new THREE.MeshBasicMaterial({
            map: vrInfoTexture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            opacity: 0
        });

        vrInfoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), vrInfoMaterial);
        vrInfoMesh.renderOrder = 5;
        vrInfoMesh.visible = false;
        window.tourState.scene.add(vrInfoMesh);

        vrInfoPanel = {
            mesh: vrInfoMesh,
            canvas: vrInfoCanvas,
            texture: vrInfoTexture,
            material: vrInfoMaterial
        };
    }

    // -------------------------------------------------------------------------
    //  showVRInfoPanel() — Affiche le panneau d'information VR
    // -------------------------------------------------------------------------
    function showVRInfoPanel(hotspot) {
        if (!vrInfoPanel || !window.tourState.isXRActive) {
            return;
        }

        currentHotspot = hotspot;
        var canvas = vrInfoPanel.canvas;
        var ctx = canvas.getContext('2d');

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.stroke();

        // Icon
        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(72, 72, 36, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '42px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hotspot.icon || 'i', 72, 72);

        // Title
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 38px system-ui';
        ctx.fillText(hotspot.title || 'Information', 130, 68);

        // Description
        ctx.font = '28px system-ui';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        var words = (hotspot.description || '').split(' ');
        var line = '';
        var y = 140;
        for (var i = 0; i < words.length; i += 1) {
            var test = line + words[i] + ' ';
            if (ctx.measureText(test).width > 560 && i > 0) {
                ctx.fillText(line, 40, y);
                line = words[i] + ' ';
                y += 44;
            } else {
                line = test;
            }
        }
        ctx.fillText(line, 40, y);

        // Close button
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(canvas.width - 60, 20, 40, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('✕', canvas.width - 40, 42);

        vrInfoPanel.texture.needsUpdate = true;
        vrInfoPanel.material.opacity = 1;
        vrInfoPanel.mesh.visible = true;
        vrInfoVisible = true;

        updateVRInfoPanelPosition();
    }

    // -------------------------------------------------------------------------
    //  hideVRInfoPanel() — Cache le panneau d'information VR
    // -------------------------------------------------------------------------
    function hideVRInfoPanel() {
        if (vrInfoPanel) {
            vrInfoPanel.material.opacity = 0;
            vrInfoPanel.mesh.visible = false;
        }
        vrInfoVisible = false;
        currentHotspot = null;
    }

    // -------------------------------------------------------------------------
    //  updateVRInfoPanelPosition() — Positionne le panneau d'information VR
    // -------------------------------------------------------------------------
    function updateVRInfoPanelPosition() {
        if (!vrInfoVisible || !vrInfoPanel || !window.tourState.isXRActive) {
            return;
        }

        var camera = window.tourState.camera;
        var position = new THREE.Vector3();
        camera.getWorldPosition(position);

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        var panelPosition = position.clone().add(forward.clone().multiplyScalar(2.5));
        panelPosition.y += 0.2;

        vrInfoPanel.mesh.position.copy(panelPosition);
        vrInfoPanel.mesh.lookAt(camera.position);
        vrInfoPanel.mesh.rotateY(Math.PI);
    }

    // -------------------------------------------------------------------------
    //  updateVRInfoPanelFrame() — Met à jour le frame du panneau VR
    // -------------------------------------------------------------------------
    function updateVRInfoPanelFrame() {
        // This is called from the render loop to keep the panel updated
        if (vrInfoVisible && vrInfoPanel) {
            updateVRInfoPanelPosition();
        }
    }

    // -------------------------------------------------------------------------
    //  setupVRButton() — Configure le bouton VR
    // -------------------------------------------------------------------------
    function setupVRButton() {
        var vrButton = document.getElementById('vr-btn');
        if (!vrButton) { return; }

        // Remove existing listeners to avoid duplicates
        var newButton = vrButton.cloneNode(true);
        vrButton.parentNode.replaceChild(newButton, vrButton);
        vrButton = newButton;

        vrButton.addEventListener('click', function () {
            if (window.tourState.isXRActive) {
                doExitVR();
            } else {
                enterVR();
            }
        });
    }

    // -------------------------------------------------------------------------
    //  enterVR() — Entre en mode VR
    // -------------------------------------------------------------------------
    function enterVR() {
        var renderer = window.tourState.renderer;
        if (!renderer || !renderer.xr) {
            console.error('[VR] Renderer XR non disponible');
            return;
        }

        if (!navigator.xr) {
            console.error('[VR] WebXR non supporté');
            return;
        }

        navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
            if (!supported) {
                console.error('[VR] Mode VR non supporté sur ce périphérique');
                return;
            }

            renderer.xr.setSession(null);

            navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor', 'hand-tracking']
            }).then(function (session) {
                renderer.xr.setSession(session);
                showVRUI();
            }).catch(function (err) {
                console.error('[VR] Erreur démarrage session:', err);
            });
        });
    }

    // -------------------------------------------------------------------------
    //  setupXRControllers() — Gère les contrôleurs XR
    // -------------------------------------------------------------------------
    function setupXRControllers() {
        var renderer = window.tourState.renderer;
        if (!renderer || !renderer.xr) return;

        renderer.xr.addEventListener('select', function (event) {
            var controller = event.target;
            if (!controller || !exitButton) return;

            var raycaster = new THREE.Raycaster();
            var tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

            var intersects = raycaster.intersectObject(exitButton);
            if (intersects.length > 0) {
                doExitVR();
                return;
            }

            // Check for info panel click
            if (vrInfoVisible && vrInfoPanel) {
                var panelIntersects = raycaster.intersectObject(vrInfoPanel.mesh);
                if (panelIntersects.length > 0) {
                    // Check if close button was clicked
                    var uv = panelIntersects[0].uv;
                    if (uv) {
                        var canvas = vrInfoPanel.canvas;
                        var x = uv.x * canvas.width;
                        var y = (1 - uv.y) * canvas.height;
                        // Close button area (top-right corner)
                        if (x > canvas.width - 60 && x < canvas.width - 20 &&
                            y > 20 && y < 60) {
                            hideVRInfoPanel();
                        }
                    }
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    //  roundedCardCanvas() — Crée un canvas pour les cartes d'information VR
    // -------------------------------------------------------------------------
    function roundedCardCanvas(hotspot) {
        var canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 384;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.stroke();

        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(72, 78, 42, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '48px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hotspot.icon || 'i', 72, 78);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px system-ui';
        ctx.fillText(hotspot.title || 'Information', 140, 72);

        ctx.font = '28px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        var words = (hotspot.description || '').split(' ');
        var line = '';
        var y = 150;
        for (var i = 0; i < words.length; i += 1) {
            var test = line + words[i] + ' ';
            if (ctx.measureText(test).width > 560 && i > 0) {
                ctx.fillText(line, 58, y);
                line = words[i] + ' ';
                y += 40;
            } else {
                line = test;
            }
        }
        ctx.fillText(line, 58, y);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(676, 22, 58, 58);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('×', 705, 53);

        return canvas;
    }

    // Exposer les fonctions globalement
    window.loadScene = window.loadScene || function () { console.warn('loadScene not defined'); };
    window.preloadAllScenes = window.preloadAllScenes || function () { };
    window.updateCameraLookAt = window.updateCameraLookAt || function () { };
    window.createSphere = window.createSphere || function () { };
    window.updateVRUI = updateVRUI;
    window.initVRUI = initVRUI;
    window.buildVRUI = buildVRUI;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.doExitVR = doExitVR;
    window.showVRInfoPanel = showVRInfoPanel;
    window.hideVRInfoPanel = hideVRInfoPanel;
    window.updateVRInfoPanelFrame = updateVRInfoPanelFrame;
    window.setupVRButton = setupVRButton;
    window.exitVR = doExitVR;
    window.enterVR = enterVR;
    window.setupXRControllers = setupXRControllers;
    window.roundedCardCanvas = roundedCardCanvas;

})();