(function () {
    'use strict';

    function easeIn(t) {
        return t * t;
    }

    function easeOut(t) {
        return t * (2 - t);
    }

    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function animateFov(startFov, endFov, duration, easing) {
        return new Promise(function (resolve) {
            var start = performance.now();

            function frame(now) {
                var progress = Math.min(1, (now - start) / duration);
                window.tourState.fov = startFov + (endFov - startFov) * easing(progress);
                if (window.updateZoomLevel) {
                    window.updateZoomLevel();
                }
                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function normalizeDegrees(degrees) {
        return ((degrees % 360) + 360) % 360;
    }

    function shortestAngleDelta(fromDeg, toDeg) {
        return ((toDeg - fromDeg + 540) % 360) - 180;
    }

    function angleForPosition(position) {
        return Math.atan2(position.z, position.x) * (180 / Math.PI);
    }

    function bearingForPosition(position) {
        var bearing = Math.atan2(position.x, -position.z) * 180 / Math.PI;
        return bearing < 0 ? bearing + 360 : bearing;
    }

    function bearingForHotspot(hotspot) {
        if (hotspot && typeof hotspot.bearing === 'number') {
            return hotspot.bearing;
        }
        return hotspot && hotspot.position ? bearingForPosition(hotspot.position) : window.tourState.lon;
    }

    function findTransitionHotspot(sceneId, targetSceneId) {
        var scene = window.TOUR_CONFIG.scenes[sceneId];
        var match = null;

        if (!scene || !scene.hotspots) {
            return null;
        }

        scene.hotspots.some(function (hotspot) {
            if (hotspot.type === 'transition' && hotspot.target === targetSceneId) {
                match = hotspot;
                return true;
            }
            return false;
        });

        return match;
    }

    function arrivalLonForTransition(fromSceneId, targetSceneId) {
        var reverseHotspot = findTransitionHotspot(targetSceneId, fromSceneId);

        if (!reverseHotspot) {
            return null;
        }

        return normalizeDegrees(angleForPosition(reverseHotspot.position) + 180);
    }

    function animateLon(targetLon, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var startLon = window.tourState.lon;
            var delta = shortestAngleDelta(startLon, targetLon);

            function frame(now) {
                var progress = Math.min(1, (now - start) / duration);
                var eased = progress * (2 - progress);
                window.tourState.lon = startLon + delta * eased;

                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    window.tourState.lon = targetLon;
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function fadeOverlay(visible) {
        return new Promise(function (resolve) {
            var overlay = document.getElementById('transition-overlay');
            overlay.classList.toggle('visible', visible);
            setTimeout(resolve, 250);
        });
    }

    function animateBlur(fromPx, toPx, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var canvas = document.getElementById('tour-canvas');

            if (!canvas) {
                resolve();
                return;
            }

            function frame(now) {
                var t = Math.min(1, (now - start) / duration);
                var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                var blur = fromPx + (toPx - fromPx) * eased;
                canvas.style.filter = 'blur(' + blur.toFixed(1) + 'px)';

                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function pushHistory(options) {
        var opts = options || {};

        if (!opts.isBack && window.tourState.currentScene) {
            window.tourState.history.push(window.tourState.currentScene);
            if (window.tourState.history.length > 50) {
                window.tourState.history.shift();
            }
        }

        if (window.updateBackButton) {
            window.updateBackButton();
        }
    }

    function animateTranslationAndCrossfade(targetTexture, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var sphere1 = window.tourState.sphere;
            var sphere2 = window.tourState.sphere2;
            var camera = window.tourState.camera;
            
            sphere2.material.map = targetTexture;
            sphere2.material.needsUpdate = true;
            sphere2.material.opacity = 0;
            sphere2.visible = true;

            // Compute forward direction
            var phi = (90 - window.tourState.lat) * Math.PI / 180;
            var theta = window.tourState.lon * Math.PI / 180;
            var targetDir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            ).normalize();

            function frame(now) {
                var t = Math.min(1, (now - start) / duration);
                var easeInOut = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                var easeIn = t * t * t; // Cubic ease in for strong translation effect
                
                // Crossfade
                sphere2.material.opacity = easeInOut;
                
                // Camera translation (move up to 350 units forward out of 500 radius)
                // This causes the natural radial stretch effect at the edges
                var distance = easeIn * 350;
                camera.position.copy(targetDir).multiplyScalar(distance);

                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(frame);
        });
    }

    function loadTextureAsync(url) {
        if (window.loadTourTexture) {
            return window.loadTourTexture(url);
        }

        return new Promise(function (resolve) {
            new THREE.TextureLoader().load(url, function (texture) {
                if (THREE.SRGBColorSpace) {
                    texture.colorSpace = THREE.SRGBColorSpace;
                }
                if (THREE.sRGBEncoding) {
                    texture.encoding = THREE.sRGBEncoding;
                }
                resolve(texture);
            });
        });
    }

    function disposeSphere(sphere) {
        if (!sphere) {
            return;
        }
        if (sphere.geometry) {
            sphere.geometry.dispose();
        }
        if (sphere.material) {
            sphere.material.dispose();
        }
    }

    function updateSceneUi() {
        var sceneConfig = window.TOUR_CONFIG.scenes[window.tourState.currentScene];
        var announcer = document.getElementById('scene-announcer');

        if (window.rebuildHotspots) {
            window.rebuildHotspots();
        }
        if (window.updateNavMenu) {
            window.updateNavMenu();
        }
        if (window.updateMinimap) {
            window.updateMinimap();
        }
        if (window.updateBackButton) {
            window.updateBackButton();
        }
        if (announcer && sceneConfig) {
            announcer.textContent = 'Vue : ' + sceneConfig.name;
        }
    }

    function createRadialStretchMaterial(texture) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: texture },
                uOpacity: { value: 1 },
                uStretch: { value: 0 }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'uniform float uStretch;',
                '',
                'void main() {',
                '    vUv = uv;',
                '    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
                '    vec4 projected = projectionMatrix * mvPosition;',
                '    vec2 ndc = projected.xy / projected.w;',
                '    float radius = length(ndc);',
                '    float edge = smoothstep(0.10, 1.15, radius);',
                '    vec2 direction = radius > 0.0001 ? ndc / radius : vec2(0.0);',
                '',
                '    projected.xy += direction * edge * edge * uStretch * projected.w;',
                '    gl_Position = projected;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uMap;',
                'uniform float uOpacity;',
                'varying vec2 vUv;',
                '',
                'void main() {',
                '    vec4 color = texture2D(uMap, vUv);',
                '    gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
                '}'
            ].join('\n'),
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
    }

    function triggerGSVTransition(targetSceneId, bearing, options) {
        var sourceSceneId = window.tourState.currentScene;
        var sceneConfig = window.TOUR_CONFIG.scenes[targetSceneId];
        var camera = window.tourState.camera;
        var scene = window.tourState.scene;
        var oldSphere = window.tourState.sphere;
        var oldMaterial;
        var stretchMaterial;
        var nextSphere;
        var nextTexturePromise;
        var startPosition;
        var dollyTarget;
        var bearingRad;
        var startTime;
        var TOTAL_DURATION = 1400;
        var STRETCH_DURATION = 500;
        var DOLLY_DISTANCE = 2.5;
        var MAX_RADIAL_STRETCH = 0.38;
        var transitionBearing = typeof bearing === 'number' ? bearing : window.tourState.lon;

        if (window.tourState.isTransitioning || targetSceneId === window.tourState.currentScene) {
            return;
        }
        if (!sceneConfig) {
            return;
        }

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;

        if (window.hideInfoCard) {
            window.hideInfoCard();
        }
        if (window.hideFloorHotspot) {
            window.hideFloorHotspot();
        }

        bearingRad = transitionBearing * Math.PI / 180;
        startPosition = camera.position.clone();
        dollyTarget = new THREE.Vector3(
            camera.position.x + Math.sin(bearingRad) * DOLLY_DISTANCE,
            0,
            camera.position.z + (-Math.cos(bearingRad)) * DOLLY_DISTANCE
        );

        nextTexturePromise = loadTextureAsync(sceneConfig.image);
        nextSphere = window.createSphere ? window.createSphere() : new THREE.Mesh(
            new THREE.SphereGeometry(500, 60, 40),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0 })
        );
        if (!window.createSphere) {
            nextSphere.geometry.scale(-1, 1, 1);
        }
        nextSphere.material.opacity = 0;
        nextSphere.material.transparent = true;
        nextSphere.material.depthWrite = false;
        nextSphere.renderOrder = 2;
        scene.add(nextSphere);

        nextTexturePromise.then(function (texture) {
            nextSphere.material.map = texture;
            nextSphere.material.needsUpdate = true;
            window.tourState.currentTexture = texture;
        }).catch(function (error) {
            console.error(error);
        });

        if (oldSphere && oldSphere.material && oldSphere.material.map) {
            oldMaterial = oldSphere.material;
            stretchMaterial = createRadialStretchMaterial(oldMaterial.map);
            oldSphere.material = stretchMaterial;
            oldSphere.renderOrder = 1;
            oldMaterial.dispose();
        } else if (oldSphere && oldSphere.material) {
            oldSphere.material.transparent = true;
            oldSphere.material.depthWrite = false;
        }

        startTime = performance.now();

        function finalize() {
            nextTexturePromise.then(function () {
                if (oldSphere) {
                    oldSphere.scale.set(1, 1, 1);
                    scene.remove(oldSphere);
                    disposeSphere(oldSphere);
                }

                nextSphere.material.opacity = 1;
                nextSphere.material.transparent = false;
                nextSphere.material.depthWrite = true;
                window.tourState.sphere = nextSphere;

                camera.position.set(0, 0, 0.001);
                window.tourState.currentScene = targetSceneId;
                window.tourState.lon = normalizeDegrees(transitionBearing + 180);
                window.tourState.lat = 0;
                window.tourState.fov = 75;
                camera.fov = window.tourState.fov;
                camera.updateProjectionMatrix();

                updateSceneUi();
                window.tourState.isTransitioning = false;
                window.tourState.controlsEnabled = true;
                window.tourState.lastInteractionTime = Date.now();
            }).catch(function () {
                window.tourState.isTransitioning = false;
                window.tourState.controlsEnabled = true;
            });
        }

        function animateTransition() {
            var elapsed = performance.now() - startTime;
            var rawProgress = Math.min(elapsed / TOTAL_DURATION, 1);
            var dollyEase = easeInOut(Math.min(rawProgress / 0.7, 1));
            var fadeEase = easeIn(Math.min(rawProgress / 0.7, 1));
            var stretchProgress = Math.min(elapsed / STRETCH_DURATION, 1);
            var stretchEase = easeInOut(stretchProgress);
            var crossfadeProgress;
            var crossfadeEase;

            camera.position.lerpVectors(startPosition, dollyTarget, dollyEase);

            if (stretchMaterial) {
                stretchMaterial.uniforms.uStretch.value = MAX_RADIAL_STRETCH * stretchEase;
                stretchMaterial.uniforms.uOpacity.value = 1 - fadeEase;
            } else if (oldSphere && oldSphere.material) {
                oldSphere.material.opacity = 1 - fadeEase;
            }

            if (rawProgress > 0.4) {
                crossfadeProgress = (rawProgress - 0.4) / 0.4;
                crossfadeEase = easeOut(Math.min(crossfadeProgress, 1));
                nextSphere.material.opacity = crossfadeEase;
            }

            if (rawProgress < 1) {
                requestAnimationFrame(animateTransition);
            } else {
                finalize();
            }
        }

        requestAnimationFrame(animateTransition);
    }

    function startTransition(targetSceneId, options) {
        var hotspot = options && options.hotspot
            ? options.hotspot
            : findTransitionHotspot(window.tourState.currentScene, targetSceneId);
        triggerGSVTransition(targetSceneId, bearingForHotspot(hotspot), options);
    }

    window.triggerGSVTransition = triggerGSVTransition;
    window.startTransition = startTransition;
    window.animateTourFov = animateFov;
    window.animateTourBlur = animateBlur;
})();
