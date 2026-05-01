/**
 * CORS proxy configuration and performance tracking
 *
 * Comic source fallback chain (default: Fandom first):
 *   1. Garfield Fandom Wiki (primary) — all dates from 1978, EN only
 *   2. GoComics (first fallback) — all dates from 1978, supports EN + ES
 *   3. uClick / picayune (second fallback) — all dates from 1978, EN only
 *   4. ArcaMax (last fallback) — last ~30 days, EN only
 */
const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url='
];

const FETCH_TIMEOUT = 15000;

// Performance tracking
const proxyFailureCount = new Array(CORS_PROXIES.length).fill(0);
const proxyResponseTimes = new Array(CORS_PROXIES.length).fill(0);

/**
 * Scores a proxy based on success rate and response time.
 * @param {number} proxyIndex - Proxy index to score
 * @returns {number} Higher score means a better proxy
 */
function getProxyScore(proxyIndex) {
    const failurePenalty = proxyFailureCount[proxyIndex] * 2000;
    const avgTime = proxyResponseTimes[proxyIndex] || 1500;
    return 10000 / (avgTime + failurePenalty + 1);
}

/**
 * Gets public fallback proxies ordered by score.
 * @returns {number[]} Proxy indexes, excluding the Garfield Cloudflare proxy
 */
function getPublicProxyOrder() {
    return CORS_PROXIES
        .map((_, index) => index)
        .filter(index => index !== 0)
        .sort((a, b) => getProxyScore(b) - getProxyScore(a));
}

/**
 * Updates proxy performance statistics
 * @param {number} proxyIndex - Proxy index
 * @param {boolean} success - Whether request succeeded
 * @param {number} responseTime - Response time in ms
 */
function updateProxyStats(proxyIndex, success, responseTime) {
    if (!success) {
        proxyFailureCount[proxyIndex]++;
    } else {
        // Update average response time
        const currentAvg = proxyResponseTimes[proxyIndex] || responseTime;
        proxyResponseTimes[proxyIndex] = (currentAvg + responseTime) / 2;
        // Reset failure count on success
        proxyFailureCount[proxyIndex] = Math.max(0, proxyFailureCount[proxyIndex] - 1);
    }
}

/**
 * Attempts to fetch via a specific proxy
 * @param {string} url - URL to fetch
 * @param {number} proxyIndex - Proxy index to use
 * @param {number} startTime - Start time for tracking
 * @returns {Promise<string>} HTML content
 */
async function tryProxy(url, proxyIndex, startTime) {
    const proxyUrl = CORS_PROXIES[proxyIndex];

    try {
        const fullUrl = `${proxyUrl}${encodeURIComponent(url)}`;
        const response = await fetch(fullUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const responseTime = Date.now() - startTime;
        updateProxyStats(proxyIndex, true, responseTime);

        return await response.text();
    } catch (error) {
        updateProxyStats(proxyIndex, false, 0);
        throw error;
    }
}

/**
 * Fetches through the Garfield Cloudflare proxy first, then public fallbacks.
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML content
 */
async function fetchWithProxyFallback(url) {
    try {
        return await tryProxy(url, 0, Date.now());
    } catch {
        for (const proxyIndex of getPublicProxyOrder()) {
            try {
                return await tryProxy(url, proxyIndex, Date.now());
            } catch {
                continue;
            }
        }

        throw new Error('All proxies failed');
    }
}

// ============================================================
// SHARED UTILITIES
// ============================================================

function _dateToISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function _isRequestedDateTodayInET(date) {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const etToday = new Date(etNow);
    etToday.setHours(0, 0, 0, 0);

    const requestedDay = new Date(date);
    requestedDay.setHours(0, 0, 0, 0);

    return requestedDay.getTime() === etToday.getTime();
}

function _getPreviousDayAtNoon(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12, 0, 0);
}

// ============================================================
// SOURCE 1: GOCOMICS (PRIMARY) — EN + ES
// ============================================================

/**
 * Extracts comic image URL from GoComics HTML
 * @param {string} html
 * @returns {string|null}
 */
function _extractGoComicsImage(html) {
    // featureassets CDN (current)
    let match = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+/);
    if (match) return match[0];

    // amuniversal CDN (legacy)
    match = html.match(/https:\/\/assets\.amuniversal\.com\/[a-f0-9]+/);
    if (match) return match[0];

    // og:image meta tag
    match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (match && match[1] && (match[1].includes('gocomics') || match[1].includes('amuniversal'))) {
        return match[1];
    }

    // picture tag fallback
    match = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
    if (match && match[1]) return match[1];

    return null;
}

async function _getComicFromGoComics(date, language, options = {}) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const comicPath = language === 'es' ? 'garfieldespanol' : 'garfield';
    const url = `https://www.gocomics.com/${comicPath}/${year}/${month}/${day}`;

    const html = await fetchWithProxyFallback(url);

    if (html.includes('<title>404') || html.includes('Page Not Found') || html.includes('does not exist')) {
        return { success: false, imageUrl: null, notFound: true };
    }

    // Cloudflare bot-protection challenge — GoComics is blocking the proxy request.
    // This is a known transient issue; fall through to the next source.
    if (html.includes('Establishing a secure connection') || html.includes('checking your browser')) {
        if (!options.silent) {
            console.warn('GoComics: Cloudflare challenge received — proxy request blocked. Falling back to next source.');
        }
        return { success: false, imageUrl: null, blocked: true };
    }

    const imageUrl = _extractGoComicsImage(html);
    if (imageUrl) {
        // Detect if GoComics redirected to a different date (comic not yet published).
        // Extract the actual date from the canonical/og:url and return it so the caller
        // can correct the displayed date instead of silently showing the wrong strip.
        const requestedPath = `/${year}/${month}/${day}`;
        const canonicalMatch =
            html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ||
            html.match(/property="og:url"[^>]*content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"[^>]*property="og:url"/i);
        if (canonicalMatch && !canonicalMatch[1].includes(requestedPath)) {
            const actualMatch = canonicalMatch[1].match(/\/(\d{4})\/(\d{2})\/(\d{2})/);
            if (actualMatch) {
                const actualDate = new Date(
                    parseInt(actualMatch[1]),
                    parseInt(actualMatch[2]) - 1,
                    parseInt(actualMatch[3]),
                    12, 0, 0
                );
                return { success: true, imageUrl, actualDate };
            }
        }
        return { success: true, imageUrl };
    }

    if (!options.silent) {
        console.warn(`GoComics: no image found in response (HTML length: ${html.length}). First 200 chars: ${html.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
    return { success: false, imageUrl: null };
}

// ============================================================
// SOURCE 2: GARFIELD FANDOM WIKI (FIRST FALLBACK) — EN only
// Uses the Fandom MediaWiki JSON API (CORS-enabled, no proxy needed).
// Images are served via the CORS proxy so they load through Cloudflare
// regardless of the client's VPN or CDN edge assignment.
// ============================================================

/**
 * Fetches a Garfield comic from the Fandom wiki via their public JSON API.
 * The API supports cross-origin requests with origin=* so no CORS proxy is needed.
 *
 * Strategy:
 *   1. Request imageinfo for File:YYYY-MM-DD.gif
 *   2. If not found, try File:YYYY-MM-DD.jpg / .jpeg / .png
 *   Both resolve to a static.wikia.nocookie.net CDN URL which is then
 *   wrapped in the CORS proxy before being returned.
 *
 * @param {Date} date
 * @returns {Promise<{success: boolean, imageUrl: string|null}>}
 */
async function _getComicFromFandom(date, options = {}) {
    const dateStr = _dateToISO(date);
    // Fandom filenames use either regular hyphens (2026-04-01.gif) or
    // en dashes (2026–04–02.gif, U+2013). Try both variants for each extension.
    const enDashStr = dateStr.replace(/-/g, '\u2013');
    const extensions = ['gif', 'jpg', 'jpeg', 'png'];
    const dateCandidates = dateStr === enDashStr ? [dateStr] : [dateStr, enDashStr];

    for (const ext of extensions) {
        for (const ds of dateCandidates) {
        const filename = `${ds}.${ext}`;
        const apiUrl = `https://garfield.fandom.com/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;

        try {
            const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
            if (!resp.ok) continue;

            const data = await resp.json();
            const pages = data?.query?.pages;
            if (!pages) continue;

            // Pages with a negative ID (e.g. -1) are "missing" — skip them
            for (const page of Object.values(pages)) {
                if (page.pageid > 0 && page.imageinfo?.[0]?.url) {
                    const imageUrl = page.imageinfo[0].url;
                    // Route through the CORS proxy so the browser loads via
                    // Cloudflare — independent of client VPN routing or CDN edge.
                    const proxiedUrl = `${CORS_PROXIES[0]}${encodeURIComponent(imageUrl)}`;
                    return { success: true, imageUrl: proxiedUrl };
                }
            }
        } catch (err) {
            if (!options.silent) {
                console.warn(`Fandom API (${filename}):`, err.message);
            }
        }
        }
    }

    if (!options.silent) {
        console.warn(`Fandom wiki: no image found for ${dateStr}`);
    }
    return { success: false, imageUrl: null };
}

// ============================================================
// SOURCE 3: UCLICK / PICAYUNE — EN only, full archive from 1978
// Direct image URLs of the form:
//   https://picayune.uclick.com/comics/ga/YYYY/gaYYMMDD.gif
// We verify existence with a GET request through the user's CORS proxy
// (only the first proxy is used because picayune does not send CORS headers).
// The returned image URL is wrapped in the same proxy so the <img> tag loads
// via Cloudflare — independent of the client's VPN routing.
// ============================================================

async function _getComicFromUClick(date, options = {}) {
    const yyyy = date.getFullYear();
    const yy = String(yyyy).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const imageUrl = `https://picayune.uclick.com/comics/ga/${yyyy}/ga${yy}${mm}${dd}.gif`;
    const proxiedUrl = `${CORS_PROXIES[0]}${encodeURIComponent(imageUrl)}`;

    try {
        const resp = await fetch(proxiedUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-cache'
        });
        if (resp.ok) {
            return { success: true, imageUrl: proxiedUrl };
        }
    } catch (err) {
        if (!options.silent) {
            console.warn(`uClick (${imageUrl}):`, err.message);
        }
    }

    return { success: false, imageUrl: null };
}

// ============================================================
// SOURCE 4: ARCAMAX (LAST FALLBACK) — EN only, last ~30 days
// ============================================================

// In-session date→articleId cache built up during traversal
const _arcamaxDateCache = new Map();

function _isValidArcaMaxPage(html) {
    return html.includes('resources.arcamax.com/newspics') ||
        html.includes('Garfield for') ||
        html.includes('/thefunnies/garfield/');
}

function _extractArcaMaxImage(html) {
    // Primary: direct CDN URL
    let match = html.match(/https:\/\/resources\.arcamax\.com\/newspics\/[^"'\s<>]+/i);
    if (match) return match[0];
    // og:image fallback
    match = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (match && match[1] && match[1].includes('resources.arcamax.com/newspics')) return match[1];
    // data-src / src fallback
    match = html.match(/(?:data-src|src)="(https:\/\/resources\.arcamax\.com\/newspics\/[^"\s<>]+)"/i);
    if (match) return match[1];
    return null;
}

function _extractArcaMaxArticleId(html, knownId) {
    if (knownId) return knownId;
    const encoded = html.match(/garfield%2F(s-\d+)/i);
    if (encoded) return encoded[1];
    const direct = html.match(/\/thefunnies\/garfield\/(s-\d+)/);
    return direct ? direct[1] : null;
}

function _extractArcaMaxNavIds(html) {
    const anchors = [...html.matchAll(/<a\b[^>]*href="(?:https?:\/\/[^/"]*)?\/thefunnies\/garfield\/(s-\d+)"[^>]*>/gi)];
    let prevArticleId = null;
    let nextArticleId = null;
    for (const m of anchors) {
        const cls = (m[0].match(/class="([^"]+)"/i)?.[1] || '').split(/\s+/);
        if (cls.includes('prev') && !prevArticleId) prevArticleId = m[1];
        if (cls.includes('next') && !nextArticleId) nextArticleId = m[1];
    }
    return { prevArticleId, nextArticleId };
}

function _extractArcaMaxStripDate(html) {
    // Share link: h=Garfield+for+3%2F31%2F2026
    let match = html.match(/h=Garfield\+for\+([^"&]+)/);
    if (match) {
        const d = new Date(decodeURIComponent(match[1].replace(/\+/g, ' ')));
        if (!isNaN(d)) return d;
    }
    // alt attribute on comic image
    match = html.match(/alt="Garfield\s+for\s+(\d{1,2}\/\d{1,2}\/\d{4})"/i);
    if (match) {
        const d = new Date(match[1]);
        if (!isNaN(d)) return d;
    }
    return null;
}

async function _getComicFromArcaMax(date) {
    // ArcaMax only holds ~30 days; skip immediately for older requests
    const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (daysAgo > 31) return { success: false, imageUrl: null };

    const targetDateStr = _dateToISO(date);

    // If we already know the articleId for this date, go straight to it
    if (_arcamaxDateCache.has(targetDateStr)) {
        const cachedId = _arcamaxDateCache.get(targetDateStr);
        try {
            const html = await fetchWithProxyFallback(`https://www.arcamax.com/thefunnies/garfield/${cachedId}`);
            const imageUrl = _extractArcaMaxImage(html);
            if (imageUrl) return { success: true, imageUrl };
        } catch { /* fall through to traversal */ }
    }

    // Traverse from "latest" backwards up to 32 steps to find the target date.
    // Each successful page is cached so subsequent lookups are O(1).
    let url = 'https://www.arcamax.com/thefunnies/garfield/';
    const MAX_STEPS = 32;

    for (let step = 0; step < MAX_STEPS; step++) {
        let html;
        try {
            html = await fetchWithProxyFallback(url);
        } catch {
            break;
        }

        if (!_isValidArcaMaxPage(html)) break;

        const imageUrl = _extractArcaMaxImage(html);
        const isLanding = step === 0 && url.endsWith('/garfield/');
        const urlId = !isLanding ? url.split('/').pop() : null;
        const articleId = _extractArcaMaxArticleId(html, urlId);
        const stripDate = _extractArcaMaxStripDate(html);
        const { prevArticleId } = _extractArcaMaxNavIds(html);

        if (articleId && stripDate) {
            const dateStr = _dateToISO(stripDate);
            _arcamaxDateCache.set(dateStr, articleId);

            if (dateStr === targetDateStr && imageUrl) {
                return { success: true, imageUrl };
            }

            // Gone past the target date — stop
            if (stripDate.getTime() < date.getTime()) break;
        }

        if (!prevArticleId) break;
        url = `https://www.arcamax.com/thefunnies/garfield/${prevArticleId}`;
    }

    return { success: false, imageUrl: null };
}

// ============================================================
// MAIN EXPORT — orchestrates the fallback chain
// ============================================================

/**
 * Fetches a Garfield comic for the given date.
 *
 * Tries sources in order. ArcaMax is always last; the EN-capable sources
 * (fandom / gocomics / uclick) are reordered so that the user's preferred
 * source is tried first, followed by the others in a fixed fallback order.
 *
 * @param {Date} date
 * @param {string} language     - 'en' or 'es'  (ES only available on GoComics)
 * @param {string} preferredSource - 'fandom' (default) | 'gocomics' | 'uclick'
 * @returns {Promise<{success: boolean, imageUrl: string|null, notFound?: boolean}>}
 */
export async function getAuthenticatedComic(date, language = 'en', preferredSource = 'fandom', options = {}) {
    // Build the ordered list of sources to try.
    // ArcaMax is always appended last; the three EN-capable sources rotate
    // so the user's preferred source is first.
    const FALLBACK_ORDER = {
        fandom:   ['fandom', 'gocomics', 'uclick', 'arcamax'],
        gocomics: ['gocomics', 'fandom', 'uclick', 'arcamax'],
        uclick:   ['uclick', 'fandom', 'gocomics', 'arcamax']
    };
    const order = FALLBACK_ORDER[preferredSource] || FALLBACK_ORDER.fandom;
    const maxSources = Number.isInteger(options.maxSources) && options.maxSources > 0
        ? options.maxSources
        : null;
    const sourceOrder = maxSources ? order.slice(0, maxSources) : order;

    for (const source of sourceOrder) {
        // Spanish is only available on GoComics
        if (language === 'es' && source !== 'gocomics') {
            if (source === 'arcamax') break; // No point trying further
            continue;
        }

        try {
            let result;
            if (source === 'gocomics') {
                result = await _getComicFromGoComics(date, language, options);
            } else if (source === 'fandom') {
                result = await _getComicFromFandom(date, options);
            } else if (source === 'uclick') {
                result = await _getComicFromUClick(date, options);
            } else {
                result = await _getComicFromArcaMax(date);
            }

            if (result.success) return result;

            // If today's strip is missing, first treat it as a source-local
            // timezone/publication delay and retry yesterday within that same
            // source before falling back across sources.
            if (!options.disableTodayFallback && _isRequestedDateTodayInET(date) && source !== 'arcamax') {
                const yesterday = _getPreviousDayAtNoon(date);
                let yesterdayResult;
                if (source === 'gocomics') {
                    yesterdayResult = await _getComicFromGoComics(yesterday, language, options);
                } else if (source === 'fandom') {
                    yesterdayResult = await _getComicFromFandom(yesterday, options);
                } else if (source === 'uclick') {
                    yesterdayResult = await _getComicFromUClick(yesterday, options);
                }

                if (yesterdayResult && yesterdayResult.success) {
                    return { ...yesterdayResult, actualDate: yesterday };
                }
            }

            if (!options.silent) {
                if (result.blocked) {
                    console.warn(`${source}: proxy blocked by bot-protection, trying next source`);
                } else {
                    console.warn(`${source}: unavailable, no comic found`);
                }
            }
        } catch (err) {
            if (!options.silent) {
                console.warn(`${source} error:`, err.message);
            }
        }
    }

    return { success: false, imageUrl: null };
}

