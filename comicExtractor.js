/**
 * CORS proxy configuration and performance tracking
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

/**
 * Fetches a Garfield comic from ArcaMax.
 *
 * Accepts either an article ID (string like "s-4047745") or the sentinel value
 * "latest" to load today's strip from the landing page.
 *
 * @param {string} articleIdOrLatest  - article ID "s-XXXXXXX" or "latest"
 * @returns {Promise<{success: boolean, imageUrl: string|null,
 *                    articleId: string|null, prevArticleId: string|null,
 *                    nextArticleId: string|null, stripDate: Date|null}>}
 */
export async function getAuthenticatedComic(articleIdOrLatest = 'latest') {
    const isLatest = articleIdOrLatest === 'latest';
    const url = isLatest
        ? 'https://www.arcamax.com/thefunnies/garfield/'
        : `https://www.arcamax.com/thefunnies/garfield/${articleIdOrLatest}`;

    try {
        const html = await fetchWithProxyFallback(url);

        if (html.includes('404: Page Not Found') || html.includes('Page Not Found')) {
            return { success: false, imageUrl: null, articleId: null, prevArticleId: null, nextArticleId: null, stripDate: null };
        }

        const imageUrl = extractImageFromHTML(html);
        if (!imageUrl) {
            console.warn(`No image extracted from ArcaMax (HTML length: ${html.length})`);
            return { success: false, imageUrl: null, articleId: null, prevArticleId: null, nextArticleId: null, stripDate: null };
        }

        const articleId = extractArticleId(html, isLatest ? null : articleIdOrLatest);
        const { prevArticleId, nextArticleId } = extractNavIds(html);
        const stripDate = extractStripDate(html);

        return { success: true, imageUrl, articleId, prevArticleId, nextArticleId, stripDate };
    } catch (error) {
        console.error('Comic fetch failed:', error);
        return { success: false, imageUrl: null, articleId: null, prevArticleId: null, nextArticleId: null, stripDate: null };
    }
}

/**
 * Extracts the Garfield comic image URL from ArcaMax HTML.
 * @param {string} html
 * @returns {string|null}
 */
function extractImageFromHTML(html) {
    // Primary: direct resources.arcamax.com/newspics URL in any attribute or text
    let match = html.match(/https:\/\/resources\.arcamax\.com\/newspics\/[^"'\s<>]+/);
    if (match) return match[0];

    // Fallback: og:image meta tag
    match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (match && match[1] && match[1].includes('arcamax')) return match[1];

    return null;
}

/**
 * Extracts the canonical article ID from the page HTML.
 * On the landing page this comes from the first share link; on an article page
 * it is derived from the URL or the share link.
 * @param {string} html
 * @param {string|null} knownId - ID already known from the URL (article pages)
 * @returns {string|null}
 */
function extractArticleId(html, knownId) {
    if (knownId) return knownId;
    // Share links: /thefunnies/garfield/s-XXXXXXX
    const match = html.match(/\/thefunnies\/garfield\/(s-\d+)/);
    return match ? match[1] : null;
}

/**
 * Extracts prev and next article IDs from navigation links in the ArcaMax page.
 * The nav row looks like:
 *   <a href="/thefunnies/garfield/s-4046234">   March 26   <a href="/thefunnies/garfield/s-4047745">
 * @param {string} html
 * @returns {{ prevArticleId: string|null, nextArticleId: string|null }}
 */
function extractNavIds(html) {
    // Find the date navigation row that has exactly two garfield article links
    // Pattern: [prev-link] MonthName Day [next-link]
    const navMatch = html.match(
        /href="\/thefunnies\/garfield\/(s-\d+)"[^<]*<\/a>\s*[A-Za-z]+\s+\d+\s*<a[^>]*href="\/thefunnies\/garfield\/(s-\d+)"/
    );
    if (navMatch) {
        return { prevArticleId: navMatch[1], nextArticleId: navMatch[2] };
    }

    // Fallback: collect all garfield article ID links and infer position
    const ids = [...html.matchAll(/href="\/thefunnies\/garfield\/(s-\d+)"/g)].map(m => m[1]);
    const unique = [...new Set(ids)];
    if (unique.length >= 2) {
        // First occurrence is typically the prev link, last is next
        return { prevArticleId: unique[0], nextArticleId: unique[unique.length - 1] };
    }
    return { prevArticleId: null, nextArticleId: null };
}

/**
 * Parses the strip's publication date from the ArcaMax page.
 * The nav row typically contains a text like "March 27" next to the nav links.
 * @param {string} html
 * @returns {Date|null}
 */
function extractStripDate(html) {
    // og:title: "Garfield for 3/27/2026"
    let match = html.match(/Garfield\s+for\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (match) {
        const d = new Date(match[1]);
        if (!isNaN(d)) return d;
    }
    // share link title attribute: h=Garfield+for+3%2F27%2F2026
    match = html.match(/h=Garfield\+for\+([^"&]+)/);
    if (match) {
        const d = new Date(decodeURIComponent(match[1].replace(/\+/g, ' ')));
        if (!isNaN(d)) return d;
    }
    return null;
}

