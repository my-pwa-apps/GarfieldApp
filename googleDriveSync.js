import { normalizeFavorites } from './favorites.js';
import { createDriveFavoritesSync } from './driveFavorites.js';

// ========================================
// GOOGLE DRIVE SYNC MODULE
// ========================================

const GOOGLE_CLIENT_ID = '495923472176-iummunjkudkt4p7bqtd5m7441664gl6t.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata profile email';
const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SILENT_REFRESH_COOLDOWN_MS = 30000;
const GOOGLE_DRIVE_SYNC_ENABLED_KEY = 'gDriveSyncEnabled';
const GOOGLE_REQUEST_TIMEOUT_MS = 20000;
const GOOGLE_SYNC_PENDING_KEY = 'gDriveSyncPending';
/**
 * Origins on which Google sign-in may be attempted.
 *
 * Production is an exact match. Loopback development hosts are matched by
 * hostname on any port so the sync flow can actually be exercised locally
 * (`npm run serve` uses 8000, the Playwright static server uses 8010); Google
 * Identity Services treats http://localhost and http://127.0.0.1 as valid
 * JavaScript origins, so this does not widen the production attack surface.
 */
const GOOGLE_AUTH_ALLOWED_ORIGINS = [
    'https://garfieldapp.pages.dev'
];
const GOOGLE_AUTH_ALLOWED_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

let tokenClient = null;
let _gisLoadPromise = null;
let accessToken = null;
let accessTokenExpiry = 0;
let pendingTokenRequest = null;
let pendingTokenRequestResolve = null;
let pendingTokenRequestReject = null;
let pendingTokenInteractive = false;
let pendingTokenTimer = null;
let lastSilentRefreshAttempt = 0;
let accountIdentity = null;

function _storage() {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : localStorage;
}

// Safe access to app.js globals (module-scoped, exposed via window.*)
function _notify(msg) { if (typeof window.showNotification === 'function') window.showNotification(msg); }
function _getFavorites() {
    try {
        return normalizeFavorites(typeof window.UTILS !== 'undefined' ? window.UTILS.getFavorites() : JSON.parse(localStorage.getItem(_getFavsKey()) || '[]'));
    } catch (_) {
        return [];
    }
}
function _isSpanish() { return typeof window.UTILS !== 'undefined' ? window.UTILS.isSpanishMode() : false; }
function _getFavsKey() { return (typeof window.CONFIG !== 'undefined' && window.CONFIG.STORAGE_KEYS) ? window.CONFIG.STORAGE_KEYS.FAVS : 'favs'; }
function _t(key) { const lang = _isSpanish() ? 'es' : 'en'; const dict = typeof window.translations !== 'undefined' ? window.translations[lang] : null; return dict ? dict[key] : null; }
function _getSyncPreferences() { return typeof window.getSyncPreferences === 'function' ? window.getSyncPreferences() : null; }
function _applySyncedPreferences(preferences) { if (typeof window.applySyncedPreferences === 'function') window.applySyncedPreferences(preferences); }

function _isGoogleAuthAllowedOrigin() {
    if (GOOGLE_AUTH_ALLOWED_ORIGINS.includes(window.location.origin)) return true;

    return window.location.protocol === 'http:' &&
        GOOGLE_AUTH_ALLOWED_DEV_HOSTNAMES.has(window.location.hostname);
}

function _getGoogleUnavailableMessage() {
    return _t('googleUnavailableOnThisUrl') || 'Google sign-in is not available on this URL.';
}

function _getStoredTokenData() {
    const storage = _storage();
    const stored = storage.getItem('gDriveToken');
    if (!stored) return null;

    try {
        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed.token !== 'string' || typeof parsed.expiry !== 'number') {
            storage.removeItem('gDriveToken');
            return null;
        }
        return parsed;
    } catch (_) {
        _storage().removeItem('gDriveToken');
        return null;
    }
}

function _getStoredUserEmail() {
    const stored = localStorage.getItem('gDriveUserEmail');
    return typeof stored === 'string' && stored.trim() ? stored.trim() : '';
}

function _hasStoredUserContext() {
    return !!(_getStoredUserEmail() || localStorage.getItem('gDriveUser'));
}

function _isSyncEnabled() {
    return localStorage.getItem(GOOGLE_DRIVE_SYNC_ENABLED_KEY) === 'true';
}

function _setSyncEnabled(enabled) {
    if (enabled) {
        localStorage.setItem(GOOGLE_DRIVE_SYNC_ENABLED_KEY, 'true');
    } else {
        localStorage.removeItem(GOOGLE_DRIVE_SYNC_ENABLED_KEY);
    }
}

function _buildTokenRequestOptions({ interactive = false } = {}) {
    const options = {};
    const email = _getStoredUserEmail();

    if (!interactive) {
        options.prompt = 'none';
    }

    if (email) {
        options.login_hint = email;
    }

    return options;
}

function _hasUsableToken() {
    return !!(accessToken && accessTokenExpiry > (Date.now() + 60000));
}

function _canAutoSync() {
    if (!_isGoogleAuthAllowedOrigin()) return false;
    if (!_isSyncEnabled()) return false;
    return _hasUsableToken() || _restoreStoredToken();
}

function _restoreStoredToken() {
    const parsed = _getStoredTokenData();
    if (!parsed) return false;

    accessToken = parsed.token;
    accessTokenExpiry = parsed.expiry;
    return _hasUsableToken();
}

function _storeToken(token, expiresInSeconds) {
    const storage = _storage();
    accessToken = token;
    accessTokenExpiry = Date.now() + (Number(expiresInSeconds || 0) * 1000);
    storage.setItem('gDriveToken', JSON.stringify({
        token: accessToken,
        expiry: accessTokenExpiry
    }));
}

function _clearTokenState(clearUser = false) {
    _rejectPendingTokenRequest(new Error('Google token state cleared'));
    accountIdentity = null;
    accessToken = null;
    accessTokenExpiry = 0;
    pendingTokenRequest = null;
    pendingTokenRequestResolve = null;
    pendingTokenRequestReject = null;
    _storage().removeItem('gDriveToken');
    if (clearUser) {
        localStorage.removeItem('gDriveUser');
        localStorage.removeItem('gDriveUserEmail');
    }
}

function _resetPendingTokenRequest() {
    clearTimeout(pendingTokenTimer);
    pendingTokenTimer = null;
    pendingTokenRequest = null;
    pendingTokenRequestResolve = null;
    pendingTokenRequestReject = null;
    pendingTokenInteractive = false;
}

function _rejectPendingTokenRequest(error) {
    if (pendingTokenRequestReject) {
        pendingTokenRequestReject(error);
    }
    _resetPendingTokenRequest();
}

function _requestAccessToken(options = {}, { interactive = false } = {}) {
    if (!_isGoogleAuthAllowedOrigin()) {
        return Promise.reject(new Error('Google sign-in is not available on this URL'));
    }

    if (!tokenClient) {
        return Promise.reject(new Error('Google services not loaded'));
    }

    // Coalesce only when the pending request can satisfy the new caller.
    // A pending interactive request always satisfies a silent caller.
    // A pending silent request does NOT satisfy an interactive caller —
    // in that case, wait for the silent one to settle and then dispatch
    // a fresh interactive request.
    if (pendingTokenRequest) {
        if (!interactive || pendingTokenInteractive) {
            return pendingTokenRequest;
        }
        const waitFor = pendingTokenRequest.catch(() => {});
        return waitFor.then(() => {
            if (_hasUsableToken()) return accessToken;
            return _requestAccessToken(options, { interactive });
        });
    }

    pendingTokenInteractive = !!interactive;
    pendingTokenRequest = new Promise((resolve, reject) => {
        pendingTokenRequestResolve = resolve;
        pendingTokenRequestReject = reject;
        pendingTokenTimer = setTimeout(() => {
            tokenClient = null;
            _rejectPendingTokenRequest(new Error('Google token request timed out'));
        }, GOOGLE_REQUEST_TIMEOUT_MS);
        pendingTokenTimer.unref?.();

        try {
            tokenClient.requestAccessToken(options);
        } catch (error) {
            _resetPendingTokenRequest();
            reject(error);
        }
    });

    return pendingTokenRequest;
}

async function _attemptSilentTokenRefresh({ force = false } = {}) {
    if (!_isGoogleAuthAllowedOrigin()) {
        throw new Error('Google sign-in is not available on this URL');
    }

    if (!_isSyncEnabled()) {
        throw new Error('Google Drive sync is not enabled');
    }

    if (_hasUsableToken()) {
        return accessToken;
    }

    if (!tokenClient) {
        throw new Error('Google services not loaded');
    }

    const now = Date.now();
    if (!force && lastSilentRefreshAttempt && (now - lastSilentRefreshAttempt) < SILENT_REFRESH_COOLDOWN_MS) {
        throw new Error('Silent sign-in cooldown active');
    }

    lastSilentRefreshAttempt = now;
    _pendingAuthSource = 'restore';

    try {
        await _requestAccessToken(_buildTokenRequestOptions({ interactive: false }), { interactive: false });
        return accessToken;
    } catch (error) {
        _clearTokenState(false);
        throw error;
    }
}

async function ensureValidAccessToken({ interactive = false } = {}) {
    if (!_isGoogleAuthAllowedOrigin()) {
        throw new Error('Google sign-in is not available on this URL');
    }

    if (!interactive && !_isSyncEnabled()) {
        throw new Error('Google Drive sync is not enabled');
    }

    if (_hasUsableToken()) {
        return accessToken;
    }

    // If another caller already triggered a compatible token request, wait for it.
    // On failure, fall through to try other restoration paths.
    if (pendingTokenRequest && (!interactive || pendingTokenInteractive)) {
        try {
            const token = await pendingTokenRequest;
            if (token) return token;
        } catch (_) {}
    }

    if (_isSyncEnabled() && _restoreStoredToken()) {
        updateGoogleUI(true, 'restore');
        return accessToken;
    }

    if (!interactive) {
        return _attemptSilentTokenRefresh();
    }

    _pendingAuthSource = 'user';
    await _requestAccessToken(_buildTokenRequestOptions({ interactive: true }), { interactive: true });
    return accessToken;
}

async function googleApiFetch(url, options = {}, { interactive = false, retryOnAuthFailure = true } = {}) {
    const token = await ensureValidAccessToken({ interactive });
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    let response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS) });

    if (response.status === 401 && retryOnAuthFailure) {
        _clearTokenState();
        lastSilentRefreshAttempt = 0; // Allow immediate silent re-auth on 401 retry
        const refreshedToken = await ensureValidAccessToken({ interactive: false });
        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
        response = await fetch(url, { ...options, headers: retryHeaders, signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS) });
    }

    return response;
}

/**
 * Load the Google Identity Services client on demand.
 *
 * The script is roughly 100 KB of JavaScript that only matters to users who
 * actually sync, so it is no longer a blocking <script> tag in index.html.
 * Resolves with whether the client is usable; never rejects.
 *
 * @returns {Promise<boolean>}
 */
function _loadGoogleIdentityServices() {
    if (typeof google !== 'undefined' && google.accounts) return Promise.resolve(true);
    if (_gisLoadPromise) return _gisLoadPromise;

    _gisLoadPromise = new Promise(resolve => {
        const script = document.createElement('script');
        const finish = success => {
            clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (!success) script.remove();
            resolve(success);
        };
        const timer = setTimeout(() => finish(false), GOOGLE_REQUEST_TIMEOUT_MS);
        script.src = GOOGLE_IDENTITY_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => finish(typeof google !== 'undefined' && !!google.accounts);
        script.onerror = () => finish(false);
        document.head.appendChild(script);
    }).then(success => {
        if (!success) _gisLoadPromise = null;
        return success;
    });

    return _gisLoadPromise;
}

/**
 * Create the token client if Google Identity Services is already available.
 * @returns {boolean} True when a token client is ready to use.
 */
function _ensureTokenClient() {
    if (tokenClient) return true;
    if (typeof google === 'undefined' || !google.accounts) return false;
    _initTokenClient();
    return !!tokenClient;
}

/**
 * Initialize Google Identity Services token client.
 *
 * Returning users (an enabled sync flag or a stored profile) get the client
 * immediately so their session can be restored. First-time visitors pay nothing
 * until they press "Sign in".
 */
function initGoogleSync() {
    if (!_isGoogleAuthAllowedOrigin()) {
        tokenClient = null;
        _clearTokenState(false);
        updateGoogleUI(false, 'unsupported-origin');
        window.dispatchEvent(new CustomEvent('google-sync-ready'));
        return;
    }

    // Always sanitize persisted token state, even when nothing else runs.
    _getStoredTokenData();

    if (!_isSyncEnabled() && !_hasStoredUserContext()) {
        updateGoogleUI(false, 'signed-out');
        window.dispatchEvent(new CustomEvent('google-sync-ready'));
        return;
    }

    if (_ensureTokenClient()) return;

    _loadGoogleIdentityServices().then(() => {
        if (_ensureTokenClient()) return;
        updateGoogleUI(false, 'expired');
        window.dispatchEvent(new CustomEvent('google-sync-ready'));
    });
}

function _initTokenClient() {
    const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: response => { if (tokenClient === client) handleTokenResponse(response); },
        error_callback: error => { if (tokenClient === client) handleTokenClientError(error); }
    });
    tokenClient = client;

    window.dispatchEvent(new CustomEvent('google-sync-ready'));
    _getStoredTokenData();

    if (_isSyncEnabled() && _restoreStoredToken()) {
        updateGoogleUI(true, 'restore');
        pullFavoritesFromDrive();
    } else if (_isSyncEnabled() && _hasStoredUserContext()) {
        _attemptSilentTokenRefresh()
            .catch(() => {
                updateGoogleUI(false, 'expired');
            });
    } else {
        updateGoogleUI(false, 'expired');
    }
}

let _pendingAuthSource = 'user';

function handleTokenClientError(error) {
    const source = _pendingAuthSource;
    _pendingAuthSource = 'user';

    _rejectPendingTokenRequest(new Error(error?.type || 'token_request_failed'));

    if (source === 'restore') {
        return;
    }

    if (error?.type !== 'popup_closed' && error?.type !== 'popup_failed_to_open') {
        console.error('Google auth error:', error?.type || error);
    }
}

/**
 * Handle the OAuth token response from Google.
 */
function handleTokenResponse(response) {
    const source = _pendingAuthSource;
    _pendingAuthSource = 'user';

    if (response.error) {
        _rejectPendingTokenRequest(new Error(response.error));

        // Silent re-auth failures are expected — don't notify the user
        if (source !== 'restore') {
            console.error('Google auth error:', response.error);
            _notify(_t('googleSignInFailed') || 'Google sign-in failed');
        }
        return;
    }

    _storeToken(response.access_token, response.expires_in);

    if (pendingTokenRequestResolve) {
        pendingTokenRequestResolve(accessToken);
    }
    _resetPendingTokenRequest();

    updateGoogleUI(true, source);
    fetchGoogleUserInfo();
    // Auto-pull favorites from Drive on sign-in
    pullFavoritesFromDrive();
}

/**
 * Sign in with Google — triggers the consent popup.
 */
function googleSignIn() {
    if (!_isGoogleAuthAllowedOrigin()) {
        _notify(_getGoogleUnavailableMessage());
        return;
    }

    if (_ensureTokenClient()) {
        _startInteractiveSignIn();
        return;
    }

    // First-time visitor: the Identity script was never downloaded.
    _loadGoogleIdentityServices().then(() => {
        if (!_ensureTokenClient()) {
            _notify(_t('googleNotLoaded') || 'Google services not loaded');
            return;
        }
        _startInteractiveSignIn();
    });
}

function _startInteractiveSignIn() {
    _setSyncEnabled(true);
    ensureValidAccessToken({ interactive: true }).catch(() => {
        _setSyncEnabled(false);
        _notify(_t('googleSignInFailed') || 'Google sign-in failed');
    });
}

/**
 * Sign out — revoke the token and clear state.
 */
function googleSignOut() {
    if (accessToken && _isGoogleAuthAllowedOrigin() && typeof google !== 'undefined') {
        google.accounts.oauth2.revoke(accessToken);
    }
    _clearTokenState(true);
    tokenClient = null;
    _setSyncEnabled(false);
    updateGoogleUI(false, 'signout');
}

/**
 * Fetch the user's display name/email for the UI.
 */
async function fetchGoogleUserInfo() {
    try {
        const res = await googleApiFetch('https://www.googleapis.com/oauth2/v3/userinfo');
        if (!res.ok) return;
        const data = await res.json();
        const display = data.name || data.email || 'Google User';
        localStorage.setItem('gDriveUser', display);
        if (typeof data.email === 'string' && data.email) {
            localStorage.setItem('gDriveUserEmail', data.email);
        }
        const nameEl = document.getElementById('googleUserName');
        if (nameEl) nameEl.textContent = display;
    } catch (_) { /* non-critical */ }
}

const synchronizeDriveFavorites = createDriveFavoritesSync({
    storage: localStorage,
    identify: () => window.getFavoritesApiIdentity(),
    request: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS) }),
    getFavorites: _getFavorites,
    getPreferences: _getSyncPreferences,
    applyPreferences: _applySyncedPreferences,
    commitFavorites(favorites) {
        if (JSON.stringify(_getFavorites()) === JSON.stringify(favorites)) return;
        localStorage.setItem(_getFavsKey(), JSON.stringify(favorites));
        window.dispatchEvent(new CustomEvent('favorites-changed', { detail: { favorites, source: 'google-drive' } }));
    },
    onStatus(pending) {
        const message = _t('googleSyncPending') || (_isSpanish() ? 'Cambios guardados en este dispositivo. Sincronizacion pendiente.' : 'Changes saved on this device. Sync pending.');
        if (pending) {
            if (!localStorage.getItem(GOOGLE_SYNC_PENDING_KEY)) _notify(message);
            localStorage.setItem(GOOGLE_SYNC_PENDING_KEY, 'true');
        } else {
            localStorage.removeItem(GOOGLE_SYNC_PENDING_KEY);
        }
        renderSyncDescription();
    }
});

function syncFavoritesToDrive() {
    if (!_isSyncEnabled() || !_isGoogleAuthAllowedOrigin()) return Promise.resolve(false);
    return synchronizeDriveFavorites();
}

function pullFavoritesFromDrive() {
    if (!_isSyncEnabled() || !_isGoogleAuthAllowedOrigin()) return Promise.resolve(false);
    return synchronizeDriveFavorites(true);
}

function renderSyncDescription(signedIn = _hasUsableToken()) {
    const description = document.getElementById('googleSyncDesc');
    if (!description) return;
    const pending = _isSyncEnabled() && !!localStorage.getItem(GOOGLE_SYNC_PENDING_KEY);
    description.style.display = pending || !signedIn ? '' : 'none';
    if (pending) description.textContent = _t('googleSyncPending') || (_isSpanish() ? 'Sincronizacion pendiente.' : 'Sync pending.');
    else description.textContent = _t('googleSyncDesc') || '';
}

window.addEventListener('language-changed', () => renderSyncDescription());

for (const event of ['online', 'focus']) {
    window.addEventListener(event, () => {
        if (localStorage.getItem(GOOGLE_SYNC_PENDING_KEY)) void syncFavoritesToDrive();
    });
}

/**
 * Update the UI to reflect signed-in / signed-out state.
 */
function updateGoogleUI(signedIn, reason = 'state') {
    const signInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('googleSignOutBtn');
    const nameEl = document.getElementById('googleUserName');

    if (signInBtn) signInBtn.style.display = signedIn ? 'none' : 'flex';
    if (signOutBtn) signOutBtn.style.display = signedIn ? 'flex' : 'none';
    renderSyncDescription(signedIn);

    if (signedIn && nameEl) {
        const stored = localStorage.getItem('gDriveUser');
        if (stored) nameEl.textContent = stored;
    }

    window.dispatchEvent(new CustomEvent('google-auth-changed', {
        detail: { signedIn, reason }
    }));
}

// Expose to global scope for app.js
window.initGoogleSync = initGoogleSync;
window.googleSignIn = googleSignIn;
window.googleSignOut = googleSignOut;
window.syncFavoritesToDrive = syncFavoritesToDrive;
window.getFavoritesApiIdentity = async function getFavoritesApiIdentity() {
    try {
        const token = await ensureValidAccessToken({ interactive: false });
        if (accountIdentity?.accessToken === token) return accountIdentity;
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS)
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data?.sub || accessToken !== token || !_isSyncEnabled()) return null;
        accountIdentity = { accountId: String(data.sub), accessToken: token };
        return accountIdentity;
    } catch (_) {
        return null;
    }
};
window.getFavoritesApiAccessToken = async function getFavoritesApiAccessToken() {
    try {
        return await ensureValidAccessToken({ interactive: false });
    } catch (_) {
        return null;
    }
};
