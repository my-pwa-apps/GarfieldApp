// ========================================
// GOOGLE DRIVE SYNC MODULE
// ========================================

const GOOGLE_CLIENT_ID = '495923472176-iummunjkudkt4p7bqtd5m7441664gl6t.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata profile email';
const FAVORITES_FILENAME = 'garfield-favorites.json';

let tokenClient = null;
let accessToken = null;

// Safe access to app.js globals (module-scoped, exposed via window.*)
function _notify(msg) { if (typeof window.showNotification === 'function') window.showNotification(msg); }
function _getFavorites() { return typeof window.UTILS !== 'undefined' ? window.UTILS.getFavorites() : JSON.parse(localStorage.getItem('favs') || '[]'); }
function _isSpanish() { return typeof window.UTILS !== 'undefined' ? window.UTILS.isSpanishMode() : false; }
function _getFavsKey() { return (typeof window.CONFIG !== 'undefined' && window.CONFIG.STORAGE_KEYS) ? window.CONFIG.STORAGE_KEYS.FAVS : 'favs'; }
function _t(key) { const lang = _isSpanish() ? 'es' : 'en'; const dict = typeof window.translations !== 'undefined' ? window.translations[lang] : null; return dict ? dict[key] : null; }
function _getSyncPreferences() { return typeof window.getSyncPreferences === 'function' ? window.getSyncPreferences() : null; }
function _applySyncedPreferences(preferences) { if (typeof window.applySyncedPreferences === 'function') window.applySyncedPreferences(preferences); }

/**
 * Initialize Google Identity Services token client.
 * Retries if the GIS script hasn't loaded yet.
 */
function initGoogleSync() {
    if (typeof google !== 'undefined' && google.accounts) {
        _initTokenClient();
        return;
    }
    // GIS script not loaded yet — wait for it (up to 10s)
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (typeof google !== 'undefined' && google.accounts) {
            clearInterval(interval);
            _initTokenClient();
        } else if (attempts >= 20) {
            clearInterval(interval);
        }
    }, 500);
}

function _initTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: handleTokenResponse
    });

    window.dispatchEvent(new CustomEvent('google-sync-ready'));

    // Check for existing token in session
    const stored = sessionStorage.getItem('gDriveToken');
    if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiry > Date.now()) {
            accessToken = parsed.token;
            updateGoogleUI(true, 'restore');
            // Auto-pull favorites on session restore
            pullFavoritesFromDrive();
        }
    }
}

/**
 * Handle the OAuth token response from Google.
 */
function handleTokenResponse(response) {
    if (response.error) {
        console.error('Google auth error:', response.error);
        _notify(_t('googleSignInFailed') || 'Google sign-in failed');
        return;
    }

    accessToken = response.access_token;
    // Store token with expiry (~1 hour)
    sessionStorage.setItem('gDriveToken', JSON.stringify({
        token: accessToken,
        expiry: Date.now() + (response.expires_in * 1000)
    }));

    updateGoogleUI(true, 'user');
    fetchGoogleUserInfo();
    // Auto-pull favorites from Drive on sign-in
    pullFavoritesFromDrive();
}

/**
 * Sign in with Google — triggers the consent popup.
 */
function googleSignIn() {
    if (!tokenClient) {
        _notify(_t('googleNotLoaded') || 'Google services not loaded');
        return;
    }
    tokenClient.requestAccessToken();
}

/**
 * Sign out — revoke the token and clear state.
 */
function googleSignOut() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
    sessionStorage.removeItem('gDriveToken');
    sessionStorage.removeItem('gDriveUser');
    updateGoogleUI(false, 'signout');
}

/**
 * Fetch the user's display name/email for the UI.
 */
async function fetchGoogleUserInfo() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const display = data.name || data.email || 'Google User';
        sessionStorage.setItem('gDriveUser', display);
        const nameEl = document.getElementById('googleUserName');
        if (nameEl) nameEl.textContent = display;
    } catch (_) { /* non-critical */ }
}

/**
 * Find the favorites file in Drive appData folder.
 * Returns the file ID or null.
 */
async function findFavoritesFile() {
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${FAVORITES_FILENAME}'&fields=files(id)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error('Failed to search Drive');
    const data = await res.json();
    return data.files?.length > 0 ? data.files[0].id : null;
}

/**
 * Push current favorites to Google Drive (auto-sync, silent).
 * Called automatically when favorites change.
 */
async function syncFavoritesToDrive() {
    if (!accessToken) return;

    const favs = _getFavorites();
    const preferences = _getSyncPreferences();

    try {
        const fileId = await findFavoritesFile();
        const content = JSON.stringify({
            version: 2,
            favorites: favs,
            preferences
        });

        if (fileId) {
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: content
            });
        } else {
            const metadata = { name: FAVORITES_FILENAME, parents: ['appDataFolder'] };
            const boundary = 'garfield_sync_boundary';
            const body =
                `--${boundary}\r\n` +
                `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                `${JSON.stringify(metadata)}\r\n` +
                `--${boundary}\r\n` +
                `Content-Type: application/json\r\n\r\n` +
                `${content}\r\n` +
                `--${boundary}--`;

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body
            });
        }
    } catch (err) {
        console.error('Auto-sync to Drive failed:', err);
    }
}

/**
 * Pull favorites from Google Drive and merge with local.
 * Called on sign-in and session restore.
 */
async function pullFavoritesFromDrive() {
    if (!accessToken) return;

    try {
        const fileId = await findFavoritesFile();
        if (!fileId) return;

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return;

        const cloudData = await res.json();

        let cloudDates = [];
        let cloudPreferences = null;

        if (Array.isArray(cloudData)) {
            // Legacy formats: plain ["date"] and older [{date}]
            cloudData.forEach(item => {
                if (typeof item === 'string') {
                    cloudDates.push(item);
                } else if (item && typeof item === 'object' && item.date) {
                    cloudDates.push(item.date);
                }
            });
        } else if (cloudData && typeof cloudData === 'object') {
            if (Array.isArray(cloudData.favorites)) {
                cloudDates = cloudData.favorites.filter(item => typeof item === 'string');
            }
            if (cloudData.preferences && typeof cloudData.preferences === 'object') {
                cloudPreferences = cloudData.preferences;
            }
        } else {
            return;
        }

        const localFavs = _getFavorites();
        const merged = [...new Set([...localFavs, ...cloudDates])].sort();
        const newCount = merged.length - localFavs.length;

        if (cloudPreferences) {
            _applySyncedPreferences(cloudPreferences);
        }

        if (newCount > 0) {
            localStorage.setItem(_getFavsKey(), JSON.stringify(merged));
            // Update heart icon if available
            if (typeof window.UTILS !== 'undefined') window.UTILS.updateHeartIcon();
            _notify((_t('googleDownloadSuccess') || 'Synced {count} new favorites from Google Drive.').replace('{count}', newCount).replace('{total}', merged.length));
        }

        const localPreferences = _getSyncPreferences();
        const cloudPreferencesRaw = JSON.stringify(cloudPreferences || {});
        const localPreferencesRaw = JSON.stringify(localPreferences || {});

        // If local has items not in cloud, or the cloud file is legacy/missing preferences, push back
        if (merged.length > cloudDates.length || cloudPreferencesRaw !== localPreferencesRaw) {
            syncFavoritesToDrive();
        }
    } catch (err) {
        console.error('Pull from Drive failed:', err);
    }
}

/**
 * Update the UI to reflect signed-in / signed-out state.
 */
function updateGoogleUI(signedIn, source = 'unknown') {
    const signInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('googleSignOutBtn');
    const nameEl = document.getElementById('googleUserName');
    const descEl = document.getElementById('googleSyncDesc');

    if (signInBtn) signInBtn.style.display = signedIn ? 'none' : 'flex';
    if (signOutBtn) signOutBtn.style.display = signedIn ? 'flex' : 'none';
    if (descEl) descEl.style.display = signedIn ? 'none' : '';

    if (signedIn && nameEl) {
        const stored = sessionStorage.getItem('gDriveUser');
        if (stored) nameEl.textContent = stored;
    }

    window.dispatchEvent(new CustomEvent('google-sync-auth-changed', {
        detail: { signedIn, source }
    }));
}

// Expose to global scope for app.js
window.initGoogleSync = initGoogleSync;
window.googleSignIn = googleSignIn;
window.googleSignOut = googleSignOut;
window.syncFavoritesToDrive = syncFavoritesToDrive;
window.isGoogleDriveSignedIn = function isGoogleDriveSignedIn() {
    return Boolean(accessToken);
};
window.isGoogleDriveReady = function isGoogleDriveReady() {
    return Boolean(tokenClient);
};
