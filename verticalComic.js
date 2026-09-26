import { translations } from './translations.js';

// Tall (vertical) strips: shown as a thumbnail with a "view full size" notice,
// expanded to a fullscreen view on click and closed by click or Escape.
const deps = { isSpanishMode: () => false };
let verticalComicActive = false;
let verticalFullscreen = false;

/** @param {{ isSpanishMode: () => boolean }} dependencies */
export function configureVerticalComic(dependencies) {
    Object.assign(deps, dependencies);
}

export const isVerticalComicActive = () => verticalComicActive;
export const isVerticalFullscreen = () => verticalFullscreen;

// Function to check if the comic is vertical and show thumbnail if needed
export function checkImageOrientation() {
    const comic = document.getElementById('comic');
    const comicWrapper = document.getElementById('comic-wrapper');

    if (!comic || !comicWrapper) {
        return;
    }
    if (verticalFullscreen) {
        return;
    }
    verticalComicActive = false;
    document.body.classList.remove('vertical-thumbnail-mode');

    // Reset any previous thumbnail setup
    comic.classList.remove('vertical', 'fullscreen-vertical');
    comic.classList.add('normal');

    // Remove any existing thumbnail container
    const existingThumbnail = document.querySelector('.thumbnail-container');
    if (existingThumbnail) {
        existingThumbnail.parentNode.replaceChild(comic, existingThumbnail);
    }

    // Check if image is fully loaded and vertical (height > width)
    if (comic.complete && comic.naturalHeight > 0 && comic.naturalHeight > comic.naturalWidth * 1.5) {
        // It's a vertical comic, create thumbnail view
        comic.classList.remove('normal');
        comic.classList.add('vertical');
        verticalComicActive = true;
        document.body.classList.add('vertical-thumbnail-mode');

        // Create thumbnail container
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';

        // Create notice
        const notice = document.createElement('div');
        notice.className = 'thumbnail-notice';
        notice.textContent = (translations[deps.isSpanishMode() ? 'es' : 'en'] || translations.en).viewFullSize;

        // Set up the thumbnail display
        comicWrapper.replaceChild(thumbnailContainer, comic);
        thumbnailContainer.appendChild(comic);
        thumbnailContainer.appendChild(notice);

        // Add click handler to the thumbnail container
        thumbnailContainer.onclick = showFullsizeVertical;
    }
}

// Function to show fullsize vertical comic
function showFullsizeVertical(event) {
    // Prevent default behavior to ensure our handler works
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!verticalComicActive || verticalFullscreen) {
        return;
    }
    verticalFullscreen = true;

    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, .toolbar, .settings-icons-container');
    const controlsDiv = document.querySelector('#controls-container');

    // Switch to fullscreen view
    comic.classList.remove('vertical');
    comic.classList.add('fullscreen-vertical');
    container.classList.add('fullscreen');
    document.body.classList.add('rotated-state');

    // Clear container background so comic stands alone
    container.style.background = 'none';
    container.style.backgroundSize = '';

    // Hide install button if present
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'none';

    // Hide other UI elements
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

    // Add click handler to exit fullscreen
    comic.addEventListener('click', exitFullsizeVertical);
    container.addEventListener('click', exitFullsizeVertical);

    // Escape key to exit vertical fullscreen
    document.addEventListener('keydown', _verticalEscapeHandler);
}

function _verticalEscapeHandler(e) {
    if (e.key === 'Escape') {
        exitFullsizeVertical();
        document.removeEventListener('keydown', _verticalEscapeHandler);
    }
}

// Function to exit fullsize vertical comic view
function exitFullsizeVertical(event) {
    // Prevent default behavior
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    verticalFullscreen = false;

    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, .toolbar, .settings-icons-container');
    const controlsDiv = document.querySelector('#controls-container');

    // Reset container background
    container.style.background = '';
    container.style.backgroundSize = '';
    document.body.classList.remove('rotated-state');

    // Show install button again if present
    const installBtnRestore = document.getElementById('installBtn');
    if (installBtnRestore) installBtnRestore.style.display = '';

    // Switch back to thumbnail view
    comic.classList.remove('fullscreen-vertical');
    comic.classList.add('vertical');
    container.classList.remove('fullscreen');
    comic.style.zIndex = '';

    // Show UI elements again
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

    // Remove this click handler
    comic.removeEventListener('click', exitFullsizeVertical);
    container.removeEventListener('click', exitFullsizeVertical);
    document.removeEventListener('keydown', _verticalEscapeHandler);

    // Rebuild thumbnail view after exiting
    requestAnimationFrame(() => checkImageOrientation());
}
