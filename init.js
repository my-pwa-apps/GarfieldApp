/**
 * Fullscreen detection and state management
 */
document.addEventListener('DOMContentLoaded', function() {
    function checkFullscreen() {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        document.body.classList.toggle('fullscreen-active', isFullscreen);
    }
    
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    checkFullscreen();
});

/**
 * Service Worker Registration with update handling
 */
function getServiceWorkerContainer() {
    try {
        return navigator.serviceWorker || null;
    } catch {
        return null;
    }
}

const serviceWorkerContainer = getServiceWorkerContainer();
if (serviceWorkerContainer) {
    window.addEventListener('load', () => {
        try {
            serviceWorkerContainer.register('./serviceworker.js', { scope: './' })
                .then(registration => {
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker?.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && serviceWorkerContainer.controller) {
                                showUpdateNotification();
                            }
                        });
                    });
                })
                .catch(() => {/* Silent fail - app still works without SW */});
        } catch {
            // Silent fail - app still works without SW
        }
    });
}

/**
 * Show update notification banner
 */
function showUpdateNotification() {
    if (document.getElementById('update-banner')) return;

    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.className = 'update-banner';
    
    const message = document.createElement('p');
    message.textContent = 'A new version is available.';
    
    const updateButton = document.createElement('button');
    updateButton.textContent = 'Refresh';
    updateButton.className = 'button update-banner-button';
    updateButton.onclick = () => location.reload();
    
    updateBanner.append(message, updateButton);
    document.body?.insertBefore(updateBanner, document.body.firstChild);
}
