import goComicsAuth from './auth.js';

// Function to parse comic from HTML
function parseComicFromHTML(html, proxyIndex) {
    const source = proxyIndex === 0 ? 'direct fetch' : `proxy ${proxyIndex}`;
    console.log(`Received ${html.length} characters from ${source}`);
    
    // Check if it's a Next.js error page
    if (html.includes('__next_error__')) {
        console.error(`${source} returned a Next.js error page (404)`);
        return null;
    }
    
    // Try to find Next.js page props data which might contain the image URL
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (nextDataMatch) {
        try {
            const jsonData = JSON.parse(nextDataMatch[1]);
            console.log('Found Next.js data, searching for image URL...');
            
            // Search through the JSON for image URLs (multiple patterns)
            const jsonStr = JSON.stringify(jsonData);
            
            // Try featureassets.gocomics.com first (new CDN)
            let imageUrlMatch = jsonStr.match(/https:\\\/\\\/featureassets\.gocomics\.com\\\/assets\\\/[a-f0-9]+[^"\\]*/);
            if (imageUrlMatch) {
                const imageUrl = imageUrlMatch[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                console.log(`Successfully found comic in Next.js data (featureassets):`, imageUrl);
                return { 
                    imageUrl: imageUrl, 
                    isPaywalled: false,
                    success: true 
                };
            }
            
            // Try assets.amuniversal.com (older CDN)
            imageUrlMatch = jsonStr.match(/https:\\\/\\\/assets\.amuniversal\.com\\\/[a-f0-9]+/);
            if (imageUrlMatch) {
                const imageUrl = imageUrlMatch[0].replace(/\\\//g, '/');
                console.log(`Successfully found comic in Next.js data (amuniversal):`, imageUrl);
                return { 
                    imageUrl: imageUrl, 
                    isPaywalled: false,
                    success: true 
                };
            }
        } catch (e) {
            console.log('Failed to parse Next.js data:', e.message);
        }
    }
    
    // Log a sample to see the structure
    if (html.length > 1000) {
        const imgSample = html.match(/<img[^>]{0,200}>/gi);
        if (imgSample && imgSample.length > 0) {
            console.log('Found img tags:', imgSample.slice(0, 5));
        } else {
            console.log('No img tags found with standard pattern');
        }
        
        // Try finding featureassets URLs (new CDN)
        const featureassetUrls = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+[^\s"']*/gi);
        if (featureassetUrls) {
            console.log('Found featureassets URLs:', featureassetUrls.slice(0, 3));
        }
        
        // Try finding amuniversal URLs (old CDN)
        const amuniversalUrls = html.match(/https:\/\/[^\s"']*amuniversal\.com[^\s"']*/gi);
        if (amuniversalUrls) {
            console.log('Found amuniversal URLs:', amuniversalUrls.slice(0, 3));
        }
        
        if (!featureassetUrls && !amuniversalUrls) {
            console.log('No comic CDN URLs found');
        }
    }
    
    // Check for paywall indicators - be more specific
    const hasPaywallButton = html.includes('gc-link-button') || html.includes('gc-card__link');
    const hasSubscribeText = html.includes('Subscribe to read the full') || html.includes('Subscription Required');
    const hasSignUpWall = html.includes('Create a free account') && html.includes('to view this comic');
    const isPaywalled = hasPaywallButton || hasSubscribeText || hasSignUpWall;
    
    console.log('Paywall detected:', isPaywalled);
    
    // Look for featureassets.gocomics.com pattern (NEW CDN - most common now)
    const featureAssetMatch = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+(?:\?[^"'\s]*)?/);
    if (featureAssetMatch) {
        console.log(`Successfully found comic (featureassets):`, featureAssetMatch[0]);
        return { 
            imageUrl: featureAssetMatch[0], 
            isPaywalled: false,
            success: true 
        };
    };
    
    // Look for assets.amuniversal.com pattern (older CDN)
    const assetMatch = html.match(/https:\/\/assets\.amuniversal\.com\/[a-f0-9]+/);
    if (assetMatch) {
        console.log(`Successfully found comic (assets.amuniversal):`, assetMatch[0]);
        return { 
            imageUrl: assetMatch[0], 
            isPaywalled: false,
            success: true 
        };
    }

    // Try to find any amuniversal.com image
    const amuniversalMatch = html.match(/https:\/\/[^"'\s]*amuniversal\.com[^"'\s]*/);
    if (amuniversalMatch) {
        console.log(`Successfully found comic (any amuniversal):`, amuniversalMatch[0]);
        return { 
            imageUrl: amuniversalMatch[0], 
            isPaywalled: false,
            success: true 
        };
    }

    // Fallback to picture tag if asset URL not found
    const pictureMatch = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
    if (pictureMatch && pictureMatch[1]) {
        console.log(`Successfully found comic (picture tag):`, pictureMatch[1]);
        return { 
            imageUrl: pictureMatch[1], 
            isPaywalled: false,
            success: true 
        };
    }
    
    // Also try to find img with data-image attribute
    const dataImageMatch = html.match(/data-image="([^"]*)"/i);
    if (dataImageMatch && dataImageMatch[1]) {
        console.log(`Successfully found comic (data-image):`, dataImageMatch[1]);
        return { 
            imageUrl: dataImageMatch[1], 
            isPaywalled: false,
            success: true 
        };
    }
    
    // If no comic found but paywall detected, return paywall status
    if (isPaywalled) {
        console.log(`Paywall detected`);
        return {
            imageUrl: null,
            isPaywalled: true,
            success: false,
            message: 'This comic requires a GoComics membership'
        };
    }
    
    return null;
}

// List of CORS proxies to try in order
const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url='
];

export async function extractGoComicsImage(date, credentials = null) {
    const formattedDate = date.toISOString().split('T')[0];
    
    // Try multiple URL formats - GoComics might have changed their URL structure
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    const urlFormats = [
        `https://www.gocomics.com/garfield/${year}/${month}/${day}`,  // NEW FORMAT: /garfield/2025/11/06
        `https://www.gocomics.com/garfield/${formattedDate}`,  // OLD FORMAT: /garfield/2025-11-06 (fallback)
        `https://www.gocomics.com/garfield`  // Today's comic (no date)
    ];
    
    // Try direct fetch first with different URL formats
    for (const originalUrl of urlFormats) {
        try {
            console.log(`Attempting direct fetch: ${originalUrl}`);
            const response = await fetch(originalUrl, { mode: 'cors' });
            if (response.ok) {
                const html = await response.text();
                const result = parseComicFromHTML(html, 0);
                if (result) {
                    console.log(`Success with URL format: ${originalUrl}`);
                    return result;
                }
            }
        } catch (error) {
            console.log(`Direct fetch failed for ${originalUrl}:`, error.message);
        }
    }
    
    // Use the first URL format for proxy attempts
    const originalUrl = urlFormats[0];
    
    // Try each proxy in sequence
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxy = CORS_PROXIES[i];
            const proxyUrl = proxy + encodeURIComponent(originalUrl);
            
            console.log(`Attempting to fetch from proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy}`);
            
            // Prepare fetch options with better headers to avoid bot detection
            const fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://www.gocomics.com/',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
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
            const result = parseComicFromHTML(html, i + 1);
            if (result) return result;
            
            // If this proxy didn't find anything, try the next one
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
