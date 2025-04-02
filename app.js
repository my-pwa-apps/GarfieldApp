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

    // Restore last date checkbox setting from localStorage
    const lastDateSetting = localStorage.getItem('lastdate');
    if (lastDateSetting !== null) {
        // Only set the checkbox if we have a saved preference
        document.getElementById("lastdate").checked = lastDateSetting === 'true';
    }
    
    // Add event listener to save lastdate preference when changed
    document.getElementById("lastdate").addEventListener('change', function() {
        localStorage.setItem('lastdate', this.checked);
    });

    // Add event listener for showfavs preference
    document.getElementById("showfavs").addEventListener('change', function() {
        localStorage.setItem('showfavs', this.checked);
    });

    // Restore favorites setting from localStorage
    const showFavsSetting = localStorage.getItem('showfavs');
    if (showFavsSetting !== null) {
        document.getElementById("showfavs").checked = showFavsSetting === 'true';
    }

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

    // Only load the last comic if the setting is true
    if (document.getElementById("lastdate").checked && localStorage.getItem('lastcomic')) {
        currentselectedDate = new Date(localStorage.getItem('lastcomic'));
    }
    
    CompareDates();
    showComic();
    updateDateDisplay(); // Add this line to update the display
}

// Call this function when the date changes
async function DateChange() {
    const date = new Date(document.getElementById('DatePicker').value);
    await loadComicForDate(date);
}

async function RandomClick() {
    await loadRandomComic();
}

async function CurrentClick() {
    await loadComicForDate(new Date());
}

async function PreviousClick() {
    const currentDate = parseArcamaxDate(document.getElementById('DatePicker').value);
    currentDate.setDate(currentDate.getDate() - 1);
    await loadComicForDate(currentDate);
}

async function NextClick() {
    const currentDate = parseArcamaxDate(document.getElementById('DatePicker').value);
    currentDate.setDate(currentDate.getDate() + 1);
    await loadComicForDate(currentDate);
}

async function FirstClick() {
    const firstDate = new Date(1978, 5, 19); // June 19, 1978
    await loadComicForDate(firstDate);
}

async function onLoad() {
    if (document.getElementById('lastdate').checked) {
        const savedDate = localStorage.getItem('lastDate');
        if (savedDate) {
            await loadComicForDate(new Date(savedDate));
            return;
        }
    }
    await CurrentClick();
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

    // Restore last date checkbox setting from localStorage
    const lastDateSetting = localStorage.getItem('lastdate');
    if (lastDateSetting !== null) {
        // Only set the checkbox if we have a saved preference
        document.getElementById("lastdate").checked = lastDateSetting === 'true';
    }
    
    // Add event listener to save lastdate preference when changed
    document.getElementById("lastdate").addEventListener('change', function() {
        localStorage.setItem('lastdate', this.checked);
    });

    // Add event listener for showfavs preference
    document.getElementById("showfavs").addEventListener('change', function() {
        localStorage.setItem('showfavs', this.checked);
    });

    // Restore favorites setting from localStorage
    const showFavsSetting = localStorage.getItem('showfavs');
    if (showFavsSetting !== null) {
        document.getElementById("showfavs").checked = showFavsSetting === 'true';
    }

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

    // Only load the last comic if the setting is true
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

    // Define the URL for fetching comics from arcamax.com
    const arcamaxBaseUrl = `https://www.arcamax.com/thefunnies/garfield`;

    console.log("Fetching comic from:", arcamaxBaseUrl);

    fetch(arcamaxBaseUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            console.log("Successfully fetched HTML from arcamax.com.");
            const comicId = extractComicIdFromArcamax(html, formattedDate);

            if (comicId) {
                const comicUrl = `https://www.arcamax.com/thefunnies/garfield/s-${comicId}`;
                console.log("Found comic URL:", comicUrl);
                loadComicImage(comicUrl);
            } else {
                throw new Error("Could not extract comic ID from HTML.");
            }
        })
        .catch(error => {
            console.error("Error fetching comic from arcamax.com:", error);
            comic.alt = "Comic not found. Please try another date.";
        });
}

function extractComicIdFromArcamax(html, date) {
    // Extract the comic ID for the given date from the HTML of arcamax.com
    const regex = new RegExp(`href=["']https://www\\.arcamax\\.com/thefunnies/garfield/s-(\\d+)["']`, 'i');
    const match = html.match(regex);
    if (match && match[1]) {
        console.log(`Extracted comic ID for ${date}:`, match[1]);
        return match[1];
    }
    console.warn("Failed to extract comic ID from arcamax.com HTML.");
    return null;
}

function loadComicImage(url) {
    const comic = document.getElementById('comic');
    comic.src = url;
    comic.alt = "Garfield comic";
    console.log("Comic image loaded:", url);
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

    // Restore last date checkbox setting from localStorage
    const lastDateSetting = localStorage.getItem('lastdate');
    if (lastDateSetting !== null) {
        // Only set the checkbox if we have a saved preference
        document.getElementById("lastdate").checked = lastDateSetting === 'true';
    }
    
    // Add event listener to save lastdate preference when changed
    document.getElementById("lastdate").addEventListener('change', function() {
        localStorage.setItem('lastdate', this.checked);
    });

    // Add event listener for showfavs preference
    document.getElementById("showfavs").addEventListener('change', function() {
        localStorage.setItem('showfavs', this.checked);
    });

    // Restore favorites setting from localStorage
    const showFavsSetting = localStorage.getItem('showfavs');
    if (showFavsSetting !== null) {
        document.getElementById("showfavs").checked = showFavsSetting === 'true';
    }

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

    // Only load the last comic if the setting is true
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

