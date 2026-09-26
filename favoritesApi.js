import { CONFIG, safeJSONParse } from './config.js';
import { normalizeFavorites } from './favorites.js';

// Community leaderboard API: votes, one-time migration of existing favorites, and the top list.
const hooks = { onEntryCount() {}, onVoteFailed() {} };
let _favoritesMigrationQueue = Promise.resolve();

/**
 * @param {{ onEntryCount?: (date: string, count: number, updatedAt?: string) => void, onVoteFailed?: () => void }} handlers
 */
export function configureFavoritesApi(handlers) {
    Object.assign(hooks, handlers);
}

export async function favoritesApiFetch(path, init = {}, { includeAuth = true, requireAuth = false } = {}) {
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

export async function reportFavoriteToggle(date, action) {
    try {
        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return;

        const response = await favoritesApiFetch('/favorite', {
            method: 'POST',
            body: JSON.stringify({ date, action })
        }, { requireAuth: true });

        if (!response.ok) throw new Error(`Top Favorites update failed: ${response.status}`);

        const data = await response.json().catch(() => null);
        if (data && typeof data.count === 'number') {
            hooks.onEntryCount(date, data.count, data.updatedAt);
        }
    } catch (error) {
        // Signed-out visitors simply do not vote; favoriting is a local action and
        // nagging them to sign in every time would be noise, not information.
        if (error?.code === 'FAVORITES_AUTH_REQUIRED') return;

        hooks.onVoteFailed();
        console.error('Top Favorites update failed:', error);
    }
}

export function getValidFavoriteDates(favorites) {
    return normalizeFavorites(favorites).sort();
}

function favoritesMigrationKey(accountId) {
    return `${CONFIG.STORAGE_KEYS.FAVS_MIGRATED_DATES}:${CONFIG.FAVORITES_MIGRATION_VERSION}:${encodeURIComponent(accountId)}`;
}

function getMigratedFavoriteDates(accountId) {
    return getValidFavoriteDates(safeJSONParse(localStorage.getItem(favoritesMigrationKey(accountId)), []));
}

function markFavoritesAsMigrated(dates, accountId) {
    const merged = [...new Set([...getMigratedFavoriteDates(accountId), ...getValidFavoriteDates(dates)])].sort();
    localStorage.setItem(favoritesMigrationKey(accountId), JSON.stringify(merged));
}

export function migrateExistingFavorites(favorites) {
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

export async function fetchTop10() {
    const response = await favoritesApiFetch('/top', { cache: 'no-store' }, { includeAuth: false });
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    return response.json();
}
