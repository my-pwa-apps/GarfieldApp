import assert from 'node:assert/strict';
import test from 'node:test';

import { getAuthenticatedComic } from '../../comicExtractor.js';

function makeFandomResponse(filename) {
  return {
    ok: true,
    json: async () => ({
      query: {
        pages: {
          1: {
            pageid: 1,
            // MediaWiki normalizes spaces to underscores in returned titles.
            title: `File:${filename}`.replace(/ /g, '_'),
            imageinfo: [{ url: `https://example.test/${filename}` }]
          }
        }
      }
    })
  };
}

test('GoComics prefers the page comic metadata over unrelated featured assets', async () => {
  const firstStripUrl = 'https://featureassets.gocomics.com/assets/239495d0fa06013ebddf005056a9545d';
  const requestedStripUrl = 'https://featureassets.gocomics.com/assets/e707a5202f95013fc0c4005056a9545d';
  const html = `<!doctype html><html><head>
    <meta content="${requestedStripUrl}?optimizer=image&amp;width=768" property="og:image">
    <link rel="canonical" href="https://www.gocomics.com/garfield/2026/06/20">
  </head><body><section>${firstStripUrl}</section></body></html>`;
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => html });

  try {
    const result = await getAuthenticatedComic(new Date(2026, 5, 20, 12), 'en', 'gocomics', {
      silent: true,
      maxSources: 1,
      disableTodayFallback: true
    });

    assert.equal(result.success, true);
    assert.equal(result.imageUrl, `${requestedStripUrl}?optimizer=image&width=768`);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Fandom fallback reuses the same image lookup within a session', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('garfield.fandom.com/api.php')) {
      return makeFandomResponse('2026-06-02.gif');
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const first = await getAuthenticatedComic(new Date('2026-06-02T12:00:00Z'), 'en', 'fandom', { silent: true, maxSources: 1 });
    const second = await getAuthenticatedComic(new Date('2026-06-02T12:00:00Z'), 'en', 'fandom', { silent: true, maxSources: 1 });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(calls.length, 1, 'Expected the Fandom lookup to be cached for the same session');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Fandom resolves every filename candidate in a single batched API request', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('garfield.fandom.com/api.php')) {
      // Only the .png variant exists — the gif/jpg/jpeg candidates are missing.
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: {
              '-1': { pageid: -1, title: 'File:2026-06-03.gif', missing: '' },
              7: {
                pageid: 7,
                title: 'File:2026-06-03.png',
                imageinfo: [{ url: 'https://example.test/2026-06-03.png' }]
              }
            }
          }
        })
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const result = await getAuthenticatedComic(new Date('2026-06-03T12:00:00Z'), 'en', 'fandom', { silent: true, maxSources: 1 });

    assert.equal(result.success, true);
    assert.equal(calls.length, 1, 'All filename candidates must be resolved in one request');

    const requested = decodeURIComponent(new URL(calls[0]).searchParams.get('titles'));
    for (const ext of ['gif', 'jpg', 'jpeg', 'png']) {
      assert.ok(requested.includes(`File:2026-06-03.${ext}`), `Expected ${ext} candidate in the batch`);
    }
    assert.ok(result.imageUrl.includes(encodeURIComponent('https://example.test/2026-06-03.png')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('a transient Fandom network error is not cached as a permanent miss', async () => {
  const originalFetch = global.fetch;
  let attempt = 0;
  global.fetch = async (url) => {
    if (!String(url).includes('garfield.fandom.com/api.php')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    attempt += 1;
    if (attempt === 1) throw new Error('network down');
    return makeFandomResponse('2026-06-04.gif');
  };

  try {
    const first = await getAuthenticatedComic(new Date('2026-06-04T12:00:00Z'), 'en', 'fandom', { silent: true, maxSources: 1 });
    const second = await getAuthenticatedComic(new Date('2026-06-04T12:00:00Z'), 'en', 'fandom', { silent: true, maxSources: 1 });

    assert.equal(first.success, false);
    assert.equal(second.success, true, 'A network failure must not poison the session cache');
  } finally {
    global.fetch = originalFetch;
  }
});

test('uClick probes for existence with HEAD so the strip is not downloaded twice', async () => {
  const originalFetch = global.fetch;
  const methods = [];
  global.fetch = async (url, init) => {
    if (!String(url).includes('picayune.uclick.com')) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    methods.push(init?.method);
    return { ok: true };
  };

  try {
    const result = await getAuthenticatedComic(new Date('2026-06-05T12:00:00Z'), 'en', 'uclick', {
      silent: true,
      maxSources: 1,
      disableTodayFallback: true
    });

    assert.equal(result.success, true);
    assert.deepEqual(methods, ['HEAD']);
  } finally {
    global.fetch = originalFetch;
  }
});
