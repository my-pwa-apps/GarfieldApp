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
      location: (() => {
        const url = new URL(origin);
        return { origin: url.origin, protocol: url.protocol, hostname: url.hostname };
      })(),
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

test('unauthorized remote origins never initialize Google token client or request sign-in', () => {
  const context = createContext('https://evil.example.com');
  let initialized = false;
  context.google = { accounts: { oauth2: { initTokenClient: () => { initialized = true; } } } };

  context.__api.initGoogleSync();
  context.__api.googleSignIn();

  assert.equal(initialized, false);
  assert.deepEqual(context.notifications, ['Google sign-in is not available on this test URL.']);
});

test('plain-http loopback development origins are allowed to sign in', () => {
  for (const origin of ['http://localhost:8000', 'http://127.0.0.1:8000']) {
    const context = createContext(origin);
    const requests = [];
    context.google = {
      accounts: {
        oauth2: {
          initTokenClient: () => ({ requestAccessToken: options => requests.push(options) })
        }
      }
    };

    context.__api.initGoogleSync();
    context.__api.googleSignIn();

    assert.equal(requests.length, 1, `${origin} should be able to request a token`);
    assert.deepEqual(context.notifications, [], `${origin} should not warn about an unsupported URL`);
  }
});

test('a loopback hostname served over https is still treated as untrusted', () => {
  const context = createContext('https://localhost:8443');
  let initialized = false;
  context.google = { accounts: { oauth2: { initTokenClient: () => { initialized = true; } } } };

  context.__api.initGoogleSync();
  context.__api.googleSignIn();

  assert.equal(initialized, false);
});

test('the frontend and leaderboard worker agree on the Google OAuth client id', async () => {
  const clientId = source.match(/const GOOGLE_CLIENT_ID = '([^']+)'/)?.[1];
  assert.ok(clientId, 'googleDriveSync.js must declare GOOGLE_CLIENT_ID');

  const wrangler = await readFile(new URL('../../worker/favorites-api/wrangler.toml', import.meta.url), 'utf8');
  const configured = wrangler.match(/^GOOGLE_CLIENT_ID\s*=\s*"([^"]+)"/m)?.[1];
  assert.equal(configured, clientId, 'worker/favorites-api/wrangler.toml must bind the same client id');

  const workerSource = await readFile(new URL('../../worker/favorites-api/index.js', import.meta.url), 'utf8');
  const fallback = workerSource.match(/const DEFAULT_GOOGLE_CLIENT_ID = '([^']+)'/)?.[1];
  assert.equal(fallback, clientId, 'the worker fallback client id must match the frontend');
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
  assert.equal(context.store.has('gDriveSyncEnabled'), false);
});

test('stored Google user context does not restore or request tokens until sync is enabled', () => {
  const context = createContext();
  const requests = [];
  context.store.set('gDriveUser', 'Tester');
  context.store.set('gDriveUserEmail', 'tester@example.com');
  context.google = {
    accounts: {
      oauth2: {
        initTokenClient: () => ({ requestAccessToken: options => requests.push(options) })
      }
    }
  };

  context.__api.initGoogleSync();
  context.__api.syncFavoritesToDrive();

  assert.deepEqual(requests, []);
});

test('auto-sync does not request tokens until user explicitly opts in', () => {
  const context = createContext();
  const requests = [];
  context.store.set('gDriveUser', 'Tester');
  context.store.set('gDriveUserEmail', 'tester@example.com');
  context.store.set('favs', JSON.stringify(['2024-01-01']));
  context.google = {
    accounts: {
      oauth2: {
        initTokenClient: () => ({ requestAccessToken: options => requests.push(options) })
      }
    }
  };

  context.__api.initGoogleSync();
  context.__api.syncFavoritesToDrive();

  assert.deepEqual(requests, []);
  assert.equal(context.store.has('gDriveSyncEnabled'), false);
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
  context.store.set('gDriveSyncEnabled', 'true');
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

test('the Google Identity script is never shipped as an eager page dependency', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(
    html,
    /<script[^>]+accounts\.google\.com/,
    'index.html must not preload Google Identity Services; googleDriveSync.js injects it on demand'
  );
  assert.match(source, /const GOOGLE_IDENTITY_SCRIPT_URL = 'https:\/\/accounts\.google\.com\/gsi\/client'/);
});

test('corrupt stored token is removed during initialization', () => {
  const context = createContext();
  context.store.set('gDriveToken', '{bad');
  context.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }) } } };

  context.__api.initGoogleSync();

  assert.equal(context.store.has('gDriveToken'), false);
});