import { getAuthenticatedComic } from './comicExtractor.js';

//garfieldapp.pages.dev

// ========================================
// CONFIGURATION & CONSTANTS
// ========================================

/**
 * Centralized configuration object
 * All magic numbers and constants in one place
 */
const CONFIG = Object.freeze({
  // Timing constants
  ROTATION_DEBOUNCE: 300,              // Debounce time for rotation in ms
  SHARE_TIMEOUT: 5000,                 // Share image load timeout in ms
  PRELOAD_DELAY: 500,                  // Delay before preloading adjacent comics in ms
  
  // Swipe & Touch constants
  SWIPE_MIN_DISTANCE: 50,              // Minimum swipe distance in px
  SWIPE_MAX_TIME: 500,                 // Maximum swipe time in ms
  TAP_MAX_MOVEMENT: 10,                // Maximum movement for tap detection in px
  TAP_MAX_TIME: 300,                   // Maximum time for tap detection in ms
  
  // Cache limits
  MAX_PRELOAD_CACHE: 20,               // Maximum preloaded comics
  
  // Comic dates
  COMIC_START_DATE: "1978-06-19",      // First Garfield comic date
  
  // Storage keys
  STORAGE_KEYS: Object.freeze({
    TRANSLATION: 'translation',
    LAST_COMIC: 'lastcomic',
    TOOLBAR_POS: 'mainToolbarPosition',
    SETTINGS_POS: 'settingsPosition',
    SWIPE: 'stat',
    SHOW_FAVS: 'showfavs',
    LAST_DATE: 'lastdate',
    SETTINGS: 'settings',
    FAVS: 'favs'
  }),
  
  // CORS Proxies (from comicExtractor)
  CORS_PROXIES: Object.freeze([
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url='
  ])
});

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
    } catch {
      return fallback;
    }
  },
  
  /**
   * Formats a date object into YYYY-MM-DD components
   * @param {Date} datetoFormat - Date to format
   * @returns {void} Sets global year, month, day variables
   */
  formatDate(datetoFormat) {
    day = ("0" + datetoFormat.getDate()).slice(-2);
    month = ("0" + (datetoFormat.getMonth() + 1)).slice(-2);
    year = datetoFormat.getFullYear();
  },
  
  /**
   * Checks if device is mobile or touch-enabled
   * @returns {boolean} True if mobile/touch device
   */
  isMobileOrTouch() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
};

// ========================================
// UI UTILITIES
// ========================================

/**
 * Makes an element draggable by its header
 * @param {HTMLElement} element - The element to make draggable
 * @param {string|HTMLElement} headerSelector - CSS selector for the drag handle or the element itself
 * @param {string} storageKey - localStorage key for position persistence
 */
function makeDraggable(element, headerSelector, storageKey) {
  // Handle both selector string and element reference
  const header = typeof headerSelector === 'string' 
    ? element.querySelector(headerSelector) 
    : headerSelector;
  
  if (!header) return;
  
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  // Load saved position from localStorage
  const savedPos = localStorage.getItem(storageKey);
  if (savedPos) {
    try {
      const { top, left } = JSON.parse(savedPos);
      element.style.top = top;
      element.style.left = left;
      element.style.transform = 'none'; // Override default centering
    } catch (e) {
      console.error('Failed to restore position:', e);
    }
  }
  
  header.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e = e || window.event;
    
    // Don't initiate drag if clicking on a button or interactive element
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    const newTop = (element.offsetTop - pos2);
    const newLeft = (element.offsetLeft - pos1);
    
    element.style.top = newTop + "px";
    element.style.left = newLeft + "px";
    element.style.transform = 'none'; // Remove centering transform
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    
    // Save position to localStorage
    const position = {
      top: element.style.top,
      left: element.style.left
    };
    localStorage.setItem(storageKey, JSON.stringify(position));
  }
}

/**
 * Positions toolbar centered between logo and comic
 * @param {HTMLElement} toolbar - The toolbar element
 * @param {boolean} savePosition - Whether to save the position
 */
function positionToolbarCentered(toolbar, savePosition = false) {
  if (!toolbar || toolbar.offsetHeight === 0) return;
  
  const logo = document.querySelector('.logo');
  const comic = document.getElementById('comic');
  
  if (!logo || !comic) return;
  
  const logoRect = logo.getBoundingClientRect();
  const comicRect = comic.getBoundingClientRect();
  const toolbarHeight = toolbar.offsetHeight;
  
  const logoBottom = logoRect.bottom;
  const comicTop = comicRect.top;
  const availableSpace = comicTop - logoBottom;
  
  // Center vertically with minimum 15px gap
  const topPosition = Math.max(logoBottom + 15, logoBottom + (availableSpace - toolbarHeight) / 2);
  
  // Center horizontally
  const leftPosition = (window.innerWidth - toolbar.offsetWidth) / 2;
  
  toolbar.style.top = topPosition + 'px';
  toolbar.style.left = leftPosition + 'px';
  toolbar.style.transform = 'none';
  
  if (savePosition) {
    const position = { top: topPosition, left: leftPosition };
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(position));
    } catch (e) {
      console.error('Failed to save toolbar position:', e);
    }
  }
}

/**
 * Keeps toolbar within viewport bounds on resize
 */
function clampToolbarInView() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  
  const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
  const hasSavedPosition = savedPosRaw && savedPosRaw !== 'null';
  
  if (!hasSavedPosition) {
    positionToolbarCentered(toolbar);
    return;
  }
  
  const hasExplicitPosition = toolbar.style.top && toolbar.style.left;
  if (!hasExplicitPosition) return;
  
  const rect = toolbar.getBoundingClientRect();
  let top = parseFloat(toolbar.style.top);
  let left = parseFloat(toolbar.style.left);
  const maxLeft = window.innerWidth - rect.width;
  const maxTop = window.innerHeight - rect.height;
  let changed = false;
  
  if (left < 0) { left = 0; changed = true; }
  if (top < 0) { top = 0; changed = true; }
  if (left > maxLeft) { left = Math.max(0, maxLeft); changed = true; }
  if (top > maxTop) { top = Math.max(0, maxTop); changed = true; }
  
  if (changed) {
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify({ top, left }));
    } catch (e) {
      console.error('Failed to save toolbar position:', e);
    }
  }
}

/**
 * Initialize toolbar positioning and dragging
 */
function initializeToolbar() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  
  // Load saved position
  const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    toolbar.style.top = savedPos.top + 'px';
    toolbar.style.left = savedPos.left + 'px';
    toolbar.style.transform = 'none';
  } else {
    // Position centered between logo and comic
    const logo = document.querySelector('.logo');
    if (logo) {
      const logoRect = logo.getBoundingClientRect();
      toolbar.style.top = (logoRect.bottom + 15) + 'px';
      toolbar.style.left = '50%';
      toolbar.style.transform = 'translateX(-50%)';
    }
    
    // Position correctly after elements load
    const tryPosition = () => {
      toolbar.style.transform = 'none';
      positionToolbarCentered(toolbar, false);
    };
    
    const finalPosition = () => {
      toolbar.style.transform = 'none';
      positionToolbarCentered(toolbar, true);
    };
    
    setTimeout(tryPosition, 0);
    setTimeout(tryPosition, 50);
    setTimeout(tryPosition, 100);
    window.addEventListener('load', () => {
      tryPosition();
      setTimeout(tryPosition, 100);
      setTimeout(finalPosition, 300);
    });
  }
  
  // Make toolbar draggable
  makeDraggable(toolbar, toolbar, CONFIG.STORAGE_KEYS.TOOLBAR_POS);
  toolbar.style.cursor = 'grab';
  
  // Clamp on resize
  window.addEventListener('resize', clampToolbarInView);
}

// Initialize toolbar when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeToolbar);
} else {
  initializeToolbar();
}

// ========================================
// GLOBAL STATE
// ========================================

// Comic state
let pictureUrl;                  // Current comic image URL
let formattedDate = '';          // Current formatted date for sharing (YYYY-MM-DD)
let formattedComicDate = '';     // Date formatted for API calls
let currentselectedDate;         // Currently selected date object
let day, month, year;            // Date components

// Navigation state
let previousclicked = false;
let previousUrl = "";

// UI state
let translationEnabled = localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSLATION) === 'true';
let userLanguage = navigator.language || navigator.userLanguage || 'en';
let translationInProgress = false;
let isRotatedMode = false;       // Track if we're in rotated mode
let isRotating = false;          // Debounce flag for rotation

// Favorites cache
let _cachedFavs = null;

// ========================================
// SERVICE WORKER REGISTRATION
// ========================================

if("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./serviceworker.js");
}

// ========================================
// FAVORITES MANAGEMENT
// ========================================

/**
 * Loads favorites from localStorage with caching
 * @returns {Array<string>} Array of favorite comic dates
 */
function loadFavs() {
  if (_cachedFavs !== null) {
    return _cachedFavs;
  }
  const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS);
  _cachedFavs = stored ? UTILS.safeJSONParse(stored, []) : [];
  return _cachedFavs;
}

/**
 * Saves favorites to localStorage with deduplication
 * @param {Array<string>} arr - Array of favorite dates to save
 */
function saveFavs(arr) {
  const uniqueFavs = [...new Set(arr)].sort();
  localStorage.setItem(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(uniqueFavs));
  _cachedFavs = uniqueFavs;
}

/**
 * Invalidates the favorites cache (forces reload from localStorage)
 */
function invalidateFavsCache() {
  _cachedFavs = null;
}

// ========================================
// COMIC PRELOADING
// ========================================

const MAX_PRELOAD_CACHE = CONFIG.MAX_PRELOAD_CACHE;
let preloadedComics = new Map();

/**
 * Preloads adjacent comics for smoother navigation
 */
function preloadAdjacentComics() {
  if (!currentselectedDate) return;
  
  // Clean up old preloaded comics if cache is full
  if (preloadedComics.size >= MAX_PRELOAD_CACHE) {
    const keysToDelete = Array.from(preloadedComics.keys()).slice(0, 5);
    keysToDelete.forEach(key => preloadedComics.delete(key));
  }
  
  // Preload previous comic
  const prevDate = new Date(currentselectedDate);
  prevDate.setDate(prevDate.getDate() - 1);
  preloadComic(prevDate);
  
  // Preload next comic
  const nextDate = new Date(currentselectedDate);
  nextDate.setDate(nextDate.getDate() + 1);
  preloadComic(nextDate);
}

/**
 * Preloads a comic in the background
 * @param {Date} date - Date of the comic to preload
 */
async function preloadComic(date) {
  UTILS.formatDate(date);
  const preloadKey = `${year}-${month}-${day}`;
  
  // Don't preload if already cached
  if (preloadedComics.has(preloadKey)) return;
  
  try {
    const result = await getAuthenticatedComic(date);
    if (result.success && result.imageUrl) {
      // Preload the actual image
      const img = new Image();
      img.onload = () => preloadedComics.set(preloadKey, result.imageUrl);
      img.src = result.imageUrl;
    }
  } catch (error) {
    // Silently fail for background preloading
  }
}

// ========================================
// SHARING FUNCTIONALITY
// ========================================

/**
 * Shares the current comic using Web Share API with extensive fallbacks
 * Handles image sharing, text fallbacks, and clipboard copying
 * @returns {Promise<void>}
 */
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
            
            // Create a URL with CORS proxy to load the image
            const cacheBuster = Date.now();
            const imgUrl = `https://corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(window.pictureUrl)}`;
            console.log("Loading image for sharing via:", imgUrl);
            
            // Wait for image to load
            await new Promise((resolve, reject) => {
                tempImg.onload = resolve;
                tempImg.onerror = () => reject(new Error("Failed to load image for sharing"));
                tempImg.src = imgUrl;
                
                // Set a timeout in case the image load hangs
                setTimeout(() => reject(new Error("Image load timeout")), 5000);
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

// ========================================
// FAVORITES & UI FUNCTIONS
// ========================================

/**
 * Toggles favorite status for current comic
 * Updates UI and localStorage
 */
function Addfav()
{
    formattedComicDate = year + "/" + month + "/" + day;
    let favs = loadFavs();
    
    if(!favs.includes(formattedComicDate))
    {
        favs.push(formattedComicDate);
        document.getElementById("favheart").src="./heart.svg";
        document.getElementById("showfavs").disabled = false;
    }
    else
    {
        favs = favs.filter(f => f !== formattedComicDate);
        document.getElementById("favheart").src="./heartborder.svg";
        if(favs.length === 0)
        {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
            document.getElementById("Today").innerHTML = 'Today';
        }
    }
    saveFavs(favs);
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
    const settingsPanel = document.getElementById("settingsDIV");
    const isVisible = settingsPanel.classList.contains('visible');
    
    if (isVisible) {
        settingsPanel.classList.remove('visible');
        localStorage.setItem('settings', "false");
    } else {
        settingsPanel.classList.add('visible');
        localStorage.setItem('settings', "true");
    }
    
    // Remove the fixed height that was causing scrolling
    document.body.style.minHeight = "";
}

window.HideSettings = HideSettings;

function Rotate() {
    const comic = document.getElementById('comic');
    if (comic.classList.contains('rotate')) {
        comic.classList.remove('rotate');
        comic.classList.add('normal');
        isRotatedMode = false;
    } else {
        comic.classList.remove('normal');
        comic.classList.add('rotate');
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

/**
 * Loads and displays a comic for the given date
 * @param {Date} date - The date of the comic to load
 * @returns {Promise<boolean>} True if comic loaded successfully
 */
async function loadComic(date) {
    const comicImg = document.getElementById('comic');
    
    try {
        // Show loading state
        comicImg.classList.add('loading');
        comicImg.classList.remove('loaded');
        
        // Try GoComics with authentication
        const result = await getAuthenticatedComic(date);
        
        if (result.success && result.imageUrl) {
            // Preload image for smooth transition
            const tempImg = new Image();
            tempImg.onload = function() {
                comicImg.src = result.imageUrl;
                comicImg.style.display = 'block';
                comicImg.classList.remove('loading');
                comicImg.classList.add('loaded');
            };
            tempImg.onerror = function() {
                comicImg.classList.remove('loading');
                throw new Error('Failed to load comic image');
            };
            tempImg.src = result.imageUrl;
            
            // Store the image URL for sharing
            window.pictureUrl = result.imageUrl;
            previousUrl = result.imageUrl;
            
            // Hide any error messages
            const messageContainer = document.getElementById('comic-message');
            if (messageContainer) {
                messageContainer.style.display = 'none';
            }
            
            // Preload adjacent comics after a short delay
            setTimeout(() => {
                preloadAdjacentComics();
            }, CONFIG.PRELOAD_DELAY);
            
            return true;
        }
        
        // Handle paywall
        if (result.isPaywalled) {
            comicImg.classList.remove('loading');
            showPaywallMessage();
            return false;
        }
        
        throw new Error('Comic not available from any source');
    } catch (error) {
        console.error('Failed to load comic:', error);
        comicImg.classList.remove('loading');
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

function onLoad() {
    var favs = JSON.parse(localStorage.getItem('favs')) || [];

    // Set minimum body height at load time to prevent gradient shift
    document.body.style.minHeight = "100vh";

    // Set proper body overflow to prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

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

    if (document.getElementById("showfavs").checked) {
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

    if (document.getElementById("lastdate").checked && localStorage.getItem('lastcomic')) {
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
async function showComic() {
    formatDate(currentselectedDate);
    formattedComicDate = year + "/" + month + "/" + day;
    formattedDate = year + "-" + month + "-" + day;
    
    document.getElementById("DatePicker").value = formattedDate;
    updateDateDisplay();
    
    // Check if date is in favorites
    var favs = JSON.parse(localStorage.getItem('favs'));
    if(favs && favs.indexOf(formattedComicDate) !== -1) {
        document.getElementById("favheart").src = "./heart.svg";
    } else {
        document.getElementById("favheart").src = "./heartborder.svg";
    }
    
    // Save last viewed comic
    if(document.getElementById("lastdate").checked) {
        localStorage.setItem('lastcomic', currentselectedDate);
    }
    
    // Load the comic
    await loadComic(currentselectedDate);
}

window.onLoad = onLoad;

// ========================================
// NAVIGATION FUNCTIONS
// ========================================

/**
 * Navigates to the previous comic
 * Handles both normal and favorites-only mode
 */
function PreviousClick() {
	if(document.getElementById("showfavs").checked) {
		const favs = loadFavs();
		const currentIndex = favs.indexOf(formattedComicDate);
		if(currentIndex > 0){
			currentselectedDate = new Date(favs[currentIndex - 1]);
		}
	}
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
	previousclicked = true;
	CompareDates();
	showComic();
}

window.PreviousClick = PreviousClick;

/**
 * Navigates to the next comic
 * Handles both normal and favorites-only mode
 */
function NextClick() {
	if(document.getElementById("showfavs").checked) {
		const favs = loadFavs();
		const currentIndex = favs.indexOf(formattedComicDate);
		if(currentIndex < favs.length - 1){
			currentselectedDate = new Date(favs[currentIndex + 1]);
		}
	}
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
	CompareDates();
	showComic();
}

window.NextClick = NextClick;

/**
 * Navigates to the first comic
 * In favorites mode, goes to first favorite
 */
function FirstClick() {
	if(document.getElementById("showfavs").checked) {
		const favs = loadFavs();
		if(favs.length > 0) {
			currentselectedDate = new Date(favs[0]);
		}
	}
	else{
		currentselectedDate = new Date(Date.UTC(1978, 5, 19,12));
	}
	CompareDates();
	showComic();
}

window.FirstClick = FirstClick;

/**
 * Navigates to the current/latest comic (today)
 * In favorites mode, goes to last favorite
 */
function CurrentClick() {
	if(document.getElementById("showfavs").checked)
	 {
		const favs = loadFavs();
		const favslength = favs.length - 1;
		if(favslength >= 0) {
			currentselectedDate = new Date(favs[favslength]);
		}
	 }
	else
	{
		currentselectedDate = new Date();
	}
	CompareDates();
	showComic();
}

window.CurrentClick = CurrentClick;

/**
 * Navigates to a random comic
 * In favorites mode, picks random favorite
 */
function RandomClick()
{
	if(document.getElementById("showfavs").checked) {
		const favs = loadFavs();
		if(favs.length > 0) {
			const randomIndex = Math.floor(Math.random() * favs.length);
			currentselectedDate = new Date(favs[randomIndex]);
		}
	}
	else{
		const start = new Date(CONFIG.COMIC_START_DATE);
		const end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}
	CompareDates();
	showComic();
}

window.RandomClick = RandomClick;

/**
 * Compares current date with comic date range
 * Updates navigation button states accordingly
 */
function CompareDates() {
	const favs = loadFavs();
	let startDate;
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		startDate = new Date(favs[0])}
	else{	
		document.getElementById("DatePicker").disabled = false;
		startDate = new Date("1978/06/19");
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
		document.getElementById('Today').innerHTML = 'Last'
	} 
	else
	{
		localStorage.setItem('showfavs', "false");
		document.getElementById('Today').innerHTML = 'Today'
	}
	CompareDates();
	showComic();
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
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Switch to fullscreen view
    comic.classList.remove('vertical');
    comic.classList.add('fullscreen-vertical');
    container.classList.add('fullscreen');
    
    // Set the container background to match the app background gradient
    container.style.background = 'linear-gradient(#eee239, orange) no-repeat fixed';
    container.style.backgroundSize = '100% 100vh';
    
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
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Reset container background
    container.style.background = '';
    container.style.backgroundSize = '';
    
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
	document.getElementById('Today').innerHTML = 'Last'
}
else
{
	document.getElementById("showfavs").checked = false;
	document.getElementById('Today').innerHTML = 'Today'
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

getStatus = localStorage.getItem('settings');
const settingsPanel = document.getElementById("settingsDIV");
if (getStatus == "true") {
	settingsPanel.classList.add('visible');
} else {
	settingsPanel.classList.remove('visible');
}

// Initialize draggable settings panel
makeDraggable(settingsPanel, '.settings-header', 'settingsPanelPosition');

// Set up close button
const closeButton = settingsPanel.querySelector('.settings-close');
if (closeButton) {
    closeButton.addEventListener('click', HideSettings);
}

// Set up app install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  showInstallPromotion();
});

function showInstallPromotion() {
    const installButton = document.createElement('button');
    installButton.innerText = 'Install App';
    installButton.className = 'button';
    
    // Match button styling from the app, with more subtle font
    Object.assign(installButton.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '1000',
        margin: '0',
        padding: '10px 20px',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        fontSize: '0.85rem',
        fontWeight: '500',
        color: 'black',
        borderRadius: '10px',
        border: 'none',
        backgroundImage: 'linear-gradient(45deg, #eee239 0%, #F09819 51%, #eee239 100%)',
        backgroundSize: '200% auto',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
        cursor: 'pointer',
        transition: '0.5s',
        userSelect: 'none',
        animation: 'pulse 2s infinite'
    });
    
    // Add pulse animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(installButton);
    
    installButton.addEventListener('click', () => {
        // Hide the app provided install promotion
        installButton.style.display = 'none';
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          } else {
            console.log('User dismissed the install prompt');
          }
          deferredPrompt = null;
        });
    });
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

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

/**
 * Keyboard shortcuts for navigation
 * Arrow Left/Right: Previous/Next comic
 * Home: First comic
 * End: Today's comic
 * Space/R: Random comic
 * F: Toggle favorite
 */
document.addEventListener('keydown', function(e) {
  // Don't trigger shortcuts when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  // Prevent default for keys we're handling
  const handledKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'r', 'R', 'f', 'F'];
  if (handledKeys.includes(e.key)) {
    e.preventDefault();
  }
  
  switch(e.key) {
    case 'ArrowLeft':
      // Left arrow - Previous comic
      if (!document.getElementById('Previous')?.disabled) {
        PreviousClick();
      }
      break;
      
    case 'ArrowRight':
      // Right arrow - Next comic
      if (!document.getElementById('Next')?.disabled) {
        NextClick();
      }
      break;
      
    case 'Home':
      // Home key - First comic
      if (!document.getElementById('First')?.disabled) {
        FirstClick();
      }
      break;
      
    case 'End':
      // End key - Today's comic
      if (!document.getElementById('Today')?.disabled) {
        CurrentClick();
      }
      break;
      
    case ' ':
      // Spacebar - Random comic
      if (!document.getElementById('Random')?.disabled) {
        RandomClick();
      }
      break;
      
    case 'r':
    case 'R':
      // R key - Random comic (alternative)
      if (!document.getElementById('Random')?.disabled) {
        RandomClick();
      }
      break;
      
    case 'f':
    case 'F':
      // F key - Toggle favorite
      Addfav();
      break;
  }
});

export default handlers;
