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
