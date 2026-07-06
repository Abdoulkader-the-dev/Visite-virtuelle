(function () {
    'use strict';

    // =========================================================================
    //  VR UI — HUD with "Exit VR" button properly positioned
    // =========================================================================

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
    var isVRSupported = false;
    var vrButtonElement = null;
    var isEnteringVR = false;

    // ==============================================================
    //  VR UI Positioning - Fixed!
    // ==============================================================
    var UI_DISTANCE = 2.0;      // How far in front of the user
    var UI_HEIGHT_OFFSET = -0.4; // Slightly below eye level

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

    // ==============================================================
    //  Build VR UI - Exit button properly positioned
    // ==============================================================
    function buildVRUI() {
        if (vrUiGroup) { return; }

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

        // Exit button canvas
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');

        // Background with rounded corners
        ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕ Quitter VR', 128, 32);

        var texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        var material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            opacity: 1
        });

        exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), material);
        exitButton.position.set(0, -0.5, -1.8); // In front, slightly below center
        exitButton.userData = { action: 'exitVR', isVRButton: true };
        exitButton.renderOrder = 10;
        vrUiGroup.add(exitButton);

        // Store reference for hotspot.js
        window.vrExitButton = exitButton;

        if (window.tourState && window.tourState.scene) {
            window.tourState.scene.add(vrUiGroup);
        }

        console.log('[VR] UI built');
    }

    function showVRUI() {
        if (!vrUiGroup) { buildVRUI(); }
        if (vrUiGroup) {
            vrUiGroup.visible = true;
            updateVRButtonState(true);
        }
    }

    function hideVRUI() {
        if (vrUiGroup) {
            vrUiGroup.visible = false;
        }
        updateVRButtonState(true);
    }

    function initVRUI() {
        vrButtonElement = document.getElementById('vr-button');
        if (vrButtonElement) {
            var newButton = vrButtonElement.cloneNode(true);
            vrButtonElement.parentNode.replaceChild(newButton, vrButtonElement);
            vrButtonElement = newButton;

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

    function toggleVR() {
        if (isEnteringVR) return;

        if (window.tourState.isXRActive) {
            doExitVR();
        } else {
            enterVR();
        }
    }

    function doExitVR() {
        var renderer = window.tourState.renderer;
        if (!renderer) {
            window.tourState.isXRActive = false;
            updateVRButtonState(true);
            if (window.hideVRUI) window.hideVRUI();
            return;
        }

        var session = renderer.xr.getSession();
        if (session) {
            session.end().then(function () {
                console.log('[VR] Session terminée');
                updateVRButtonState(true);
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

    // ==============================================================
    //  Enter VR - with 'local-floor' for proper height
    // ==============================================================
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

            renderer.xr.setReferenceSpaceType('local-floor');

            navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor']
            }).then(function (session) {
                session.addEventListener('end', function () {
                    console.log('[VR] Session ended via event');
                });

                renderer.xr.setSession(session).then(function () {
                    isEnteringVR = false;
                    showVRUI();
                    updateVRButtonState(true);

                    if (typeof renderer.xr.setFoveation === 'function') {
                        renderer.xr.setFoveation(1);
                    }

                    console.log('[VR] Session démarrée avec local-floor');
                }).catch(function (err) {
                    console.error('[VR] Erreur setSession:', err);
                    isEnteringVR = false;
                    window.tourState.isXRActive = false;
                    updateVRButtonState(true);
                    session.end();
                });
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

    // ==============================================================
    //  Update VR UI - Follows the user's view
    // ==============================================================
    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive) {
            if (vrUiGroup) vrUiGroup.visible = false;
            return;
        }

        var camera = window.tourState.camera;
        if (!camera) return;

        // Get camera position and forward direction
        var position = new THREE.Vector3();
        camera.getWorldPosition(position);

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        // Position UI in front of the user at a fixed distance
        var uiPosition = position.clone().add(forward.clone().multiplyScalar(1.8));
        uiPosition.y -= 0.3; // Slightly below eye level

        vrUiGroup.position.copy(uiPosition);
        vrUiGroup.lookAt(position);
        vrUiGroup.rotateY(Math.PI);
        vrUiGroup.visible = true;

        // Update info panel if visible
        if (vrInfoVisible && vrInfoMesh) {
            updateVRInfoPanelPosition();
        }
    }

    // ==============================================================
    //  VR Info Panel
    // ==============================================================
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
    }

    function showVRInfoPanel(hotspot) {
        if (!vrInfoPanel || !window.tourState.isXRActive) {
            return;
        }

        var canvas = vrInfoPanel.canvas;
        var ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.stroke();

        // Icon circle
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

        // Description with word wrap
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

    function hideVRInfoPanel() {
        if (vrInfoPanel) {
            vrInfoPanel.material.opacity = 0;
            vrInfoPanel.mesh.visible = false;
        }
        vrInfoVisible = false;
    }

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
        panelPosition.y += 0.1;

        vrInfoPanel.mesh.position.copy(panelPosition);
        vrInfoPanel.mesh.lookAt(position);
        vrInfoPanel.mesh.rotateY(Math.PI);
    }

    function checkVRInfoPanelClose(raycaster) {
        if (!vrInfoVisible || !vrInfoPanel) {
            return false;
        }
        var intersects = raycaster.intersectObject(vrInfoPanel.mesh);
        if (intersects.length === 0) {
            return false;
        }
        var uv = intersects[0].uv;
        if (uv) {
            var canvas = vrInfoPanel.canvas;
            var x = uv.x * canvas.width;
            var y = (1 - uv.y) * canvas.height;
            if (x > canvas.width - 60 && x < canvas.width - 20 && y > 20 && y < 60) {
                hideVRInfoPanel();
                return true;
            }
        }
        return true;
    }

    function setupVRButton() {
        if (!vrButtonElement) {
            vrButtonElement = document.getElementById('vr-button');
            if (vrButtonElement) {
                vrButtonElement.addEventListener('click', toggleVR);
            }
        }
        updateVRButtonState(true);
    }

    function getVRButton() {
        if (!vrButtonElement) {
            vrButtonElement = document.getElementById('vr-button');
        }
        return vrButtonElement;
    }

    // ==============================================================
    //  Error handling
    // ==============================================================
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason && event.reason.message ? event.reason.message : '';
        if (reason.indexOf('reference space') !== -1 && window.tourState.isXRActive) {
            console.error('[VR] Reference space error, exiting VR:', reason);
            doExitVR();
        }
    });

    // ==============================================================
    //  EXPOSE
    // ==============================================================
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
    window.setupVRButton = setupVRButton;
    window.exitVR = doExitVR;
    window.checkVRInfoPanelClose = checkVRInfoPanelClose;
    window.getVRButton = getVRButton;
    window.checkVRSupport = checkVRSupport;
    window.updateVRButtonState = updateVRButtonState;

    // Store panel reference for hotspots.js
    window.vrInfoPanel = {
        mesh: vrInfoMesh,
        canvas: vrInfoCanvas,
        texture: vrInfoTexture,
        material: vrInfoMaterial
    };
})();