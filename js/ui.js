(function () {
    'use strict';

    var minimapArrow = null;
    // VR-related variables removed as VR functionality is removed

    function sceneIds() {
        return Object.keys(window.TOUR_CONFIG.scenes);
    }

    function updateZoomLevel() {
        var zoomLevel = document.getElementById('zoom-level');
        if (zoomLevel) {
            zoomLevel.textContent = Math.round((100 / window.tourState.fov) * 100) + '%';
        }
    }

    function animateZoomTo(targetFov) {
        var start = window.tourState.fov;
        var end = Math.max(40, Math.min(100, targetFov));
        var startTime = performance.now();
        var duration = 260;

        function frame(now) {
            var t = Math.min(1, (now - startTime) / duration);
            var eased = t * (2 - t);
            window.tourState.fov = start + (end - start) * eased;
            updateZoomLevel();
            if (t < 1) {
                requestAnimationFrame(frame);
            }
        }

        requestAnimationFrame(frame);
    }

    function updateNavMenu() {
        var currentScene = window.tourState.currentScene;
        document.querySelectorAll('.scene-item').forEach(function (item) {
            item.classList.toggle('active', item.dataset.scene === currentScene);
            item.setAttribute('aria-current', item.dataset.scene === currentScene ? 'page' : 'false');
        });
    }

    function buildNavMenu() {
        var sceneList = document.getElementById('scene-list');
        sceneList.innerHTML = '';

        sceneIds().forEach(function (sceneId) {
            var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
            var item = document.createElement('div');
            item.className = 'scene-item';
            item.dataset.scene = sceneId;
            item.textContent = sceneConfig.name;
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', 'Aller a ' + sceneConfig.name);
            item.addEventListener('click', function () {
                if (sceneId !== window.tourState.currentScene && window.startTransition) {
                    window.startTransition(sceneId);
                }
            });
            item.addEventListener('keydown', function (event) {
                if ((event.key === 'Enter' || event.key === ' ') && sceneId !== window.tourState.currentScene && window.startTransition) {
                    event.preventDefault();
                    window.startTransition(sceneId);
                }
            });
            sceneList.appendChild(item);
        });
    }

    function sceneHasLink(fromId, toId) {
        return window.TOUR_CONFIG.scenes[fromId].hotspots.some(function (hotspot) {
            return hotspot.type === 'transition' && hotspot.target === toId;
        });
    }

    function updateMinimap() {
        var minimap = document.getElementById('minimap');
        minimap.innerHTML = '';

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'minimap-svg');
        svg.setAttribute('viewBox', '0 0 160 160');

        sceneIds().forEach(function (fromId) {
            sceneIds().forEach(function (toId) {
                if (fromId >= toId || (!sceneHasLink(fromId, toId) && !sceneHasLink(toId, fromId))) {
                    return;
                }
                var fromScene = window.TOUR_CONFIG.scenes[fromId];
                var toScene = window.TOUR_CONFIG.scenes[toId];
                var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'minimap-line');
                line.setAttribute('x1', fromScene.minimapX * 1.6);
                line.setAttribute('y1', fromScene.minimapY * 1.6);
                line.setAttribute('x2', toScene.minimapX * 1.6);
                line.setAttribute('y2', toScene.minimapY * 1.6);
                svg.appendChild(line);
            });
        });

        minimap.appendChild(svg);
        minimapArrow = document.createElement('span');
        minimapArrow.className = 'minimap-arrow';

        sceneIds().forEach(function (sceneId) {
            var sceneConfig = window.TOUR_CONFIG.scenes[sceneId];
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'minimap-dot';
            dot.dataset.scene = sceneId;
            dot.style.left = sceneConfig.minimapX + '%';
            dot.style.top = sceneConfig.minimapY + '%';
            dot.setAttribute('aria-label', sceneConfig.name);
            dot.addEventListener('click', function () {
                if (sceneId !== window.tourState.currentScene && window.startTransition) {
                    window.startTransition(sceneId);
                }
            });
            if (sceneId === window.tourState.currentScene) {
                dot.classList.add('active');
                dot.appendChild(minimapArrow);
            }
            minimap.appendChild(dot);
        });
    }

    function updateMinimapArrow() {
        if (minimapArrow) {
            minimapArrow.style.transform = 'translateX(-50%) rotate(' + window.tourState.lon + 'deg)';
        }
    }

    function compassDirection(degrees) {
        var labels = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        var index = Math.round(degrees / 22.5) % 16;
        return labels[index];
    }

    function updateCompass() {
        var needle = document.getElementById('compass-needle');
        var heading = document.getElementById('compass-heading');
        var degrees = ((window.tourState.lon % 360) + 360) % 360;

        if (needle) {
            needle.setAttribute('transform', 'rotate(' + (-window.tourState.lon % 360) + ', 28, 28)');
        }
        if (heading) {
            heading.textContent = Math.round(degrees) + ' ' + compassDirection(degrees);
        }
    }

    function updateBackButton() {
        var btn = document.getElementById('back-btn');
        if (btn) {
            btn.style.display = window.tourState.history.length > 0 ? 'flex' : 'none';
        }
        document.body.classList.toggle('has-history', window.tourState.history.length > 0);
    }

    function goBack() {
        var history = window.tourState.history;
        var previousScene;

        if (history.length === 0 || window.tourState.isTransitioning) {
            return;
        }

        previousScene = history.pop();
        updateBackButton();
        if (window.startTransition) {
            window.startTransition(previousScene, { isBack: true });
        }
    }

    function showInfoCard(hotspot, screenX, screenY) {
        if (window.tourState.isXRActive && window.showVRInfoPanel) {
            window.showVRInfoPanel(hotspot);
            return;
        }

        var card = document.getElementById('info-card');
        document.getElementById('info-icon').textContent = hotspot.icon || 'i';
        document.getElementById('info-title').textContent = hotspot.title || 'Information';
        document.getElementById('info-description').textContent = hotspot.description || '';

        card.classList.add('visible');
        var width = card.offsetWidth || 300;
        var height = card.offsetHeight || 140;
        var left = Math.min(Math.max(14, screenX + 18), window.innerWidth - width - 14);
        var top = Math.min(Math.max(14, screenY - height / 2), window.innerHeight - height - 14);
        card.style.left = left + 'px';
        card.style.top = top + 'px';
    }

    function hideInfoCard() {
        document.getElementById('info-card').classList.remove('visible');
    }

    // -------------------------------------------------------------------------
    // VR INFO PANEL
    // -------------------------------------------------------------------------

    function showVRInfoPanel(hotspot) {
        // Show the VR info panel (implemented in vr-ui.js)
        if (window.showVRInfoPanel) {
            window.showVRInfoPanel(hotspot);
        }
    }

    function hideVRInfoPanel() {
        // Hide the VR info panel (implemented in vr-ui.js)
        if (window.hideVRInfoPanel) {
            window.hideVRInfoPanel();
        }
    }

    function updateVRInfoPanelFrame() {
        // Update the VR info panel frame (implemented in vr-ui.js)
        if (window.updateVRInfoPanelFrame) {
            window.updateVRInfoPanelFrame();
        }
    }

    function setupVRButton() {
        // Set up the VR button (implemented in vr-ui.js)
        if (window.setupVRButton) {
            window.setupVRButton();
        }
    }

    function exitVR() {
        // Exit VR (implemented in vr-ui.js)
        if (window.exitVR) {
            window.exitVR();
        }
    }

    function showVRInfoPanel(hotspot) {
        // Show the VR info panel (implemented in vr-ui.js)
        if (window.showVRInfoPanel) {
            window.showVRInfoPanel(hotspot);
        }
    }

    function updateVRInfoPanelFrame() {
        // Update the VR info panel frame (implemented in vr-ui.js)
        if (window.updateVRInfoPanelFrame) {
            window.updateVRInfoPanelFrame();
        }
    }

    function roundedCardCanvas(hotspot) {
        var canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 384;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(72, 78, 42, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '48px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hotspot.icon || 'i', 72, 78);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px system-ui';
        ctx.fillText(hotspot.title || 'Information', 140, 72);

        ctx.font = '28px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        var words = (hotspot.description || '').split(' ');
        var line = '';
        var y = 150;
        for (var i = 0; i < words.length; i += 1) {
            var test = line + words[i] + ' ';
            if (ctx.measureText(test).width > 560 && i > 0) {
                ctx.fillText(line, 58, y);
                line = words[i] + ' ';
                y += 40;
            } else {
                line = test;
            }
        }
        ctx.fillText(line, 58, y);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(676, 22, 58, 58);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('×', 705, 53);

        return canvas;
    }

        // hideVRInfoPanel() removed as VR functionality is removed

        // showVRInfoPanel() removed as VR functionality is removed

        // updateVRInfoPanelFrame() removed as VR functionality is removed

        // setupVRButton() removed as VR functionality is removed

    function fullscreenElement() {
        return document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;
    }

    function updateFullscreenButton() {
        var expand = document.getElementById('fs-icon-expand');
        var compress = document.getElementById('fs-icon-compress');
        window.tourState.isFullscreen = !!fullscreenElement();

        if (expand && compress) {
            expand.style.display = window.tourState.isFullscreen ? 'none' : '';
            compress.style.display = window.tourState.isFullscreen ? '' : 'none';
        }
    }

    function toggleFullscreen() {
        var doc = document;
        var root = document.documentElement;

        if (fullscreenElement()) {
            if (doc.exitFullscreen) {
                doc.exitFullscreen();
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.mozCancelFullScreen) {
                doc.mozCancelFullScreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
            return;
        }

        if (root.requestFullscreen) {
            root.requestFullscreen();
        } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
        } else if (root.mozRequestFullScreen) {
            root.mozRequestFullScreen();
        } else if (root.msRequestFullscreen) {
            root.msRequestFullscreen();
        }
    }

    function setupFullscreen() {
        var button = document.getElementById('fullscreen-btn');
        if (button) {
            button.addEventListener('click', toggleFullscreen);
        }

        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (eventName) {
            document.addEventListener(eventName, updateFullscreenButton);
        });
        updateFullscreenButton();
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        return new Promise(function (resolve, reject) {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', 'readonly');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();

            try {
                if (document.execCommand('copy')) {
                    resolve();
                } else {
                    reject(new Error('Copie indisponible'));
                }
            } catch (error) {
                reject(error);
            } finally {
                document.body.removeChild(textarea);
            }
        });
    }

    function shareCurrentView() {
        var button = document.getElementById('share-btn');
        var label = button ? button.querySelector('span') : null;
        var baseUrl = window.location.origin + window.location.pathname;
        var url = baseUrl + '?scene=' + encodeURIComponent(window.tourState.currentScene) +
            '&lon=' + Math.round(window.tourState.lon) +
            '&lat=' + Math.round(window.tourState.lat);

        copyText(url).then(function () {
            if (label) {
                label.textContent = 'Copie !';
                setTimeout(function () {
                    label.textContent = 'Partager';
                }, 2000);
            }
        }).catch(function () {
            if (label) {
                label.textContent = 'Erreur copie';
                setTimeout(function () {
                    label.textContent = 'Partager';
                }, 2000);
            }
        });
    }

    function setupShareButton() {
        var button = document.getElementById('share-btn');
        if (button) {
            button.addEventListener('click', shareCurrentView);
        }
    }

    function initUI() {
        buildNavMenu();
        updateNavMenu();
        updateMinimap();
        updateZoomLevel();
        updateCompass();
        updateBackButton();
        setupVRButton();
        setupFullscreen();
        setupShareButton();

        document.getElementById('nav-toggle').addEventListener('click', function () {
            document.getElementById('nav-menu').classList.toggle('open');
            window.tourState.lastInteractionTime = Date.now();
        });

        document.getElementById('back-btn').addEventListener('click', goBack);

        document.getElementById('zoom-in').addEventListener('click', function () {
            window.tourState.lastInteractionTime = Date.now();
            animateZoomTo(window.tourState.fov - 10);
        });

        document.getElementById('zoom-out').addEventListener('click', function () {
            window.tourState.lastInteractionTime = Date.now();
            animateZoomTo(window.tourState.fov + 10);
        });

        document.getElementById('info-close').addEventListener('click', hideInfoCard);
    }

        // exitVR() removed as VR functionality is removed

    function setupVRButton() {
        // Set up the VR button (implemented in vr-ui.js)
        if (window.setupVRButton) {
            window.setupVRButton();
        }
    }

    function exitVR() {
        // Exit VR (implemented in vr-ui.js)
        if (window.exitVR) {
            window.exitVR();
        }
    }

    window.initUI = initUI;
    window.updateNavMenu = updateNavMenu;
    window.updateMinimap = updateMinimap;
    window.updateMinimapArrow = updateMinimapArrow;
    window.updateCompass = updateCompass;
    window.updateBackButton = updateBackButton;
    window.goBack = goBack;
    window.toggleFullscreen = toggleFullscreen;
    window.updateZoomLevel = updateZoomLevel;
    window.showInfoCard = showInfoCard;
    window.hideInfoCard = hideInfoCard;
    window.showVRInfoPanel = showVRInfoPanel;
    window.hideVRInfoPanel = hideVRInfoPanel;
    window.updateVRInfoPanelFrame = updateVRInfoPanelFrame;
    window.setupVRButton = setupVRButton;
    window.exitVR = exitVR;
})();
