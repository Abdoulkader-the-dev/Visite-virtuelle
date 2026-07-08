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

    // ========================================================================
    //  MISE À JOUR DYNAMIQUE DU BEARING
    // ========================================================================

    function updateHotspotBearing(fromSceneId, toSceneId, newBearing) {
        var scene = window.TOUR_CONFIG.scenes[fromSceneId];
        if (!scene || !scene.hotspots) { return false; }

        var found = false;
        scene.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && hotspot.target === toSceneId) {
                hotspot.bearing = newBearing;
                found = true;
            }
        });
        return found;
    }

    function getReverseHotspotBearing(targetSceneId, sourceSceneId) {
        var targetScene = window.TOUR_CONFIG.scenes[targetSceneId];
        if (!targetScene || !targetScene.hotspots) { return null; }

        var reverseBearing = null;
        targetScene.hotspots.forEach(function (hotspot) {
            if (hotspot.type === 'transition' && hotspot.target === sourceSceneId) {
                if (typeof hotspot.bearing === 'number') {
                    reverseBearing = hotspot.bearing;
                } else {
                    reverseBearing = Math.atan2(hotspot.position.x, -hotspot.position.z) * 180 / Math.PI;
                    if (reverseBearing < 0) { reverseBearing += 360; }
                }
            }
        });
        return reverseBearing;
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

    function animateLatTransition(targetLat, duration) {
        return new Promise(function (resolve) {
            var start = performance.now();
            var startLat = window.tourState.lat;
            var delta = targetLat - startLat;

            function frame(now) {
                var progress = Math.min(1, (now - start) / duration);
                var eased = progress * (2 - progress);
                window.tourState.lat = startLat + delta * eased;

                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    window.tourState.lat = targetLat;
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
                var easeIn = t * t * t;

                sphere2.material.opacity = easeInOut;

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
                uOpacity: { value: 1.0 },
                uStretch: { value: 0.0 },
                uBlur: { value: 0.0 }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'uniform float uStretch;',
                '',
                'void main() {',
                '    vUv = uv;',
                '',
                '    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
                '    vec4 projected  = projectionMatrix * mvPosition;',
                '',
                '    vec2 ndc    = projected.xy / projected.w;',
                '    float radius = length(ndc.xy);',
                '',
                '    float mask = smoothstep(0.2, 1.3, radius);',
                '',
                '    vec2 dir = (radius > 0.0001)',
                '               ? (ndc.xy / radius)',
                '               : vec2(0.0);',
                '',
                '    projected.xy += dir * uStretch * mask * projected.w;',
                '',
                '    gl_Position = projected;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uMap;',
                'uniform float     uOpacity;',
                'uniform float     uBlur;',
                'varying vec2      vUv;',
                '',
                'void main() {',
                '    vec4 color = texture2D(uMap, vUv);',
                '',
                '    if (uBlur > 0.001) {',
                '        vec2 toCenter = vUv - vec2(0.5);',
                '        float blurStrength = uBlur * 0.015;',
                '        vec4 blurSum = vec4(0.0);',
                '',
                '        for (float i = 0.0; i < 5.0; i += 1.0) {',
                '            float t = (i - 2.0) / 2.0;',
                '            vec2 offset = toCenter * blurStrength * t;',
                '            blurSum += texture2D(uMap, vUv - offset);',
                '        }',
                '        blurSum /= 5.0;',
                '',
                '        color = mix(color, blurSum, uBlur);',
                '    }',
                '',
                '    gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
                '}'
            ].join('\n'),
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
    }

    function createCrossfadeMaterial(texture) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: texture },
                uOpacity: { value: 0.0 }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'void main() {',
                '    vUv = uv;',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uMap;',
                'uniform float     uOpacity;',
                'varying vec2      vUv;',
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

    // ========================================================================
    // triggerGSVTransition()
    // ========================================================================

    function triggerGSVTransition(targetSceneId, bearing, options) {

        if (window.tourState.isTransitioning) { return; }
        if (targetSceneId === window.tourState.currentScene) { return; }
        var sceneConfig = window.TOUR_CONFIG.scenes[targetSceneId];
        if (!sceneConfig) { return; }

        var TOTAL_DURATION = 0.9;
        var DOLLY_DISTANCE = 80.0;
        var MAX_STRETCH = 0.4;

        var camera = window.tourState.camera;
        var scene = window.tourState.scene;
        var oldSphere = window.tourState.sphere;

        var clickedHotspot = (options && options.hotspot) || null;

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;
        if (window.hideInfoCard) { window.hideInfoCard(); }

        var dollyDir;
        if (clickedHotspot && clickedHotspot.position) {
            var hx = clickedHotspot.position.x;
            var hy = clickedHotspot.position.y || 0;
            var hz = clickedHotspot.position.z;
            var len = Math.sqrt(hx * hx + hy * hy + hz * hz);
            if (len > 0.001) {
                dollyDir = new THREE.Vector3(hx / len, hy / len, hz / len);
            } else {
                dollyDir = new THREE.Vector3(0, 0, -1);
            }
        } else {
            dollyDir = new THREE.Vector3(0, 0, -1);
        }

        var movementAngle = Math.atan2(dollyDir.x, -dollyDir.z) * (180 / Math.PI);

        // arrivalLon / arrivalLat = valeurs ABSOLUES calibrées manuellement dans
        // l'éditeur (ex : "à l'arrivée, je dois voir le chat à travers la porte").
        // Pas de calcul d'offset relatif — c'est la valeur exacte voulue.
        var arrivalTargetLon = (clickedHotspot && typeof clickedHotspot.arrivalLon === 'number')
            ? normalizeDegrees(clickedHotspot.arrivalLon)
            : normalizeDegrees(movementAngle + 180);

        var arrivalTargetLat = (clickedHotspot && typeof clickedHotspot.arrivalLat === 'number')
            ? clickedHotspot.arrivalLat
            : 0;

        // 🔧 lon/lat sont laissés inchangés ici. Ils basculeront vers
        // arrivalTargetLon/arrivalTargetLat dans switchToNextScene() (voir plus
        // bas), au moment précis où l'ancienne sphère est masquée par le pic du
        // flou radial — pas de crossfade progressif, donc jamais d'image cible
        // visible "non corrigée" (orientation native de la photo GoPro).

        var startPos = camera.position.clone();
        var endPos = new THREE.Vector3(
            startPos.x + dollyDir.x * DOLLY_DISTANCE,
            startPos.y + dollyDir.y * DOLLY_DISTANCE,
            startPos.z + dollyDir.z * DOLLY_DISTANCE
        );

        var nextSphere = window.createSphere();
        nextSphere.material.transparent = false;
        nextSphere.material.depthWrite = true;
        nextSphere.renderOrder = 2;
        nextSphere.visible = false; // restera cachée jusqu'au basculement net
        scene.add(nextSphere);

        var stretchMat = null;
        if (oldSphere && oldSphere.material && oldSphere.material.map) {
            var oldBaseMat = oldSphere.material;
            stretchMat = createRadialStretchMaterial(oldBaseMat.map);
            oldSphere.material = stretchMat;
            oldSphere.renderOrder = 1;
            oldBaseMat.dispose();
        }

        var textureReady = false;
        var switchedAlready = false;

        // 🔧 Plus de crossfade progressif (uOpacity 0→1). À la place : la
        // nouvelle sphère reste invisible, puis bascule en UNE FRAME à
        // opacité pleine, EXACTEMENT au pic du flou/stretch radial de
        // l'ancienne sphère (à 50% de la timeline, TOTAL_DURATION*0.5).
        // À ce moment, l'ancienne image est masquée par le flou maximal,
        // donc le changement net (sphère + lon/lat en même temps) est
        // invisible à l'œil — pas de "vue GoPro non corrigée" qui apparaît
        // jamais, puisque nextSphere et le bon lon/lat arrivent ensemble,
        // d'un coup, pendant que l'ancienne image est déjà brouillée.
        function switchToNextScene() {
            if (switchedAlready || !textureReady) { return; }
            switchedAlready = true;
            window.tourState.lon = arrivalTargetLon;
            window.tourState.lat = arrivalTargetLat;
            nextSphere.visible = true;
            if (oldSphere) { oldSphere.visible = false; }
        }

        loadTextureAsync(sceneConfig.image).then(function (tex) {
            nextSphere.material.map = tex;
            nextSphere.material.needsUpdate = true;
            window.tourState.currentTexture = tex;
            textureReady = true;
        }).catch(function (err) {
            console.error('[GSV] Texture load failed:', err);
            textureReady = true;
        });

        var SWITCH_DELAY = TOTAL_DURATION * 0.5 * 1000;
        setTimeout(switchToNextScene, SWITCH_DELAY);

        var tl = gsap.timeline({
            onComplete: function () {
                (function waitTexture() {
                    if (textureReady) {
                        finalize(nextSphere, oldSphere, targetSceneId, clickedHotspot);
                    } else {
                        setTimeout(waitTexture, 32);
                    }
                })();
            }
        });

        tl.to(camera.position, {
            x: endPos.x,
            y: endPos.y,
            z: endPos.z,
            duration: TOTAL_DURATION,
            ease: 'power2.inOut'
        }, 0);

        if (stretchMat) {
            tl.to(stretchMat.uniforms.uStretch, {
                value: MAX_STRETCH,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power2.out'
            }, 0);
            tl.to(stretchMat.uniforms.uStretch, {
                value: 0,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power2.in'
            }, TOTAL_DURATION * 0.5);

            tl.to(stretchMat.uniforms.uBlur, {
                value: 1.0,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power2.out'
            }, 0);
            tl.to(stretchMat.uniforms.uBlur, {
                value: 0,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power2.in'
            }, TOTAL_DURATION * 0.5);

            tl.to(stretchMat.uniforms.uOpacity, {
                value: 0.5,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power1.in'
            }, 0);
            tl.to(stretchMat.uniforms.uOpacity, {
                value: 0,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power1.in'
            }, TOTAL_DURATION * 0.5);
        }

        function finalize(next, old, targetId, clickedHotspot) {
            if (old) {
                scene.remove(old);
                if (old.geometry) { old.geometry.dispose(); }
                if (old.material) { old.material.dispose(); }
            }

            next.material.opacity = 1;
            next.material.transparent = false;
            next.material.depthWrite = true;
            next.material.needsUpdate = true;
            window.tourState.sphere = next;

            camera.position.set(0, 0, 0.001);

            var previousSceneId = window.tourState.currentScene;
            window.tourState.currentScene = targetId;
            window.tourState.fov = 75;
            camera.fov = 75;
            camera.updateProjectionMatrix();

            // 🔧 lon/lat ont déjà été basculés vers arrivalTargetLon/arrivalTargetLat
            // par switchToNextScene() au pic du flou radial (voir plus haut) — mais
            // au cas où la texture aurait mis plus de 500ms à charger, on s'assure
            // ici que le switch a bien eu lieu avant de continuer.
            switchToNextScene();

            // ── MISE À JOUR DYNAMIQUE DU BEARING ──
            var reverseBearing = getReverseHotspotBearing(targetId, previousSceneId);
            if (reverseBearing !== null) {
                updateHotspotBearing(previousSceneId, targetId, reverseBearing);
            } else {
                var fallbackBearing = normalizeDegrees(arrivalTargetLon + 180);
                updateHotspotBearing(previousSceneId, targetId, fallbackBearing);
            }

            updateSceneUi();
            window.tourState.isTransitioning = false;
            window.tourState.controlsEnabled = true;
            window.tourState.lastInteractionTime = Date.now();
        }
    }

    function startTransition(targetSceneId, options) {
        var opts = options || {};
        var hotspot = opts.hotspot
            ? opts.hotspot
            : findTransitionHotspot(window.tourState.currentScene, targetSceneId);
        opts.hotspot = hotspot;
        triggerGSVTransition(targetSceneId, bearingForHotspot(hotspot), opts);
    }

    window.triggerGSVTransition = triggerGSVTransition;
    window.startTransition = startTransition;
    window.animateTourFov = animateFov;
    window.animateTourBlur = animateBlur;
})();