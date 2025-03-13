//garfieldapp.pages.dev

if("serviceWorker" in navigator) {
	navigator.serviceWorker.register("./serviceworker.js");
}

// Set the global variable for favourite to track
let favs=[];

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
	if(favs.indexOf(formattedComicDate)==-1)
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

function showComic()
{
	formatDate(currentselectedDate);
	formattedDate = year + "-" + month + "-" + day;
	formattedComicDate = year + "/" + month + "/" + day;
	document.getElementById('DatePicker').value = formattedDate;
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
		// console.log('showcomic',formattedComicDate, favs);
		if(favs.indexOf(formattedComicDate) == -1)
		{
			document.getElementById("favheart").src="./heartborder.svg";
		}	
		else
		{
			document.getElementById("favheart").src="./heart.svg";
		}
    });
};

function changeComicImage(newSrc) {
    const comic = document.getElementById('comic');
    comic.classList.add('dissolve');
    setTimeout(() => {
        comic.src = newSrc;
        comic.classList.remove('dissolve');
        
        // Check comic orientation when it loads
        comic.onload = function() {
            checkComicOrientation(comic);
        };
    }, 500); // Match the duration of the CSS transition
}

function checkComicOrientation(comicElement) {
    // If it's a vertical comic (height > width)
    if (comicElement.naturalHeight > comicElement.naturalWidth) {
        comicElement.classList.remove('normal');
        comicElement.classList.add('vertical');
    } else {
        // Horizontal comic
        comicElement.classList.remove('vertical');
        comicElement.classList.add('normal');
    }
}

function Rotate() {
	var element = document.getElementById('comic');
	var contentElements = document.querySelectorAll('.buttongrid, .logo, div[style*="z-index: -1"], #settingsDIV, button[style*="position: fixed"]');
	
	if (element.classList.contains('fullscreen')) {
		// Exit fullscreen mode
		exitFullscreenMode(element, contentElements);
	} else {
		// Enter fullscreen mode
		enterFullscreenMode(element, contentElements);
	}
}

function enterFullscreenMode(element, contentElements) {
	// Store settings visibility state before hiding
	const settingsDiv = document.getElementById("settingsDIV");
	element.dataset.settingsVisible = settingsDiv ? settingsDiv.style.display : 'none';
	
	// Hide UI elements
	contentElements.forEach(el => el.style.display = 'none');
	
	// Remember original class to restore later
	element.dataset.originalClass = element.className;
	
	// Add fullscreen class
	element.classList.add('fullscreen');
	
	if (element.naturalHeight > element.naturalWidth) {
		element.classList.add('vertical-fullscreen');
		element.classList.remove('normal', 'vertical', 'rotate');
	} else {
		if (window.innerWidth < window.innerHeight) {
			// On portrait screens, rotate horizontal comics
			element.classList.add('rotate-fullscreen');
			element.classList.remove('normal', 'vertical', 'rotate');
		} else {
			// On landscape screens, don't rotate
			element.classList.add('horizontal-fullscreen');
			element.classList.remove('normal', 'vertical', 'rotate');
		}
	}
	
	document.body.classList.add('comic-fullscreen');
}

function exitFullscreenMode(element, contentElements) {
	// Show UI elements except settings which should restore to previous state
	contentElements.forEach(el => {
		if (el.id === "settingsDIV") {
			// Restore previous visibility state
			el.style.display = element.dataset.settingsVisible || 'none';
		} else {
			el.style.display = '';
		}
	});
	
	// Restore original class
	if (element.dataset.originalClass) {
		element.className = element.dataset.originalClass;
	} else {
		element.className = 'normal';
	}
	
	element.classList.remove('fullscreen', 'vertical-fullscreen', 'horizontal-fullscreen', 'rotate-fullscreen');
	document.body.classList.remove('comic-fullscreen');
}

function HideSettings()
{
var x = document.getElementById("settingsDIV");
	if (x.style.display === "none") {
	  x.style.display = "block";
	  localStorage.setItem('settings', "true");
	} else {
	  x.style.display = "none";
	  localStorage.setItem('settings', "false");
	}
}

function onLoad()
{
previousclicked = false;
previousUrl = "";
var favs = JSON.parse(localStorage.getItem('favs'));
if(favs == null)
{
	favs = [];
}
if(document.getElementById("showfavs").checked) {
	currentselectedDate = new Date(favs[0]);
	if(favs.length === 0)
	{
		document.getElementById("showfavs").checked = false;
		document.getElementById("showfavs").disabled = true;
		currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
	}
}
else
{
	if(favs.length === 0)
	{
		document.getElementById("showfavs").checked = false;
		document.getElementById("showfavs").disabled = true;
		currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
	}
	currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
	document.getElementById("Next").disabled = true;
	document.getElementById("Today").disabled = true;
}
formatDate(new Date());
today = year + '-' + month + '-' + day;
document.getElementById("DatePicker").setAttribute("max", today);

if(document.getElementById("lastdate").checked)   
{
	if(localStorage.getItem('lastcomic') !== null)
	{
		currentselectedDate = new Date(localStorage.getItem('lastcomic'));
	}
}
CompareDates();
showComic();
}

function PreviousClick() {
	if(document.getElementById("showfavs").checked) {
		if(favs.indexOf(formattedComicDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate)-1]);} }
	else{
		var f=0;
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
	previousclicked = true;
	CompareDates();
	showComic();
}

function NextClick() {
	if(document.getElementById("showfavs").checked) {
		if(favs.indexOf(formattedComicDate)<favs.length-1){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate)+1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
	CompareDates();
	showComic();
}

function FirstClick() {
	if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]);
		// currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	}
	else { currentselectedDate = new Date(Date.UTC(1978, 5, 19,12));
	}
	CompareDates();
	showComic();
}

function CurrentClick() {
	if(document.getElementById("showfavs").checked)
	 {
		var favs = JSON.parse(localStorage.getItem('favs'));
		var f=0;
		favslength = favs.length-1;
		currentselectedDate = new Date(favs[favslength]);

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
		currentselectedDate = new Date(bt);
		//console.log(currentselectedDate);
	}
	else{
		var start = new Date("1978-06-19");
		if (typeof(bt) != 'undefined')
		{
			start = new Date(bt);
			getx = 0;
		}
		else
		{
			getx = favs.length;
			var end = new Date();
			// currentselectedDate = new Date(1374339200000);
			if (getx > 0)
			{
				currentselectedDate = new Date(start.getTime()+ Math.random() * (end.getTime()-start.getTime()));	
				if (currentselectedDate.getTime() < start.getTime() )
				{
					currentselectedDate = new Date(Date.UTC(1978, 5, 19, 12));
				}
			}
		}			
	}
	CompareDates();
	showComic();
}

function DateChange() {
	currentselectedDate = document.getElementById('DatePicker');
	currentselectedDate = new Date(currentselectedDate.value);
	CompareDates();
	showComic();
}

function CompareDates() {
	var favs = JSON.parse(localStorage.getItem('favs'));
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		startDate = new Date(favs[favs.indexOf(formattedComicDate)]);
		currentselectedDate.setHours(0,0,0,0);
		currentselectedDate = new Date(currentselectedDate);
	}
	else{	
		outputindex = document.getElementById("DatePicker").value;
		document.getElementById("DatePicker").disabled = false;
		startDate = new Date("1978/06/19");
		currentselectedDate.setHours(0,0,0,0);
		currentselectedDate = new Date(currentselectedDate);
	}
	startDate = startDate.setHours(0, 0, 0, 0);
	if(currentselectedDate.getTime() <= startDate.getTime()) {
		document.getElementById("Previous").disabled = true;
		document.getElementById("First").disabled = true;
		formatDate(startDate);
		startDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		document.getElementById("Previous").disabled = false;	
	}
	if(favs.indexOf(formattedComicDate)>-1) {	
		document.getElementById("Next").disabled = true;	
	}
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
		RandomClick();
	}
})

document.addEventListener('swiped-right', function(e) {
	if(document.getElementById("swipe").checked) {
		PreviousClick();
	}
})

document.addEventListener('swiped-left', function(e) {
	if(document.getElementById("swipe").checked) {
		NextClick();
	}
})

document.addEventListener('swiped-up', function(e) {
	if(document.getElementById("swipe").checked) {
		CurrentClick();
	}
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

getStatus = localStorage.getItem('stat');
if (getStatus == "true")
{
	document.getElementById("swipe").checked = true;
	document.getElementById("swipe").addEventListener("change", function(evt) {
		// No options to compare
		return favs.length == 0;
	});

}
else
{
	document.getElementById("swipe").checked = false;
}

getStatus = localStorage.getItem('lastcomic');
if (getStatus == "true")
{
	document.getElementById("lastcomic").checked = true;
}
	else
{
	document.getElementById("lastcomic").checked = false;
}


getStatus = localStorage.getItem('settings');
if (getStatus == "true")
{
	document.getElementById("settings").checked = true;
}
else
{
	document.getElementById("settings").checked = false;
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
  installButton.style.position = 'fixed';
  installButton.style.bottom = '10px';
  installButton.style.right = '10px';
  installButton.style.zIndex = '1000';
  installButton.style.margin = '0';
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

