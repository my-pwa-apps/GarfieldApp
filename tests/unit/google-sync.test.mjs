import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../googleDriveSync.js', import.meta.url), 'utf8');

function createContext(origin = 'https://garfieldapp.pages.dev') {
  const store = new Map();
  const notifications = [];
  const elements = new Map();

  const context = {
    console,
    setInterval,
    clearInterval,
    Date,
    Headers,
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    localStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { id, style: {}, textContent: '', disabled: false });
        return elements.get(id);
      }
    },
    window: {
      location: { origin },
      dispatchEvent() {},
      showNotification: message => notifications.push(message),
      UTILS: {
        isSpanishMode: () => false,
        getFavorites: () => JSON.parse(store.get('favs') || '[]')
      },
      CONFIG: { STORAGE_KEYS: { FAVS: 'favs' } },
      translations: {
        en: {
          googleUnavailableOnThisUrl: 'Google sign-in is not available on this test URL.',
          googleNotLoaded: 'Google services not loaded',
          googleSignInFailed: 'Google sign-in failed'
        }
      },
      getSyncPreferences: () => ({ spanish: false }),
      applySyncedPreferences: preferences => { context.appliedPreferences = preferences; }
    },
    fetch: async () => new Response('{}', { status: 200 })
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.notifications = notifications;
  context.store = store;
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.__api = { initGoogleSync, googleSignIn, googleSignOut, handleTokenResponse, googleApiFetch, syncFavoritesToDrive, pullFavoritesFromDrive };`, context);
  return context;
}

test('local unauthorized origins never initialize Google token client or request sign-in', () => {
  const context = createContext('http://127.0.0.1:8000');
  let initialized = false;
  context.google = { accounts: { oauth2: { initTokenClient: () => { initialized = true; } } } };

  context.__api.initGoogleSync();
  context.__api.googleSignIn();

  assert.equal(initialized, false);
  assert.deepEqual(context.notifications, ['Google sign-in is not available on this test URL.']);
});

test('authorized sign-in requests an interactive token and stores token response', () => {
  const context = createContext();
  const requests = [];
  context.google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          context.tokenConfig = config;
          return { requestAccessToken: options => requests.push(options) };
        }
      }
    }
  };

  context.__api.initGoogleSync();
  context.__api.googleSignIn();
  context.__api.handleTokenResponse({ access_token: 'token-1', expires_in: 3600 });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].prompt, undefined);
  assert.match(context.store.get('gDriveToken'), /token-1/);
});

test('sign-out revokes current token and clears stored user context', () => {
  const context = createContext();
  let revoked = '';
  context.google = {
    accounts: {
      oauth2: {
        initTokenClient: () => ({ requestAccessToken() {} }),
        revoke: token => { revoked = token; }
      }
    }
  };
  context.__api.initGoogleSync();
  context.__api.handleTokenResponse({ access_token: 'token-2', expires_in: 3600 });
  context.store.set('gDriveUser', 'Tester');
  context.store.set('gDriveUserEmail', 'tester@example.com');

  context.__api.googleSignOut();

  assert.equal(revoked, 'token-2');
  assert.equal(context.store.has('gDriveToken'), false);
  assert.equal(context.store.has('gDriveUser'), false);
  assert.equal(context.store.has('gDriveUserEmail'), false);
});

test('googleApiFetch retries once on 401 using a refreshed token', async () => {
  const context = createContext();
  const accessRequests = [];
  context.google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          context.tokenConfig = config;
          return { requestAccessToken: options => accessRequests.push(options) };
        }
      }
    }
  };
  const authorizations = [];
  context.fetch = async (_url, options = {}) => {
    authorizations.push(options.headers?.get('Authorization'));
    return new Response('{}', { status: authorizations.length === 1 ? 401 : 200 });
  };

  context.__api.initGoogleSync();
  context.__api.handleTokenResponse({ access_token: 'old-token', expires_in: 3600 });
  const promise = context.__api.googleApiFetch('https://www.googleapis.com/drive/v3/files');
  context.__api.handleTokenResponse({ access_token: 'new-token', expires_in: 3600 });
  const response = await promise;

  assert.equal(response.status, 200);
  assert.equal(authorizations[0], 'Bearer old-token');
  assert.ok(authorizations.includes('Bearer new-token'));
  assert.equal(accessRequests[0].prompt, 'none');
});

test('corrupt stored token is removed during initialization', () => {
  const context = createContext();
  context.store.set('gDriveToken', '{bad');
  context.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }) } } };

  context.__api.initGoogleSync();

  assert.equal(context.store.has('gDriveToken'), false);
});