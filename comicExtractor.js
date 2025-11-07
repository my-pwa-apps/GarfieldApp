// List of CORS proxies to try in order
const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url='
];

// Track proxy performance
let workingProxyIndex = 0;
let proxyFailureCount = [0, 0, 0];
let proxyResponseTimes = [0, 0, 0];

/**
 * Gets the best performing proxy based on success rate and response time
 * @returns {number} Index of the best proxy
 */
function getBestProxyIndex() {
    let bestIndex = workingProxyIndex;
    let bestScore = -Infinity;
    
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        // Heavily penalize failures, reward fast response times
        const failurePenalty = proxyFailureCount[i] * 2000;
        const avgTime = proxyResponseTimes[i] || 1500; // Default to 1.5s if unknown
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
    const proxyName = proxyUrl.split('/')[2];
    
    try {
        const fullUrl = `${proxyUrl}${encodeURIComponent(url)}`;
        const response = await fetch(fullUrl, {
            signal: AbortSignal.timeout(15000),
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            console.warn(`✗ Proxy ${proxyIndex} (${proxyName}) HTTP ${response.status}`);
            updateProxyStats(proxyIndex, false, 0);
            throw new Error(`HTTP ${response.status}`);
        }
        
        // Success
        const responseTime = Date.now() - startTime;
        console.log(`✓ Proxy ${proxyIndex} (${proxyName}) succeeded in ${responseTime}ms`);
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
        // Try best proxy first
        return await tryProxy(url, bestProxy, startTime);
    } catch (firstError) {
        console.log('Best proxy failed, trying others in parallel...');
        
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

export async function getAuthenticatedComic(date, language = 'en') {
    const formattedDate = date.toISOString().split('T')[0];
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Choose comic path based on language
    const comicPath = language === 'es' ? 'garfieldespanol' : 'garfield';
    const url = `https://www.gocomics.com/${comicPath}/${year}/${month}/${day}`;
    
    try {
        console.log(`Fetching comic: ${url}`);
        const html = await fetchWithProxyFallback(url);
        
        // Debug: Check if we got the proxy's own page instead of GoComics
        if (html.includes('_next/static') || html.includes('__next')) {
            console.error(`Proxy returned its own page instead of GoComics HTML`);
            return { success: false, imageUrl: null, proxyError: true };
        }
        
        // Check if we got a 404 page by looking for specific error indicators
        const is404 = html.includes('<title>404') || 
                      html.includes('Page Not Found') || 
                      html.includes('does not exist');
        
        if (is404) {
            console.warn(`Comic page not found: ${url}`);
            return { success: false, imageUrl: null, notFound: true };
        }
        
        const imageUrl = extractImageFromHTML(html);
        
        if (imageUrl) {
            console.log(`Success! Comic URL: ${imageUrl}`);
            return { success: true, imageUrl };
        }
        
        console.warn(`No image found in HTML for: ${url} (HTML length: ${html.length})`);
        // Log first 500 chars to help debug
        console.log(`HTML preview: ${html.substring(0, 500)}`);
        return { success: false, imageUrl: null };
    } catch (error) {
        console.error('Failed to fetch comic:', error);
        return { success: false, imageUrl: null };
    }
}

function extractImageFromHTML(html) {
    // Try featureassets.gocomics.com first (new CDN) - flexible length hash
    let match = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+/);
    if (match) {
        console.log(`✓ Extracted from featureassets CDN`);
        return match[0];
    }
    
    // Try assets.amuniversal.com (older CDN)
    match = html.match(/https:\/\/assets\.amuniversal\.com\/[a-f0-9]+/);
    if (match) {
        console.log(`✓ Extracted from amuniversal CDN`);
        return match[0];
    }
    
    // Try meta property og:image
    match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (match && match[1] && (match[1].includes('gocomics') || match[1].includes('amuniversal'))) {
        console.log(`✓ Extracted from og:image meta tag`);
        return match[1];
    }
    
    // Fallback to picture tag
    match = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
    if (match && match[1]) {
        console.log(`✓ Extracted from picture tag`);
        return match[1];
    }
    
    console.warn(`✗ No comic image found in HTML (length: ${html.length} chars)`);
    return null;
}

// Legacy export for backward compatibility
export async function extractGoComicsImage(date) {
    const result = await getAuthenticatedComic(date, 'en');
    return result.imageUrl;
}
