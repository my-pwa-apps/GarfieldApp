/**
 * Application Configuration
 * Central location for all magic numbers and configuration values
 */
export const CONFIG = Object.freeze({
    // Swipe & touch detection
    SWIPE_MIN_DISTANCE: 50,               // Minimum swipe distance in px
    SWIPE_MAX_TIME: 500,                  // Maximum swipe time in ms
    SWIPE_CLICK_DEBOUNCE_MS: 300,         // Ignore clicks for this long after a swipe

    // Comic dates
    GARFIELD_START_EN: '1978-06-19',      // First English Garfield comic
    GARFIELD_START_ES: '1999-12-06',      // First Spanish Garfield comic

    // Favorites leaderboard API
    FAVORITES_API_URL: 'https://favorites-api.garfieldapp.workers.dev',
    FAVORITES_API_TIMEOUT_MS: 12000,
    FAVORITES_MIGRATION_VERSION: 'google-only-v1',
    FAVORITES_MIGRATION_BATCH_SIZE: 500,

    PREFETCH_ADJACENT_DAYS: 2,            // Days to warm on each side for swipe navigation
    COMIC_LOAD_TIMEOUT_MS: 12000,
    COMIC_IMAGE_TIMEOUT_MS: 3000,
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
        FAVS_MIGRATED_DATES: 'favsMigratedDates',
        OFFLINE_COMICS: 'offlineComics'
    })
});

export function safeJSONParse(str, fallback) {
    if (str === null || str === undefined) {
        return fallback;
    }
    try {
        const parsed = JSON.parse(str);
        return parsed !== null ? parsed : fallback;
    } catch {
        return fallback;
    }
}
