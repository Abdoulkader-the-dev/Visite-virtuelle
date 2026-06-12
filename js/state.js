(function () {
    'use strict';

    window.tourState = {
        currentScene: '12', // [CORRECTION GSV] '1' → '12' : la scène '1' n'existe pas dans config.js, causant un écran noir au démarrage
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
