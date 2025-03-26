//garfieldapp.pages.dev

// App state and constants
const APP_STATE = {
    currentselectedDate: null,
    previousclicked: false,
    previousUrl: "",
    pictureUrl: null,
    formattedComicDate: null,
    formattedDate: null,
    isRotatedMode: false,
    START_DATE: new Date("1978/06/19")
};

// Service Worker Registration
if("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./serviceworker.js");
}

// Format date helper
function formatDate(datetoFormat) {
    const day = String(datetoFormat.getDate()).padStart(2, '0');
    const month = String(datetoFormat.getMonth() + 1).padStart(2, '0');
    const year = datetoFormat.getFullYear();
    return { day, month, year };
}

// Only have one initialization function that calls everything else
function initializeApp() {
    try {
        console.log('Initializing app...');
        initializeSettings();
        setupSwipeListeners();
        initializeEventHandlers();
        onLoad();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
}

// Move swipe listeners to their own function
function setupSwipeListeners() {
    document.addEventListener('swiped-down', () => {
        if(document.getElementById("swipe").checked) RandomClick();
    });

    document.addEventListener('swiped-right', () => {
        if(document.getElementById("swipe").checked) PreviousClick();
    });

    document.addEventListener('swiped-left', () => {
        if(document.getElementById("swipe").checked) NextClick();
    });

    document.addEventListener('swiped-up', () => {
        if(document.getElementById("swipe").checked) CurrentClick();
    });
}

// Fix CompareDates function to properly handle variable declarations
function CompareDates() {
    const favs = JSON.parse(localStorage.getItem('favs')) || [];
    let startDate, endDate;
    
    if(document.getElementById("showfavs").checked) {
        document.getElementById("DatePicker").disabled = true;
        startDate = new Date(favs[0]);
    } else {    
        document.getElementById("DatePicker").disabled = false;
        startDate = new Date("1978/06/19");
    }
    
    startDate.setHours(0, 0, 0, 0);
    APP_STATE.currentselectedDate.setHours(0, 0, 0, 0);
    
    if(APP_STATE.currentselectedDate.getTime() <= startDate.getTime()) {
        document.getElementById("Previous").disabled = true;
        document.getElementById("First").disabled = true;
        const { year, month, day } = formatDate(startDate);
        APP_STATE.currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
    } else {
        document.getElementById("Previous").disabled = false;
        document.getElementById("First").disabled = false;
    }
    
    if(document.getElementById("showfavs").checked) {
        endDate = new Date(favs[favs.length - 1]);
    } else { 
        endDate = new Date();
    }
    endDate.setHours(0, 0, 0, 0);
    
    if(APP_STATE.currentselectedDate.getTime() >= endDate.getTime()) {
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
        const { year, month, day } = formatDate(endDate);
        APP_STATE.currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
    } else {
        document.getElementById("Next").disabled = false;
        document.getElementById("Today").disabled = false;
    }
    
    if(document.getElementById("showfavs").checked && favs.length === 1) {
        document.getElementById("Random").disabled = true;
        document.getElementById("Previous").disabled = true;
        document.getElementById("First").disabled = true;
    } else {
        document.getElementById("Random").disabled = false;
    }
}

// CORS proxy configuration
const CORS_PROXIES = [
    url => `https://corsproxy.garfieldapp.workers.dev/cors-proxy?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

// Date navigation functions
function PreviousClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs'));
        const currentIndex = favs.indexOf(APP_STATE.formattedComicDate);
        if(currentIndex > 0) {
            APP_STATE.currentselectedDate = new Date(favs[currentIndex - 1]);
        }
    } else {
        APP_STATE.currentselectedDate.setDate(APP_STATE.currentselectedDate.getDate() - 1);
    }
    APP_STATE.previousclicked = true;
    CompareDates();
    showComic();
}

function NextClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs'));
        const currentIndex = favs.indexOf(APP_STATE.formattedComicDate);
        if(currentIndex < favs.length - 1) {
            APP_STATE.currentselectedDate = new Date(favs[currentIndex + 1]);
        }
    } else {
        APP_STATE.currentselectedDate.setDate(APP_STATE.currentselectedDate.getDate() + 1);
    }
    CompareDates();
    showComic();
}

function FirstClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs'));
        APP_STATE.currentselectedDate = new Date(favs[0]);
    } else {
        APP_STATE.currentselectedDate = new Date(APP_STATE.START_DATE);
    }
    CompareDates();
    showComic();
}

function CurrentClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs'));
        APP_STATE.currentselectedDate = new Date(favs[favs.length - 1]);
    } else {
        APP_STATE.currentselectedDate = new Date();
    }
    CompareDates();
    showComic();
}

function RandomClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs'));
        APP_STATE.currentselectedDate = new Date(favs[Math.floor(Math.random() * favs.length)]);
    } else {
        const start = APP_STATE.START_DATE;
        const end = new Date();
        APP_STATE.currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }
    CompareDates();
    showComic();
}

// Comic display functions
// Update changeComicImage to include a fallback mechanism
function changeComicImage(newSrc) {
    console.log("Changing comic image to:", newSrc);
    const comic = document.getElementById('comic');
    comic.classList.add('dissolve');

    comic.onload = () => {
        console.log("Comic image loaded successfully.");
        comic.classList.remove('dissolve');
        handleImageLoad();
    };

    comic.onerror = () => {
        console.error("Failed to load comic image:", newSrc);
        comic.alt = "Failed to load comic. Displaying fallback image.";
        comic.src = "./garfieldchristmas.png"; // Fallback image
    };

    comic.src = newSrc;
}

// Settings functions
function HideSettings() {
    const settingsDiv = document.getElementById("settingsDIV");
    const isHidden = settingsDiv.style.display === "none" || settingsDiv.style.display === "";
    settingsDiv.style.display = isHidden ? "block" : "none";
    localStorage.setItem('settings', isHidden ? "true" : "false");
}

function updateDateDisplay() {
    const dateInput = document.getElementById('DatePicker');
    const wrapper = document.querySelector('.date-center-wrapper');
    
    if (dateInput && wrapper) {
        const dateValue = dateInput.value;
        if (dateValue) {
            const [year, month, day] = dateValue.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            const localizedDate = date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            });
            wrapper.setAttribute('data-display-date', localizedDate);
        } else {
            wrapper.setAttribute('data-display-date', '');
        }
    }
}

// Call this function when the date changes
function DateChange() {
    APP_STATE.currentselectedDate = document.getElementById('DatePicker');
    APP_STATE.currentselectedDate = new Date(APP_STATE.currentselectedDate.value);
    updateDateDisplay(); // Add this line to update the display
    CompareDates();
    showComic();
}

// Add this to update the display when showing a comic
function showComic() {
    console.log("Starting to show comic...");
    const { year, month, day } = formatDate(APP_STATE.currentselectedDate);
    APP_STATE.formattedDate = `${year}-${month}-${day}`;
    APP_STATE.formattedComicDate = `${year}/${month}/${day}`;
    console.log("Formatted date:", APP_STATE.formattedDate);

    document.getElementById('DatePicker').value = APP_STATE.formattedDate;
    updateDateDisplay();

    const cacheKey = `comic_${APP_STATE.formattedComicDate}`;
    localStorage.setItem('lastcomic', APP_STATE.currentselectedDate);
    const comic = document.getElementById('comic');
    comic.alt = "Loading comic...";

    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            const data = JSON.parse(cachedData);
            if (data && data.url) {
                console.log("Using cached comic URL:", data.url);
                APP_STATE.pictureUrl = data.url;
                changeComicImage(data.imageUrl);
                return;
            }
        } catch (e) {
            console.warn("Error reading cache:", e);
        }
    }

    const originalUrl = `https://www.gocomics.com/garfield/${APP_STATE.formattedComicDate}`;
    let currentProxyIndex = 0;

    function tryNextProxy() {
        if (currentProxyIndex >= CORS_PROXIES.length) {
            console.error("All proxies failed. Unable to load comic.");
            comic.alt = "Failed to load comic. Please try again later.";
            return;
        }

        const proxyUrl = CORS_PROXIES[currentProxyIndex](originalUrl);
        console.log(`Trying proxy ${currentProxyIndex + 1}: ${proxyUrl}`);

        fetch(proxyUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                console.log("Proxy response received.");
                const siteBody = text;
                const pictureUrl = extractComicUrl(siteBody);
                if (!pictureUrl) {
                    throw new Error("Could not extract comic image URL");
                }

                const imageUrl = CORS_PROXIES[currentProxyIndex](pictureUrl);
                APP_STATE.pictureUrl = pictureUrl;
                localStorage.setItem(cacheKey, JSON.stringify({
                    url: pictureUrl,
                    imageUrl: imageUrl,
                    timestamp: Date.now()
                }));
                console.log("Comic image URL extracted:", imageUrl);
                changeComicImage(imageUrl);
            })
            .catch(error => {
                console.error(`Proxy ${currentProxyIndex + 1} failed:`, error);
                currentProxyIndex++;
                tryNextProxy();
            });
    }

    tryNextProxy();
}

// Function to check if the comic is vertical and show thumbnail if needed
function checkImageOrientation() {
    const comic = document.getElementById('comic');
    const comicWrapper = document.getElementById('comic-wrapper');
    
    // Reset any previous thumbnail setup
    comic.classList.remove('vertical', 'fullscreen-vertical');
    comic.classList.add('normal');
    
    // Remove any existing thumbnail container
    const existingThumbnail = document.querySelector('.thumbnail-container');
    if (existingThumbnail) {
        existingThumbnail.parentNode.replaceChild(comic, existingThumbnail);
    }
    
    // Check if image is fully loaded and vertical (height > width)
    if (comic.complete && comic.naturalHeight > 0 && comic.naturalHeight > comic.naturalWidth * 1.5) {
        // It's a vertical comic, create thumbnail view
        comic.classList.remove('normal');
        comic.classList.add('vertical');
        
        // Create thumbnail container
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        
        // Create notice
        const notice = document.createElement('div');
        notice.className = 'thumbnail-notice';
        notice.textContent = 'Click to view full size';
        
        // Set up the thumbnail display
        comicWrapper.replaceChild(thumbnailContainer, comic);
        thumbnailContainer.appendChild(comic);
        thumbnailContainer.appendChild(notice);
        
        // Add click handler to the thumbnail container
        thumbnailContainer.onclick = showFullsizeVertical;
    }
}

// Function to show fullsize vertical comic
function showFullsizeVertical(event) {
    // Prevent default behavior to ensure our handler works
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Switch to fullscreen view
    comic.classList.remove('vertical');
    comic.classList.add('fullscreen-vertical');
    container.classList.add('fullscreen');
    
    // Set the container background to match the app background gradient
    container.style.background = 'linear-gradient(#eee239, orange) no-repeat fixed';
    container.style.backgroundSize = '100% 100vh';
    
    // Hide install button if present - use a more generic selector that will work
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
    
    // Add click handler to exit fullscreen
    comic.addEventListener('click', exitFullsizeVertical);
    container.addEventListener('click', exitFullsizeVertical);
}

// Function to exit fullsize vertical comic view
function exitFullsizeVertical(event) {
    // Prevent default behavior
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Reset container background
    container.style.background = '';
    container.style.backgroundSize = '';
    
    // Show install button again if present
    const installButtons = document.querySelectorAll('button');
    installButtons.forEach(button => {
        if (button.innerText === 'Install App' || button.textContent === 'Install App') {
            button.style.display = '';
        }
    });
    
    // Switch back to thumbnail view
    comic.classList.remove('fullscreen-vertical');
    comic.classList.add('vertical');
    container.classList.remove('fullscreen');
    comic.style.zIndex = '';
    
    // Show UI elements again
    elementsToHide.forEach(el => {
        el.classList.remove('hidden-during-fullscreen');
    });
    
    if (controlsDiv) {
        controlsDiv.classList.remove('hidden-during-fullscreen');
    }
    
    // Remove this click handler
    comic.removeEventListener('click', exitFullsizeVertical);
    container.removeEventListener('click', exitFullsizeVertical);
}

// Function to handle image loading and detect orientation
function handleImageLoad() {
    const comic = document.getElementById('comic');
    
    // Wait for image to be fully loaded
    if (comic.complete && comic.naturalWidth > 0) {
        // Check if the comic is vertical (tall)
        if (comic.naturalHeight > comic.naturalWidth * 1.5) {
            checkImageOrientation();
        } else {
            // Regular horizontal comic - just show normally
            comic.classList.remove('vertical', 'fullscreen-vertical');
            comic.classList.add('normal');
        }
    }
}

// Event handler initialization
function initializeEventHandlers() {
    const swipeCheckbox = document.getElementById('swipe');
    const lastdateCheckbox = document.getElementById('lastdate');
    const showfavsCheckbox = document.getElementById('showfavs');

    if (swipeCheckbox) {
        swipeCheckbox.onclick = function() {
            localStorage.setItem('stat', this.checked ? "true" : "false");
            if (!this.checked) {
                CompareDates();
                showComic();
            }
        };
    }

    if (lastdateCheckbox) {
        lastdateCheckbox.onclick = function() {
            localStorage.setItem('lastdate', this.checked ? "true" : "false");
        };
    }

    if (showfavsCheckbox) {
        showfavsCheckbox.onclick = function() {
            const favs = JSON.parse(localStorage.getItem('favs')) || [];
            localStorage.setItem('showfavs', this.checked ? "true" : "false");
            
            if(this.checked) {
                if(favs.indexOf(APP_STATE.formattedComicDate) === -1) {
                    APP_STATE.currentselectedDate = new Date(favs[0]);
                }
                document.getElementById('Today').innerHTML = 'Last';
            } else {
                document.getElementById('Today').innerHTML = 'Today';
            }
            CompareDates();
            showComic();
        };
    }
}

// Initialize app state on load
function onLoad() {
    const favs = JSON.parse(localStorage.getItem('favs')) || [];
    
    // Set minimum body height for gradient
    document.body.style.minHeight = "100vh";
    
    // Apply fixed layout only on mobile
    if (window.innerWidth <= 768) {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
    }
    
    // Initialize date picker
    const datePicker = document.getElementById("DatePicker");
    datePicker.setAttribute("required", "required");
    datePicker.addEventListener('change', function(e) {
        if (!this.value) {
            const today = new Date();
            const { year, month, day } = formatDate(today);
            this.value = `${year}-${month}-${day}`;
        }
    });
    
    // Initialize current date
    if (document.getElementById("showfavs").checked) {
        APP_STATE.currentselectedDate = favs.length ? new Date(favs[0]) : new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
    } else {
        APP_STATE.currentselectedDate = new Date();
        if (!favs.length) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
    }
    
    // Set max date
    const { year, month, day } = formatDate(new Date());
    const today = `${year}-${month}-${day}`;
    datePicker.setAttribute("max", today);
    
    // Load last comic if enabled
    if (document.getElementById("lastdate").checked && localStorage.getItem('lastcomic')) {
        APP_STATE.currentselectedDate = new Date(localStorage.getItem('lastcomic'));
    }
    
    CompareDates();
    showComic();
    updateDateDisplay();
}

// Initialize settings from localStorage
const initializeSettings = () => {
    // Swipe setting
    const swipeEnabled = localStorage.getItem('stat') === "true";
    document.getElementById("swipe").checked = swipeEnabled;
    
    // Show favorites setting
    const showFavs = localStorage.getItem('showfavs') === "true";
    document.getElementById("showfavs").checked = showFavs;
    document.getElementById('Today').innerHTML = showFavs ? 'Last' : 'Today';
    
    // Last date setting
    document.getElementById("lastdate").checked = localStorage.getItem('lastdate') === "true";
    
    // Settings visibility
    document.getElementById("settingsDIV").style.display = 
        localStorage.getItem('settings') === "true" ? "block" : "none";
};

// Initialize settings when DOM loads
document.addEventListener('DOMContentLoaded', initializeSettings);

// Set up app install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  showInstallPromotion();
});

function showInstallPromotion() {
    const installButton = document.createElement('button');
    installButton.innerText = 'Install App';
    installButton.className = 'button install-button';
    
    // Match button styling from the app, with more subtle font
    Object.assign(installButton.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '1000',
        margin: '0',
        padding: '10px 20px',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        fontSize: '0.85rem',
        fontWeight: '500',
        color: 'black',
        borderRadius: '10px',
        border: 'none',
        backgroundImage: 'linear-gradient(45deg, #eee239 0%, #F09819 51%, #eee239 100%)',
        backgroundSize: '200% auto',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
        cursor: 'pointer',
        transition: '0.5s',
        userSelect: 'none',
        animation: 'pulse 2s infinite'
    });
    
    // Add pulse animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        /* Make install button responsive */
        @media (min-width: 769px) {
            .install-button {
                position: fixed;
                bottom: 20px !important;
                right: 20px !important;
            }
        }
        
        /* Add margin at the bottom on desktop to prevent overlap */
        @media (min-width: 769px) {
            #settingsDIV {
                margin-bottom: 80px;
            }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(installButton);
    
    // Check if we're on desktop (wider screen)
    const isDesktop = window.innerWidth >= 769;
    if (isDesktop) {
        // Add extra space at bottom of the page to prevent overlap
        const extraSpace = document.createElement('div');
        extraSpace.style.height = '70px';
        extraSpace.style.width = '100%';
        document.body.appendChild(extraSpace);
    }
    
    installButton.addEventListener('click', () => {
        // Hide the app provided install promotion
        installButton.style.display = 'none';
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          } else {
            console.log('User dismissed the install prompt');
          }
          deferredPrompt = null;
        });
    });
}

// Apply rotated view with state tracking
function applyRotatedView() {
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    // Set rotation state
    APP_STATE.isRotatedMode = true;
    
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
    APP_STATE.isRotatedMode = false;
    
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

// Clean up the Rotate function to use our new state-aware functions
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

// Share function
async function Share() {
    if(!navigator.share) {
        alert("Sharing is not supported on this device.");
        return;
    }

    try {
        const comic = document.getElementById('comic');
        if (!comic || !comic.complete) {
            alert("Please wait for the comic to load completely.");
            return;
        }

        // Since we already have the image loaded and working, fetch it through the same URL
        const response = await fetch(comic.src);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Create a file from the blob
        const blob = await response.blob();
        const file = new File([blob], "garfield.jpg", { 
            type: blob.type || "image/jpeg", 
            lastModified: Date.now() 
        });

        // Share the file
        await navigator.share({
            text: `Garfield comic for ${APP_STATE.formattedComicDate} - Shared from GarfieldApp`,
            url: 'https://garfieldapp.pages.dev',
            files: [file]
        });

        console.log("Comic shared successfully!");
    } catch (error) {
        console.error("Error sharing comic:", error);
        if (error.name !== 'AbortError') {
            alert("Failed to share the comic. Please try again.");
        }
    }
}

function Addfav() {
    const { year, month, day } = formatDate(APP_STATE.currentselectedDate);
    APP_STATE.formattedComicDate = `${year}/${month}/${day}`;
    
    let favs = JSON.parse(localStorage.getItem('favs')) || [];
    const favIndex = favs.indexOf(APP_STATE.formattedComicDate);
    
    if(favIndex === -1) {
        // Add to favorites
        favs.push(APP_STATE.formattedComicDate);
        document.getElementById("favheart").src = "./heart.svg";
        document.getElementById("showfavs").disabled = false;
    } else {
        // Remove from favorites
        favs.splice(favIndex, 1);
        document.getElementById("favheart").src = "./heartborder.svg";
        
        if(favs.length === 0) {
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

// Remove duplicate initialization listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the app
    console.log('Starting app initialization...');
    initializeApp();
});

function extractComicUrl(siteBody) {
    const extractionPatterns = [
        /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
        /https:\/\/assets\.amuniversal\.com\/[a-zA-Z0-9]+/i,
        /https:\/\/featureassets\.amuniversal\.com\/assets\/[a-zA-Z0-9]+/i,
        /<picture[^>]*class="[^"]*item-comic-image[^"]*"[^>]*>.*?<img[^>]*src="([^"]+)".*?<\/picture>/is
    ];

    for (const pattern of extractionPatterns) {
        const match = siteBody.match(pattern);
        if (match) {
            const url = match[1] || match[0];
            if (!url.includes('favicon') && !url.includes('logo')) {
                return url.startsWith('//') ? 'https:' + url : url;
            }
        }
    }
    return null;
}

