import { getAuthenticatedComic } from './comicExtractor.js';

//garfieldapp.pages.dev

// ========================================
// CONFIGURATION & CONSTANTS
// ========================================

/**
 * Application Configuration
 * Central location for all magic numbers and configuration values
 */
const CONFIG = Object.freeze({
    // Timing
    UPDATE_CHECK_INTERVAL: 3600000,       // Check for updates every 1 hour (in ms)
    FADE_TRANSITION_TIME: 500,            // Image fade transition duration (in ms)
    NOTIFICATION_CHECK_TIME: '12:10',     // Time to check for new comics (EST)
    
    // Fetch timeouts
    FETCH_TIMEOUT: 15000,                 // 15 second timeout for fetch requests
    
    // Comic dates
    GARFIELD_START_EN: '1978-06-19',      // First English Garfield comic
    GARFIELD_START_ES: '1999-12-06',      // First Spanish Garfield comic
    
    // Cache limits
    MAX_IMAGE_CACHE_SIZE: 50,             // Maximum cached comic images
    
    // Storage keys
    STORAGE_KEYS: Object.freeze({
        FAVS: 'favs',
        LAST_COMIC: 'lastcomic',
        SWIPE: 'stat',
        SHOW_FAVS: 'showfavs',
        LAST_DATE: 'lastdate',
        SPANISH: 'spanish',
        SETTINGS: 'settings',
        NOTIFICATIONS: 'notifications'
    })
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Utility Functions
 */
const UTILS = {
    /**
     * Safely parses JSON with fallback
     * @param {string} str - JSON string to parse
     * @param {*} fallback - Fallback value if parse fails
     * @returns {*} Parsed value or fallback
     */
    safeJSONParse(str, fallback) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    },
    
    /**
     * Checks if device is mobile or touch-enabled
     * @returns {boolean} True if mobile/touch device
     */
    isMobileOrTouch() {
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        return isMobile || isTouch;
    }
};

// ========================================
// DRAGGABLE ELEMENT FUNCTIONALITY
// ========================================

/**
 * Generic draggable element maker
 * @param {HTMLElement} element - Element to make draggable
 * @param {HTMLElement} dragHandle - Element that triggers dragging (usually header)
 * @param {string} storageKey - localStorage key for saving position
 */
function makeDraggable(element, dragHandle, storageKey) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    function onDown(e) {
        // For mouse events, only drag with the left button
        if (e.type === 'mousedown' && e.button !== 0) return;
        
        // Prevent dragging when interacting with buttons or inputs
        if (e.target.closest('button, input')) return;
        
        // Check if target is the handle or within it
        if (!(e.target === dragHandle || dragHandle.contains(e.target))) return;
        
        isDragging = true;
        element.style.cursor = dragHandle === element ? 'grabbing' : '';
        
        const event = e.touches ? e.touches[0] : e;
        const elementStartX = parseFloat(element.style.left) || element.offsetLeft;
        const elementStartY = parseFloat(element.style.top) || element.offsetTop;
        
        // Calculate offset from touch/click point to element's top-left
        offsetX = event.clientX + window.scrollX - elementStartX;
        offsetY = event.clientY + window.scrollY - elementStartY;
        
        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);
        
        e.preventDefault();
    }
    
    function onMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        
        const event = e.touches ? e.touches[0] : e;
        
        // Calculate new position
        let newLeft = event.clientX - offsetX + window.scrollX;
        let newTop = event.clientY - offsetY + window.scrollY;
        
        // Get element dimensions for boundary checking
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        
        // Constrain within document bounds
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - height));
        
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
        element.style.transform = 'none';
    }
    
    function onUp() {
        if (!isDragging) return;
        
        isDragging = false;
        element.style.cursor = dragHandle === element ? 'grab' : '';
        
        // Save position
        const numericTop = parseFloat(element.style.top) || 0;
        const numericLeft = parseFloat(element.style.left) || 0;
        
        try {
            localStorage.setItem(storageKey, JSON.stringify({ top: numericTop, left: numericLeft }));
        } catch (_) {}
        
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
    }
    
    dragHandle.addEventListener('mousedown', onDown);
    dragHandle.addEventListener('touchstart', onDown, { passive: false });
}

/**
 * Positions toolbar centered below logo
 * @param {HTMLElement} toolbar - The toolbar element to position
 */
function positionToolbarCentered(toolbar) {
    if (!toolbar || toolbar.offsetHeight === 0) return;
    
    const logo = document.querySelector('.logo');
    const comic = document.getElementById('comic-container');
    
    if (!logo) return;
    
    const logoRect = logo.getBoundingClientRect();
    const comicRect = comic ? comic.getBoundingClientRect() : null;
    const toolbarWidth = toolbar.offsetWidth;
    const toolbarHeight = toolbar.offsetHeight;
    
    // Center horizontally with responsive padding
    const horizontalPadding = window.innerWidth < 768 ? 10 : 20;
    let left = Math.max(horizontalPadding, (window.innerWidth - toolbarWidth) / 2);
    left = Math.min(left, window.innerWidth - toolbarWidth - horizontalPadding);
    
    // Position between logo and comic
    let top;
    if (comicRect && comicRect.top > logoRect.bottom + toolbarHeight + 30) {
        // Center between logo and comic if there's enough space
        const availableSpace = comicRect.top - logoRect.bottom;
        top = logoRect.bottom + (availableSpace - toolbarHeight) / 2;
    } else {
        // Default: just below logo
        top = logoRect.bottom + 15;
    }
    
    // Ensure toolbar stays in viewport
    const maxTop = window.innerHeight - toolbarHeight - 10;
    top = Math.min(top, maxTop);
    
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    toolbar.style.transform = 'none';
}

/**
 * Initializes draggable settings panel
 */
function initializeDraggableSettings() {
    const panel = document.getElementById("settingsDIV");
    const header = document.getElementById("settingsHeader");
    
    if (!panel || !header) return;
    
    // Load and apply saved position
    const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS + '_pos');
    const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
    if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
        panel.style.animation = 'none';
        panel.style.top = savedPos.top + 'px';
        panel.style.left = savedPos.left + 'px';
        panel.style.transform = 'none';
        
        requestAnimationFrame(() => {
            panel.style.animation = '';
        });
    }
    
    // Make draggable
    makeDraggable(panel, header, CONFIG.STORAGE_KEYS.SETTINGS + '_pos');
}

/**
 * Clamp toolbar within viewport bounds on resize
 */
function clampToolbarInView() {
    const mainToolbar = document.getElementById('mainToolbar');
    if (!mainToolbar) return;
    
    // Check if user has saved a custom position
    const savedPosRaw = localStorage.getItem('toolbarPosition');
    const hasSavedPosition = savedPosRaw && savedPosRaw !== 'null';
    
    if (!hasSavedPosition) {
        // No saved position - recenter on resize
        positionToolbarCentered(mainToolbar);
        return;
    }
    
    // Has saved position - just clamp within bounds
    const rect = mainToolbar.getBoundingClientRect();
    let top = parseFloat(mainToolbar.style.top) || 0;
    let left = parseFloat(mainToolbar.style.left) || 0;
    
    const maxLeft = window.innerWidth - rect.width - 10;
    const maxTop = window.innerHeight - rect.height - 10;
    
    let changed = false;
    
    if (left < 10) {
        left = 10;
        changed = true;
    } else if (left > maxLeft) {
        left = maxLeft;
        changed = true;
    }
    
    if (top < 10) {
        top = 10;
        changed = true;
    } else if (top > maxTop) {
        top = maxTop;
        changed = true;
    }
    
    if (changed) {
        mainToolbar.style.left = left + 'px';
        mainToolbar.style.top = top + 'px';
        
        try {
            localStorage.setItem('toolbarPosition', JSON.stringify({ top, left }));
        } catch (_) {}
    }
}

/**
 * Initialize toolbar positioning and dragging
 */
function initializeToolbar() {
    const mainToolbar = document.getElementById('mainToolbar');
    if (!mainToolbar) return;
    
    // Check for saved position
    const savedPosRaw = localStorage.getItem('toolbarPosition');
    const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
    
    if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
        // Apply saved position immediately
        mainToolbar.style.top = savedPos.top + 'px';
        mainToolbar.style.left = savedPos.left + 'px';
        mainToolbar.style.transform = 'none';
    } else {
        // No saved position - calculate centered position
        positionToolbarCentered(mainToolbar);
    }
    
    // Make toolbar draggable
    makeDraggable(mainToolbar, mainToolbar, 'toolbarPosition');
    
    // Add resize listener to keep toolbar in bounds
    window.addEventListener('resize', clampToolbarInView);
}

// ========================================
// MOBILE BUTTON STATE MANAGEMENT
// ========================================

/**
 * Unified mobile button state management
 * Fixes "stuck" or "popped out" button states on touch devices
 */
function initializeMobileButtonStates() {
    // Only run on mobile/touch devices
    if (!UTILS.isMobileOrTouch()) return;
    
    const toolbarButtons = document.querySelectorAll('.toolbar-button, .toolbar-datepicker-btn, .icon-button');
    
    toolbarButtons.forEach(button => {
        let isPressed = false;
        
        // Touch start - mark as pressed
        button.addEventListener('touchstart', () => {
            isPressed = true;
            button.style.transition = 'all 0.1s ease';
        }, { passive: true });
        
        // Touch end - reset state with delay for visual feedback
        button.addEventListener('touchend', () => {
            if (isPressed) {
                setTimeout(() => {
                    button.style.transform = '';
                    button.style.transition = '';
                    button.blur();
                    isPressed = false;
                }, 150);
            }
        }, { passive: true });
        
        // Touch cancel - immediate reset
        button.addEventListener('touchcancel', () => {
            button.style.transform = '';
            button.style.transition = '';
            button.blur();
            isPressed = false;
        }, { passive: true });
        
        // Click handler - cleanup
        button.addEventListener('click', () => {
            setTimeout(() => {
                button.blur();
                button.style.transform = '';
            }, 150);
        });
        
        // Blur - cleanup transforms
        button.addEventListener('blur', () => {
            button.style.transform = '';
            if (isPressed) {
                button.style.transition = '';
                isPressed = false;
            }
        });
        
        // Mouse leave - reset if pressed (hybrid devices)
        button.addEventListener('mouseleave', () => {
            if (isPressed) {
                button.style.transform = '';
                button.style.transition = '';
                isPressed = false;
            }
        });
    });
    
    // Global safeguard - reset any stuck buttons on touch end
    document.addEventListener('touchend', () => {
        setTimeout(() => {
            toolbarButtons.forEach(button => {
                button.style.transform = '';
                button.blur();
            });
        }, 200);
    }, { passive: true });
}

/**
 * Loads Ko-fi widget without document.write()
 */
function loadKofiWidget() {
    const container = document.getElementById('support-container');
    if (!container) return;
    
    // Create widget container
    const widgetDiv = document.createElement('div');
    widgetDiv.id = 'kofi-widget-container';
    
    // Load Ko-fi widget script
    const script = document.createElement('script');
    script.src = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js';
    script.onload = () => {
        if (typeof kofiwidget2 !== 'undefined') {
            kofiwidget2.init('Support this app', '#F09819', 'X8X811H46M');
            // Insert widget HTML into container instead of using document.write()
            widgetDiv.innerHTML = kofiwidget2.getHTML();
            
            // Apply custom styling
            setTimeout(() => {
                const kofiBtn = widgetDiv.querySelector('.kofi-button');
                if (kofiBtn) {
                    kofiBtn.classList.add('kofi-button-styled');
                }
            }, 100);
        }
    };
    
    container.appendChild(widgetDiv);
    document.head.appendChild(script);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeToolbar();
        initializeDraggableSettings();
        initializeMobileButtonStates();
        loadKofiWidget();
    });
} else {
    initializeToolbar();
    initializeDraggableSettings();
    initializeMobileButtonStates();
    loadKofiWidget();
}

// Translation dictionaries
const translations = {
    en: {
        previous: 'Previous',
        random: 'Random',
        next: 'Next',
        first: 'First',
        today: 'Today',
        last: 'Last',
        swipeEnabled: 'Swipe enabled',
        showFavorites: 'Show only my favorites',
        rememberComic: 'Remember last comic on exit/refresh',
        spanish: 'Spanish / Español',
        loadingComic: 'Loading comic...',
        settings: 'Settings',
        favorites: 'Add to favorites',
        share: 'Share',
        selectDate: 'Select comic date',
        installApp: 'Install App',
        supportApp: 'Support this App',
        notifyNewComics: 'Notify me of new comics'
    },
    es: {
        previous: 'Anterior',
        random: 'Aleatorio',
        next: 'Siguiente',
        first: 'Primero',
        today: 'Hoy',
        last: 'Último',
        swipeEnabled: 'Deslizar habilitado',
        showFavorites: 'Mostrar solo mis favoritos',
        rememberComic: 'Recordar último cómic al salir/actualizar',
        spanish: 'Spanish / Español',
        loadingComic: 'Cargando cómic...',
        settings: 'Configuración',
        favorites: 'Agregar a favoritos',
        share: 'Compartir',
        selectDate: 'Seleccionar fecha del cómic',
        installApp: 'Instalar App',
        supportApp: 'Apoyar esta App',
        notifyNewComics: 'Notificar nuevos cómics'
    }
};

// Function to translate the interface
function translateInterface(lang) {
    const t = translations[lang] || translations.en;
    
    // NOTE: Buttons now use SVG icons only, no text labels
    // Previous button labels were removed to show icons instead
    
    // Translate labels
    const labels = {
        'swipe': t.swipeEnabled,
        'showfavs': t.showFavorites,
        'lastdate': t.rememberComic,
        'spanish': t.spanish,
        'notifications': t.notifyNewComics
    };
    
    for (const [id, text] of Object.entries(labels)) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) label.textContent = text;
    }
    
    // Translate date picker
    const datePicker = document.getElementById('DatePicker');
    if (datePicker) {
        datePicker.title = t.selectDate;
        datePicker.setAttribute('aria-label', t.selectDate);
    }
    
    // Translate install and support buttons
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.textContent = t.installApp;
        installBtn.setAttribute('aria-label', t.installApp);
    }
    
    // Update Ko-fi button text
    const kofiBtn = document.querySelector('.kofi-button');
    if (kofiBtn) {
        kofiBtn.textContent = t.supportApp;
    }
    
    // Translate comic alt text
    const comic = document.getElementById('comic');
    if (comic && comic.alt === 'Loading comic...') {
        comic.alt = t.loadingComic;
    }
}

// Global variables for app functionality
let translationEnabled = localStorage.getItem('translation') === 'true';
let userLanguage = navigator.language || navigator.userLanguage || 'en';
let translationInProgress = false;
let previousclicked = false;
let previousUrl = "";
let currentselectedDate;
let day, month, year;
let pictureUrl;
let formattedComicDate;
let formattedDate;
let isRotatedMode = false; // Track if we're in rotated mode

async function Share() 
{
    if(!window.pictureUrl) {
        console.warn("No comic URL found in window.pictureUrl, checking previousUrl");
        // Use previousUrl as fallback
        window.pictureUrl = previousUrl;
        
        // If still no URL, show error
        if(!window.pictureUrl) {
            console.error("No comic URL available to share");
            alert("No comic to share. Please try loading a comic first.");
            return;
        }
    }
    
    if(navigator.share) {
        try {
            console.log("Starting share process...");
            
            // Create a new image element with crossOrigin set to anonymous 
            // to avoid tainted canvas issues
            const tempImg = new Image();
            tempImg.crossOrigin = "anonymous";
            
            // Try direct image URL first, then fallback to proxy
            let imgUrl = window.pictureUrl;
            let loadError = null;
            
            console.log("Attempting to load image directly:", imgUrl);
            
            // Try loading the image directly first
            await new Promise((resolve, reject) => {
                const directTimeout = setTimeout(() => {
                    loadError = new Error("Direct image load timeout");
                    reject(loadError);
                }, 5000);
                
                tempImg.onload = () => {
                    clearTimeout(directTimeout);
                    console.log("✓ Direct image load successful");
                    resolve();
                };
                
                tempImg.onerror = (error) => {
                    clearTimeout(directTimeout);
                    loadError = new Error("Direct image load failed");
                    reject(loadError);
                };
                
                tempImg.src = imgUrl;
            }).catch(async (error) => {
                // Direct load failed, try with working proxy
                console.log("Direct load failed, trying with proxy...");
                const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(window.pictureUrl)}`;
                console.log("Loading image for sharing via proxy:", proxyUrl);
                
                return new Promise((resolve, reject) => {
                    const proxyTimeout = setTimeout(() => {
                        reject(new Error("Proxy image load timeout"));
                    }, 5000);
                    
                    tempImg.onload = () => {
                        clearTimeout(proxyTimeout);
                        console.log("✓ Proxy image load successful");
                        resolve();
                    };
                    
                    tempImg.onerror = () => {
                        clearTimeout(proxyTimeout);
                        reject(new Error("Failed to load image via proxy"));
                    };
                    
                    tempImg.src = proxyUrl;
                });
            });
            
            console.log("Image loaded successfully, converting to canvas...");
            
            // Create canvas and draw image
            const canvas = document.createElement('canvas');
            canvas.width = tempImg.width;
            canvas.height = tempImg.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tempImg, 0, 0);
            
            // Convert to blob
            const jpgBlob = await new Promise((resolve, reject) => {
                try {
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error("Failed to create blob from canvas"));
                    }, 'image/jpeg', 0.95);
                } catch (error) {
                    reject(error);
                }
            });
            
            console.log("Canvas converted to blob successfully");
            
            // Create file for sharing
            const file = new File([jpgBlob], "garfield.jpg", { 
                type: "image/jpeg", 
                lastModified: Date.now() 
            });
            
            // Share the file
            console.log("Attempting to share file...");
            await navigator.share({
                url: 'https://garfieldapp.pages.dev',
                text: 'Shared from GarfieldApp',
                files: [file]
            });
            
            console.log("Comic shared successfully!");
        } catch (error) {
            console.error("Error sharing comic:", error);
            
            // Check if this is a CORS-related error
            if (error.name === 'SecurityError') {
                // Try fallback sharing without the image
                try {
                    console.log("Trying fallback sharing without image...");
                    await navigator.share({
                        url: 'https://garfieldapp.pages.dev',
                        text: `Shared from GarfieldApp - Garfield comic for ${formattedComicDate}`
                    });
                    console.log("Fallback sharing successful!");
                    return;
                } catch (fallbackError) {
                    console.error("Fallback sharing failed:", fallbackError);
                }
            }
            
            // Don't show alert if sharing was canceled by user
            if (error.name !== 'AbortError') {
                alert("Failed to share the comic. Please try again.");
            }
        }
    } else {
        alert("Sharing is not supported on this device.");
    }
}

window.Share = Share;

function Addfav()
{
    formattedComicDate = year + "/" + month + "/" + day;
    var favs = JSON.parse(localStorage.getItem('favs'));
    if(favs == null)
    {
        favs = [];
    }
    if(favs.indexOf(formattedComicDate) == -1)
    {
        favs.push(formattedComicDate);
        const heartBtn = document.getElementById("favheart");
        const heartSvg = heartBtn?.querySelector('svg path');
        if (heartSvg) heartSvg.setAttribute('fill', 'currentColor');
        document.getElementById("showfavs").disabled = false;
    }
    else
    {
        favs.splice(favs.indexOf(formattedComicDate), 1);
        const heartBtn = document.getElementById("favheart");
        const heartSvg = heartBtn?.querySelector('svg path');
        if (heartSvg) heartSvg.setAttribute('fill', 'none');
        if(favs.length === 0)
        {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
            document.getElementById("Today").innerHTML = 'Today';
        }
    }
    favs.sort();
    localStorage.setItem('favs', JSON.stringify(favs));
    CompareDates();
    showComic();
}

window.Addfav = Addfav;

function changeComicImage(newSrc) {
    const comic = document.getElementById('comic');
    comic.classList.add('dissolve');
    setTimeout(() => {
        comic.src = newSrc;
        comic.classList.remove('dissolve');
    }, 500); // Match the duration of the CSS transition
}

function HideSettings() {
    const panel = document.getElementById("settingsDIV");
    
    if (!panel) return;
    
    // Toggle visibility using class
    if (panel.classList.contains('visible')) {
        panel.classList.remove('visible');
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, "false");
    } else {
        // Before showing, ensure saved position is applied
        const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS + '_pos');
        const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
        if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
            panel.style.top = savedPos.top + 'px';
            panel.style.left = savedPos.left + 'px';
            panel.style.transform = 'none';
        }
        
        panel.classList.add('visible');
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, "true");
    }
}

window.HideSettings = HideSettings;

function Rotate() {
    const comic = document.getElementById('comic');
    if (comic.classList.contains('rotate')) {
        comic.classList.remove('rotate');
        comic.classList.add('normal');
        document.body.classList.remove('rotated-state');
        isRotatedMode = false;
    } else {
        comic.classList.remove('normal');
        comic.classList.add('rotate');
        document.body.classList.add('rotated-state');
        isRotatedMode = true;
    }
}

window.Rotate = Rotate;

// Update the date display function to use regional date settings
function updateDateDisplay() {
    const dateInput = document.getElementById('DatePicker');
    const wrapper = document.querySelector('.date-center-wrapper');
    
    if (dateInput && wrapper) {
        // Parse the date value from the input
        const dateValue = dateInput.value; // Format: YYYY-MM-DD
        if (dateValue) {
            const dateParts = dateValue.split('-');
            if (dateParts.length === 3) {
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1; // JS months are 0-based
                const day = parseInt(dateParts[2]);
                
                // Create a date object
                const date = new Date(year, month, day);
                
                // Format the date according to user's locale
                const localizedDate = date.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric'
                });
                
                // Set the localized date as the display value
                wrapper.setAttribute('data-display-date', localizedDate);
            } else {
                // Fallback if date format is unexpected
                wrapper.setAttribute('data-display-date', dateValue);
            }
        } else {
            wrapper.setAttribute('data-display-date', '');
        }
    }
}

async function loadComic(date) {
    try {
        // Check if Spanish is enabled
        const useSpanish = document.getElementById("spanish")?.checked || false;
        const language = useSpanish ? 'es' : 'en';
        
        // Try GoComics with authentication and language
        const result = await getAuthenticatedComic(date, language);
        
        if (result.success && result.imageUrl) {
            const comicImg = document.getElementById('comic');
            comicImg.src = result.imageUrl;
            comicImg.style.display = 'block';
            
            // Store the image URL for sharing
            window.pictureUrl = result.imageUrl;
            previousUrl = result.imageUrl;
            
            // Hide any error messages
            const messageContainer = document.getElementById('comic-message');
            if (messageContainer) {
                messageContainer.style.display = 'none';
            }
            return true;
        }
        
        // Handle paywall
        if (result.isPaywalled) {
            showPaywallMessage();
            return false;
        }
        
        throw new Error('Comic not available from any source');
    } catch (error) {
        console.error('Failed to load comic:', error);
        showErrorMessage('Failed to load comic. Please try again.');
        return false;
    }
}

function showPaywallMessage() {
    const comicContainer = document.getElementById('comic-container');
    const comic = document.getElementById('comic');
    
    // Hide the comic image
    comic.style.display = 'none';
    
    // Create or update message container
    let messageContainer = document.getElementById('comic-message');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'comic-message';
        messageContainer.className = 'paywall-message';
        comicContainer.appendChild(messageContainer);
    }
    
    messageContainer.style.display = 'flex';
    
    // Calculate if this is an older comic
    const comicDate = currentselectedDate;
    const today = new Date();
    const daysDiff = Math.floor((today - comicDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 30) {
        // Older comics are paywalled
        messageContainer.innerHTML = `
            <p><strong>Unable to load this archive comic</strong></p>
            <p>This comic is from ${daysDiff} day${daysDiff !== 1 ? 's' : ''} ago. GoComics normally requires a paid subscription to access comics older than 30 days.</p>
            <p>Try viewing more recent comics (last 30 days), which are free!</p>
        `;
    } else {
        // Recent comics should be free - something else went wrong
        messageContainer.innerHTML = `
            <p><strong>Unable to load this comic</strong></p>
            <p>This recent comic should normally be free, but we're having trouble loading it.</p>
            <p>Please try again later or try a different date.</p>
        `;
    }
}

function showErrorMessage(message) {
    const comicContainer = document.getElementById('comic-container');
    const comic = document.getElementById('comic');
    
    comic.style.display = 'none';
    
    let messageContainer = document.getElementById('comic-message');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'comic-message';
        messageContainer.className = 'error-message';
        comicContainer.appendChild(messageContainer);
    }
    
    messageContainer.style.display = 'flex';
    
    // Check if we're on localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        messageContainer.innerHTML = `
            <p><strong>Local Testing Mode</strong></p>
            <p>The CORS proxies are currently not accessible from localhost. This is normal during local development.</p>
            <p><strong>Your authentication system is ready!</strong></p>
            <ul style="text-align: left; max-width: 500px;">
                <li>✓ Login/logout functionality implemented</li>
                <li>✓ Paywall detection in place</li>
                <li>✓ Age-based comic access logic (recent = free, archive = paywalled)</li>
                <li>✓ Multiple CORS proxy fallback system</li>
            </ul>
            <p>When deployed to <strong>garfieldapp.pages.dev</strong>, the app will work properly with your Cloudflare Worker proxy.</p>
            <p>Try committing and pushing your changes to test on the live site!</p>
        `;
    } else {
        messageContainer.innerHTML = `
            <p><strong>Unable to Load Comic</strong></p>
            <p>${message}</p>
            <p>Please try again later or select a different date.</p>
        `;
    }
}

window.onLoad = function() {
    var favs = JSON.parse(localStorage.getItem('favs')) || [];

    // Set minimum body height at load time to prevent gradient shift
    document.body.style.minHeight = "100vh";

    // Prevent clearing the date picker
    const datePicker = document.getElementById("DatePicker");
    datePicker.setAttribute("required", "required");
    
    // Add event listener to prevent emptying the date
    datePicker.addEventListener('change', function(e) {
        if (!this.value) {
            // If cleared, reset to current date
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            this.value = `${yyyy}-${mm}-${dd}`;
        }
    });

    // Handle URL parameters from shortcuts
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const view = urlParams.get('view');

    if (view === 'favorites' && favs.length > 0) {
        document.getElementById("showfavs").checked = true;
        localStorage.setItem('showfavs', "true");
        currentselectedDate = favs.length ? new Date(favs[0]) : new Date();
    } else if (action === 'random') {
        // Will trigger random after loading
        setTimeout(() => RandomClick(), 500);
        currentselectedDate = new Date();
    } else if (document.getElementById("showfavs").checked) {
        currentselectedDate = favs.length ? new Date(favs[0]) : new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
    } else {
        currentselectedDate = new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
    }
    
    formatDate(new Date());
    let today = `${year}-${month}-${day}`;
    document.getElementById("DatePicker").setAttribute("max", today);

    if (document.getElementById("lastdate").checked && localStorage.getItem('lastcomic') && !action && !view) {
        currentselectedDate = new Date(localStorage.getItem('lastcomic'));
    }
    CompareDates();
    showComic();
    updateDateDisplay(); // Add this line to update the display
}

// Call this function when the date changes
function DateChange() {
    currentselectedDate = document.getElementById('DatePicker');
    currentselectedDate = new Date(currentselectedDate.value);
    updateDateDisplay(); // Add this line to update the display
    CompareDates();
    showComic();
}

window.DateChange = DateChange;

// Add this to update the display when showing a comic
async function showComic(skipOnFailure = false, direction = null) {
    formatDate(currentselectedDate);
    formattedComicDate = year + "/" + month + "/" + day;
    formattedDate = year + "-" + month + "-" + day;
    
    document.getElementById("DatePicker").value = formattedDate;
    updateDateDisplay();
    
    // Check if date is in favorites
    var favs = JSON.parse(localStorage.getItem('favs'));
    const heartBtn = document.getElementById("favheart");
    const heartSvg = heartBtn?.querySelector('svg path');
    if(favs && favs.indexOf(formattedComicDate) !== -1) {
        if (heartSvg) heartSvg.setAttribute('fill', 'currentColor');
    } else {
        if (heartSvg) heartSvg.setAttribute('fill', 'none');
    }
    
    // Save last viewed comic
    if(document.getElementById("lastdate").checked) {
        localStorage.setItem('lastcomic', currentselectedDate);
    }
    
    // Load the comic
    const success = await loadComic(currentselectedDate);
    
    // If comic failed to load and we should skip, try the next one
    if (!success && skipOnFailure && direction) {
        console.log(`Comic not available, skipping ${direction}...`);
        
        // Prevent infinite loops by limiting attempts
        const maxAttempts = 10;
        let attempts = 0;
        
        while (!success && attempts < maxAttempts) {
            attempts++;
            
            if (direction === 'next') {
                currentselectedDate.setDate(currentselectedDate.getDate() + 1);
            } else if (direction === 'previous') {
                currentselectedDate.setDate(currentselectedDate.getDate() - 1);
            } else {
                break; // Unknown direction, stop trying
            }
            
            CompareDates();
            
            // Check if we've reached the boundaries
            if (document.getElementById("Next")?.disabled && direction === 'next') {
                console.log('Reached end of available comics');
                break;
            }
            if (document.getElementById("Previous")?.disabled && direction === 'previous') {
                console.log('Reached start of available comics');
                break;
            }
            
            // Try loading this comic
            formatDate(currentselectedDate);
            formattedComicDate = year + "/" + month + "/" + day;
            formattedDate = year + "-" + month + "-" + day;
            document.getElementById("DatePicker").value = formattedDate;
            updateDateDisplay();
            
            const retrySuccess = await loadComic(currentselectedDate);
            if (retrySuccess) {
                console.log(`Found available comic after ${attempts} attempt(s)`);
                return;
            }
        }
        
        if (attempts >= maxAttempts) {
            console.warn('Max skip attempts reached');
        }
    }
}

function PreviousClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) - 1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
	previousclicked = true;
	CompareDates();
	showComic(true, 'previous'); // Auto-skip unavailable comics going backwards
}

window.PreviousClick = PreviousClick;

function NextClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) < favs.length - 1){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) + 1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
	CompareDates();
	showComic(true, 'next'); // Auto-skip unavailable comics going forward
}

window.NextClick = NextClick;

function FirstClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	else{
		// Spanish comics start on December 6, 1999; English comics start on June 19, 1978
		const isSpanish = document.getElementById('spanish').checked;
		currentselectedDate = isSpanish ? new Date(Date.UTC(1999, 11, 6, 12)) : new Date(Date.UTC(1978, 5, 19, 12));
	}
	CompareDates();
	showComic();
}

window.FirstClick = FirstClick;

function CurrentClick() {
	if(document.getElementById("showfavs").checked)
	 {
		var favs = JSON.parse(localStorage.getItem('favs'));
		let favslength = favs.length - 1;
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[favslength]);
	 }
	else
	{
	currentselectedDate = new Date();
	}
	CompareDates();
	showComic();
}

window.CurrentClick = CurrentClick;


function RandomClick()
{
	if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]);}
	else{
		// Spanish comics start on December 6, 1999; English comics start on June 19, 1978
		const isSpanish = document.getElementById('spanish').checked;
		let start = isSpanish ? new Date("1999-12-06") : new Date("1978-06-19");
		let end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}
	CompareDates();
	showComic();
}

window.RandomClick = RandomClick;

function CompareDates() {
	var favs = JSON.parse(localStorage.getItem('favs'));
	let startDate;
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		startDate = new Date(favs[0])}
	else{	
		document.getElementById("DatePicker").disabled = false;
		// Spanish comics start on December 6, 1999; English comics start on June 19, 1978
		const isSpanish = document.getElementById('spanish').checked;
		startDate = isSpanish ? new Date("1999/12/06") : new Date("1978/06/19");
	}
	startDate = startDate.setHours(0, 0, 0, 0);
	currentselectedDate = currentselectedDate.setHours(0, 0, 0, 0);
	startDate = new Date(startDate);
	currentselectedDate = new Date(currentselectedDate);
	if(currentselectedDate.getTime() <= startDate.getTime()) {
		document.getElementById("Previous").disabled = true;
		document.getElementById("First").disabled = true;
		formatDate(startDate);
		startDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		document.getElementById("Previous").disabled = false;
		document.getElementById("First").disabled = false;
	}
	let endDate;
	if(document.getElementById("showfavs").checked) {
		endDate = new Date(favs[favs.length - 1]);
	}
	else{ 
		endDate = new Date();
	}
	endDate = endDate.setHours(0, 0, 0, 0);
	endDate = new Date(endDate);
	if(currentselectedDate.getTime() >= endDate.getTime()) {
		document.getElementById("Next").disabled = true;
		document.getElementById("Today").disabled = true;
		formatDate(endDate);
		endDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		document.getElementById("Next").disabled = false;
		document.getElementById("Today").disabled = false;
	}
	if(document.getElementById("showfavs").checked) {
		if(favs.length == 1) {
			document.getElementById("Random").disabled = true;
			document.getElementById("Previous").disabled = true;
			document.getElementById("First").disabled = true;
		} }
	else {
		document.getElementById("Random").disabled = false;}
}

function formatDate(datetoFormat) {
	day = datetoFormat.getDate();
	month = datetoFormat.getMonth() + 1;
	year = datetoFormat.getFullYear();
	month = ("0" + month).slice(-2);
	day = ("0" + day).slice(-2);
}

document.addEventListener('swiped-down', function(e) {
	if(document.getElementById("swipe").checked) {
		RandomClick() }
})

document.addEventListener('swiped-right', function(e) {
	if(document.getElementById("swipe").checked) {
		PreviousClick() }
})


document.addEventListener('swiped-left', function(e) {
	if(document.getElementById("swipe").checked) {
		NextClick() }
})

document.addEventListener('swiped-up', function(e) {
	if(document.getElementById("swipe").checked) {
		CurrentClick() }
})

setStatus = document.getElementById('swipe');
setStatus.onclick = function()
{
	if(document.getElementById('swipe').checked)
	{
    	localStorage.setItem('stat', "true");
    }
	else
	{
            localStorage.setItem('stat', "false");
			CompareDates();
			showComic();
    }
}

setStatus = document.getElementById('lastdate');
setStatus.onclick = function()
{
	if(document.getElementById('lastdate').checked) 
	{
		localStorage.setItem('lastdate', "true");
	}
	else
	{
		localStorage.setItem('lastdate', "false");
	}
}

setStatus = document.getElementById('showfavs');
setStatus.onclick = function()
{
	var favs = JSON.parse(localStorage.getItem('favs'));
	if(document.getElementById('showfavs').checked)
	{
		localStorage.setItem('showfavs', "true");
		if(favs.indexOf(formattedComicDate) !== -1)
		{
		}
		else
		{
			currentselectedDate = new Date(favs[0]);	
		}
		// NOTE: Button now uses SVG icon only, no text label change needed
	} 
	else
	{
		localStorage.setItem('showfavs', "false");
		// NOTE: Button now uses SVG icon only, no text label change needed
	}
	CompareDates();
	showComic();
}

setStatus = document.getElementById('spanish');
if (setStatus) {
	setStatus.onclick = function()
	{
		const isSpanish = document.getElementById('spanish').checked;
		const datePicker = document.getElementById('DatePicker');
		
		if(isSpanish)
		{
			localStorage.setItem('spanish', "true");
			translateInterface('es');
			document.documentElement.lang = 'es';
			// Update date picker min to Spanish comics start date
			if (datePicker) datePicker.min = "1999-12-06";
			
			// Check if current comic date is before Spanish comics start date
			const spanishStartDate = new Date('1999-12-06');
			if (currentselectedDate < spanishStartDate) {
				// Switch to today's comic
				currentselectedDate = new Date();
			}
		}
		else
		{
			localStorage.setItem('spanish', "false");
			translateInterface('en');
			document.documentElement.lang = 'en';
			// Update date picker min to English comics start date
			if (datePicker) datePicker.min = "1978-06-19";
		}
		// Reload the current comic in the selected language
		CompareDates();
		showComic();
	}
}

setStatus = document.getElementById('notifications');
if (setStatus) {
	setStatus.onclick = async function()
	{
		if(document.getElementById('notifications').checked)
		{
			const permitted = await requestNotificationPermission();
			if (permitted) {
				localStorage.setItem('notifications', "true");
				setupNotifications();
			} else {
				// Permission denied
				document.getElementById('notifications').checked = false;
				alert('Notification permission is required to enable this feature. Please allow notifications in your browser settings.');
			}
		}
		else
		{
			localStorage.setItem('notifications', "false");
		}
	}
}

// Function to check if the comic is vertical and show thumbnail if needed
function checkImageOrientation() {
    const comic = document.getElementById('comic');
    const comicWrapper = document.getElementById('comic-wrapper');
    
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
        
        // Create thumbnail container
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        
        // Create notice
        const notice = document.createElement('div');
        notice.className = 'thumbnail-notice';
        notice.textContent = 'Click to view full size';
        
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
    
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, .toolbar, .settings-icons-container, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Switch to fullscreen view
    comic.classList.remove('vertical');
    comic.classList.add('fullscreen-vertical');
    container.classList.add('fullscreen');
    document.body.classList.add('rotated-state');
    
    // Clear container background so comic stands alone
    container.style.background = 'none';
    container.style.backgroundSize = '';
    
    // Hide install button if present - use a more generic selector that will work
    const installButtons = document.querySelectorAll('button');
    installButtons.forEach(button => {
        if (button.innerText === 'Install App' || button.textContent === 'Install App') {
            button.style.display = 'none';
        }
    });
    
    // Hide other UI elements
    elementsToHide.forEach(el => {
        el.classList.add('hidden-during-fullscreen');
    });
    
    if (controlsDiv) {
        controlsDiv.classList.add('hidden-during-fullscreen');
    }
    
    // Add click handler to exit fullscreen
    comic.addEventListener('click', exitFullsizeVertical);
    container.addEventListener('click', exitFullsizeVertical);
}

// Function to exit fullsize vertical comic view
function exitFullsizeVertical(event) {
    // Prevent default behavior
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, .toolbar, .settings-icons-container, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Reset container background
    container.style.background = '';
    container.style.backgroundSize = '';
    document.body.classList.remove('rotated-state');
    
    // Show install button again if present
    const installButtons = document.querySelectorAll('button');
    installButtons.forEach(button => {
        if (button.innerText === 'Install App' || button.textContent === 'Install App') {
            button.style.display = '';
        }
    });
    
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
    
    // Remove this click handler
    comic.removeEventListener('click', exitFullsizeVertical);
    container.removeEventListener('click', exitFullsizeVertical);
}

let getStatus = localStorage.getItem('stat');
if (getStatus == "true")
{
	document.getElementById("swipe").checked = true;
}
else
{
	document.getElementById("swipe").checked = false;
}

getStatus = localStorage.getItem('showfavs');
if (getStatus == "true") 
{
	document.getElementById("showfavs").checked = true;
	// NOTE: Button now uses SVG icon only, no text label
}
else
{
	document.getElementById("showfavs").checked = false;
	// NOTE: Button now uses SVG icon only, no text label
}

getStatus = localStorage.getItem('lastdate');
if (getStatus == "true")
{
	document.getElementById("lastdate").checked = true;
}
else
{
	document.getElementById("lastdate").checked = false;
}	

getStatus = localStorage.getItem('spanish');
const datePicker = document.getElementById('DatePicker');

// Auto-detect Spanish language on first visit
if (getStatus === null) {
	// Check browser/OS language
	const userLang = navigator.language || navigator.userLanguage;
	const isSpanishLocale = userLang.startsWith('es');
	
	if (isSpanishLocale) {
		document.getElementById("spanish").checked = true;
		localStorage.setItem('spanish', "true");
		translateInterface('es');
		if (datePicker) datePicker.min = "1999-12-06";
	} else {
		document.getElementById("spanish").checked = false;
		localStorage.setItem('spanish', "false");
		translateInterface('en');
		if (datePicker) datePicker.min = "1978-06-19";
	}
}
else if (getStatus == "true")
{
	document.getElementById("spanish").checked = true;
	translateInterface('es');
	// Set date picker min to Spanish comics start date
	if (datePicker) datePicker.min = "1999-12-06";
}
else
{
	document.getElementById("spanish").checked = false;
	translateInterface('en');
	// Set date picker min to English comics start date
	if (datePicker) datePicker.min = "1978-06-19";
}

getStatus = localStorage.getItem('notifications');
if (getStatus == "true")
{
	document.getElementById("notifications").checked = true;
}
else
{
	document.getElementById("notifications").checked = false;
}

getStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
if (getStatus == "true")
{
	const panel = document.getElementById("settingsDIV");
	if (panel) panel.classList.add('visible');
}
else
{
	const panel = document.getElementById("settingsDIV");
	if (panel) panel.classList.remove('visible');
}

// Set up app install prompt
let deferredPrompt;

// Check if app is already installed (standalone or window controls overlay)
const isInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                   window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                   window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Only show install button if not already installed
  if (!isInstalled) {
    showInstallButton();
  }
});

function showInstallButton() {
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.style.display = 'block';
    
    installBtn.onclick = async function() {
      if (!deferredPrompt) {
        return;
      }
      
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
        installBtn.style.display = 'none';
      } else {
        console.log('User dismissed the install prompt');
      }
      
      deferredPrompt = null;
    };
  }
}

// Add status handling
function setStatus(message) {
    const comic = document.getElementById('comic');
    if (comic) {
        comic.alt = message;
    }
}

// Create handler object
const handlers = {
    async onLoad() {
        try {
            if (document.getElementById('lastdate')?.checked) {
                const savedDate = localStorage.getItem('lastDate');
                if (savedDate) {
                    await loadComic(new Date(savedDate));
                    return;
                }
            }
            await CurrentClick();
        } catch (error) {
            setStatus('Failed to load comic');
            console.error(error);
        }
    }
};

export default handlers;

// Notification functions
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    
    return false;
}

async function setupNotifications() {
    const notificationsEnabled = localStorage.getItem('notifications') === 'true';
    
    if (notificationsEnabled) {
        const permitted = await requestNotificationPermission();
        
        if (permitted) {
            // Schedule daily check
            scheduleDailyCheck();
            
            // Try to register periodic background sync if supported
            if ('serviceWorker' in navigator && 'periodicSync' in navigator.serviceWorker) {
                try {
                    const registration = await navigator.serviceWorker.ready;
                    await registration.periodicSync.register('check-new-comic', {
                        minInterval: 24 * 60 * 60 * 1000 // 24 hours
                    });
                    console.log('Periodic background sync registered');
                } catch (error) {
                    console.log('Periodic background sync not available:', error);
                }
            }
        } else {
            // Permission denied, disable notifications
            document.getElementById('notifications').checked = false;
            localStorage.setItem('notifications', 'false');
        }
    }
}

function scheduleDailyCheck() {
    // Calculate time until next check
    // GoComics publishes around 12:05 AM EST, so we check at 12:10 AM EST
    // Convert to user's local time
    
    const now = new Date();
    
    // Create a date object for 12:10 AM EST today
    const estCheckTime = new Date();
    estCheckTime.setUTCHours(5, 10, 0, 0); // 12:10 AM EST = 5:10 AM UTC (EST is UTC-5)
    
    // If we've already passed that time today, schedule for tomorrow
    if (now >= estCheckTime) {
        estCheckTime.setDate(estCheckTime.getDate() + 1);
    }
    
    const timeUntilCheck = estCheckTime.getTime() - now.getTime();
    
    console.log(`Next comic check scheduled for: ${estCheckTime.toLocaleString()}`);
    
    setTimeout(() => {
        checkForNewComicNow();
        // Schedule next check in 24 hours
        setInterval(checkForNewComicNow, 24 * 60 * 60 * 1000);
    }, timeUntilCheck);
}

async function checkForNewComicNow() {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration.active) {
            registration.active.postMessage({ type: 'CHECK_NEW_COMIC' });
        }
    }
}

// Initialize notifications on load
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => {
        setupNotifications();
        
        // iOS doesn't support background sync, so check when app opens
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (isIOS && localStorage.getItem('notifications') === 'true') {
            console.log('iOS detected: checking for new comic on app open');
            // Small delay to ensure service worker is ready
            setTimeout(() => checkForNewComicNow(), 1000);
        }
    });
}

window.requestNotificationPermission = requestNotificationPermission;
window.setupNotifications = setupNotifications;
