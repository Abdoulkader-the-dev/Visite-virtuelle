// =============================================================================
//  xr-laser.js  —  Fixed: clean rebuild, reticle follows controller
// =============================================================================
(function () {
    'use strict';

    var LASER_LENGTH = 10;
    var laserEntries = [];
    var reusableMatrix = new THREE.Matrix4();
    var laserColor = 0x3B82F6;

    function buildLaser() {
        var geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -LASER_LENGTH)
        ]);
        var material = new THREE.LineBasicMaterial({
            color: laserColor,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            linewidth: 2
        });
        var line = new THREE.Line(geometry, material);
        line.name = 'xr-laser-beam';
        line.renderOrder = 999;
        return line;
    }

    function buildReticle() {
        var geometry = new THREE.SphereGeometry(0.018, 10, 10);
        var material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        var mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1000;
        mesh.visible = false;
        return mesh;
    }

    function clearXRLasers() {
        laserEntries.forEach(function (entry) {
            if (entry.line && entry.line.parent) {
                entry.line.parent.remove(entry.line);
            }
            if (entry.line) {
                if (entry.line.geometry) entry.line.geometry.dispose();
                if (entry.line.material) entry.line.material.dispose();
            }
            if (entry.reticle && entry.reticle.parent) {
                entry.reticle.parent.remove(entry.reticle);
            }
            if (entry.reticle) {
                if (entry.reticle.geometry) entry.reticle.geometry.dispose();
                if (entry.reticle.material) entry.reticle.material.dispose();
            }
        });
        laserEntries = [];
        console.log('[XR] Lasers cleared');
    }

    function setupXRLasers(controllers) {
        clearXRLasers();

        if (!controllers || !window.tourState.scene) {
            console.warn('[XR] Cannot setup lasers: no controllers or scene');
            return;
        }

        controllers.forEach(function (controller, index) {
            if (!controller) return;

            var line = buildLaser();
            controller.add(line);

            var reticle = buildReticle();
            window.tourState.scene.add(reticle);

            laserEntries.push({
                controller: controller,
                line: line,
                reticle: reticle,
                index: index
            });
        });

        console.log('[XR] ' + laserEntries.length + ' laser(s) attached');
    }

    function raycasterFromController(controller) {
        var raycaster = new THREE.Raycaster();
        reusableMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(reusableMatrix);
        raycaster.far = LASER_LENGTH;
        return raycaster;
    }

    function interactableTargets() {
        var targets = [];

        // HUD panels
        if (window.vrHudPanels && window.vrHudPanels.length) {
            targets = targets.concat(window.vrHudPanels);
        }

        // Ground hotspot meshes
        if (window.getGroundHotspotMeshes) {
            var groundMeshes = window.getGroundHotspotMeshes();
            if (groundMeshes && groundMeshes.length) {
                targets = targets.concat(groundMeshes);
            }
        }

        // VR info panel
        if (window.vrInfoPanel && window.vrInfoPanel.mesh && window.vrInfoPanel.mesh.visible) {
            targets.push(window.vrInfoPanel.mesh);
        }

        return targets;
    }

    function updateXRLasers() {
        if (!window.tourState.isXRActive || laserEntries.length === 0) return;

        var targets = interactableTargets();

        laserEntries.forEach(function (entry) {
            var controller = entry.controller;
            if (!controller) return;

            var raycaster = raycasterFromController(controller);
            var hits = targets.length ? raycaster.intersectObjects(targets, false) : [];

            if (hits.length > 0) {
                var hitPoint = hits[0].point;
                entry.reticle.position.copy(hitPoint);
                entry.reticle.visible = true;
                // Shrink the beam to the hit distance
                var dist = Math.min(hits[0].distance, LASER_LENGTH);
                entry.line.scale.z = Math.max(0.001, dist / LASER_LENGTH);
            } else {
                entry.reticle.visible = false;
                entry.line.scale.z = 1;
            }
        });
    }

    // --------------------------------------------------------------
    //  EXPOSE
    // --------------------------------------------------------------
    window.setupXRLasers = setupXRLasers;
    window.clearXRLasers = clearXRLasers;
    window.updateXRLasers = updateXRLasers;
    window.xrRaycasterFromController = raycasterFromController;
    window.xrInteractableTargets = interactableTargets;
})();