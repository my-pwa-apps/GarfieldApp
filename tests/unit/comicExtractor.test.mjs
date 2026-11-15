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

test('a blocked dedicated proxy advances from uClick to Fandom without public proxies', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async url => {
    requests.push(String(url));
    if (String(url).includes('garfield.fandom.com/api.php')) return makeFandomResponse('2026-06-08.gif');
    return { ok: false, status: 403 };
  };
  try {
    const result = await getAuthenticatedComic(new Date(2026, 5, 8, 12), 'uclick', { silent: true });
    assert.equal(result.success, true);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[0]).host, 'garfieldapp-corsproxy.garfieldapp.workers.dev');
    assert.equal(new URL(requests[1]).host, 'garfield.fandom.com');
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
    const first = await getAuthenticatedComic(new Date('2026-06-02T12:00:00Z'), 'fandom', { silent: true, maxSources: 1 });
    const second = await getAuthenticatedComic(new Date('2026-06-02T12:00:00Z'), 'fandom', { silent: true, maxSources: 1 });

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
    const result = await getAuthenticatedComic(new Date('2026-06-03T12:00:00Z'), 'fandom', { silent: true, maxSources: 1 });

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
    const first = await getAuthenticatedComic(new Date('2026-06-04T12:00:00Z'), 'fandom', { silent: true, maxSources: 1 });
    const second = await getAuthenticatedComic(new Date('2026-06-04T12:00:00Z'), 'fandom', { silent: true, maxSources: 1 });

    assert.equal(first.success, false);
    assert.equal(second.success, true, 'A network failure must not poison the session cache');
  } finally {
    global.fetch = originalFetch;
  }
});

test('preferredSource defaults to uClick when omitted', async () => {
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return { ok: true, status: 200 };
  };

  try {
    const result = await getAuthenticatedComic(new Date(2026, 5, 20, 12));

    assert.equal(result.success, true);
    assert.ok(result.imageUrl.includes(encodeURIComponent('https://picayune.uclick.com/comics/ga/2026/ga260620.gif')));
    assert.ok(urls.some(url => url.includes('picayune.uclick.com')), 'Default source must query uClick');
  } finally {
    global.fetch = originalFetch;
  }
});

test('an undecodable image advances to the next source', async () => {
  const originalFetch = global.fetch;
  const validated = [];
  global.fetch = async url => String(url).includes('garfield.fandom.com/api.php')
    ? makeFandomResponse('2026-06-09.gif')
    : { ok: true, status: 200 };
  try {
    const result = await getAuthenticatedComic(new Date(2026, 5, 9, 12), 'uclick', {
      silent: true,
      validateImage: async url => {
        validated.push(url);
        if (url.includes('ga260609.gif')) throw new Error('decode failed');
      }
    });
    assert.equal(result.success, true);
    assert.equal(validated.length, 2);
    assert.equal(result.imageUrl, validated[1]);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(getAuthenticatedComic(new Date(), 'uclick', { signal: controller.signal }), { name: 'AbortError' });
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
    return { ok: true, status: 200 };
  };

  try {
    const result = await getAuthenticatedComic(new Date('2026-06-05T12:00:00Z'), 'uclick', {
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

test('source fallback continues to the next provider when verifyImage rejects without calling public proxies', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('garfield.fandom.com/api.php')) {
      return makeFandomResponse('2026-06-06.gif');
    }
    if (String(url).includes('picayune.uclick.com')) {
      return { status: 200, ok: true };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const result = await getAuthenticatedComic(new Date('2026-06-06T12:00:00Z'), 'fandom', {
      silent: true,
      disableTodayFallback: true,
      verifyImage: async (imageUrl) => {
        if (imageUrl.includes('2026-06-06.gif')) {
          throw new Error('Fandom image 503');
        }
      }
    });

    assert.equal(result.success, true);
    assert.ok(result.imageUrl.includes(encodeURIComponent('https://picayune.uclick.com/comics/ga/2026/ga260606.gif')));
    assert.equal(
      calls.some(u => u.includes('codetabs') || u.includes('allorigins')),
      false,
      'Fallback must never call third-party public proxies'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('today fallback checks alternate sources before falling back to yesterday', async () => {
  const originalFetch = global.fetch;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12, 0, 0);
  const todayIso = `${parts.year}-${parts.month}-${parts.day}`;

  const requestedUrls = [];
  global.fetch = async (url) => {
    const str = String(url);
    requestedUrls.push(str);
    if (str.includes('picayune.uclick.com')) {
      return { ok: false, status: 404 };
    }
    if (str.includes('garfield.fandom.com/api.php')) {
      return makeFandomResponse(`${todayIso}.gif`);
    }
    throw new Error(`Unexpected fetch: ${str}`);
  };

  try {
    const result = await getAuthenticatedComic(today, 'uclick', { silent: true });
    assert.equal(result.success, true);
    assert.equal(result.actualDate, undefined, 'Should serve today from Fandom rather than yesterday from uClick');
    assert.ok(result.imageUrl.includes(encodeURIComponent(`https://example.test/${todayIso}.gif`)));
    assert.equal(requestedUrls.filter(u => u.includes('picayune.uclick.com')).length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('uClick probes .jpg first on Sundays and falls back to .gif for older archival Sundays', async () => {
  const originalFetch = global.fetch;
  const probed = [];
  global.fetch = async (url) => {
    const decoded = decodeURIComponent(String(url).split('?')[1] || '');
    probed.push(decoded);
    if (decoded.endsWith('/ga261115.jpg') || decoded.endsWith('/ga780625.gif')) {
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 404 };
  };

  try {
    const modernSunday = await getAuthenticatedComic(new Date(2026, 10, 15, 12), 'uclick', {
      silent: true,
      maxSources: 1,
      disableTodayFallback: true
    });
    assert.equal(modernSunday.success, true);
    assert.ok(modernSunday.imageUrl.includes(encodeURIComponent('https://picayune.uclick.com/comics/ga/2026/ga261115.jpg')));

    const archivalSunday = await getAuthenticatedComic(new Date(1978, 5, 25, 12), 'uclick', {
      silent: true,
      maxSources: 1,
      disableTodayFallback: true
    });
    assert.equal(archivalSunday.success, true);
    assert.ok(archivalSunday.imageUrl.includes(encodeURIComponent('https://picayune.uclick.com/comics/ga/1978/ga780625.gif')));

    assert.deepEqual(probed, [
      'https://picayune.uclick.com/comics/ga/2026/ga261115.jpg',
      'https://picayune.uclick.com/comics/ga/1978/ga780625.jpg',
      'https://picayune.uclick.com/comics/ga/1978/ga780625.gif'
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('maxSources=1 advances past an HTTP 403 WAF block to a healthy source', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('picayune.uclick.com')) return { ok: false, status: 403 };
    if (String(url).includes('garfield.fandom.com/api.php')) return makeFandomResponse('2026-06-10.gif');
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const result = await getAuthenticatedComic(new Date(2026, 5, 10, 12), 'uclick', {
      silent: true,
      maxSources: 1,
      disableTodayFallback: true
    });
    assert.equal(result.success, true);
    assert.ok(result.imageUrl.includes(encodeURIComponent('https://example.test/2026-06-10.gif')));
  } finally {
    global.fetch = originalFetch;
  }
});


