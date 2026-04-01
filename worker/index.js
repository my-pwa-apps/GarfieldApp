/**
 * GarfieldApp CORS Proxy Worker
 *
 * Allowed hosts are controlled by the ALLOWED_HOSTS environment variable
 * (comma-separated list, supports *.domain.com wildcards).
 */

const DEFAULT_ALLOWED_HOSTS = [
    'dirkjan.nl',
    'www.dirkjan.nl',
];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const HOP_BY_HOP_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length',
    // Strip Link preload headers — upstream sites (e.g. GoComics/Next.js) send
    // Link: </_next/static/media/font.woff2>; rel=preload; as=font
    // The browser resolves these relative URLs against the proxy domain and
    // then tries to load the fonts from the proxy, causing spurious 400 errors.
    'link',
    // Strip upstream CSP — it would conflict with the app's own policy.
    'content-security-policy',
    'content-security-policy-report-only',
]);

const HTML_CACHE_TTL  = 600;
const IMAGE_CACHE_TTL = 86400;
const DEFAULT_CACHE_TTL = 3600;

export default {
    async fetch(request, env, ctx) {
        const allowedHosts = getAllowedHosts(env);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return withCors(request, jsonResponse({ error: 'Method not allowed' }, 405));
        }

        const requestUrl = new URL(request.url);
        const targetUrl  = extractTargetUrl(requestUrl);
        if (!targetUrl) {
            return withCors(request, new Response(
                'Usage: /?https://example.com/path or /?url=https://example.com/path',
                { status: 400, headers: { 'content-type': 'text/plain; charset=UTF-8' } }
            ));
        }

        let upstreamUrl;
        try {
            upstreamUrl = new URL(targetUrl);
        } catch {
            return withCors(request, jsonResponse({ error: 'Invalid target URL' }, 400));
        }

        if (!ALLOWED_PROTOCOLS.has(upstreamUrl.protocol)) {
            return withCors(request, jsonResponse({ error: 'Unsupported protocol' }, 400));
        }

        if (!isAllowedHost(upstreamUrl.hostname, allowedHosts)) {
            return withCors(request, jsonResponse({ error: 'Host not allowed' }, 403));
        }

        const cacheKey = new Request(upstreamUrl.toString(), { method: request.method });
        const cache = caches.default;

        if (request.method === 'GET') {
            const cached = await cache.match(cacheKey);
            if (cached) return withCors(request, cached, true);
        }

        const upstreamRequest = new Request(upstreamUrl.toString(), {
            method: request.method,
            headers: buildUpstreamHeaders(request),
        });

        let upstreamResponse;
        try {
            upstreamResponse = await fetch(upstreamRequest, {
                redirect: 'follow',
                cf: {
                    cacheEverything: request.method === 'GET',
                    cacheTtl: getCacheTtl(upstreamUrl),
                },
            });
        } catch {
            return withCors(request, jsonResponse({ error: 'Upstream fetch failed' }, 502));
        }

        const response = sanitizeUpstreamResponse(upstreamResponse);

        if (request.method === 'GET' && upstreamResponse.ok) {
            ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }

        return withCors(request, response, false);
    },
};

function extractTargetUrl(requestUrl) {
    const explicitUrl = requestUrl.searchParams.get('url');
    if (explicitUrl) return explicitUrl;

    const rawQuery = requestUrl.search.startsWith('?') ? requestUrl.search.slice(1) : requestUrl.search;
    if (!rawQuery) return null;

    try { return decodeURIComponent(rawQuery); } catch { return rawQuery; }
}

function getAllowedHosts(env) {
    const rawHosts = typeof env?.ALLOWED_HOSTS === 'string'
        ? env.ALLOWED_HOSTS
        : DEFAULT_ALLOWED_HOSTS.join(',');
    return rawHosts.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
}

function isAllowedHost(hostname, allowedHosts) {
    const normalizedHost = hostname.toLowerCase();
    return allowedHosts.some(allowedHost => {
        if (allowedHost.startsWith('*.')) {
            const suffix = allowedHost.slice(1); // e.g. ".gocomics.com"
            return normalizedHost.endsWith(suffix) && normalizedHost !== suffix.slice(1);
        }
        return normalizedHost === allowedHost;
    });
}

function buildUpstreamHeaders(request) {
    const headers = new Headers();
    const accept         = request.headers.get('accept');
    const acceptLanguage = request.headers.get('accept-language');
    const userAgent      = request.headers.get('user-agent');
    if (accept)         headers.set('accept', accept);
    if (acceptLanguage) headers.set('accept-language', acceptLanguage);
    if (userAgent)      headers.set('user-agent', userAgent);
    headers.set('x-forwarded-host',  new URL(request.url).host);
    headers.set('x-forwarded-proto', 'https');
    return headers;
}

function sanitizeUpstreamResponse(upstreamResponse) {
    const headers = new Headers(upstreamResponse.headers);
    for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
    headers.set('x-proxy-by',     'garfieldapp-corsproxy');
    headers.set('x-proxy-target', upstreamResponse.url);
    headers.set('vary', 'Origin');
    return new Response(upstreamResponse.body, {
        status:     upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
    });
}

function getCacheTtl(targetUrl) {
    const pathname = targetUrl.pathname.toLowerCase();
    if (pathname.includes('/cartoon/'))          return HTML_CACHE_TTL;
    if (pathname.includes('/wp-content/uploads/')) return IMAGE_CACHE_TTL;
    return DEFAULT_CACHE_TTL;
}

function withCors(request, response, cacheHit = false) {
    const headers = new Headers(response.headers);
    for (const [key, value] of buildCorsHeaders(request).entries()) {
        headers.set(key, value);
    }
    headers.set('x-proxy-cache', cacheHit ? 'HIT' : 'MISS');
    return new Response(response.body, {
        status:     response.status,
        statusText: response.statusText,
        headers,
    });
}

function buildCorsHeaders(request) {
    const origin = request.headers.get('origin') || '*';
    return new Headers({
        'access-control-allow-origin':  origin,
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Accept',
        'access-control-max-age':       '86400',
    });
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}
