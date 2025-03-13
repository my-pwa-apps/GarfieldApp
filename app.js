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
                // Create a new image object to check dimensions before setting the src
                const tempImg = new Image();
                tempImg.onload = function() {
                    const comic = document.getElementById('comic');
                    comic.src = pictureUrl;
                    
                    // Check if image is larger than screen and needs auto-resize
                    checkImageSize(comic);
                };
                tempImg.src = pictureUrl;
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
 * Check if the loaded image is too large for the screen and
 * enter fullscreen mode automatically if needed
 */
function checkImageSize(imgElement) {
    // Ensure the image has loaded and has dimensions
    if (!imgElement.complete || !imgElement.naturalWidth) {
        imgElement.onload = () => checkImageSize(imgElement);
        return;
    }
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get image natural dimensions
    const imgWidth = imgElement.naturalWidth;
    const imgHeight = imgElement.naturalHeight;
    
    // Calculate how much of the viewport the image fills
    const widthRatio = imgWidth / viewportWidth;
    const heightRatio = imgHeight / viewportHeight;
    
    // If image is larger than 90% of viewport in either dimension,
    // automatically enter immersive view
    if (widthRatio > 0.9 || heightRatio > 0.9) {
        // Only auto-rotate if we're not already in rotated mode
        if (imgElement.className === "normal") {
            Rotate();
        }
    }
}

/**
 * Toggle comic orientation (portrait/landscape)
 * Maximizes screen usage while maintaining aspect ratio
 * Creates an immersive reading experience on small screens
 */
function Rotate() {
    const element = document.getElementById('comic');
    
    if (element.className === "normal") {
        // First hide ALL interface elements before showing rotated view
        hideAllUIElements();
            
        // Now switch to rotated view after hiding elements
        element.className = "rotate";
        
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
        
        // Show all UI elements again
        showAllUIElements();
        
        // Remove instruction
        const instruction = document.getElementById('rotate-instruction');
        if (instruction) {
            instruction.parentNode.removeChild(instruction);
        }
        
        // Re-enable scrolling
        document.body.style.overflow = 'auto';
    }
}

/**
 * Hide all UI elements for immersive comic viewing
 */
function hideAllUIElements() {
    // Hide navigation and UI elements
    const elementsToHide = [
        '.action-buttons-container',
        '.support-container',
        '.bottom-app-bar',
        'header',
        '#settingsDIV',
        '.install-button'
    ];
    
    elementsToHide.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.style.visibility = "hidden";
    });
}

/**
 * Show all UI elements when exiting immersive comic viewing
 */
function showAllUIElements() {
    // Show navigation and UI elements
    const elementsToShow = [
        '.action-buttons-container',
        '.support-container',
        '.bottom-app-bar',
        'header',
        '#settingsDIV',
        '.install-button'
    ];
    
    elementsToShow.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.style.visibility = "visible";
    });
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

