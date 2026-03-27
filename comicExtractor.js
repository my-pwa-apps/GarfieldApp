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
 * Fetches daily Garfield comic from ArcaMax.
 * Tries a date-based URL first; falls back to the landing page for today's date.
 * @param {Date} date - Date of the comic
 * @returns {Promise<{success: boolean, imageUrl: string|null, notFound?: boolean}>}
 */
export async function getAuthenticatedComic(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const dateUrl = `https://www.arcamax.com/thefunnies/garfield/${year}/${month}/${day}`;

    // Determine if this is today in Eastern Time (ArcaMax always has today on the landing page)
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const isToday = year === etNow.getFullYear() &&
                    parseInt(month, 10) === (etNow.getMonth() + 1) &&
                    parseInt(day, 10) === etNow.getDate();

    try {
        const html = await fetchWithProxyFallback(dateUrl);

        if (html.includes('404: Page Not Found') || html.includes('Page Not Found')) {
            if (isToday) return fetchCurrentStrip();
            return { success: false, imageUrl: null, notFound: true };
        }

        const imageUrl = extractImageFromHTML(html);
        if (imageUrl) return { success: true, imageUrl };

        // Date URL returned a page but no recognisable image — try landing page for today
        if (isToday) return fetchCurrentStrip();

        console.warn(`No image extracted from ArcaMax (HTML length: ${html.length})`);
        return { success: false, imageUrl: null };
    } catch (error) {
        console.error('Comic fetch failed:', error);
        if (isToday) {
            try { return await fetchCurrentStrip(); } catch { /* ignore */ }
        }
        return { success: false, imageUrl: null };
    }
}

/**
 * Fetches today's strip from the ArcaMax Garfield landing page.
 * @returns {Promise<{success: boolean, imageUrl: string|null}>}
 */
async function fetchCurrentStrip() {
    try {
        const html = await fetchWithProxyFallback('https://www.arcamax.com/thefunnies/garfield/');
        const imageUrl = extractImageFromHTML(html);
        if (imageUrl) return { success: true, imageUrl };
        return { success: false, imageUrl: null };
    } catch {
        return { success: false, imageUrl: null };
    }
}

/**
 * Extracts the Garfield comic image URL from ArcaMax HTML.
 * @param {string} html - HTML content from ArcaMax
 * @returns {string|null} Comic image URL or null
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

