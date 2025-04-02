// Convert to module and add exports
export async function onLoad() {
    if (document.getElementById('lastdate')?.checked) {
        const savedDate = localStorage.getItem('lastDate');
        if (savedDate) {
            await loadComicForDate(new Date(savedDate));
            return;
        }
    }
    await CurrentClick();
}

export async function PreviousClick() {
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

export async function NextClick() {
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

export async function RandomClick() {
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

export async function FirstClick() {
    if(document.getElementById("showfavs").checked) {
        var favs = JSON.parse(localStorage.getItem('favs'));
        currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);
    } else {
        currentselectedDate = new Date(Date.UTC(1978, 5, 19, 12)); // First Garfield comic: June 19, 1978
    }
    CompareDates();
    showComic();
}

export async function CurrentClick() {
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

export async function DateChange() {
    currentselectedDate = document.getElementById('DatePicker');
    currentselectedDate = new Date(currentselectedDate.value);
    updateDateDisplay(); // Add this line to update the display
    CompareDates();
    showComic();
}

export function Rotate() {
    const comic = document.getElementById('comic');
    
    if (comic.className === "normal") {
        // Switch to rotated view
        applyRotatedView();
    } else {
        // Switch back to normal view
        exitRotatedView();
    }
}

export function HideSettings() {
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

export function Addfav() {
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

export function Share() 
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

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    onLoad().catch(console.error);
});

