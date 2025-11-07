export async function getAuthenticatedComic(date, language = 'en') {
    try {
        const formattedDate = date.toISOString().split('T')[0];
        const comicPath = language === 'es' ? 'garfield-spanish' : 'garfield';
        const url = `https://www.gocomics.com/${comicPath}/${formattedDate}`;
        
        const response = await fetch(url);
        const html = await response.text();
        
        // Look for the specific asset URL pattern
        const assetMatch = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]{32}/);
        if (assetMatch) {
            return { success: true, imageUrl: assetMatch[0] };
        }

        // Fallback to picture tag if asset URL not found
        const pictureMatch = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
        if (pictureMatch && pictureMatch[1]) {
            return { success: true, imageUrl: pictureMatch[1] };
        }
        
        return { success: false, imageUrl: null };
    } catch (error) {
        console.error('Error extracting comic:', error);
        return { success: false, imageUrl: null };
    }
}

// Legacy export for backward compatibility
export async function extractGoComicsImage(date) {
    const result = await getAuthenticatedComic(date, 'en');
    return result.imageUrl;
}
