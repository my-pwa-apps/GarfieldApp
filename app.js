//garfieldapp.pages.dev

// Global variables for app functionality
let translationEnabled = localStorage.getItem('translation') === 'true';
let userLanguage = navigator.language || navigator.userLanguage || 'en';
let translationInProgress = false;
let previousclicked = false;
let previousUrl = "";
let currentselectedDate;
let day, month, year;
let pictureUrl;
let formattedComicDate;
let formattedDate;
let isRotatedMode = false; // Track if we're in rotated mode

if("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./serviceworker.js");
}

async function Share() 
{
    if(!window.pictureUrl) {
        console.warn("No comic URL found in window.pictureUrl, checking previousUrl");
        // Use previousUrl as fallback
        window.pictureUrl = previousUrl;
        
        // If still no URL, show error
        if(!window.pictureUrl) {
            console.error("No comic URL available to share");
            alert("No comic to share. Please try loading a comic first.");
            return;
        }
    }
    
    if(navigator.share) {
        try {
            console.log("Starting share process...");
            
            // Create a new image element with crossOrigin set to anonymous 
            // to avoid tainted canvas issues
            const tempImg = new Image();
            tempImg.crossOrigin = "anonymous";
            
            // Create a URL with CORS proxy to load the image
            const cacheBuster = Date.now();
            const imgUrl = `https://corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(window.pictureUrl)}`;
            console.log("Loading image for sharing via:", imgUrl);
            
            // Wait for image to load
            await new Promise((resolve, reject) => {
                tempImg.onload = resolve;
                tempImg.onerror = () => reject(new Error("Failed to load image for sharing"));
                tempImg.src = imgUrl;
                
                // Set a timeout in case the image load hangs
                setTimeout(() => reject(new Error("Image load timeout")), 5000);
            });
            
            console.log("Image loaded successfully, converting to canvas...");
            
            // Create canvas and draw image
            const canvas = document.createElement('canvas');
            canvas.width = tempImg.width;
            canvas.height = tempImg.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tempImg, 0, 0);
            
            // Convert to blob
            const jpgBlob = await new Promise((resolve, reject) => {
                try {
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error("Failed to create blob from canvas"));
                    }, 'image/jpeg', 0.95);
                } catch (error) {
                    reject(error);
                }
            });
            
            console.log("Canvas converted to blob successfully");
            
            // Create file for sharing
            const file = new File([jpgBlob], "garfield.jpg", { 
                type: "image/jpeg", 
                lastModified: Date.now() 
            });
            
            // Share the file
            console.log("Attempting to share file...");
            await navigator.share({
                url: 'https://garfieldapp.pages.dev',
                text: 'Shared from GarfieldApp',
                files: [file]
            });
            
            console.log("Comic shared successfully!");
        } catch (error) {
            console.error("Error sharing comic:", error);
            
            // Check if this is a CORS-related error
            if (error.name === 'SecurityError') {
                // Try fallback sharing without the image
                try {
                    console.log("Trying fallback sharing without image...");
                    await navigator.share({
                        url: 'https://garfieldapp.pages.dev',
                        text: `Shared from GarfieldApp - Garfield comic for ${formattedComicDate}`
                    });
                    console.log("Fallback sharing successful!");
                    return;
                } catch (fallbackError) {
                    console.error("Fallback sharing failed:", fallbackError);
                }
            }
            
            // Don't show alert if sharing was canceled by user
            if (error.name !== 'AbortError') {
                alert("Failed to share the comic. Please try again.");
            }
        }
    } else {
        alert("Sharing is not supported on this device.");
    }
}

function Addfav()
{
    formattedComicDate = year + "/" + month + "/" + day;
    var favs = JSON.parse(localStorage.getItem('favs'));
    if(favs == null)
    {
        favs = [];
    }
    if(favs.indexOf(formattedComicDate) == -1)
    {
        favs.push(formattedComicDate);
        document.getElementById("favheart").src="./heart.svg";
        document.getElementById("showfavs").disabled = false;
    }
    else
    {
        favs.splice(favs.indexOf(formattedComicDate), 1);
        document.getElementById("favheart").src="./heartborder.svg";
        if(favs.length === 0)
        {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
            document.getElementById("Today").innerHTML = 'Today';
        }
    }
    favs.sort();
    localStorage.setItem('favs', JSON.stringify(favs));
    CompareDates();
    showComic();
}

function changeComicImage(newSrc) {
    const comic = document.getElementById('comic');
    comic.classList.add('dissolve');
    setTimeout(() => {
        comic.src = newSrc;
        comic.classList.remove('dissolve');
    }, 500); // Match the duration of the CSS transition
}

function HideSettings() {
    var x = document.getElementById("settingsDIV");
    if (x.style.display === "none" || x.style.display === "") {
        x.style.display = "block";
        localStorage.setItem('settings', "true");
    } else {
        x.style.display = "none";
        localStorage.setItem('settings', "false");
    }
    // Remove the fixed height that was causing scrolling
    document.body.style.minHeight = "";
}

// Update the date display function to use regional date settings
function updateDateDisplay() {
    const dateInput = document.getElementById('DatePicker');
    const wrapper = document.querySelector('.date-center-wrapper');
    
    if (dateInput && wrapper) {
        // Parse the date value from the input
        const dateValue = dateInput.value; // Format: YYYY-MM-DD
        if (dateValue) {
            const dateParts = dateValue.split('-');
            if (dateParts.length === 3) {
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1; // JS months are 0-based
                const day = parseInt(dateParts[2]);
                
                // Create a date object
                const date = new Date(year, month, day);
                
                // Format the date according to user's locale
                const localizedDate = date.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric'
                });
                
                // Set the localized date as the display value
                wrapper.setAttribute('data-display-date', localizedDate);
            } else {
                // Fallback if date format is unexpected
                wrapper.setAttribute('data-display-date', dateValue);
            }
        } else {
            wrapper.setAttribute('data-display-date', '');
        }
    }
}

function formatDate(datetoFormat) {
    day = datetoFormat.getDate();
    month = datetoFormat.getMonth() + 1;
    year = datetoFormat.getFullYear();
    month = ("0" + month).slice(-2);
    day = ("0" + day).slice(-2);
}

function CompareDates() {
    var favs = JSON.parse(localStorage.getItem('favs'));
    if(document.getElementById("showfavs").checked)
    {
        document.getElementById("DatePicker").disabled = true;
        startDate = new Date(favs[0]);
    }
    else{    
        document.getElementById("DatePicker").disabled = false;
        startDate = new Date("1978/06/19");
    }
    startDate = startDate.setHours(0, 0, 0, 0);
    currentselectedDate = currentselectedDate.setHours(0, 0, 0, 0);
    startDate = new Date(startDate);
    currentselectedDate = new Date(currentselectedDate);
    if(currentselectedDate.getTime() <= startDate.getTime()) {
        document.getElementById("Previous").disabled = true;
        document.getElementById("First").disabled = true;
        formatDate(startDate);
        startDate = year + '-' + month + '-' + day;
        currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
    } else {
        document.getElementById("Previous").disabled = false;
        document.getElementById("First").disabled = false;
    }
    if(document.getElementById("showfavs").checked) {
        endDate = new Date(favs[favs.length - 1]);
    }
    else{ 
        endDate = new Date();
    }
    endDate = endDate.setHours(0, 0, 0, 0);
    endDate = new Date(endDate);
    if(currentselectedDate.getTime() >= endDate.getTime()) {
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
        formatDate(endDate);
        endDate = year + '-' + month + '-' + day;
        currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
    } else {
        document.getElementById("Next").disabled = false;
        document.getElementById("Today").disabled = false;
    }
    if(document.getElementById("showfavs").checked) {
        if(favs.length == 1) {
            document.getElementById("Random").disabled = true;
            document.getElementById("Previous").disabled = true;
            document.getElementById("First").disabled = true;
        }
    }
    else {
        document.getElementById("Random").disabled = false;
    }
}

function onLoad() {
    var favs = JSON.parse(localStorage.getItem('favs')) || [];

    // Set minimum body height at load time to prevent gradient shift
    document.body.style.minHeight = "100vh";

    // Set proper body overflow to prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // Initialize the URL pattern cache
    initUrlPatternCache();

    // Prevent clearing the date picker
    const datePicker = document.getElementById("DatePicker");
    datePicker.setAttribute("required", "required");
    
    // Add event listener to prevent emptying the date
    datePicker.addEventListener('change', function(e) {
        if (!this.value) {
            // If cleared, reset to current date
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            this.value = `${yyyy}-${mm}-${dd}`;
        }
    });

    if (document.getElementById("showfavs").checked) {
        currentselectedDate = favs.length ? new Date(favs[0]) : new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
    } else {
        currentselectedDate = new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
    }
    formatDate(new Date());
    today = `${year}-${month}-${day}`;
    document.getElementById("DatePicker").setAttribute("max", today);

    if (document.getElementById("lastdate").checked && localStorage.getItem('lastcomic')) {
        currentselectedDate = new Date(localStorage.getItem('lastcomic'));
    }
    CompareDates();
    showComic();
    updateDateDisplay(); // Add this line to update the display
}

// Call this function when the date changes
function DateChange() {
    currentselectedDate = document.getElementById('DatePicker');
    currentselectedDate = new Date(currentselectedDate.value);
    updateDateDisplay(); // Add this line to update the display
    CompareDates();
    showComic();
}

// Add this to update the display when showing a comic
function showComic() {
    formatDate(currentselectedDate);
    formattedDate = year + "-" + month + "-" + day;
    formattedComicDate = year + "/" + month + "/" + day;
    document.getElementById('DatePicker').value = formattedDate;
    updateDateDisplay();
    
    localStorage.setItem('lastcomic', currentselectedDate);
    const comic = document.getElementById('comic');
    comic.alt = "Loading comic...";
    
    // Define multiple CORS proxies to try in sequence
    const corsProxies = [
        // Original proxy
        url => `https://corsproxy.garfieldapp.workers.dev/cors-proxy?${url}`,
        // Alternative proxies
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        // Try with more reliable proxies
        url => `https://cors-anywhere.herokuapp.com/${url}`
    ];
    
    // Check if this is a recent comic (within the last year)
    const today = new Date();
    const isRecentComic = new Date(year, parseInt(month)-1, parseInt(day)) > new Date(today.getFullYear()-1, today.getMonth(), today.getDate());
    
    // Check if we have a cached successful pattern for this date or nearby dates
    const dateKey = `${year}${month}${day}`;
    const cacheWindow = 7; // Check patterns from nearby dates within a week
    
    // Create base direct patterns
    const basePatternsRecent = [
        // New hash-based format (we can't predict the exact hash)
        // But we can try the general pattern structure
        `https://featureassets.gocomics.com/assets/`,
        
        // Previous formats we were trying
        `https://featureassets.gocomics.com/garfield/${year}-${month}-${day}.jpg`,
        `https://featureassets.gocomics.com/garfield/${year}/${month}/${day}.jpg`,
        `https://featureassets.gocomics.com/garfield/features/assets/${year}${month}${day}.jpg`,
        // Fix the TypeError by converting year to string before using substring
        `https://picayune.uclick.com/comics/ga/${String(year).substring(2)}/ga${String(year).substring(2)}${month}${day}.gif`,
        `https://www.gocomics.com/cci/images/webcomic/garfield/${year}${month}${day}.jpg`,
        `https://assets.amuniversal.com/garfield/api/day?date=${year}-${month}-${day}`
    ];
    
    const basePatternsOlder = [
        // Older patterns first for older comics
        `https://assets.amuniversal.com/garfield/strips/${year}/${month}/${day}.gif`,
        `https://assets.amuniversal.com/${year}${month}${day}_gar.gif`,
        // Fix the TypeError by converting year to string before using substring
        `https://picayune.uclick.com/comics/ga/${String(year).substring(2)}/ga${String(year).substring(2)}${month}${day}.gif`,
        `https://www.gocomics.com/cci/images/webcomic/garfield/${year}${month}${day}.jpg`,
        `https://assets.amuniversal.com/garfield/api/day?date=${year}-${month}-${day}`
    ];
    
    // Start with the appropriate base patterns based on comic age
    let directPatterns = isRecentComic ? [...basePatternsRecent] : [...basePatternsOlder];
    
    // Add more sophisticated patterns for newer comics
    if (isRecentComic) {
        // Add pattern for the date-based asset format
        const datePattern = `${year}${month}${day}`;
        const additionalPatterns = [
            // Date-based patterns (more common for recent comics)
            `https://assets.amuniversal.com/${datePattern}_gar`,
            `https://assets.amuniversal.com/c${datePattern}`,
            `https://assets.amuniversal.com/g${datePattern}`,
            `https://featureassets.gocomics.com/assets/${datePattern}`
        ];
        directPatterns = [...additionalPatterns, ...directPatterns];
    }
    
    let cachedPatterns = [];
    
    // Try to find patterns that worked for nearby dates
    for (let i = -cacheWindow; i <= cacheWindow; i++) {
        const targetDate = new Date(currentselectedDate);
        targetDate.setDate(targetDate.getDate() + i);
        
        const targetYear = targetDate.getFullYear();
        const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
        const targetDay = String(targetDate.getDate()).padStart(2, '0');
        const targetKey = `${targetYear}${targetMonth}${targetDay}`;
        
        if (successfulUrlPatterns[targetKey]) {
            // Found a pattern that worked for a nearby date
            const pattern = successfulUrlPatterns[targetKey];
            // Adjust the pattern for our target date
            const adjustedPattern = pattern
                .replace(/\d{4}\/\d{2}\/\d{2}/, `${year}/${month}/${day}`)
                .replace(/\d{8}/, dateKey);
            
            cachedPatterns.push(adjustedPattern);
        }
    }
    
    // Add these cached patterns to the front of our direct patterns
    if (cachedPatterns.length > 0) {
        directPatterns = [...cachedPatterns, ...directPatterns];
    }
    
    // Function to handle successful pattern
    function handleDirectPatternSuccess(directUrl) {
        console.log("Direct URL pattern success!");
        // Cache this successful pattern for future use
        successfulUrlPatterns[dateKey] = directUrl;
        
        // Save the cache to localStorage for persistence
        try {
            localStorage.setItem('urlPatternCache', JSON.stringify(successfulUrlPatterns));
        } catch (e) {
            console.warn("Failed to save URL pattern cache:", e);
        }
        
        window.pictureUrl = directUrl;
        changeComicImage(directUrl);
        
        // Update favorites display
        var favs = JSON.parse(localStorage.getItem('favs')) || [];
        document.getElementById("favheart").src = 
            (favs.indexOf(formattedComicDate) === -1) ? "./heartborder.svg" : "./heart.svg";
    }
    
    // Try a few patterns directly without proxies, if they work it's faster
    tryDirectPatterns();
    
    function tryDirectPatterns() {
        let currentDirectIndex = 0;
        
        function tryNextDirectPattern() {
            if (currentDirectIndex >= directPatterns.length) {
                console.log("Direct patterns failed, falling back to HTML extraction");
                tryGoComicsExtraction();
                return;
            }
            
            const directUrl = directPatterns[currentDirectIndex];
            console.log(`Trying direct URL pattern ${currentDirectIndex + 1}:`, directUrl);
            
            // Test if image loads directly
            const testImg = new Image();
            testImg.onload = function() {
                handleDirectPatternSuccess(directUrl);
            };
            
            testImg.onerror = function() {
                currentDirectIndex++;
                tryNextDirectPattern();
            };
            
            // Try loading the image
            testImg.src = directUrl;
        }
        
        // Start with direct patterns
        tryNextDirectPattern();
    }
    
    function tryGoComicsExtraction() {
        // GoComics URL to fetch the comic page
        const gocomicsUrl = `https://www.gocomics.com/garfield/${formattedComicDate}`;
        console.log("Trying GoComics extraction from:", gocomicsUrl);
        
        // Track which proxy we're using
        let currentProxyIndex = 0;
        
        function tryWithNextProxy() {
            if (currentProxyIndex >= corsProxies.length) {
                console.error("All proxies failed, trying alternative methods");
                tryAlternativeSources();
                return;
            }
            
            const proxyFn = corsProxies[currentProxyIndex];
            const proxiedUrl = proxyFn(gocomicsUrl);
            console.log(`Trying with proxy ${currentProxyIndex + 1}:`, proxiedUrl);
            
            fetch(proxiedUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    // Look for specific patterns in the HTML that might indicate where the comic image is
                    const assetIndexStart = html.indexOf('featureassets.gocomics.com/assets/');
                    if (assetIndexStart > -1) {
                        console.log("Found asset URL reference at position:", assetIndexStart);
                        // Extract 100 characters around this position for debugging
                        const context = html.substring(Math.max(0, assetIndexStart - 50), 
                                                     Math.min(html.length, assetIndexStart + 150));
                        console.log("URL context:", context);
                    }
                    
                    // Try to extract the comic image URL using updated patterns
                    let imageUrl = extractComicUrl(html);
                    
                    if (imageUrl) {
                        // Fix protocol-relative URLs
                        if (imageUrl.startsWith('//')) {
                            imageUrl = 'https:' + imageUrl;
                        }
                        
                        console.log("Found comic URL:", imageUrl);
                        window.pictureUrl = imageUrl;
                        
                        // Use the same proxy for the image
                        const imgProxiedUrl = proxyFn(imageUrl);
                        loadComicImage(imgProxiedUrl);
                    } else {
                        // If we couldn't find the URL, log some additional info for debugging
                        console.warn("Failed to extract comic URL, searching for clues...");
                        
                        // Look for meta tags which might help
                        const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
                        if (ogImageMatch) {
                            console.log("Found og:image meta tag:", ogImageMatch[1]);
                            
                            // Try to use this URL
                            const ogImageUrl = ogImageMatch[1];
                            window.pictureUrl = ogImageUrl;
                            loadComicImage(proxyFn(ogImageUrl));
                            return;
                        }
                        
                        throw new Error("Could not find comic image URL in HTML");
                    }
                })
                .catch(error => {
                    console.error(`Error with proxy ${currentProxyIndex + 1}:`, error);
                    currentProxyIndex++;
                    tryWithNextProxy();
                });
        }
        
        // Start with the first proxy
        tryWithNextProxy();
    }
}

// Function to extract the comic URL from HTML using multiple patterns
function extractComicUrl(html) {
    // Try different extraction patterns, ordered from most to least specific
    const extractionPatterns = [
        // NEW: Match the specific asset hash format shown in the example
        /https:\/\/featureassets\.gocomics\.com\/assets\/[a-f0-9]+/i,
        
        // NEW: Match any featureassets.gocomics.com with /assets/ path
        /https:\/\/featureassets\.gocomics\.com\/assets\/[^"'\s]+/i,
        
        // Previous patterns
        /https:\/\/featureassets\.gocomics\.com\/[^"'\s]+\.(gif|jpg|jpeg|png)(\?[^"'\s]+)?/i,
        
        // NEW: Look for URLs in JSON data which often contains the comic URL
        /"image"\s*:\s*"(https:\/\/[^"]+)"/i,
        /"content"\s*:\s*"(https:\/\/[^"]+)"/i,
        
        // Look for data-image attribute which often has the full URL in newer layouts
        /<img[^>]*data-image="([^"]+)"[^>]*class="[^"]*comic[^"]*"[^>]*>/i,
        
        // Match data-srcset attribute - used in responsive layouts
        /<picture[^>]*>.*?<img[^>]*data-srcset="([^"]+)"[^>]*>.*?<\/picture>/is,
        
        // Updated classic pattern - match any img with src containing assets.amuniversal.com
        /<img[^>]*src="(https?:\/\/assets\.amuniversal\.com[^"]+)"[^>]*>/i,
        
        // Look in the og:image meta tag which often contains the comic
        /<meta\s+property="og:image"\s+content="([^"]+)"/i,
        
        // Match JSON data that might contain the image URL
        /content['"]?\s*:\s*['"]?(https:\/\/[^'"]+\.(gif|jpg|jpeg|png))/i,
        
        // Look for any image URL in a class containing 'comic'
        /<[^>]*class="[^"]*comic[^"]*"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/is,
        
        // Very generic catch-all for any image URL
        /https:\/\/[^"'\s]+\.(gif|jpg|jpeg|png)(\?[^"'\s]+)?/i
    ];
    
    // Try each pattern and return the first match
    for (let i = 0; i < extractionPatterns.length; i++) {
        const match = html.match(extractionPatterns[i]);
        if (match) {
            // Get URL - either the first capture group or the whole match
            const url = match[1] || match[0];
            
            // Skip URLs containing probable non-comic images
            if (url.includes('favicon') || 
                url.includes('logo') || 
                url.includes('missing') ||
                url.includes('placeholder')) {
                console.log(`Skipping non-comic URL (pattern ${i+1}):`, url);
                continue;
            }
            
            console.log(`Found comic URL with pattern ${i+1}:`, url);
            return url;
        }
    }
    
    // For debugging: Log a portion of the HTML to see what we're working with
    console.log("HTML sample for debugging:", html.substring(0, 1000));
    
    // Look for any JSON blocks that might contain the image URL
    const jsonBlocks = html.match(/\{[^\{]*?"image"[^\}]*?\}/g) || [];
    if (jsonBlocks.length > 0) {
        console.log("Found JSON blocks with 'image' property:", jsonBlocks);
        for (const block of jsonBlocks) {
            const urlMatch = block.match(/"(https:\/\/[^"]+)"/);
            if (urlMatch && urlMatch[1]) {
                console.log("Extracted URL from JSON:", urlMatch[1]);
                return urlMatch[1];
            }
        }
    }
    
    return null;
}

function tryAlternativeSources() {
    console.log("Trying alternative comic sources...");
    const comic = document.getElementById('comic');
    comic.alt = "Trying alternative sources...";
    
    // For newer comics, try these alternative URLs with special formatting
    const alternativeBaseUrls = [
        // NEW: Latest comics domain
        `https://featureassets.gocomics.com/garfield/${year}-${month}-${day}.jpg`,
        `https://featureassets.gocomics.com/garfield/${year}/${month}/${day}.jpg`,
        // Then try other established patterns
        `https://cdn.gocomics.org/i/comics/ck/production/content/garfield/content-${year}-${month}-${day}.jpg`,
        // Universal Uclick has some comics
        `https://www.universaluclick.com/comics/strip/${year}/garfield/${year}${month}${day}.jpg`,
        // Another assets pattern
        `https://assets.gocomics.com/content-${year}-${month}-${day}.jpg`,
        // Try with different date formatting
        `https://assets.amuniversal.com/${year}/${month}/${day}/garfield.jpg`
    ];
    
    let alternativeIndex = 0;
    
    function tryNextAlternative() {
        if (alternativeIndex >= alternativeBaseUrls.length) {
            comic.alt = "Comic not found. Please try another date.";
            return;
        }
        
        const altUrl = alternativeBaseUrls[alternativeIndex];
        console.log(`Trying alternative URL ${alternativeIndex + 1}:`, altUrl);
        
        // Try loading the image
        const testImg = new Image();
        testImg.onload = function() {
            console.log("Alternative URL success!");
            window.pictureUrl = altUrl;
            changeComicImage(altUrl);
            
            // Update favorites display
            var favs = JSON.parse(localStorage.getItem('favs')) || [];
            document.getElementById("favheart").src = 
                (favs.indexOf(formattedComicDate) === -1) ? "./heartborder.svg" : "./heart.svg";
        };
        
        testImg.onerror = function() {
            alternativeIndex++;
            tryNextAlternative();
        };
        
        testImg.src = altUrl;
    }
    
    tryNextAlternative();
}

// Helper function to load a comic image
function loadComicImage(url) {
    console.log("Loading comic image:", url);
    
    // Create a temporary image to check if it loads
    const tempImg = new Image();
    
    tempImg.onload = function() {
        console.log("Comic image loaded successfully");
        if (url !== previousUrl) {
            changeComicImage(url);
        } else if (previousclicked) {
            PreviousClick();
        }
        
        previousclicked = false;
        previousUrl = url;
        
        // Update favorites display
        var favs = JSON.parse(localStorage.getItem('favs')) || [];
        document.getElementById("favheart").src = 
            (favs.indexOf(formattedComicDate) === -1) ? "./heartborder.svg" : "./heart.svg";
    };
    
    tempImg.onerror = function() {
        console.error("Failed to load image:", url);
        currentProxyIndex++;
        tryWithNextProxy();
    };
    
    tempImg.src = url;
}

// Add these navigation functions

function PreviousClick() {
    if(document.getElementById("showfavs").checked) {
        var favs = JSON.parse(localStorage.getItem('favs'));
        if(favs.indexOf(formattedComicDate) > 0) {
            currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) - 1]);
        }
    } else {
        currentselectedDate.setDate(currentselectedDate.getDate() - 1);
    }
    previousclicked = true;
    CompareDates();
    showComic();
}

function NextClick() {
    if(document.getElementById("showfavs").checked) {
        var favs = JSON.parse(localStorage.getItem('favs'));
        if(favs.indexOf(formattedComicDate) < favs.length - 1) {
            currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) + 1]);
        }
    } else {
        currentselectedDate.setDate(currentselectedDate.getDate() + 1);
    }
    CompareDates();
    showComic();
}

function FirstClick() {
    if(document.getElementById("showfavs").checked) {
        var favs = JSON.parse(localStorage.getItem('favs'));
        currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);
    } else {
        currentselectedDate = new Date(Date.UTC(1978, 5, 19, 12)); // First Garfield comic: June 19, 1978
    }
    CompareDates();
    showComic();
}

function CurrentClick() {
    if(document.getElementById("showfavs").checked) {
        var favs = JSON.parse(localStorage.getItem('favs'));
        favslength = favs.length - 1;
        currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[favslength]);
    } else {
        currentselectedDate = new Date();
    }
    CompareDates();
    showComic();
}

function RandomClick() {
    if(document.getElementById("showfavs").checked) {
        var favs = JSON.parse(localStorage.getItem('favs'));
        currentselectedDate = new Date(favs[Math.floor(Math.random() * favs.length)]);
    } else {
        start = new Date("1978-06-19");
        end = new Date();
        currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }
    CompareDates();
    showComic();
}

// Add this function to handle the rotate action referenced in the HTML
function Rotate() {
    const comic = document.getElementById('comic');
    
    if (comic.className === "normal") {
        // Switch to rotated view
        applyRotatedView();
    } else {
        // Switch back to normal view
        exitRotatedView();
    }
}

// Apply rotated view with state tracking
function applyRotatedView() {
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Set rotation state
    isRotatedMode = true;
    
    comic.className = "rotate";
    container.classList.add('fullscreen');
    
    // Hide install button if present
    const installButtons = document.querySelectorAll('button');
    installButtons.forEach(button => {
        if (button.innerText === 'Install App' || button.textContent === 'Install App') {
            button.style.display = 'none';
        }
    });
    
    // Hide other UI elements
    elementsToHide.forEach(el => {
        el.classList.add('hidden-during-fullscreen');
    });
    
    if (controlsDiv) {
        controlsDiv.classList.add('hidden-during-fullscreen');
    }
    
    // Force recalculation of position for better centering
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 50);
}

// Exit rotated view with state tracking
function exitRotatedView() {
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Reset rotation state
    isRotatedMode = false;
    
    comic.className = 'normal';
    container.classList.remove('fullscreen');
    
    // Show install button again if present
    const installButtons = document.querySelectorAll('button');
    installButtons.forEach(button => {
        if (button.innerText === 'Install App' || button.textContent === 'Install App') {
            button.style.display = '';
        }
    });
    
    // Show UI elements again
    elementsToHide.forEach(el => {
        el.classList.remove('hidden-during-fullscreen');
    });
    
    if (controlsDiv) {
        controlsDiv.classList.remove('hidden-during-fullscreen');
    }
}

// Add a URL pattern cache to remember successful patterns
let successfulUrlPatterns = {};

// Initialize pattern cache from localStorage when page loads
function initUrlPatternCache() {
    try {
        const cachedPatterns = localStorage.getItem('urlPatternCache');
        if (cachedPatterns) {
            successfulUrlPatterns = JSON.parse(cachedPatterns);
            console.log("Loaded URL pattern cache with", Object.keys(successfulUrlPatterns).length, "patterns");
        }
    } catch (e) {
        console.warn("Failed to load URL pattern cache:", e);
        successfulUrlPatterns = {};
    }
}

// Function that will be called when the page loads
function onLoad() {
    var favs = JSON.parse(localStorage.getItem('favs')) || [];

    // Set minimum body height at load time to prevent gradient shift
    document.body.style.minHeight = "100vh";

    // Set proper body overflow to prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // Initialize the URL pattern cache
    initUrlPatternCache();

    // Prevent clearing the date picker
    const datePicker = document.getElementById("DatePicker");
    datePicker.setAttribute("required", "required");
    
    // Add event listener to prevent emptying the date
    datePicker.addEventListener('change', function(e) {
        if (!this.value) {
            // If cleared, reset to current date
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            this.value = `${yyyy}-${mm}-${dd}`;
        }
    });

    if (document.getElementById("showfavs").checked) {
        currentselectedDate = favs.length ? new Date(favs[0]) : new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
    } else {
        currentselectedDate = new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
    }
    formatDate(new Date());
    today = `${year}-${month}-${day}`;
    document.getElementById("DatePicker").setAttribute("max", today);

    if (document.getElementById("lastdate").checked && localStorage.getItem('lastcomic')) {
        currentselectedDate = new Date(localStorage.getItem('lastcomic'));
    }
    CompareDates();
    showComic();
    updateDateDisplay(); // Add this line to update the display
}

// Call this function when the date changes
function DateChange() {
    currentselectedDate = document.getElementById('DatePicker');
    currentselectedDate = new Date(currentselectedDate.value);
    updateDateDisplay(); // Add this line to update the display
    CompareDates();
    showComic();
}

