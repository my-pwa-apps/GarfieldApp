import { makeDraggable } from './toolbar.js';

const TOOLBAR_MIN_VERTICAL_GAP = 20;
const TOOLBAR_COMIC_CLEARANCE = 18;
const TOOLBAR_VISUAL_SHADOW_CLEARANCE = 14;
const TOOLBAR_EFFECTIVE_COMIC_CLEARANCE = TOOLBAR_COMIC_CLEARANCE + TOOLBAR_VISUAL_SHADOW_CLEARANCE;
const TOOLBAR_CENTER_BIAS = 6;

const STORAGE_KEYS = Object.freeze({
    TOOLBAR_POS: 'toolbarPosition',
    TOOLBAR_OPTIMAL: 'toolbarOptimal',
    SETTINGS: 'settings'
});

let isRotatedMode = false;
let isToolbarPersistenceSuspended = false;
let toolbarStateBeforeRotate = null;
let suppressToolbarClampUntil = 0;

export function setToolbarRotatedState(active) {
    isRotatedMode = Boolean(active);
}

function safeJSONParse(str, fallback) {
    try {
        return str ? JSON.parse(str) : fallback;
    } catch {
        return fallback;
    }
}

function getToolbarBoundaryComicElement() {
    return document.getElementById('comic-wrapper') || document.getElementById('comic-container') || document.getElementById('comic');
}

export function storeToolbarPosition(top, left, toolbarEl, overrides = {}) {
    const toolbar = toolbarEl || document.querySelector('.toolbar:not(.fullscreen-toolbar)');
    const savedRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS);
    const saved = safeJSONParse(savedRaw, {}) || {};
    const toolbarRect = toolbar ? toolbar.getBoundingClientRect() : null;
    const hasGeometry = toolbarRect && toolbarRect.height > 0 && !Number.isNaN(toolbarRect.top);
    const metadataLocked = isToolbarPersistenceSuspended || !hasGeometry;

    const positionData = { ...saved, top, left };
    const hasOverride = (key) => Object.prototype.hasOwnProperty.call(overrides, key);
    const applyOverride = (key) => {
        if (!hasOverride(key)) return false;
        const value = overrides[key];
        if (value === null || value === undefined) {
            delete positionData[key];
        } else {
            positionData[key] = value;
        }
        return true;
    };

    if (metadataLocked) {
        try {
            localStorage.setItem(STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(positionData));
        } catch (_) {}
        return;
    }

    const belowComicOverridden = applyOverride('belowComic');
    const offsetComicOverridden = applyOverride('offsetFromComic');
    const belowSettingsOverridden = applyOverride('belowSettings');
    const offsetSettingsOverridden = applyOverride('offsetFromSettings');
    const belowControlsOverridden = applyOverride('belowControls');
    const offsetControlsOverridden = applyOverride('offsetFromControls');

    const comicElement = getToolbarBoundaryComicElement();
    if (comicElement && toolbarRect && !belowComicOverridden) {
        const comicRect = comicElement.getBoundingClientRect();
        const belowComic = toolbarRect.top >= comicRect.bottom + TOOLBAR_EFFECTIVE_COMIC_CLEARANCE;
        positionData.belowComic = belowComic;
        if (!offsetComicOverridden) {
            if (belowComic) {
                positionData.offsetFromComic = Math.max(TOOLBAR_MIN_VERTICAL_GAP, toolbarRect.top - comicRect.bottom);
            } else {
                delete positionData.offsetFromComic;
            }
        }
    } else if (belowComicOverridden && !offsetComicOverridden && positionData.belowComic === false) {
        delete positionData.offsetFromComic;
    }

    const controlsContainer = document.getElementById('controls-container');
    if (controlsContainer && toolbarRect && !belowControlsOverridden) {
        const controlsRect = controlsContainer.getBoundingClientRect();
        const belowControls = toolbarRect.top >= controlsRect.bottom - 5;
        positionData.belowControls = belowControls;
        if (!offsetControlsOverridden) {
            if (belowControls) {
                positionData.offsetFromControls = Math.max(TOOLBAR_MIN_VERTICAL_GAP, toolbarRect.top - controlsRect.bottom);
            } else {
                delete positionData.offsetFromControls;
            }
        }
    } else if (belowControlsOverridden && !offsetControlsOverridden && positionData.belowControls === false) {
        delete positionData.offsetFromControls;
    }

    const settingsPanel = document.getElementById('settingsDIV');
    if (settingsPanel && settingsPanel.classList.contains('visible') && toolbarRect) {
        const settingsRect = settingsPanel.getBoundingClientRect();
        if (!belowSettingsOverridden) {
            const belowSettings = toolbarRect.top >= settingsRect.bottom + 5;
            positionData.belowSettings = belowSettings;
            if (!offsetSettingsOverridden) {
                if (belowSettings) {
                    positionData.offsetFromSettings = Math.max(TOOLBAR_MIN_VERTICAL_GAP, toolbarRect.top - settingsRect.bottom);
                } else {
                    delete positionData.offsetFromSettings;
                }
            }
        } else if (!offsetSettingsOverridden && positionData.belowSettings === false) {
            delete positionData.offsetFromSettings;
        }
    }

    const logoEl = document.querySelector('.logo');
    if (logoEl && comicElement && toolbarRect && !positionData.belowComic && !positionData.belowControls) {
        const logoRect = logoEl.getBoundingClientRect();
        const comicRect = comicElement.getBoundingClientRect();
        const gapTotal = comicRect.top - logoRect.bottom;
        if (gapTotal > 0) {
            positionData.gapRatio = (toolbarRect.top - logoRect.bottom) / gapTotal;
        }
    }

    try {
        localStorage.setItem(STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(positionData));
    } catch (_) {}
}

function whenLayoutSettled() {
    const fontsReady = document.fonts?.ready?.catch?.(() => {}) || Promise.resolve();
    const windowLoaded = document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));

    return Promise.all([fontsReady, windowLoaded])
        .then(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
}

export function calculateOptimalToolbarPosition(toolbar) {
    const logo = document.querySelector('.logo');
    const comic = getToolbarBoundaryComicElement();
    if (!logo || !comic) return null;

    const logoRect = logo.getBoundingClientRect();
    const comicRect = comic.getBoundingClientRect();
    const toolbarHeight = toolbar.offsetHeight || toolbar.getBoundingClientRect().height;
    const toolbarWidth = toolbar.offsetWidth || toolbar.getBoundingClientRect().width;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;

    if (!toolbarHeight || !toolbarWidth) return null;

    const logoBottom = logoRect.bottom;
    const comicTop = comicRect.top;
    const availableSpace = comicTop - logoBottom;
    const left = (viewportWidth - toolbarWidth) / 2;

    const requiredSpace = toolbarHeight + TOOLBAR_MIN_VERTICAL_GAP + TOOLBAR_EFFECTIVE_COMIC_CLEARANCE;
    if (availableSpace < requiredSpace && document.getElementById('comic-container')) {
        return {
            top: logoBottom + TOOLBAR_MIN_VERTICAL_GAP,
            left,
            extraComicMarginTop: requiredSpace - availableSpace
        };
    }

    const top = logoBottom + Math.max(TOOLBAR_MIN_VERTICAL_GAP, ((availableSpace - toolbarHeight) / 2) - TOOLBAR_CENTER_BIAS);

    if (top + toolbarHeight > comicTop - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE) {
        return {
            top: Math.max(logoBottom + TOOLBAR_MIN_VERTICAL_GAP, comicTop - toolbarHeight - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE),
            left,
            extraComicMarginTop: 0
        };
    }

    return { top, left, extraComicMarginTop: 0 };
}

function applyComicContainerSpacing(optimal) {
    if (!optimal?.extraComicMarginTop) return;
    const comicContainer = document.getElementById('comic-container');
    if (!comicContainer) return;
    const currentMargin = parseInt(window.getComputedStyle(comicContainer).marginTop, 10) || 80;
    comicContainer.style.marginTop = `${currentMargin + optimal.extraComicMarginTop}px`;
}

function rectsOverlap(firstRect, secondRect, padding = 0) {
    return firstRect.left < secondRect.right + padding &&
        firstRect.right > secondRect.left - padding &&
        firstRect.top < secondRect.bottom + padding &&
        firstRect.bottom > secondRect.top - padding;
}

export function moveToolbarBetweenLogoAndComic(toolbar, savePosition = true) {
    if (!toolbar) return false;

    const logo = document.querySelector('.logo');
    const comic = getToolbarBoundaryComicElement();
    if (!logo || !comic) return false;

    const toolbarRect = toolbar.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    const comicRect = comic.getBoundingClientRect();
    const toolbarHeight = toolbar.offsetHeight || toolbarRect.height;
    const toolbarWidth = toolbar.offsetWidth || toolbarRect.width;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;

    if (!toolbarHeight || !toolbarWidth) return false;

    const overlapsLogo = rectsOverlap(toolbarRect, logoRect, TOOLBAR_MIN_VERTICAL_GAP);
    const overlapsComic = rectsOverlap(toolbarRect, comicRect, TOOLBAR_EFFECTIVE_COMIC_CLEARANCE);
    if (!overlapsLogo && !overlapsComic) {
        return false;
    }

    const minimumTop = logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP;
    const maximumTop = comicRect.top - toolbarHeight - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE;
    const centeredLeft = Math.max(0, (viewportWidth - toolbarWidth) / 2);
    let nextLeft = parseFloat(toolbar.style.left);
    if (Number.isNaN(nextLeft)) {
        nextLeft = toolbarRect.left;
    }
    nextLeft = Math.max(0, Math.min(nextLeft, viewportWidth - toolbarWidth));

    let nextTop;
    if (maximumTop >= minimumTop) {
        nextTop = overlapsLogo ? minimumTop : maximumTop;
    } else {
        const optimal = calculateOptimalToolbarPosition(toolbar);
        applyComicContainerSpacing(optimal);
        nextTop = optimal ? optimal.top : minimumTop;
        nextLeft = optimal ? optimal.left : centeredLeft;
    }

    toolbar.style.top = nextTop + 'px';
    toolbar.style.left = nextLeft + 'px';
    toolbar.style.transform = 'none';

    if (savePosition) {
        storeToolbarPosition(nextTop, nextLeft, toolbar, {
            belowComic: false,
            offsetFromComic: null,
            belowControls: false,
            offsetFromControls: null,
            belowSettings: false,
            offsetFromSettings: null,
            leftOffsetFromCenter: nextLeft - centeredLeft
        });
    }

    return true;
}

export function clampSettingsPanelPosition(left, top, width, height) {
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const minVisibleWidth = 64;
    const minVisibleHeaderHeight = 48;
    const minVisiblePanelHeight = 64;

    return {
        left: Math.max(minVisibleWidth - width, Math.min(left, viewportWidth - minVisibleWidth)),
        top: Math.max(minVisiblePanelHeight - height, Math.min(top, window.innerHeight - minVisibleHeaderHeight))
    };
}

export function positionToolbarCentered(toolbar, savePosition = false) {
    if (!toolbar || toolbar.offsetHeight === 0) return;

    const optimal = calculateOptimalToolbarPosition(toolbar);
    applyComicContainerSpacing(optimal);
    if (!optimal) {
        const logo = document.querySelector('.logo');
        if (!logo) return;
        const logoRect = logo.getBoundingClientRect();
        const toolbarWidth = toolbar.offsetWidth || toolbar.getBoundingClientRect().width;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const left = (viewportWidth - toolbarWidth) / 2;
        const top = logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP;
        toolbar.style.left = left + 'px';
        toolbar.style.top = top + 'px';
        toolbar.style.transform = 'none';
        if (savePosition) {
            storeToolbarPosition(top, left, toolbar, {
                belowComic: false,
                offsetFromComic: null,
                belowSettings: false,
                offsetFromSettings: null
            });
        }
        return;
    }

    toolbar.style.left = optimal.left + 'px';
    toolbar.style.top = optimal.top + 'px';
    toolbar.style.transform = 'none';

    if (savePosition) {
        storeToolbarPosition(optimal.top, optimal.left, toolbar, {
            belowComic: false,
            offsetFromComic: null,
            belowSettings: false,
            offsetFromSettings: null,
            leftOffsetFromCenter: 0
        });
        try {
            localStorage.setItem(STORAGE_KEYS.TOOLBAR_OPTIMAL, 'true');
        } catch (_) {}
    }
}

export function snapshotToolbarStateBeforeRotate() {
    const toolbar = document.getElementById('mainToolbar');
    toolbarStateBeforeRotate = {
        savedRaw: localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS),
        optimalRaw: localStorage.getItem(STORAGE_KEYS.TOOLBAR_OPTIMAL),
        top: toolbar?.style.top || '',
        left: toolbar?.style.left || '',
        transform: toolbar?.style.transform || ''
    };
}

export function restoreToolbarStateAfterRotate() {
    const toolbar = document.getElementById('mainToolbar');
    const snapshot = toolbarStateBeforeRotate;
    toolbarStateBeforeRotate = null;

    if (!toolbar || !snapshot) {
        clampToolbarInView();
        return;
    }

    suppressToolbarClampUntil = Date.now() + 400;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            try {
                if (snapshot.savedRaw && snapshot.savedRaw !== 'null') {
                    localStorage.setItem(STORAGE_KEYS.TOOLBAR_POS, snapshot.savedRaw);
                } else {
                    localStorage.removeItem(STORAGE_KEYS.TOOLBAR_POS);
                }

                if (snapshot.optimalRaw === 'true') {
                    localStorage.setItem(STORAGE_KEYS.TOOLBAR_OPTIMAL, 'true');
                } else {
                    localStorage.removeItem(STORAGE_KEYS.TOOLBAR_OPTIMAL);
                }
            } catch (_) {}

            if (snapshot.top) {
                toolbar.style.top = snapshot.top;
            }
            if (snapshot.left) {
                toolbar.style.left = snapshot.left;
            }
            toolbar.style.transform = snapshot.transform || 'none';
        });
    });
}

export function initializeDraggableSettings() {
    const panel = document.getElementById('settingsDIV');
    const header = document.getElementById('settingsHeader');
    const settingsStorageKey = STORAGE_KEYS.SETTINGS + '_pos';

    if (!panel || !header) return;

    function keepPanelReachable() {
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const top = parseFloat(panel.style.top);
        const left = parseFloat(panel.style.left);

        if (!width || !height || Number.isNaN(top) || Number.isNaN(left) || panel.style.transform !== 'none') {
            return;
        }

        const clamped = clampSettingsPanelPosition(left, top, width, height);
        if (clamped.top === top && clamped.left === left) return;

        panel.style.top = clamped.top + 'px';
        panel.style.left = clamped.left + 'px';

        try {
            localStorage.setItem(settingsStorageKey, JSON.stringify(clamped));
        } catch (_) {}
    }

    const savedPosRaw = localStorage.getItem(settingsStorageKey);
    const savedPos = safeJSONParse(savedPosRaw, null);
    if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
        const clamped = clampSettingsPanelPosition(savedPos.left, savedPos.top, panel.offsetWidth || 320, panel.offsetHeight || 0);
        panel.style.top = clamped.top + 'px';
        panel.style.left = clamped.left + 'px';
        panel.style.transform = 'none';

        try {
            localStorage.setItem(settingsStorageKey, JSON.stringify(clamped));
        } catch (_) {}
    }

    makeDraggable(panel, header, settingsStorageKey, {
        clampPosition: clampSettingsPanelPosition
    });
    window.addEventListener('resize', keepPanelReachable);
}

export function refreshToolbarDefaultPosition() {
    const toolbar = document.getElementById('mainToolbar');
    if (!toolbar || isToolbarPersistenceSuspended) return;

    const savedPosRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS);
    const hasSavedPosition = !!(savedPosRaw && savedPosRaw !== 'null');

    if (!hasSavedPosition) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                positionToolbarCentered(toolbar, true);
            });
        });
    }

    requestAnimationFrame(() => {
        moveToolbarBetweenLogoAndComic(toolbar);
    });
}

export function clampToolbarInView() {
    const toolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
    if (!toolbar || isToolbarPersistenceSuspended || isRotatedMode || Date.now() < suppressToolbarClampUntil) return;

    const isOptimalMode = localStorage.getItem(STORAGE_KEYS.TOOLBAR_OPTIMAL) === 'true';

    if (isOptimalMode) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const optimalPos = calculateOptimalToolbarPosition(toolbar);
                applyComicContainerSpacing(optimalPos);
                if (optimalPos) {
                    const logo = document.querySelector('.logo');
                    const comic = getToolbarBoundaryComicElement();

                    if (logo && comic) {
                        const logoRect = logo.getBoundingClientRect();
                        const comicRect = comic.getBoundingClientRect();
                        const toolbarHeight = toolbar.offsetHeight;

                        let safeTop = optimalPos.top;

                        if (safeTop < logoRect.bottom + 10) {
                            safeTop = logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP;
                        }

                        if (safeTop + toolbarHeight > comicRect.top - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE) {
                            safeTop = Math.max(logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP, comicRect.top - toolbarHeight - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE);
                        }

                        toolbar.style.top = safeTop + 'px';
                        toolbar.style.left = optimalPos.left + 'px';
                        toolbar.style.transform = 'none';
                        storeToolbarPosition(safeTop, optimalPos.left, toolbar);
                        moveToolbarBetweenLogoAndComic(toolbar);
                    } else {
                        toolbar.style.top = optimalPos.top + 'px';
                        toolbar.style.left = optimalPos.left + 'px';
                        toolbar.style.transform = 'none';
                        storeToolbarPosition(optimalPos.top, optimalPos.left, toolbar);
                        moveToolbarBetweenLogoAndComic(toolbar);
                    }
                }
            });
        });
        return;
    }

    const savedPosRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS);
    const savedPos = safeJSONParse(savedPosRaw, null);
    const hasSavedPosition = savedPosRaw && savedPosRaw !== 'null' && savedPos;

    if (!hasSavedPosition) {
        positionToolbarCentered(toolbar);
        return;
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const rect = toolbar.getBoundingClientRect();
            const toolbarHeight = rect.height;
            const toolbarWidth = toolbar.offsetWidth;
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const viewportHeight = window.innerHeight;

            const comic = getToolbarBoundaryComicElement();
            const controlsContainer = document.getElementById('controls-container');
            const settingsPanel = document.getElementById('settingsDIV');
            const logo = document.querySelector('.logo');

            let newTop = savedPos.top;
            const centerLeft = (viewportWidth - toolbarWidth) / 2;
            let newLeft = Math.max(0, Math.min(
                centerLeft + (savedPos.leftOffsetFromCenter || 0),
                viewportWidth - toolbarWidth
            ));

            if (savedPos.belowControls && controlsContainer) {
                const controlsRect = controlsContainer.getBoundingClientRect();
                const storedGap = Math.max(savedPos.offsetFromControls || 0, TOOLBAR_MIN_VERTICAL_GAP);
                newTop = controlsRect.bottom + storedGap;
            } else if (savedPos.belowSettings && settingsPanel && settingsPanel.classList.contains('visible')) {
                const settingsRect = settingsPanel.getBoundingClientRect();
                const storedGap = Math.max(savedPos.offsetFromSettings || 0, TOOLBAR_MIN_VERTICAL_GAP);
                newTop = settingsRect.bottom + storedGap;
            } else if (savedPos.belowComic && comic) {
                const comicRect = comic.getBoundingClientRect();
                const storedGap = Math.max(savedPos.offsetFromComic || 0, TOOLBAR_MIN_VERTICAL_GAP);
                newTop = comicRect.bottom + storedGap;
            } else if (typeof savedPos.gapRatio === 'number' && logo && comic) {
                const logoRect = logo.getBoundingClientRect();
                const comicRect = comic.getBoundingClientRect();
                const gapTotal = comicRect.top - logoRect.bottom;
                if (gapTotal > toolbarHeight + TOOLBAR_EFFECTIVE_COMIC_CLEARANCE) {
                    newTop = logoRect.bottom + (gapTotal * savedPos.gapRatio);
                    newTop = Math.max(logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP, newTop);
                    newTop = Math.min(newTop, comicRect.top - toolbarHeight - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE);
                }
            }

            const maxTop = viewportHeight - toolbarHeight - 10;
            if (newTop < 0) newTop = 0;
            if (newTop > maxTop) newTop = maxTop;

            if (logo) {
                const logoRect = logo.getBoundingClientRect();
                if (newTop < logoRect.bottom + 10) {
                    newTop = logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP;
                }
            }

            if (comic && !savedPos.belowComic && !savedPos.belowControls) {
                const comicRect = comic.getBoundingClientRect();
                if (newTop + toolbarHeight > comicRect.top - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE && newTop < comicRect.bottom) {
                    newTop = Math.max(logo ? logo.getBoundingClientRect().bottom + TOOLBAR_MIN_VERTICAL_GAP : 0, comicRect.top - toolbarHeight - TOOLBAR_EFFECTIVE_COMIC_CLEARANCE);
                }
            }

            const currentTop = parseFloat(toolbar.style.top) || 0;
            const currentLeft = parseFloat(toolbar.style.left) || 0;

            if (Math.abs(currentTop - newTop) > 1 || Math.abs(currentLeft - newLeft) > 1) {
                toolbar.style.top = newTop + 'px';
                toolbar.style.left = newLeft + 'px';
                toolbar.style.transform = 'none';

                const overrides = {};
                if (savedPos.belowControls) {
                    overrides.belowControls = true;
                    overrides.offsetFromControls = Math.max(savedPos.offsetFromControls || 0, TOOLBAR_MIN_VERTICAL_GAP);
                }
                if (savedPos.belowComic) {
                    overrides.belowComic = true;
                    overrides.offsetFromComic = Math.max(savedPos.offsetFromComic || 0, TOOLBAR_MIN_VERTICAL_GAP);
                }
                if (savedPos.belowSettings) {
                    overrides.belowSettings = true;
                    overrides.offsetFromSettings = Math.max(savedPos.offsetFromSettings || 0, TOOLBAR_MIN_VERTICAL_GAP);
                }
                storeToolbarPosition(newTop, newLeft, toolbar, overrides);
            }

            moveToolbarBetweenLogoAndComic(toolbar);
        });
    });
}

export function initializeToolbar() {
    const mainToolbar = document.getElementById('mainToolbar');
    if (!mainToolbar) return;

    const savedPosRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS);
    const savedPos = safeJSONParse(savedPosRaw, null);

    if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
        mainToolbar.style.top = savedPos.top + 'px';
        mainToolbar.style.left = savedPos.left + 'px';
        mainToolbar.style.transform = 'none';

        const enforceSafeStartupPosition = () => {
            moveToolbarBetweenLogoAndComic(mainToolbar);
        };

        enforceSafeStartupPosition();
        whenLayoutSettled().then(enforceSafeStartupPosition);
    } else {
        const logo = document.querySelector('.logo');
        if (logo) {
            const logoRect = logo.getBoundingClientRect();
            mainToolbar.style.top = (logoRect.bottom + TOOLBAR_MIN_VERTICAL_GAP) + 'px';
            mainToolbar.style.left = '50%';
            mainToolbar.style.transform = 'translateX(-50%)';
        }

        const position = (savePosition) => {
            mainToolbar.style.transform = 'none';
            positionToolbarCentered(mainToolbar, savePosition);
        };

        position(false);
        whenLayoutSettled().then(() => {
            position(true);
            try {
                localStorage.setItem(STORAGE_KEYS.TOOLBAR_OPTIMAL, 'true');
            } catch (_) {}
        });
    }

    makeDraggable(mainToolbar, mainToolbar, STORAGE_KEYS.TOOLBAR_POS, {
        isToolbar: true,
        onDrop: ({ element, left, top }) => {
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const centerLeft = (viewportWidth - (element.offsetWidth || 0)) / 2;
            storeToolbarPosition(top, left, element, { leftOffsetFromCenter: left - centerLeft });
            moveToolbarBetweenLogoAndComic(element);
        }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            clampToolbarInView();
        }, 100);
    });

    if (typeof ResizeObserver !== 'undefined') {
        const toolbarResizeObserver = new ResizeObserver(() => {
            const currentSavedRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS);
            const hasSavedPosition = !!(currentSavedRaw && currentSavedRaw !== 'null');
            const isOptimalMode = localStorage.getItem(STORAGE_KEYS.TOOLBAR_OPTIMAL) === 'true';

            if (hasSavedPosition && !isOptimalMode) {
                return;
            }

            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                clampToolbarInView();
            }, 50);
        });
        toolbarResizeObserver.observe(mainToolbar);

        const comicContainer = document.getElementById('comic-container');
        if (comicContainer) {
            let comicResizeTimeout;
            const comicResizeObserver = new ResizeObserver(() => {
                if (isToolbarPersistenceSuspended || isRotatedMode) return;
                clearTimeout(comicResizeTimeout);
                comicResizeTimeout = setTimeout(() => {
                    moveToolbarBetweenLogoAndComic(mainToolbar);
                }, 80);
            });
            comicResizeObserver.observe(comicContainer);
        }
    }
}
