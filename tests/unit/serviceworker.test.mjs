import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../serviceworker.js', import.meta.url), 'utf8');
const VERSION = source.match(/const VERSION = '([^']+)'/)?.[1];

const ORIGIN = 'https://garfieldapp.pages.dev';
const BASE = `${ORIGIN}/`;

/**
 * Minimal Request/Response stand-ins.
 *
 * The real service worker builds requests from scope-relative specifiers such
 * as './app.js', which the platform resolves against the worker scope. Node's
 * global Request requires an absolute URL, so a small shim keeps the worker
 * source running unmodified.
 */
class SWRequest {
    constructor(input, init = {}) {
        const base = input instanceof SWRequest ? input : null;
        this.url = base ? base.url : new URL(String(input), BASE).href;
        this.method = init.method || base?.method || 'GET';
        this.mode = init.mode || base?.mode || 'no-cors';
        this.destination = init.destination ?? base?.destination ?? '';
        this.cache = init.cache ?? base?.cache;
        this.headers = new Headers(init.headers || base?.headers || {});
    }
}

class SWResponse {
    constructor(body = null, init = {}) {
        this.body = body;
        this.status = init.status ?? 200;
        this.statusText = init.statusText || '';
        this.type = init.type || 'basic';
        this.redirected = init.redirected || false;
        this.headers = new Headers(init.headers || {});
    }

    get ok() {
        return this.status >= 200 && this.status < 300;
    }

    clone() {
        return new SWResponse(this.body, this);
    }

    async text() {
        return this.body;
    }

    static error() {
        return new SWResponse(null, { status: 0, type: 'error' });
    }
}

function cacheKey(request) {
    return typeof request === 'string' ? new URL(request, BASE).href : request.url;
}

class FakeCache {
    constructor(context) {
        this.context = context;
        this.entries = new Map();
    }

    async match(request) {
        return this.entries.get(cacheKey(request)) || undefined;
    }

    async put(request, response) {
        this.entries.set(cacheKey(request), response);
    }

    async delete(request) {
        return this.entries.delete(cacheKey(request));
    }

    async keys() {
        return [...this.entries.keys()].map(url => new SWRequest(url));
    }

    async add(request) {
        const response = await this.context.fetch(request);
        if (!response?.ok) throw new Error(`Bad response for ${cacheKey(request)}`);
        await this.put(request, response);
    }
}

class FakeCacheStorage {
    constructor(context) {
        this.context = context;
        this.stores = new Map();
    }

    async open(name) {
        if (!this.stores.has(name)) this.stores.set(name, new FakeCache(this.context));
        return this.stores.get(name);
    }

    async keys() {
        return [...this.stores.keys()];
    }

    async delete(name) {
        return this.stores.delete(name);
    }

    async match(request) {
        for (const cache of this.stores.values()) {
            const hit = await cache.match(request);
            if (hit) return hit;
        }
        return undefined;
    }
}

/**
 * Evaluate serviceworker.js in an isolated context with observable platform
 * stubs, then expose helpers for dispatching lifecycle and fetch events.
 */
function loadServiceWorker({ fetchImpl } = {}) {
    const listeners = new Map();
    const calls = { skipWaiting: 0, claim: 0, fetched: [] };

    const context = {
        console: { error() {}, warn() {}, log() {} },
        setTimeout,
        clearTimeout,
        Promise,
        URL,
        Headers,
        Request: SWRequest,
        Response: SWResponse,
        location: { origin: ORIGIN, href: BASE }
    };

    context.fetch = async (request) => {
        const normalized = request instanceof SWRequest ? request : new SWRequest(request);
        calls.fetched.push(normalized);
        if (fetchImpl) return fetchImpl(normalized);
        return new SWResponse('ok');
    };

    context.caches = new FakeCacheStorage(context);
    context.self = {
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        skipWaiting() { calls.skipWaiting++; },
        clients: { claim: async () => { calls.claim++; } }
    };
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(source, context);

    const dispatch = async (type, event) => {
        for (const handler of listeners.get(type) || []) await handler(event);
    };

    return {
        context,
        calls,
        caches: context.caches,
        async install() {
            let pending = Promise.resolve();
            await dispatch('install', { waitUntil: promise => { pending = promise; } });
            return pending;
        },
        async activate() {
            let pending = Promise.resolve();
            await dispatch('activate', { waitUntil: promise => { pending = promise; } });
            return pending;
        },
        async message(data, ports = []) {
            await dispatch('message', { data, ports });
        },
        async request(input, init) {
            const request = new SWRequest(input, init);
            let response;
            await dispatch('fetch', { request, respondWith: promise => { response = promise; } });
            return response === undefined ? undefined : await response;
        }
    };
}

test('the deploy version is well formed and matches package.json', async () => {
    assert.match(VERSION, /^v\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.equal(VERSION, `v${pkg.version}`, 'run `npm run bump:version` to keep these in sync');
});

test('install precaches the app shell and bypasses the browser HTTP cache', async () => {
    const sw = loadServiceWorker();
    await sw.install();

    const precached = sw.calls.fetched.map(request => request.url.replace(BASE, './'));
    for (const asset of ['./index.html', './main.css', './app.js', './comicExtractor.js', './toolbar.js', './googleDriveSync.js', './manifest.webmanifest', './offline.html', './init.js']) {
        assert.ok(precached.includes(asset), `${asset} should be precached`);
    }
    assert.ok(sw.calls.fetched.every(request => request.cache === 'reload'), 'precache requests must bypass the HTTP cache');

    const cache = await sw.caches.open(`garfield-${VERSION}`);
    assert.ok(await cache.match('./app.js'), 'the precache lands in the versioned cache');
});

test('install does not activate the new worker behind the user\'s back', async () => {
    const sw = loadServiceWorker();
    await sw.install();
    assert.equal(sw.calls.skipWaiting, 0, 'a new worker must wait until the update banner is accepted');

    await sw.message({ type: 'SKIP_WAITING' });
    assert.equal(sw.calls.skipWaiting, 1, 'the SKIP_WAITING message must be reachable and honoured');
});

test('install fails when a required module is missing but tolerates optional assets', async () => {
    const notFound = () => new SWResponse('missing', { status: 404 });

    const required = loadServiceWorker({
        fetchImpl: async request => (request.url.endsWith('/comicExtractor.js') ? notFound() : new SWResponse('ok'))
    });
    await assert.rejects(required.install(), 'a missing statically imported module must fail installation');

    const optional = loadServiceWorker({
        fetchImpl: async request => (request.url.endsWith('.gif') ? notFound() : new SWResponse('ok'))
    });
    await optional.install();
});

test('the worker reports its own version over a message channel', async () => {
    const sw = loadServiceWorker();
    const received = [];
    await sw.message({ type: 'GET_VERSION' }, [{ postMessage: message => received.push(message) }]);

    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'VERSION');
    assert.equal(received[0].version, VERSION);
});

test('an unknown message never replies on the port', async () => {
    const sw = loadServiceWorker();
    const received = [];
    await sw.message({ type: 'NOT_A_REAL_MESSAGE' }, [{ postMessage: message => received.push(message) }]);
    assert.deepEqual(received, []);
});

test('activation removes stale Garfield caches, preserves the current set and claims clients', async () => {
    const sw = loadServiceWorker();
    await sw.caches.open('garfield-v0.9.0');
    await sw.caches.open('garfield-images-v0.9.0');
    await sw.caches.open('some-other-app-cache');
    await sw.install();

    await sw.activate();

    const remaining = await sw.caches.keys();
    assert.equal(remaining.includes('garfield-v0.9.0'), false);
    assert.equal(remaining.includes('garfield-images-v0.9.0'), false);
    assert.ok(remaining.includes('some-other-app-cache'), 'caches belonging to other apps are left alone');
    assert.ok(remaining.includes(`garfield-${VERSION}`), 'the current cache survives');
    assert.equal(sw.calls.claim, 1);
});

test('app shell requests are served from cache without touching the network', async () => {
    const sw = loadServiceWorker();
    await sw.install();
    const networkCallsAfterInstall = sw.calls.fetched.length;

    const response = await sw.request('./app.js', { destination: 'script' });
    assert.equal(await response.text(), 'ok');
    assert.equal(sw.calls.fetched.length, networkCallsAfterInstall, 'a cached shell asset must not hit the network');
});

test('a cache miss is persisted before the fetch handler settles', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => new SWResponse('fresh') });
    await sw.request('./new-page.html', { destination: 'document' });

    const cached = await sw.caches.match('./new-page.html');
    assert.ok(cached, 'the response must be in the cache as soon as respondWith resolves');
    assert.equal(await cached.text(), 'fresh');
});

test('redirected and error responses are never cached', async () => {
    const redirected = loadServiceWorker({ fetchImpl: async () => new SWResponse('moved', { redirected: true }) });
    await redirected.request('./redirected.html', { destination: 'document' });
    assert.equal(await redirected.caches.match('./redirected.html'), undefined);

    const failed = loadServiceWorker({ fetchImpl: async () => new SWResponse('nope', { status: 500 }) });
    await failed.request('./broken.html', { destination: 'document' });
    assert.equal(await failed.caches.match('./broken.html'), undefined);
});

test('a failed navigation falls back to the app shell, then the offline page', async () => {
    const offline = async request => {
        if (request.cache === 'reload') return new SWResponse('ok');
        throw new Error('offline');
    };
    const navigation = {
        destination: 'document',
        mode: 'navigate',
        headers: { accept: 'text/html' }
    };

    const withShell = loadServiceWorker({ fetchImpl: offline });
    await withShell.install();
    assert.equal(await (await withShell.request('./deep/link', navigation)).text(), 'ok');

    // Without a precached shell only the offline page remains.
    const withoutShell = loadServiceWorker({ fetchImpl: offline });
    const cache = await withoutShell.caches.open(`garfield-${VERSION}`);
    await cache.put('./offline.html', new SWResponse('offline page'));
    assert.equal(await (await withoutShell.request('./deep/link', navigation)).text(), 'offline page');

    // A non-HTML request has no meaningful fallback and must surface the error.
    const bare = loadServiceWorker({ fetchImpl: offline });
    await assert.rejects(bare.request('./data.json', { destination: '' }));
});

test('images are cached across origins and evicted least-recently-added first', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => new SWResponse('image', { type: 'opaque', status: 0 }) });

    for (let i = 0; i < 55; i++) {
        await sw.request(`https://assets.amuniversal.com/strip-${String(i).padStart(3, '0')}.jpg`, { destination: 'image' });
    }

    const cache = await sw.caches.open(`garfield-images-${VERSION}`);
    assert.equal((await cache.keys()).length, 50, 'the image cache is bounded');
    assert.equal(await cache.match('https://assets.amuniversal.com/strip-000.jpg'), undefined, 'the oldest entry is evicted');
    assert.ok(await cache.match('https://assets.amuniversal.com/strip-054.jpg'), 'the newest entry is retained');
});

test('an image that cannot be fetched offline degrades to a 503 instead of throwing', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => { throw new Error('offline'); } });
    const response = await sw.request('https://assets.amuniversal.com/strip.jpg', { destination: 'image' });
    assert.equal(response.status, 503);
});

test('the runtime cache is bounded and falls back to cache when the network fails', async () => {
    const sw = loadServiceWorker({ fetchImpl: async () => new SWResponse('data') });
    for (let i = 0; i < 35; i++) {
        await sw.request(`./api/resource-${i}`, { destination: '' });
    }
    const cache = await sw.caches.open(`garfield-runtime-${VERSION}`);
    assert.equal((await cache.keys()).length, 30);

    const offline = loadServiceWorker({ fetchImpl: async () => { throw new Error('offline'); } });
    const runtime = await offline.caches.open(`garfield-runtime-${VERSION}`);
    await runtime.put('./api/resource-1', new SWResponse('stale but useful'));
    assert.equal(await (await offline.request('./api/resource-1', { destination: '' })).text(), 'stale but useful');
});

test('non-GET and cross-origin non-image requests are left to the network', async () => {
    const sw = loadServiceWorker();
    assert.equal(await sw.request('./favorite', { method: 'POST', destination: '' }), undefined);
    assert.equal(await sw.request('https://favorites-api.garfieldapp.workers.dev/top', { destination: '' }), undefined);
});

test('every module statically imported by app.js is precached and required', async () => {
    const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
    const precacheList = source.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/)?.[1];
    const requiredList = source.match(/const REQUIRED_PRECACHE_ASSETS = new Set\(\[([\s\S]*?)\]\)/)?.[1];
    assert.ok(precacheList, 'PRECACHE_ASSETS should be discoverable');
    assert.ok(requiredList, 'REQUIRED_PRECACHE_ASSETS should be discoverable');

    const imports = [...appSource.matchAll(/^\s*import[^'"]*['"](\.\/[^'"]+)['"]/gm)].map(match => match[1]);
    assert.ok(imports.length > 0, 'app.js should statically import at least one module');

    for (const specifier of imports) {
        assert.ok(precacheList.includes(`'${specifier}'`), `${specifier} must be precached`);
        assert.ok(requiredList.includes(`'${specifier}'`), `${specifier} must be a required precache asset`);
    }
});

test('support is standardized on the Stripe payment link', async () => {
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /https:\/\/buy\.stripe\.com\/9B63cubyG45ldITfim1VK00/);
    assert.doesNotMatch(html, /buymeacoffee|ko-fi/i);
    assert.doesNotMatch(html, /donationModal|donationFrame/);
});
