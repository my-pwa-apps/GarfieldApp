import { translations } from './translations.js';
import {
    snapshotToolbarStateBeforeRotate,
    restoreToolbarStateAfterRotate,
    setToolbarRotatedState
} from './toolbarLayout.js';

let isRotatedMode = false;
let isVerticalComicActive = false;
let isVerticalFullscreen = false;
let _rotatedEscapeHandler = null;

let _deps = {
    canExitAfterGesture: () => true,
    bindComicTapGestures: () => {},
    handleTouchStart: () => {},
    handleTouchMove: () => {},
    handleTouchEnd: () => {},
    isSpanishMode: () => false,
    isMobileOrTouch: () => false
};

export function configureRotation(deps = {}) {
    _deps = { ..._deps, ...deps };
}

export function isRotatedViewActive() {
    return isRotatedMode;
}

export function isVerticalComicModeActive() {
    return isVerticalComicActive;
}

export function isVerticalFullscreenActive() {
    return isVerticalFullscreen;
}

export function initializeMobileButtonStates() {
    if (!_deps.isMobileOrTouch()) return;

    const toolbarButtons = document.querySelectorAll('.toolbar-button, .toolbar-datepicker-btn, .icon-button');

    toolbarButtons.forEach(button => {
        let touchTimeout = null;

        button.addEventListener('touchstart', () => {
            if (touchTimeout) clearTimeout(touchTimeout);
            button.classList.add('touch-active');
        }, { passive: true });

        button.addEventListener('touchend', () => {
            button.blur();
            button.classList.remove('touch-active');

            touchTimeout = setTimeout(() => {
                button.style.transform = '';
                button.style.transition = '';
                void button.offsetHeight;
            }, 50);
        }, { passive: true });

        button.addEventListener('touchcancel', () => {
            if (touchTimeout) clearTimeout(touchTimeout);
            button.classList.remove('touch-active');
            button.style.transform = '';
            button.style.transition = '';
            button.blur();
        }, { passive: true });

        button.addEventListener('click', () => {
            button.blur();
            button.classList.remove('touch-active');
            button.style.transform = '';
        });
    });

    document.addEventListener('touchend', () => {
        toolbarButtons.forEach(button => {
            button.classList.remove('touch-active');
            button.style.transform = '';
            button.blur();
        });
    }, { passive: true });
}

export function exitRotatedView({ respectGestureDebounce = false } = {}) {
    if (respectGestureDebounce && !_deps.canExitAfterGesture()) {
        return;
    }

    document.getElementById('comic-overlay')?.remove();
    document.getElementById('rotated-comic')?.remove();

    document.querySelectorAll('[data-was-hidden]').forEach(el => {
        el.style.removeProperty('display');
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
    setToolbarRotatedState(false);
    restoreToolbarStateAfterRotate();
}

export function Rotate(applyRotation = true, clickToExit = true) {
    const element = document.getElementById('comic');
    if (!element) return;

    if (document.getElementById('comic-overlay')) {
        exitRotatedView();
        return;
    }

    if (element.className === 'normal' || element.className.includes('normal')) {
        snapshotToolbarStateBeforeRotate();
        isRotatedMode = true;
        setToolbarRotatedState(true);

        const overlay = document.createElement('div');
        overlay.id = 'comic-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
        overlay.style.zIndex = '10000';

        const clonedComic = element.cloneNode(true);
        clonedComic.id = 'rotated-comic';
        clonedComic.className = applyRotation ? 'rotate' : 'fullscreen-landscape';
        delete clonedComic.dataset.doubleTapInitialized;

        document.body.appendChild(overlay);
        document.body.appendChild(clonedComic);
        document.body.style.overflow = 'hidden';

        scheduleRotatedComicResize(clonedComic);

        const elementsToHide = document.querySelectorAll('body > *:not(#comic-overlay):not(#rotated-comic)');
        elementsToHide.forEach(el => {
            el.dataset.originalDisplay = window.getComputedStyle(el).display;
            el.dataset.originalDisplayInline = el.style.display || '';
            el.dataset.wasHidden = 'true';
            el.style.setProperty('display', 'none', 'important');
        });

        const exitFullscreen = () => exitRotatedView({ respectGestureDebounce: true });

        _rotatedEscapeHandler = function (e) {
            if (e.key === 'Escape') exitRotatedView();
        };
        document.addEventListener('keydown', _rotatedEscapeHandler);

        if (clickToExit) {
            clonedComic.addEventListener('click', exitFullscreen);
            overlay.addEventListener('click', exitFullscreen);
        }

        _deps.bindComicTapGestures(clonedComic, clickToExit ? exitFullscreen : null);
        window.addEventListener('resize', handleRotatedViewResize);

        overlay.addEventListener('touchstart', _deps.handleTouchStart, { passive: false });
        overlay.addEventListener('touchmove', _deps.handleTouchMove, { passive: false });
        overlay.addEventListener('touchend', function (e) {
            _deps.handleTouchEnd(e);
            e.stopPropagation();
        }, { passive: true });

        clonedComic.addEventListener('touchstart', _deps.handleTouchStart, { passive: false });
        clonedComic.addEventListener('touchmove', _deps.handleTouchMove, { passive: false });
        clonedComic.addEventListener('touchend', function (e) {
            _deps.handleTouchEnd(e);
            e.stopPropagation();
        }, { passive: true });
    }
}

export function maximizeRotatedImage(imgElement) {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;

    if (!naturalWidth || !naturalHeight) {
        return;
    }

    const isLandscapeFullscreen = imgElement.className.includes('fullscreen-landscape');
    const shouldRotate = !isLandscapeFullscreen;

    const visualWidth = shouldRotate ? naturalHeight : naturalWidth;
    const visualHeight = shouldRotate ? naturalWidth : naturalHeight;

    const scaleByWidth = viewportWidth / visualWidth;
    const scaleByHeight = viewportHeight / visualHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight) * 0.95;

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

export function handleRotatedViewResize() {
    const rotatedComic = document.getElementById('rotated-comic');
    if (rotatedComic) {
        scheduleRotatedComicResize(rotatedComic);
    }
}

export function checkImageOrientation() {
    const comic = document.getElementById('comic');
    const comicWrapper = document.getElementById('comic-wrapper');

    if (!comic || !comicWrapper) {
        return;
    }
    if (isVerticalFullscreen) {
        return;
    }
    isVerticalComicActive = false;
    document.body.classList.remove('vertical-thumbnail-mode');

    comic.classList.remove('vertical', 'fullscreen-vertical');
    comic.classList.add('normal');

    const existingThumbnail = document.querySelector('.thumbnail-container');
    if (existingThumbnail) {
        existingThumbnail.parentNode.replaceChild(comic, existingThumbnail);
    }

    if (comic.complete && comic.naturalHeight > 0 && comic.naturalHeight > comic.naturalWidth * 1.5) {
        comic.classList.remove('normal');
        comic.classList.add('vertical');
        isVerticalComicActive = true;
        document.body.classList.add('vertical-thumbnail-mode');

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';

        const notice = document.createElement('div');
        notice.className = 'thumbnail-notice';
        notice.textContent = (translations[_deps.isSpanishMode() ? 'es' : 'en'] || translations.en).viewFullSize;

        comicWrapper.replaceChild(thumbnailContainer, comic);
        thumbnailContainer.appendChild(comic);
        thumbnailContainer.appendChild(notice);

        thumbnailContainer.onclick = showFullsizeVertical;
    }
}

export function showFullsizeVertical(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!isVerticalComicActive || isVerticalFullscreen) {
        return;
    }
    isVerticalFullscreen = true;

    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, .toolbar, .settings-icons-container');
    const controlsDiv = document.querySelector('#controls-container');

    comic.classList.remove('vertical');
    comic.classList.add('fullscreen-vertical');
    container.classList.add('fullscreen');
    document.body.classList.add('rotated-state');

    container.style.background = 'none';
    container.style.backgroundSize = '';

    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'none';

    elementsToHide.forEach(el => {
        el.classList.add('hidden-during-fullscreen');
    });

    if (controlsDiv) {
        controlsDiv.classList.add('hidden-during-fullscreen');
    }
    const thumbnailNotice = document.querySelector('.thumbnail-notice');
    if (thumbnailNotice) {
        thumbnailNotice.style.display = 'none';
    }

    comic.addEventListener('click', exitFullsizeVertical);
    container.addEventListener('click', exitFullsizeVertical);
    document.addEventListener('keydown', _verticalEscapeHandler);
}

function _verticalEscapeHandler(e) {
    if (e.key === 'Escape') {
        exitFullsizeVertical();
        document.removeEventListener('keydown', _verticalEscapeHandler);
    }
}

export function exitFullsizeVertical(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    isVerticalFullscreen = false;

    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, .toolbar, .settings-icons-container');
    const controlsDiv = document.querySelector('#controls-container');

    container.style.background = '';
    container.style.backgroundSize = '';
    document.body.classList.remove('rotated-state');

    const installBtnRestore = document.getElementById('installBtn');
    if (installBtnRestore) installBtnRestore.style.display = '';

    comic.classList.remove('fullscreen-vertical');
    comic.classList.add('vertical');
    container.classList.remove('fullscreen');
    comic.style.zIndex = '';

    elementsToHide.forEach(el => {
        el.classList.remove('hidden-during-fullscreen');
    });

    if (controlsDiv) {
        controlsDiv.classList.remove('hidden-during-fullscreen');
    }
    const thumbnailNotice = document.querySelector('.thumbnail-notice');
    if (thumbnailNotice) {
        thumbnailNotice.style.display = '';
    }

    comic.removeEventListener('click', exitFullsizeVertical);
    container.removeEventListener('click', exitFullsizeVertical);
    document.removeEventListener('keydown', _verticalEscapeHandler);

    requestAnimationFrame(() => checkImageOrientation());
}
