import { getAuthenticatedComic } from './comicExtractor.js';

//garfieldapp.pages.dev

// Translation dictionaries
const translations = {
    en: {
        previous: 'Previous',
        random: 'Random',
        next: 'Next',
        first: 'First',
        today: 'Today',
        last: 'Last',
        swipeEnabled: 'Swipe enabled',
        showFavorites: 'Show only my favorites',
        rememberComic: 'Remember last comic on exit/refresh',
        spanish: 'Spanish / Español',
        loadingComic: 'Loading comic...',
        settings: 'Settings',
        favorites: 'Add to favorites',
        share: 'Share',
        selectDate: 'Select comic date',
        installApp: 'Install App',
        supportApp: 'Support this App'
    },
    es: {
        previous: 'Anterior',
        random: 'Aleatorio',
        next: 'Siguiente',
        first: 'Primero',
        today: 'Hoy',
        last: 'Último',
        swipeEnabled: 'Deslizar habilitado',
        showFavorites: 'Mostrar solo mis favoritos',
        rememberComic: 'Recordar último cómic al salir/actualizar',
        spanish: 'Spanish / Español',
        loadingComic: 'Cargando cómic...',
        settings: 'Configuración',
        favorites: 'Agregar a favoritos',
        share: 'Compartir',
        selectDate: 'Seleccionar fecha del cómic',
        installApp: 'Instalar App',
        supportApp: 'Apoyar esta App'
    }
};

// Function to translate the interface
function translateInterface(lang) {
    const t = translations[lang] || translations.en;
    
    // Translate buttons
    document.getElementById('Previous').textContent = t.previous;
    document.getElementById('Random').textContent = t.random;
    document.getElementById('Next').textContent = t.next;
    document.getElementById('First').textContent = t.first;
    
    // Handle Today/Last button
    const todayBtn = document.getElementById('Today');
    const showFavs = document.getElementById('showfavs');
    if (showFavs && showFavs.checked) {
        todayBtn.textContent = t.last;
    } else {
        todayBtn.textContent = t.today;
    }
    
    // Translate labels
    const labels = {
        'swipe': t.swipeEnabled,
        'showfavs': t.showFavorites,
        'lastdate': t.rememberComic,
        'spanish': t.spanish
    };
    
    for (const [id, text] of Object.entries(labels)) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) label.textContent = text;
    }
    
    // Translate date picker
    const datePicker = document.getElementById('DatePicker');
    if (datePicker) {
        datePicker.title = t.selectDate;
        datePicker.setAttribute('aria-label', t.selectDate);
    }
    
    // Translate install and support buttons
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.textContent = t.installApp;
        installBtn.setAttribute('aria-label', t.installApp);
    }
    
    // Update Ko-fi button text
    const kofiBtn = document.querySelector('.kofi-button');
    if (kofiBtn) {
        kofiBtn.textContent = t.supportApp;
    }
    
    // Translate comic alt text
    const comic = document.getElementById('comic');
    if (comic && comic.alt === 'Loading comic...') {
        comic.alt = t.loadingComic;
    }
}

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

window.Share = Share;

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
        document.querySelector("#favheart img").src="./heart.svg";
        document.getElementById("showfavs").disabled = false;
    }
    else
    {
        favs.splice(favs.indexOf(formattedComicDate), 1);
        document.querySelector("#favheart img").src="./heartborder.svg";
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

window.Addfav = Addfav;

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

window.HideSettings = HideSettings;

function Rotate() {
    const comic = document.getElementById('comic');
    if (comic.classList.contains('rotate')) {
        comic.classList.remove('rotate');
        comic.classList.add('normal');
        document.body.classList.remove('rotated-state');
        isRotatedMode = false;
    } else {
        comic.classList.remove('normal');
        comic.classList.add('rotate');
        document.body.classList.add('rotated-state');
        isRotatedMode = true;
    }
}

window.Rotate = Rotate;

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

async function loadComic(date) {
    try {
        // Check if Spanish is enabled
        const useSpanish = document.getElementById("spanish")?.checked || false;
        const language = useSpanish ? 'es' : 'en';
        
        // Try GoComics with authentication and language
        const result = await getAuthenticatedComic(date, language);
        
        if (result.success && result.imageUrl) {
            const comicImg = document.getElementById('comic');
            comicImg.src = result.imageUrl;
            comicImg.style.display = 'block';
            
            // Store the image URL for sharing
            window.pictureUrl = result.imageUrl;
            previousUrl = result.imageUrl;
            
            // Hide any error messages
            const messageContainer = document.getElementById('comic-message');
            if (messageContainer) {
                messageContainer.style.display = 'none';
            }
            return true;
        }
        
        // Handle paywall
        if (result.isPaywalled) {
            showPaywallMessage();
            return false;
        }
        
        throw new Error('Comic not available from any source');
    } catch (error) {
        console.error('Failed to load comic:', error);
        showErrorMessage('Failed to load comic. Please try again.');
        return false;
    }
}

function showPaywallMessage() {
    const comicContainer = document.getElementById('comic-container');
    const comic = document.getElementById('comic');
    
    // Hide the comic image
    comic.style.display = 'none';
    
    // Create or update message container
    let messageContainer = document.getElementById('comic-message');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'comic-message';
        messageContainer.className = 'paywall-message';
        comicContainer.appendChild(messageContainer);
    }
    
    messageContainer.style.display = 'flex';
    
    // Calculate if this is an older comic
    const comicDate = currentselectedDate;
    const today = new Date();
    const daysDiff = Math.floor((today - comicDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 30) {
        // Older comics are paywalled
        messageContainer.innerHTML = `
            <p><strong>Unable to load this archive comic</strong></p>
            <p>This comic is from ${daysDiff} day${daysDiff !== 1 ? 's' : ''} ago. GoComics normally requires a paid subscription to access comics older than 30 days.</p>
            <p>Try viewing more recent comics (last 30 days), which are free!</p>
        `;
    } else {
        // Recent comics should be free - something else went wrong
        messageContainer.innerHTML = `
            <p><strong>Unable to load this comic</strong></p>
            <p>This recent comic should normally be free, but we're having trouble loading it.</p>
            <p>Please try again later or try a different date.</p>
        `;
    }
}

function showErrorMessage(message) {
    const comicContainer = document.getElementById('comic-container');
    const comic = document.getElementById('comic');
    
    comic.style.display = 'none';
    
    let messageContainer = document.getElementById('comic-message');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'comic-message';
        messageContainer.className = 'error-message';
        comicContainer.appendChild(messageContainer);
    }
    
    messageContainer.style.display = 'flex';
    
    // Check if we're on localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        messageContainer.innerHTML = `
            <p><strong>Local Testing Mode</strong></p>
            <p>The CORS proxies are currently not accessible from localhost. This is normal during local development.</p>
            <p><strong>Your authentication system is ready!</strong></p>
            <ul style="text-align: left; max-width: 500px;">
                <li>✓ Login/logout functionality implemented</li>
                <li>✓ Paywall detection in place</li>
                <li>✓ Age-based comic access logic (recent = free, archive = paywalled)</li>
                <li>✓ Multiple CORS proxy fallback system</li>
            </ul>
            <p>When deployed to <strong>garfieldapp.pages.dev</strong>, the app will work properly with your Cloudflare Worker proxy.</p>
            <p>Try committing and pushing your changes to test on the live site!</p>
        `;
    } else {
        messageContainer.innerHTML = `
            <p><strong>Unable to Load Comic</strong></p>
            <p>${message}</p>
            <p>Please try again later or select a different date.</p>
        `;
    }
}

window.onLoad = function() {
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
    let today = `${year}-${month}-${day}`;
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

window.DateChange = DateChange;

// Add this to update the display when showing a comic
async function showComic() {
    formatDate(currentselectedDate);
    formattedComicDate = year + "/" + month + "/" + day;
    formattedDate = year + "-" + month + "-" + day;
    
    document.getElementById("DatePicker").value = formattedDate;
    updateDateDisplay();
    
    // Check if date is in favorites
    var favs = JSON.parse(localStorage.getItem('favs'));
    if(favs && favs.indexOf(formattedComicDate) !== -1) {
        document.querySelector("#favheart img").src = "./heart.svg";
    } else {
        document.querySelector("#favheart img").src = "./heartborder.svg";
    }
    
    // Save last viewed comic
    if(document.getElementById("lastdate").checked) {
        localStorage.setItem('lastcomic', currentselectedDate);
    }
    
    // Load the comic
    await loadComic(currentselectedDate);
}

function PreviousClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) - 1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
	previousclicked = true;
	CompareDates();
	showComic();
}

window.PreviousClick = PreviousClick;

function NextClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) < favs.length - 1){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) + 1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
	CompareDates();
	showComic();
}

window.NextClick = NextClick;

function FirstClick() {
	if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	else{
		// Spanish comics start on December 6, 1999; English comics start on June 19, 1978
		const isSpanish = document.getElementById('spanish').checked;
		currentselectedDate = isSpanish ? new Date(Date.UTC(1999, 11, 6, 12)) : new Date(Date.UTC(1978, 5, 19, 12));
	}
	CompareDates();
	showComic();
}

window.FirstClick = FirstClick;

function CurrentClick() {
	if(document.getElementById("showfavs").checked)
	 {
		var favs = JSON.parse(localStorage.getItem('favs'));
		let favslength = favs.length - 1;
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[favslength]);
	 }
	else
	{
	currentselectedDate = new Date();
	}
	CompareDates();
	showComic();
}

window.CurrentClick = CurrentClick;


function RandomClick()
{
	if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]);}
	else{
		// Spanish comics start on December 6, 1999; English comics start on June 19, 1978
		const isSpanish = document.getElementById('spanish').checked;
		let start = isSpanish ? new Date("1999-12-06") : new Date("1978-06-19");
		let end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}
	CompareDates();
	showComic();
}

window.RandomClick = RandomClick;

function CompareDates() {
	var favs = JSON.parse(localStorage.getItem('favs'));
	let startDate;
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		startDate = new Date(favs[0])}
	else{	
		document.getElementById("DatePicker").disabled = false;
		// Spanish comics start on December 6, 1999; English comics start on June 19, 1978
		const isSpanish = document.getElementById('spanish').checked;
		startDate = isSpanish ? new Date("1999/12/06") : new Date("1978/06/19");
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
	let endDate;
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
		} }
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
		RandomClick() }
})

document.addEventListener('swiped-right', function(e) {
	if(document.getElementById("swipe").checked) {
		PreviousClick() }
})


document.addEventListener('swiped-left', function(e) {
	if(document.getElementById("swipe").checked) {
		NextClick() }
})

document.addEventListener('swiped-up', function(e) {
	if(document.getElementById("swipe").checked) {
		CurrentClick() }
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
		const currentLang = document.getElementById('spanish').checked ? 'es' : 'en';
		document.getElementById('Today').innerHTML = translations[currentLang].last;
	} 
	else
	{
		localStorage.setItem('showfavs', "false");
		const currentLang = document.getElementById('spanish').checked ? 'es' : 'en';
		document.getElementById('Today').innerHTML = translations[currentLang].today;
	}
	CompareDates();
	showComic();
}

setStatus = document.getElementById('spanish');
if (setStatus) {
	setStatus.onclick = function()
	{
		const isSpanish = document.getElementById('spanish').checked;
		const datePicker = document.getElementById('DatePicker');
		
		if(isSpanish)
		{
			localStorage.setItem('spanish', "true");
			translateInterface('es');
			document.documentElement.lang = 'es';
			// Update date picker min to Spanish comics start date
			if (datePicker) datePicker.min = "1999-12-06";
			
			// Check if current comic date is before Spanish comics start date
			const spanishStartDate = new Date('1999-12-06');
			if (currentselectedDate < spanishStartDate) {
				// Switch to today's comic
				currentselectedDate = new Date();
			}
		}
		else
		{
			localStorage.setItem('spanish', "false");
			translateInterface('en');
			document.documentElement.lang = 'en';
			// Update date picker min to English comics start date
			if (datePicker) datePicker.min = "1978-06-19";
		}
		// Reload the current comic in the selected language
		showComic();
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
    document.body.classList.add('rotated-state');
    
    // Clear container background so comic stands alone
    container.style.background = 'none';
    container.style.backgroundSize = '';
    
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
    document.body.classList.remove('rotated-state');
    
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

let getStatus = localStorage.getItem('stat');
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

getStatus = localStorage.getItem('spanish');
const datePicker = document.getElementById('DatePicker');

// Auto-detect Spanish language on first visit
if (getStatus === null) {
	// Check browser/OS language
	const userLang = navigator.language || navigator.userLanguage;
	const isSpanishLocale = userLang.startsWith('es');
	
	if (isSpanishLocale) {
		document.getElementById("spanish").checked = true;
		localStorage.setItem('spanish', "true");
		translateInterface('es');
		if (datePicker) datePicker.min = "1999-12-06";
	} else {
		document.getElementById("spanish").checked = false;
		localStorage.setItem('spanish', "false");
		translateInterface('en');
		if (datePicker) datePicker.min = "1978-06-19";
	}
}
else if (getStatus == "true")
{
	document.getElementById("spanish").checked = true;
	translateInterface('es');
	// Set date picker min to Spanish comics start date
	if (datePicker) datePicker.min = "1999-12-06";
}
else
{
	document.getElementById("spanish").checked = false;
	translateInterface('en');
	// Set date picker min to English comics start date
	if (datePicker) datePicker.min = "1978-06-19";
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

// Check if app is already installed (standalone or window controls overlay)
const isInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                   window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                   window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Only show install button if not already installed
  if (!isInstalled) {
    showInstallButton();
  }
});

function showInstallButton() {
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.style.display = 'block';
    
    installBtn.onclick = async function() {
      if (!deferredPrompt) {
        return;
      }
      
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
        installBtn.style.display = 'none';
      } else {
        console.log('User dismissed the install prompt');
      }
      
      deferredPrompt = null;
    };
  }
}

// Add status handling
function setStatus(message) {
    const comic = document.getElementById('comic');
    if (comic) {
        comic.alt = message;
    }
}

// Create handler object
const handlers = {
    async onLoad() {
        try {
            if (document.getElementById('lastdate')?.checked) {
                const savedDate = localStorage.getItem('lastDate');
                if (savedDate) {
                    await loadComic(new Date(savedDate));
                    return;
                }
            }
            await CurrentClick();
        } catch (error) {
            setStatus('Failed to load comic');
            console.error(error);
        }
    }
};

export default handlers;
