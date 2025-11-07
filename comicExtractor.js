// List of CORS proxies to try in order
const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url='
];

export async function getAuthenticatedComic(date, language = 'en') {
    const formattedDate = date.toISOString().split('T')[0];
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Choose comic path based on language
    const comicPath = language === 'es' ? 'garfieldespanol' : 'garfield';
    
    const urlFormats = [
        `https://www.gocomics.com/${comicPath}/${year}/${month}/${day}`,
        `https://www.gocomics.com/${comicPath}/${formattedDate}`,
        `https://www.gocomics.com/${comicPath}`
    ];
    
    // Try direct fetch first
    for (const url of urlFormats) {
        try {
            console.log(`Attempting direct fetch: ${url}`);
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
                const html = await response.text();
                const imageUrl = extractImageFromHTML(html);
                if (imageUrl) {
                    console.log(`Success with URL format: ${url}`);
                    return { success: true, imageUrl };
                }
            }
        } catch (error) {
            console.log(`Direct fetch failed for ${url}:`, error.message);
        }
    }
    
    // Try proxies
    const originalUrl = urlFormats[0];
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxy = CORS_PROXIES[i];
            const proxyUrl = proxy + encodeURIComponent(originalUrl);
            
            console.log(`Attempting proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy}`);
            
            const response = await fetch(proxyUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html',
                }
            });
            
            if (!response.ok) {
                console.warn(`Proxy ${i + 1} returned status ${response.status}`);
                continue;
            }
            
            const html = await response.text();
            const imageUrl = extractImageFromHTML(html);
            if (imageUrl) {
                console.log(`Success with proxy ${i + 1}`);
                return { success: true, imageUrl };
            }
        } catch (error) {
            console.error(`Error with proxy ${i + 1}:`, error);
        }
    }
    
    return { success: false, imageUrl: null };
}

function extractImageFromHTML(html) {
    // Try featureassets.gocomics.com first (new CDN)
    let match = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]{32}/);
    if (match) return match[0];
    
    // Try assets.amuniversal.com (older CDN)
    match = html.match(/https:\/\/assets\.amuniversal\.com\/[a-f0-9]+/);
    if (match) return match[0];
    
    // Fallback to picture tag
    match = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
    if (match && match[1]) return match[1];
    
    return null;
}

// Legacy export for backward compatibility
export async function extractGoComicsImage(date) {
    const result = await getAuthenticatedComic(date, 'en');
    return result.imageUrl;
}
