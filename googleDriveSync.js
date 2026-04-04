// ========================================
// GOOGLE DRIVE SYNC MODULE
// ========================================

const GOOGLE_CLIENT_ID = '495923472176-iummunjkudkt4p7bqtd5m7441664gl6t.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const FAVORITES_FILENAME = 'garfield-favorites.json';

let tokenClient = null;
let accessToken = null;

/**
 * Initialize Google Identity Services token client.
 * Must be called after the GIS script has loaded.
 */
function initGoogleSync() {
    if (typeof google === 'undefined' || !google.accounts) return;

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
        showNotification('Google sign-in failed');
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
        showNotification('Google services not loaded');
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
        showNotification('Please sign in with Google first');
        return;
    }

    const favs = UTILS.getFavorites();
    if (!favs.length) {
        const lang = UTILS.isSpanishMode() ? 'es' : 'en';
        const t = translations[lang] || translations.en;
        showNotification(t.noFavoritesToExport);
        return;
    }

    const uploadBtn = document.getElementById('googleUploadBtn');
    if (uploadBtn) uploadBtn.disabled = true;

    try {
        const fileId = await findFavoritesFile();
        const content = JSON.stringify(favs, null, 2);

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

        const lang = UTILS.isSpanishMode() ? 'es' : 'en';
        const t = translations[lang] || translations.en;
        showNotification(t.googleUploadSuccess.replace('{count}', favs.length));
    } catch (err) {
        console.error('Upload failed:', err);
        showNotification('Upload failed. Please try again.');
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
    }
}

/**
 * Download favorites from Google Drive and merge with local.
 */
async function downloadFavoritesFromDrive() {
    if (!accessToken) {
        showNotification('Please sign in with Google first');
        return;
    }

    const downloadBtn = document.getElementById('googleDownloadBtn');
    if (downloadBtn) downloadBtn.disabled = true;

    try {
        const fileId = await findFavoritesFile();
        if (!fileId) {
            showNotification('No favorites found in Google Drive');
            return;
        }

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) throw new Error('Failed to download');

        const cloudFavs = await res.json();

        if (!Array.isArray(cloudFavs)) {
            const lang = UTILS.isSpanishMode() ? 'es' : 'en';
            const t = translations[lang] || translations.en;
            showNotification(t.invalidFavoritesFile);
            return;
        }

        // Merge: union of local + cloud (no duplicates)
        const localFavs = UTILS.getFavorites();
        const merged = [...new Set([...localFavs, ...cloudFavs])];
        const newCount = merged.length - localFavs.length;

        localStorage.setItem(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(merged));

        const lang = UTILS.isSpanishMode() ? 'es' : 'en';
        const t = translations[lang] || translations.en;
        if (newCount > 0) {
            showNotification(t.googleDownloadSuccess.replace('{count}', newCount).replace('{total}', merged.length));
        } else {
            showNotification(t.allFavoritesExist);
        }
    } catch (err) {
        console.error('Download failed:', err);
        showNotification('Download failed. Please try again.');
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
