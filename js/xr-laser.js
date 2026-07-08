(function () {
    'use strict';

    // ========================================================================
    //  XR LASER POINTERS — visible controller rays + hit reticle
    // ========================================================================
    //  One laser (THREE.Line) is attached as a CHILD of each Meta Quest
    //  controller object returned by renderer.xr.getController(i). Three.js's
    //  WebXR manager updates that controller's position/rotation every frame
    //  from the real controller pose, so anything parented to it (our laser)
    //  automatically follows the hand in real time — no manual polling needed
    //  for the beam itself.
    //
    //  A small sphere "reticle" is kept in world space (added directly to the
    //  scene, not to the controller) and repositioned every frame to the exact
    //  raycast hit point, giving the user feedback on what they're aiming at.
    // ========================================================================

    var LASER_LENGTH = 10; // meters
    var laserEntries = []; // [{ controller, line, reticle }]
    var reusableMatrix = new THREE.Matrix4();

    function buildLaser() {
        var geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -LASER_LENGTH)
        ]);
        var material = new THREE.LineBasicMaterial({
            color: 0x3B82F6,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        var line = new THREE.Line(geometry, material);
        line.name = 'xr-laser-beam';
        line.renderOrder = 999;
        return line;
    }

    function buildReticle() {
        var geometry = new THREE.SphereGeometry(0.015, 12, 12);
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
            entry.line.geometry.dispose();
            entry.line.material.dispose();

            if (entry.reticle && entry.reticle.parent) {
                entry.reticle.parent.remove(entry.reticle);
            }
            entry.reticle.geometry.dispose();
            entry.reticle.material.dispose();
        });
        laserEntries = [];
    }

    function setupXRLasers(controllers) {
        clearXRLasers();
        if (!controllers || !window.tourState.scene) return;

        controllers.forEach(function (controller) {
            var line = buildLaser();
            controller.add(line);

            var reticle = buildReticle();
            window.tourState.scene.add(reticle);

            laserEntries.push({ controller: controller, line: line, reticle: reticle });
        });

        console.log('[XR] ' + laserEntries.length + ' laser(s) attached to controllers');
    }

    // Builds a fresh raycaster from a controller's current world transform.
    // Used both for the per-frame hover reticle and for the one-shot
    // trigger (selectstart) hit test in hotspots.js.
    function raycasterFromController(controller) {
        var raycaster = new THREE.Raycaster();
        reusableMatrix.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(reusableMatrix);
        raycaster.far = LASER_LENGTH;
        return raycaster;
    }

    // Everything the laser is allowed to interact with: HUD panels
    // (Previous / Next / Exit VR), the floor navigation hotspots, and the
    // VR info panel (when open, so its close button is reachable).
    function interactableTargets() {
        var targets = [];

        if (window.vrHudPanels && window.vrHudPanels.length) {
            targets = targets.concat(window.vrHudPanels);
        }
        if (window.getGroundHotspotMeshes) {
            targets = targets.concat(window.getGroundHotspotMeshes());
        }
        if (window.vrInfoPanel && window.vrInfoPanel.mesh && window.vrInfoPanel.mesh.visible) {
            targets.push(window.vrInfoPanel.mesh);
        }

        return targets;
    }

    function updateXRLasers() {
        if (!window.tourState.isXRActive || laserEntries.length === 0) return;

        var targets = interactableTargets();

        laserEntries.forEach(function (entry) {
            var raycaster = raycasterFromController(entry.controller);
            var hits = targets.length ? raycaster.intersectObjects(targets, false) : [];

            if (hits.length > 0) {
                entry.reticle.position.copy(hits[0].point);
                entry.reticle.visible = true;
                // Shrink the beam so it visually stops at what it's hitting.
                entry.line.scale.z = Math.max(0.001, hits[0].distance / LASER_LENGTH);
            } else {
                entry.reticle.visible = false;
                entry.line.scale.z = 1;
            }
        });
    }

    window.setupXRLasers = setupXRLasers;
    window.clearXRLasers = clearXRLasers;
    window.updateXRLasers = updateXRLasers;
    window.xrRaycasterFromController = raycasterFromController;
    window.xrInteractableTargets = interactableTargets;
})();