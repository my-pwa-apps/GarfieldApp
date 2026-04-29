/**
 * GarfieldApp Favorites Leaderboard API
 *
 * Uses a Durable Object as the source of truth so leaderboard writes are
 * serialized and counts remain consistent under concurrent traffic.
 *
 * Identity model:
 * - Preferred: verified Google bearer token (stable across devices/profiles)
 * - Fallback: local anonymous client id sent by the app
 */

const ALLOWED_ORIGINS = [
    'https://garfieldapp.pages.dev',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'http://localhost:8080'
];

const DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MIGRATE_MAX = 500;
const TOP_N = 50;
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
// Must match the OAuth client_id used by googleDriveSync.js on the frontend.
const GOOGLE_CLIENT_ID = '495923472176-iummunjkudkt4p7bqtd5m7441664gl6t.apps.googleusercontent.com';
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IDENTITY_CACHE_MAX = 500;
const LEADERBOARD_OBJECT_NAME = 'global';
const COUNTS_KEY = 'counts';
const TOP_KEY = 'top';

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request) });
        }

        const url = new URL(request.url);
        if (!isSupportedRoute(url.pathname, request.method)) {
            return withCors(request, jsonResponse({ error: 'Not found' }, 404));
        }

        try {
            const stub = getLeaderboardStub(env);
            const response = await stub.fetch(request);
            return withCors(request, response);
        } catch (error) {
            console.error('favorites-api worker error', error);
            return withCors(request, jsonResponse({ error: 'Internal error' }, 500));
        }
    }
};

export class FavoritesLeaderboard {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.googleIdentityCache = new Map();
    }

    async fetch(request) {
        const url = new URL(request.url);

        try {
            if (url.pathname === '/top' && request.method === 'GET') {
                return this.handleGetTop();
            }
            if (url.pathname === '/favorite' && request.method === 'POST') {
                return this.handlePostFavorite(request);
            }
            if (url.pathname === '/migrate' && request.method === 'POST') {
                return this.handleMigrate(request);
            }
            return jsonResponse({ error: 'Not found' }, 404);
        } catch (error) {
            console.error('favorites-api durable object error', error);
            return jsonResponse({ error: 'Internal error' }, 500);
        }
    }

    async handleGetTop() {
        const top = (await this.state.storage.get(TOP_KEY)) || [];
        return new Response(JSON.stringify(top), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=30'
            }
        });
    }

    async handlePostFavorite(request) {
        const identity = await this.resolveIdentity(request);
        if (identity.errorResponse) return identity.errorResponse;

        const rateLimited = await this.enforceRateLimit(identity.key);
        if (rateLimited) return rateLimited;

        const body = await parseJson(request);
        if (!body.ok) return body.response;

        const { date, action } = body.value;
        if (!date || !DATE_PATTERN.test(date)) {
            return jsonResponse({ error: 'Invalid date format (expected YYYY/MM/DD)' }, 400);
        }
        if (action !== 'add' && action !== 'remove') {
            return jsonResponse({ error: 'Invalid action (expected "add" or "remove")' }, 400);
        }

        const userStorageKey = getUserStorageKey(identity.key);
        const favorites = new Set((await this.state.storage.get(userStorageKey)) || []);
        const counts = (await this.state.storage.get(COUNTS_KEY)) || {};
        const currentCount = counts[date] || 0;

        if (action === 'add') {
            if (favorites.has(date)) {
                return jsonResponse({ ok: true, count: currentCount, unchanged: true });
            }
            favorites.add(date);
            counts[date] = currentCount + 1;
        } else {
            if (!favorites.has(date)) {
                return jsonResponse({ ok: true, count: currentCount, unchanged: true });
            }
            favorites.delete(date);
            const nextCount = Math.max(0, currentCount - 1);
            if (nextCount === 0) {
                delete counts[date];
            } else {
                counts[date] = nextCount;
            }
        }

        await this.persistState(userStorageKey, favorites, counts);
        return jsonResponse({ ok: true, count: counts[date] || 0 });
    }

    async handleMigrate(request) {
        const identity = await this.resolveIdentity(request);
        if (identity.errorResponse) return identity.errorResponse;

        const rateLimited = await this.enforceRateLimit(identity.key);
        if (rateLimited) return rateLimited;

        const body = await parseJson(request);
        if (!body.ok) return body.response;

        const { dates } = body.value;
        if (!Array.isArray(dates) || dates.length === 0) {
            return jsonResponse({ error: 'Expected non-empty dates array' }, 400);
        }
        if (dates.length > MIGRATE_MAX) {
            return jsonResponse({ error: `Max ${MIGRATE_MAX} dates per migration` }, 400);
        }

        const validDates = [...new Set(dates.filter(date => typeof date === 'string' && DATE_PATTERN.test(date)))].sort();
        if (!validDates.length) {
            return jsonResponse({ error: 'No valid dates found' }, 400);
        }

        const userStorageKey = getUserStorageKey(identity.key);
        const favorites = new Set((await this.state.storage.get(userStorageKey)) || []);
        const counts = (await this.state.storage.get(COUNTS_KEY)) || {};
        let migrated = 0;

        for (const date of validDates) {
            if (favorites.has(date)) continue;
            favorites.add(date);
            counts[date] = (counts[date] || 0) + 1;
            migrated++;
        }

        if (migrated === 0) {
            return jsonResponse({ ok: true, migrated: 0, unchanged: true });
        }

        await this.persistState(userStorageKey, favorites, counts);
        return jsonResponse({ ok: true, migrated });
    }

    async persistState(userStorageKey, favorites, counts) {
        const top = buildTopEntries(counts);
        const operations = [
            this.state.storage.put(COUNTS_KEY, counts),
            this.state.storage.put(TOP_KEY, top)
        ];

        if (favorites.size > 0) {
            operations.push(this.state.storage.put(userStorageKey, [...favorites].sort()));
        } else {
            operations.push(this.state.storage.delete(userStorageKey));
        }

        await Promise.all(operations);
    }

    async enforceRateLimit(identityKey) {
        const rateKey = `rate:${identityKey}`;
        const now = Date.now();
        const current = (await this.state.storage.get(rateKey)) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        const activeWindow = current.resetAt > now
            ? current
            : { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

        if (activeWindow.count >= RATE_LIMIT_MAX) {
            return jsonResponse({ error: 'Rate limited' }, 429);
        }

        activeWindow.count += 1;
        await this.state.storage.put(rateKey, activeWindow);
        return null;
    }

    async resolveIdentity(request) {
        const authHeader = request.headers.get('Authorization') || '';
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length).trim();
            const googleIdentity = await this.verifyGoogleIdentity(token);
            if (!googleIdentity) {
                return { errorResponse: jsonResponse({ error: 'Invalid Google token' }, 401) };
            }

            return {
                key: `google:${googleIdentity.sub}`,
                kind: 'google'
            };
        }

        const clientId = (request.headers.get('X-Client-Id') || '').trim();
        if (!CLIENT_ID_PATTERN.test(clientId)) {
            const legacyIdentity = getLegacyIdentity(request);
            if (!legacyIdentity) {
                return { errorResponse: jsonResponse({ error: 'Missing or invalid client id' }, 401) };
            }

            return {
                key: legacyIdentity,
                kind: 'legacy'
            };
        }

        return {
            key: `anon:${clientId}`,
            kind: 'anonymous'
        };
    }

    async verifyGoogleIdentity(token) {
        if (!token) return null;

        const cached = this.googleIdentityCache.get(token);
        if (cached && cached.expiresAt > Date.now()) {
            // Refresh LRU position
            this.googleIdentityCache.delete(token);
            this.googleIdentityCache.set(token, cached);
            return cached.identity;
        }
        if (cached) {
            this.googleIdentityCache.delete(token);
        }

        // Step 1: validate audience via tokeninfo. This ensures the token was
        // minted for THIS application — userinfo alone accepts any valid
        // Google OAuth access token with profile scope, which would allow
        // a malicious site's tokens to be used here.
        const tokenInfoResp = await fetch(
            `${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(token)}`
        ).catch(() => null);

        if (!tokenInfoResp?.ok) {
            this.cacheIdentity(token, null);
            return null;
        }

        const tokenInfo = await tokenInfoResp.json().catch(() => null);
        if (!tokenInfo || tokenInfo.aud !== GOOGLE_CLIENT_ID) {
            this.cacheIdentity(token, null);
            return null;
        }

        const expiresInSec = parseInt(tokenInfo.expires_in || '0', 10);
        if (!(expiresInSec > 0)) {
            this.cacheIdentity(token, null);
            return null;
        }

        // Step 2: fetch user info for sub + email.
        const response = await fetch(GOOGLE_USERINFO_URL, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }).catch(() => null);

        if (!response?.ok) {
            this.cacheIdentity(token, null);
            return null;
        }

        const data = await response.json().catch(() => null);
        const identity = data?.sub ? { sub: data.sub, email: data.email || '' } : null;

        // Cache for the shorter of IDENTITY_CACHE_TTL_MS and the token's remaining lifetime.
        const ttlMs = Math.min(IDENTITY_CACHE_TTL_MS, expiresInSec * 1000);
        this.cacheIdentity(token, identity, ttlMs);
        return identity;
    }

    cacheIdentity(token, identity, ttlMs = IDENTITY_CACHE_TTL_MS) {
        // Bounded LRU: evict oldest entry when full.
        if (this.googleIdentityCache.size >= IDENTITY_CACHE_MAX) {
            const oldestKey = this.googleIdentityCache.keys().next().value;
            if (oldestKey !== undefined) {
                this.googleIdentityCache.delete(oldestKey);
            }
        }
        this.googleIdentityCache.set(token, {
            identity,
            expiresAt: Date.now() + ttlMs
        });
    }
}

function getLeaderboardStub(env) {
    const id = env.LEADERBOARD.idFromName(LEADERBOARD_OBJECT_NAME);
    return env.LEADERBOARD.get(id);
}

function buildTopEntries(counts) {
    return Object.entries(counts)
        .map(([date, count]) => ({ date, count }))
        .filter(entry => entry.count > 0)
        .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))
        .slice(0, TOP_N);
}

function getUserStorageKey(identityKey) {
    return `user:${identityKey}`;
}

function getLegacyIdentity(request) {
    const ip = (request.headers.get('CF-Connecting-IP') || '').trim();
    if (!ip) return null;

    const userAgent = (request.headers.get('User-Agent') || 'unknown')
        .trim()
        .slice(0, 120)
        .replace(/[^A-Za-z0-9 ._:-]/g, '_');

    return `legacy:${ip}:${userAgent}`;
}

function isSupportedRoute(pathname, method) {
    if (pathname === '/top' && method === 'GET') return true;
    if (pathname === '/favorite' && method === 'POST') return true;
    if (pathname === '/migrate' && method === 'POST') return true;
    return false;
}

async function parseJson(request) {
    try {
        return { ok: true, value: await request.json() };
    } catch {
        return { ok: false, response: jsonResponse({ error: 'Invalid JSON' }, 400) };
    }
}

function resolveOrigin(request) {
    const origin = request.headers.get('Origin') || '';
    if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.garfieldapp.pages.dev')) {
        return origin;
    }
    return ALLOWED_ORIGINS[0];
}

function corsHeaders(request) {
    return new Headers({
        'Access-Control-Allow-Origin': resolveOrigin(request),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
        'Access-Control-Max-Age': '86400'
    });
}

function withCors(request, response) {
    const headers = new Headers(response.headers);
    for (const [key, value] of corsHeaders(request).entries()) {
        headers.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
