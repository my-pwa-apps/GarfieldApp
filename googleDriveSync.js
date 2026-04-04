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
function _getFavImagesKey() { return (typeof window.CONFIG !== 'undefined' && window.CONFIG.STORAGE_KEYS) ? window.CONFIG.STORAGE_KEYS.FAV_IMAGES : 'favImages'; }
function _t(key) { const lang = _isSpanish() ? 'es' : 'en'; const dict = typeof window.translations !== 'undefined' ? window.translations[lang] : null; return dict ? dict[key] : null; }

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

    // Check for existing token in session
    const stored = sessionStorage.getItem('gDriveToken');
    if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiry > Date.now()) {
            accessToken = parsed.token;
            updateGoogleUI(true);
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

    updateGoogleUI(true);
    fetchGoogleUserInfo();
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
    updateGoogleUI(false);
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
 * Upload favorites to Google Drive appData folder.
 * Creates or updates the file.
 */
async function uploadFavoritesToDrive() {
    if (!accessToken) {
        _notify(_t('googleSignInFirst') || 'Please sign in with Google first');
        return;
    }

    const favs = _getFavorites();
    if (!favs.length) {
        _notify(_t('noFavoritesToExport') || 'No favorites to export.');
        return;
    }

    // Build enriched data: combine dates with their cached images
    const images = JSON.parse(localStorage.getItem(_getFavImagesKey()) || '{}');
    const enrichedFavs = favs.map(date => {
        const entry = { date };
        if (images[date]) entry.imageData = images[date];
        return entry;
    });

    const uploadBtn = document.getElementById('googleUploadBtn');
    if (uploadBtn) uploadBtn.disabled = true;

    try {
        const fileId = await findFavoritesFile();
        const content = JSON.stringify(enrichedFavs);

        if (fileId) {
            // Update existing file
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: content
            });
        } else {
            // Create new file with multipart upload
            const metadata = {
                name: FAVORITES_FILENAME,
                parents: ['appDataFolder']
            };

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

        const lang = _isSpanish() ? 'es' : 'en';
        _notify((_t('googleUploadSuccess') || 'Uploaded {count} favorites to Google Drive.').replace('{count}', favs.length));
    } catch (err) {
        console.error('Upload failed:', err);
        _notify('Upload failed. Please try again.');
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
    }
}

/**
 * Download favorites from Google Drive and merge with local.
 */
async function downloadFavoritesFromDrive() {
    if (!accessToken) {
        _notify(_t('googleSignInFirst') || 'Please sign in with Google first');
        return;
    }

    const downloadBtn = document.getElementById('googleDownloadBtn');
    if (downloadBtn) downloadBtn.disabled = true;

    try {
        const fileId = await findFavoritesFile();
        if (!fileId) {
            _notify('No favorites found in Google Drive');
            return;
        }

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) throw new Error('Failed to download');

        const cloudData = await res.json();

        // Handle both formats: enriched [{date, imageData}] and legacy ["date"]
        let cloudDates = [];
        let cloudImages = {};

        if (Array.isArray(cloudData)) {
            cloudData.forEach(item => {
                if (typeof item === 'string') {
                    // Legacy format: plain date string
                    cloudDates.push(item);
                } else if (item && typeof item === 'object' && item.date) {
                    // Enriched format: {date, imageData}
                    cloudDates.push(item.date);
                    if (item.imageData) cloudImages[item.date] = item.imageData;
                }
            });
        } else {
            _notify(_t('invalidFavoritesFile') || 'Invalid favorites file format.');
            return;
        }

        // Merge dates: union of local + cloud (no duplicates)
        const localFavs = _getFavorites();
        const merged = [...new Set([...localFavs, ...cloudDates])];
        const newCount = merged.length - localFavs.length;

        localStorage.setItem(_getFavsKey(), JSON.stringify(merged));

        // Merge images: cloud images fill in any missing local ones
        if (Object.keys(cloudImages).length > 0) {
            const localImages = JSON.parse(localStorage.getItem(_getFavImagesKey()) || '{}');
            let imagesUpdated = false;
            for (const [date, data] of Object.entries(cloudImages)) {
                if (!localImages[date]) {
                    localImages[date] = data;
                    imagesUpdated = true;
                }
            }
            if (imagesUpdated) {
                try {
                    localStorage.setItem(_getFavImagesKey(), JSON.stringify(localImages));
                } catch (_) { /* storage full — images are optional */ }
            }
        }

        if (newCount > 0) {
            _notify((_t('googleDownloadSuccess') || 'Downloaded {count} new favorites. Total: {total}').replace('{count}', newCount).replace('{total}', merged.length));
        } else {
            _notify(_t('allFavoritesExist') || 'All favorites already exist.');
        }
    } catch (err) {
        console.error('Download failed:', err);
        _notify('Download failed. Please try again.');
    } finally {
        if (downloadBtn) downloadBtn.disabled = false;
    }
}

/**
 * Update the UI to reflect signed-in / signed-out state.
 */
function updateGoogleUI(signedIn) {
    const signInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('googleSignOutBtn');
    const syncSection = document.getElementById('googleSyncSection');
    const nameEl = document.getElementById('googleUserName');

    if (signInBtn) signInBtn.style.display = signedIn ? 'none' : 'flex';
    if (signOutBtn) signOutBtn.style.display = signedIn ? 'flex' : 'none';
    if (syncSection) syncSection.style.display = signedIn ? 'flex' : 'none';

    if (signedIn && nameEl) {
        const stored = sessionStorage.getItem('gDriveUser');
        if (stored) nameEl.textContent = stored;
    }
}

// Expose to global scope for app.js
window.initGoogleSync = initGoogleSync;
window.googleSignIn = googleSignIn;
window.googleSignOut = googleSignOut;
window.uploadFavoritesToDrive = uploadFavoritesToDrive;
window.downloadFavoritesFromDrive = downloadFavoritesFromDrive;
