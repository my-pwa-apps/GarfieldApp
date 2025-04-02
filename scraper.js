async function getGarfieldComic(date = null) {
    const baseUrl = 'https://www.arcamax.com/thefunnies/garfield/';
    
    try {
        // If no date specified, fetch the current page
        const response = await fetch(baseUrl);
        const html = await response.text();
        
        // Parse the HTML using DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Get the comic image
        const comicImage = doc.querySelector('.comics-zoom');
        const imageUrl = comicImage ? comicImage.src : null;
        
        // Get the date from the title
        const title = doc.querySelector('title').textContent;
        const dateMatch = title.match(/Garfield for (\d{1,2}\/\d{1,2}\/\d{4})/);
        const comicDate = dateMatch ? dateMatch[1] : null;
        
        return {
            imageUrl,
            date: comicDate,
            success: !!imageUrl
        };
    } catch (error) {
        console.error('Error fetching Garfield comic:', error);
        return {
            imageUrl: null,
            date: null,
            success: false,
            error: error.message
        };
    }
}

async function getArchiveLinks() {
    const baseUrl = 'https://www.arcamax.com/thefunnies/garfield/';
    
    try {
        const response = await fetch(baseUrl);
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Find archive links
        const archiveLinks = Array.from(doc.querySelectorAll('a'))
            .filter(a => a.href.includes('/thefunnies/garfield/s-'))
            .map(a => ({
                url: a.href,
                date: a.title.match(/Garfield for (\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]
            }))
            .filter(link => link.date);
            
        return archiveLinks;
    } catch (error) {
        console.error('Error fetching archive links:', error);
        return [];
    }
}
