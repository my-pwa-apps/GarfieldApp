import { CONFIG } from './config.js';
import { restoreToolbarStateAfterRotate, snapshotToolbarStateBeforeRotate } from './toolbarLayout.js';

// Comic gestures: tap/double-tap, swipe navigation (remapped while rotated), and
// the rotated/landscape fullscreen view. Navigation and favorites are supplied
// by the app so this module owns only gesture and rotation state.
const deps = {
    UTILS: null,
    isShuffleEnabled: () => false,
    next() {}, previous() {}, random() {}, randomNewer() {}, randomOlder() {},
    favorite() {},
    isVerticalActive: () => false,
    isVerticalFullscreen: () => false
};

/** @param {Partial<typeof deps>} dependencies */
export function configureGestures(dependencies) {
    Object.assign(deps, dependencies);
}

export function isRotated() {
    return isRotatedMode;
}

// ========================================
// TOUCH & SWIPE TRACKING VARIABLES
// ========================================

// Touch tracking variables for swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let touchStartTime = 0;
let lastSwipeTime = 0;
let lastComicTapTime = 0;
let lastComicTapX = 0;
let lastComicTapY = 0;
let pendingComicSingleTapTimer = null;
let suppressComicClickUntil = 0;

// Rotation state tracking
let isRotatedMode = false;

const COMIC_DOUBLE_TAP_DELAY = 300;
const COMIC_TAP_MAX_MOVEMENT = 24;


function clearPendingComicSingleTap() {
    if (pendingComicSingleTapTimer) {
        clearTimeout(pendingComicSingleTapTimer);
        pendingComicSingleTapTimer = null;
    }
}

function resetComicTapTracking() {
    clearPendingComicSingleTap();
    lastComicTapTime = 0;
    lastComicTapX = 0;
    lastComicTapY = 0;
}

function queueComicSingleTap(singleTapAction) {
    clearPendingComicSingleTap();
    if (typeof singleTapAction !== 'function') {
        return;
    }

    pendingComicSingleTapTimer = window.setTimeout(() => {
        pendingComicSingleTapTimer = null;
        lastComicTapTime = 0;
        singleTapAction();
    }, COMIC_DOUBLE_TAP_DELAY);
}

export function bindComicTapGestures(target, singleTapAction = null) {
    if (!target || target.dataset.doubleTapInitialized === 'true') return;

    target.dataset.doubleTapInitialized = 'true';

    target.addEventListener('touchend', (e) => {
        if (deps.isVerticalFullscreen()) return;
        if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS) {
            resetComicTapTracking();
            return;
        }

        const touch = e.changedTouches?.[0];
        if (!touch) return;

        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        const deltaTime = Date.now() - touchStartTime;

        if (deltaX > COMIC_TAP_MAX_MOVEMENT || deltaY > COMIC_TAP_MAX_MOVEMENT || deltaTime > CONFIG.SWIPE_MAX_TIME) {
            resetComicTapTracking();
            return;
        }

        const now = Date.now();
        const isDoubleTap = lastComicTapTime > 0 &&
            now - lastComicTapTime <= COMIC_DOUBLE_TAP_DELAY &&
            Math.abs(touch.clientX - lastComicTapX) <= COMIC_TAP_MAX_MOVEMENT &&
            Math.abs(touch.clientY - lastComicTapY) <= COMIC_TAP_MAX_MOVEMENT;

        if (isDoubleTap) {
            e.preventDefault();
            suppressComicClickUntil = now + 400;
            resetComicTapTracking();
            deps.favorite();
            return;
        }

        lastComicTapTime = now;
        lastComicTapX = touch.clientX;
        lastComicTapY = touch.clientY;
        queueComicSingleTap(singleTapAction);
    }, { passive: false });

    target.addEventListener('dblclick', (e) => {
        if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS) return;
        e.preventDefault();
        suppressComicClickUntil = Date.now() + 400;
        resetComicTapTracking();
        deps.favorite();
    });
}

function initializeComicTapGestures(singleTapAction = null) {
    bindComicTapGestures(document.getElementById('comic'), singleTapAction);
}


/** Element that had focus before the settings dialog was opened. */
// ========================================
// TOUCH & SWIPE HANDLING
// ========================================

/**
 * Handles touch start event
 * Records initial touch position and time for swipe/tap detection
 * @param {TouchEvent} e - Touch event
 */
export function handleTouchStart(e) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    // Tap detection always tracks; the swipe preference is honoured in
    // handleTouchMove/handleTouchEnd, which decide whether to navigate.
}

/**
 * Handles touch move event
 * Prevents default scrolling during horizontal swipes
 * @param {TouchEvent} e - Touch event
 */
export function handleTouchMove(e) {
    // Always allow swipes in rotated mode
    const rotatedComic = document.getElementById('rotated-comic');
    if (!rotatedComic && !document.getElementById('swipe')?.checked) return;

    // Prevent default scrolling behavior during swipe
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);

    // If a handled swipe is underway, prevent native scrolling from fighting it.
    if (((deltaX > deltaY && deltaX > 20) || (deltaY > deltaX && touch.clientY < touchStartY && deltaY > 20)) && e.cancelable) {
        e.preventDefault();
    }
}

/**
 * Handles touch end event
 * Detects taps (for rotation) and swipes (for navigation)
 * In rotated mode, swipe directions are mapped differently to match visual orientation
 * @param {TouchEvent} e - Touch event
 */
export function handleTouchEnd(e) {
    // Disable swiping when viewing maximized vertical comic
    if (deps.isVerticalFullscreen()) {
        return;
    }

    const touch = e.changedTouches[0];
    touchEndX = touch.clientX;
    touchEndY = touch.clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const deltaTime = Date.now() - touchStartTime;

    // Check swipe distance
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // For swipe navigation - always enabled in rotated mode
    const rotatedComic = document.getElementById('rotated-comic');
    if (!rotatedComic && !document.getElementById('swipe')?.checked) return;

    // Check if the swipe is valid (meets distance and time requirements)
    if (deltaTime > CONFIG.SWIPE_MAX_TIME) return;

    // Check if we're in rotated fullscreen mode (reuse rotatedComic from above)
    const isInRotatedMode = rotatedComic && rotatedComic.className.includes('rotate');
    const isInLandscapeMode = rotatedComic && rotatedComic.className.includes('fullscreen-landscape');

    // Shuffle mode routes either direction to a random comic from the active pool.
    const randomSwipe = deps.isShuffleEnabled();
    const goNext = randomSwipe ? deps.randomNewer : deps.next;
    const goPrev = randomSwipe ? deps.randomOlder : deps.previous;
    const canSwipeNavigate = (direction) => randomSwipe
        ? deps.UTILS.canShuffleNavigate(direction)
        : deps.UTILS.canNavigate(direction);
    const canSwipeRandom = () => !document.getElementById('Random')?.disabled;
    const triggerRandomSwipe = () => {
        lastSwipeTime = Date.now();
        deps.random();
    };

    // Determine swipe direction based on mode
    if (isInRotatedMode) {
        // Rotated mode (90° clockwise): Only support logical left/right navigation
        if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
            const direction = deltaY < 0 ? 'next' : 'previous';
            // Only trigger swipe if navigation is possible in that direction
            if (canSwipeNavigate(direction)) {
                lastSwipeTime = Date.now();
                if (deltaY < 0) {
                    goNext();
                } else {
                    goPrev();
                }
            }
        }
    } else if (isInLandscapeMode) {
        // Landscape fullscreen (no rotation): Normal horizontal/vertical mapping
        if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            const direction = deltaX < 0 ? 'next' : 'previous';
            // Only trigger swipe if navigation is possible in that direction
            if (canSwipeNavigate(direction)) {
                // Horizontal swipe
                lastSwipeTime = Date.now();
                if (deltaX < 0) {
                    // Swipe Left -> Next
                    goNext();
                } else {
                    // Swipe Right -> Previous
                    goPrev();
                }
            }
        } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE && deltaY < 0 && canSwipeRandom()) {
            triggerRandomSwipe();
        }
    } else {
        // Normal portrait mode: Horizontal only for Next/Prev
        if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            const direction = deltaX > 0 ? 'previous' : 'next';
            // Only trigger swipe if navigation is possible in that direction
            if (canSwipeNavigate(direction)) {
                // Horizontal swipe
                lastSwipeTime = Date.now(); // Mark swipe occurred to prevent click
                if (deltaX > 0) {
                    // Swipe right -> Previous
                    goPrev();
                } else {
                    // Swipe left -> Next
                    goNext();
                }
            }
        } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE && deltaY < 0 && canSwipeRandom()) {
            triggerRandomSwipe();
        }
    }
}

// ========================================
// COMIC ROTATION & FULLSCREEN
// ========================================

/**
 * Toggles comic rotation to fullscreen mode (DirkJan pattern)
 * Shows only the comic rotated 90 degrees, no toolbar
 * @param {boolean} applyRotation - Whether to apply 90-degree rotation (default: true)
 * @param {boolean} clickToExit - Whether clicking exits fullscreen (default: true, false for PWA physical rotation)
 */
/**
 * Escape handler for the rotated/fullscreen view.
 *
 * Held at module scope so every exit path can remove it. Previously the
 * listener was only removed inside its own Escape branch, so exiting by click,
 * overlay tap, or device rotation leaked one listener per cycle.
 * @type {((event: KeyboardEvent) => void)|null}
 */
let _rotatedEscapeHandler = null;

/**
 * Tear down the rotated/fullscreen comic view and restore the normal layout.
 *
 * Single teardown path for every exit route (Escape, comic click, overlay
 * click, device rotation, toggling the toolbar button).
 * @param {{respectGestureDebounce?: boolean}} [options]
 */
function exitRotatedView({ respectGestureDebounce = false } = {}) {
    if (respectGestureDebounce) {
        // Ignore clicks immediately after a swipe or a suppressed tap.
        if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS) return;
        if (Date.now() < suppressComicClickUntil) return;
    }

    document.getElementById('comic-overlay')?.remove();
    document.getElementById('rotated-comic')?.remove();

    document.querySelectorAll('[data-was-hidden]').forEach(el => {
        // Remove the inline display style completely - let CSS classes take over
        el.style.removeProperty('display');
        // If there was an original inline display value, restore it
        if (el.dataset.originalDisplayInline) {
            el.style.display = el.dataset.originalDisplayInline;
        }
        delete el.dataset.wasHidden;
        delete el.dataset.originalDisplay;
        delete el.dataset.originalDisplayInline;
    });

    const comic = document.getElementById('comic');
    if (comic) comic.className = 'normal';

    document.body.style.overflow = '';
    window.removeEventListener('resize', handleRotatedViewResize);

    if (_rotatedEscapeHandler) {
        document.removeEventListener('keydown', _rotatedEscapeHandler);
        _rotatedEscapeHandler = null;
    }

    isRotatedMode = false;
    restoreToolbarStateAfterRotate();
}

export function Rotate(applyRotation = true, clickToExit = true) {
    const element = document.getElementById('comic');
    if (!element) return;

    // Already in fullscreen mode: exit it immediately.
    if (document.getElementById('comic-overlay')) {
        exitRotatedView();
        return;
    }

    if (element.className === "normal" || element.className.includes("normal")) {
        snapshotToolbarStateBeforeRotate();
        isRotatedMode = true;

        // Create an overlay without any layout constraints
        const overlay = document.createElement('div');
        overlay.id = 'comic-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
        overlay.style.zIndex = '10000';

        // Clone the comic image
        const clonedComic = element.cloneNode(true);
        clonedComic.id = 'rotated-comic';
        clonedComic.className = applyRotation ? "rotate" : "fullscreen-landscape";
        delete clonedComic.dataset.doubleTapInitialized;

        // Immediately add to body (not to overlay)
        document.body.appendChild(overlay);
        document.body.appendChild(clonedComic);

        // Prevent background scrolling while overlay is active
        document.body.style.overflow = 'hidden';

        // Apply sizing when image is loaded
        scheduleRotatedComicResize(clonedComic);

        // Hide all other elements
        const elementsToHide = document.querySelectorAll('body > *:not(#comic-overlay):not(#rotated-comic)');
        elementsToHide.forEach(el => {
            el.dataset.originalDisplay = window.getComputedStyle(el).display;
            el.dataset.originalDisplayInline = el.style.display || ''; // Store inline style separately
            el.dataset.wasHidden = "true";
            el.style.setProperty('display', 'none', 'important');
        });

        // Handler function to exit fullscreen
        const exitFullscreen = () => exitRotatedView({ respectGestureDebounce: true });

        // Escape key to exit fullscreen
        _rotatedEscapeHandler = function(e) {
            if (e.key === 'Escape') exitRotatedView();
        };
        document.addEventListener('keydown', _rotatedEscapeHandler);

        // Add click handlers only if clickToExit is enabled (not for PWA physical rotation)
        if (clickToExit) {
            clonedComic.addEventListener('click', exitFullscreen);
            overlay.addEventListener('click', exitFullscreen);
        }

        bindComicTapGestures(clonedComic, clickToExit ? exitFullscreen : null);

        // Add resize listener
        window.addEventListener('resize', handleRotatedViewResize);

        // Add swipe support in rotated view
        overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
        overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
        overlay.addEventListener('touchend', function(e) {
            handleTouchEnd(e);
            e.stopPropagation();
        }, { passive: true });

        clonedComic.addEventListener('touchstart', handleTouchStart, { passive: false });
        clonedComic.addEventListener('touchmove', handleTouchMove, { passive: false });
        clonedComic.addEventListener('touchend', function(e) {
            handleTouchEnd(e);
            e.stopPropagation();
        }, { passive: true });
    }
}

/**
 * Maximizes the rotated image to fit viewport
 * @param {HTMLImageElement} imgElement - Image element to resize
 */
function maximizeRotatedImage(imgElement) {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;

    if (!naturalWidth || !naturalHeight) {
        return;
    }

    const isLandscapeFullscreen = imgElement.className.includes('fullscreen-landscape');
    const shouldRotate = !isLandscapeFullscreen;

    // When rotated 90deg, visual width/height swap.
    const visualWidth = shouldRotate ? naturalHeight : naturalWidth;
    const visualHeight = shouldRotate ? naturalWidth : naturalHeight;

    // Calculate scale factor to fit within viewport (pick smaller of width/height fits)
    const scaleByWidth = viewportWidth / visualWidth;
    const scaleByHeight = viewportHeight / visualHeight;
    let scale = Math.min(scaleByWidth, scaleByHeight);

    // Scale to nearly fill the viewport (with some padding)
    scale = scale * 0.95;

    imgElement.style.width = `${naturalWidth * scale}px`;
    imgElement.style.height = `${naturalHeight * scale}px`;

    imgElement.style.position = 'fixed';
    imgElement.style.top = '50%';
    imgElement.style.left = '50%';
    imgElement.style.transformOrigin = 'center center';
    imgElement.style.transform = shouldRotate
        ? 'translate(-50%, -50%) rotate(90deg)'
        : 'translate(-50%, -50%)';
    imgElement.style.maxWidth = 'none';
    imgElement.style.maxHeight = 'none';
    imgElement.style.zIndex = '10001';
    imgElement.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
}

export function scheduleRotatedComicResize(imgElement) {
    if (!imgElement) {
        return;
    }

    const resize = () => {
        if (imgElement.isConnected && imgElement.complete && imgElement.naturalWidth > 0) {
            maximizeRotatedImage(imgElement);
        }
    };

    if (imgElement.complete && imgElement.naturalWidth > 0) {
        requestAnimationFrame(() => {
            requestAnimationFrame(resize);
        });
        return;
    }

    imgElement.addEventListener('load', () => {
        requestAnimationFrame(() => {
            requestAnimationFrame(resize);
        });
    }, { once: true });
}

/**
 * Handles resize and orientation changes in rotated view
 */
function handleRotatedViewResize() {
    const rotatedComic = document.getElementById('rotated-comic');
    if (rotatedComic) {
        scheduleRotatedComicResize(rotatedComic);
    }
}

/**
 * Keep the date-picker button's accessible name in sync with the selected date.
 *
 * `#DatePicker` is a visually hidden 1x1 input opened programmatically by
 * `#DatePickerBtn`, so screen-reader and tooltip users otherwise have no way to
 * know which comic date is currently selected. The date is formatted with the
 * user's own locale rather than the raw ISO value.
 */

export function initializeRotationGestures() {
// Rotation/fullscreen logic:
// - Mobile phone (not tablet) in PWA mode: use physical rotation (auto-rotation works in PWA)
// - Mobile phone in browser (not PWA): use click to rotate (auto-rotation may not work in browser)
// - Tablet/Desktop: no rotation needed (already landscape-capable)
const isMobilePhone = /iPhone|Android/.test(navigator.userAgent) && !/iPad|Tablet/.test(navigator.userAgent);
const isTablet = /iPad|Tablet|Android(?=.*\bTablet\b)/i.test(navigator.userAgent);
const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
              window.matchMedia('(display-mode: window-controls-overlay)').matches ||
              window.navigator.standalone === true;

let comicSingleTapAction = null;

if (isMobilePhone && !isTablet) {
    if (isPWA) {
        // Mobile PWA: use physical rotation for fullscreen
        function handleOrientationChange() {
            // Skip rotation handling for vertical comics - they have their own fullscreen system
            if (deps.isVerticalActive() || deps.isVerticalFullscreen()) {
                return;
            }

            const isLandscape = window.matchMedia("(orientation: landscape)").matches;
            const existingOverlay = document.getElementById('comic-overlay');

            if (isLandscape && !existingOverlay) {
                // Device rotated to landscape - enter fullscreen WITHOUT rotation, NO click-to-exit
                Rotate(false, false);
            } else if (isLandscape && existingOverlay) {
                scheduleRotatedComicResize(document.getElementById('rotated-comic'));
            } else if (!isLandscape && existingOverlay) {
                // Device rotated back to portrait - exit fullscreen
                Rotate(false, false);
            }
        }

        // Use screen.orientation API if available, fallback to matchMedia
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        } else {
            window.addEventListener('orientationchange', handleOrientationChange);
        }
        // Also listen to resize as a fallback for orientation detection
        window.matchMedia("(orientation: landscape)").addEventListener('change', handleOrientationChange);
    } else {
        // Mobile browser (not PWA): use single tap to rotate unless it becomes a double tap.
        comicSingleTapAction = () => {
            if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS || Date.now() < suppressComicClickUntil) return;
            Rotate(true);
        };
    }
}

initializeComicTapGestures(comicSingleTapAction);
}
