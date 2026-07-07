(function () {
    'use strict';

    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            this.beginPath(); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
        };
    }

    var vrUiGroup = null;
    var exitButton = null;
    var isVRSupported = false;
    var vrButtonElement = null;
    var isEnteringVR = false;

    var vrInfoPanel = { mesh: null, canvas: null, texture: null, material: null, visible: false };
    window.vrInfoPanel = vrInfoPanel;

    function checkVRSupport() {
        if (!navigator.xr) {
            updateVRButtonState(false);
            return;
        }
        navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
            isVRSupported = supported;
            updateVRButtonState(supported);
        });
    }

    function updateVRButtonState(available) {
        if (!vrButtonElement) vrButtonElement = document.getElementById('vr-button');
        if (!vrButtonElement) return;

        vrButtonElement.style.display = available ? 'block' : 'none';
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
        ctx.fillStyle = 'rgba(30, 30, 30, 0.8)'; ctx.roundRect(8, 8, 240, 48, 12).fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 2; ctx.roundRect(8, 8, 240, 48, 12).stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕ Quitter VR', 128, 32);

        var texture = new THREE.CanvasTexture(canvas);
        var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
        exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), material);
        exitButton.userData = { isVRButton: true };
        vrUiGroup.add(exitButton);
        exitButton.position.set(0, -0.6, -1.8);

        window.vrExitButton = exitButton;
        if (window.tourState.scene) window.tourState.scene.add(vrUiGroup);
        console.log('[VR] UI built');
    }

    function showVRUI() { if (vrUiGroup) vrUiGroup.visible = true; }
    function hideVRUI() { if (vrUiGroup) vrUiGroup.visible = false; }

    function toggleVR() {
        if (isEnteringVR) return;
        var session = window.tourState.renderer.xr.getSession();
        if (session) {
            session.end();
        } else if (isVRSupported) {
            isEnteringVR = true;
            navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] })
                .then(session => window.tourState.renderer.xr.setSession(session))
                .catch(err => console.error('[VR] Erreur de session:', err))
                .finally(() => isEnteringVR = false);
        }
    }

    function updateVRUI() {
        if (!vrUiGroup || !window.tourState.isXRActive || !window.tourState.camera) return;

        var camera = window.tourState.camera;
        vrUiGroup.position.copy(camera.position);
        vrUiGroup.quaternion.copy(camera.quaternion);

        if (vrInfoPanel.visible && vrInfoPanel.mesh) {
            // Optionnel : Mettre à jour la position du panneau info s'il doit suivre la caméra
        }
    }

    function buildVRInfoPanel() {
        vrInfoPanel.canvas = document.createElement('canvas');
        vrInfoPanel.canvas.width = 512; vrInfoPanel.canvas.height = 256;
        vrInfoPanel.texture = new THREE.CanvasTexture(vrInfoPanel.canvas);
        vrInfoPanel.material = new THREE.MeshBasicMaterial({ map: vrInfoPanel.texture, transparent: true, opacity: 0, depthWrite: false });
        vrInfoPanel.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), vrInfoPanel.material);
        vrInfoPanel.mesh.visible = false;
        if (window.tourState.scene) window.tourState.scene.add(vrInfoPanel.mesh);
    }

    function showVRInfoPanel(hotspot, position) {
        if (!vrInfoPanel.mesh || !window.tourState.isXRActive) return;

        var ctx = vrInfoPanel.canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 256);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.roundRect(0, 0, 512, 256, 15).fill();
        ctx.fillStyle = 'white'; ctx.font = 'bold 30px sans-serif';
        ctx.fillText(hotspot.title || 'Information', 20, 40);
        ctx.font = '24px sans-serif';
        var words = (hotspot.description || '').split(' '), line = '', y = 80;
        for (var n = 0; n < words.length; n++) {
            var testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > 480 && n > 0) {
                ctx.fillText(line, 20, y);
                line = words[n] + ' '; y += 30;
            } else { line = testLine; }
        }
        ctx.fillText(line, 20, y);

        vrInfoPanel.texture.needsUpdate = true;
        vrInfoPanel.mesh.position.copy(position).add(new THREE.Vector3(0, 0.3, 0));
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

    function checkVRInfoPanelClose(raycaster) { return false; }

    function initVRUI() {
        vrButtonElement = document.getElementById('vr-button');
        if (vrButtonElement) vrButtonElement.addEventListener('click', toggleVR);
        checkVRSupport();
        buildVRUI();
        buildVRInfoPanel();
        hideVRUI();
    }

    window.initVRUI = initVRUI;
    window.updateVRUI = updateVRUI;
    window.showVRUI = showVRUI;
    window.hideVRUI = hideVRUI;
    window.showVRInfoPanel = showVRInfoPanel;
    window.hideVRInfoPanel = hideVRInfoPanel;
    window.checkVRInfoPanelClose = checkVRInfoPanelClose;
    window.updateVRButtonState = updateVRButtonState;
})();
