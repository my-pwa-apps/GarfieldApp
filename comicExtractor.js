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
    const proxyName = proxyUrl.split('/')[2];
    
    try {
        const fullUrl = `${proxyUrl}${encodeURIComponent(url)}`;
        const response = await fetch(fullUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            console.warn(`✗ Proxy ${proxyIndex} (${proxyName}) HTTP ${response.status}`);
            updateProxyStats(proxyIndex, false, 0);
            throw new Error(`HTTP ${response.status}`);
        }
        
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

/**
 * Fetches authenticated comic from GoComics
 * @param {Date} date - Date of the comic
 * @param {string} language - Language code ('en' or 'es')
 * @returns {Promise<{success: boolean, imageUrl: string|null, isPaywalled?: boolean, notFound?: boolean}>}
 */
export async function getAuthenticatedComic(date, language = 'en') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const comicPath = language === 'es' ? 'garfieldespanol' : 'garfield';
    const url = `https://www.gocomics.com/${comicPath}/${year}/${month}/${day}`;
    
    try {
        console.log(`Fetching comic: ${url}`);
        
        // Try direct fetch first
        try {
            const directResponse = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                mode: 'cors',
                credentials: 'omit',
                cache: 'default'
            });
            
            if (directResponse.ok) {
                const html = await directResponse.text();
                const imageUrl = extractImageFromHTML(html);
                
                if (imageUrl) {
                    console.log(`✓ Direct fetch succeeded`);
                    return { success: true, imageUrl };
                }
            }
        } catch (directError) {
            console.log(`Direct fetch failed, trying proxies...`);
        }
        
        // Fallback to proxy
        const html = await fetchWithProxyFallback(url);
        
        // Validate response is actually GoComics HTML
        if (html.includes('_next/static') || html.includes('__next')) {
            console.error(`Proxy returned wrong content`);
            return { success: false, imageUrl: null, proxyError: true };
        }
        
        // Check for 404
        if (html.includes('<title>404') || html.includes('Page Not Found') || html.includes('does not exist')) {
            console.warn(`Comic not found: ${url}`);
            return { success: false, imageUrl: null, notFound: true };
        }
        
        const imageUrl = extractImageFromHTML(html);
        
        if (imageUrl) {
            console.log(`✓ Proxy fetch succeeded`);
            return { success: true, imageUrl };
        }
        
        console.warn(`No image extracted (HTML length: ${html.length})`);
        return { success: false, imageUrl: null };
    } catch (error) {
        console.error('Comic fetch failed:', error);
        return { success: false, imageUrl: null };
    }
}

/**
 * Extracts comic image URL from GoComics HTML
 * @param {string} html - HTML content from GoComics
 * @returns {string|null} Comic image URL or null
 */
function extractImageFromHTML(html) {
    // Try featureassets CDN (current)
    let match = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+/);
    if (match) {
        console.log(`✓ Extracted from featureassets CDN`);
        return match[0];
    }
    
    // Try amuniversal CDN (legacy)
    match = html.match(/https:\/\/assets\.amuniversal\.com\/[a-f0-9]+/);
    if (match) {
        console.log(`✓ Extracted from amuniversal CDN`);
        return match[0];
    }
    
    // Try og:image meta tag
    match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (match && match[1] && (match[1].includes('gocomics') || match[1].includes('amuniversal'))) {
        console.log(`✓ Extracted from og:image`);
        return match[1];
    }
    
    // Fallback to picture tag
    match = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
    if (match && match[1]) {
        console.log(`✓ Extracted from picture tag`);
        return match[1];
    }
    
    console.warn(`✗ No comic image found`);
    return null;
}

// Legacy export for backward compatibility
export async function extractGoComicsImage(date) {
    const result = await getAuthenticatedComic(date, 'en');
    return result.imageUrl;
}
