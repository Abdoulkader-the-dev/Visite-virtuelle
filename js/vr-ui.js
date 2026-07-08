(function () {
    'use strict';

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

    // HUD panel dimensions (Exit button only)
    var PANEL_WIDTH = 0.4;
    var PANEL_HEIGHT = 0.15;
    var PANEL_DISTANCE = 3.0;

    // --------------------------------------------------------------
    //  SUPPORT CHECK
    // --------------------------------------------------------------
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

    // --------------------------------------------------------------
    //  BUILD HUD PANEL TEXTURE
    // --------------------------------------------------------------
    function makeHudPanelTexture(label, accent) {
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 96;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(30, 30, 30, 0.82)';
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 80, 16);
        ctx.fill();

        ctx.strokeStyle = accent || 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 80, 16);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 128, 52);

        var texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    function makeHudPanel(label, accent, action, width, height) {
        var material = new THREE.MeshBasicMaterial({
            map: makeHudPanelTexture(label, accent),
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            opacity: 1
        });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
        mesh.userData = {
            action: action,
            isVRButton: true,
            label: label
        };
        mesh.renderOrder = 10;
        mesh.raycast = THREE.Mesh.prototype.raycast;
        return mesh;
    }

    // --------------------------------------------------------------
    //  BUILD / REBUILD VR UI — only Exit button
    // --------------------------------------------------------------
    function buildVRUI() {
        destroyVRUI();

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

        var dist = PANEL_DISTANCE;

        // Exit button, shifted down (y = -0.2) and resized
        exitButton = makeHudPanel('✕ Quitter VR', 'rgba(239, 68, 68, 0.7)', 'exitVR', PANEL_WIDTH, PANEL_HEIGHT);
        exitButton.position.set(0, -0.2, -dist);
        vrUiGroup.add(exitButton);

        window.vrExitButton = exitButton;
        window.vrHudPanels = [exitButton];

        if (window.tourState && window.tourState.scene) {
            window.tourState.scene.add(vrUiGroup);
        }

        console.log('[VR] 3D HUD rebuilt (Exit VR only)');
    }

    function destroyVRUI() {
        if (vrUiGroup) {
            if (window.tourState && window.tourState.scene) {
                window.tourState.scene.remove(vrUiGroup);
            }
            vrUiGroup.children.forEach(function (child) {
                if (child.material) {
                    if (child.material.map) child.material.map = null;
                    child.material.dispose();
                }
                if (child.geometry) child.geometry.dispose();
            });
            vrUiGroup = null;
        }
        window.vrHudPanels = null;
        window.vrExitButton = null;
        exitButton = null;
    }

    function ensureVRUIReady() {
        if (!window.tourState.isXRActive) return;
        if (!vrUiGroup) {
            buildVRUI();
        }
        if (vrUiGroup) {
            vrUiGroup.visible = true;
            window.vrHudPanels = [exitButton];
        }
    }

    function showVRUI() {
        if (!vrUiGroup) {
            buildVRUI();
        }
        if (vrUiGroup) {
            vrUiGroup.visible = true;
            window.vrHudPanels = [exitButton];
        }
        updateVRButtonState(true);
    }

    function hideVRUI() {
        if (vrUiGroup) {
            vrUiGroup.visible = false;
        }
        updateVRButtonState(true);
    }

    // --------------------------------------------------------------
    //  VR ENTRY / EXIT
    // --------------------------------------------------------------
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

            navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor']
            }).then(function (session) {
                session.addEventListener('end', function () {
                    console.log('[VR] Session ended via event');
                    if (window.tourState.isXRActive) {
                        window.doExitVR();
                    }
                });

                renderer.xr.setSession(session).then(function () {
                    isEnteringVR = false;
                    buildVRUI();
                    showVRUI();
                    updateVRButtonState(true);

                    if (typeof renderer.xr.setFoveation === 'function') {
                        renderer.xr.setFoveation(1);
                    }

                    console.log('[VR] Session démarrée');
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

    function doExitVR() {
        var renderer = window.tourState.renderer;
        if (!renderer) {
            window.tourState.isXRActive = false;
            isEnteringVR = false;
            hideVRUI();
            hideVRInfoPanel();
            updateVRButtonState(true);
            destroyVRUI();
            return;
        }

        var session = renderer.xr.getSession();
        if (session) {
            session.end().then(function () {
                console.log('[VR] Session terminée');
                if (window.clearXRControllers) {
                    window.clearXRControllers();
                }
                hideVRUI();
                hideVRInfoPanel();
                window.tourState.isXRActive = false;
                isEnteringVR = false;
                updateVRButtonState(true);
                destroyVRUI();
                console.log('[VR] Clean exit complete');
            }).catch(function (err) {
                console.error('[VR] Erreur fin de session:', err);
                window.tourState.isXRActive = false;
                isEnteringVR = false;
                hideVRUI();
                hideVRInfoPanel();
                updateVRButtonState(true);
                destroyVRUI();
            });
        } else {
            window.tourState.isXRActive = false;
            isEnteringVR = false;
            hideVRUI();
            hideVRInfoPanel();
            updateVRButtonState(true);
            destroyVRUI();
        }
    }

    function toggleVR() {
        if (isEnteringVR) return;

        if (window.tourState.isXRActive) {
            doExitVR();
        } else {
            enterVR();
        }
    }

    // --------------------------------------------------------------
    //  UPDATE VR UI (position follows head)
    // --------------------------------------------------------------
    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive) {
            if (vrUiGroup) vrUiGroup.visible = false;
            return;
        }

        var camera = window.tourState.camera;
        if (!camera) return;

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        var position = camera.position.clone();
        position.add(forward.clone().multiplyScalar(PANEL_DISTANCE + 0.2));

        vrUiGroup.position.copy(position);
        vrUiGroup.lookAt(camera.position);
        vrUiGroup.rotateY(Math.PI);

        vrUiGroup.visible = true;

        if (vrInfoVisible && vrInfoMesh) {
            updateVRInfoPanelPosition();
        }
    }

    // --------------------------------------------------------------
    //  VR INFO PANEL (unchanged)
    // --------------------------------------------------------------
    function buildVRInfoPanel() {
        if (vrInfoMesh && vrInfoMesh.parent) {
            vrInfoMesh.parent.remove(vrInfoMesh);
        }
        if (vrInfoTexture) {
            vrInfoTexture.dispose();
        }
        if (vrInfoMaterial) {
            vrInfoMaterial.dispose();
        }

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
        window.vrInfoPanel = vrInfoPanel;
    }

    function showVRInfoPanel(hotspot) {
        if (!vrInfoPanel || !window.tourState.isXRActive) {
            return;
        }

        var canvas = vrInfoPanel.canvas;
        var ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 16);
        ctx.stroke();

        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(72, 72, 36, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '42px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hotspot.icon || 'i', 72, 72);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 38px system-ui';
        ctx.fillText(hotspot.title || 'Information', 130, 68);

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

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        var panelPosition = camera.position.clone();
        panelPosition.add(forward.clone().multiplyScalar(2.5));

        vrInfoPanel.mesh.position.copy(panelPosition);
        vrInfoPanel.mesh.lookAt(camera.position);
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

    // --------------------------------------------------------------
    //  SETUP VR BUTTON (2D UI)
    // --------------------------------------------------------------
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

    function initVRUI() {
        vrButtonElement = document.getElementById('vr-button');
        if (vrButtonElement) {
            var newButton = vrButtonElement.cloneNode(true);
            vrButtonElement.parentNode.replaceChild(newButton, vrButtonElement);
            vrButtonElement = newButton;
            vrButtonElement.addEventListener('click', toggleVR);
        }

        buildVRInfoPanel();
        checkVRSupport();
        buildVRUI();
        hideVRUI();
        console.log('[VR] UI initialized');
    }

    // --------------------------------------------------------------
    //  EXPOSE
    // --------------------------------------------------------------
    window.updateVRUI = updateVRUI;
    window.initVRUI = initVRUI;
    window.buildVRUI = buildVRUI;
    window.destroyVRUI = destroyVRUI;
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
    window.ensureVRUIReady = ensureVRUIReady;

    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason && event.reason.message ? event.reason.message : '';
        if (reason.indexOf('reference space') !== -1 && window.tourState.isXRActive) {
            console.error('[VR] Reference space error, exiting VR:', reason);
            doExitVR();
        }
    });
})();