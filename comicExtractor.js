/**
 * Dedicated CORS proxy and comic source discovery
 *
 * Comic source fallback chain (runtime default in the app: uClick first):
 *   1. uClick / picayune (default UI source) — all dates from 1978
 *   2. Garfield Fandom Wiki (fallback) — all dates from 1978
 *   3. ArcaMax (last fallback) — last ~30 days
 */
const CORS_PROXY = 'https://garfieldapp-corsproxy.garfieldapp.workers.dev/?';
const FETCH_TIMEOUT = 4000;

function requestSignal(options) {
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT);
    return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

async function fetchViaProxy(url, options = {}) {
    const fullUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
    const response = await fetch(fullUrl, {
        signal: requestSignal(options),
        mode: 'cors',
        credentials: 'omit'
    });
    if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.text();
}

function _dateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const _easternDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

function _isRequestedDateTodayInET(date) {
    const parts = Object.fromEntries(_easternDateFormatter.formatToParts(new Date()).map(part => [part.type, part.value]));
    return _dateToISO(date) === `${parts.year}-${parts.month}-${parts.day}`;
}

function _getPreviousDayAtNoon(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12, 0, 0);
}

// ============================================================
// SOURCE 1: GARFIELD FANDOM WIKI — full archive from 1978
// Uses the Fandom MediaWiki JSON API (CORS-enabled, no proxy needed).
// Images are served via the CORS proxy so they load through Cloudflare
// regardless of the client's VPN or CDN edge assignment.
// ============================================================

/**
 * Fetches a Garfield comic from the Fandom wiki via their public JSON API.
 * The API supports cross-origin requests with origin=* so no CORS proxy is needed.
 *
 * Strategy: MediaWiki's `titles` parameter accepts a pipe-separated batch, so
 * all filename candidates (gif/jpg/jpeg/png x hyphen/en-dash) are resolved in a
 * single round trip instead of up to eight sequential ones. The first candidate
 * that exists — in preference order — wins. The resulting
 * static.wikia.nocookie.net CDN URL is wrapped in the CORS proxy before being
 * returned so it loads through Cloudflare regardless of the client's VPN or CDN
 * edge assignment.
 *
 * @param {Date} date
 * @param {{silent?: boolean}} [options]
 * @returns {Promise<{success: boolean, imageUrl: string|null}>}
 */
async function _getComicFromFandom(date, options = {}) {
    const dateStr = _dateToISO(date);
    const cacheKey = `fandom:${dateStr}`;
    if (_fandomLookupCache.has(cacheKey)) {
        return _fandomLookupCache.get(cacheKey);
    }

    // Fandom filenames use either regular hyphens (2026-04-01.gif) or
    // en dashes (2026–04–02.gif, U+2013). Try both variants for each extension.
    const enDashStr = dateStr.replace(/-/g, '\u2013');
    const extensions = ['gif', 'jpg', 'jpeg', 'png'];
    const dateCandidates = dateStr === enDashStr ? [dateStr] : [dateStr, enDashStr];

    // Preference order: extension first, then hyphen before en dash.
    const filenames = extensions.flatMap(ext => dateCandidates.map(ds => `${ds}.${ext}`));
    const titles = filenames.map(name => `File:${name}`);
    const apiUrl = `https://garfield.fandom.com/api.php?action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=imageinfo&iiprop=url&format=json&origin=*`;

    try {
        const resp = await fetch(apiUrl, { signal: requestSignal(options) });
        if (resp.ok) {
            const data = await resp.json();
            const pages = Object.values(data?.query?.pages || {});

            // MediaWiki may normalize the requested titles (e.g. underscores),
            // so map the responses back onto our preference order by title.
            const byTitle = new Map();
            for (const page of pages) {
                // Pages with a negative ID (e.g. -1) are "missing" — skip them
                if (page?.pageid > 0 && page.imageinfo?.[0]?.url && page.title) {
                    byTitle.set(page.title.replace(/_/g, ' '), page.imageinfo[0].url);
                }
            }

            for (const title of titles) {
                const imageUrl = byTitle.get(title);
                if (!imageUrl) continue;
                // Route through the CORS proxy so the browser loads via
                // Cloudflare — independent of client VPN routing or CDN edge.
                const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(imageUrl)}`;
                const result = { success: true, imageUrl: proxiedUrl };
                _fandomLookupCache.set(cacheKey, result);
                return result;
            }

            const missingResult = { success: false, imageUrl: null, notFound: true };
            _fandomLookupCache.set(cacheKey, missingResult);
            if (!options.silent) {
                console.warn(`Fandom wiki: no image found for ${dateStr}`);
            }
            return missingResult;
        }
    } catch (err) {
        if (!options.silent) {
            console.warn(`Fandom API (${dateStr}):`, err.message);
        }
        // A transient network error must not be cached as a permanent miss.
        return { success: false, imageUrl: null };
    }

    return { success: false, imageUrl: null };
}

// ============================================================
// SOURCE 2: UCLICK / PICAYUNE (DEFAULT) — full archive from 1978
// Direct image URLs of the form:
//   https://picayune.uclick.com/comics/ga/YYYY/gaYYMMDD.{gif|jpg}
// Modern Sunday color strips use .jpg while daily strips and older archival
// Sundays use .gif. We verify existence with a HEAD request through the
// dedicated CORS proxy, probing the expected extension for the weekday first.
// ============================================================

async function _getComicFromUClick(date, options = {}) {
    const yyyy = date.getFullYear();
    const yy = String(yyyy).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const extensions = date.getDay() === 0 ? ['jpg', 'gif'] : ['gif', 'jpg'];
    let allNotFound = true;

    for (const ext of extensions) {
        options.signal?.throwIfAborted();
        const imageUrl = `https://picayune.uclick.com/comics/ga/${yyyy}/ga${yy}${mm}${dd}.${ext}`;
        const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(imageUrl)}`;

        try {
            const early = typeof window !== 'undefined' ? window.__earlyUClickProbe : null;
            let resp;
            if (early?.proxiedUrl === proxiedUrl) {
                delete window.__earlyUClickProbe;
                resp = await early.promise;
            } else {
                // HEAD, not GET: this call only probes for existence so the strip
                // is not transferred twice (once here, once by the <img> tag).
                resp = await fetch(proxiedUrl, {
                    method: 'HEAD',
                    signal: requestSignal(options),
                    mode: 'cors',
                    credentials: 'omit',
                    cache: 'no-cache'
                });
            }
            if (resp.ok) {
                return { success: true, imageUrl: proxiedUrl };
            }
            if (resp.status !== 404) {
                allNotFound = false;
                if (resp.status === 403) return { success: false, imageUrl: null, blocked: true };
                break;
            }
        } catch (err) {
            options.signal?.throwIfAborted();
            allNotFound = false;
            if (!options.silent) {
                console.warn(`uClick (${imageUrl}):`, err.message);
            }
            break;
        }
    }

    return allNotFound
        ? { success: false, imageUrl: null, notFound: true }
        : { success: false, imageUrl: null };
}

// ============================================================
// SOURCE 3: ARCAMAX (LAST FALLBACK) — last ~30 days
// ============================================================

// In-session date→articleId cache built up during traversal
const _arcamaxDateCache = new Map();
const _fandomLookupCache = new Map();

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

async function _getComicFromArcaMax(date, options = {}) {
    // ArcaMax only holds ~30 days; skip immediately for older requests
    const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (daysAgo > 31) return { success: false, imageUrl: null };

    const targetDateStr = _dateToISO(date);

    // If we already know the articleId for this date, go straight to it
    if (_arcamaxDateCache.has(targetDateStr)) {
        const cachedId = _arcamaxDateCache.get(targetDateStr);
        try {
            const html = await fetchViaProxy(`https://www.arcamax.com/thefunnies/garfield/${cachedId}`, options);
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
            html = await fetchViaProxy(url, options);
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

async function _fetchComicFromSource(source, date, options) {
    if (source === 'uclick') return _getComicFromUClick(date, options);
    if (source === 'fandom') return _getComicFromFandom(date, options);
    return _getComicFromArcaMax(date, options);
}

/**
 * Fetches a Garfield comic for the given date.
 *
 * Tries sources in order. ArcaMax is always last; the full-archive sources
 * (uclick / fandom) rotate so the user's preferred source is tried first.
 *
 * @param {Date} date
 * @param {string} [preferredSource='uclick'] - 'uclick' | 'fandom'
 * @param {object} [options]
 * @returns {Promise<{success: boolean, imageUrl: string|null, notFound?: boolean, actualDate?: Date}>}
 */
export async function getAuthenticatedComic(date, preferredSource = 'uclick', options = {}) {
    const validateImage = options.validateImage || options.verifyImage;
    const FALLBACK_ORDER = {
        uclick: ['uclick', 'fandom', 'arcamax'],
        fandom: ['fandom', 'uclick', 'arcamax']
    };
    const order = FALLBACK_ORDER[preferredSource] || FALLBACK_ORDER.uclick;
    const maxSources = Number.isInteger(options.maxSources) && options.maxSources > 0
        ? options.maxSources
        : null;

    let sawNotFound = false;
    let sawOtherFailure = false;
    let nonBlockedAttempts = 0;

    for (const source of order) {
        if (maxSources && nonBlockedAttempts >= maxSources) break;
        options.signal?.throwIfAborted();

        try {
            const result = await _fetchComicFromSource(source, date, options);

            if (result.success) {
                if (validateImage) await validateImage(result.imageUrl);
                options.signal?.throwIfAborted();
                return result;
            }

            if (!result.blocked) nonBlockedAttempts += 1;
            if (result.notFound) sawNotFound = true;
            else sawOtherFailure = true;

            if (!options.silent) {
                if (result.blocked) {
                    console.warn(`${source}: proxy blocked by upstream protection, trying next source`);
                } else {
                    console.warn(`${source}: unavailable, no comic found`);
                }
            }
        } catch (err) {
            options.signal?.throwIfAborted();
            if (err?.status !== 403) nonBlockedAttempts += 1;
            sawOtherFailure = true;
            if (!options.silent) {
                console.warn(`${source} error:`, err.message);
            }
        }
    }

    // Only fall back to yesterday after checking all eligible sources for today's
    // strip, so a delayed or blocked primary source cannot hide an available comic.
    if (!options.disableTodayFallback && _isRequestedDateTodayInET(date)) {
        const yesterday = _getPreviousDayAtNoon(date);
        let yesterdayAttempts = 0;
        for (const source of order) {
            if (maxSources && yesterdayAttempts >= maxSources) break;
            options.signal?.throwIfAborted();
            if (source === 'arcamax') continue;

            try {
                const yesterdayResult = await _fetchComicFromSource(source, yesterday, options);
                if (yesterdayResult?.success) {
                    if (validateImage) await validateImage(yesterdayResult.imageUrl);
                    options.signal?.throwIfAborted();
                    return { ...yesterdayResult, actualDate: yesterday };
                }
                if (!yesterdayResult?.blocked) yesterdayAttempts += 1;
            } catch (err) {
                options.signal?.throwIfAborted();
                if (err?.status !== 403) yesterdayAttempts += 1;
                if (!options.silent) {
                    console.warn(`${source} error:`, err.message);
                }
            }
        }
    }

    return sawNotFound && !sawOtherFailure
        ? { success: false, imageUrl: null, notFound: true }
        : { success: false, imageUrl: null };
}
