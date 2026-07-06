(function () {
    'use strict';

    // =========================================================================
    //  VR UI — Strict minimum : HUD avec bouton "Quitter VR" uniquement
    // =========================================================================
    //  Aucun menu, aucune grille de scènes, aucun panneau flottant.
    //  La navigation se fait uniquement via la flèche 3D au sol (hotspots.js)
    //  et le joystick (xr-controls.js). Le "select" (gâchette) est câblé
    //  depuis main.js → setupXRControllers() vers handleXRSelect (hotspots.js).
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
    var currentHotspot = null;
    var isVRSupported = false;
    var vrButtonElement = null;
    var isEnteringVR = false;

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

    function buildVRUI() {
        if (vrUiGroup) { return; }

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

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

        // [FIX] Sans cette ligne, hotspots.js → handleXRSelect() ne pouvait
        // jamais tester le bouton "Quitter VR" (window.vrExitButton restait
        // undefined en permanence) — le bouton était visible mais inerte.
        window.vrExitButton = exitButton;

        if (window.tourState && window.tourState.scene) {
            window.tourState.scene.add(vrUiGroup);
        }
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
            updateVRButtonState(true);
        }
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

            // [FIX] Sans cette ligne, WebXRManager demande 'local-floor' par
            // défaut en interne (référence par défaut de Three.js r128), une
            // feature jamais négociée dans requestSession() ci-dessous puisqu'on
            // ne demande que 'local' → requestReferenceSpace('local-floor')
            // rejette silencieusement → la session meurt aussitôt sur le Quest.
            renderer.xr.setReferenceSpaceType('local');

            navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local']
            }).then(function (session) {
                renderer.xr.setSession(session).then(function () {
                    window.tourState.isXRActive = true;
                    isEnteringVR = false;
                    showVRUI();
                    updateVRButtonState(true);

                    if (typeof renderer.xr.setFoveation === 'function') {
                        renderer.xr.setFoveation(1);
                    }

                    console.log('[VR] Session démarrée');
                }).catch(function (err) {
                    console.error('[VR] Erreur setSession (reference space):', err);
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

        if (vrInfoVisible && vrInfoMesh) {
            updateVRInfoPanelPosition();
        }
    }

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

    function showVRInfoPanel(hotspot) {
        if (!vrInfoPanel || !window.tourState.isXRActive) {
            return;
        }

        currentHotspot = hotspot;
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
        currentHotspot = null;
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
        panelPosition.y += 0.2;

        vrInfoPanel.mesh.position.copy(panelPosition);
        vrInfoPanel.mesh.lookAt(camera.position);
        vrInfoPanel.mesh.rotateY(Math.PI);
    }

    function updateVRInfoPanelFrame() {
        if (vrInfoVisible && vrInfoPanel) {
            updateVRInfoPanelPosition();
        }
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

    // [FIX] Remplace l'ancien check "clic sur panneau info" fait via un
    // deuxième listener 'select' redondant (jamais câblé de toute façon, et
    // qui contenait `renderer.xr.removeAllListeners(...)`, une méthode qui
    // N'EXISTE PAS sur THREE.EventDispatcher en r128 — appel qui aurait
    // planté). Maintenant appelé UNE fois depuis handleXRSelect (hotspots.js)
    // avec le raycaster déjà construit depuis le bon contrôleur.
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
            }
        }
        return true; // le rayon touche le panneau : on absorbe le clic ici
    }

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

    function getVRButton() {
        if (!vrButtonElement) {
            vrButtonElement = document.getElementById('vr-button');
        }
        return vrButtonElement;
    }

    // [ROBUSTESSE] Si WebXR échoue en interne après le démarrage de la
    // session (ex: reference space non supporté par le device/émulateur),
    // on ne le laisse pas planter en silence — on sort proprement du mode VR
    // au lieu de laisser l'utilisateur bloqué dans une session cassée.
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason && event.reason.message ? event.reason.message : '';
        if (reason.indexOf('reference space') !== -1 && window.tourState.isXRActive) {
            console.error('[VR] Reference space non supporté, sortie forcée du mode VR:', reason);
            doExitVR();
        }
    });

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
    window.checkVRInfoPanelClose = checkVRInfoPanelClose;
    window.roundedCardCanvas = roundedCardCanvas;
    window.getVRButton = getVRButton;
    window.checkVRSupport = checkVRSupport;
    window.updateVRButtonState = updateVRButtonState;

})();