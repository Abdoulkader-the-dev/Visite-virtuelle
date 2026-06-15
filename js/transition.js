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

    // -------------------------------------------------------------------------
    // createRadialStretchMaterial()
    //
    // Shader de la VIEILLE sphère (A) : étirement radial en vertex (CC Scale
    // Wipe) + motion blur directionnel radial en fragment.
    //
    // Le vertex shader travaille en NDC pour un étirement homogène par rapport
    // au plan de l'écran. Le centre (radius < 0.2) reste fixe — point de fuite
    // net. La périphère (radius > 1.3) subit l'étirement maximal.
    //
    // Le fragment shader moyenne 5 échantillons le long du vecteur radial
    // vers le centre (0.5, 0.5) pour simuler un flou directionnel de vitesse.
    //
    // Uniforms animés par GSAP :
    //   uStretch  — étirement périphérique (0 → 0.4 → 0)
    //   uBlur     — intensité du flou de mouvement radial (cloche 0 → 1 → 0)
    //   uOpacity  — fondu sortant (1 → 0)
    // -------------------------------------------------------------------------
    function createRadialStretchMaterial(texture) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uMap:     { value: texture },
                uOpacity: { value: 1.0 },
                uStretch: { value: 0.0 },
                uBlur:    { value: 0.0 }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'uniform float uStretch;',
                '',
                'void main() {',
                '    vUv = uv;',
                '',
                '    // ── Espace modèle → view → projection ──',
                '    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
                '    vec4 projected  = projectionMatrix * mvPosition;',
                '',
                '    // ── Coordonnées NDC (avant division par w) ──',
                '    // On travaille en NDC pour un étirement homogène',
                '    // par rapport au plan de l\'écran.',
                '    vec2 ndc    = projected.xy / projected.w;',
                '    float radius = length(ndc.xy);',
                '',
                '    // ── Masque radial : centre fixe, périphérie étirée ──',
                '    // smoothstep(0.2, 1.3) :',
                '    //   radius < 0.2 → mask = 0 (centre parfaitement net)',
                '    //   radius > 1.3 → mask = 1 (périphérie pleinement étirée)',
                '    float mask = smoothstep(0.2, 1.3, radius);',
                '',
                '    // ── Direction radiale normalisée ──',
                '    // Évite la division par zéro au centre exact',
                '    vec2 dir = (radius > 0.0001)',
                '               ? (ndc.xy / radius)',
                '               : vec2(0.0);',
                '',
                '    // ── Étirement radial : déplace les sommets en NDC ──',
                '    // projected.w assure l\'homogénéité en perspective.',
                '    // Le masque garantit que le centre reste immobile.',
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
                '    // ── Couleur de base (pixel net) ──',
                '    vec4 color = texture2D(uMap, vUv);',
                '',
                '    // ── Motion Blur directionnel radial ──',
                '    // 5 échantillons le long du vecteur vers le centre (0.5, 0.5).',
                '    // L\'intensité est proportionnelle à uBlur.',
                '    if (uBlur > 0.001) {',
                '        vec2 toCenter = vUv - vec2(0.5);',
                '        float blurStrength = uBlur * 0.015;',
                '        vec4 blurSum = vec4(0.0);',
                '',
                '        // Échantillons symétriques : -2, -1, 0, +1, +2',
                '        for (float i = 0.0; i < 5.0; i += 1.0) {',
                '            float t = (i - 2.0) / 2.0;',
                '            vec2 offset = toCenter * blurStrength * t;',
                '            blurSum += texture2D(uMap, vUv - offset);',
                '        }',
                '        blurSum /= 5.0;',
                '',
                '        // Mix progressif : plus uBlur est élevé,',
                '        // plus le flou domine sur le pixel net.',
                '        color = mix(color, blurSum, uBlur);',
                '    }',
                '',
                '    // ── Opacité de fondu sortant ──',
                '    gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
                '}'
            ].join('\n'),
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
    }

    // -------------------------------------------------------------------------
    // createCrossfadeMaterial()
    //
    // Shader de la NOUVELLE sphère (B) : fondu entrant pur (crossfade).
    // Pas de mosaïque, pas de pixellisation — uniquement un mix d'opacité
    // progressif pour une transition fluide et lisse avec la sphère A.
    //
    // Uniform animé par GSAP :
    //   uOpacity  — fondu entrant (0 → 1)
    // -------------------------------------------------------------------------
    function createCrossfadeMaterial(texture) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uMap:     { value: texture },
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

    // -------------------------------------------------------------------------
    // triggerGSVTransition()
    //
    // Cinematique GSV 900ms : dolly dynamique + stretch + crossfade.
    //
    // Le dolly utilise la VRAIE position 3D du hotspot (pas un bearing fixe)
    // pour calculer la direction de deplacement physique de la caméra.
    // -------------------------------------------------------------------------
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
        var transitionBearing = (typeof bearing === 'number')
            ? bearing
            : window.tourState.lon;

        // --- Recuperer le hotspot clique pour sa position 3D reel ---
        var clickedHotspot = (options && options.hotspot) || null;

        pushHistory(options);
        window.tourState.isTransitioning = true;
        window.tourState.controlsEnabled = false;
        if (window.hideInfoCard) { window.hideInfoCard(); }

        // ── Direction du dolly : vecteur normalise depuis l'origine vers le hotspot ──
        // Au moment du clic, la caméra est au centre (0, 0, 0.001), donc le vecteur
        // de direction est simplement la position 3D du hotspot normalisée.
        // Cela garantit que le mouvement physique suit exactement l'axe visuel
        // indiqué par la flèche 3D au sol.
        var dollyDir;
        if (clickedHotspot && clickedHotspot.position) {
            var hx = clickedHotspot.position.x;
            var hy = clickedHotspot.position.y || 0;
            var hz = clickedHotspot.position.z;
            var len = Math.sqrt(hx * hx + hy * hy + hz * hz);
            if (len > 0.001) {
                dollyDir = new THREE.Vector3(hx / len, hy / len, hz / len);
            } else {
                var fallbackRad = transitionBearing * Math.PI / 180;
                dollyDir = new THREE.Vector3(
                    Math.sin(fallbackRad), 0, -Math.cos(fallbackRad)
                ).normalize();
            }
        } else {
            var fallbackRad2 = transitionBearing * Math.PI / 180;
            dollyDir = new THREE.Vector3(
                Math.sin(fallbackRad2), 0, -Math.cos(fallbackRad2)
            ).normalize();
        }

        var startPos = camera.position.clone();
        var endPos = new THREE.Vector3(
            startPos.x + dollyDir.x * DOLLY_DISTANCE,
            startPos.y + dollyDir.y * DOLLY_DISTANCE,
            startPos.z + dollyDir.z * DOLLY_DISTANCE
        );

        // ── Sphère de destination (B) ─────────────────────────────
        // On crée la sphère avec un matériau standard ; le shader mosaïque
        // sera appliqué une fois la texture chargée.
        var nextSphere = window.createSphere();
        nextSphere.material.opacity = 0;
        nextSphere.material.transparent = true;
        nextSphere.material.depthWrite = false;
        nextSphere.renderOrder = 2;
        scene.add(nextSphere);

        // ── Shader sur la vieille sphère (A) ───────────────────────
        var stretchMat = null;
        if (oldSphere && oldSphere.material && oldSphere.material.map) {
            var oldBaseMat = oldSphere.material;
            stretchMat = createRadialStretchMaterial(oldBaseMat.map);
            oldSphere.material = stretchMat;
            oldSphere.renderOrder = 1;
            oldBaseMat.dispose();
        }

        // ── Shader crossfade sur la nouvelle sphère (B) ───────────
        var crossfadeMat = null;

        // ── Chargement de la texture cible + shader crossfade ─────
        var textureReady = false;
        loadTextureAsync(sceneConfig.image).then(function (tex) {
            crossfadeMat = createCrossfadeMaterial(tex);
            nextSphere.material = crossfadeMat;
            nextSphere.material.needsUpdate = true;
            window.tourState.currentTexture = tex;
            textureReady = true;

            // Fondu entrant : uOpacity de 0 → 1 sur la deuxième moitié
            tl.to(crossfadeMat.uniforms.uOpacity, {
                value: 1,
                duration: TOTAL_DURATION * 0.4,
                ease: 'power1.out'
            }, TOTAL_DURATION * 0.4);
        }).catch(function (err) {
            console.error('[GSV] Texture load failed:', err);
            nextSphere.material.transparent = true;
            nextSphere.material.opacity = 0;
            tl.to(nextSphere.material, {
                opacity: 1,
                duration: TOTAL_DURATION * 0.4,
                ease: 'power1.out',
                onUpdate: function () {
                    nextSphere.material.needsUpdate = true;
                }
            }, TOTAL_DURATION * 0.4);
        });

        // ── Timeline GSAP ─────────────────────────────────────────
        //
        //  0.0s ──────── 0.45s : uStretch monte (0 → 0.4, accélération)
        //  0.0s ──────── 0.45s : uBlur monte (0 → 1, pic de vitesse)
        //  0.0s ──────── 0.45s : uOpacity sphère A (1 → 0.5, fondu partiel)
        //  0.0s ──────── 0.9s  : dolly-in caméra (startPos → endPos)
        //  0.45s ─────── 0.9s  : uStretch décroît (0.4 → 0, résorption)
        //  0.45s ─────── 0.9s  : uBlur décroît (1 → 0, netteté finale)
        //  0.45s ─────── 0.9s  : uOpacity sphère A (0.5 → 0, fondu final)
        //  0.4s  ─────── 0.76s : uOpacity sphère B (0 → 1, fondu entrant)
        //  0.9s          ───── : finalize()
        //
        var tl = gsap.timeline({
            onComplete: function () {
                (function waitTexture() {
                    if (textureReady) {
                        finalize(nextSphere, oldSphere, targetSceneId);
                    } else {
                        setTimeout(waitTexture, 32);
                    }
                })();
            }
        });

        // ── Dolly-in caméra (toute la durée, easeInOut) ──
        tl.to(camera.position, {
            x: endPos.x,
            y: endPos.y,
            z: endPos.z,
            duration: TOTAL_DURATION,
            ease: 'power2.inOut'
        }, 0);

        // ── Sphère A (vieille) : stretch + blur + fondu sortant ──
        if (stretchMat) {
            // uStretch : montée 0 → 0.4 (0→450ms, power2.out = accélération)
            //            puis descente 0.4 → 0 (450→900ms, power2.in = décélération)
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

            // uBlur : cloche 0 → 1 → 0
            //         montée (0→450ms) : power2.out — le flou s'intensifie vite
            //         descente (450→900ms) : power2.in — retour progressif au net
            //         Pic à 450ms = vitesse maximale perçue
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

            // uOpacity : fondu sortant en deux phases
            //   Phase 1 (0→450ms) : 1 → 0.5, fondu partiel (le stretch domine)
            //   Phase 2 (450→900ms) : 0.5 → 0, fondu final (le crossfade prend le relais)
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

        // Sphère B : animation uOpacity déportée dans le .then() ci-dessus.

        function finalize(next, old, targetId) {
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

            // Métadonnées de scène
            window.tourState.currentScene = targetId;
            window.tourState.lat = 0;
            window.tourState.fov = 75;
            camera.fov = 75;
            camera.updateProjectionMatrix();

            // ── Orientation : on NE touche PAS à window.tourState.lon ──
            // La transition GSAP a déjà orienté la caméra de manière fluide
            // vers l'axe du dolly-in. Forcer un saut vers defaultLon créerait
            // un "pop" visuel. La vue en cours est conservée telle quelle.

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
