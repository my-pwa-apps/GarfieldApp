/**
 * Language detection and initialization
 * Runs before DOM loads to set initial language preference
 */
(function() {
    const browserLang = navigator.language || navigator.userLanguage;
    const isSpanish = browserLang.startsWith('es');
    const savedLang = localStorage.getItem('preferredLanguage');
    
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
                console.log('✓ Service Worker registered:', registration.scope);
                
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(error => {
                console.error('✗ Service Worker registration failed:', error);
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
    
    const message = document.createElement('p');
    message.textContent = 'A new version is available!';
    message.style.cssText = 'margin: 0 0 10px 0; font-weight: 600;';
    
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
    updateButton.onmouseover = () => {
        updateButton.style.transform = 'translateY(-2px)';
        updateButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    };
    updateButton.onmouseout = () => {
        updateButton.style.transform = 'translateY(0)';
        updateButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    };
    updateButton.onclick = () => location.reload();
    
    updateBanner.appendChild(message);
    updateBanner.appendChild(updateButton);
    
    document.body?.insertBefore(updateBanner, document.body.firstChild);
}
