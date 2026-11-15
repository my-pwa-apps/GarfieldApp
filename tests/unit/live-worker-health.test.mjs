import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { arcamaxCheck, classifyProxyHeaders, classifyFavoritesResponse, isImageBytes, runCheck, uclickImageCheck, MAX_ATTEMPTS } = require('../support/live-worker-health.cjs');

const proxyHeaders = { 'x-proxy-by': 'garfieldapp-corsproxy', 'access-control-allow-origin': 'https://garfieldapp.pages.dev' };
const response = (status, headers = proxyHeaders) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers) });
const challenge = '<!DOCTYPE html><html><head><title>Establishing a secure connection ...</title></head></html>';

test('an upstream bot challenge is retryable and not blamed on the origin or proxy', () => {
    const verdict = classifyProxyHeaders(response(403), challenge);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.retryable, true);
    assert.match(verdict.reason, /bot challenge.*not an origin or proxy fault/);

    const bunnyBlock = classifyProxyHeaders(
        response(403, { ...proxyHeaders, 'cdn-pullzone': '4334715' }),
        '<html><head><title>403 Forbidden</title><link href="//fonts.bunny.net/css?family=Rubik"></head></html>'
    );
    assert.equal(bunnyBlock.ok, false);
    assert.equal(bunnyBlock.retryable, true);
    assert.match(bunnyBlock.reason, /bot challenge.*not an origin or proxy fault/);
});

test('proxy identity and CORS faults fail immediately without retrying', () => {
    const rejected = classifyProxyHeaders(response(403, {}), '{"error":"Origin not allowed"}');
    assert.deepEqual([rejected.ok, rejected.retryable], [false, false]);
    assert.match(rejected.reason, /proxy identity missing/);

    const wrongOrigin = classifyProxyHeaders(response(200, { 'x-proxy-by': 'garfieldapp-corsproxy', 'access-control-allow-origin': '*' }));
    assert.deepEqual([wrongOrigin.ok, wrongOrigin.retryable], [false, false]);
});

test('valid proxy headers and favorites payload pass while malformed responses fail', () => {
    assert.deepEqual(classifyProxyHeaders(response(200)), { ok: true });
    assert.equal(classifyProxyHeaders(response(502)).ok, false);
    assert.deepEqual(classifyFavoritesResponse(response(200, {}), '[]'), { ok: true });
    assert.equal(classifyFavoritesResponse(response(200, {}), 'not json').ok, false);
});

test('a transient challenge recovers on retry and reports the earlier attempt', async () => {
    const bodies = [challenge, 'ok'];
    const logs = [];
    await runCheck({
        name: 'proxy',
        url: 'x',
        classify: async resp => classifyProxyHeaders(resp, await resp.text())
    }, {
        delayMs: 0,
        log: message => logs.push(message),
        fetchImpl: async () => {
            const body = bodies.shift();
            return { ...response(body === challenge ? 403 : 200), text: async () => body };
        }
    });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /OK \(attempt 2; earlier: upstream returned a bot challenge/);
});

test('a persistent challenge fails after the bounded attempts, and hard faults fail on the first', async () => {
    let calls = 0;
    await assert.rejects(runCheck({
        name: 'proxy',
        url: 'x',
        classify: async resp => classifyProxyHeaders(resp, await resp.text())
    }, {
        delayMs: 0,
        log: () => {},
        fetchImpl: async () => { calls++; return { ...response(403), text: async () => challenge }; }
    }), new RegExp(`failed after ${MAX_ATTEMPTS} attempt`));
    assert.equal(calls, MAX_ATTEMPTS);

    calls = 0;
    await assert.rejects(runCheck({
        name: 'proxy',
        url: 'x',
        classify: async resp => classifyProxyHeaders(resp, await resp.text())
    }, {
        delayMs: 0,
        log: () => {},
        fetchImpl: async () => { calls++; return { ...response(403, {}), text: async () => '{}' }; }
    }), /failed after 1 attempt/);
    assert.equal(calls, 1);
});

test('uClick and ArcaMax checks verify real image bytes through the proxy', async () => {
    assert.equal(isImageBytes(new TextEncoder().encode('GIF89a...')), true);
    assert.equal(isImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), true);
    assert.equal(isImageBytes(new TextEncoder().encode('<!DOCTYPE html>')), false);

    const uclick = uclickImageCheck('uClick', 'https://picayune.uclick.com/comics/ga/2026/ga260429.gif');
    assert.match(uclick.url, /ga260429\.gif$/);
    const gifResp = { ...response(200), arrayBuffer: async () => new TextEncoder().encode('GIF89a').buffer };
    assert.deepEqual(await uclick.classify(gifResp), { ok: true });

    const htmlResp = { ...response(200), arrayBuffer: async () => new TextEncoder().encode('<html>not an image</html>').buffer };
    const badUclick = await uclick.classify(htmlResp);
    assert.deepEqual([badUclick.ok, badUclick.retryable], [false, true]);
    assert.match(badUclick.reason, /not returned as image data/);

    const arcamax = arcamaxCheck('ArcaMax');
    const requested = [];
    const pageResp = {
        ...response(200),
        text: async () => '<img src="https://resources.arcamax.com/newspics/123/456.gif">'
    };
    const imageFetch = async url => {
        requested.push(decodeURIComponent(url.split('?')[1]));
        return gifResp;
    };
    assert.deepEqual(await arcamax.classify(pageResp, imageFetch), { ok: true });
    assert.deepEqual(requested, ['https://resources.arcamax.com/newspics/123/456.gif']);
});
