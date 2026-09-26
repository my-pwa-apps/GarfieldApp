const PRODUCTION_ORIGIN = 'https://garfieldapp.pages.dev';
const PROXY_IDENTITY = 'garfieldapp-corsproxy';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 20_000;
// GoComics sits behind Cloudflare bot protection, which intermittently challenges
// the proxy's upstream request. The worker passes that page through unchanged.
const UPSTREAM_CHALLENGE_MARKERS = ['Establishing a secure connection', 'checking your browser'];

/**
 * @returns {{ ok: true } | { ok: false, retryable: boolean, reason: string }}
 */
function classifyProxyResponse(response, body) {
  if (response.headers.get('x-proxy-by') !== PROXY_IDENTITY) {
    return { ok: false, retryable: false, reason: `proxy identity missing (HTTP ${response.status}); the request did not reach the Garfield worker's proxy path` };
  }
  if (response.headers.get('access-control-allow-origin') !== PRODUCTION_ORIGIN) {
    return { ok: false, retryable: false, reason: `production origin not echoed in CORS headers (HTTP ${response.status})` };
  }
  if (UPSTREAM_CHALLENGE_MARKERS.some(marker => body.includes(marker))) {
    return { ok: false, retryable: true, reason: `GoComics returned its bot challenge to the proxy (HTTP ${response.status}); upstream issue, not an origin or proxy fault` };
  }
  if (!response.ok) {
    return { ok: false, retryable: true, reason: `upstream request failed with HTTP ${response.status}` };
  }
  if (!body.includes('featureassets.gocomics.com')) {
    return { ok: false, retryable: true, reason: 'GoComics page contained no comic image reference' };
  }
  return { ok: true };
}

function classifyFavoritesResponse(response, body) {
  try {
    if (response.ok && Array.isArray(JSON.parse(body))) return { ok: true };
  } catch { /* reported below */ }
  return { ok: false, retryable: response.status >= 500, reason: `top list unavailable or malformed (HTTP ${response.status})` };
}

const PROXY = 'https://garfieldapp-corsproxy.garfieldapp.workers.dev/?';

function extractComicImage(body) {
  const meta = body.match(/<meta\b[^>]*og:image[^>]*content="([^"]+)"/i) || body.match(/<meta\b[^>]*content="([^"]+)"[^>]*og:image/i);
  return meta?.[1] || body.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+/)?.[0] || null;
}

function isImageBytes(bytes) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  return ascii(0, 4) === 'GIF8' ||
    (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') ||
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP');
}

// Validates the whole browser path: page discovery, then the comic image bytes through the proxy.
function gocomicsCheck(name, comicPath) {
  return {
    name,
    url: `${PROXY}${encodeURIComponent(`https://www.gocomics.com/${comicPath}`)}`,
    classify: async (response, body, fetchImpl) => {
      const page = classifyProxyResponse(response, body);
      if (!page.ok) return page;
      const imageUrl = extractComicImage(body);
      const image = await fetchImpl(`${PROXY}${encodeURIComponent(imageUrl)}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (!image.ok || !isImageBytes(bytes)) {
        return { ok: false, retryable: true, reason: `comic image was not returned as image data through the proxy (HTTP ${image.status}, ${bytes.length} bytes)` };
      }
      return { ok: true };
    }
  };
}

const checks = [
  gocomicsCheck('CORS proxy GoComics English comic', 'garfield/2026/04/29'),
  gocomicsCheck('CORS proxy GoComics Spanish comic', 'garfieldespanol/2026/04/29'),
  {
    name: 'Favorites API top list',
    url: 'https://favorites-api.garfieldapp.workers.dev/top',
    classify: classifyFavoritesResponse
  }
];

const headers = {
  'Origin': PRODUCTION_ORIGIN,
  'User-Agent': 'GarfieldApp predeploy health check (+https://garfieldapp.pages.dev)'
};

async function runCheck(check, { fetchImpl = fetch, delayMs = RETRY_DELAY_MS, log = console.log } = {}) {
  const failures = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let verdict;
    try {
      const response = await fetchImpl(check.url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      verdict = await check.classify(response, await response.text(), fetchImpl);
    } catch (error) {
      verdict = { ok: false, retryable: true, reason: `request failed: ${error.message}` };
    }
    if (verdict.ok) {
      log(`${check.name}: OK${attempt > 1 ? ` (attempt ${attempt}; earlier: ${failures.join('; ')})` : ''}`);
      return;
    }
    failures.push(verdict.reason);
    if (!verdict.retryable || attempt === MAX_ATTEMPTS) break;
    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
  }
  throw new Error(`${check.name} failed after ${failures.length} attempt(s): ${failures.join('; ')}`);
}

module.exports = { classifyProxyResponse, classifyFavoritesResponse, extractComicImage, gocomicsCheck, isImageBytes, runCheck, MAX_ATTEMPTS };

if (require.main === module) {
  Promise.allSettled(checks.map(check => runCheck(check))).then(results => {
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(result.reason.message || result.reason);
        process.exitCode = 1;
      }
    }
  });
}
