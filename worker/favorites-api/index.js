/**
 * GarfieldApp Favorites Leaderboard API
 *
 * Cloudflare Worker + KV for tracking global favorite counts.
 * KV namespace binding: FAVORITES
 *
 * Endpoints:
 *   GET  /top      → Top 10 most favorited comic dates
 *   POST /favorite → Report a favorite toggle { date, action: "add"|"remove" }
 *   POST /migrate  → Bulk-import existing favorites { dates: ["YYYY/MM/DD", ...] }
 */

const ALLOWED_ORIGINS = [
    'https://garfieldapp.pages.dev',
    'http://localhost:8000',
    'http://localhost:8080'
];

const DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;
const RATE_LIMIT_MAX = 30;   // max toggles per IP per minute
const MIGRATE_MAX = 500;     // max dates per migration request
const TOP_N = 10;

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request) });
        }

        const url = new URL(request.url);
        let response;

        try {
            if (url.pathname === '/top' && request.method === 'GET') {
                response = await handleGetTop(env);
            } else if (url.pathname === '/favorite' && request.method === 'POST') {
                response = await handlePostFavorite(request, env);
            } else if (url.pathname === '/migrate' && request.method === 'POST') {
                response = await handleMigrate(request, env);
            } else {
                response = jsonResponse({ error: 'Not found' }, 404);
            }
        } catch {
            response = jsonResponse({ error: 'Internal error' }, 500);
        }

        return withCors(request, response);
    }
};

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleGetTop(env) {
    const cached = await env.FAVORITES.get('top10', 'json');
    return new Response(JSON.stringify(cached || []), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30'
        }
    });
}

async function handlePostFavorite(request, env) {
    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `ratelimit:${ip}`;
    const rateCount = parseInt(await env.FAVORITES.get(rateLimitKey) || '0', 10);

    if (rateCount >= RATE_LIMIT_MAX) {
        return jsonResponse({ error: 'Rate limited' }, 429);
    }
    await env.FAVORITES.put(rateLimitKey, String(rateCount + 1), { expirationTtl: 60 });

    // Parse & validate
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const { date, action } = body;

    if (!date || !DATE_PATTERN.test(date)) {
        return jsonResponse({ error: 'Invalid date format (expected YYYY/MM/DD)' }, 400);
    }
    if (action !== 'add' && action !== 'remove') {
        return jsonResponse({ error: 'Invalid action (expected "add" or "remove")' }, 400);
    }

    // Update counts
    const counts = (await env.FAVORITES.get('counts', 'json')) || {};
    const current = counts[date] || 0;

    if (action === 'add') {
        counts[date] = current + 1;
    } else {
        counts[date] = Math.max(0, current - 1);
        if (counts[date] === 0) delete counts[date];
    }

    await env.FAVORITES.put('counts', JSON.stringify(counts));

    // Rebuild top-N cache
    const sorted = Object.entries(counts)
        .map(([d, c]) => ({ date: d, count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N);

    await env.FAVORITES.put('top10', JSON.stringify(sorted));

    return jsonResponse({ ok: true, count: counts[date] || 0 });
}

async function handleMigrate(request, env) {
    // Rate limiting — one migration per IP ever (keyed separately)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const migrateKey = `migrated:${ip}`;
    const alreadyMigrated = await env.FAVORITES.get(migrateKey);

    if (alreadyMigrated) {
        return jsonResponse({ ok: true, skipped: true, message: 'Already migrated' });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const { dates } = body;
    if (!Array.isArray(dates) || dates.length === 0) {
        return jsonResponse({ error: 'Expected non-empty dates array' }, 400);
    }
    if (dates.length > MIGRATE_MAX) {
        return jsonResponse({ error: `Max ${MIGRATE_MAX} dates per migration` }, 400);
    }

    // Validate all dates
    const validDates = dates.filter(d => typeof d === 'string' && DATE_PATTERN.test(d));
    if (validDates.length === 0) {
        return jsonResponse({ error: 'No valid dates found' }, 400);
    }

    // Bulk-increment counts
    const counts = (await env.FAVORITES.get('counts', 'json')) || {};
    for (const d of validDates) {
        counts[d] = (counts[d] || 0) + 1;
    }

    await env.FAVORITES.put('counts', JSON.stringify(counts));

    // Rebuild top-N cache
    const sorted = Object.entries(counts)
        .map(([d, c]) => ({ date: d, count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N);
    await env.FAVORITES.put('top10', JSON.stringify(sorted));

    // Mark this IP as migrated (never expires)
    await env.FAVORITES.put(migrateKey, '1');

    return jsonResponse({ ok: true, migrated: validDates.length });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
        'Access-Control-Allow-Headers': 'Content-Type',
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
