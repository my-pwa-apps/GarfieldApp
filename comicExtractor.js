/**
 * CORS proxy configuration and performance tracking
 *
 * Comic source fallback chain (default: Fandom first):
 *   1. Garfield Fandom Wiki (primary) — all dates from 1978, EN only
 *   2. GoComics (first fallback) — all dates from 1978, supports EN + ES
 *   3. ArcaMax (second fallback) — last ~30 days, EN only
 */
const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url='
];

const FETCH_TIMEOUT = 15000;

// Performance tracking
let workingProxyIndex = 0;
const proxyFailureCount = new Array(CORS_PROXIES.length).fill(0);
const proxyResponseTimes = new Array(CORS_PROXIES.length).fill(0);

/**
 * Gets the best performing proxy based on success rate and response time
 * @returns {number} Index of the best proxy
 */
function getBestProxyIndex() {
    let bestIndex = workingProxyIndex;
    let bestScore = -Infinity;
    
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        const failurePenalty = proxyFailureCount[i] * 2000;
        const avgTime = proxyResponseTimes[i] || 1500;
        const score = 10000 / (avgTime + failurePenalty + 1);
        
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    
    return bestIndex;
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
        workingProxyIndex = proxyIndex;
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
            updateProxyStats(proxyIndex, false, 0);
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
 * Fetches with intelligent proxy fallback and parallel racing
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML content
 */
async function fetchWithProxyFallback(url) {
    const startTime = Date.now();
    const bestProxy = getBestProxyIndex();
    
    try {
        return await tryProxy(url, bestProxy, startTime);
    } catch (firstError) {
        // Race all other proxies in parallel
        const otherProxies = CORS_PROXIES.map((_, i) => i).filter(i => i !== bestProxy);
        const promises = otherProxies.map(i => tryProxy(url, i, Date.now()));
        
        try {
            return await Promise.any(promises);
        } catch (allError) {
            throw new Error('All proxies failed');
        }
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

async function _getComicFromGoComics(date, language) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const comicPath = language === 'es' ? 'garfieldespanol' : 'garfield';
    const url = `https://www.gocomics.com/${comicPath}/${year}/${month}/${day}`;
    
    const html = await fetchWithProxyFallback(url);
    
    if (html.includes('<title>404') || html.includes('Page Not Found') || html.includes('does not exist')) {
        return { success: false, imageUrl: null, notFound: true };
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
    
    console.warn(`GoComics: no image extracted (HTML length: ${html.length})`);
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
async function _getComicFromFandom(date) {
    const dateStr = _dateToISO(date);
    const extensions = ['gif', 'jpg', 'jpeg', 'png'];

    for (const ext of extensions) {
        const filename = `${dateStr}.${ext}`;
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
            console.warn(`Fandom API (${filename}):`, err.message);
        }
    }

    console.warn(`Fandom wiki: no image found for ${dateStr}`);
    return { success: false, imageUrl: null };
}

// ============================================================
// SOURCE 3: ARCAMAX (SECOND FALLBACK) — EN only, last ~30 days
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
 * Tries sources in order: preferredSource → the other non-ArcaMax source → ArcaMax.
 * ArcaMax is always the last fallback regardless of preferredSource.
 *
 * @param {Date} date
 * @param {string} language     - 'en' or 'es'  (ES only available on GoComics)
 * @param {string} preferredSource - 'fandom' (default) | 'gocomics'
 * @returns {Promise<{success: boolean, imageUrl: string|null, notFound?: boolean}>}
 */
export async function getAuthenticatedComic(date, language = 'en', preferredSource = 'fandom') {
    // When fandom is the preferred source, only try fandom — no fallback.
    // GoComics and ArcaMax are only used when the user explicitly selects them.
    const order = preferredSource === 'fandom'
        ? ['fandom']
        : ['gocomics', 'arcamax'];

    for (const source of order) {
        // Spanish is only available on GoComics
        if (language === 'es' && source !== 'gocomics') {
            if (source === 'arcamax') break; // No point trying further
            continue;
        }

        try {
            let result;
            if (source === 'gocomics') {
                result = await _getComicFromGoComics(date, language);
            } else if (source === 'fandom') {
                result = await _getComicFromFandom(date);
            } else {
                result = await _getComicFromArcaMax(date);
            }

            if (result.success) return result;

            // Fandom: if today's comic isn't published yet, silently fall back to
            // yesterday within the same source. This mirrors GoComics' redirect
            // behaviour and reuses the existing actualDate correction path in the UI.
            if (source === 'fandom') {
                const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
                const etToday = new Date(etNow); etToday.setHours(0, 0, 0, 0);
                const requestedDay = new Date(date); requestedDay.setHours(0, 0, 0, 0);
                if (requestedDay.getTime() === etToday.getTime()) {
                    const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12, 0, 0);
                    const yesterdayResult = await _getComicFromFandom(yesterday);
                    if (yesterdayResult.success) {
                        return { ...yesterdayResult, actualDate: yesterday };
                    }
                }
            }

            console.warn(`${source}: unavailable, no comic found`);
        } catch (err) {
            console.warn(`${source} error:`, err.message);
        }
    }

    return { success: false, imageUrl: null };
}

