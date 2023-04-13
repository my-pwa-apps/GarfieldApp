
//garfieldapp.tk, garfieldapp.pages.dev

//Garfield App

//Garfield App is a Progressive Web App that allows you to view Garfield comics from any date.

//This app is not affiliated with Garfield or Jim Davis.

//This app is not affiliated with GoComics.


//"use strict";

var timezoneissue = false;
var previousUrl = null;

var datepicker = document.getElementById("DatePicker");
var showfavorites = document.getElementById("showfavs");
var nextbutton = document.getElementById("Next");
var previousbutton = document.getElementById("Previous");
var firstbutton = document.getElementById("First");
var currentbutton = document.getElementById("Current");
var randombutton = document.getElementById("Random");
var comicpicture = document.getElementById("comic");
var swipetoggle = document.getElementById("swipe");

var currentselectedDate = new Date();

var favs = [];

if ("serviceWorker" in navigator)
{
	navigator.serviceWorker.register("./serviceworker.js");
}
	
function Share()
 {
	if (navigator.share) 
	{
		navigator.share
		(
			{
				title: "https://garfieldapp.tk",
				url: pictureUrl
				//files: [imgfile]
			}
		);
	}
}

// function OnLoad()
// {
// 	favs = getFavs();
// 	//favs = favs || [];
	
// 	if(showfavorites.checked)
// 	{
// 		currentselectedDate = favs.length !== 0 
// 		? new Date(favs[0]) 
// 		: datepicker.valueAsDate = new Date();
// 	}
// 	else
// 	{
// 		currentselectedDate = datepicker.valueAsDate = new Date();
// 	}

// 	nextbutton.disabled = !favs.length;
// 	currentbutton.disabled = !favs.length;
// 	today = currentselectedDate.toISOString().substr(0, 10);
// 	datepicker.setAttribute("max", today)
// 	CompareDates();
// 	showComic();
// }

function PreviousClick()
{
	timezoneissue = true;
	//const favs = getFavs();
	const favIndex = favs.indexOf(formattedComicDate);
	if (showfavorites.checked && favIndex > 0)
	{
		currentselectedDate = new Date(favs[favIndex - 1]);
	}
	else
	{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
   	DateFormat();
}

function NextClick()
{
	if(new Date(currentselectedDate).toLocaleDateString() == new Date(today).toLocaleDateString())
	{
	}
	else
	{
	const favs = getFavs();
		if (showfavorites.checked)
		{
	  		//favs = getFavs();
	  		let index = favs.indexOf(formattedComicDate);
	  		if (index < favs.length - 1)
			{
				currentselectedDate = new Date(favs[index + 1]);
	  		}
		}
		else
		{
	  		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
		}
		DateFormat();
	 }
}
  
function FirstClick() {
	const favs = getFavs();
	if(showfavorites.checked) {
	currentselectedDate = new Date(favs[0]);
	} else {
	currentselectedDate = new Date(Date.UTC(1978, 5, 19, 12));
	}
		DateFormat();
	}

function CurrentClick() {
	currentselectedDate = new Date();
	DateFormat();
}

function RandomClick() {
	const favs = getFavs();
	if (showfavorites.checked && favs.length)
	{
		currentselectedDate = new Date(favs[Math.floor(Math.random() * favs.length)]);
	}
	else
	{
		const start = new Date("1978-06-19");
		const end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.floor(Math.random() * (end.getTime() - start.getTime())));
	}
	DateFormat();
}

function DateChange()
{
	currentselectedDate = new Date(datepicker.value);
	CompareDates();
	showComic();
}

function showComic() {
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	formattedComicDate = formattedDate.split('-').join('/');
	datepicker.value = formattedDate;
  
	const siteUrl = `https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://www.gocomics.com/garfield/${formattedComicDate}`;
  	const favs = getFavs();
  
   	$(".favicon").css({"color": "black"})
     .removeClass(favs.includes(formattedComicDate) ? 'fa-star-o' : 'fa-star')
     .addClass(favs.includes(formattedComicDate) ? 'fa-star' : 'fa-star-o');

	fetch(siteUrl)
  	.then(response => response.text())
    .then(text => 
	{
    	const picturePosition = text.indexOf("https://assets.amuniversal.com");
      	pictureUrl = text.substring(picturePosition, picturePosition + 63);
      	if(pictureUrl != previousUrl )
	   	{
			comicpicture.src = pictureUrl;
		  	previousUrl = pictureUrl;
	   	}
	   	else
	   	{
			if(timezoneissue)
		   	{
				PreviousClick();
				timezoneissue = false;
		   	}
	   	}
	   
    }
	);
	// fetch(siteUrl)
	// .then(response => response.blob())
	// .then(blob => {
	// 	imgfile = new Image([blob]);
	// 	imgfile = new File([blob], "garfield.png", {type: "image/png", lastModified: Date.now()});
	// });
	//timezoneissue = false;
}

function CompareDates()
{
	var favs = getFavs();
	if(showfavorites.checked && favs.length !== 0) 
	{
		if(favs.includes(datepicker.value))
		{
		}
		else
		{	
		startDate = new Date(favs[0])
		}
	}
	else
	{	
		startDate = new Date("1978/06/19");
	}
	startDate = new Date(startDate.setHours(0, 0, 0, 0));
	currentselectedDate = new Date(currentselectedDate.setHours(0, 0, 0, 0));
	if(currentselectedDate.getTime() <= startDate.getTime())
	{
		previousbutton.disabled = true;
		firstbutton.disabled = true;
		startDate = startDate.toISOString().substr(0, 10);
	}
	else
	{
		previousbutton.disabled = false;
		firstbutton.disabled = false;
	}
	if(showfavorites.checked) 
	{
		endDate = new Date(favs[favs.length - 1]);
	}
	else
	{ 
		endDate = new Date();
	}
	endDate = new Date(endDate.setHours(0, 0, 0, 0));
	if(currentselectedDate.getTime() >= endDate.getTime())
	{
		nextbutton.disabled = true;
		currentbutton.disabled = true;
		endDate = endDate.toISOString().substr(0, 10);
	} 
	else
	{
		nextbutton.disabled = false;
		currentbutton.disabled = false;
	}
	if(showfavorites.checked) 
	{
		currentbutton.disabled = true;
		if(favs.length < 1)
		{
			randombutton.disabled = true;
			previousbutton.disabled = true;
			firstbutton.disabled = true;
			nextbutton.disabled = true;
		
		}
	}
	else
	{
		randombutton.disabled = false;
	}
}

function Rotate()
{
	var element = comicpicture;
	if(element.className === "normal")
	{
		element.className = "rotate";
	} 
	else if(element.className === "rotate")
	{
		element.className = "normal";
	}
}

document.addEventListener('swiped-down', function(e)
{
	if(document.getElementById("swipe").checked)
	{
		RandomClick()
	}
}
)

document.addEventListener('swiped-right', function(e) 
{
	if(document.getElementById("swipe").checked)
	{
		PreviousClick()
	}
}
)


document.addEventListener('swiped-left', function(e)
{
	if(document.getElementById("swipe").checked)
	{
		NextClick()
	}
}
)

document.addEventListener('swiped-up', function(e)
{
	if(document.getElementById("swipe").checked)
	{
		CurrentClick()
	}
}
)

setStatus = swipetoggle;
    setStatus.onclick = function()
	{
        if(swipetoggle.checked) 
		{
            localStorage.setItem('stat', "true");
        }
		else
		{
            localStorage.setItem('stat', "false");
		}
    }

setStatus = showfavorites;
favs = getFavs();
if(favs.length == 0)
{
}
else
{
	setStatus.onclick = function()
	{
    	if(showfavorites.checked)
		{
        	localStorage.setItem('showfavs', "true");
			if(favs.indexOf(formattedComicDate) == -1)
			{
			}
			else
			{
				currentselectedDate = new Date(favs[0]);	
			}
		}
		else
		{
    		localStorage.setItem('showfavs', "false");
		}
	}
}

function ClickShowFavs()
{
	CompareDates();
}

getStatus = localStorage.getItem('stat');
    if (getStatus == "true") 
	{
        swipetoggle.checked = true;
    }

	else
	{
        swipetoggle.checked = false;
    }

getStatus = localStorage.getItem('showfavs');
    if (getStatus == "true") 
	{
        showfavorites.checked = true;
    }
	else
	{
        showfavorites.checked = false;
    }

function getFavs() 
{
	return JSON.parse(localStorage.getItem('favs')) || [];
}
		  
function DateFormat()
{
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	datepicker.value = formattedDate;
	datepicker.dispatchEvent(new Event("change"));
}

function Addfav()
{
	favs = getFavs();
	if (favs.includes(formattedComicDate)) 
	{
		favs = favs.filter(date => date !== formattedComicDate);
	  	$(".favicon").css({ color: "black" }).removeClass("fa-star").addClass("fa-star-o");
	  	if(favs.length == 0)
		{
		 	showfavorites.disabled = true;
			showfavorites.checked = false;
		}
	} 
	else
	{
		favs = [...favs, formattedComicDate];
	  	$(".favicon").css({ color: "black" }).removeClass("fa-star-o").addClass("fa-star");
	  	showfavorites.disabled = false;
	}
  	favs.sort();
	localStorage.setItem("favs", JSON.stringify(favs));
	CompareDates();
	showComic();
}

function OnLoad()
{
	var favs = getFavs();
	favs = favs || [];
	showfavorites.disabled = favs.length === 0;

	if(favs.length == 0)
	{
		showfavorites.checked = false;
	}
	if(showfavorites.checked)
	{
		currentselectedDate = favs.length !== 0 
	 	? new Date(favs[0]) 
	 	: datepicker.valueAsDate = new Date();
	}
	else
	{
		currentselectedDate = datepicker.valueAsDate = new Date();
	}
	if (showfavorites.checked) 
	{
		if (favs.length !== 0)
		{
			currentselectedDate = new Date(favs[0]);
		}
		else
		{
			currentselectedDate = new Date();
		}
	}
	else
	{
		currentselectedDate = new Date();
	}
	datepicker.valueAsDate = currentselectedDate;
	nextbutton.disabled = !favs.length;
	currentbutton.disabled = !favs.length;
	today = currentselectedDate.toISOString().substr(0, 10);
	datepicker.setAttribute("max", today)
	CompareDates();
	showComic();
}
	
   