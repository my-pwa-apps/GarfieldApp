import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { mock } from 'node:test';

const workerSource = await readFile(new URL('../../worker/index.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const worker = workerModule.default;

const env = { ALLOWED_HOSTS: 'gocomics.com,*.gocomics.com,assets.amuniversal.com,garfield.fandom.com' };
const ctx = { waitUntil() {} };

/**
 * Replace global fetch and caches with deterministic stubs.
 * `responder(url)` returns the upstream Response for each hop.
 */
function stubNetwork(responder) {
  const calls = [];
  mock.method(globalThis, 'fetch', async request => {
    calls.push(request.url);
    return responder(request.url, request);
  });
  globalThis.caches = {
    default: {
      async match() { return undefined; },
      async put() {}
    }
  };
  return calls;
}

function proxyRequest(target, init = {}) {
  return new Request(`https://corsproxy.garfieldapp.workers.dev/?${target}`, init);
}

test.afterEach(() => mock.restoreAll());

test('requests to allowlisted hosts are proxied and CORS-enabled', async () => {
  stubNetwork(() => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }));

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield/1978/06/19', {
    headers: { origin: 'https://garfieldapp.pages.dev' }
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://garfieldapp.pages.dev');
  assert.equal(response.headers.get('x-proxy-cache'), 'MISS');
});

test('non-allowlisted hosts and unsupported protocols are refused', async () => {
  stubNetwork(() => new Response('should not be reached'));

  let response = await worker.fetch(proxyRequest('https://evil.example.com/'), env, ctx);
  assert.equal(response.status, 403);

  response = await worker.fetch(proxyRequest('file:///etc/passwd'), env, ctx);
  assert.equal(response.status, 400);

  response = await worker.fetch(new Request('https://corsproxy.garfieldapp.workers.dev/'), env, ctx);
  assert.equal(response.status, 400);
});

test('write methods are rejected', async () => {
  stubNetwork(() => new Response('should not be reached'));
  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield', { method: 'POST' }), env, ctx);
  assert.equal(response.status, 405);
});

test('redirects within the allowlist are followed', async () => {
  const calls = stubNetwork(url => {
    if (url.includes('/redirect')) {
      return new Response(null, { status: 302, headers: { location: 'https://assets.amuniversal.com/final.gif' } });
    }
    return new Response('image-bytes', { status: 200, headers: { 'content-type': 'image/gif' } });
  });

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/redirect'), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'https://assets.amuniversal.com/final.gif');
});

test('a redirect that leaves the allowlist is blocked instead of followed', async () => {
  const calls = stubNetwork(url => {
    if (url.includes('/open-redirect')) {
      return new Response(null, { status: 302, headers: { location: 'https://attacker.example.com/steal' } });
    }
    return new Response('should not be reached');
  });

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/open-redirect'), env, ctx);

  assert.equal(response.status, 403);
  assert.equal(calls.length, 1, 'the disallowed hop must never be fetched');
  assert.equal((await response.json()).error, 'Redirect target not allowed');
});

test('redirect loops terminate instead of hanging', async () => {
  const calls = stubNetwork(() => new Response(null, {
    status: 302,
    headers: { location: 'https://www.gocomics.com/loop' }
  }));

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/loop'), env, ctx);

  assert.equal(response.status, 403);
  assert.ok(calls.length <= 7, `expected a bounded number of hops, saw ${calls.length}`);
});

test('upstream security and preload headers are stripped from proxied responses', async () => {
  stubNetwork(() => new Response('<html></html>', {
    status: 200,
    headers: {
      'content-type': 'text/html',
      'content-security-policy': "default-src 'none'",
      'link': '</_next/static/font.woff2>; rel=preload; as=font',
      'transfer-encoding': 'chunked'
    }
  }));

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield'), env, ctx);

  assert.equal(response.headers.get('content-security-policy'), null);
  assert.equal(response.headers.get('link'), null);
  assert.equal(response.headers.get('x-proxy-by'), 'garfieldapp-corsproxy');
  assert.match(response.headers.get('vary') || '', /Origin/);
});

test('upstream failures surface as 502 rather than an unhandled rejection', async () => {
  stubNetwork(() => { throw new TypeError('network down'); });

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield'), env, ctx);

  assert.equal(response.status, 502);
});

test('foreign browser origins are rejected without CORS headers', async () => {
  stubNetwork(() => new Response('should not be reached'));

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield', {
    headers: { origin: 'https://evil.example.com' }
  }), env, ctx);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'Origin not allowed');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('requests with no Origin still succeed for same-origin and image fetches', async () => {
  stubNetwork(() => new Response('ok', { status: 200 }));

  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield'), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('Cloudflare Pages preview origins are allowed', async () => {
  stubNetwork(() => new Response('ok', { status: 200 }));

  const origin = 'https://abc123.garfieldapp.pages.dev';
  const response = await worker.fetch(proxyRequest('https://www.gocomics.com/garfield', {
    headers: { origin }
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});
