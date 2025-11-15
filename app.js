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
    ROTATION_DEBOUNCE: 300,               // Debounce time for rotation (in ms)
    
    // Fetch timeouts
    FETCH_TIMEOUT: 15000,                 // 15 second timeout for fetch requests
    
    // Swipe & touch detection
    SWIPE_MIN_DISTANCE: 50,               // Minimum swipe distance in px
    SWIPE_MAX_TIME: 500,                  // Maximum swipe time in ms
    TAP_MAX_MOVEMENT: 10,                 // Maximum movement for tap detection in px
    TAP_MAX_TIME: 300,                    // Maximum time for tap detection in ms
    
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
// TOUCH & SWIPE TRACKING VARIABLES
// ========================================

// Touch tracking variables for swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let touchStartTime = 0;
let lastSwipeTime = 0; // Track last swipe to prevent click events

// Rotation state tracking
let isRotating = false;
let isRotatedMode = false;

// ========================================
// DRAGGABLE ELEMENT FUNCTIONALITY
// ========================================

/**
 * Generic draggable element maker
 * @param {HTMLElement} element - Element to make draggable
 * @param {HTMLElement} dragHandle - Element that triggers dragging (usually header)
 * @param {string} storageKey - localStorage key for saving position
 */
/**
 * Persist the main toolbar position together with relative metadata (DirkJan pattern)
 * @param {number} top - Toolbar top position in px
 * @param {number} left - Toolbar left position in px
 * @param {HTMLElement} toolbarEl - Optional toolbar element reference
 * @param {Object} overrides - Optional overrides for metadata
 */
function storeToolbarPosition(top, left, toolbarEl, overrides = {}) {
    const toolbar = toolbarEl || document.querySelector('.toolbar:not(.fullscreen-toolbar)');
    const savedRaw = localStorage.getItem('toolbarPosition');
    const saved = UTILS.safeJSONParse(savedRaw, {});
    
    const positionData = { ...saved, top, left };
    
    const applyOverride = (key, value) => {
        if (value === undefined) return;
        if (value === null) {
            delete positionData[key];
        } else {
            positionData[key] = value;
        }
    };
    
    applyOverride('belowComic', overrides.belowComic);
    applyOverride('offsetFromComic', overrides.offsetFromComic ?? (overrides.belowComic === false ? null : undefined));
    applyOverride('belowSettings', overrides.belowSettings);
    applyOverride('offsetFromSettings', overrides.offsetFromSettings ?? (overrides.belowSettings === false ? null : undefined));
    
    const comic = document.getElementById('comic');
    if (comic && !('belowComic' in positionData)) {
        const comicRect = comic.getBoundingClientRect();
        const belowComic = top > comicRect.bottom;
        positionData.belowComic = belowComic;
        if (belowComic && !('offsetFromComic' in positionData)) {
            positionData.offsetFromComic = Math.max(15, top - comicRect.bottom);
        } else if (!belowComic) {
            delete positionData.offsetFromComic;
        }
    }
    
    const settingsPanel = document.getElementById('settingsDIV');
    if (settingsPanel && settingsPanel.classList.contains('visible') && !('belowSettings' in positionData)) {
        const settingsRect = settingsPanel.getBoundingClientRect();
        const belowSettings = top > settingsRect.bottom + 5;
        positionData.belowSettings = belowSettings;
        if (belowSettings && !('offsetFromSettings' in positionData)) {
            positionData.offsetFromSettings = Math.max(15, top - settingsRect.bottom);
        } else if (!belowSettings) {
            delete positionData.offsetFromSettings;
        }
    }
    
    try {
        localStorage.setItem('toolbarPosition', JSON.stringify(positionData));
    } catch (_) {}
}

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
        
        // Get element dimensions for boundary checking
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        
        // Calculate new position
        let newLeft = event.clientX - offsetX + window.scrollX;
        let newTop = event.clientY - offsetY + window.scrollY;
        
        // Special handling for toolbar: only allow vertical movement, keep centered horizontally
        if (storageKey === 'toolbarPosition') {
            // Keep toolbar centered horizontally
            const horizontalPadding = window.innerWidth < 768 ? 10 : 20;
            newLeft = Math.max(horizontalPadding, (window.innerWidth - width) / 2);
            newLeft = Math.min(newLeft, window.innerWidth - width - horizontalPadding);
        } else {
            // For other elements (like settings panel), allow horizontal movement
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width));
        }
        
        // Constrain vertical position within document bounds
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
        
        // Special handling for toolbar: detect if it's in the default zone (between logo and comic)
        if (storageKey === 'toolbarPosition') {
            const logo = document.querySelector('.logo');
            const comic = document.getElementById('comic-container');
            
            if (logo && comic) {
                const logoRect = logo.getBoundingClientRect();
                const comicRect = comic.getBoundingClientRect();
                const toolbarRect = element.getBoundingClientRect();
                
                // Check if toolbar is positioned between logo and comic
                const isInDefaultZone = 
                    toolbarRect.bottom > logoRect.bottom && 
                    toolbarRect.top < comicRect.top;
                
                if (isInDefaultZone) {
                    // Toolbar is in default zone - clear saved position so it auto-centers on resize
                    try {
                        localStorage.removeItem(storageKey);
                    } catch (_) {}
                    // Reposition to centered default
                    positionToolbarCentered(element);
                    
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('touchmove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.removeEventListener('touchend', onUp);
                    return;
                }
            }
            
            // For toolbar, save position with metadata
            storeToolbarPosition(numericTop, numericLeft, element);
        } else {
            // For other elements (like settings panel), save both positions
            try {
                localStorage.setItem(storageKey, JSON.stringify({ top: numericTop, left: numericLeft }));
            } catch (_) {}
        }
        
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
    
    // Has saved position - clamp vertical bounds and recenter horizontally
    const rect = mainToolbar.getBoundingClientRect();
    let top = parseFloat(mainToolbar.style.top) || 0;
    
    // Always center horizontally (toolbar can only move vertically)
    const toolbarWidth = mainToolbar.offsetWidth;
    const horizontalPadding = window.innerWidth < 768 ? 10 : 20;
    let left = Math.max(horizontalPadding, (window.innerWidth - toolbarWidth) / 2);
    left = Math.min(left, window.innerWidth - toolbarWidth - horizontalPadding);
    
    const maxTop = window.innerHeight - rect.height - 10;
    
    let changed = false;
    
    if (top < 10) {
        top = 10;
        changed = true;
    } else if (top > maxTop) {
        top = maxTop;
        changed = true;
    }
    
    // Always update left position to keep centered
    mainToolbar.style.left = left + 'px';
    mainToolbar.style.top = top + 'px';
    
    if (changed) {
        try {
            localStorage.setItem('toolbarPosition', JSON.stringify({ top }));
        } catch (_) {}
    }
}

/**
 * Initialize toolbar positioning and dragging
 */
function initializeToolbar() {
    const mainToolbar = document.getElementById('mainToolbar');
    if (!mainToolbar) return;
    
    // Check for saved position (only top value is saved, horizontal is always centered)
    const savedPosRaw = localStorage.getItem('toolbarPosition');
    const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
    
    if (savedPos && typeof savedPos.top === 'number') {
        // Apply saved vertical position and calculate centered horizontal position
        const toolbarWidth = mainToolbar.offsetWidth;
        const horizontalPadding = window.innerWidth < 768 ? 10 : 20;
        let left = Math.max(horizontalPadding, (window.innerWidth - toolbarWidth) / 2);
        left = Math.min(left, window.innerWidth - toolbarWidth - horizontalPadding);
        
        mainToolbar.style.top = savedPos.top + 'px';
        mainToolbar.style.left = left + 'px';
        mainToolbar.style.transform = 'none';
    } else {
        // No saved position - calculate centered position
        positionToolbarCentered(mainToolbar);
    }
    
    // Make toolbar draggable (vertical only)
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
        let touchTimeout = null;
        
        // Touch start - add active class
        button.addEventListener('touchstart', (e) => {
            // Clear any pending timeout
            if (touchTimeout) clearTimeout(touchTimeout);
            
            // Add temporary active class for visual feedback
            button.classList.add('touch-active');
        }, { passive: true });
        
        // Touch end - remove active state and ensure bounce back
        button.addEventListener('touchend', (e) => {
            // Immediate blur to prevent :focus state
            button.blur();
            
            // Remove active class and reset after brief delay for visual feedback
            touchTimeout = setTimeout(() => {
                button.classList.remove('touch-active');
                button.style.transform = '';
                button.style.transition = '';
                
                // Force reflow to ensure CSS updates
                void button.offsetHeight;
            }, 100);
        }, { passive: true });
        
        // Touch cancel - immediate reset
        button.addEventListener('touchcancel', () => {
            if (touchTimeout) clearTimeout(touchTimeout);
            button.classList.remove('touch-active');
            button.style.transform = '';
            button.style.transition = '';
            button.blur();
        }, { passive: true });
        
        // Click handler - ensure cleanup
        button.addEventListener('click', () => {
            setTimeout(() => {
                button.blur();
                button.classList.remove('touch-active');
                button.style.transform = '';
            }, 100);
        });
    });
    
    // Global safeguard - reset any stuck buttons
    document.addEventListener('touchend', () => {
        setTimeout(() => {
            toolbarButtons.forEach(button => {
                button.classList.remove('touch-active');
                button.style.transform = '';
                button.blur();
            });
        }, 150);
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

/**
 * Show in-app notification toast
 */
function showNotification(message, duration = 5000) {
    const toast = document.getElementById('notificationToast');
    const content = document.getElementById('notificationContent');
    const closeBtn = document.getElementById('notificationClose');
    
    if (!toast || !content) return;
    
    content.textContent = message;
    toast.classList.add('show');
    
    // Auto-hide after duration
    const autoHideTimeout = setTimeout(() => {
        hideNotification();
    }, duration);
    
    // Close button handler
    const closeHandler = () => {
        clearTimeout(autoHideTimeout);
        hideNotification();
    };
    
    closeBtn.onclick = closeHandler;
}

/**
 * Hide notification toast
 */
function hideNotification() {
    const toast = document.getElementById('notificationToast');
    if (toast) {
        toast.classList.remove('show');
    }
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
        notifyNewComics: 'Notify me of new comics',
        sundayNotAvailable: 'Sunday comics are not always available in Spanish. The comic for this date does not exist.'
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
        notifyNewComics: 'Notificar nuevos cómics',
        sundayNotAvailable: 'Los cómics dominicales no siempre están disponibles en español. El cómic para esta fecha no existe.'
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
    
    // Translate toolbar button tooltips
    const toolbarButtons = {
        'First': t.first,
        'Previous': t.previous,
        'Random': t.random,
        'DatePickerBtn': t.selectDate,
        'Next': t.next,
        'Last': t.last
    };
    
    for (const [id, tooltip] of Object.entries(toolbarButtons)) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.title = tooltip;
            btn.setAttribute('aria-label', tooltip);
        }
    }
    
    // Translate date picker
    const datePicker = document.getElementById('DatePicker');
    if (datePicker) {
        datePicker.title = t.selectDate;
        datePicker.setAttribute('aria-label', t.selectDate);
    }
    
    // Translate icon buttons (Settings, Favorites, Share)
    const iconButtons = document.querySelectorAll('.icon-button');
    iconButtons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr) {
            if (onclickAttr.includes('HideSettings')) {
                btn.title = t.settings;
                btn.setAttribute('aria-label', t.settings);
            } else if (onclickAttr.includes('Addfav')) {
                btn.title = t.favorites;
                btn.setAttribute('aria-label', t.favorites);
            } else if (onclickAttr.includes('Share')) {
                btn.title = t.share;
                btn.setAttribute('aria-label', t.share);
            }
        }
    });
    
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

/**
 * Share comic via Web Share API
 */
async function Share() {
    const imageUrl = window.pictureUrl || previousUrl;
    
    if (!imageUrl) {
        showNotification("No comic to share. Please load a comic first.", 3000);
        return;
    }
    
    if (!navigator.share) {
        showNotification("Sharing is not supported on this device.", 3000);
        return;
    }
    
    try {
        // Try to create canvas from image for sharing
        const tempImg = new Image();
        tempImg.crossOrigin = "anonymous";
        
        // Load image with timeout and fallback
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
            
            tempImg.onload = () => {
                clearTimeout(timeout);
                resolve();
            };
            
            tempImg.onerror = () => {
                clearTimeout(timeout);
                reject(new Error("Load failed"));
            };
            
            tempImg.src = imageUrl;
        }).catch(async () => {
            // Try with proxy on failure
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(imageUrl)}`;
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Proxy timeout")), 5000);
                tempImg.onload = () => { clearTimeout(timeout); resolve(); };
                tempImg.onerror = () => { clearTimeout(timeout); reject(new Error("Proxy failed")); };
                tempImg.src = proxyUrl;
            });
        });
        
        // Convert image to blob
        const canvas = document.createElement('canvas');
        canvas.width = tempImg.width;
        canvas.height = tempImg.height;
        canvas.getContext('2d').drawImage(tempImg, 0, 0);
        
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Blob creation failed")), 'image/jpeg', 0.95);
        });
        
        // Share with file
        const file = new File([blob], "garfield.jpg", { type: "image/jpeg", lastModified: Date.now() });
        await navigator.share({
            url: 'https://garfieldapp.pages.dev',
            text: 'Shared from GarfieldApp',
            files: [file]
        });
    } catch (error) {
        // Fallback to text-only sharing on error
        if (error.name === 'SecurityError' || error.message.includes("failed")) {
            try {
                await navigator.share({
                    url: 'https://garfieldapp.pages.dev',
                    text: `Shared from GarfieldApp - Garfield comic for ${formattedComicDate}`
                });
                return;
            } catch (fallbackError) {
                // Silent fail if sharing canceled
            }
        }
        
        // Show error only if not user-canceled
        if (error.name !== 'AbortError') {
            showNotification("Failed to share the comic. Please try again.", 3000);
        }
    }
}

window.Share = Share;

/**
 * Add or remove comic from favorites
 */
function Addfav() {
    // Use formattedComicDate which is in YYYY/MM/DD format (consistent with rest of app)
    if (!formattedComicDate) {
        console.error('formattedComicDate is not set');
        return;
    }
    
    let favs = UTILS.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS), []);
    
    // Ensure favs is always an array
    if (!Array.isArray(favs)) {
        favs = [];
    }
    
    const heartBtn = document.getElementById("favheart");
    const heartSvg = heartBtn?.querySelector('svg path');
    const showFavsCheckbox = document.getElementById("showfavs");
    
    const favIndex = favs.indexOf(formattedComicDate);
    
    if (favIndex === -1) {
        // Add to favorites
        favs.push(formattedComicDate);
        if (heartSvg) heartSvg.setAttribute('fill', 'currentColor');
        if (showFavsCheckbox) showFavsCheckbox.disabled = false;
    } else {
        // Remove from favorites
        favs.splice(favIndex, 1);
        if (heartSvg) heartSvg.setAttribute('fill', 'none');
        
        if (favs.length === 0 && showFavsCheckbox) {
            showFavsCheckbox.checked = false;
            showFavsCheckbox.disabled = true;
        }
    }
    
    favs.sort();
    localStorage.setItem(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(favs));
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

function HideSettings(e) {
    // Prevent event from bubbling if called from event handler
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const panel = document.getElementById("settingsDIV");
    
    if (!panel) {
        console.warn('Settings panel not found');
        return;
    }
    
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

// Expose globally as early as possible
window.HideSettings = HideSettings;

// ========================================
// TOUCH & SWIPE HANDLING
// ========================================

/**
 * Handles touch start event
 * Records initial touch position and time for swipe/tap detection
 * @param {TouchEvent} e - Touch event
 */
function handleTouchStart(e) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    
    // Early return for swipe gesture handling, but keep tracking for tap detection
    if (!document.getElementById("swipe").checked) return;
}

/**
 * Handles touch move event
 * Prevents default scrolling during horizontal swipes
 * @param {TouchEvent} e - Touch event
 */
function handleTouchMove(e) {
    // Always allow swipes in rotated mode
    const rotatedComic = document.getElementById('rotated-comic');
    if (!rotatedComic && !document.getElementById("swipe").checked) return;
    
    // Prevent default scrolling behavior during swipe
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);
    
    // If horizontal swipe is more significant than vertical, prevent vertical scrolling
    if (deltaX > deltaY && deltaX > 20) {
        e.preventDefault();
    }
}

/**
 * Handles touch end event
 * Detects taps (for rotation) and swipes (for navigation)
 * In rotated mode, swipe directions are mapped differently to match visual orientation
 * @param {TouchEvent} e - Touch event
 */
function handleTouchEnd(e) {
    const touch = e.changedTouches[0];
    touchEndX = touch.clientX;
    touchEndY = touch.clientY;
    
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const deltaTime = Date.now() - touchStartTime;
    
    // Check swipe distance
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    // For swipe navigation - always enabled in rotated mode
    const rotatedComic = document.getElementById('rotated-comic');
    if (!rotatedComic && !document.getElementById("swipe").checked) return;
    
    // Check if the swipe is valid (meets distance and time requirements)
    if (deltaTime > CONFIG.SWIPE_MAX_TIME) return;
    
    let swipeDetected = false;
    
    // Check if we're in rotated fullscreen mode (reuse rotatedComic from above)
    const isInRotatedMode = rotatedComic && rotatedComic.className.includes('rotate');
    const isInLandscapeMode = rotatedComic && rotatedComic.className.includes('fullscreen-landscape');
    
    // Determine swipe direction based on mode
    if (isInRotatedMode) {
        // Rotated mode (90° clockwise): Swipe gestures follow the rotation
        // Physical up/down becomes logical left/right, physical left/right becomes logical up/down
        if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
            // Vertical swipe (becomes horizontal navigation due to rotation)
            swipeDetected = true;
            lastSwipeTime = Date.now();
            if (deltaY < 0) {
                // Swipe Up -> visually moves right -> Next
                NextClick();
            } else {
                // Swipe Down -> visually moves left -> Previous
                PreviousClick();
            }
        } else if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            // Horizontal swipe (becomes vertical navigation due to rotation)
            swipeDetected = true;
            lastSwipeTime = Date.now();
            if (deltaX < 0) {
                // Swipe Left -> visually moves down -> Random
                RandomClick();
            } else {
                // Swipe Right -> visually moves up -> Last
                LastClick();
            }
        }
    } else if (isInLandscapeMode) {
        // Landscape fullscreen (no rotation): Normal horizontal/vertical mapping
        if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            // Horizontal swipe
            swipeDetected = true;
            lastSwipeTime = Date.now();
            if (deltaX < 0) {
                // Swipe Left -> Next
                NextClick();
            } else {
                // Swipe Right -> Previous
                PreviousClick();
            }
        } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
            // Vertical swipe
            swipeDetected = true;
            lastSwipeTime = Date.now();
            if (deltaY < 0) {
                // Swipe Up -> Last
                LastClick();
            } else {
                // Swipe Down -> Random
                RandomClick();
            }
        }
    } else {
        // Normal portrait mode: Horizontal for Next/Prev, Vertical for Random/Last
        if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            // Horizontal swipe
            swipeDetected = true;
            lastSwipeTime = Date.now(); // Mark swipe occurred to prevent click
            if (deltaX > 0) {
                // Swipe right -> Previous
                PreviousClick();
            } else {
                // Swipe left -> Next
                NextClick();
            }
        } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
            // Vertical swipe
            swipeDetected = true;
            lastSwipeTime = Date.now(); // Mark swipe occurred to prevent click
            if (deltaY > 0) {
                // Swipe down -> Random
                RandomClick();
            } else {
                // Swipe up -> Last
                LastClick();
            }
        }
    }
}

// ========================================
// COMIC ROTATION & FULLSCREEN
// ========================================

/**
 * Toggles comic rotation to fullscreen mode
 * Handles both entering and exiting fullscreen with optional 90-degree rotation
 * @param {boolean} applyRotation - Whether to apply 90-degree rotation (default: true)
 */
function Rotate(applyRotation = true) {
    // Prevent rapid double-calls
    if (isRotating) {
        return;
    }
    
    isRotating = true;
    
    try {
        const element = document.getElementById('comic');
        
        if (!element) {
            isRotating = false;
            return;
        }
        
        // Check if we're already in fullscreen mode
        const existingOverlay = document.getElementById('comic-overlay');
        if (existingOverlay) {
            // Exit fullscreen mode
            document.body.removeChild(existingOverlay);
            
            const rotatedComic = document.getElementById('rotated-comic');
            if (rotatedComic) {
                document.body.removeChild(rotatedComic);
            }
            
            const fullscreenToolbar = document.getElementById('fullscreen-toolbar');
            if (fullscreenToolbar) {
                document.body.removeChild(fullscreenToolbar);
            }
            
            // Restore theme color
            const themeColorMeta = document.querySelector('meta[name="theme-color"]');
            if (themeColorMeta && themeColorMeta.dataset.originalColor) {
                themeColorMeta.content = themeColorMeta.dataset.originalColor;
                delete themeColorMeta.dataset.originalColor;
            }
            
            // Restore all hidden elements
            const hiddenElements = document.querySelectorAll('[data-was-hidden]');
            hiddenElements.forEach(el => {
                el.style.display = el.dataset.originalDisplay || '';
                delete el.dataset.wasHidden;
                delete el.dataset.originalDisplay;
            });
            
            element.className = element.className.replace(/\s*(rotate|fullscreen-landscape)/g, '');
            
            // Remove event listeners
            window.removeEventListener('resize', handleRotatedViewResize);
            window.removeEventListener('orientationchange', handleRotatedViewResize);
            
            isRotatedMode = false;
            isRotating = false;
            
            // Restore toolbar position with full recalculation (DirkJan pattern)
            setTimeout(() => {
                const toolbar = document.getElementById('mainToolbar');
                const comic = document.getElementById('comic');
                
                if (!toolbar || !comic) return;
                
                toolbar.style.visibility = 'hidden';
                
                const savedPosRaw = localStorage.getItem('toolbarPosition');
                const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
                
                if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
                    const comicRect = comic.getBoundingClientRect();
                    const settingsPanel = document.getElementById('settingsDIV');
                    
                    // Determine if toolbar should be below comic based on saved flag
                    const shouldBeBelow = savedPos.belowComic === true ||
                        (savedPos.belowComic === undefined && (savedPos.offsetFromComic !== undefined || savedPos.top > comicRect.bottom + 10));
                    
                    let newTop, newLeft;
                    newLeft = savedPos.left;
                    
                    if (shouldBeBelow) {
                        // Position below comic with saved offset
                        const storedComicGap = Math.max(15, savedPos.offsetFromComic || 15);
                        newTop = comicRect.bottom + storedComicGap;
                        
                        // Check for settings panel overlap
                        if (settingsPanel && settingsPanel.classList.contains('visible')) {
                            const settingsRect = settingsPanel.getBoundingClientRect();
                            const toolbarHeight = toolbar.offsetHeight;
                            const wouldOverlap = (newTop + toolbarHeight > settingsRect.top) && (newTop < settingsRect.bottom);
                            
                            if (wouldOverlap) {
                                newTop = settingsRect.bottom + 15;
                            }
                        }
                    } else {
                        // Toolbar above comic - check if saved position still valid
                        const toolbarHeight = toolbar.offsetHeight;
                        const wouldOverlap = (savedPos.top + toolbarHeight > comicRect.top) && (savedPos.top < comicRect.bottom);
                        
                        if (wouldOverlap) {
                            // Recalculate - position between logo and comic
                            const logo = document.querySelector('.logo');
                            if (logo) {
                                const logoRect = logo.getBoundingClientRect();
                                const availableSpace = comicRect.top - logoRect.bottom;
                                newTop = logoRect.bottom + Math.max(15, (availableSpace - toolbarHeight) / 2);
                            } else {
                                newTop = savedPos.top;
                            }
                        } else {
                            newTop = savedPos.top;
                        }
                    }
                    
                    // Clamp to viewport
                    const maxLeft = window.innerWidth - toolbar.offsetWidth;
                    const maxTop = window.innerHeight - toolbar.offsetHeight;
                    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                    newTop = Math.max(0, Math.min(newTop, maxTop));
                    
                    // Apply position
                    toolbar.style.top = newTop + 'px';
                    toolbar.style.left = newLeft + 'px';
                    toolbar.style.transform = 'none';
                }
                
                toolbar.style.visibility = 'visible';
            }, 250);
            
            return;
        }
        
        // Enter fullscreen mode
        isRotatedMode = true;
        
        // Change theme color for Android status bar to match dark overlay
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.dataset.originalColor = themeColorMeta.content;
            themeColorMeta.content = '#1a1a1a'; // Dark to blend with overlay
        }
        
        // Hide all page elements
        const elementsToHide = document.querySelectorAll('body > *');
        elementsToHide.forEach(el => {
            el.dataset.originalDisplay = window.getComputedStyle(el).display;
            el.dataset.wasHidden = "true";
            el.style.setProperty('display', 'none', 'important');
        });
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'comic-overlay';
        
        // Clone comic image
        const clonedComic = element.cloneNode(true);
        clonedComic.id = 'rotated-comic';
        clonedComic.className = applyRotation ? "rotate" : "fullscreen-landscape";
        clonedComic.style.display = 'block';
        
        // No toolbar in fullscreen mode - maximize screen space for comic
        
        // Add elements to page
        document.body.appendChild(overlay);
        document.body.appendChild(clonedComic);
        
        // Show comic
        clonedComic.style.display = 'block';
        
        // Add resize listeners
        window.addEventListener('resize', handleRotatedViewResize);
        window.addEventListener('orientationchange', handleRotatedViewResize);
        
        // Apply sizing when image is loaded
        if (clonedComic.complete) {
            maximizeRotatedImage(clonedComic);
        } else {
            clonedComic.onload = function() {
                maximizeRotatedImage(clonedComic);
            };
        }
        
        // Add swipe support in rotated view
        overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
        overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
        overlay.addEventListener('touchend', function(e) {
            handleTouchEnd(e);
            e.stopPropagation();
        }, { passive: true });
        
        // Click to exit fullscreen
        overlay.addEventListener('click', function() {
            Rotate();
        });
        
    } catch (error) {
        console.error('Error in Rotate():', error);
        isRotating = false;
        isRotatedMode = false;
    } finally {
        setTimeout(() => {
            isRotating = false;
        }, CONFIG.ROTATION_DEBOUNCE);
    }
}

/**
 * Maximizes the rotated image to fit viewport
 * @param {HTMLImageElement} imgElement - Image element to resize
 */
function maximizeRotatedImage(imgElement) {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;
    
    if (!naturalWidth || !naturalHeight) {
        return;
    }
    
    const isLandscapeMode = imgElement.className.includes('fullscreen-landscape');
    const isRotatedMode = imgElement.className.includes('rotate');
    
    // For rotated image, visual width is original height and vice versa
    const rotatedWidth = isLandscapeMode ? naturalWidth : naturalHeight;
    const rotatedHeight = isLandscapeMode ? naturalHeight : naturalWidth;
    
    // Calculate scale to fit viewport
    let scale;
    if (rotatedWidth / rotatedHeight > viewportWidth / viewportHeight) {
        // Width is the limiting factor
        scale = viewportWidth / rotatedWidth;
    } else {
        // Height is the limiting factor
        scale = viewportHeight / rotatedHeight;
    }
    
    // Make the image slightly smaller (90% of the calculated size) for breathing room
    scale = scale * 0.9;
    
    // Set dimensions
    imgElement.style.width = `${naturalWidth * scale}px`;
    imgElement.style.height = `${naturalHeight * scale}px`;
    imgElement.style.position = 'fixed';
    
    if (isLandscapeMode) {
        imgElement.style.top = '40%';
        imgElement.style.left = '50%';
        imgElement.style.transformOrigin = 'center center';
    } else if (isRotatedMode) {
        // In rotated mode, let CSS handle positioning completely via transform
        // Clear inline positioning to avoid conflicts
        imgElement.style.top = '';
        imgElement.style.left = '';
        imgElement.style.transformOrigin = '';
    }
    
    // Clear max constraints for both modes to use calculated dimensions
    imgElement.style.maxWidth = 'none';
    imgElement.style.maxHeight = 'none';
    imgElement.style.zIndex = '10001';
    imgElement.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
}

/**
 * Handles resize and orientation changes in rotated view
 */
function handleRotatedViewResize() {
    const rotatedComic = document.getElementById('rotated-comic');
    if (rotatedComic) {
        maximizeRotatedImage(rotatedComic);
    }
}

// Expose Rotate function globally
window.Rotate = Rotate;

// Add touch event listeners to the document
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

// Orientation change listener registered inline at end of file (DirkJan pattern)

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

/**
 * Load comic for a specific date
 * @param {Date} date - Date to load comic for
 * @param {boolean} silentMode - If true, suppress error messages
 * @returns {Promise<boolean>} True if comic loaded successfully
 */
async function loadComic(date, silentMode = false) {
    try {
        const useSpanish = document.getElementById("spanish")?.checked || false;
        const language = useSpanish ? 'es' : 'en';
        
        const result = await getAuthenticatedComic(date, language);
        
        if (result.success && result.imageUrl) {
            const comicImg = document.getElementById('comic');
            comicImg.src = result.imageUrl;
            comicImg.style.display = 'block';
            
            // Also update the rotated comic if it exists
            const rotatedComic = document.getElementById('rotated-comic');
            if (rotatedComic) {
                rotatedComic.src = result.imageUrl;
                // Recalculate sizing when new image loads (handles Sunday vs weekday differences)
                rotatedComic.onload = function() {
                    maximizeRotatedImage(rotatedComic);
                };
            }
            
            // Store for sharing
            window.pictureUrl = result.imageUrl;
            previousUrl = result.imageUrl;
            
            // Hide error messages
            const messageContainer = document.getElementById('comic-message');
            if (messageContainer) messageContainer.style.display = 'none';
            
            return true;
        }
        
        if (result.isPaywalled && !silentMode) {
            showPaywallMessage();
            return false;
        }
        
        throw new Error('Comic not available');
    } catch (error) {
        if (!silentMode) {
            showErrorMessage('Failed to load comic. Please try again.');
        }
        return false;
    }
}

/**
 * Show paywall message for unavailable comics
 */
function showPaywallMessage() {
    const comicContainer = document.getElementById('comic-container');
    const comic = document.getElementById('comic');
    
    comic.style.display = 'none';
    
    let messageContainer = document.getElementById('comic-message');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'comic-message';
        messageContainer.className = 'paywall-message';
        comicContainer.appendChild(messageContainer);
    }
    
    messageContainer.style.display = 'flex';
    
    const daysDiff = Math.floor((new Date() - currentselectedDate) / (1000 * 60 * 60 * 24));
    
    messageContainer.innerHTML = daysDiff > 30
        ? `<p><strong>Unable to load this archive comic</strong></p>
           <p>This comic is from ${daysDiff} day${daysDiff !== 1 ? 's' : ''} ago. GoComics normally requires a paid subscription to access comics older than 30 days.</p>
           <p>Try viewing more recent comics (last 30 days), which are free!</p>`
        : `<p><strong>Unable to load this comic</strong></p>
           <p>This recent comic should normally be free, but we're having trouble loading it.</p>
           <p>Please try again later or try a different date.</p>`;
}

/**
 * Show error message for failed comic loads
 * @param {string} message - Error message to display
 */
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
    
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    messageContainer.innerHTML = isLocalhost
        ? `<p><strong>Local Testing Mode</strong></p>
           <p>The CORS proxies are currently not accessible from localhost. This is normal during local development.</p>
           <p><strong>Your authentication system is ready!</strong></p>
           <ul style="text-align: left; max-width: 500px;">
               <li>✓ Login/logout functionality implemented</li>
               <li>✓ Paywall detection in place</li>
               <li>✓ Age-based comic access logic (recent = free, archive = paywalled)</li>
               <li>✓ Multiple CORS proxy fallback system</li>
           </ul>
           <p>When deployed to <strong>garfieldapp.pages.dev</strong>, the app will work properly with your Cloudflare Worker proxy.</p>
           <p>Try committing and pushing your changes to test on the live site!</p>`
        : `<p><strong>Unable to Load Comic</strong></p>
           <p>${message}</p>
           <p>Please try again later or select a different date.</p>`;
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
        document.getElementById("Last").disabled = true;
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
async function DateChange() {
    const previousDate = new Date(currentselectedDate);
    currentselectedDate = document.getElementById('DatePicker');
    currentselectedDate = new Date(currentselectedDate.value);
    updateDateDisplay();
    CompareDates();
    
    // Check if user selected a Sunday in Spanish mode
    const isSpanish = document.getElementById('spanish')?.checked || false;
    const isSunday = currentselectedDate.getDay() === 0;
    
    if (isSpanish && isSunday) {
        // Try to load the comic
        formatDate(currentselectedDate);
        formattedComicDate = year + "/" + month + "/" + day;
        formattedDate = year + "-" + month + "-" + day;
        document.getElementById("DatePicker").value = formattedDate;
        
        const success = await loadComic(currentselectedDate, true);
        
        if (!success) {
            // Comic doesn't exist, show notification and revert to previous date
            const currentLang = isSpanish ? 'es' : 'en';
            const message = translations[currentLang].sundayNotAvailable;
            showNotification(message, 6000);
            currentselectedDate = previousDate;
            formatDate(currentselectedDate);
            formattedComicDate = year + "/" + month + "/" + day;
            formattedDate = year + "-" + month + "-" + day;
            document.getElementById("DatePicker").value = formattedDate;
            updateDateDisplay();
            return;
        }
    }
    
    await showComic();
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
    var favs = UTILS.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS), []);
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
    
    // Load the comic (silent mode off for first attempt when not auto-skipping)
    const success = await loadComic(currentselectedDate, skipOnFailure);
    
    // If comic failed to load and we should skip, try the next one
    if (!success && skipOnFailure && direction) {
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
                showErrorMessage('No more comics available in this direction.');
                break;
            }
            if (document.getElementById("Previous")?.disabled && direction === 'previous') {
                showErrorMessage('No more comics available in this direction.');
                break;
            }
            
            // Try loading this comic in silent mode (no error messages)
            formatDate(currentselectedDate);
            formattedComicDate = year + "/" + month + "/" + day;
            formattedDate = year + "-" + month + "-" + day;
            document.getElementById("DatePicker").value = formattedDate;
            updateDateDisplay();
            
            const retrySuccess = await loadComic(currentselectedDate, true);
            if (retrySuccess) {
                // Update favorites heart status for the new date
                var favs = UTILS.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS), []);
                const heartBtn = document.getElementById("favheart");
                const heartSvg = heartBtn?.querySelector('svg path');
                if(favs && favs.indexOf(formattedComicDate) !== -1) {
                    if (heartSvg) heartSvg.setAttribute('fill', 'currentColor');
                } else {
                    if (heartSvg) heartSvg.setAttribute('fill', 'none');
                }
                return;
            }
        }
        
        if (attempts >= maxAttempts) {
            showErrorMessage('Unable to find an available comic after multiple attempts.');
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

function LastClick() {
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

window.LastClick = LastClick;


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
		document.getElementById("Last").disabled = true;
		formatDate(endDate);
		endDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		document.getElementById("Next").disabled = false;
		document.getElementById("Last").disabled = false;
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

// ========================================
// LEGACY SWIPE EVENT HANDLERS
// ========================================
// NOTE: These old swiped-events library handlers have been replaced by native
// touch handlers (handleTouchStart, handleTouchMove, handleTouchEnd) defined earlier.
// The new handlers provide better performance, rotation-aware swipe mapping,
// and work seamlessly in both normal and rotated comic views.
// The swiped-events.min.js library can be removed from index.html if desired.

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
	setStatus.onclick = async function()
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
			const spanishStartDate = new Date(CONFIG.GARFIELD_START_ES);
			const isBeforeStart = currentselectedDate < spanishStartDate;
			
			if (isBeforeStart) {
				// Switch to today's comic and show notification
				const currentLang = 'es';
				const t = translations[currentLang];
				const message = t.sundayNotAvailable;
				
				currentselectedDate = new Date();
				showNotification(message, 6000);
				
				// Reload the comic
				CompareDates();
				showComic();
			} else {
				// Try to load the comic in Spanish to check availability
				CompareDates();
				const loaded = await loadComic(currentselectedDate, true);
				
				// If comic not available in Spanish, switch to today
				if (!loaded) {
					const currentLang = 'es';
					const t = translations[currentLang];
					const message = t.sundayNotAvailable;
					
					currentselectedDate = new Date();
					showNotification(message, 6000);
					
					// Reload today's comic
					CompareDates();
					showComic();
				}
			}
		}
		else
		{
			localStorage.setItem('spanish', "false");
			translateInterface('en');
			document.documentElement.lang = 'en';
			// Update date picker min to English comics start date
			if (datePicker) datePicker.min = "1978-06-19";
			
			// Reload the current comic in the selected language
			CompareDates();
			showComic();
		}
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
				
				// Inform user about Android limitations
				const isAndroid = /Android/.test(navigator.userAgent);
				const hasPeriodicSync = 'periodicSync' in navigator.serviceWorker;
				
				if (isAndroid && !hasPeriodicSync) {
					showNotification(
						'Notifications enabled! Note: You\'ll need to open the app daily to check for new comics, as Android browsers don\'t support automatic background checks.',
						8000
					);
				} else {
					showNotification('Notifications enabled! You\'ll be notified when new comics are available.', 4000);
				}
			} else {
				// Permission denied
				document.getElementById('notifications').checked = false;
				showNotification('Notification permission is required. Please allow notifications in your browser settings.', 5000);
			}
		}
		else
		{
			localStorage.setItem('notifications', "false");
			showNotification('Notifications disabled.', 3000);
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
if (getStatus === null) {
	// First time user - default to enabled
	document.getElementById("swipe").checked = true;
	localStorage.setItem('stat', "true");
} else if (getStatus == "true") {
	document.getElementById("swipe").checked = true;
} else {
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
        installBtn.style.display = 'none';
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
        }
    }
};

export default handlers;

// Notification functions
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
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
                } catch (error) {
                    // Periodic background sync not available
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
    // GoComics publishes around 12:05 AM ET, so we check at 12:10 AM ET
    
    const now = new Date();
    
    // Get current ET time and create target time for 12:10 AM ET
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    let checkTimeET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    checkTimeET.setHours(0, 10, 0, 0); // 12:10 AM ET
    
    // If we've already passed 12:10 AM ET today, schedule for tomorrow
    if (nowET >= checkTimeET) {
        checkTimeET.setDate(checkTimeET.getDate() + 1);
    }
    
    // Convert ET time back to local time for setTimeout
    const checkTimeLocal = new Date(checkTimeET.toLocaleString('en-US'));
    const timeUntilCheck = checkTimeLocal.getTime() - now.getTime();
    
    console.log(`Next comic check scheduled in ${Math.round(timeUntilCheck / 1000 / 60 / 60)} hours`);
    
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
        
        // Check on app open for browsers without background sync (iOS, Android)
        // Most Android browsers don't support periodic background sync
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        if ((isIOS || isAndroid) && localStorage.getItem('notifications') === 'true') {
            // Check when app opens as fallback for no background sync
            setTimeout(() => checkForNewComicNow(), 1000);
        }
    });
}

window.requestNotificationPermission = requestNotificationPermission;
window.setupNotifications = setupNotifications;

// ========================================
// ORIENTATION CHANGE LISTENER
// ========================================
// Register at end of file to ensure all functions are defined
// Inline handler like DirkJan for immediate registration

window.addEventListener('orientationchange', function() {
    setTimeout(() => {
        const orientation = screen.orientation?.type || '';
        const isLandscape = orientation.includes('landscape') || Math.abs(window.orientation) === 90;
        const rotatedComic = document.getElementById('rotated-comic');
        
        if (isLandscape) {
            // Device rotated to landscape
            if (!rotatedComic) {
                // Not in fullscreen yet - enter landscape fullscreen mode
                const comic = document.getElementById('comic');
                if (comic && comic.className.includes('normal')) {
                    Rotate(false); // Enter fullscreen WITHOUT rotation (device already landscape)
                }
            } else {
                // Already in fullscreen - just reposition
                maximizeRotatedImage(rotatedComic);
            }
        } else {
            // Device rotated to portrait
            if (rotatedComic) {
                // In fullscreen mode - exit it
                Rotate();
            }
        }
    }, 300);
});
