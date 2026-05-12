(function () {
    'use strict';

    window.tourState = {
        currentScene: '1',
        lon: 0,
        lat: 0,
        fov: 75,
        isTransitioning: false,
        isDragging: false,
        mouseDownX: 0,
        mouseDownY: 0,
        mouseDelta: 0,
        lastInteractionTime: Date.now(),
        autoRotating: false,
        camera: null,
        renderer: null,
        scene: null,
        sphere: null,
        controlsEnabled: true,
        activeFloorHotspot: null,
        mouseSphereLat: null,
        mouseSpherePoint: null,
        lastMouseX: 0,
        lastMouseY: 0,
        currentTexture: null,
        history: [],
        isFullscreen: false,
        isXRActive: false,
        xrControllers: [],
        xrInfoPanel: null,
        gazeTarget: null,
        gazeStartTime: 0
    };
})();
