export async function extractGoComicsImage(date) {
    try {
        const formattedDate = date.toISOString().split('T')[0];
        const url = `https://www.gocomics.com/garfield/${formattedDate}`;
        
        const response = await fetch(url);
        const html = await response.text();
        
        // Look for the specific asset URL pattern
        const assetMatch = html.match(/https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]{32}/);
        if (assetMatch) {
            return assetMatch[0];
        }

        // Fallback to picture tag if asset URL not found
        const pictureMatch = html.match(/<picture[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/picture>/i);
        if (pictureMatch && pictureMatch[1]) {
            return pictureMatch[1];
        }
        
        throw new Error('Comic image not found');
    } catch (error) {
        console.error('Error extracting comic:', error);
        return null;
    }
}
