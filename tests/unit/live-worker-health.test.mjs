import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { classifyProxyResponse, classifyFavoritesResponse, extractComicImage, gocomicsCheck, isImageBytes, runCheck, MAX_ATTEMPTS } = require('../support/live-worker-health.cjs');

const proxyHeaders = { 'x-proxy-by': 'garfieldapp-corsproxy', 'access-control-allow-origin': 'https://garfieldapp.pages.dev' };
const response = (status, headers = proxyHeaders) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers) });
const challenge = '<!DOCTYPE html><html><head><title>Establishing a secure connection ...</title></head></html>';
const comicPage = '<meta property="og:image" content="https://featureassets.gocomics.com/assets/abc">';

test('an upstream GoComics challenge is retryable and not blamed on the origin or proxy', () => {
    const verdict = classifyProxyResponse(response(403), challenge);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.retryable, true);
    assert.match(verdict.reason, /bot challenge.*not an origin or proxy fault/);
});

test('proxy identity and CORS faults fail immediately without retrying', () => {
    const rejected = classifyProxyResponse(response(403, {}), '{"error":"Origin not allowed"}');
    assert.deepEqual([rejected.ok, rejected.retryable], [false, false]);
    assert.match(rejected.reason, /proxy identity missing/);

    const wrongOrigin = classifyProxyResponse(response(200, { 'x-proxy-by': 'garfieldapp-corsproxy', 'access-control-allow-origin': '*' }), comicPage);
    assert.deepEqual([wrongOrigin.ok, wrongOrigin.retryable], [false, false]);
});

test('a decoded GoComics page passes and a page without a comic does not', () => {
    assert.deepEqual(classifyProxyResponse(response(200), comicPage), { ok: true });
    assert.equal(classifyProxyResponse(response(200), '<html></html>').ok, false);
    assert.deepEqual(classifyFavoritesResponse(response(200, {}), '[]'), { ok: true });
    assert.equal(classifyFavoritesResponse(response(200, {}), 'not json').ok, false);
});

test('a transient challenge recovers on retry and reports the earlier attempt', async () => {
    const bodies = [challenge, comicPage];
    const logs = [];
    await runCheck({ name: 'proxy', url: 'x', classify: classifyProxyResponse }, {
        delayMs: 0,
        log: message => logs.push(message),
        fetchImpl: async () => { const body = bodies.shift(); return { ...response(body === challenge ? 403 : 200), text: async () => body }; }
    });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /OK \(attempt 2; earlier: GoComics returned its bot challenge/);
});

test('a persistent challenge fails after the bounded attempts, and hard faults fail on the first', async () => {
    let calls = 0;
    await assert.rejects(runCheck({ name: 'proxy', url: 'x', classify: classifyProxyResponse }, {
        delayMs: 0,
        log: () => {},
        fetchImpl: async () => { calls++; return { ...response(403), text: async () => challenge }; }
    }), new RegExp(`failed after ${MAX_ATTEMPTS} attempt`));
    assert.equal(calls, MAX_ATTEMPTS);

    calls = 0;
    await assert.rejects(runCheck({ name: 'proxy', url: 'x', classify: classifyProxyResponse }, {
        delayMs: 0,
        log: () => {},
        fetchImpl: async () => { calls++; return { ...response(403, {}), text: async () => '{}' }; }
    }), /failed after 1 attempt/);
    assert.equal(calls, 1);
});

test('the comic check fetches the page image through the proxy and requires real image bytes', async () => {
    assert.equal(extractComicImage('<meta property="og:image" content="https://featureassets.gocomics.com/assets/og1">'), 'https://featureassets.gocomics.com/assets/og1');
    assert.equal(extractComicImage('<meta content="https://featureassets.gocomics.com/assets/og2" property="og:image">'), 'https://featureassets.gocomics.com/assets/og2');
    assert.equal(isImageBytes(new TextEncoder().encode('GIF89a...')), true);
    assert.equal(isImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), true);
    assert.equal(isImageBytes(new TextEncoder().encode('<!DOCTYPE html>')), false);

    const check = gocomicsCheck('Spanish', 'garfieldespanol/2026/04/29');
    assert.match(check.url, /garfieldespanol%2F2026%2F04%2F29$/);
    const requested = [];
    const imageFetch = bytes => async url => { requested.push(decodeURIComponent(url.split('?')[1])); return { ...response(200), arrayBuffer: async () => bytes.buffer }; };

    assert.deepEqual(await check.classify(response(200), comicPage, imageFetch(new TextEncoder().encode('GIF89a'))), { ok: true });
    assert.deepEqual(requested, ['https://featureassets.gocomics.com/assets/abc']);

    const htmlInsteadOfImage = await check.classify(response(200), comicPage, imageFetch(new TextEncoder().encode(challenge)));
    assert.deepEqual([htmlInsteadOfImage.ok, htmlInsteadOfImage.retryable], [false, true]);
    assert.match(htmlInsteadOfImage.reason, /not returned as image data/);
});
