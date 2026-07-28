import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * These tests exercise app.js for real instead of pattern-matching its source.
 *
 * app.js is a browser module, so a deliberately small DOM surface is installed
 * before importing it. `document.readyState` is left at 'loading' so the module
 * only registers its DOMContentLoaded listener and never boots the UI, which
 * leaves the pure helpers (date parsing, storage access, offline index) callable
 * in isolation.
 */
function createStubElement() {
    return {
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {},
        removeAttribute() {},
        getAttribute: () => null,
        appendChild: child => child,
        replaceChildren() {},
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        offsetWidth: 0,
        offsetHeight: 0,
        checked: false,
        value: ''
    };
}

function installDomStub() {
    const storage = new Map();
    globalThis.localStorage = {
        getItem: key => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => { storage.set(key, String(value)); },
        removeItem: key => { storage.delete(key); },
        clear: () => { storage.clear(); },
        get length() { return storage.size; },
        key: index => [...storage.keys()][index] ?? null
    };

    globalThis.document = {
        readyState: 'loading',
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => createStubElement(),
        createElementNS: () => createStubElement(),
        documentElement: createStubElement(),
        body: createStubElement(),
        fonts: { ready: Promise.resolve() }
    };

    globalThis.window = globalThis;
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    globalThis.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {}
    });
    globalThis.requestAnimationFrame = callback => setTimeout(() => callback(0), 0);
    globalThis.cancelAnimationFrame = id => clearTimeout(id);

    return storage;
}

const storage = installDomStub();
await import('../../app.js');

const { UTILS, CONFIG, translations, getSyncPreferences } = globalThis;

test.beforeEach(() => {
    storage.clear();
});

test('the module exposes its shared helpers without booting the UI', () => {
    assert.equal(typeof UTILS, 'object');
    assert.equal(typeof CONFIG, 'object');
    assert.equal(typeof getSyncPreferences, 'function');
    assert.ok(Object.isFrozen(CONFIG), 'CONFIG must stay immutable at runtime');
});

test('translation dictionaries expose the same application keys in English and Spanish', () => {
    assert.deepEqual(Object.keys(translations.es).sort(), Object.keys(translations.en).sort());
});

test('ISO and favorite date strings parse as local calendar days, never UTC midnight', () => {
    const iso = UTILS.dateFromISODateString('1978-06-19');
    assert.equal(iso.getFullYear(), 1978);
    assert.equal(iso.getMonth(), 5);
    assert.equal(iso.getDate(), 19);

    const favorite = UTILS.dateFromFavoriteDateString('2024/03/01');
    assert.equal(favorite.getFullYear(), 2024);
    assert.equal(favorite.getMonth(), 2);
    assert.equal(favorite.getDate(), 1);

    // Round-tripping must be lossless regardless of the machine timezone.
    assert.equal(UTILS.dateToISODateString(UTILS.dateFromISODateString('2000-01-01')), '2000-01-01');
    assert.equal(UTILS.dateToISODateString(UTILS.dateFromFavoriteDateString('1999/12/31')), '1999-12-31');
});

test('the Garfield start dates survive parsing as the documented calendar days', () => {
    assert.equal(
        UTILS.dateToISODateString(UTILS.dateFromISODateString(CONFIG.GARFIELD_START_EN)),
        CONFIG.GARFIELD_START_EN
    );
    assert.equal(
        UTILS.dateToISODateString(UTILS.dateFromISODateString(CONFIG.GARFIELD_START_ES)),
        CONFIG.GARFIELD_START_ES
    );
});

test('safeJSONParse falls back instead of throwing on corrupt or empty input', () => {
    assert.deepEqual(UTILS.safeJSONParse('{oops', []), []);
    assert.deepEqual(UTILS.safeJSONParse(null, []), []);
    assert.deepEqual(UTILS.safeJSONParse(undefined, []), []);
    assert.deepEqual(UTILS.safeJSONParse('null', []), []);
    assert.deepEqual(UTILS.safeJSONParse('["2024/01/01"]', []), ['2024/01/01']);
});

test('getFavorites always returns an array, even when localStorage is corrupt', () => {
    assert.deepEqual(UTILS.getFavorites(), []);

    storage.set(CONFIG.STORAGE_KEYS.FAVS, 'not json at all');
    assert.deepEqual(UTILS.getFavorites(), []);

    storage.set(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(['2024/01/02', '2024/01/01']));
    assert.deepEqual(UTILS.getFavorites(), ['2024/01/02', '2024/01/01']);
});

test('offline comics are indexed per language and stay bounded', () => {
    assert.equal(CONFIG.STORAGE_KEYS.OFFLINE_COMICS, 'offlineComics');

    UTILS.rememberOfflineComic('2024-01-02', 'en', 'https://example.test/b.gif');
    UTILS.rememberOfflineComic('2024-01-01', 'en', 'https://example.test/a.gif');
    UTILS.rememberOfflineComic('2024-01-03', 'es', 'https://example.test/es.gif');

    assert.deepEqual(UTILS.getOfflineComics('en').map(comic => comic.date), ['2024-01-01', '2024-01-02']);
    assert.deepEqual(UTILS.getOfflineComics('es').map(comic => comic.date), ['2024-01-03']);
    assert.equal(UTILS.getOfflineComics().length, 3);

    // Re-caching the same day replaces rather than duplicates the entry.
    UTILS.rememberOfflineComic('2024-01-02', 'en', 'https://example.test/b2.gif');
    const english = UTILS.getOfflineComics('en');
    assert.equal(english.length, 2);
    assert.equal(english.at(-1).imageUrl, 'https://example.test/b2.gif');

    for (let index = 0; index < 60; index += 1) {
        UTILS.rememberOfflineComic(
            `2023-01-${String((index % 28) + 1).padStart(2, '0')}`,
            `lang${index}`,
            'https://example.test/x.gif'
        );
    }
    assert.equal(UTILS.getOfflineComics().length, 50, 'offline index must stay bounded');
});

test('offline navigation walks to the nearest cached neighbour in the requested direction', () => {
    UTILS.rememberOfflineComic('2024-01-01', 'en', 'https://example.test/a.gif');
    UTILS.rememberOfflineComic('2024-01-05', 'en', 'https://example.test/b.gif');

    assert.equal(UTILS.getOfflineComic('2024-01-05', 'en').imageUrl, 'https://example.test/b.gif');
    assert.equal(UTILS.getOfflineComic('2024-01-03', 'en', 'previous').imageUrl, 'https://example.test/a.gif');
    assert.equal(UTILS.getOfflineComic('2024-01-03', 'en', 'next').imageUrl, 'https://example.test/b.gif');
    assert.equal(UTILS.getOfflineComic('2023-12-31', 'en', 'previous').success, false);
});

test('an empty offline index still serves the bundled first strip', () => {
    const result = UTILS.getOfflineComic('2024-01-01', 'en');
    assert.equal(result.success, true);
    assert.equal(result.imageUrl, './garfield-first.gif');
    assert.equal(UTILS.dateToISODateString(result.actualDate), CONFIG.GARFIELD_START_EN);
    assert.equal(result.isOffline, true);
});

test('sync preferences report the persisted user configuration', () => {
    const defaults = getSyncPreferences();
    assert.deepEqual(
        Object.keys(defaults).sort(),
        ['comicSource', 'darkMode', 'shuffle', 'spanish', 'swipeEnabled']
    );
    assert.equal(defaults.spanish, false);
    assert.equal(defaults.shuffle, false);
    assert.equal(defaults.swipeEnabled, true, 'swipe is opt-out, not opt-in');

    storage.set(CONFIG.STORAGE_KEYS.SPANISH, 'true');
    storage.set(CONFIG.STORAGE_KEYS.SHUFFLE, 'true');
    storage.set(CONFIG.STORAGE_KEYS.SWIPE, 'false');
    storage.set(CONFIG.STORAGE_KEYS.SOURCE, 'not-a-real-source');

    const stored = getSyncPreferences();
    assert.equal(stored.spanish, true);
    assert.equal(stored.shuffle, true);
    assert.equal(stored.swipeEnabled, false);
    assert.notEqual(stored.comicSource, 'not-a-real-source', 'an unknown source must fall back to a supported one');
});

test('community favorite writes are authenticated by bearer token only', async () => {
    const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
    // Static invariant: a spoofable client-supplied identity header must never
    // reappear as an alternative to the verified Google ID token.
    assert.doesNotMatch(appSource, /X-Client-Id/);
    assert.match(appSource, /Authorization/);
    assert.match(appSource, /requireAuth/);
    // Signed-out visitors favourite locally without being nagged to sign in,
    // but a genuine leaderboard failure must still surface.
    assert.doesNotMatch(appSource, /favoriteSignInRequired/);
    assert.match(appSource, /favoriteVoteFailed/);
    assert.doesNotMatch(appSource, /Silently ignore network errors/);
});
