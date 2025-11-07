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
        navigator.serviceWorker.register('./serviceworker.js', {
            scope: './'
        })
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
        background: linear-gradient(45deg, #eee239 0%, #F09819 51%, #eee239 100%);
        background-size: 200% auto;
        color: black;
        padding: 15px;
        text-align: center;
        z-index: 9999;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    `;
    
    const updateButton = document.createElement('button');
    updateButton.textContent = 'Refresh Now';
    updateButton.style.cssText = `
        background: white;
        color: #F09819;
        border: none;
        padding: 10px 20px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        transition: all 0.3s;
        margin-top: 10px;
    `;
    updateButton.onmouseover = function() {
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    };
    updateButton.onmouseout = function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    };
    updateButton.onclick = function() {
        location.reload();
    };
    
    const message = document.createElement('p');
    message.textContent = 'A new version is available!';
    message.style.cssText = 'margin: 0 0 10px 0; font-weight: 600;';
    
    updateBanner.appendChild(message);
    updateBanner.appendChild(updateButton);
    
    const body = document.body;
    if (body) {
        body.insertBefore(updateBanner, body.firstChild);
    }
}
