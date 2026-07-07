(function () {
    'use strict';

    // =========================================================================
    //  VR UI — HUD et Panneau d'Information
    // =========================================================================

    // Polyfill pour roundRect si non existant
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            this.beginPath(); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
        };
    }

    var VR_EYE_HEIGHT = 1.6; // hauteur des yeux en mètres
    var vrUiGroup = null;
    var exitButton = null;
    var isVRSupported = false;
    var vrButtonElement = null;
    var isEnteringVR = false;

    var vrInfoPanel = {
        mesh: null,
        canvas: null,
        texture: null,
        material: null,
        visible: false
    };

    function checkVRSupport() {
        if (!navigator.xr) {
            console.warn('[VR] WebXR non supporté');
            updateVRButtonState(false);
            return;
        }

        navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
            isVRSupported = supported;
            updateVRButtonState(supported);
            if (!supported) {
                console.warn('[VR] Mode VR non supporté sur ce périphérique');
            }
        }).catch(function (err) {
            console.warn('[VR] Erreur vérification support:', err);
            isVRSupported = false;
            updateVRButtonState(false);
        });
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
            vrButtonElement.textContent = 'Quitter VR';
            vrButtonElement.classList.add('active');
        } else {
            vrButtonElement.textContent = 'Entrer en VR';
            vrButtonElement.classList.remove('active');
        }
    }

    function buildVRUI() {
        if (vrUiGroup) return;

        vrUiGroup = new THREE.Group();
        vrUiGroup.name = 'vr-ui-hud';

        var canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
        ctx.roundRect(8, 8, 240, 48, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.roundRect(8, 8, 240, 48, 12); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕ Quitter VR', 128, 32);

        var texture = new THREE.CanvasTexture(canvas);
        var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), material);
        exitButton.userData = { action: 'exitVR', isVRButton: true };
        vrUiGroup.add(exitButton);

        // Positionnement relatif au groupe
        exitButton.position.set(0, -0.6, -1.8);

        window.vrExitButton = exitButton;
        if (window.tourState && window.tourState.scene) {
            window.tourState.scene.add(vrUiGroup);
        }
        console.log('[VR] UI built');
    }

    function showVRUI() {
        if (vrUiGroup) vrUiGroup.visible = true;
    }

    function hideVRUI() {
        if (vrUiGroup) vrUiGroup.visible = false;
    }

    function toggleVR() {
        if (isEnteringVR) return;

        if (window.tourState.isXRActive) {
            var session = window.tourState.renderer.xr.getSession();
            if (session) session.end();
        } else {
            enterVR();
        }
    }

    function enterVR() {
        if (isEnteringVR || !isVRSupported) return;
        isEnteringVR = true;

        navigator.xr.requestSession('immersive-vr', {
            requiredFeatures: ['local-floor']
        }).then(function (session) {
            window.tourState.renderer.xr.setSession(session).catch(function (err) {
                console.error('[VR] Erreur setSession:', err);
                isEnteringVR = false;
            });
            isEnteringVR = false;
        }).catch(function (err) {
            console.error('[VR] Erreur démarrage session:', err);
            isEnteringVR = false;
        });
    }

    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive) return;

        var camera = window.tourState.camera;
        if (!camera) return;

        // Positionne l'UI devant la caméra à hauteur des yeux
        var cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);

        var forward = new THREE.Vector3();
        camera.getWorldDirection(forward);

        // Positionne le groupe UI devant la caméra, mais horizontalement.
        vrUiGroup.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        vrUiGroup.position.add(forward.multiplyScalar(0.1)); // léger offset pour éviter clipping
        vrUiGroup.lookAt(camera.position);

        if (vrInfoPanel.visible) {
            updateVRInfoPanelPosition();
        }
    }

    function buildVRInfoPanel() {
        vrInfoPanel.canvas = document.createElement('canvas');
        vrInfoPanel.canvas.width = 512;
        vrInfoPanel.canvas.height = 256;
        vrInfoPanel.texture = new THREE.CanvasTexture(vrInfoPanel.canvas);
        vrInfoPanel.material = new THREE.MeshBasicMaterial({ map: vrInfoPanel.texture, transparent: true, opacity: 0 });
        vrInfoPanel.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), vrInfoPanel.material);
        vrInfoPanel.mesh.visible = false;
        if (window.tourState.scene) window.tourState.scene.add(vrInfoPanel.mesh);
    }

    function showVRInfoPanel(hotspot, position) {
        if (!vrInfoPanel.mesh || !window.tourState.isXRActive) return;

        var ctx = vrInfoPanel.canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 256);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.roundRect(0, 0, 512, 256, 15); ctx.fill();
        ctx.fillStyle = 'white'; ctx.font = 'bold 30px sans-serif';
        ctx.fillText(hotspot.title || 'Information', 20, 40);
        ctx.font = '24px sans-serif';
        // Simple word wrap
        var words = (hotspot.description || '').split(' ');
        var line = ''; var y = 80;
        for (var n = 0; n < words.length; n++) {
            var testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > 480 && n > 0) {
                ctx.fillText(line, 20, y);
                line = words[n] + ' ';
                y += 30;
            } else { line = testLine; }
        }
        ctx.fillText(line, 20, y);

        vrInfoPanel.texture.needsUpdate = true;
        vrInfoPanel.mesh.position.copy(position);
        vrInfoPanel.mesh.lookAt(window.tourState.camera.position);
        vrInfoPanel.material.opacity = 1;
        vrInfoPanel.mesh.visible = true;
        vrInfoPanel.visible = true;
    }

    function hideVRInfoPanel() {
        if (vrInfoPanel.mesh) {
            vrInfoPanel.mesh.visible = false;
            vrInfoPanel.material.opacity = 0;
        }
        vrInfoPanel.visible = false;
    }

    function updateVRInfoPanelPosition() {
        // La position est maintenant définie lors de l'affichage
    }

    function checkVRInfoPanelClose(raycaster) {
        // Logique de fermeture non implémentée, mais pourrait être ajoutée ici
        return false;
    }

    function initVRUI() {
        vrButtonElement = document.getElementById('vr-button');
        if (vrButtonElement) {
            vrButtonElement.addEventListener('click', toggleVR);
        }
        checkVRSupport();
        buildVRUI();
        buildVRInfoPanel();
        hideVRUI();
    }

    // Expositions
    window.initVRUI = initVRUI;
    window.updateVRUI = updateVRUI;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.showVRInfoPanel = showVRInfoPanel;
    window.hideVRInfoPanel = hideVRInfoPanel;
    window.checkVRInfoPanelClose = checkVRInfoPanelClose;
    window.updateVRButtonState = updateVRButtonState;
    window.vrInfoPanel = vrInfoPanel; // Exposer le panneau
})();
