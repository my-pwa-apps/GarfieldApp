// Language detection and initialization - must run before DOM loads
(function() {
    // Detect browser language
    const browserLang = navigator.language || navigator.userLanguage;
    const isSpanish = browserLang.startsWith('es');
    
    // Check if there's a saved language preference
    const savedLang = localStorage.getItem('preferredLanguage');
    
    // Set the checkbox state based on saved preference or browser language
    document.addEventListener('DOMContentLoaded', function() {
        const spanishCheckbox = document.getElementById('spanish');
        if (spanishCheckbox) {
            if (savedLang) {
                spanishCheckbox.checked = (savedLang === 'es');
            } else if (isSpanish) {
                spanishCheckbox.checked = true;
                localStorage.setItem('preferredLanguage', 'es');
            }
        }
        
        // Call onLoad if it exists
        if (typeof window.onLoad === 'function') {
            window.onLoad();
        }
    });
})();

// Fullscreen detection
document.addEventListener('DOMContentLoaded', function() {
    // Function to check if we're in fullscreen
    function checkFullscreen() {
        const isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
        
        const body = document.body;
        if (isFullscreen) {
            body.classList.add('fullscreen-active');
        } else {
            body.classList.remove('fullscreen-active');
        }
    }
    
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);
    
    // Initial check
    checkFullscreen();
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./serviceworker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New service worker available
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

function showUpdateNotification() {
    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #F09819;
        color: white;
        padding: 15px;
        text-align: center;
        z-index: 9999;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    updateBanner.innerHTML = `
        <p style="margin: 0 0 10px 0;">A new version is available!</p>
        <button onclick="location.reload()" style="background: white; color: #F09819; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
            Refresh Now
        </button>
    `;
    
    const body = document.body;
    if (body) {
        body.insertBefore(updateBanner, body.firstChild);
    }
}
