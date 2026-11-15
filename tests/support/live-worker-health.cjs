const PRODUCTION_ORIGIN = 'https://garfieldapp.pages.dev';
const PROXY_IDENTITY = 'garfieldapp-corsproxy';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 20_000;
const UPSTREAM_CHALLENGE_MARKERS = ['Establishing a secure connection', 'checking your browser', 'Just a moment...', 'fonts.bunny.net'];

/**
 * @returns {{ ok: true } | { ok: false, retryable: boolean, reason: string }}
 */
function classifyProxyHeaders(response, body = '') {
  if (response.headers.get('x-proxy-by') !== PROXY_IDENTITY) {
    return { ok: false, retryable: false, reason: `proxy identity missing (HTTP ${response.status}); the request did not reach the Garfield worker's proxy path` };
  }
  if (response.headers.get('access-control-allow-origin') !== PRODUCTION_ORIGIN) {
    return { ok: false, retryable: false, reason: `production origin not echoed in CORS headers (HTTP ${response.status})` };
  }
  if (UPSTREAM_CHALLENGE_MARKERS.some(marker => body.includes(marker)) ||
      (response.status === 403 && response.headers.get('cdn-pullzone'))) {
    return { ok: false, retryable: true, reason: `upstream returned a bot challenge to the proxy (HTTP ${response.status}); upstream issue, not an origin or proxy fault` };
  }
  if (!response.ok) {
    return { ok: false, retryable: true, reason: `upstream request failed with HTTP ${response.status}` };
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

function isImageBytes(bytes) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  return ascii(0, 4) === 'GIF8' ||
    (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') ||
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP');
}

function uclickImageCheck(name, comicUrl) {
  return {
    name,
    url: `${PROXY}${encodeURIComponent(comicUrl)}`,
    classify: async (response) => {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const bodyPreview = isImageBytes(bytes) ? '' : new TextDecoder().decode(bytes.slice(0, 512));
      const headerVerdict = classifyProxyHeaders(response, bodyPreview);
      if (!headerVerdict.ok) return headerVerdict;
      if (!isImageBytes(bytes)) {
        return { ok: false, retryable: true, reason: `comic image was not returned as image data through the proxy (HTTP ${response.status}, ${bytes.length} bytes)` };
      }
      return { ok: true };
    }
  };
}

function arcamaxCheck(name) {
  const pageUrl = 'https://www.arcamax.com/thefunnies/garfield/';
  return {
    name,
    url: `${PROXY}${encodeURIComponent(pageUrl)}`,
    classify: async (response, fetchImpl) => {
      const html = await response.text();
      const pageVerdict = classifyProxyHeaders(response, html);
      if (!pageVerdict.ok) return pageVerdict;
      const match = html.match(/https:\/\/resources\.arcamax\.com\/newspics\/[^"'\s<>]+/i);
      if (!match?.[0]) {
        return { ok: false, retryable: true, reason: 'ArcaMax page contained no comic image reference' };
      }
      const imageResp = await fetchImpl(`${PROXY}${encodeURIComponent(match[0])}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const bytes = new Uint8Array(await imageResp.arrayBuffer());
      const headerVerdict = classifyProxyHeaders(imageResp, isImageBytes(bytes) ? '' : new TextDecoder().decode(bytes.slice(0, 512)));
      if (!headerVerdict.ok) return headerVerdict;
      if (!isImageBytes(bytes)) {
        return { ok: false, retryable: true, reason: `ArcaMax image was not returned as image data through the proxy (HTTP ${imageResp.status}, ${bytes.length} bytes)` };
      }
      return { ok: true };
    }
  };
}

const checks = [
  uclickImageCheck('CORS proxy uClick daily comic', 'https://picayune.uclick.com/comics/ga/2026/ga260429.gif'),
  uclickImageCheck('CORS proxy uClick Sunday comic', 'https://picayune.uclick.com/comics/ga/2026/ga260426.jpg'),
  arcamaxCheck('CORS proxy ArcaMax fallback comic'),
  {
    name: 'Favorites API top list',
    url: 'https://favorites-api.garfieldapp.workers.dev/top',
    classify: async (response) => classifyFavoritesResponse(response, await response.text())
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
      verdict = await check.classify(response, fetchImpl);
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

module.exports = { arcamaxCheck, classifyProxyHeaders, classifyFavoritesResponse, isImageBytes, runCheck, uclickImageCheck, MAX_ATTEMPTS };

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
