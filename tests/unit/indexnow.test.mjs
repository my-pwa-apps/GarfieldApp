import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeployment, createPayload, notifyIndexNow } from '../../tools/indexnow.cjs';

const fixture = () => new Map([
  ['index.html', Buffer.from('<html>App</html>')],
  ['serviceworker.js', Buffer.from('const VERSION = "test";')],
  ['indexnow-key.txt', Buffer.from('0123456789abcdef0123456789abcdef\n')]
]);

test('dry run makes no requests and submits only the canonical homepage', async () => {
  const result = await notifyIndexNow(fixture(), { fetchImpl: () => { throw new Error('Unexpected network request'); } });
  assert.equal(result.mode, 'dry-run');
  assert.deepEqual(result.payload.urlList, ['https://garfieldapp.pages.dev/']);
  assert.equal(result.payload.keyLocation, 'https://garfieldapp.pages.dev/indexnow-key.txt');
  assert.throws(() => createPayload(new Map()), /key/);
  assert.throws(() => createPayload(new Map([['indexnow-key.txt', Buffer.from('invalid key!')]])), /key/);
});

test('production mismatch, missing file, redirect or network error prevents POST', async () => {
  for (const failure of ['mismatch', 'missing', 'redirect', 'network', 'key']) {
    const files = fixture();
    let posts = 0;
    await assert.rejects(notifyIndexNow(files, { submit: true, fetchImpl: async (url, options) => {
      if (options.method === 'POST') { posts++; return new Response(null, { status: 200 }); }
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      if (failure === 'network') throw new Error('Network unavailable');
      if (failure === 'missing') return new Response(null, { status: 404 });
      if (failure === 'redirect') return new Response(null, { status: 302 });
      const name = new URL(url).pathname.slice(1) || 'index.html';
      return new Response(failure === 'key' && name !== 'indexnow-key.txt' ? files.get(name) : 'old deployment');
    } }));
    assert.equal(posts, 0);
  }
});

test('matching production files allow one POST; response codes are handled explicitly', async () => {
  for (const status of [200, 202, 400, 403, 422, 429, 500]) {
    const files = fixture();
    let gets = 0;
    let posts = 0;
    const operation = notifyIndexNow(files, { submit: true, fetchImpl: async (url, options) => {
      if (options.method === 'POST') {
        assert.equal(gets, files.size);
        assert.equal(url, 'https://api.indexnow.org/indexnow');
        assert.deepEqual(JSON.parse(options.body), createPayload(files));
        posts++;
        return new Response(null, { status });
      }
      assert.equal(new URL(url).origin, 'https://garfieldapp.pages.dev');
      gets++;
      return new Response(files.get(new URL(url).pathname.slice(1) || 'index.html'));
    } });
    if ([200, 202].includes(status)) assert.equal((await operation).status, status);
    else await assert.rejects(operation, new RegExp(`HTTP ${status}`));
    assert.equal(posts, 1);
  }
});

test('local deployment covers the app shell, key and sitemap; metadata agrees', async () => {
  const files = await readDeployment();
  for (const name of ['index.html', 'app.js', 'init.js', 'main.css', 'serviceworker.js', 'sitemap.xml', 'indexnow-key.txt']) {
    assert.ok(files.has(name), name);
  }
  const payload = createPayload(files);
  const html = files.get('index.html').toString();
  assert.match(html, /<link rel="canonical" href="https:\/\/garfieldapp\.pages\.dev\/">/);
  assert.doesNotMatch(html, /hreflang=/);
  assert.ok(files.get('sitemap.xml').toString().includes(`<loc>${payload.urlList[0]}</loc>`));
  assert.equal((await readFile(new URL('../../sitemap.txt', import.meta.url), 'utf8')).trim(), payload.urlList[0]);
});