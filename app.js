import { translations } from './translations.js';
import { shareComic } from './sharing.js';
import { getAuthenticatedComic } from './comicExtractor.js';
import { normalizeFavoriteDate, normalizeFavorites } from './favorites.js';
import {
    loadComicImage,
    animateComicTransition,
    animateRotatedComicTransition
} from './comicPresentation.js';
import {
    initializeToolbar,
    initializeDraggableSettings,
    refreshToolbarDefaultPosition
} from './toolbarLayout.js';
import {
    configureRotation,
    isRotatedViewActive,
    isVerticalComicModeActive,
    isVerticalFullscreenActive,
    initializeMobileButtonStates,
    Rotate,
    scheduleRotatedComicResize,
    checkImageOrientation
} from './rotation.js';
import {
    configureShuffle,
    hasShuffleBackHistory,
    hasShuffleForwardHistory,
    isShuffleEnabled,
    updateToolbarModeControls,
    setDatePickerDisabled,
    resetShuffleSession,
    pickShuffleCandidates,
    RandomNewerClick,
    RandomOlderClick,
    _jumpToFirstShuffle,
    _jumpToLastShuffle
} from './shuffle.js';
import {
    configureTopFavorites,
    isTop10ModeActive,
    stepTop10BrowseIndex,
    canSwipeTop10,
    syncTop10NavigationControls,
    getFocusableElements,
    trapFocusWithin,
    setTop10EntryCount,
    showTop10Modal,
    closeTop10Modal,
    exitTop10Mode,
    initTop10Modal
} from './topFavorites.js';

// ========================================
// CONFIGURATION & CONSTANTS
// ========================================

/**
 * Application Configuration
 * Central location for all magic numbers and configuration values
 */
const CONFIG = Object.freeze({
    // Swipe & touch detection
    SWIPE_MIN_DISTANCE: 50,               // Minimum swipe distance in px
    SWIPE_MAX_TIME: 500,                  // Maximum swipe time in ms
    SWIPE_CLICK_DEBOUNCE_MS: 300,         // Ignore clicks for this long after a swipe
    TAP_MAX_MOVEMENT: 10,                 // Maximum movement for tap detection in px
    TAP_MAX_TIME: 300,                    // Maximum time for tap detection in ms

    // Comic dates
    GARFIELD_START_EN: '1978-06-19',      // First English Garfield comic
    GARFIELD_START_ES: '1999-12-06',      // First Spanish Garfield comic

    // Favorites leaderboard API
    FAVORITES_API_URL: 'https://favorites-api.garfieldapp.workers.dev',
    FAVORITES_API_TIMEOUT_MS: 12000,
    FAVORITES_MIGRATION_VERSION: 'google-only-v1',
    FAVORITES_MIGRATION_BATCH_SIZE: 500,

    PREFETCH_ADJACENT_DAYS: 2,            // Days to warm on each side for swipe navigation
    PREFETCH_SHUFFLE_QUEUE_SIZE: 3,        // Random comics to warm ahead in Shuffle mode
    PREFETCH_STAGGER_MS: 150,              // Delay between background prefetch requests
    SHUFFLE_HISTORY_MAX: 200,              // Bound on shuffle back/forward history depth

    // Storage keys
    STORAGE_KEYS: Object.freeze({
        FAVS: 'favs',
        LAST_COMIC: 'lastcomic',
        SWIPE: 'stat',
        SHUFFLE: 'shuffle',
        SHOW_FAVS: 'showfavs',
        LAST_DATE: 'lastdate',
        SPANISH: 'spanish',
        SOURCE: 'comicSource',
        DARK_MODE: 'darkmode',
        SETTINGS: 'settings',
        TOOLBAR_POS: 'toolbarPosition',
        TOOLBAR_OPTIMAL: 'toolbarOptimal',
        FAVS_MIGRATED: 'favsMigrated',
        FAVS_MIGRATED_DATES: 'favsMigratedDates',
        FAVS_MIGRATION_VERSION: 'favsMigrationVersion',
        OFFLINE_COMICS: 'offlineComics'
    })
});

const THEME_COLORS = Object.freeze({
    LIGHT: '#fff7bd',
    DARK: '#14110d'
});

const DARK_MODE_ICONS = Object.freeze({
    MOON: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
    SUN: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"></line><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"></line></svg>'
});

function getPreferredDarkMode() {
    const storedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.DARK_MODE);
    if (storedTheme !== null) return storedTheme === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
}

function updateThemeColor(isDark) {
    const themeColor = isDark ? THEME_COLORS.DARK : THEME_COLORS.LIGHT;
    document.querySelectorAll('meta[name="theme-color"], meta[name="msapplication-TileColor"]').forEach(meta => {
        meta.setAttribute('content', themeColor);
    });
}

function applyDarkMode(isDark) {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    updateThemeColor(isDark);
}

function setDarkModeControlState(control, isDark) {
    if (!control) return;
    if ('checked' in control) control.checked = isDark;
    control.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    control.innerHTML = isDark ? DARK_MODE_ICONS.SUN : DARK_MODE_ICONS.MOON;
}

function getDarkModeControlState(control) {
    if (!control) return false;
    if ('checked' in control) return control.checked;
    return control.getAttribute('aria-pressed') === 'true';
}

function initializeDarkMode() {
    const darkModeControl = document.getElementById('darkmode');
    if (!darkModeControl) return;

    const useDarkMode = getPreferredDarkMode();
    setDarkModeControlState(darkModeControl, useDarkMode);
    applyDarkMode(useDarkMode);

    const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    colorSchemeQuery?.addEventListener?.('change', event => {
        if (localStorage.getItem(CONFIG.STORAGE_KEYS.DARK_MODE) !== null) return;
        setDarkModeControlState(darkModeControl, event.matches);
        applyDarkMode(event.matches);
    });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Utility Functions
 */
const UTILS = {
    /**
     * Create a local Date for a calendar day, anchored at noon to avoid DST/midnight edges.
     * @param {number} yearValue
     * @param {number} monthValue 1-based month
     * @param {number} dayValue
     * @returns {Date}
     */
    createLocalDate(yearValue, monthValue, dayValue) {
        return new Date(yearValue, monthValue - 1, dayValue, 12, 0, 0, 0);
    },

    /**
     * Parse a YYYY-MM-DD date string as a local calendar day.
     * @param {string} dateString
     * @returns {Date}
     */
    dateFromISODateString(dateString) {
        const [yearValue, monthValue, dayValue] = dateString.split('-').map(Number);
        return this.createLocalDate(yearValue, monthValue, dayValue);
    },

    /**
     * Parse a YYYY/MM/DD favorite date string as a local calendar day.
     * @param {string} dateString
     * @returns {Date}
     */
    dateFromFavoriteDateString(dateString) {
        const [yearValue, monthValue, dayValue] = dateString.split('/').map(Number);
        return this.createLocalDate(yearValue, monthValue, dayValue);
    },

    dateToISODateString(date) {
        const yearValue = date.getFullYear();
        const monthValue = String(date.getMonth() + 1).padStart(2, '0');
        const dayValue = String(date.getDate()).padStart(2, '0');
        return `${yearValue}-${monthValue}-${dayValue}`;
    },

    /**
     * Get the current calendar parts in US Eastern Time.
     * @returns {{year: number, month: number, day: number}}
     */
    getEasternDateParts() {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());

        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return {
            year: Number(values.year),
            month: Number(values.month),
            day: Number(values.day)
        };
    },

    /**
     * Get current date in US Eastern Time (where GoComics releases comics)
     * @returns {Date} Current date adjusted to Eastern Time
     */
    getEasternDate() {
        const { year, month, day } = this.getEasternDateParts();
        return this.createLocalDate(year, month, day);
    },

    /**
     * Get today's date string in Eastern Time (YYYY-MM-DD format)
     * @returns {string} Today's date in ET as YYYY-MM-DD
     */
    getEasternTodayString() {
        const parts = this.getEasternDateParts();
        return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    },

    /**
     * Safely parses JSON with fallback
     * @param {string} str - JSON string to parse
     * @param {*} fallback - Fallback value if parse fails
     * @returns {*} Parsed value or fallback
     */
    safeJSONParse(str, fallback) {
        if (str === null || str === undefined) {
            return fallback;
        }
        try {
            const parsed = JSON.parse(str);
            return parsed !== null ? parsed : fallback;
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
    },

    /**
     * Check if the currently displayed date is today's date (Eastern Time)
     * Uses Eastern Time since that's when GoComics releases new comics
     * @returns {boolean} True if displayed date matches today in ET
     */
    isDisplayedDateToday() {
        const parts = this.getEasternDateParts();
        const todayStr = `${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`;
        return formattedComicDate === todayStr;
    },

    /**
     * Get favorites array from localStorage
     * @returns {Array} Array of favorite dates or empty array
     */
    getFavorites() {
        return normalizeFavorites(this.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS), []));
    },

    getOfflineComics(language) {
        const comics = this.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.OFFLINE_COMICS), []);
        if (!Array.isArray(comics)) return [];
        return comics
            .filter(comic => comic?.date && comic?.imageUrl && (!language || comic.language === language))
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    rememberOfflineComic(date, language, imageUrl) {
        const dateString = typeof date === 'string' ? date : this.dateToISODateString(date);
        const comics = this.getOfflineComics();
        const remaining = comics.filter(comic => !(comic.date === dateString && comic.language === language));
        remaining.push({ date: dateString, language, imageUrl, cachedAt: Date.now() });
        remaining.sort((a, b) => b.cachedAt - a.cachedAt);
        localStorage.setItem(CONFIG.STORAGE_KEYS.OFFLINE_COMICS, JSON.stringify(remaining.slice(0, 50)));
    },

    async reconcileOfflineComics() {
        if (typeof caches === 'undefined') return;
        const comics = this.getOfflineComics();
        const resident = await Promise.all(comics.map(async comic => {
            try { return await caches.match(comic.imageUrl) ? comic : null; }
            catch (_) { return null; }
        }));
        localStorage.setItem(CONFIG.STORAGE_KEYS.OFFLINE_COMICS, JSON.stringify(resident.filter(Boolean)));
    },

    async cacheDisplayedComic(imageUrl) {
        if (!navigator.serviceWorker || typeof MessageChannel !== 'function') return false;
        return new Promise(resolve => {
            const channel = new MessageChannel();
            const finish = cached => {
                clearTimeout(timer);
                channel.port1.close();
                resolve(cached);
            };
            const timer = setTimeout(() => finish(false), 8000);
            channel.port1.onmessage = event => finish(event.data?.cached === true);
            navigator.serviceWorker.ready.then(registration => {
                registration.active?.postMessage({ type: 'CACHE_COMIC', url: imageUrl }, [channel.port2]);
            }).catch(() => finish(false));
        });
    },

    getOfflineComic(date, language, direction = null) {
        const dateString = typeof date === 'string' ? date : this.dateToISODateString(date);
        const comics = this.getOfflineComics(language);
        let comic = comics.find(entry => entry.date === dateString);

        if (!comic && direction === 'previous') {
            comic = [...comics].reverse().find(entry => entry.date < dateString);
        } else if (!comic && direction === 'next') {
            comic = comics.find(entry => entry.date > dateString);
        } else if (!comic && !direction) {
            comic = comics.at(-1);
        }

        if (comic) {
            return {
                success: true,
                imageUrl: comic.imageUrl,
                actualDate: this.dateFromISODateString(comic.date),
                isOffline: true
            };
        }

        if (comics.length === 0) {
            return {
                success: true,
                imageUrl: './garfield-first.gif',
                actualDate: this.dateFromISODateString(CONFIG.GARFIELD_START_EN),
                isOffline: true
            };
        }

        return { success: false, imageUrl: null, isOffline: true };
    },

    /**
     * Check if Spanish mode is enabled
     * @returns {boolean} True if Spanish checkbox is checked
     */
    isSpanishMode() {
        return document.getElementById('spanish')?.checked || false;
    },

    /**
     * Build a simple `<div class="...">text</div>` node.
     * Text is assigned via `textContent`, so it is safe for translated or
     * remotely-influenced strings.
     * @param {string} className
     * @param {string} text
     * @returns {HTMLDivElement}
     */
    createMessageDiv(className, text) {
        const div = document.createElement('div');
        div.className = className;
        div.textContent = text;
        return div;
    },

    /**
     * Get the preferred comic source setting
     * @returns {'gocomics'|'fandom'|'uclick'} Preferred source
     */
    getPreferredSource() {
        const src = document.getElementById('comicSource')?.value;
        if (src === 'fandom') return 'fandom';
        if (src === 'uclick') return 'uclick';
        return 'gocomics';
    },

    /**
     * Check if shuffle can navigate in the requested direction
        * @param {'next'|'previous'|'first'|'last'} direction - Shuffle direction
     * @returns {boolean} True if shuffle navigation is available
     */
    canShuffleNavigate(direction = 'next') {
        if (direction === 'previous' || direction === 'first') {
            return hasShuffleBackHistory();
        }

        if (direction === 'last') {
            return hasShuffleForwardHistory();
        }

        if (hasShuffleForwardHistory()) return true;

        const showFavs = document.getElementById('showfavs')?.checked || false;
        if (showFavs) {
            const favs = this.getFavorites();
            return favs.some(date => date !== formattedComicDate);
        }

        const start = this.dateFromISODateString(this.isSpanishMode() ? CONFIG.GARFIELD_START_ES : CONFIG.GARFIELD_START_EN);
        start.setHours(0, 0, 0, 0);
        const end = this.getEasternDate();
        end.setHours(0, 0, 0, 0);
        return end.getTime() > start.getTime();
    },

    /**
     * Check if navigation is allowed in a given direction
     * @param {string} direction - 'next' or 'previous'
     * @returns {boolean} True if navigation is allowed
     */
    canNavigate(direction) {
        const favs = this.getFavorites();
        const showFavs = document.getElementById('showfavs')?.checked || false;

        // Get current date for comparison
        const current = new Date(currentselectedDate);
        current.setHours(0, 0, 0, 0);

        if (direction === 'previous') {
            if (showFavs) {
                // In favorites mode, check if we're at the first favorite
                if (favs.length === 0) return false;
                const firstFav = this.dateFromFavoriteDateString(favs[0]);
                firstFav.setHours(0, 0, 0, 0);
                return current.getTime() > firstFav.getTime();
            } else {
                // Normal mode: check if we're at the first comic date
                const startDate = this.dateFromISODateString(this.isSpanishMode() ? CONFIG.GARFIELD_START_ES : CONFIG.GARFIELD_START_EN);
                startDate.setHours(0, 0, 0, 0);
                return current.getTime() > startDate.getTime();
            }
        } else if (direction === 'next') {
            if (showFavs) {
                // In favorites mode, check if we're at the last favorite
                if (favs.length === 0) return false;
                const lastFav = this.dateFromFavoriteDateString(favs[favs.length - 1]);
                lastFav.setHours(0, 0, 0, 0);
                return current.getTime() < lastFav.getTime();
            } else {
                // Normal mode: check if we're at today's date (Eastern Time)
                // Use Eastern Time since comics are released based on ET
                const today = this.getEasternDate();
                today.setHours(0, 0, 0, 0);
                return current.getTime() < today.getTime();
            }
        }
        return false;
    },

    /**
     * Get or create message container element
     * @param {string} className - CSS class for the container
     * @returns {HTMLElement} The message container element
     */
    getOrCreateMessageContainer(className) {
        const comicContainer = document.getElementById('comic-container');
        const comic = document.getElementById('comic');

        comic.style.display = 'none';

        let messageContainer = document.getElementById('comic-message');
        if (!messageContainer) {
            messageContainer = document.createElement('div');
            messageContainer.id = 'comic-message';
            comicContainer.appendChild(messageContainer);
        }

        messageContainer.className = className;
        messageContainer.style.display = 'flex';
        return messageContainer;
    },

    /**
     * Check if connection is fast enough for prefetching
     * Uses Network Information API when available, falls back to conservative default
     * @returns {boolean} True if prefetching should be allowed
     */
    shouldPrefetch() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection) return true; // API unavailable, allow prefetch by default

        // Disable prefetch on save-data mode
        if (connection.saveData) return false;

        // Disable prefetch on slow connections (slow-2g, 2g)
        const dominated = ['slow-2g', '2g'];
        if (connection.effectiveType && dominated.includes(connection.effectiveType)) return false;

        // Disable prefetch when downlink is very low (< 0.5 Mbps)
        if (typeof connection.downlink === 'number' && connection.downlink < 0.5) return false;

        return true;
    },

    /**
     * Preload adjacent comic images for faster navigation
     * Skips prefetching on slow / metered connections
     * @param {Date} currentDate - Current comic date
     */
    preloadAdjacentComics(currentDate) {
        if (!this.shouldPrefetch()) return;
        if (isTop10ModeActive()) return;

        // Shuffle mode: pre-pick and warm-cache random candidates instead of
        // strict ±1 day adjacents.
        if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
            pickShuffleCandidates();
            return;
        }

        const language = this.isSpanishMode() ? 'es' : 'en';
        const source = this.getPreferredSource();
        const startDate = this.dateFromISODateString(this.isSpanishMode() ? CONFIG.GARFIELD_START_ES : CONFIG.GARFIELD_START_EN);
        startDate.setHours(0, 0, 0, 0);
        // Use Eastern Time since comics are released based on ET
        const today = this.getEasternDate();
        today.setHours(0, 0, 0, 0);

        const warmImageCache = (imageUrl) => {
            const image = new Image();
            image.decoding = 'async';
            image.loading = 'eager';
            image.src = imageUrl;
        };

        const preloadDate = (targetDate, offset) => {
            getAuthenticatedComic(targetDate, language, source, {
                silent: true,
                maxSources: 1,
                disableTodayFallback: true
            }).then(result => {
                if (result.success && result.imageUrl) {
                    warmImageCache(result.imageUrl);

                    if (offset !== 1) return;

                    // If GoComics redirected to a date that isn't newer than the
                    // comic currently shown, the next strip isn't published yet.
                    // Normalize both to midnight before comparing — actualDate is
                    // constructed with time=noon while currentDate is at midnight.
                    if (result.actualDate) {
                        const actualDay = new Date(result.actualDate); actualDay.setHours(0,0,0,0);
                        const currentDay = new Date(currentDate); currentDay.setHours(0,0,0,0);
                        if (actualDay <= currentDay) {
                            nextComicUrl = currentComicUrl;
                        } else {
                            nextComicUrl = result.imageUrl;
                        }
                    } else {
                        // Store next comic URL and check for timezone edge case
                        nextComicUrl = result.imageUrl;
                    }
                    this.checkNextComicAvailability();
                } else if (offset === 1 && result.notFound) {
                    // Next comic definitively doesn't exist — disable forward navigation
                    nextComicUrl = currentComicUrl; // Force same-comic detection
                    this.checkNextComicAvailability();
                }
                // else: transient proxy/network failure — leave buttons as-is;
                // CompareDates() is authoritative for navigation boundaries.
            }).catch(() => {
                // On network/proxy error, leave navigation buttons as-is;
                // don't penalise the user for a transient failure.
            });
        };

        const prefetchTasks = [];
        for (let offset = 1; offset <= CONFIG.PREFETCH_ADJACENT_DAYS; offset += 1) {
            const prevDate = new Date(currentDate);
            prevDate.setDate(prevDate.getDate() - offset);
            if (prevDate >= startDate) prefetchTasks.push(() => preloadDate(prevDate, -offset));

            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + offset);
            if (nextDate <= today) prefetchTasks.push(() => preloadDate(nextDate, offset));
            else if (offset === 1) nextComicUrl = "";
        }

        prefetchTasks.forEach((task, index) => {
            setTimeout(task, index * CONFIG.PREFETCH_STAGGER_MS);
        });
    },

    /**
     * Update the favorite heart icon based on current comic date
     */
    updateHeartIcon() {
        const favs = this.getFavorites();
        const heartButton = document.getElementById('favheart');
        const heartSvg = heartButton?.querySelector('svg path');
        const isFavorite = favs.includes(formattedComicDate);
        if (heartButton) {
            heartButton.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
            const t = translations[this.isSpanishMode() ? 'es' : 'en'] || translations.en;
            heartButton.setAttribute('aria-label', isFavorite ? t.removeFromFavorites : t.favorites);
        }
        if (heartSvg) {
            heartSvg.setAttribute('fill', isFavorite ? 'currentColor' : 'none');
        }
    },

    /**
     * Check if next comic is available (different from current)
     * Disables Next/Last buttons if next comic is same as current (timezone edge case)
     */
    checkNextComicAvailability() {
        if (currentComicUrl && nextComicUrl && currentComicUrl === nextComicUrl) {
            // Next comic is same as current - we're at the latest available comic
            document.getElementById("Next").disabled = true;
            document.getElementById("Last").disabled = true;
        }
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
let lastSwipeTime = 0;
let lastComicTapTime = 0;
let lastComicTapX = 0;
let lastComicTapY = 0;
let pendingComicSingleTapTimer = null;
let suppressComicClickUntil = 0;
let isRotatedMode = false;

const COMIC_DOUBLE_TAP_DELAY = 300;
const COMIC_TAP_MAX_MOVEMENT = 24;

/**
 * Wire up Google Drive sync buttons.
 */
function initGoogleSyncUI() {
    const signInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('googleSignOutBtn');

    signInBtn?.addEventListener('click', () => {
        window.googleSignIn?.();
    });
    signOutBtn?.addEventListener('click', () => {
        window.googleSignOut?.();
    });
}

// Track active notification timer so re-invocations cancel the previous one
let _notificationTimeout = null;

/**
 * Show in-app notification toast
 */
function showNotification(message, duration = 5000) {
    const toast = document.getElementById('notificationToast');
    const content = document.getElementById('notificationContent');
    const closeBtn = document.getElementById('notificationClose');

    if (!toast || !content) return;

    // Clear any pending auto-hide from a previous notification
    if (_notificationTimeout) {
        clearTimeout(_notificationTimeout);
        _notificationTimeout = null;
    }

    content.textContent = message;
    toast.classList.add('show');

    // Auto-hide after duration
    _notificationTimeout = setTimeout(() => {
        hideNotification();
        _notificationTimeout = null;
    }, duration);

    // Close button handler
    closeBtn.onclick = () => {
        clearTimeout(_notificationTimeout);
        _notificationTimeout = null;
        hideNotification();
    };
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
        initGoogleSyncUI();
        initTop10Modal();
        window.initGoogleSync?.();
        // Add touch event listeners
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
    });
} else {
    initializeToolbar();
    initializeDraggableSettings();
    initializeMobileButtonStates();
    initGoogleSyncUI();
    initTop10Modal();
    window.initGoogleSync?.();
    // Add touch event listeners
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
}

// Keyboard navigation (arrow keys for prev/next)
document.addEventListener('keydown', function(e) {
    // Don't handle if user is typing in an input, textarea, or contenteditable
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    // Don't handle if rotated/fullscreen mode (has its own handlers)
    if (document.getElementById('comic-overlay')) return;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        PreviousClick();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        NextClick();
    }
});

// Translation dictionaries


// Expose globals needed by googleDriveSync.js (non-module script)
window.showNotification = showNotification;
window.UTILS = UTILS;
window.CONFIG = CONFIG;
window.translations = translations;

window.addEventListener('favorites-changed', (event) => {
    const favorites = getValidFavoriteDates(event.detail?.favorites || UTILS.getFavorites());
    refreshFavoritesDependentUI(favorites);
    if (event.detail?.migrate !== false) {
        migrateExistingFavorites(favorites);
    }
});

window.getSyncPreferences = function getSyncPreferences() {
    return {
        comicSource: getValidComicSource(localStorage.getItem(CONFIG.STORAGE_KEYS.SOURCE)),
        spanish: localStorage.getItem(CONFIG.STORAGE_KEYS.SPANISH) === 'true',
        swipeEnabled: localStorage.getItem(CONFIG.STORAGE_KEYS.SWIPE) !== 'false',
        shuffle: localStorage.getItem(CONFIG.STORAGE_KEYS.SHUFFLE) === 'true',
        darkMode: getPreferredDarkMode()
    };
};

window.applySyncedPreferences = function applySyncedPreferences(preferences = {}) {
    const sourceEl = document.getElementById('comicSource');
    const spanishEl = document.getElementById('spanish');
    const swipeEl = document.getElementById('swipe');
    const darkModeEl = document.getElementById('darkmode');
    const datePicker = document.getElementById('DatePicker');

    if (preferences.comicSource && sourceEl) {
        const source = getValidComicSource(preferences.comicSource);
        sourceEl.value = source;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SOURCE, source);
        _applySourceSetting(source);
    }

    if (typeof preferences.swipeEnabled === 'boolean' && swipeEl) {
        swipeEl.checked = preferences.swipeEnabled;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SWIPE, preferences.swipeEnabled ? 'true' : 'false');
    }

    if (typeof preferences.shuffle === 'boolean') {
        const shuffleBtn = document.getElementById('Shuffle');
        if (shuffleBtn) shuffleBtn.setAttribute('aria-pressed', preferences.shuffle ? 'true' : 'false');
        localStorage.setItem(CONFIG.STORAGE_KEYS.SHUFFLE, preferences.shuffle ? 'true' : 'false');
        resetShuffleSession();
        if (preferences.shuffle) pickShuffleCandidates();
    }

    if (typeof preferences.darkMode === 'boolean' && darkModeEl) {
        setDarkModeControlState(darkModeEl, preferences.darkMode);
        localStorage.setItem(CONFIG.STORAGE_KEYS.DARK_MODE, preferences.darkMode ? 'true' : 'false');
        applyDarkMode(preferences.darkMode);
    }

    if (typeof preferences.spanish === 'boolean' && spanishEl) {
        const isGoComics = (sourceEl?.value || 'gocomics') === 'gocomics';
        const useSpanish = isGoComics && preferences.spanish;
        spanishEl.checked = useSpanish;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SPANISH, useSpanish ? 'true' : 'false');
        translateInterface(useSpanish ? 'es' : 'en');
        document.documentElement.lang = useSpanish ? 'es' : 'en';
        if (datePicker) datePicker.min = useSpanish ? CONFIG.GARFIELD_START_ES : CONFIG.GARFIELD_START_EN;
    }

    CompareDates();
    showComic();
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
        'darkmode': t.darkMode,
        'comicSource': t.comicSource,
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
        'darkmode': t.darkMode,
        'Next': t.next,
        'Last': t.last,
        'Shuffle': t.shuffle
    };

    for (const [id, tooltip] of Object.entries(toolbarButtons)) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.title = tooltip;
            btn.setAttribute('aria-label', tooltip);
        }
    }
    if (typeof updateToolbarModeControls === 'function') updateToolbarModeControls();

    // Translate date picker
    const datePicker = document.getElementById('DatePicker');
    if (datePicker) {
        datePicker.setAttribute('aria-label', t.selectDate);
    }
    // Re-append the selected date to the date button's accessible name, which
    // the toolbarButtons loop above just reset to the bare label.
    updateDateDisplay();

    // Translate install and support buttons
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.textContent = t.installApp;
        installBtn.setAttribute('aria-label', t.installApp);
    }

    // Update donation modal title
    const donationTitle = document.getElementById('donationTitle');
    if (donationTitle) {
        donationTitle.textContent = t.supportApp;
    }

    // Translate export/import buttons
    const exportBtn = document.querySelector('#exportFavs span');
    if (exportBtn) {
        exportBtn.textContent = t.exportFavorites;
    }
    const importBtn = document.querySelector('#importFavs span');
    if (importBtn) {
        importBtn.textContent = t.importFavorites;
    }

    // Translate Google sync section
    const gSyncHeader = document.querySelector('.google-sync-header span');
    if (gSyncHeader) gSyncHeader.textContent = t.googleDriveSync;
    const gSignInSpan = document.querySelector('#googleSignInBtn span');
    if (gSignInSpan) gSignInSpan.textContent = t.googleSignIn;
    const gSignOutLabel = document.querySelector('.google-signout-label');
    if (gSignOutLabel) gSignOutLabel.textContent = `(${t.googleSignOut})`;
    const gSyncDesc = document.getElementById('googleSyncDesc');
    if (gSyncDesc) gSyncDesc.textContent = t.googleSyncDesc;

    // Translate donation modal
    const donationMsg = document.getElementById('donationMessage');
    if (donationMsg) donationMsg.textContent = t.donationMessage;

    // Translate Top Favorites button and modal header
    const top10BtnSpan = document.querySelector('#top10Btn span');
    if (top10BtnSpan) top10BtnSpan.textContent = t.top10Title;
    const top10Header = document.querySelector('#top10Modal .top10-header h3');
    if (top10Header) {
        top10Header.textContent = t.top10Title;
    }
    const top10Btn = document.getElementById('top10Btn');
    if (top10Btn) top10Btn.setAttribute('aria-label', t.top10Title);
    const top10ModalEl = document.getElementById('top10Modal');
    if (top10ModalEl) top10ModalEl.setAttribute('aria-label', t.top10Title);

    // Translate comic alt text
    const comic = document.getElementById('comic');
    if (comic && comic.alt === 'Loading comic...') {
        comic.alt = t.loadingComic;
    }
    document.documentElement.lang = lang === 'es' ? 'es' : 'en';
    window.dispatchEvent(new CustomEvent('language-changed'));
}

// Global variables for app functionality
let previousUrl = "";
let currentComicUrl = ""; // Track current comic URL to prevent duplicate loads
let nextComicUrl = ""; // Track preloaded next comic URL to detect timezone edge cases
let _favoritesMigrationQueue = Promise.resolve();
let currentselectedDate;
let day, month, year;
let pictureUrl;
let formattedComicDate;
let formattedDate;
let _loadComicGeneration = 0;

/**
 * Share comic via Web Share API
 */
async function Share() {
    return shareComic({ comic: displayedComic, t: translations[UTILS.isSpanishMode() ? 'es' : 'en'], showNotification });
}

/**
 * Add or remove comic from favorites
 */
let displayedComic = null;

function Addfav() {
    // Use formattedComicDate which is in YYYY/MM/DD format (consistent with rest of app)
    if (!displayedComic) {
        console.error('formattedComicDate is not set');
        return;
    }

    const dateToFavorite = displayedComic.date;
    const favs = UTILS.getFavorites();

    const showFavsCheckbox = document.getElementById("showfavs");

    const favIndex = favs.indexOf(dateToFavorite);

    if (favIndex === -1) {
        // Add to favorites
        favs.push(dateToFavorite);
        if (showFavsCheckbox) showFavsCheckbox.disabled = false;
    } else {
        // Remove from favorites
        favs.splice(favIndex, 1);

        if (favs.length === 0 && showFavsCheckbox) {
            showFavsCheckbox.checked = false;
            showFavsCheckbox.disabled = true;
        }
    }

    favs.sort();
    localStorage.setItem(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(favs));
    // Auto-sync to Google Drive if signed in
    window.syncFavoritesToDrive?.();
    const wasAdded = favIndex === -1;
    UTILS.updateHeartIcon();
    updateExportButtonState();
    CompareDates();

    // Report authenticated changes to the global leaderboard.
    const favoriteAction = wasAdded ? 'add' : 'remove';
    reportFavoriteToggle(dateToFavorite, favoriteAction);

    if (typeof isRotatedViewActive === 'function' ? isRotatedViewActive() : isRotatedMode) {
        showFavoriteOverlay(wasAdded);
    }
}

function showFavoriteOverlay(added) {
    const existing = document.getElementById('fav-heart-overlay');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'fav-heart-overlay';
    container.className = 'fav-heart-overlay';
    container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${added ? '#e74c3c' : 'none'}" stroke="${added ? '#e74c3c' : '#fff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    document.body.appendChild(container);

    container.addEventListener('animationend', () => container.remove());
}

function clearPendingComicSingleTap() {
    if (pendingComicSingleTapTimer) {
        clearTimeout(pendingComicSingleTapTimer);
        pendingComicSingleTapTimer = null;
    }
}

function resetComicTapTracking() {
    clearPendingComicSingleTap();
    lastComicTapTime = 0;
    lastComicTapX = 0;
    lastComicTapY = 0;
}

function queueComicSingleTap(singleTapAction) {
    clearPendingComicSingleTap();
    if (typeof singleTapAction !== 'function') {
        return;
    }

    pendingComicSingleTapTimer = window.setTimeout(() => {
        pendingComicSingleTapTimer = null;
        lastComicTapTime = 0;
        singleTapAction();
    }, COMIC_DOUBLE_TAP_DELAY);
}

function bindComicTapGestures(target, singleTapAction = null) {
    if (!target || target.dataset.doubleTapInitialized === 'true') return;

    target.dataset.doubleTapInitialized = 'true';

    target.addEventListener('touchend', (e) => {
        if (isVerticalFullscreenActive()) return;
        if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS) {
            resetComicTapTracking();
            return;
        }

        const touch = e.changedTouches?.[0];
        if (!touch) return;

        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        const deltaTime = Date.now() - touchStartTime;

        if (deltaX > COMIC_TAP_MAX_MOVEMENT || deltaY > COMIC_TAP_MAX_MOVEMENT || deltaTime > CONFIG.SWIPE_MAX_TIME) {
            resetComicTapTracking();
            return;
        }

        const now = Date.now();
        const isDoubleTap = lastComicTapTime > 0 &&
            now - lastComicTapTime <= COMIC_DOUBLE_TAP_DELAY &&
            Math.abs(touch.clientX - lastComicTapX) <= COMIC_TAP_MAX_MOVEMENT &&
            Math.abs(touch.clientY - lastComicTapY) <= COMIC_TAP_MAX_MOVEMENT;

        if (isDoubleTap) {
            e.preventDefault();
            suppressComicClickUntil = now + 400;
            resetComicTapTracking();
            Addfav();
            return;
        }

        lastComicTapTime = now;
        lastComicTapX = touch.clientX;
        lastComicTapY = touch.clientY;
        queueComicSingleTap(singleTapAction);
    }, { passive: false });

    target.addEventListener('dblclick', (e) => {
        if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS) return;
        e.preventDefault();
        suppressComicClickUntil = Date.now() + 400;
        resetComicTapTracking();
        Addfav();
    });
}

function initializeComicTapGestures(singleTapAction = null) {
    bindComicTapGestures(document.getElementById('comic'), singleTapAction);
}


/** Element that had focus before the settings dialog was opened. */
let _settingsLastFocusedElement = null;

/**
 * Close the settings dialog and hand focus back to whatever opened it.
 */
function closeSettingsPanel(panel) {
    panel.classList.remove('visible');
    panel.classList.remove('animate');
    localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, "false");

    if (_settingsLastFocusedElement?.isConnected) {
        _settingsLastFocusedElement.focus();
    }
    _settingsLastFocusedElement = null;
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
        closeSettingsPanel(panel);
    } else {
        _settingsLastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel.classList.add('visible');
        // Only animate if showing from centered position (no saved position)
        const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS + '_pos');
        const hasSavedPos = savedPosRaw && savedPosRaw !== 'null';
        if (!hasSavedPos) {
            panel.classList.add('animate');
        }
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, "true");

        // Move focus into the dialog so keyboard and screen-reader users land
        // on its controls instead of staying behind it.
        getFocusableElements(panel)[0]?.focus();
    }
}

document.addEventListener('keydown', function(e) {
    const panel = document.getElementById("settingsDIV");
    if (!panel?.classList.contains('visible')) return;

    if (e.key === 'Tab') {
        trapFocusWithin(e, panel);
        return;
    }

    if (e.key === 'Escape') {
        closeSettingsPanel(panel);
    }
});

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
    // Tap detection always tracks; the swipe preference is honoured in
    // handleTouchMove/handleTouchEnd, which decide whether to navigate.
}

/**
 * Handles touch move event
 * Prevents default scrolling during horizontal swipes
 * @param {TouchEvent} e - Touch event
 */
function handleTouchMove(e) {
    // Always allow swipes in rotated mode
    const rotatedComic = document.getElementById('rotated-comic');
    if (!rotatedComic && !document.getElementById('swipe')?.checked) return;

    // Prevent default scrolling behavior during swipe
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);

    // If a handled swipe is underway, prevent native scrolling from fighting it.
    if (((deltaX > deltaY && deltaX > 20) || (deltaY > deltaX && touch.clientY < touchStartY && deltaY > 20)) && e.cancelable) {
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
    // Disable swiping when viewing maximized vertical comic
    if (isVerticalFullscreenActive()) {
        return;
    }

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
    if (!rotatedComic && !document.getElementById('swipe')?.checked) return;

    // Check if the swipe is valid (meets distance and time requirements)
    if (deltaTime > CONFIG.SWIPE_MAX_TIME) return;

    let swipeDetected = false;

    // Check if we're in rotated fullscreen mode (reuse rotatedComic from above)
    const isInRotatedMode = rotatedComic && rotatedComic.className.includes('rotate');
    const isInLandscapeMode = rotatedComic && rotatedComic.className.includes('fullscreen-landscape');

    // Shuffle mode routes either direction to a random comic from the active pool.
    const randomSwipe = !isTop10ModeActive() && isShuffleEnabled();
    const goNext = randomSwipe ? RandomNewerClick : NextClick;
    const goPrev = randomSwipe ? RandomOlderClick : PreviousClick;
    const canSwipeNavigate = (direction) => {
        if (isTop10ModeActive()) {
            return canSwipeTop10(direction);
        }
        return randomSwipe
            ? UTILS.canShuffleNavigate(direction)
            : UTILS.canNavigate(direction);
    };
    const canSwipeRandom = () => !document.getElementById('Random')?.disabled;
    const triggerRandomSwipe = () => {
        swipeDetected = true;
        lastSwipeTime = Date.now();
        RandomClick();
    };

    // Determine swipe direction based on mode
    if (isInRotatedMode) {
        // Rotated mode (90° clockwise): Only support logical left/right navigation
        if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
            const direction = deltaY < 0 ? 'next' : 'previous';
            // Only trigger swipe if navigation is possible in that direction
            if (canSwipeNavigate(direction)) {
                swipeDetected = true;
                lastSwipeTime = Date.now();
                if (deltaY < 0) {
                    goNext();
                } else {
                    goPrev();
                }
            }
        }
    } else if (isInLandscapeMode) {
        // Landscape fullscreen (no rotation): Normal horizontal/vertical mapping
        if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            const direction = deltaX < 0 ? 'next' : 'previous';
            // Only trigger swipe if navigation is possible in that direction
            if (canSwipeNavigate(direction)) {
                // Horizontal swipe
                swipeDetected = true;
                lastSwipeTime = Date.now();
                if (deltaX < 0) {
                    // Swipe Left -> Next
                    goNext();
                } else {
                    // Swipe Right -> Previous
                    goPrev();
                }
            }
        } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE && deltaY < 0 && canSwipeRandom()) {
            triggerRandomSwipe();
        }
    } else {
        // Normal portrait mode: Horizontal only for Next/Prev
        if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
            const direction = deltaX > 0 ? 'previous' : 'next';
            // Only trigger swipe if navigation is possible in that direction
            if (canSwipeNavigate(direction)) {
                // Horizontal swipe
                swipeDetected = true;
                lastSwipeTime = Date.now(); // Mark swipe occurred to prevent click
                if (deltaX > 0) {
                    // Swipe right -> Previous
                    goPrev();
                } else {
                    // Swipe left -> Next
                    goNext();
                }
            }
        } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE && deltaY < 0 && canSwipeRandom()) {
            triggerRandomSwipe();
        }
    }
}

/**
 * Keep the date-picker button's accessible name in sync with the selected date.
 *
 * `#DatePicker` is a visually hidden 1x1 input opened programmatically by
 * `#DatePickerBtn`, so screen-reader and tooltip users otherwise have no way to
 * know which comic date is currently selected. The date is formatted with the
 * user's own locale rather than the raw ISO value.
 */
function updateDateDisplay() {
    const dateInput = document.getElementById('DatePicker');
    const button = document.getElementById('DatePickerBtn');
    if (!dateInput || !button) return;

    const t = translations[UTILS.isSpanishMode() ? 'es' : 'en'] || translations.en;
    const baseLabel = t.selectDate;
    const [year, month, day] = (dateInput.value || '').split('-').map(Number);

    let label = baseLabel;
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        const localizedDate = new Date(year, month - 1, day).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        label = `${baseLabel} (${localizedDate})`;
    }

    button.title = label;
    button.setAttribute('aria-label', label);
}

/**
 * Load comic for a specific date
 * @param {Date} date - Date to load comic for
 * @param {boolean} silentMode - If true, suppress error messages
 * @param {string|null} direction - Navigation direction: 'next', 'previous', or null
 * @returns {Promise<{success: boolean, isSameComic: boolean, actualDate?: Date|null}>} Load result
 */
async function loadComic(date, silentMode = false, direction = null) {
    const generation = ++_loadComicGeneration;
    const favoriteButton = document.getElementById('favheart');
    if (favoriteButton) favoriteButton.disabled = true;
    try {
        const useSpanish = UTILS.isSpanishMode();
        const language = useSpanish ? 'es' : 'en';
        const source = UTILS.getPreferredSource();

        if (!navigator.onLine) await UTILS.reconcileOfflineComics();

        const result = navigator.onLine
            ? await getAuthenticatedComic(date, language, source, { verifyImage: loadComicImage })
            : UTILS.getOfflineComic(date, language, direction);

        if (generation !== _loadComicGeneration) {
            return { success: false, isSameComic: false, stale: true };
        }

        if (result.success && result.imageUrl) {
            // Check if this is the same comic we already have (timezone edge case)
            if (currentComicUrl === result.imageUrl) {
                updateOfflineNavigationControls(result.actualDate || date, language);
                // Same comic - return special value to indicate duplicate
                return { success: true, isSameComic: true };
            }

            const comicImg = document.getElementById('comic');
            const wrapper = document.getElementById('comic-wrapper');

            if (result.isOffline) {
                await loadComicImage(result.imageUrl);
            }
            if (generation !== _loadComicGeneration) {
                return { success: false, isSameComic: false, stale: true };
            }
            await animateComicTransition(comicImg, wrapper, result.imageUrl, direction);
            if (generation !== _loadComicGeneration) {
                return { success: false, isSameComic: false, stale: true };
            }
            comicImg.style.display = 'block';

            // Update current comic URL after successful load
            currentComicUrl = result.imageUrl;
            displayedComic = Object.freeze({
                date: UTILS.dateToISODateString(result.actualDate || date).replaceAll('-', '/'),
                language,
                imageUrl: result.imageUrl
            });
            const dateLabel = (result.actualDate || date).toLocaleDateString(useSpanish ? 'es-ES' : 'en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            comicImg.alt = useSpanish ? `Garfield del ${dateLabel} (español)` : `Garfield for ${dateLabel} (English)`;

            if (!result.isOffline) {
                const rememberComic = async () => {
                    if (comicImg.naturalWidth > 0 && await UTILS.cacheDisplayedComic(result.imageUrl)) {
                        UTILS.rememberOfflineComic(result.actualDate || date, language, result.imageUrl);
                        await UTILS.reconcileOfflineComics();
                    }
                };
                if (comicImg.complete) rememberComic();
                else comicImg.addEventListener('load', rememberComic, { once: true });
            }

            const ensureOrientationCheck = () => {
                checkImageOrientation();
                // Recalculate default toolbar midpoint after the comic has real dimensions.
                setTimeout(refreshToolbarDefaultPosition, 50);
            };
            if (comicImg.complete) {
                ensureOrientationCheck();
            } else {
                comicImg.addEventListener('load', ensureOrientationCheck, { once: true });
            }

            // Also update the rotated comic if it exists (with animation)
            const rotatedComic = document.getElementById('rotated-comic');
            if (rotatedComic) {
                rotatedComic.alt = comicImg.alt;
                void animateRotatedComicTransition(rotatedComic, result.imageUrl, direction, scheduleRotatedComicResize);
            }

            // Store for sharing
            window.pictureUrl = result.imageUrl;
            previousUrl = result.imageUrl;

            // Hide error messages
            const messageContainer = document.getElementById('comic-message');
            if (messageContainer) messageContainer.style.display = 'none';

            // Preload adjacent comics for faster navigation.
            // Use actualDate when GoComics detected a date redirect so that
            // checkNextComicAvailability fires against the real strip date.
            if (!result.isOffline) {
                const targetDate = result.actualDate || date;
                if (generation === 1) {
                    setTimeout(() => {
                        if (generation === _loadComicGeneration) {
                            UTILS.preloadAdjacentComics(targetDate);
                        }
                    }, 3000);
                } else {
                    UTILS.preloadAdjacentComics(targetDate);
                }
            }

            updateOfflineNavigationControls(result.actualDate || date, language);

            return { success: true, isSameComic: false, actualDate: result.actualDate || null };
        }

        if (result.isPaywalled && !silentMode) {
            showPaywallMessage();
            return { success: false, isSameComic: false };
        }

        throw new Error('Comic not available');
    } catch (error) {
        if (generation !== _loadComicGeneration) {
            return { success: false, isSameComic: false, stale: true };
        }
        if (!silentMode) {
            showErrorMessage(translations[UTILS.isSpanishMode() ? 'es' : 'en'].loadFailed);
        }
        return { success: false, isSameComic: false };
    } finally {
        if (generation === _loadComicGeneration && favoriteButton) {
            favoriteButton.disabled = !displayedComic;
        }
    }
}

/**
 * Show paywall message for unavailable comics
 */
function showPaywallMessage() {
    const t = translations[UTILS.isSpanishMode() ? 'es' : 'en'];
    const messageContainer = UTILS.getOrCreateMessageContainer('paywall-message');
    const daysDiff = Math.floor((new Date() - currentselectedDate) / (1000 * 60 * 60 * 24));
    messageContainer.textContent = '';

    const title = document.createElement('p');
    const strong = document.createElement('strong');
    const body = document.createElement('p');
    const hint = document.createElement('p');

    if (daysDiff > 30) {
        strong.textContent = t.archiveTitle;
        body.textContent = t.archiveBody.replace('{days}', daysDiff);
        hint.textContent = t.archiveHint;
    } else {
        strong.textContent = t.loadTitle;
        body.textContent = t.recentBody;
        hint.textContent = t.loadHint;
    }

    title.appendChild(strong);
    messageContainer.append(title, body, hint);
}

/**
 * Show error message for failed comic loads
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
    const t = translations[UTILS.isSpanishMode() ? 'es' : 'en'];
    const messageContainer = UTILS.getOrCreateMessageContainer('error-message');
    messageContainer.textContent = '';

    const title = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = t.loadTitle;
    title.appendChild(strong);

    const body = document.createElement('p');
    body.textContent = message;

    const hint = document.createElement('p');
    hint.textContent = t.loadHint;

    messageContainer.append(title, body, hint);
}

function updateConnectionStatus() {
    const indicator = document.getElementById('offline-indicator');
    if (!indicator) return;
    indicator.hidden = navigator.onLine;
}

function updateOfflineNavigationControls(date, language) {
    if (navigator.onLine) return;
    const comics = UTILS.getOfflineComics(language);
    const dateString = UTILS.dateToISODateString(date);
    document.getElementById('First').disabled = comics.length === 0 || comics[0].date === dateString;
    document.getElementById('Previous').disabled = !comics.some(comic => comic.date < dateString);
    document.getElementById('Next').disabled = !comics.some(comic => comic.date > dateString);
    document.getElementById('Last').disabled = comics.length === 0 || comics.at(-1).date === dateString;
}

function navigateOfflineComics(destination) {
    if (navigator.onLine) return false;
    const language = UTILS.isSpanishMode() ? 'es' : 'en';
    const comics = UTILS.getOfflineComics(language);
    if (comics.length === 0) return true;

    const currentDate = UTILS.dateToISODateString(currentselectedDate);
    let target;
    if (destination === 'first') target = comics[0];
    if (destination === 'last') target = comics.at(-1);
    if (destination === 'previous') target = [...comics].reverse().find(comic => comic.date < currentDate);
    if (destination === 'next') target = comics.find(comic => comic.date > currentDate);
    if (!target) return true;

    currentselectedDate = UTILS.dateFromISODateString(target.date);
    CompareDates();
    showComic(false, destination === 'previous' || destination === 'next' ? destination : null);
    return true;
}

/**
 * Ask the active service worker for its build version over a MessageChannel.
 *
 * The worker is the authority on which cache generation is actually serving the
 * page, so asking it directly is more accurate than re-fetching serviceworker.js
 * (which may be served from cache, or from a newer deployment that has not been
 * activated yet).
 *
 * @param {number} [timeoutMs] How long to wait for the worker to reply.
 * @returns {Promise<string|null>} The version string, or null when unavailable.
 */
function requestServiceWorkerVersion(timeoutMs = 3000) {
    const worker = navigator.serviceWorker?.controller;
    if (!worker || typeof MessageChannel !== 'function') return Promise.resolve(null);

    return new Promise(resolve => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
            channel.port1.close();
            resolve(null);
        }, timeoutMs);

        channel.port1.onmessage = event => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(event.data?.version || null);
        };

        try {
            worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
        } catch {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

/**
 * Render the active service worker version in the settings footer.
 */
async function displayServiceWorkerVersion() {
    const swDisplay = document.getElementById('swVersionDisplay');
    if (!swDisplay) return;

    // On a first visit the worker has not claimed the page yet, so wait for the
    // registration to become active before asking.
    if (!navigator.serviceWorker?.controller && navigator.serviceWorker?.ready) {
        await navigator.serviceWorker.ready.catch(() => null);
    }

    const version = await requestServiceWorkerVersion();
    const t = translations[UTILS.isSpanishMode() ? 'es' : 'en'];
    swDisplay.textContent = t.versionLabel.replace('{version}', version || t.versionUnknown);
}

function initApp() {
    updateConnectionStatus();
    window.addEventListener('online', () => {
        updateConnectionStatus();
        CompareDates();
        showComic();
    });
    window.addEventListener('offline', () => {
        updateConnectionStatus();
        showComic();
    });

    // Restore checkbox states from localStorage FIRST, before any code depends on them
    initializeDarkMode();

    const swipeStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.SWIPE);
    const swipeCheckbox = document.getElementById('swipe');
    if (swipeStatus === null) {
        if (swipeCheckbox) swipeCheckbox.checked = true;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SWIPE, 'true');
    } else if (swipeCheckbox) {
        swipeCheckbox.checked = swipeStatus === "true";
    }

    // One-time migration: previously stored 'randomSwipe' key (settings checkbox)
    // is now exposed as the toolbar Shuffle toggle under STORAGE_KEYS.SHUFFLE.
    const legacyRandomSwipe = localStorage.getItem('randomSwipe');
    if (legacyRandomSwipe !== null && localStorage.getItem(CONFIG.STORAGE_KEYS.SHUFFLE) === null) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SHUFFLE, legacyRandomSwipe);
        localStorage.removeItem('randomSwipe');
    }
    const shuffleStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.SHUFFLE) === 'true';
    const shuffleBtn = document.getElementById('Shuffle');
    if (shuffleBtn) shuffleBtn.setAttribute('aria-pressed', shuffleStatus ? 'true' : 'false');

    const showFavsStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.SHOW_FAVS);
    document.getElementById("showfavs").checked = showFavsStatus === "true";

    const lastDateStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_DATE);
    if (lastDateStatus === null) {
        document.getElementById("lastdate").checked = true;
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_DATE, "true");
    } else {
        document.getElementById("lastdate").checked = lastDateStatus === "true";
    }

    // Initialize comic source preference
    const savedSource = getValidComicSource(localStorage.getItem(CONFIG.STORAGE_KEYS.SOURCE));
    const sourceEl = document.getElementById('comicSource');
    if (sourceEl) {
        sourceEl.value = savedSource;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SOURCE, savedSource);
        _applySourceSetting(savedSource);
    }

    // Initialize Spanish language preference
    const spanishStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.SPANISH);
    const datePickerEl = document.getElementById('DatePicker');
    const userLang = navigator.language || navigator.userLanguage;
    const isSpanishLocale = userLang.startsWith('es');

    let useSpanish = false;
    if (spanishStatus === null) {
        useSpanish = isSpanishLocale;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SPANISH, useSpanish ? 'true' : 'false');
    } else {
        useSpanish = spanishStatus === "true";
    }

    // Spanish is only available when GoComics is the primary source
    if (savedSource !== 'gocomics') useSpanish = false;
    document.getElementById("spanish").checked = useSpanish;
    translateInterface(useSpanish ? 'es' : 'en');
    if (datePickerEl) datePickerEl.min = useSpanish ? "1999-12-06" : "1978-06-19";

    // Add event listeners
    document.getElementById('First').addEventListener('click', FirstClick);
    document.getElementById('Previous').addEventListener('click', PreviousClick);
    document.getElementById('Random').addEventListener('click', RandomClick);
    document.getElementById('Next').addEventListener('click', NextClick);
    document.getElementById('Last').addEventListener('click', LastClick);
    document.getElementById('Shuffle')?.addEventListener('click', function () {
        const enabled = this.getAttribute('aria-pressed') === 'true';
        const next = !enabled;
        this.setAttribute('aria-pressed', next ? 'true' : 'false');
        localStorage.setItem(CONFIG.STORAGE_KEYS.SHUFFLE, next ? 'true' : 'false');
        if (next) {
            resetShuffleSession();
            // Picking happens immediately so the next swipe is instant
            pickShuffleCandidates();
        } else {
            resetShuffleSession();
        }
        CompareDates();
        window.syncFavoritesToDrive?.();
    });
    document.getElementById('DatePicker').addEventListener('input', DateChange);
    document.getElementById('settingsBtn').addEventListener('click', HideSettings);
    document.getElementById('settingsCloseBtn').addEventListener('click', HideSettings);
    document.getElementById('favheart').addEventListener('click', Addfav);
    document.getElementById('shareBtn').addEventListener('click', Share);
    document.getElementById('exportFavs').addEventListener('click', exportFavorites);
    document.getElementById('importFavs').addEventListener('click', importFavorites);

    // Load Service Worker Version into Settings
    displayServiceWorkerVersion();

    // Install button click is handled in showInstallButton()
    document.getElementById('DatePickerBtn').addEventListener('click', () => {
        const datePicker = document.getElementById('DatePicker');
        if (datePicker?.disabled) return;
        datePicker?.showPicker?.();
    });

    // Rotation/fullscreen logic:
    // - Mobile phone (not tablet) in PWA mode: use physical rotation (auto-rotation works in PWA)
    // - Mobile phone in browser (not PWA): use click to rotate (auto-rotation may not work in browser)
    // - Tablet/Desktop: no rotation needed (already landscape-capable)
    const isMobilePhone = /iPhone|Android/.test(navigator.userAgent) && !/iPad|Tablet/.test(navigator.userAgent);
    const isTablet = /iPad|Tablet|Android(?=.*\bTablet\b)/i.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                  window.navigator.standalone === true;

    let comicSingleTapAction = null;

    if (isMobilePhone && !isTablet) {
        if (isPWA) {
            // Mobile PWA: use physical rotation for fullscreen
            function handleOrientationChange() {
                // Skip rotation handling for vertical comics - they have their own fullscreen system
                if (isVerticalComicModeActive() || isVerticalFullscreenActive()) {
                    return;
                }

                const isLandscape = window.matchMedia("(orientation: landscape)").matches;
                const existingOverlay = document.getElementById('comic-overlay');

                if (isLandscape && !existingOverlay) {
                    // Device rotated to landscape - enter fullscreen WITHOUT rotation, NO click-to-exit
                    Rotate(false, false);
                } else if (isLandscape && existingOverlay) {
                    scheduleRotatedComicResize(document.getElementById('rotated-comic'));
                } else if (!isLandscape && existingOverlay) {
                    // Device rotated back to portrait - exit fullscreen
                    Rotate(false, false);
                }
            }

            // Use screen.orientation API if available, fallback to matchMedia
            if (screen.orientation) {
                screen.orientation.addEventListener('change', handleOrientationChange);
            } else {
                window.addEventListener('orientationchange', handleOrientationChange);
            }
            // Also listen to resize as a fallback for orientation detection
            window.matchMedia("(orientation: landscape)").addEventListener('change', handleOrientationChange);
        } else {
            // Mobile browser (not PWA): use single tap to rotate unless it becomes a double tap.
            comicSingleTapAction = () => {
                if (Date.now() - lastSwipeTime < CONFIG.SWIPE_CLICK_DEBOUNCE_MS || Date.now() < suppressComicClickUntil) return;
                Rotate(true);
            };
        }
    }

    initializeComicTapGestures(comicSingleTapAction);
    // Tablet and Desktop: no rotation feature - they're already landscape-capable

    const favs = UTILS.getFavorites();

    // Set minimum body height at load time to prevent gradient shift
    document.body.style.minHeight = "100vh";

    // Prevent clearing the date picker
    const datePicker = document.getElementById("DatePicker");
    datePicker.setAttribute("required", "required");

    // Add event listener to prevent emptying the date
    datePicker.addEventListener('change', function(e) {
        if (!this.value) {
            // If cleared, reset to Eastern Time today (comic release timezone)
            this.value = UTILS.getEasternTodayString();
        }
    });

    // Handle URL parameters from shortcuts
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const view = urlParams.get('view');

    if (view === 'favorites' && favs.length > 0) {
        document.getElementById("showfavs").checked = true;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SHOW_FAVS, 'true');
        currentselectedDate = favs.length ? UTILS.dateFromFavoriteDateString(favs[0]) : UTILS.getEasternDate();
    } else if (action === 'random') {
        // Will trigger random after loading
        setTimeout(() => RandomClick(), 500);
        currentselectedDate = UTILS.getEasternDate();
    } else if (document.getElementById("showfavs").checked) {
        currentselectedDate = favs.length ? UTILS.dateFromFavoriteDateString(favs[0]) : UTILS.getEasternDate();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
    } else {
        currentselectedDate = UTILS.getEasternDate();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
        document.getElementById("Next").disabled = true;
        document.getElementById("Last").disabled = true;
    }

    // Use Eastern Time for date picker max since comics release based on ET
    const etToday = UTILS.getEasternTodayString();
    document.getElementById("DatePicker").setAttribute("max", etToday);

    // Also format today's date for other uses
    formatDate(UTILS.getEasternDate());

    if (document.getElementById("lastdate").checked && localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_COMIC) && !action && !view) {
        const storedLastComic = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_COMIC);
        if (/^\d{4}-\d{2}-\d{2}$/.test(storedLastComic)) {
            currentselectedDate = UTILS.dateFromISODateString(storedLastComic);
        } else {
            const parsedLastComic = new Date(storedLastComic);
            if (!Number.isNaN(parsedLastComic.getTime())) {
                currentselectedDate = parsedLastComic;
            }
        }
    }
    CompareDates();
    showComic();
    updateDateDisplay(); // Add this line to update the display
    updateExportButtonState(); // Enable/disable export button based on favorites

    // One-time migration of existing favorites to global leaderboard
    migrateExistingFavorites();
}

// Call initApp when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Debounce timer for date changes
let _dateChangeTimeout = null;

// Call this function when the date changes
async function DateChange() {
    if (_dateChangeTimeout) clearTimeout(_dateChangeTimeout);
    _dateChangeTimeout = setTimeout(() => _dateChangeImpl(), 300);
}

async function _dateChangeImpl() {
    const datePicker = document.getElementById('DatePicker');
    const rawValue = datePicker?.value || '';
    const normalized = normalizeFavoriteDate(rawValue);
    if (!normalized) {
        if (datePicker && !rawValue) {
            datePicker.value = displayedComic?.date
                ? displayedComic.date.replaceAll('/', '-')
                : UTILS.getEasternTodayString();
            updateDateDisplay();
        }
        return;
    }
    const previousDate = new Date(currentselectedDate);
    currentselectedDate = UTILS.dateFromFavoriteDateString(normalized);
    updateDateDisplay();
    CompareDates();

    // Check if user selected a Sunday in Spanish mode
    const isSpanish = UTILS.isSpanishMode();
    const isSunday = currentselectedDate.getDay() === 0;

    if (isSpanish && isSunday) {
        // Try to load the comic
        formatDate(currentselectedDate);
        formattedComicDate = year + "/" + month + "/" + day;
        formattedDate = year + "-" + month + "-" + day;
        document.getElementById("DatePicker").value = formattedDate;

        const result = await loadComic(currentselectedDate, true);
        if (result.stale) return;

        if (!result.success) {
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


// Show comic for the current date, with optional auto-skip for unavailable dates
async function showComic(skipOnFailure = false, direction = null, _depth = 0) {
    // Depth guard: prevent runaway recursion from same-comic detection
    if (_depth > 10) return;

    formatDate(currentselectedDate);
    formattedComicDate = year + "/" + month + "/" + day;
    formattedDate = year + "-" + month + "-" + day;

    document.getElementById("DatePicker").value = formattedDate;
    updateDateDisplay();

    // Check if date is in favorites
    UTILS.updateHeartIcon();

    // Save last viewed comic
    if (document.getElementById("lastdate").checked) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_COMIC, UTILS.dateToISODateString(currentselectedDate));
    }

    // Load the comic (silent mode off for first attempt when not auto-skipping)
    const result = await loadComic(currentselectedDate, skipOnFailure, direction);
    if (result.stale) return;
    const success = result.success;

    // If GoComics detected a date redirect (today's comic not yet published, served
    // the previous day's strip instead), correct the displayed date to the actual
    // strip date. This keeps preloading, button states, and isSameComic detection
    // all consistent with the comic that is actually on screen.
    if (result.actualDate) {
        currentselectedDate = result.actualDate;
        formatDate(currentselectedDate);
        formattedComicDate = year + "/" + month + "/" + day;
        formattedDate = year + "-" + month + "-" + day;
        document.getElementById("DatePicker").value = formattedDate;
        updateDateDisplay();
        CompareDates();
        // CompareDates() re-enables Next/Last because actualDate (yesterday) < today.
        // But we know today's comic isn't published yet (that's why the redirect happened),
        // so disable linear forward navigation immediately. Shuffle keeps Next usable
        // when there is another comic in the active pool.
        if (isShuffleEnabled()) {
            document.getElementById('First').disabled = !UTILS.canShuffleNavigate('first');
            document.getElementById('Previous').disabled = !UTILS.canShuffleNavigate('previous');
            document.getElementById('Random').disabled = true;
            document.getElementById('Next').disabled = !UTILS.canShuffleNavigate('next');
            document.getElementById('Last').disabled = !UTILS.canShuffleNavigate('last');
            updateToolbarModeControls();
        } else {
            document.getElementById('Next').disabled = true;
            document.getElementById('Last').disabled = true;
        }
        UTILS.updateHeartIcon();
        if (document.getElementById("lastdate").checked) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_COMIC, UTILS.dateToISODateString(currentselectedDate));
        }
    }

    // Handle same comic detection (timezone edge case)
    if (result.isSameComic && direction) {
        if (direction === 'previous') {
            // Going backwards and hit same comic - continue to previous day
            currentselectedDate.setDate(currentselectedDate.getDate() - 1);
            CompareDates();

            // Check if we've reached the start boundary (depth-limited via the while loop below)
            if (!document.getElementById("Previous")?.disabled) {
                formatDate(currentselectedDate);
                formattedComicDate = year + "/" + month + "/" + day;
                formattedDate = year + "-" + month + "-" + day;
                document.getElementById("DatePicker").value = formattedDate;
                updateDateDisplay();
                await showComic(true, 'previous', _depth + 1);
            }
            return;
        } else if (direction === 'next') {
            // Going forward and hit same comic - we're at the latest available
            // Revert to previous date and disable forward navigation
            currentselectedDate.setDate(currentselectedDate.getDate() - 1);
            CompareDates();
            formatDate(currentselectedDate);
            formattedComicDate = year + "/" + month + "/" + day;
            formattedDate = year + "-" + month + "-" + day;
            document.getElementById("DatePicker").value = formattedDate;
            updateDateDisplay();
            document.getElementById("Next").disabled = true;
            document.getElementById("Last").disabled = true;
            return;
        }
    }

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
                showErrorMessage(translations[UTILS.isSpanishMode() ? 'es' : 'en'].noMoreComics);
                break;
            }
            if (document.getElementById("Previous")?.disabled && direction === 'previous') {
                showErrorMessage(translations[UTILS.isSpanishMode() ? 'es' : 'en'].noMoreComics);
                break;
            }

            // Try loading this comic in silent mode (no error messages)
            formatDate(currentselectedDate);
            formattedComicDate = year + "/" + month + "/" + day;
            formattedDate = year + "-" + month + "-" + day;
            document.getElementById("DatePicker").value = formattedDate;
            updateDateDisplay();

            const retryResult = await loadComic(currentselectedDate, true, direction);
            if (retryResult.stale) return;
            if (retryResult.success && !retryResult.isSameComic) {
                UTILS.updateHeartIcon();
                return;
            }
        }

        if (attempts >= maxAttempts) {
            showErrorMessage(translations[UTILS.isSpanishMode() ? 'es' : 'en'].noAvailableComic);
        }
    }
    if (!success && displayedComic) {
        currentselectedDate = UTILS.dateFromFavoriteDateString(displayedComic.date);
        formattedComicDate = displayedComic.date;
        formattedDate = UTILS.dateToISODateString(currentselectedDate);
        formatDate(currentselectedDate);
        document.getElementById('DatePicker').value = formattedDate;
        updateDateDisplay();
        CompareDates();
        UTILS.updateHeartIcon();
        if (document.getElementById('lastdate').checked) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_COMIC, formattedDate);
        }
    }
}

function PreviousClick() {
    if (navigateOfflineComics('previous')) return;
    if (stepTop10BrowseIndex('previous')) return;
    // Shuffle mode: redirect Previous to a random comic from the active pool.
    if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
        if (!UTILS.canShuffleNavigate('previous')) return;
        RandomOlderClick();
        return;
    }
    if (document.getElementById('showfavs').checked) {
        const favs = UTILS.getFavorites();
        if (favs.indexOf(formattedComicDate) > 0) {
            currentselectedDate = UTILS.dateFromFavoriteDateString(favs[favs.indexOf(formattedComicDate) - 1]);
        }
    } else {
        currentselectedDate.setDate(currentselectedDate.getDate() - 1);
    }
    CompareDates();
    showComic(true, 'previous');
}

function NextClick() {
    if (navigateOfflineComics('next')) return;
    if (stepTop10BrowseIndex('next')) return;
    // Shuffle mode: redirect Next to a random comic from the active pool.
    if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
        if (!UTILS.canShuffleNavigate('next')) return;
        RandomNewerClick();
        return;
    }
    if (document.getElementById('showfavs').checked) {
        const favs = UTILS.getFavorites();
        if (favs.indexOf(formattedComicDate) < favs.length - 1) {
            currentselectedDate = UTILS.dateFromFavoriteDateString(favs[favs.indexOf(formattedComicDate) + 1]);
        }
    } else {
        currentselectedDate.setDate(currentselectedDate.getDate() + 1);
    }
    CompareDates();
    showComic(true, 'next');
}

function FirstClick() {
    if (navigateOfflineComics('first')) return;
    if (stepTop10BrowseIndex('first')) return;
    if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
        if (UTILS.canShuffleNavigate('first')) _jumpToFirstShuffle();
        return;
    }
    if (document.getElementById('showfavs').checked) {
        const favs = UTILS.getFavorites();
        currentselectedDate = UTILS.dateFromFavoriteDateString(favs[0]);
    } else {
        currentselectedDate = UTILS.isSpanishMode()
            ? UTILS.dateFromISODateString(CONFIG.GARFIELD_START_ES)
            : UTILS.dateFromISODateString(CONFIG.GARFIELD_START_EN);
    }
    CompareDates();
    showComic();
}

function LastClick() {
    if (navigateOfflineComics('last')) return;
    if (stepTop10BrowseIndex('last')) return;
    if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
        if (UTILS.canShuffleNavigate('last')) _jumpToLastShuffle();
        return;
    }
    if (document.getElementById('showfavs').checked) {
        const favs = UTILS.getFavorites();
        currentselectedDate = UTILS.dateFromFavoriteDateString(favs[favs.length - 1]);
    } else {
        currentselectedDate = UTILS.getEasternDate();
    }
    CompareDates();
    showComic();
}

/**
 * Update export button state based on favorites existence
 */
function updateExportButtonState() {
    const favs = UTILS.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS), []);
    const exportBtn = document.getElementById('exportFavs');
    if (exportBtn) {
        exportBtn.disabled = favs.length === 0;
    }
}

/**
 * Export favorites as downloadable JSON file
 */
function exportFavorites() {
    const exportBtn = document.getElementById('exportFavs');

    // Early exit if button is disabled (shouldn't happen but be defensive)
    if (exportBtn?.disabled) return;

    const favs = UTILS.safeJSONParse(localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS), []);
    const isSpanish = UTILS.isSpanishMode();
    const lang = isSpanish ? 'es' : 'en';
    const t = translations[lang];

    if (!favs || favs.length === 0) {
        // Update button state in case it wasn't properly disabled
        updateExportButtonState();
        return;
    }

    const data = {
        favorites: favs,
        exportDate: new Date().toISOString(),
        version: 1
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `garfield-favorites-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const plural = favs.length !== 1 ? 's' : '';
    const message = t.exportedFavorites.replace('{count}', favs.length).replace('{plural}', plural);
    showNotification(message, 3000);
}

/**
 * Import favorites from uploaded JSON file
 */
function importFavorites() {
    const fileInput = document.getElementById('importFileInput');
    if (!fileInput) return;

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Cap file size to prevent localStorage quota exhaustion (1MB max)
        if (file.size > 1024 * 1024) {
            const isSpanish = UTILS.isSpanishMode();
            const t = translations[isSpanish ? 'es' : 'en'];
            showNotification(t.invalidFavoritesFile, 4000);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const isSpanish = UTILS.isSpanishMode();
            const lang = isSpanish ? 'es' : 'en';
            const t = translations[lang];
            try {
                const data = JSON.parse(event.target.result);

                if (!data.favorites || !Array.isArray(data.favorites)) {
                    showNotification(t.invalidFavoritesFile, 4000);
                    return;
                }

                const currentFavs = UTILS.getFavorites();
                const importedFavs = normalizeFavorites(data.favorites);

                if (importedFavs.length === 0) {
                    showNotification(t.invalidFavoritesFile, 4000);
                    return;
                }

                // Merge and deduplicate
                const mergedFavs = [...new Set([...currentFavs, ...importedFavs])].sort();

                localStorage.setItem(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(mergedFavs));

                const newCount = mergedFavs.length - currentFavs.length;
                if (newCount > 0) {
                    const plural = newCount !== 1 ? 's' : '';
                    const message = t.importedFavorites
                        .replace('{count}', newCount)
                        .replace(/{plural}/g, plural)
                        .replace('{total}', mergedFavs.length);
                    showNotification(message, 4000);

                    window.dispatchEvent(new CustomEvent('favorites-changed', {
                        detail: { favorites: mergedFavs, source: 'import' }
                    }));

                    window.syncFavoritesToDrive?.();
                } else {
                    showNotification(t.allFavoritesExist, 3000);
                }
            } catch (error) {
                showNotification(t.errorReadingFile, 4000);
            }
        };

        reader.readAsText(file);
        fileInput.value = ''; // Reset input
    };

    fileInput.click();
}

function RandomClick() {
    if (stepTop10BrowseIndex('random')) return;

    if (!navigator.onLine) {
        const language = UTILS.isSpanishMode() ? 'es' : 'en';
        const comics = UTILS.getOfflineComics(language);
        if (comics.length === 0) return;
        const currentIso = UTILS.dateToISODateString(currentselectedDate);
        const pool = comics.filter(comic => comic.date !== currentIso);
        const chosen = pool.length > 0
            ? pool[Math.floor(Math.random() * pool.length)]
            : comics[0];
        currentselectedDate = UTILS.dateFromISODateString(chosen.date);
        CompareDates();
        updateOfflineNavigationControls(currentselectedDate, language);
        showComic();
        return;
    }

    if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
        resetShuffleSession();
    }

    if (document.getElementById('showfavs').checked) {
        const favs = UTILS.getFavorites();
        currentselectedDate = UTILS.dateFromFavoriteDateString(favs[Math.floor(Math.random() * favs.length)]);
    } else {
        const start = UTILS.dateFromISODateString(UTILS.isSpanishMode() ? CONFIG.GARFIELD_START_ES : CONFIG.GARFIELD_START_EN);
        const end = UTILS.getEasternDate();
        currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }
    CompareDates();
    showComic();
}

function CompareDates() {
    if (syncTop10NavigationControls()) return;
    const favs = UTILS.getFavorites();
    let startDate;
    if (document.getElementById('showfavs').checked) {
        if (!favs.length) {
            document.getElementById('showfavs').checked = false;
            document.getElementById('showfavs').disabled = true;
            localStorage.setItem(CONFIG.STORAGE_KEYS.SHOW_FAVS, 'false');
        }
        setDatePickerDisabled(true);
        startDate = favs.length ? UTILS.dateFromFavoriteDateString(favs[0]) : UTILS.getEasternDate();
    } else {
        setDatePickerDisabled(false);
        startDate = UTILS.dateFromISODateString(UTILS.isSpanishMode() ? CONFIG.GARFIELD_START_ES : CONFIG.GARFIELD_START_EN);
    }
    startDate = startDate.setHours(0, 0, 0, 0);
    currentselectedDate = currentselectedDate.setHours(0, 0, 0, 0);
    startDate = new Date(startDate);
    currentselectedDate = new Date(currentselectedDate);
    if (currentselectedDate.getTime() <= startDate.getTime()) {
        document.getElementById('Previous').disabled = true;
        document.getElementById('First').disabled = true;
        formatDate(startDate);
        startDate = year + '-' + month + '-' + day;
        currentselectedDate = UTILS.createLocalDate(Number(year), Number(month), Number(day));
    } else {
        document.getElementById('Previous').disabled = false;
        document.getElementById('First').disabled = false;
    }
    let endDate;
    if (document.getElementById('showfavs').checked) {
        endDate = UTILS.dateFromFavoriteDateString(favs[favs.length - 1]);
    } else {
        // Use Eastern Time — comics are released based on ET midnight, not local time.
        // Without this, users east of ET can navigate to "tomorrow" before the comic exists.
        endDate = UTILS.getEasternDate();
    }
    endDate = endDate.setHours(0, 0, 0, 0);
    endDate = new Date(endDate);
    if (currentselectedDate.getTime() >= endDate.getTime()) {
        document.getElementById('Next').disabled = true;
        document.getElementById('Last').disabled = true;
        formatDate(endDate);
        endDate = year + '-' + month + '-' + day;
        currentselectedDate = UTILS.createLocalDate(Number(year), Number(month), Number(day));
    } else {
        document.getElementById('Next').disabled = false;
        document.getElementById('Last').disabled = false;
    }
    if (document.getElementById('showfavs').checked) {
        if (favs.length === 1) {
            document.getElementById('Random').disabled = true;
            document.getElementById('Previous').disabled = true;
            document.getElementById('First').disabled = true;
        } else {
            document.getElementById('Random').disabled = false;
        }
    } else {
        document.getElementById('Random').disabled = false;
    }

    if (typeof isShuffleEnabled === 'function' && isShuffleEnabled()) {
        setDatePickerDisabled(true);
        document.getElementById('First').disabled = !UTILS.canShuffleNavigate('first');
        document.getElementById('Previous').disabled = !UTILS.canShuffleNavigate('previous');
        document.getElementById('Random').disabled = true;
        document.getElementById('Next').disabled = !UTILS.canShuffleNavigate('next');
        document.getElementById('Last').disabled = !UTILS.canShuffleNavigate('last');
    }

    updateToolbarModeControls();
}

function formatDate(datetoFormat) {
    const d = datetoFormat.getDate();
    const m = datetoFormat.getMonth() + 1;
    year = datetoFormat.getFullYear();
    month = String(m).padStart(2, '0');
    day = String(d).padStart(2, '0');
}

// ========================================
// SETTINGS EVENT HANDLERS
// ========================================

document.getElementById('swipe')?.addEventListener('change', function() {
    if (this.checked) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SWIPE, 'true');
    } else {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SWIPE, 'false');
        CompareDates();
        showComic();
    }
    window.syncFavoritesToDrive?.();
});

document.getElementById('lastdate')?.addEventListener('change', function() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_DATE, this.checked ? 'true' : 'false');
});

document.getElementById('darkmode')?.addEventListener('click', function() {
    const useDarkMode = !getDarkModeControlState(this);
    setDarkModeControlState(this, useDarkMode);
    localStorage.setItem(CONFIG.STORAGE_KEYS.DARK_MODE, useDarkMode ? 'true' : 'false');
    applyDarkMode(useDarkMode);
    window.syncFavoritesToDrive?.();
});

document.getElementById('showfavs')?.addEventListener('change', function() {
    resetShuffleSession();
    const favs = UTILS.getFavorites();
    if (this.checked) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SHOW_FAVS, 'true');
        if (favs.indexOf(formattedComicDate) === -1) {
            currentselectedDate = UTILS.dateFromFavoriteDateString(favs[0]);
        }
    } else {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SHOW_FAVS, 'false');
    }
    CompareDates();
    showComic();
});

const spanishCheckbox = document.getElementById('spanish');
if (spanishCheckbox) {
    spanishCheckbox.addEventListener('change', async function() {
        resetShuffleSession();
        const isSpanish = this.checked;
        const datePicker = document.getElementById('DatePicker');
        const t = translations[isSpanish ? 'es' : 'en'];

        if (isSpanish) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.SPANISH, 'true');
            translateInterface('es');
            document.documentElement.lang = 'es';
            if (datePicker) datePicker.min = CONFIG.GARFIELD_START_ES;

            const spanishStartDate = UTILS.dateFromISODateString(CONFIG.GARFIELD_START_ES);
            const isBeforeStart = currentselectedDate < spanishStartDate;

            if (isBeforeStart) {
                currentselectedDate = UTILS.getEasternDate();
                showNotification(t.spanishNotAvailable, 6000);
                CompareDates();
                showComic();
            } else {
                CompareDates();
                const loadResult = await loadComic(currentselectedDate, true);
                if (!loadResult.success) {
                    currentselectedDate = UTILS.getEasternDate();
                    showNotification(t.spanishNotAvailable, 6000);
                    CompareDates();
                    showComic();
                }
            }
        } else {
            localStorage.setItem(CONFIG.STORAGE_KEYS.SPANISH, 'false');
            translateInterface('en');
            document.documentElement.lang = 'en';
            if (datePicker) datePicker.min = CONFIG.GARFIELD_START_EN;
            CompareDates();
            showComic();
        }

        window.syncFavoritesToDrive?.();
    });
}

// ========================================
// COMIC SOURCE SETTING
// ========================================

/**
 * Show or hide the Spanish checkbox row and adjust the date-picker minimum
 * based on the selected comic source.
 * GoComics supports Spanish; Fandom Wiki, uClick and ArcaMax do not.
 */
function _applySourceSetting(source) {
    const spanishRow = document.getElementById('spanish-setting-row');
    const datePicker = document.getElementById('DatePicker');
    const isGoComics = source === 'gocomics';

    if (spanishRow) spanishRow.style.display = isGoComics ? '' : 'none';

    if (!isGoComics) {
        // Force English when not on GoComics
        const spanishEl = document.getElementById('spanish');
        if (spanishEl) spanishEl.checked = false;
        translateInterface('en');
        document.documentElement.lang = 'en';
        localStorage.setItem(CONFIG.STORAGE_KEYS.SPANISH, 'false');
        if (datePicker) datePicker.min = CONFIG.GARFIELD_START_EN;
    }
}

function getValidComicSource(source) {
    return source === 'fandom' || source === 'uclick' || source === 'gocomics' ? source : 'gocomics';
}

const sourceSelect = document.getElementById('comicSource');
if (sourceSelect) {
    sourceSelect.addEventListener('change', function () {
        const source = getValidComicSource(this.value);
        localStorage.setItem(CONFIG.STORAGE_KEYS.SOURCE, source);
        resetShuffleSession();
        _applySourceSetting(source);
        CompareDates();
        showComic();
        window.syncFavoritesToDrive?.();
    });
}

// Initialize settings panel (checkbox states are now initialized in initApp)
const settingsStatus = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
const panel = document.getElementById("settingsDIV");
if (panel) {
	if (settingsStatus === "true") {
		panel.classList.add('visible');
	} else {
		panel.classList.remove('visible');
	}
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

/**
 * Handle a click on the install button.
 * Registered exactly once (see below) so repeated `beforeinstallprompt` events
 * cannot stack duplicate listeners and fire `prompt()` more than once.
 */
async function handleInstallButtonClick() {
  const installBtn = document.getElementById('installBtn');
  if (!deferredPrompt) {
    return;
  }

  // Show the install prompt
  deferredPrompt.prompt();

  // Wait for the user to respond
  const choiceResult = await deferredPrompt.userChoice;

  if (choiceResult.outcome === 'accepted' && installBtn) {
    installBtn.style.display = 'none';
  }

  deferredPrompt = null;
}

function showInstallButton() {
  const installBtn = document.getElementById('installBtn');
  if (!installBtn) return;

  installBtn.style.display = 'block';

  if (installBtn.dataset.installHandlerBound === 'true') return;
  installBtn.dataset.installHandlerBound = 'true';
  installBtn.addEventListener('click', handleInstallButtonClick);
}

// ========================================
// GLOBAL FAVORITES LEADERBOARD
// ========================================

async function favoritesApiFetch(path, init = {}, { includeAuth = true, requireAuth = false } = {}) {
    const headers = new Headers(init.headers || {});

    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    if (includeAuth && typeof window.getFavoritesApiAccessToken === 'function') {
        const accessToken = await window.getFavoritesApiAccessToken();
        if (accessToken) {
            headers.set('Authorization', `Bearer ${accessToken}`);
        }
    }

    if (requireAuth && !headers.has('Authorization')) {
        const error = new Error('Google sign-in required');
        error.code = 'FAVORITES_AUTH_REQUIRED';
        throw error;
    }

    return fetch(`${CONFIG.FAVORITES_API_URL}${path}`, {
        ...init,
        headers,
        // Without a deadline a stalled connection leaves the leaderboard modal
        // spinning forever and favorite votes silently pending.
        signal: init.signal || AbortSignal.timeout(CONFIG.FAVORITES_API_TIMEOUT_MS)
    });
}

async function reportFavoriteToggle(date, action) {
    try {
        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return;

        const response = await favoritesApiFetch('/favorite', {
            method: 'POST',
            body: JSON.stringify({ date, action })
        }, { requireAuth: true });

        if (!response.ok) throw new Error(`Top Favorites update failed: ${response.status}`);

        const data = await response.json().catch(() => null);
        if (data && typeof data.count === 'number') {
            setTop10EntryCount(date, data.count, data.updatedAt);
        }
    } catch (error) {
        // Signed-out visitors simply do not vote; favoriting is a local action and
        // nagging them to sign in every time would be noise, not information.
        if (error?.code === 'FAVORITES_AUTH_REQUIRED') return;

        const language = UTILS.isSpanishMode() ? 'es' : 'en';
        showNotification(translations[language].favoriteVoteFailed, 6000);
        console.error('Top Favorites update failed:', error);
    }
}

function getValidFavoriteDates(favorites) {
    return normalizeFavorites(favorites).sort();
}

function favoritesMigrationKey(accountId) {
    return `${CONFIG.STORAGE_KEYS.FAVS_MIGRATED_DATES}:${CONFIG.FAVORITES_MIGRATION_VERSION}:${encodeURIComponent(accountId)}`;
}

function getMigratedFavoriteDates(accountId) {
    return getValidFavoriteDates(UTILS.safeJSONParse(localStorage.getItem(favoritesMigrationKey(accountId)), []));
}

function markFavoritesAsMigrated(dates, accountId) {
    const merged = [...new Set([...getMigratedFavoriteDates(accountId), ...getValidFavoriteDates(dates)])].sort();
    localStorage.setItem(favoritesMigrationKey(accountId), JSON.stringify(merged));
}

function refreshFavoritesDependentUI(favorites = UTILS.getFavorites()) {
    const validFavorites = getValidFavoriteDates(favorites);
    const showFavsCheckbox = document.getElementById('showfavs');

    if (showFavsCheckbox) {
        showFavsCheckbox.disabled = validFavorites.length === 0;
        if (validFavorites.length === 0) {
            showFavsCheckbox.checked = false;
        }
    }

    updateExportButtonState();

    if (typeof currentselectedDate !== 'undefined' && currentselectedDate) {
        CompareDates();
    }

    UTILS.updateHeartIcon();
}

function migrateExistingFavorites(favorites = UTILS.getFavorites()) {
    const validFavorites = getValidFavoriteDates(favorites);

    _favoritesMigrationQueue = _favoritesMigrationQueue
        .catch(() => {})
        .then(async () => {
            try {
                const identity = await window.getFavoritesApiIdentity?.();
                if (!identity) return;
                const migratedDates = new Set(getMigratedFavoriteDates(identity.accountId));
                const pendingDates = validFavorites.filter(date => !migratedDates.has(date));
                for (let offset = 0; offset < pendingDates.length; offset += CONFIG.FAVORITES_MIGRATION_BATCH_SIZE) {
                    const dates = pendingDates.slice(offset, offset + CONFIG.FAVORITES_MIGRATION_BATCH_SIZE);
                    const response = await favoritesApiFetch('/migrate', {
                        method: 'POST', cache: 'no-store',
                        headers: { Authorization: `Bearer ${identity.accessToken}` },
                        body: JSON.stringify({ dates })
                    }, { includeAuth: false, requireAuth: true });
                    if (!response.ok) return;
                    const data = await response.json().catch(() => null);
                    if (!data?.ok) return;
                    markFavoritesAsMigrated(dates, identity.accountId);
                }
            } catch { /* noop */ }
        });

    return _favoritesMigrationQueue;
}

window.addEventListener('google-auth-changed', event => {
    if (event.detail?.signedIn) migrateExistingFavorites();
});

async function fetchTop10() {
    const response = await favoritesApiFetch('/top', { cache: 'no-store' }, { includeAuth: false });
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return response.json();
}

configureRotation({
    canExitAfterGesture: () =>
        Date.now() - lastSwipeTime >= CONFIG.SWIPE_CLICK_DEBOUNCE_MS &&
        Date.now() >= suppressComicClickUntil,
    bindComicTapGestures,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isSpanishMode: () => UTILS.isSpanishMode(),
    isMobileOrTouch: () => UTILS.isMobileOrTouch()
});

configureShuffle({
    getConfig: () => CONFIG,
    getUtils: () => UTILS,
    getCurrentDate: () => currentselectedDate,
    setCurrentDate: date => { currentselectedDate = date; },
    getFormattedComicDate: () => formattedComicDate,
    isTop10Mode: () => isTop10ModeActive(),
    compareDates: CompareDates,
    showComic: () => showComic()
});

configureTopFavorites({
    getUtils: () => UTILS,
    fetchTop10,
    setCurrentDate: date => { currentselectedDate = date; },
    compareDates: CompareDates,
    showComic: () => showComic()
});

window.showTop10Modal = showTop10Modal;
window.closeTop10Modal = closeTop10Modal;
window.exitTop10Mode = exitTop10Mode;


