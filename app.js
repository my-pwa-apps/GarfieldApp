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

async function Share() {
    if(navigator.share) {
        try {
            // Use the already loaded comic image in the DOM
            const comic = document.getElementById('comic');
            
            if (!comic.complete || comic.naturalHeight === 0) {
                alert("Please wait for the comic to load completely.");
                return;
            }
            
            console.log("Starting share process using loaded comic...");
            
            // Since the comic image is already loaded with CORS restrictions,
            // we need to draw it onto a new canvas and create a shareable blob
            const canvas = document.createElement('canvas');
            canvas.width = comic.naturalWidth;
            canvas.height = comic.naturalHeight;
            const ctx = canvas.getContext('2d');
            
            // Get the image source URL first to check if it uses our CORS proxy
            const imgSrc = comic.src;
            const shareText = `Garfield comic for ${formattedComicDate}`;
            
            // Try to draw the image and create a blob for sharing
            try {
                // Draw the image on the canvas
                ctx.drawImage(comic, 0, 0);
                
                // Try to export the canvas to a blob
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error("Failed to create blob"));
                    }, 'image/jpeg', 0.95);
                    
                    setTimeout(() => reject(new Error("Blob creation timeout")), 3000);
                });
                
                // Create a file for sharing
                const file = new File([blob], "garfield.jpg", { 
                    type: "image/jpeg", 
                    lastModified: Date.now() 
                });
                
                // Share with the image
                await navigator.share({
                    text: shareText + " - Shared from GarfieldApp",
                    url: 'https://garfieldapp.pages.dev',
                    files: [file]
                });
                
                console.log("Comic shared successfully with image!");
            } catch (canvasError) {
                // If we get a security error, the canvas is tainted due to CORS
                console.error("Canvas security error:", canvasError);
                
                // Fallback to text-only sharing
                console.log("Falling back to text-only sharing");
                await navigator.share({
                    text: shareText + " - Shared from GarfieldApp",
                    url: 'https://garfieldapp.pages.dev'
                });
                
                console.log("Comic shared successfully with text!");
            }
        } catch (error) {
            console.error("Error sharing comic:", error);
            
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

function onLoad() {
    var favs = JSON.parse(localStorage.getItem('favs')) || [];

    // Set minimum body height at load time to prevent gradient shift
    document.body.style.minHeight = "100vh";

    // Set proper body overflow to prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

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
    
    // Define multiple CORS proxies to try in sequence - put garfieldapp.workers.dev first
    const corsProxies = [
        url => `https://corsproxy.garfieldapp.workers.dev/?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];
    
    const originalUrl = `https://www.gocomics.com/garfield/${formattedComicDate}`;
    let currentProxyIndex = 0;
    
    function tryNextProxy() {
        if (currentProxyIndex >= corsProxies.length) {
            comic.alt = "Failed to load comic. Please try again later.";
            return;
        }
        
        const proxyUrl = corsProxies[currentProxyIndex](originalUrl);
        console.log(`Trying CORS proxy ${currentProxyIndex + 1}/${corsProxies.length}: ${proxyUrl}`);
        
        fetch(proxyUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                siteBody = text;
                
                // Try multiple extraction methods in order of reliability
                const extractionMethods = [
                    // Method 1: Look for picture element with comic image
                    () => {
                        const match = siteBody.match(/<picture.*?class="[^"]*?item-comic-image[^"]*?".*?>.*?<img[^>]*?src="([^"]+?\.(?:gif|jpg|jpeg|png)[^"]*?)"[^>]*>/i);
                        return match ? match[1] : null;
                    },
                    // Method 2: Look for assets.amuniversal.com URL pattern
                    () => {
                        const match = siteBody.match(/https:\/\/assets\.amuniversal\.com\/[a-zA-Z0-9]+/i);
                        return match ? match[0] : null;
                    },
                    // Method 3: Look for og:image metadata
                    () => {
                        const match = siteBody.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
                        return match ? match[1] : null;
                    },
                    // Method 4: Look for any image with asset in URL
                    () => {
                        const match = siteBody.match(/<img[^>]+src="([^"]+?asset[^"]+?)"[^>]*>/i);
                        return match ? match[1] : null;
                    },
                    // Method 5: Last resort - construct URL based on date
                    () => {
                        return `https://assets.amuniversal.com/garfield_${year}${month}${day}`;
                    }
                ];
                
                // Try each extraction method in order
                let pictureUrl = null;
                for (let i = 0; i < extractionMethods.length; i++) {
                    const url = extractionMethods[i]();
                    if (url && !url.includes('favicon') && !url.includes('logo')) {
                        pictureUrl = url;
                        console.log(`Extraction method ${i+1} succeeded: ${pictureUrl}`);
                        break;
                    }
                }
                
                if (!pictureUrl) {
                    throw new Error("Could not extract comic image URL");
                }
                
                // Handle protocol-relative URLs
                if (pictureUrl.startsWith('//')) {
                    pictureUrl = 'https:' + pictureUrl;
                }
                
                // Use current proxy to load the actual image
                const imageUrl = corsProxies[currentProxyIndex](pictureUrl);
                window.pictureUrl = pictureUrl; // Store for Share function
                
                if (imageUrl !== previousUrl) {
                    changeComicImage(imageUrl);
                    
                    // Add image load error handler
                    const comicImg = document.getElementById('comic');
                    comicImg.onerror = function() {
                        console.error(`Failed to load image: ${imageUrl}`);
                        currentProxyIndex++;
                        setTimeout(tryNextProxy, 500);
                    };
                } else if (previousclicked) {
                    PreviousClick();
                }
                previousclicked = false;
                previousUrl = imageUrl;
                
                // Update favorites heart
                var favs = JSON.parse(localStorage.getItem('favs')) || [];
                document.getElementById("favheart").src = 
                    (favs.indexOf(formattedComicDate) === -1) ? "./heartborder.svg" : "./heart.svg";
            })
            .catch(error => {
                console.error(`Error with proxy ${currentProxyIndex + 1}:`, error);
                currentProxyIndex++;
                comic.alt = `Trying another source... (${currentProxyIndex + 1}/${corsProxies.length})`;
                setTimeout(tryNextProxy, 500);
            });
    }
    
    // Start the proxy chain
    tryNextProxy();
}

function PreviousClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) - 1]);}}
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
	previousclicked = true;
	CompareDates();
	showComic();
}

function NextClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) < favs.length - 1){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) + 1]);}}
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
	CompareDates();
	showComic();
}

function FirstClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	else{
	currentselectedDate = new Date(Date.UTC(1978, 5, 19,12));
	}
	CompareDates();
	showComic();
}

function CurrentClick() {
	if(document.getElementById("showfavs").checked)
	 {
		var favs = JSON.parse(localStorage.getItem('favs'));
		favslength = favs.length - 1;
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[favslength]);
	 }
	else
	{
	currentselectedDate = new Date();
	}
	CompareDates();
	showComic();
}


function RandomClick()
{
	if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]);}
	else{
		start = new Date("1978-06-19");
		end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}
	CompareDates();
	showComic();
}

function CompareDates() {
	var favs = JSON.parse(localStorage.getItem('favs'));
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		startDate = new Date(favs[0])}
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
		}}
	else {
		document.getElementById("Random").disabled = false;}
}

function formatDate(datetoFormat) {
	day = datetoFormat.getDate();
	month = datetoFormat.getMonth() + 1;
	year = datetoFormat.getFullYear();
	month = ("0" + month).slice(-2);
	day = ("0" + day).slice(-2);
}

document.addEventListener('swiped-down', function(e) {
	if(document.getElementById("swipe").checked) {
		RandomClick()}
})

document.addEventListener('swiped-right', function(e) {
	if(document.getElementById("swipe").checked) {
		PreviousClick()}
})


document.addEventListener('swiped-left', function(e) {
	if(document.getElementById("swipe").checked) {
		NextClick()}
})

document.addEventListener('swiped-up', function(e) {
	if(document.getElementById("swipe").checked) {
		CurrentClick()}
})

setStatus = document.getElementById('swipe');
setStatus.onclick = function()
{
	if(document.getElementById('swipe').checked)
	{
    	localStorage.setItem('stat', "true");
    }
	else
	{
            localStorage.setItem('stat', "false");
			CompareDates();
			showComic();
    }
}

setStatus = document.getElementById('lastdate');
setStatus.onclick = function()
{
	if(document.getElementById('lastdate').checked) 
	{
		localStorage.setItem('lastdate', "true");
	}
	else
	{
		localStorage.setItem('lastdate', "false");
	}
}

setStatus = document.getElementById('showfavs');
setStatus.onclick = function()
{
	var favs = JSON.parse(localStorage.getItem('favs'));
	if(document.getElementById('showfavs').checked)
	{
		localStorage.setItem('showfavs', "true");
		if(favs.indexOf(formattedComicDate) !== -1)
		{
		}
		else
		{
			currentselectedDate = new Date(favs[0]);	
		}
		document.getElementById('Today').innerHTML = 'Last'
	} 
	else
	{
		localStorage.setItem('showfavs', "false");
		document.getElementById('Today').innerHTML = 'Today'
	}
	CompareDates();
	showComic();
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

getStatus = localStorage.getItem('stat');
if (getStatus == "true")
{
	document.getElementById("swipe").checked = true;
}
else
{
	document.getElementById("swipe").checked = false;
}

getStatus = localStorage.getItem('showfavs');
if (getStatus == "true") 
{
	document.getElementById("showfavs").checked = true;
	document.getElementById('Today').innerHTML = 'Last'
}
else
{
	document.getElementById("showfavs").checked = false;
	document.getElementById('Today').innerHTML = 'Today'
}

getStatus = localStorage.getItem('lastdate');
if (getStatus == "true")
{
	document.getElementById("lastdate").checked = true;
}
else
{
	document.getElementById("lastdate").checked = false;
}	

getStatus = localStorage.getItem('settings');
if (getStatus == "true")
{
	document.getElementById("settingsDIV").style.display = "block";
}
else
{
	document.getElementById("settingsDIV").style.display = "none";
}

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
    installButton.className = 'button';
    
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
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(installButton);
    
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

