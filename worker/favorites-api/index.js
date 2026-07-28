/**
 * GarfieldApp Favorites Leaderboard API
 *
 * Uses a Durable Object as the source of truth so leaderboard writes are
 * serialized and counts remain consistent under concurrent traffic.
 *
 * Leaderboard writes require a verified Google bearer token. Reads remain public.
 */

const ALLOWED_ORIGINS = [
    'https://garfieldapp.pages.dev',
    'https://garfield.local',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'http://localhost:8080'
];

const DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;
// Garfield's first published strip. Nothing before this can be a real comic.
const GARFIELD_START_UTC = Date.UTC(1978, 5, 19);
// Leaderboard payloads are tiny: one date, or at most MIGRATE_MAX date strings.
// 64 KB leaves generous headroom while bounding Durable Object memory/CPU.
const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
// How often expired rate-limit records are swept from Durable Object storage.
const RATE_LIMIT_SWEEP_INTERVAL_MS = 10 * 60_000;
const MIGRATE_MAX = 500;
const TOP_N = 50;
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
// Must match the OAuth client_id used by googleDriveSync.js on the frontend.
// Configured in wrangler.toml so the value has one authoritative home per
// deployment; the literal below is only the local/dev default.
const DEFAULT_GOOGLE_CLIENT_ID = '495923472176-iummunjkudkt4p7bqtd5m7441664gl6t.apps.googleusercontent.com';
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IDENTITY_CACHE_MAX = 500;
const LEADERBOARD_OBJECT_NAME = 'global';
const LEADERBOARD_VERSION = 'google-v1';
// Legacy single-object keys, kept only so existing deployments can be migrated
// to the sharded layout on first write. See migrateLegacyCounts().
const COUNTS_KEY = `counts:${LEADERBOARD_VERSION}`;
const UPDATED_AT_KEY = `updated-at:${LEADERBOARD_VERSION}`;
const TOP_KEY = `top:${LEADERBOARD_VERSION}`;
// One storage value per comic date. Storing every count in a single object made
// each vote rewrite the whole map and, more importantly, put the leaderboard on
// a collision course with the 128 KiB per-value Durable Object storage limit.
const COUNT_PREFIX = `count:${LEADERBOARD_VERSION}:`;
const RATE_PREFIX = 'rate:';
const LIST_PAGE_SIZE = 1000;

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        }

        const url = new URL(request.url);
        if (!isSupportedRoute(url.pathname, request.method)) {
            return withCors(request, jsonResponse({ error: 'Not found' }, 404), env);
        }

        try {
            const stub = getLeaderboardStub(env);
            const response = await stub.fetch(request);
            return withCors(request, response, env);
        } catch (error) {
            console.error('favorites-api worker error', error);
            return withCors(request, jsonResponse({ error: 'Internal error' }, 500), env);
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
        if (!isValidComicDate(date)) {
            return jsonResponse({ error: 'Invalid date (expected YYYY/MM/DD within the published Garfield range)' }, 400);
        }
        if (action !== 'add' && action !== 'remove') {
            return jsonResponse({ error: 'Invalid action (expected "add" or "remove")' }, 400);
        }

        await this.migrateLegacyCounts();

        const userStorageKey = getUserStorageKey(identity.key);
        const favorites = new Set((await this.state.storage.get(userStorageKey)) || []);
        const current = await this.getCountEntry(date);

        if (action === 'add' ? favorites.has(date) : !favorites.has(date)) {
            return jsonResponse({
                ok: true,
                count: current.count,
                updatedAt: current.updatedAt,
                unchanged: true
            });
        }

        const nextCount = action === 'add'
            ? current.count + 1
            : Math.max(0, current.count - 1);

        if (action === 'add') favorites.add(date);
        else favorites.delete(date);

        const updatedAt = new Date().toISOString();
        await this.writeCountEntry(date, nextCount, updatedAt);
        await this.saveUserFavorites(userStorageKey, favorites);
        await this.refreshTop([{ date, previousCount: current.count, count: nextCount, updatedAt }]);

        return jsonResponse({ ok: true, count: nextCount, updatedAt });
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

        const validDates = [...new Set(dates.filter(isValidComicDate))].sort();
        if (!validDates.length) {
            return jsonResponse({ error: 'No valid dates found' }, 400);
        }

        await this.migrateLegacyCounts();

        const userStorageKey = getUserStorageKey(identity.key);
        const favorites = new Set((await this.state.storage.get(userStorageKey)) || []);
        const updatedAt = new Date().toISOString();
        const changes = [];

        for (const date of validDates) {
            if (favorites.has(date)) continue;
            favorites.add(date);
            const current = await this.getCountEntry(date);
            const nextCount = current.count + 1;
            await this.writeCountEntry(date, nextCount, updatedAt);
            changes.push({ date, previousCount: current.count, count: nextCount, updatedAt });
        }

        if (changes.length === 0) {
            return jsonResponse({ ok: true, migrated: 0, unchanged: true });
        }

        await this.saveUserFavorites(userStorageKey, favorites);
        await this.refreshTop(changes);

        return jsonResponse({ ok: true, migrated: changes.length, updatedAt });
    }

    /**
     * Read the per-date count shard.
     * @returns {Promise<{count: number, updatedAt: string|null}>}
     */
    async getCountEntry(date) {
        const stored = await this.state.storage.get(COUNT_PREFIX + date);
        return {
            count: Number(stored?.count) || 0,
            updatedAt: stored?.updatedAt || null
        };
    }

    async writeCountEntry(date, count, updatedAt) {
        if (count > 0) {
            await this.state.storage.put(COUNT_PREFIX + date, { count, updatedAt });
        } else {
            await this.state.storage.delete(COUNT_PREFIX + date);
        }
    }

    async saveUserFavorites(userStorageKey, favorites) {
        if (favorites.size > 0) {
            await this.state.storage.put(userStorageKey, [...favorites].sort());
        } else {
            await this.state.storage.delete(userStorageKey);
        }
    }

    /**
     * Keep the cached top-N list in sync after one or more count changes.
     *
     * Increments are applied in place — the changed date either climbs the list
     * or stays out of it, and no other entry can be displaced from the window.
     * A decrement on an entry that was inside a *full* window can promote an
     * unknown date from outside it, so that (much rarer) case falls back to a
     * full scan of the count shards.
     * @param {{date: string, previousCount: number, count: number, updatedAt: string}[]} changes
     */
    async refreshTop(changes) {
        let top = (await this.state.storage.get(TOP_KEY)) || [];
        let needsFullScan = false;

        for (const change of changes) {
            const existingIndex = top.findIndex(entry => entry.date === change.date);
            const wasInTop = existingIndex !== -1;
            if (wasInTop) top.splice(existingIndex, 1);

            if (change.count < change.previousCount && wasInTop && top.length + 1 >= TOP_N) {
                needsFullScan = true;
                break;
            }

            if (change.count > 0) {
                top.push({ date: change.date, count: change.count, updatedAt: change.updatedAt });
            }
        }

        top = needsFullScan
            ? await this.scanTopEntries()
            : sortTopEntries(top).slice(0, TOP_N);

        await this.state.storage.put(TOP_KEY, top);
    }

    /**
     * Rebuild the top-N list by paging through every count shard.
     * @returns {Promise<{date: string, count: number, updatedAt: string|null}[]>}
     */
    async scanTopEntries() {
        const entries = [];
        let startAfter;

        for (;;) {
            const page = await this.state.storage.list({
                prefix: COUNT_PREFIX,
                limit: LIST_PAGE_SIZE,
                ...(startAfter ? { startAfter } : {})
            });
            if (!page || page.size === 0) break;

            let lastKey;
            for (const [key, value] of page) {
                lastKey = key;
                if (Number(value?.count) > 0) {
                    entries.push({
                        date: key.slice(COUNT_PREFIX.length),
                        count: Number(value.count),
                        updatedAt: value.updatedAt || null
                    });
                }
            }

            if (page.size < LIST_PAGE_SIZE) break;
            startAfter = lastKey;
        }

        return sortTopEntries(entries).slice(0, TOP_N);
    }

    /**
     * One-time expansion of the legacy `counts`/`updated-at` objects into
     * per-date shards. Runs at most once per Durable Object instance.
     */
    async migrateLegacyCounts() {
        if (this.legacyCountsMigrated) return;

        const counts = await this.state.storage.get(COUNTS_KEY);
        if (counts && typeof counts === 'object') {
            const updatedAtByDate = (await this.state.storage.get(UPDATED_AT_KEY)) || {};
            for (const [date, count] of Object.entries(counts)) {
                if (Number(count) > 0) {
                    await this.state.storage.put(COUNT_PREFIX + date, {
                        count: Number(count),
                        updatedAt: updatedAtByDate[date] || null
                    });
                }
            }
            await this.state.storage.delete(COUNTS_KEY);
            await this.state.storage.delete(UPDATED_AT_KEY);
            // Rebuild the cached window from the new shards so it reflects the
            // migrated data even if the old TOP_KEY was stale or absent.
            await this.state.storage.put(TOP_KEY, await this.scanTopEntries());
        }

        this.legacyCountsMigrated = true;
    }

    async enforceRateLimit(identityKey) {
        const rateKey = `${RATE_PREFIX}${identityKey}`;
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
        // Rate-limit records are worthless once their window closes, but they
        // used to be written and never deleted, so storage grew by one key per
        // distinct signed-in user forever. Sweep them on an alarm.
        await this.ensureRateLimitSweep();
        return null;
    }

    async ensureRateLimitSweep() {
        if (typeof this.state.storage.getAlarm !== 'function') return;

        const existing = await this.state.storage.getAlarm();
        if (existing) return;
        await this.state.storage.setAlarm(Date.now() + RATE_LIMIT_SWEEP_INTERVAL_MS);
    }

    /**
     * Delete expired rate-limit records, rescheduling while any remain.
     */
    async alarm() {
        const now = Date.now();
        let remaining = 0;

        const page = await this.state.storage.list({ prefix: RATE_PREFIX, limit: LIST_PAGE_SIZE });
        for (const [key, value] of page || []) {
            if (!value || value.resetAt <= now) {
                await this.state.storage.delete(key);
            } else {
                remaining += 1;
            }
        }

        if (remaining > 0 && typeof this.state.storage.setAlarm === 'function') {
            await this.state.storage.setAlarm(now + RATE_LIMIT_SWEEP_INTERVAL_MS);
        }
    }

    async resolveIdentity(request) {
        const authHeader = request.headers.get('Authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
            return { errorResponse: jsonResponse({ error: 'Google sign-in required' }, 401) };
        }

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
        const expectedAudience = this.env?.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
        if (!tokenInfo || tokenInfo.aud !== expectedAudience) {
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

/**
 * Sort leaderboard entries in place: highest count first, then oldest date.
 * @template {{date: string, count: number}} T
 * @param {T[]} entries
 * @returns {T[]}
 */
function sortTopEntries(entries) {
    return entries.sort((a, b) => b.count - a.count || a.date.localeCompare(b.date));
}

function getUserStorageKey(identityKey) {
    return `user:${LEADERBOARD_VERSION}:${identityKey}`;
}

function isSupportedRoute(pathname, method) {
    if (pathname === '/top' && method === 'GET') return true;
    if (pathname === '/favorite' && method === 'POST') return true;
    if (pathname === '/migrate' && method === 'POST') return true;
    return false;
}

async function parseJson(request) {
    const declaredLength = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return { ok: false, response: jsonResponse({ error: 'Payload too large' }, 413) };
    }

    let text;
    try {
        text = await request.text();
    } catch {
        return { ok: false, response: jsonResponse({ error: 'Invalid JSON' }, 400) };
    }

    // Chunked/unknown-length bodies bypass the Content-Length check above, so
    // enforce the same bound on the materialized payload before parsing it.
    if (text.length > MAX_BODY_BYTES) {
        return { ok: false, response: jsonResponse({ error: 'Payload too large' }, 413) };
    }

    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false, response: jsonResponse({ error: 'Invalid JSON' }, 400) };
    }
}

/**
 * Strict calendar validation for a `YYYY/MM/DD` comic date.
 *
 * The shape check alone accepts impossible values such as `9999/99/99`, dates
 * before the strip existed, and future dates, all of which pollute the
 * leaderboard with entries that can never resolve to a comic.
 */
function isValidComicDate(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;

    const [year, month, day] = value.split('/').map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const roundTrip = new Date(timestamp);

    // Rejects overflowed components (e.g. 2024/02/31 -> March 2).
    if (roundTrip.getUTCFullYear() !== year ||
        roundTrip.getUTCMonth() !== month - 1 ||
        roundTrip.getUTCDate() !== day) {
        return false;
    }

    if (timestamp < GARFIELD_START_UTC) return false;
    return timestamp <= getLatestPublishableComicDateUTC();
}

/**
 * GoComics publishes on US Eastern time. Allow "today" in Eastern plus one day
 * of slack so clients slightly ahead of the Worker clock are not rejected.
 */
function getLatestPublishableComicDateUTC() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Date.UTC(Number(lookup.year), Number(lookup.month) - 1, Number(lookup.day)) + 86_400_000;
}

function getAllowedOrigins(env) {
    const configuredOrigins = typeof env?.ALLOWED_ORIGINS === 'string'
        ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
        : [];
    return [...new Set([...ALLOWED_ORIGINS, ...configuredOrigins])];
}

function resolveOrigin(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = getAllowedOrigins(env);
    if (allowedOrigins.includes(origin) || origin.endsWith('.garfieldapp.pages.dev')) {
        return origin;
    }
    return allowedOrigins[0];
}

function corsHeaders(request, env) {
    return new Headers({
        'Access-Control-Allow-Origin': resolveOrigin(request, env),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        // The allowed origin is request-dependent and `/top` is publicly
        // cacheable, so shared caches must key on Origin.
        'Vary': 'Origin'
    });
}

function withCors(request, response, env) {
    const headers = new Headers(response.headers);
    for (const [key, value] of corsHeaders(request, env).entries()) {
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
