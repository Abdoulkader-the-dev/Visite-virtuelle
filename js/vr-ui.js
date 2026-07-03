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
    var isVRSupported = false;
    var vrButtonElement = null;
    var isEnteringVR = false;

    // -------------------------------------------------------------------------
    //  checkVRSupport() — Vérifie si WebXR est supporté
    // -------------------------------------------------------------------------
    function checkVRSupport() {
        if (!navigator.xr) {
            console.warn('[VR] WebXR non supporté');
            updateVRButtonState(false);
            return false;
        }

        navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
            isVRSupported = supported;
            if (!supported) {
                console.warn('[VR] Mode VR non supporté sur ce périphérique');
                updateVRButtonState(false);
            } else {
                updateVRButtonState(true);
            }
        }).catch(function (err) {
            console.warn('[VR] Erreur vérification support:', err);
            isVRSupported = false;
            updateVRButtonState(false);
        });

        return true;
    }

    // -------------------------------------------------------------------------
    //  updateVRButtonState() — Met à jour l'état du bouton VR
    // -------------------------------------------------------------------------
    function updateVRButtonState(available) {
        if (!vrButtonElement) {
            vrButtonElement = document.getElementById('vr-button');
        }

        if (!vrButtonElement) return;

        if (!available && !window.tourState.isXRActive) {
            vrButtonElement.style.display = 'none';
            return;
        }

        vrButtonElement.style.display = 'block';

        if (window.tourState.isXRActive) {
            vrButtonElement.textContent = '✕ Quitter VR';
            vrButtonElement.classList.add('active');
            vrButtonElement.setAttribute('aria-label', 'Quitter le mode VR');
        } else {
            vrButtonElement.textContent = '🥽 VR';
            vrButtonElement.classList.remove('active');
            vrButtonElement.setAttribute('aria-label', 'Entrer en mode VR');
        }
    }

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

        if (window.tourState && window.tourState.scene) {
            window.tourState.scene.add(vrUiGroup);
        }
    }

    // -------------------------------------------------------------------------
    //  showVRUI() / hideVRUI()
    // -------------------------------------------------------------------------
    function showVRUI() {
        if (!vrUiGroup) { buildVRUI(); }
        if (vrUiGroup) {
            vrUiGroup.visible = true;
            // Also update the VR button
            updateVRButtonState(true);
        }
    }

    function hideVRUI() {
        if (vrUiGroup) {
            vrUiGroup.visible = false;
            // Also update the VR button
            updateVRButtonState(true);
        }
    }

    // -------------------------------------------------------------------------
    //  initVRUI() — Initialisation du VR UI
    // -------------------------------------------------------------------------
    function initVRUI() {
        // Find the VR button
        vrButtonElement = document.getElementById('vr-button');
        if (vrButtonElement) {
            // Remove any existing listeners
            var newButton = vrButtonElement.cloneNode(true);
            vrButtonElement.parentNode.replaceChild(newButton, vrButtonElement);
            vrButtonElement = newButton;

            // Add click listener
            vrButtonElement.addEventListener('click', function (e) {
                e.preventDefault();
                toggleVR();
            });
        }

        buildVRUI();
        hideVRUI();
        buildVRInfoPanel();
        checkVRSupport();
    }

    // -------------------------------------------------------------------------
    //  toggleVR() — Bascule entre mode VR et normal
    // -------------------------------------------------------------------------
    function toggleVR() {
        if (isEnteringVR) return;

        if (window.tourState.isXRActive) {
            doExitVR();
        } else {
            enterVR();
        }
    }

    // -------------------------------------------------------------------------
    //  doExitVR() — Ferme proprement la session WebXR
    // -------------------------------------------------------------------------
    function doExitVR() {
        var renderer = window.tourState.renderer;
        if (!renderer) {
            window.tourState.isXRActive = false;
            updateVRButtonState(true);
            return;
        }

        var session = renderer.xr.getSession();
        if (session) {
            session.end().then(function () {
                window.tourState.isXRActive = false;
                isEnteringVR = false;
                hideVRUI();
                hideVRInfoPanel();
                updateVRButtonState(true);
                console.log('[VR] Session terminée');
            }).catch(function (err) {
                console.error('[VR] Erreur fin de session:', err);
                window.tourState.isXRActive = false;
                isEnteringVR = false;
                hideVRUI();
                hideVRInfoPanel();
                updateVRButtonState(true);
            });
        } else {
            window.tourState.isXRActive = false;
            isEnteringVR = false;
            hideVRUI();
            hideVRInfoPanel();
            updateVRButtonState(true);
        }
    }

    // -------------------------------------------------------------------------
    //  enterVR() — Entre en mode VR
    // -------------------------------------------------------------------------
    function enterVR() {
        if (isEnteringVR) return;

        var renderer = window.tourState.renderer;
        if (!renderer || !renderer.xr) {
            console.error('[VR] Renderer XR non disponible');
            return;
        }

        if (!navigator.xr) {
            console.error('[VR] WebXR non supporté');
            return;
        }

        isEnteringVR = true;
        updateVRButtonState(false);

        navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
            if (!supported) {
                console.error('[VR] Mode VR non supporté sur ce périphérique');
                isEnteringVR = false;
                updateVRButtonState(true);
                return;
            }

            // Clear any existing session
            renderer.xr.setSession(null);

            navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor']
            }).then(function (session) {
                renderer.xr.setSession(session);
                window.tourState.isXRActive = true;
                isEnteringVR = false;
                showVRUI();
                updateVRButtonState(true);
                console.log('[VR] Session démarrée');
            }).catch(function (err) {
                console.error('[VR] Erreur démarrage session:', err);
                isEnteringVR = false;
                window.tourState.isXRActive = false;
                updateVRButtonState(true);
            });
        }).catch(function (err) {
            console.error('[VR] Erreur vérification support:', err);
            isEnteringVR = false;
            updateVRButtonState(true);
        });
    }

    // -------------------------------------------------------------------------
    //  updateVRUI() — Repositionne le HUD devant la caméra chaque frame
    // -------------------------------------------------------------------------
    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive) {
            return;
        }

        var camera = window.tourState.camera;
        if (!camera) return;

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

        if (window.tourState && window.tourState.scene) {
            window.tourState.scene.add(vrInfoMesh);
        }

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
        if (!camera) return;

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
    //  setupVRButton() — Configure le bouton VR (appelé depuis ui.js)
    // -------------------------------------------------------------------------
    function setupVRButton() {
        // Button is already set up in initVRUI
        // This is just a placeholder for compatibility
        if (!vrButtonElement) {
            vrButtonElement = document.getElementById('vr-button');
            if (vrButtonElement) {
                vrButtonElement.addEventListener('click', toggleVR);
            }
        }
        updateVRButtonState(true);
    }

    // -------------------------------------------------------------------------
    //  setupXRControllers() — Gère les contrôleurs XR
    // -------------------------------------------------------------------------
    function setupXRControllers() {
        var renderer = window.tourState.renderer;
        if (!renderer || !renderer.xr) return;

        // Remove existing listeners to avoid duplicates
        renderer.xr.removeAllListeners('select');
        renderer.xr.removeAllListeners('sessionstart');
        renderer.xr.removeAllListeners('sessionend');

        renderer.xr.addEventListener('sessionstart', function () {
            window.tourState.isXRActive = true;
            showVRUI();
            updateVRButtonState(true);
            console.log('[VR] Session started');
        });

        renderer.xr.addEventListener('sessionend', function () {
            window.tourState.isXRActive = false;
            isEnteringVR = false;
            hideVRUI();
            hideVRInfoPanel();
            updateVRButtonState(true);
            console.log('[VR] Session ended');
        });

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

    // -------------------------------------------------------------------------
    //  getVRButton() — Retourne le bouton VR
    // -------------------------------------------------------------------------
    function getVRButton() {
        if (!vrButtonElement) {
            vrButtonElement = document.getElementById('vr-button');
        }
        return vrButtonElement;
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
    window.enterVR = enterVR;
    window.toggleVR = toggleVR;
    window.showVRInfoPanel = showVRInfoPanel;
    window.hideVRInfoPanel = hideVRInfoPanel;
    window.updateVRInfoPanelFrame = updateVRInfoPanelFrame;
    window.setupVRButton = setupVRButton;
    window.exitVR = doExitVR;
    window.setupXRControllers = setupXRControllers;
    window.roundedCardCanvas = roundedCardCanvas;
    window.getVRButton = getVRButton;
    window.checkVRSupport = checkVRSupport;
    window.updateVRButtonState = updateVRButtonState;

})();