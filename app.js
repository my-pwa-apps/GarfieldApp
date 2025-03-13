//garfieldapp.pages.dev

// Register service worker for offline functionality
if("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./serviceworker.js");
}

// Global variables
let currentselectedDate;
let previousclicked = false;
let previousUrl = "";
let year, month, day;
let formattedComicDate;
let pictureUrl;

/**
 * Handle sharing comic via Web Share API
 */
async function Share() {
    if(navigator.share) {
        const comicurl = "https://corsproxy.garfieldapp.workers.dev/cors-proxy?" + pictureUrl + ".png";
        try {
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
            
            await navigator.share({
                url: 'https://garfieldapp.pages.dev',
                text: 'Shared from https://garfieldapp.pages.dev',
                files: [file]
            });
        } catch (error) {
            console.error("Error sharing comic:", error);
        }
    }
}

/**
 * Add or remove current comic from favorites
 */
function Addfav() {
    formattedComicDate = year + "/" + month + "/" + day;
    let favs = JSON.parse(localStorage.getItem('favs')) || [];
    
    if(favs.indexOf(formattedComicDate) === -1) {
        // Add to favorites
        favs.push(formattedComicDate);
        document.getElementById("favIcon").innerHTML = "favorite";
        document.getElementById("showfavs").disabled = false;
    } else {
        // Remove from favorites
        favs.splice(favs.indexOf(formattedComicDate), 1);
        document.getElementById("favIcon").innerHTML = "favorite_border";
        if(favs.length === 0) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
    }
    
    favs.sort();
    localStorage.setItem('favs', JSON.stringify(favs));
    CompareDates();
    showComic();
}

/**
 * Smoothly transition between comic images
 */
function changeComicImage(newSrc) {
    const comic = document.getElementById('comic');
    comic.classList.add('dissolve');
    setTimeout(() => {
        comic.src = newSrc;
        comic.classList.remove('dissolve');
    }, 500);
}

/**
 * Toggle settings panel visibility
 */
function HideSettings() {
    const settingsDiv = document.getElementById("settingsDIV");
    const isVisible = settingsDiv.style.display !== "none";
    
    if (isVisible) {
        // Hide settings with fade out animation
        settingsDiv.style.opacity = 0;
        setTimeout(() => {
            settingsDiv.style.display = "none";
        }, 200);
    } else {
        // Show settings with fade in animation
        settingsDiv.style.display = "block";
        settingsDiv.style.opacity = 0;
        setTimeout(() => {
            settingsDiv.style.opacity = 1;
        }, 10);
    }
    
    localStorage.setItem('settings', isVisible ? "false" : "true");
}

/**
 * Initialize the app on page load
 */
function onLoad() {
    previousclicked = false;
    previousUrl = "";
    
    // Get favorites from localStorage
    const favs = JSON.parse(localStorage.getItem('favs')) || [];
    
    // Handle date initialization
    if(document.getElementById("showfavs").checked && favs.length > 0) {
        currentselectedDate = new Date(favs[0]);
    } else {
        if(favs.length === 0) {
            document.getElementById("showfavs").checked = false;
            document.getElementById("showfavs").disabled = true;
        }
        currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
    }
    
    // Format today's date and set max date for the date picker
    formatDate(new Date());
    const today = year + '-' + month + '-' + day;
    document.getElementById("DatePicker").setAttribute("max", today);
    
    // Restore last viewed comic if setting is enabled
    if(document.getElementById("lastdate").checked && localStorage.getItem('lastcomic')) {
        currentselectedDate = new Date(localStorage.getItem('lastcomic'));
    }
    
    CompareDates();
    showComic();
}

/**
 * Navigate to the previous comic
 */
function PreviousClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs')) || [];
        const currentIndex = favs.indexOf(formattedComicDate);
        if(currentIndex > 0) {
            currentselectedDate = new Date(favs[currentIndex - 1]);
        }
    } else {
        currentselectedDate.setDate(currentselectedDate.getDate() - 1);
    }
    previousclicked = true;
    CompareDates();
    showComic();
}

/**
 * Navigate to the next comic
 */
function NextClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs')) || [];
        const currentIndex = favs.indexOf(formattedComicDate);
        if(currentIndex < favs.length - 1) {
            currentselectedDate = new Date(favs[currentIndex + 1]);
        }
    } else {
        currentselectedDate.setDate(currentselectedDate.getDate() + 1);
    }
    CompareDates();
    showComic();
}

/**
 * Navigate to the first comic
 */
function FirstClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs')) || [];
        currentselectedDate = new Date(favs[0]);
    } else {
        currentselectedDate = new Date(Date.UTC(1978, 5, 19, 12));
    }
    CompareDates();
    showComic();
}

/**
 * Navigate to the current/latest comic
 */
function CurrentClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs')) || [];
        currentselectedDate = new Date(favs[favs.length - 1]);
    } else {
        currentselectedDate = new Date();
    }
    CompareDates();
    showComic();
}

/**
 * Navigate to a random comic
 */
function RandomClick() {
    if(document.getElementById("showfavs").checked) {
        const favs = JSON.parse(localStorage.getItem('favs')) || [];
        currentselectedDate = new Date(favs[Math.floor(Math.random() * favs.length)]);
    } else {
        const start = new Date("1978-06-19");
        const end = new Date();
        currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }
    CompareDates();
    showComic();
}

/**
 * Handle date picker change
 */
function DateChange() {
    currentselectedDate = new Date(document.getElementById('DatePicker').value);
    CompareDates();
    showComic();
}

/**
 * Load and display the comic for the current date
 */
function showComic() {
    formatDate(currentselectedDate);
    formattedDate = year + "-" + month + "-" + day;
    formattedComicDate = year + "/" + month + "/" + day;
    
    document.getElementById('DatePicker').value = formattedDate;
    localStorage.setItem('lastcomic', currentselectedDate);
    
    const siteUrl = "https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://www.gocomics.com/garfield/" + formattedComicDate;
    
    fetch(siteUrl)
        .then(response => response.text())
        .then(text => {
            const siteBody = text;
            const picturePosition = siteBody.indexOf("https://assets.amuniversal.com");
            pictureUrl = siteBody.substring(picturePosition, picturePosition + 63);
            
            if(pictureUrl !== previousUrl) {
                changeComicImage(pictureUrl);
            } else if(previousclicked) {
                PreviousClick();
                return;
            }
            
            previousclicked = false;
            previousUrl = pictureUrl;
            
            // Update favorite icon state
            const favs = JSON.parse(localStorage.getItem('favs')) || [];
            document.getElementById("favIcon").innerHTML = 
                favs.indexOf(formattedComicDate) === -1 ? "favorite_border" : "favorite";
        })
        .catch(error => {
            console.error("Error loading comic:", error);
            // Handle error state - possibly show a fallback image
        });
}

/**
 * Check date ranges and update button states accordingly
 */
function CompareDates() {
    const favs = JSON.parse(localStorage.getItem('favs')) || [];
    let startDate, endDate;
    
    // Determine start date based on mode
    if(document.getElementById("showfavs").checked) {
        document.getElementById("DatePicker").disabled = true;
        startDate = new Date(favs[0]);
    } else {
        document.getElementById("DatePicker").disabled = false;
        startDate = new Date("1978/06/19");
    }
    
    // Normalize dates for comparison
    startDate.setHours(0, 0, 0, 0);
    currentselectedDate.setHours(0, 0, 0, 0);
    
    // Check if at first comic and update button states
    if(currentselectedDate.getTime() <= startDate.getTime()) {
        document.getElementById("Previous").disabled = true;
        document.getElementById("First").disabled = true;
        document.getElementById("Previous").classList.add('disabled');
        document.getElementById("First").classList.add('disabled');
        
        formatDate(startDate);
        startDate = year + '-' + month + '-' + day;
        currentselectedDate = new Date(Date.UTC(year, month-1, day, 12));
    } else {
        document.getElementById("Previous").disabled = false;
        document.getElementById("First").disabled = false;
        document.getElementById("Previous").classList.remove('disabled');
        document.getElementById("First").classList.remove('disabled');
    }
    
    // Determine end date based on mode
    endDate = document.getElementById("showfavs").checked ? 
        new Date(favs[favs.length - 1]) : new Date();
    endDate.setHours(0, 0, 0, 0);
    
    // Check if at latest comic and update button states
    if(currentselectedDate.getTime() >= endDate.getTime()) {
        document.getElementById("Next").disabled = true;
        document.getElementById("Today").disabled = true;
        document.getElementById("Next").classList.add('disabled');
        document.getElementById("Today").classList.add('disabled');
        
        formatDate(endDate);
        endDate = year + '-' + month + '-' + day;
        currentselectedDate = new Date(Date.UTC(year, month-1, day, 12));
    } else {
        document.getElementById("Next").disabled = false;
        document.getElementById("Today").disabled = false;
        document.getElementById("Next").classList.remove('disabled');
        document.getElementById("Today").classList.remove('disabled');
    }
    
    // Special case for favorites mode with only one favorite
    if(document.getElementById("showfavs").checked && favs.length === 1) {
        document.getElementById("Random").disabled = true;
        document.getElementById("Previous").disabled = true;
        document.getElementById("First").disabled = true;
        document.getElementById("Random").classList.add('disabled');
        document.getElementById("Previous").classList.add('disabled');
        document.getElementById("First").classList.add('disabled');
    } else {
        document.getElementById("Random").disabled = false;
        document.getElementById("Random").classList.remove('disabled');
    }
}

/**
 * Format a date into year, month, and day variables
 */
function formatDate(dateToFormat) {
    day = dateToFormat.getDate();
    month = dateToFormat.getMonth() + 1;
    year = dateToFormat.getFullYear();
    month = ("0" + month).slice(-2);
    day = ("0" + day).slice(-2);
}

/**
 * Toggle comic orientation (portrait/landscape)
 * Maximizes screen usage while maintaining aspect ratio
 * Creates an immersive reading experience on small screens
 */
function Rotate() {
    const element = document.getElementById('comic');
    const comicContainer = document.querySelector('.comic-container');
    const bottomAppBar = document.querySelector('.bottom-app-bar');
    const header = document.querySelector('header');
    
    if (element.className === "normal") {
        // Switching to rotated view - larger for better readability
        element.className = "rotate";
        
        // Hide interface elements to create immersive reading experience
        if (actionButtons = document.querySelector('.action-buttons-container'))
            actionButtons.style.visibility = "hidden";
            
        if (supportContainer = document.querySelector('.support-container'))
            supportContainer.style.visibility = "hidden";
            
        if (bottomAppBar)
            bottomAppBar.style.visibility = "hidden";
            
        if (header)
            header.style.visibility = "hidden";
        
        // Also hide the install button if present
        const installButton = document.querySelector('.install-button');
        if (installButton)
            installButton.style.visibility = "hidden";
        
        // Add tap instruction
        const instruction = document.createElement('div');
        instruction.id = 'rotate-instruction';
        instruction.textContent = 'Tap comic to exit fullscreen';
        instruction.style.position = 'fixed';
        instruction.style.bottom = '10px';
        instruction.style.left = '0';
        instruction.style.right = '0';
        instruction.style.textAlign = 'center';
        instruction.style.backgroundColor = 'rgba(0,0,0,0.5)';
        instruction.style.color = 'white';
        instruction.style.padding = '5px';
        instruction.style.fontSize = '14px';
        instruction.style.zIndex = '1000';
        document.body.appendChild(instruction);
        
        // Prevent scrolling
        document.body.style.overflow = 'hidden';
        
    } else {
        // Switching back to normal view
        element.className = "normal";
        
        // Show interface elements again
        if (actionButtons = document.querySelector('.action-buttons-container'))
            actionButtons.style.visibility = "visible";
            
        if (supportContainer = document.querySelector('.support-container'))
            supportContainer.style.visibility = "visible";
            
        if (bottomAppBar)
            bottomAppBar.style.visibility = "visible";
            
        if (header)
            header.style.visibility = "visible";
        
        // Also show the install button again if present
        const installButton = document.querySelector('.install-button');
        if (installButton)
            installButton.style.visibility = "visible";
        
        // Remove instruction
        const instruction = document.getElementById('rotate-instruction');
        if (instruction) {
            instruction.parentNode.removeChild(instruction);
        }
        
        // Re-enable scrolling
        document.body.style.overflow = 'auto';
    }
}

// Swipe event handlers
document.addEventListener('swiped-down', function(e) {
    if(document.getElementById("swipe").checked) {
        RandomClick();
    }
});

document.addEventListener('swiped-right', function(e) {
    if(document.getElementById("swipe").checked) {
        PreviousClick();
    }
});

document.addEventListener('swiped-left', function(e) {
    if(document.getElementById("swipe").checked) {
        NextClick();
    }
});

document.addEventListener('swiped-up', function(e) {
    if(document.getElementById("swipe").checked) {
        CurrentClick();
    }
});

// Settings handlers
document.getElementById('swipe').onclick = function() {
    localStorage.setItem('stat', this.checked ? "true" : "false");
    if(!this.checked) {
        CompareDates();
        showComic();
    }
};

document.getElementById('lastdate').onclick = function() {
    localStorage.setItem('lastdate', this.checked ? "true" : "false");
};

document.getElementById('showfavs').onclick = function() {
    const favs = JSON.parse(localStorage.getItem('favs')) || [];
    
    if(this.checked) {
        localStorage.setItem('showfavs', "true");
        if(favs.indexOf(formattedComicDate) === -1) {
            currentselectedDate = new Date(favs[0]);
        }
        
        const todayButton = document.getElementById('Today');
        if(todayButton.querySelector('.button-label')) {
            todayButton.querySelector('.button-label').innerHTML = 'Last';
        }
    } else {
        localStorage.setItem('showfavs', "false");
        const todayButton = document.getElementById('Today');
        if(todayButton.querySelector('.button-label')) {
            todayButton.querySelector('.button-label').innerHTML = 'Today';
        }
    }
    
    CompareDates();
    showComic();
};

// Initialize settings from localStorage
(function initializeSettings() {
    // Swipe setting
    document.getElementById("swipe").checked = 
        localStorage.getItem('stat') !== "false";
        
    // Show favorites setting
    const showFavs = localStorage.getItem('showfavs') === "true";
    document.getElementById("showfavs").checked = showFavs;
    
    const todayButton = document.getElementById('Today');
    if(todayButton.querySelector('.button-label')) {
        todayButton.querySelector('.button-label').innerHTML = showFavs ? 'Last' : 'Today';
    }
    
    // Remember last comic setting
    document.getElementById("lastdate").checked = 
        localStorage.getItem('lastdate') !== "false";
        
    // Settings panel visibility
    document.getElementById("settingsDIV").style.display = 
        localStorage.getItem('settings') === "true" ? "block" : "none";
})();

// PWA installation prompt handlers
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPromotion();
});

function showInstallPromotion() {
    const installButton = document.createElement('button');
    installButton.className = 'action-button install-button';
    installButton.style.position = 'fixed';
    installButton.style.bottom = '80px';
    installButton.style.right = '10px';
    installButton.style.width = 'auto';
    installButton.style.height = 'auto';
    installButton.style.padding = '8px 12px';
    installButton.style.borderRadius = '20px';
    installButton.style.display = 'flex';
    installButton.style.alignItems = 'center';
    installButton.style.gap = '4px';
    
    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.innerText = 'download';
    icon.style.color = '#eee239'; /* Yellow icon color */
    
    const text = document.createElement('span');
    text.innerText = 'Install App';
    text.style.fontSize = '14px';
    text.style.fontWeight = '500';
    text.style.color = '#eee239'; /* Yellow text color */
    
    installButton.appendChild(icon);
    installButton.appendChild(text);
    
    document.body.appendChild(installButton);

    installButton.addEventListener('click', () => {
        installButton.style.display = 'none';
        deferredPrompt.prompt();
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

