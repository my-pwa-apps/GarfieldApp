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
