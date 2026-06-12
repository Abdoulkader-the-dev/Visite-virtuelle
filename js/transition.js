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

    // [CORRECTION GSV] Shader radial stretch — smoothstep(0.25, 1.4) : centre immobile, périphérie étirée
    function createRadialStretchMaterial(texture) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: texture },
                uOpacity: { value: 1.0 },
                uStretch: { value: 0.0 }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'uniform float uStretch;',
                'void main() {',
                '    vUv = uv;',
                '    vec4 mvPosition  = modelViewMatrix * vec4(position, 1.0);',
                '    vec4 projected   = projectionMatrix * mvPosition;',
                '    vec2 ndc         = projected.xy / projected.w;',
                '    float radius     = length(ndc);',
                '    float edge       = smoothstep(0.25, 1.4, radius);',
                '    float stretch    = edge * edge * uStretch;',
                '    vec2  dir        = (radius > 0.0001)',
                '                      ? (ndc / radius)',
                '                      : vec2(0.0);',
                '    projected.xy    += dir * stretch * projected.w;',
                '    gl_Position      = projected;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uMap;',
                'uniform float     uOpacity;',
                'varying vec2      vUv;',
                'void main() {',
                '    vec4 color     = texture2D(uMap, vUv);',
                '    gl_FragColor   = vec4(color.rgb, color.a * uOpacity);',
                '}'
            ].join('\n'),
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
    }

    // [CORRECTION GSV] Transition orchestrée par GSAP — dolly + stretch + crossfade
    function triggerGSVTransition(targetSceneId, bearing, options) {

        // ── Gardes ────────────────────────────────────────────────
        if (window.tourState.isTransitioning) { return; }
        if (targetSceneId === window.tourState.currentScene) { return; }
        var sceneConfig = window.TOUR_CONFIG.scenes[targetSceneId];
        if (!sceneConfig) { return; }

        // ── Constantes de timing ──────────────────────────────────
        var TOTAL_DURATION = 0.9;   // [CORRECTION GSV] secondes (GSAP travaille en secondes)
        var DOLLY_DISTANCE = 80.0;  // [CORRECTION GSV] unités Three.js (16% du rayon 500)
        var MAX_STRETCH = 0.38;

        // ── État ──────────────────────────────────────────────────
        var camera = window.tourState.camera;
        var scene = window.tourState.scene;
        var oldSphere = window.tourState.sphere;
        var transitionBearing = (typeof bearing === 'number')
            ? bearing
            : window.tourState.lon;

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;
        if (window.hideInfoCard) { window.hideInfoCard(); }
        if (window.hideFloorHotspot) { window.hideFloorHotspot(); }

        // ── Direction du dolly (bearing → vecteur XZ unitaire) ───
        var bearingRad = transitionBearing * Math.PI / 180;
        var dollyDir = new THREE.Vector3(
            Math.sin(bearingRad), 0, -Math.cos(bearingRad)
        ).normalize();
        var startPos = camera.position.clone();
        var endPos = new THREE.Vector3(
            startPos.x + dollyDir.x * DOLLY_DISTANCE,
            startPos.y,
            startPos.z + dollyDir.z * DOLLY_DISTANCE
        );

        // ── Sphère de destination ─────────────────────────────────
        var nextSphere = window.createSphere();
        nextSphere.material.opacity = 0;
        nextSphere.material.transparent = true;
        nextSphere.material.depthWrite = false;
        nextSphere.renderOrder = 2;
        scene.add(nextSphere);

        // ── Shader sur la vieille sphère ──────────────────────────
        var stretchMat = null;
        if (oldSphere && oldSphere.material && oldSphere.material.map) {
            var oldBaseMat = oldSphere.material;
            stretchMat = createRadialStretchMaterial(oldBaseMat.map);
            oldSphere.material = stretchMat;
            oldSphere.renderOrder = 1;
            oldBaseMat.dispose();
        }

        // ── Chargement de la texture cible ────────────────────────
        var textureReady = false;
        loadTextureAsync(sceneConfig.image).then(function (tex) {
            nextSphere.material.map = tex;
            nextSphere.material.needsUpdate = true;
            window.tourState.currentTexture = tex;
            textureReady = true;
        }).catch(function (err) {
            console.error('[GSV] Texture load failed:', err);
        });

        // ── Timeline GSAP ─────────────────────────────────────────
        //
        //  0.0s ──────── 0.45s : stretch monte (0 → MAX_STRETCH)
        //  0.0s ──────── 0.45s : opacité vieille sphère (1 → 0)
        //  0.0s ──────── 0.9s  : dolly-in caméra (startPos → endPos)
        //  0.36s ─────── 0.72s : opacité nouvelle sphère (0 → 1)
        //  0.9s          ───── : finalize()
        //
        var tl = gsap.timeline({
            onComplete: function () {
                // Attendre la texture si elle n'est pas encore prête
                (function waitTexture() {
                    if (textureReady) {
                        finalize(nextSphere, oldSphere, targetSceneId, transitionBearing);
                    } else {
                        setTimeout(waitTexture, 32);
                    }
                })();
            }
        });

        // Dolly-in caméra (toute la durée, easeInOut)
        tl.to(camera.position, {
            x: endPos.x,
            y: endPos.y,
            z: endPos.z,
            duration: TOTAL_DURATION,
            ease: 'power2.inOut'
        }, 0);

        // Stretch radial de la vieille sphère (première moitié)
        if (stretchMat) {
            tl.to(stretchMat.uniforms.uStretch, {
                value: MAX_STRETCH,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power2.inOut'
            }, 0);
            // Fondu sortant de la vieille sphère (première moitié)
            tl.to(stretchMat.uniforms.uOpacity, {
                value: 0,
                duration: TOTAL_DURATION * 0.5,
                ease: 'power1.in'
            }, 0);
        }

        // Fondu entrant de la nouvelle sphère (deuxième moitié, décalé à 40%)
        tl.to(nextSphere.material, {
            opacity: 1,
            duration: TOTAL_DURATION * 0.4,
            ease: 'power1.out',
            onUpdate: function () {
                nextSphere.material.needsUpdate = true;
            }
        }, TOTAL_DURATION * 0.4);

        // [CORRECTION GSV] finalize définie inline pour closure sur les variables GSAP
        function finalize(next, old, targetId, finalBearing) {
            // Nettoyer la vieille sphère
            if (old) {
                scene.remove(old);
                if (old.geometry) { old.geometry.dispose(); }
                if (old.material) { old.material.dispose(); }
            }

            // Finaliser la nouvelle sphère
            next.material.opacity = 1;
            next.material.transparent = false;
            next.material.depthWrite = true;
            next.material.needsUpdate = true;
            window.tourState.sphere = next;

            // Réinitialiser la caméra au centre
            camera.position.set(0, 0, 0.001);

            // Mettre à jour l'état de la scène
            // [ORIENTATION DYNAMIQUE] La caméra regarde dans la direction du déplacement.
            // `finalBearing` est le bearing du hotspot cliqué dans la scène source.
            // On regarde dans cette même direction (pas son inverse) car on avance VERS
            // la scène cible le long de ce cap.
            window.tourState.currentScene = targetId;
            window.tourState.lon = normalizeDegrees(finalBearing);
            window.tourState.lat = 0;
            window.tourState.fov = 75;
            camera.fov = 75;
            camera.updateProjectionMatrix();

            // Mettre à jour l'UI (menu, minimap, hotspots) — NE PAS SUPPRIMER
            updateSceneUi();
            window.tourState.isTransitioning = false;
            window.tourState.controlsEnabled = true;
            window.tourState.lastInteractionTime = Date.now();
        }
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
