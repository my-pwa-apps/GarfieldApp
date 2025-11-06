import goComicsAuth from './auth.js';

// List of CORS proxies to try in order
const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
];

export async function extractGoComicsImage(date, credentials = null) {
    const formattedDate = date.toISOString().split('T')[0];
    const originalUrl = `https://www.gocomics.com/garfield/${formattedDate}`;
    
    // Try each proxy in sequence
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxy = CORS_PROXIES[i];
            const proxyUrl = proxy + encodeURIComponent(originalUrl);
            
            console.log(`Attempting to fetch from proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy}`);
            
            // Prepare fetch options
            const fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };

            // If credentials are provided, add them
            if (credentials && credentials.email && credentials.password) {
                fetchOptions.headers['X-GoComics-Email'] = credentials.email;
                fetchOptions.headers['X-GoComics-Password'] = credentials.password;
            }

            const response = await fetch(proxyUrl, fetchOptions);
            
            if (!response.ok) {
                console.warn(`Proxy ${i + 1} returned status ${response.status}, trying next...`);
                continue;
            }
            
            const html = await response.text();
            
            // Debug: log a snippet of the HTML to see what we're getting
            console.log(`Received ${html.length} characters from proxy ${i + 1}`);
            console.log('HTML snippet:', html.substring(0, 500));
            
            // Check for paywall indicators - be more specific
            const hasPaywallButton = html.includes('gc-link-button') || html.includes('gc-card__link');
            const hasSubscribeText = html.includes('Subscribe to read the full') || html.includes('Subscription Required');
            const hasSignUpWall = html.includes('Create a free account') && html.includes('to view this comic');
            const isPaywalled = hasPaywallButton || hasSubscribeText || hasSignUpWall;
            
            console.log('Paywall detected:', isPaywalled);
            
            // Look for the specific asset URL pattern
            const assetMatch = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]{32}/);
            if (assetMatch) {
                console.log(`Successfully found comic from proxy ${i + 1}:`, assetMatch[0]);
                return { 
                    imageUrl: assetMatch[0], 
                    isPaywalled: false,
                    success: true 
                };
            }

            // Fallback to picture tag if asset URL not found
            const pictureMatch = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
            if (pictureMatch && pictureMatch[1]) {
                console.log(`Successfully found comic from proxy ${i + 1} (picture tag):`, pictureMatch[1]);
                return { 
                    imageUrl: pictureMatch[1], 
                    isPaywalled: false,
                    success: true 
                };
            }
            
            // Also try to find img with class containing 'comic'
            const comicImgMatch = html.match(/<img[^>]*class="[^"]*comic[^"]*"[^>]*src="([^"]*)"[^>]*>/i) || 
                                 html.match(/<img[^>]*src="([^"]*)"[^>]*class="[^"]*comic[^"]*"[^>]*>/i);
            if (comicImgMatch && comicImgMatch[1]) {
                console.log(`Successfully found comic from proxy ${i + 1} (via comic class):`, comicImgMatch[1]);
                return { 
                    imageUrl: comicImgMatch[1], 
                    isPaywalled: false,
                    success: true 
                };
            }
            
            // If no comic found and paywall detected, return paywall status
            if (isPaywalled) {
                console.log(`Paywall detected from proxy ${i + 1}`);
                return {
                    imageUrl: null,
                    isPaywalled: true,
                    success: false,
                    message: 'This comic requires a GoComics membership'
                };
            }
            
            // If this proxy didn't work, try the next one
            console.warn(`Proxy ${i + 1} didn't find comic, trying next...`);
            
        } catch (error) {
            console.error(`Error with proxy ${i + 1}:`, error);
            // Continue to next proxy
        }
    }
    
    // All proxies failed
    console.error('All proxies failed to extract comic');
    return {
        imageUrl: null,
        isPaywalled: false,
        success: false,
        error: 'Failed to fetch comic from all available proxies'
    };
}

// Try to extract comic with authentication if available
export async function getAuthenticatedComic(date) {
    const credentials = goComicsAuth.getCredentials();
    return await extractGoComicsImage(date, credentials);
}
