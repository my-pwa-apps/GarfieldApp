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
    // A single reload guard: `controllerchange` fires once the accepted worker
    // takes over, and only then is it safe to reload onto the new cache.
    let reloadingForUpdate = false;
    serviceWorkerContainer.addEventListener('controllerchange', () => {
        if (!reloadingForUpdate) return;
        reloadingForUpdate = false;
        location.reload();
    });

    window.addEventListener('load', () => {
        try {
            serviceWorkerContainer.register('./serviceworker.js', { scope: './' })
                .then(registration => {
                    const offerUpdate = worker => {
                        if (!worker || !serviceWorkerContainer.controller) return;
                        showUpdateNotification(() => {
                            reloadingForUpdate = true;
                            worker.postMessage({ type: 'SKIP_WAITING' });
                        });
                    };

                    // An update may already be parked from a previous visit.
                    offerUpdate(registration.waiting);

                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker?.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed') {
                                offerUpdate(newWorker);
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
 * @param {() => void} onAccept Invoked when the user opts into the update.
 */
function showUpdateNotification(onAccept) {
    if (document.getElementById('update-banner')) return;

    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.className = 'update-banner';

    const message = document.createElement('p');
    message.textContent = 'A new version is available.';

    const updateButton = document.createElement('button');
    updateButton.textContent = 'Refresh';
    updateButton.className = 'button update-banner-button';
    updateButton.addEventListener('click', () => {
        updateButton.disabled = true;
        if (typeof onAccept === 'function') {
            onAccept();
        } else {
            location.reload();
        }
    });

    updateBanner.append(message, updateButton);
    document.body?.insertBefore(updateBanner, document.body.firstChild);
}
