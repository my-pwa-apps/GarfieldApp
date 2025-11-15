/**
 * Language detection and app initialization
 * Runs before DOM loads to set initial language preference
 */
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        // Language is now handled in app.js for consistency
        
        // Initialize app
        if (typeof window.onLoad === 'function') {
            window.onLoad();
        }
    });
})();

/**
 * Fullscreen detection and state management
 */
document.addEventListener('DOMContentLoaded', function() {
    function checkFullscreen() {
        const isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
        
        document.body.classList.toggle('fullscreen-active', isFullscreen);
    }
    
    // Listen for fullscreen changes (cross-browser)
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(event => {
        document.addEventListener(event, checkFullscreen);
    });
    
    checkFullscreen();
});

/**
 * Service Worker Registration with update handling
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./serviceworker.js', { scope: './' })
            .then(registration => {
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker?.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(() => {
                // Silent fail - app still works without SW
            });
    });
}

/**
 * Show update notification banner
 */
function showUpdateNotification() {
    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0;
        background: linear-gradient(45deg, #eee239 0%, #F09819 51%, #eee239 100%);
        background-size: 200% auto; color: black; padding: 15px;
        text-align: center; z-index: 9999;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    `;
    
    const message = document.createElement('p');
    message.textContent = 'A new version is available!';
    message.style.cssText = 'margin: 0 0 10px 0; font-weight: 600;';
    
    const updateButton = document.createElement('button');
    updateButton.textContent = 'Refresh Now';
    updateButton.className = 'button';
    updateButton.style.cssText = 'margin: 10px auto 0; display: inline-block;';
    updateButton.onclick = () => location.reload();
    
    updateBanner.appendChild(message);
    updateBanner.appendChild(updateButton);
    
    document.body?.insertBefore(updateBanner, document.body.firstChild);
}
