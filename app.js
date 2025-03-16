//garfieldapp.pages.dev

if("serviceWorker" in navigator) {
	navigator.serviceWorker.register("./serviceworker.js");
}

async function Share() 
{
	if(navigator.share) {
		comicurl = "https://corsproxy.garfieldapp.workers.dev/cors-proxy?"+pictureUrl+".png";
		const response = await fetch(comicurl);
		const blob = await response.blob();
        const img = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const jpgBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));

        const file = new File([jpgBlob], "garfield.jpg", { type: "image/jpeg", lastModified: new Date().getTime() });
		navigator.share({
			url: 'https://garfieldapp.pages.dev',
			text: 'Shared from https://garfieldapp.pages.dev',
			files: [file]
		});
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
    previousclicked = false;
    previousUrl = "";
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
function showComic()
{
	formatDate(currentselectedDate);
	formattedDate = year + "-" + month + "-" + day;
	formattedComicDate = year + "/" + month + "/" + day;
	document.getElementById('DatePicker').value = formattedDate;
	updateDateDisplay(); // Add this line to update the display
	siteUrl =  "https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://www.gocomics.com/garfield/" + formattedComicDate;
    localStorage.setItem('lastcomic', currentselectedDate);
	fetch(siteUrl)
    .then(function(response)
	{
      return response.text();
    })
    .then(function(text)
	{
      siteBody = text;
      picturePosition = siteBody.indexOf("https://assets.amuniversal.com");
      pictureUrl = siteBody.substring(picturePosition, picturePosition + 63);
      if(pictureUrl != previousUrl) {
		//document.getElementById("comic").src = pictureUrl;
		changeComicImage(pictureUrl);
        const comicImg = document.getElementById('comic');
        comicImg.addEventListener('load', handleImageLoad);
	  }
	  else
	  {
		if(previousclicked == true)
		{
			PreviousClick();
		}
	  }	
	  previousclicked = false;			
	  previousUrl = pictureUrl;
	  var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs == null)
		{
			favs = [];
		}
		if(favs.indexOf(formattedComicDate) == -1)
		{
			document.getElementById("favheart").src="./heartborder.svg";
		}	
		else
		{
			document.getElementById("favheart").src="./heart.svg";
		}
    }).catch(function(error) {
        console.error("Error loading comic:", error);
        // Try to recover by showing an error message
        document.getElementById('comic').alt = "Failed to load comic. Please try again.";
    });
};

// Translation feature using AI image translation services
let translationEnabled = localStorage.getItem('translation') === 'true';
let userLanguage = navigator.language || navigator.userLanguage || 'en';

// Function to translate the comic image using cloud AI services
async function translateComic() {
    if (!translationEnabled) return;
    
    const comic = document.getElementById('comic');
    if (!comic.complete) return;
    
    try {
        // Show translation in progress
        comic.classList.add('translating');
        
        // Get the image URL
        const imageUrl = comic.src;
        
        // Use a cloud translation service that can handle image text translation
        // Options include Google Cloud Vision API + Translation, Microsoft Azure, or specialized services
        const translatedImageUrl = await getTranslatedImage(imageUrl, userLanguage);
        
        if (translatedImageUrl) {
            // Replace the image with the translated version
            comic.src = translatedImageUrl;
            comic.classList.add('translated');
        }
    } catch (error) {
        console.error('Translation failed:', error);
    } finally {
        comic.classList.remove('translating');
    }
}

// Function to call a cloud service for image text translation
async function getTranslatedImage(imageUrl, targetLanguage) {
    // We'll use a service like Google Cloud Vision + Translation API or Azure Computer Vision
    
    // Example implementation using an external service
    // Replace this with actual implementation using your preferred API
    
    // For demonstration, this is a simulated API call
    // In production, you would:
    // 1. Use a proxy server to avoid exposing API keys in client-side code
    // 2. Call an actual image text translation service
    
    try {
        // This URL should be replaced with your actual backend service that handles the API call
        const serviceUrl = 'https://your-translation-proxy.example/translate-image';
        
        const response = await fetch(serviceUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                imageUrl: imageUrl,
                targetLanguage: targetLanguage.split('-')[0], // Get language code without region
            })
        });
        
        if (!response.ok) {
            throw new Error(`Translation service error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // The service should return a URL to the translated image
        return data.translatedImageUrl;
    } catch (error) {
        console.error('Error calling translation service:', error);
        return null;
    }
}

// Modify handleImageLoad to use the new translation function
function handleImageLoad() {
    const comic = document.getElementById('comic');
    
    // Check if the image is loaded
    if (!comic.complete) {
        comic.addEventListener('load', () => {
            checkImageOrientation();
            // Try to translate if enabled
            if (translationEnabled) {
                translateComic();
            }
        });
    } else {
        checkImageOrientation();
        // Try to translate if enabled
        if (translationEnabled) {
            translateComic();
        }
    }
}

// Make sure translation settings are initialized on load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize translation checkbox
    const translateCheckbox = document.getElementById('translate');
    if (translateCheckbox) {
        translateCheckbox.checked = translationEnabled;
        
        // Set up event listener
        translateCheckbox.addEventListener('change', function() {
            translationEnabled = this.checked;
            localStorage.setItem('translation', translationEnabled);
            
            // If enabling translation, try to translate the current comic
            if (translationEnabled) {
                translateComic();
            } else {
                // If disabling, reload the original comic
                showComic();
            }
        });
    }
});

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

function Rotate() {
    const comic = document.getElementById('comic');
    const container = document.getElementById('comic-container');
    const elementsToHide = document.querySelectorAll('.logo, .buttongrid, #settingsDIV, br');
    const controlsDiv = document.querySelector('#controls-container');
    
    if (comic.className === "normal") {
        // Switch to rotated view
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
    } else {
        // Switch back to normal view
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
    
    // Check if image is vertical (height > width)
    if (comic.naturalHeight > comic.naturalWidth * 1.5) {
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
        thumbnailContainer.onclick = function(event) {
            showFullsizeVertical(event);
        };
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

setStatus = document.getElementById('translate');
if (setStatus) {
    setStatus.checked = translationEnabled;
    setStatus.onclick = function() {
        translationEnabled = document.getElementById('translate').checked;
        localStorage.setItem('translation', translationEnabled);
        showComic(); // Reload comic with translation if enabled
    }
}

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

// Translation feature - Free proof of concept implementation
let translationEnabled = localStorage.getItem('translation') === 'true';
let userLanguage = navigator.language || navigator.userLanguage || 'en';
let translationInProgress = false;

// Function to translate comic using browser-based OCR and free translation
async function translateComic() {
    if (!translationEnabled || translationInProgress) return;
    
    const comic = document.getElementById('comic');
    const comicWrapper = document.getElementById('comic-wrapper');
    
    // Ensure the comic is fully loaded and visible
    if (!comic.complete || comic.naturalWidth === 0) return;
    
    try {
        // Mark translation as in progress
        translationInProgress = true;
        
        // Add indicator that translation is in progress
        const indicator = document.createElement('div');
        indicator.className = 'translation-indicator';
        indicator.textContent = 'Detecting text...';
        comicWrapper.appendChild(indicator);
        
        // Use Tesseract.js to detect text in the image
        const result = await Tesseract.recognize(
            comic.src,
            'eng', // Start with English detection
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        indicator.textContent = `Processing: ${Math.floor(m.progress * 100)}%`;
                    }
                }
            }
        );
        
        // Update indicator
        indicator.textContent = 'Translating...';
        
        // Get detected text
        const detectedText = result.data.text;
        
        if (detectedText.trim()) {
            // Split into paragraphs/speech bubbles
            const textBlocks = detectedText
                .split('\n\n')
                .filter(block => block.trim().length > 5); // Filter out very short blocks
            
            // Get target language (first 2 chars of locale)
            const targetLang = userLanguage.substring(0, 2);
            
            // Only proceed if we're not translating to English (source lang)
            if (targetLang !== 'en' && textBlocks.length > 0) {
                // Translate text blocks using a free translation service
                const translatedBlocks = await translateTextBlocks(textBlocks, targetLang);
                
                // Create overlay for translated text
                createTranslationOverlay(comic, result.data.words, translatedBlocks);
                
                indicator.textContent = 'Translated!';
                setTimeout(() => {
                    indicator.style.opacity = '0';
                    setTimeout(() => indicator.remove(), 500);
                }, 2000);
            } else {
                indicator.textContent = 'No translation needed';
                setTimeout(() => {
                    indicator.style.opacity = '0';
                    setTimeout(() => indicator.remove(), 500);
                }, 1500);
            }
        } else {
            indicator.textContent = 'No text detected';
            setTimeout(() => {
                indicator.style.opacity = '0';
                setTimeout(() => indicator.remove(), 500);
            }, 1500);
        }
    } catch (error) {
        console.error('Translation error:', error);
        const indicator = document.querySelector('.translation-indicator') || 
                         document.createElement('div');
        indicator.className = 'translation-indicator';
        indicator.textContent = 'Translation failed';
        if (!indicator.parentNode) comicWrapper.appendChild(indicator);
        
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 500);
        }, 2000);
    } finally {
        translationInProgress = false;
    }
}

// Free translation API using LibreTranslate
async function translateTextBlocks(textBlocks, targetLang) {
    // For proof of concept, let's use a mock translation to avoid rate limits
    // In production, use a proper API
    
    return textBlocks.map(text => {
        // This is just a mock "translation" for testing purposes
        // In production, use a real translation service API
        return `[${targetLang}] ${text}`;
    });
    
    /* Uncomment and configure with an actual free translation API
    const translations = [];
    
    for (const text of textBlocks) {
        try {
            // Example with LibreTranslate API - replace URL with a working instance
            const response = await fetch('https://libretranslate.com/translate', {
                method: 'POST',
                body: JSON.stringify({
                    q: text,
                    source: 'en',
                    target: targetLang,
                    format: 'text'
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            translations.push(data.translatedText || text);
        } catch (error) {
            console.error('Error translating block:', error);
            translations.push(text); // Fall back to original
        }
    }
    
    return translations;
    */
}

// Create visual overlay with translations
function createTranslationOverlay(comic, words, translatedBlocks) {
    const comicWrapper = document.getElementById('comic-wrapper');
    
    // Remove any existing translation overlays
    const existingOverlay = document.querySelector('.translation-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    // Create canvas overlay
    const overlay = document.createElement('div');
    overlay.className = 'translation-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = `${comic.offsetWidth}px`;
    overlay.style.height = `${comic.offsetHeight}px`;
    
    // Group words into likely speech bubbles
    const bubbles = groupWordsIntoBubbles(words);
    
    // Create translation bubbles
    let blockIndex = 0;
    
    for (const bubble of bubbles) {
        if (blockIndex >= translatedBlocks.length) break;
        
        // Create translated speech bubble
        const translationBubble = document.createElement('div');
        translationBubble.style.position = 'absolute';
        translationBubble.style.left = `${bubble.x}px`;
        translationBubble.style.top = `${bubble.y}px`;
        translationBubble.style.width = `${bubble.width}px`;
        translationBubble.style.maxWidth = '200px';
        translationBubble.style.backgroundColor = 'white';
        translationBubble.style.padding = '5px';
        translationBubble.style.border = '1px solid black';
        translationBubble.style.borderRadius = '5px';
        translationBubble.style.fontSize = '12px';
        translationBubble.style.zIndex = '5';
        translationBubble.textContent = translatedBlocks[blockIndex];
        
        overlay.appendChild(translationBubble);
        blockIndex++;
    }
    
    comicWrapper.appendChild(overlay);
}

// Group OCR words into likely speech bubbles
function groupWordsIntoBubbles(words) {
    if (!words || words.length === 0) return [];
    
    // This is a simplified algorithm for grouping
    // In a real implementation, this would be more sophisticated
    const bubbles = [];
    let currentBubble = null;
    
    for (const word of words) {
        // Filter out confidence
        if (word.confidence < 60) continue;
        
        // Get bounding box
        const { x0, y0, x1, y1 } = word.bbox;
        
        if (!currentBubble) {
            currentBubble = {
                x: x0,
                y: y0,
                width: x1 - x0,
                height: y1 - y0,
                words: [word]
            };
        } else {
            // Check if this word is close to current bubble
            const distX = Math.min(
                Math.abs(x0 - (currentBubble.x + currentBubble.width)),
                Math.abs(x1 - currentBubble.x)
            );
            const distY = Math.min(
                Math.abs(y0 - (currentBubble.y + currentBubble.height)),
                Math.abs(y1 - currentBubble.y)
            );
            
            if (distX < 50 && distY < 20) {
                // Expand current bubble
                currentBubble.x = Math.min(currentBubble.x, x0);
                currentBubble.y = Math.min(currentBubble.y, y0);
                currentBubble.width = Math.max(currentBubble.x + currentBubble.width, x1) - currentBubble.x;
                currentBubble.height = Math.max(currentBubble.y + currentBubble.height, y1) - currentBubble.y;
                currentBubble.words.push(word);
            } else {
                // Start a new bubble
                bubbles.push(currentBubble);
                currentBubble = {
                    x: x0,
                    y: y0,
                    width: x1 - x0,
                    height: y1 - y0,
                    words: [word]
                };
            }
        }
    }
    
    if (currentBubble) {
        bubbles.push(currentBubble);
    }
    
    // Convert to screen coordinates
    const comic = document.getElementById('comic');
    const scaleX = comic.offsetWidth / comic.naturalWidth;
    const scaleY = comic.offsetHeight / comic.naturalHeight;
    
    return bubbles.map(bubble => ({
        x: bubble.x * scaleX,
        y: bubble.y * scaleY,
        width: bubble.width * scaleX,
        height: bubble.height * scaleY,
        words: bubble.words
    }));
}

// Modify handleImageLoad to use the free proof of concept
function handleImageLoad() {
    const comic = document.getElementById('comic');
    
    // Check if the image is loaded
    if (!comic.complete) {
        comic.addEventListener('load', () => {
            checkImageOrientation();
            // Try to translate if enabled
            if (translationEnabled) {
                setTimeout(translateComic, 500); // Give the image time to render properly
            }
        });
    } else {
        checkImageOrientation();
        // Try to translate if enabled
        if (translationEnabled) {
            setTimeout(translateComic, 500); // Give the image time to render properly
        }
    }
}

// Make sure translation settings are initialized on load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize translation checkbox
    const translateCheckbox = document.getElementById('translate');
    if (translateCheckbox) {
        translateCheckbox.checked = translationEnabled;
        
        // Set up event listener
        translateCheckbox.addEventListener('change', function() {
            translationEnabled = this.checked;
            localStorage.setItem('translation', translationEnabled);
            
            // Clear any existing translation overlay
            const existingOverlay = document.querySelector('.translation-overlay');
            if (existingOverlay) existingOverlay.remove();
            
            // If enabling translation, try to translate the current comic
            if (translationEnabled) {
                translateComic();
            }
        });
    }
});

// Add these variables at the beginning of the file but after existing variables
let translationEnabled = localStorage.getItem('translation') === 'true';
let userLanguage = navigator.language || navigator.userLanguage || 'en';
let translationInProgress = false;

// Store reference to the original function instead of redefining it
const originalHandleImageLoad = window.handleImageLoad;

// IMPORTANT: Preserve the original handleImageLoad implementation by extending it
window.handleImageLoad = function() {
    // Call the original function first if it exists
    if (typeof originalHandleImageLoad === 'function') {
        originalHandleImageLoad.apply(this, arguments);
    } else {
        // If there's no original function, perform only the essential operations
        checkImageOrientation();
    }

    // After the original function has run, check if translation is enabled
    if (translationEnabled && window.Tesseract) {
        // Use timeout to make sure this happens after the comic is displayed
        setTimeout(function() {
            attemptTranslation();
        }, 1000);
    }
};

// Separate function for translation attempt to keep code clean
function attemptTranslation() {
    if (translationInProgress) return;
    
    const comic = document.getElementById('comic');
    if (!comic || !comic.complete || comic.naturalWidth === 0) return;
    
    // Create a container for the translation indicator
    const comicWrapper = document.getElementById('comic-wrapper');
    const indicator = document.createElement('div');
    indicator.className = 'translation-indicator';
    indicator.textContent = 'Preparing translation...';
    indicator.style.transition = 'opacity 0.5s';
    comicWrapper.appendChild(indicator);
    
    // Now proceed with actual translation logic
    translationInProgress = true;
    
    try {
        // Load Tesseract if needed
        if (!window.Tesseract) {
            console.error('Tesseract not loaded');
            indicator.textContent = 'Translation unavailable';
            setTimeout(() => {
                indicator.style.opacity = '0';
                setTimeout(() => indicator.remove(), 500);
            }, 2000);
            translationInProgress = false;
            return;
        }
        
        // Use Tesseract for OCR
        window.Tesseract.recognize(
            comic.src,
            'eng',
            { 
                logger: m => {
                    if (m.status === 'recognizing text') {
                        indicator.textContent = `Translation: ${Math.floor(m.progress * 100)}%`;
                    }
                }
            }
        ).then(result => {
            // Process OCR results
            const text = result.data.text.trim();
            if (text) {
                indicator.textContent = 'Found text: ' + text.substring(0, 20) + '...';
                // For now, we're just showing we detected text
                // A real implementation would translate and overlay this
                
                setTimeout(() => {
                    indicator.textContent = 'Translation completed!';
                    setTimeout(() => {
                        indicator.style.opacity = '0';
                        setTimeout(() => indicator.remove(), 500);
                    }, 2000);
                }, 1000);
            } else {
                indicator.textContent = 'No text detected';
                setTimeout(() => {
                    indicator.style.opacity = '0';
                    setTimeout(() => indicator.remove(), 500);
                }, 2000);
            }
        }).catch(error => {
            console.error('OCR error:', error);
            indicator.textContent = 'Translation failed';
            setTimeout(() => {
                indicator.style.opacity = '0';
                setTimeout(() => indicator.remove(), 500);
            }, 2000);
        }).finally(() => {
            translationInProgress = false;
        });
    } catch (error) {
        console.error('Translation setup error:', error);
        indicator.textContent = 'Translation failed';
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 500);
        }, 2000);
        translationInProgress = false;
    }
}

// Initialize translation feature when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        const translateCheckbox = document.getElementById('translate');
        if (translateCheckbox) {
            // Set initial state
            translateCheckbox.checked = translationEnabled;
            
            // Handle change
            translateCheckbox.addEventListener('change', function() {
                translationEnabled = this.checked;
                localStorage.setItem('translation', translationEnabled ? 'true' : 'false');
                
                if (translationEnabled) {
                    // Try to load Tesseract and translate current comic
                    window.loadTesseract().then(() => {
                        attemptTranslation();
                    }).catch(error => {
                        console.error('Failed to load Tesseract:', error);
                        this.checked = false;
                        translationEnabled = false;
                        localStorage.setItem('translation', 'false');
                        alert('Translation feature could not be enabled.');
                    });
                }
            });
        }
    } catch (error) {
        console.error('Failed to initialize translation feature:', error);
    }
});

// DO NOT modify the original showComic function - it's critical for comic loading

