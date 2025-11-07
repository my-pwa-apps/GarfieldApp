// Language Detection - Set HTML lang attribute based on user preference
// This must run synchronously before page render
(function() {
    const savedLang = localStorage.getItem('spanish');
    if (savedLang === 'true') {
        document.documentElement.lang = 'es';
    } else if (savedLang === null) {
        // Auto-detect on first visit
        const userLang = navigator.language || navigator.userLanguage;
        if (userLang.startsWith('es')) {
            document.documentElement.lang = 'es';
        }
    }
})();

// Wait for DOM to be ready before initializing features
document.addEventListener('DOMContentLoaded', function() {
    
    // Fullscreen detection
    function updateFullscreenClass() {
        const main = document.querySelector('main');
        if (!main) return;
        
        if (document.fullscreenElement || document.webkitFullscreenElement || 
            document.mozFullScreenElement || document.msFullscreenElement) {
            main.classList.add('fullscreen-mode');
        } else {
            main.classList.remove('fullscreen-mode');
        }
    }

    document.addEventListener('fullscreenchange', updateFullscreenClass);
    document.addEventListener('webkitfullscreenchange', updateFullscreenClass);
    document.addEventListener('mozfullscreenchange', updateFullscreenClass);
    document.addEventListener('MSFullscreenChange', updateFullscreenClass);
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('./serviceworker.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New service worker available, show update notification
                            showUpdateNotification(registration);
                        }
                    });
                });
            }, function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

function showUpdateNotification(registration) {
    const notification = document.getElementById('updateNotification');
    const updateBtn = document.getElementById('updateBtn');
    const dismissBtn = document.getElementById('dismissBtn');
    
    if (!notification || !updateBtn || !dismissBtn) return;
    
    notification.style.display = 'block';
    
    updateBtn.onclick = function() {
        // Tell the new service worker to skip waiting
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        notification.style.display = 'none';
        // Reload the page to activate the new service worker
        window.location.reload();
    };
    
    dismissBtn.onclick = function() {
        notification.style.display = 'none';
    };
}
