
//garfieldapp.tk, garfieldapp.pages.dev

if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("./serviceworker.js");
	}
	
	function Share() {
	if (navigator.share) {
	navigator.share({
	title: "https://garfieldapp.tk",
	url: pictureUrl
	});
	}
	}

function Addfav() {
	
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	formattedComicDate = formattedDate.split('-').join('/');
	let favs = getFavs();
  
	if (favs.includes(formattedComicDate)) {
	  favs = favs.filter(date => date !== formattedComicDate);
	  $(".favicon").css({ color: "black" }).removeClass("fa-star").addClass("fa-star-o");
	  document.getElementById("showfavs").disabled = favs.length === 0;
	} else {
	  favs = [...favs, formattedComicDate];
	  $(".favicon").css({ color: "black" }).removeClass("fa-star-o").addClass("fa-star");
	  document.getElementById("showfavs").disabled = false;
	}
  
	favs.sort();
	localStorage.setItem("favs", JSON.stringify(favs));
  }
  
function OnLoad() {
	timezoneissue = false;
	var favs = getFavs();
	favs = favs || [];
	previousUrl = null;

	if(document.getElementById("showfavs").checked) {
	currentselectedDate = favs.length !== 0 
		? new Date(favs[0]) 
		: document.getElementById("DatePicker").valueAsDate = new Date();
	}
	else {
	currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
	}

	document.getElementById("Next").disabled = !favs.length;
	document.getElementById("Current").disabled = !favs.length;
	today = currentselectedDate.toISOString().substr(0, 10);
	document.getElementById("DatePicker").setAttribute("max", today);
	CompareDates();
	showComic();
}

function PreviousClick() {
	const favs = getFavs();
	const favIndex = favs.indexOf(formattedComicDate);
	if (document.getElementById("showfavs").checked && favIndex > 0) {
		currentselectedDate = new Date(favs[favIndex - 1]);
	} else {
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
    formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	document.getElementById("DatePicker").value = formattedDate;
	document.getElementById("DatePicker").dispatchEvent(new Event("change"));
}

function NextClick() {
	if(new Date(currentselectedDate).toLocaleDateString() == new Date(today).toLocaleDateString()) {
	} else {
	timezoneissue = true;
	let favs;
	if (document.getElementById("showfavs").checked) {
	  favs = getFavs();
	  let index = favs.indexOf(formattedComicDate);
	  if (index < favs.length - 1) {
		currentselectedDate = new Date(favs[index + 1]);
	  }
	} else {
	  currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	document.getElementById("DatePicker").value = formattedDate;
	document.getElementById("DatePicker").dispatchEvent(new Event("change"));
  }
}
  
function FirstClick() {
	var favs = getFavs();
	if(document.getElementById("showfavs").checked) {
	currentselectedDate = new Date(favs[0]);
	} else {
	currentselectedDate = new Date(Date.UTC(1978, 5, 19, 12));
	}
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	document.getElementById("DatePicker").value = formattedDate;
	document.getElementById("DatePicker").dispatchEvent(new Event("change"));
	}

function CurrentClick() {
	timezoneissue = true;
	currentselectedDate = new Date();
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	document.getElementById("DatePicker").value = formattedDate;
	document.getElementById("DatePicker").dispatchEvent(new Event("change"));
}

function RandomClick() {
	const favs = getFavs();
	const isShowFavsChecked = document.getElementById("showfavs").checked;
	timezoneissue = true;
	if (isShowFavsChecked && favs.length) {
		currentselectedDate = new Date(favs[Math.floor(Math.random() * favs.length)]);
	} else {
		const start = new Date("1978-06-19");
		const end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	document.getElementById("DatePicker").value = formattedDate;
	document.getElementById("DatePicker").dispatchEvent(new Event("change"));
}

function DateChange() {
	currentselectedDate = new Date(document.getElementById("DatePicker").value);
	CompareDates();
	showComic();
}

function showComic() {
	//currentselectedDate = new Date(currentselectedDate);
	formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
	formattedComicDate = formattedDate.split('-').join('/');
	document.getElementById('DatePicker').value = formattedDate;
  
  const siteUrl = `https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://www.gocomics.com/garfield/${formattedComicDate}`;
  const favs = getFavs();
  
  $(".favicon").css({"color": "black"})
    .removeClass(favs.includes(formattedComicDate) ? 'fa-star-o' : 'fa-star')
    .addClass(favs.includes(formattedComicDate) ? 'fa-star' : 'fa-star-o');

  fetch(siteUrl)
    .then(response => response.text())
    .then(text => {
      const picturePosition = text.indexOf("https://assets.amuniversal.com");
      pictureUrl = text.substring(picturePosition, picturePosition + 63);
      if(pictureUrl != previousUrl )
	   {
		  document.getElementById("comic").src = pictureUrl;
		  previousUrl = pictureUrl;
	   }
	   else
	   {
		   if(!timezoneissue)
		   {
			PreviousClick();
			timezoneissue = false;
		   }
	   }
	   
    });
	timezoneissue = false;
}

 function CompareDates() {
	var favs = getFavs();
	if(document.getElementById("showfavs").checked && favs.length !== 0) {
		if(favs.includes(document.getElementById("DatePicker").value)) {}
		else{	
		startDate = new Date(favs[0])}}
	else{	
		startDate = new Date("1978/06/19");
	}
	startDate = new Date(startDate.setHours(0, 0, 0, 0));
	currentselectedDate = new Date(currentselectedDate.setHours(0, 0, 0, 0));
	//startDate = new Date(startDate);
	//currentselectedDate = new Date(currentselectedDate);
	if(currentselectedDate.getTime() <= startDate.getTime()) {
		document.getElementById("Previous").disabled = true;
		document.getElementById("First").disabled = true;
		startDate = startDate.toISOString().substr(0, 10);
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
	endDate = new Date(endDate.setHours(0, 0, 0, 0));
	//endDate = new Date(endDate);
	if(currentselectedDate.getTime() >= endDate.getTime()) {
		document.getElementById("Next").disabled = true;
		document.getElementById("Current").disabled = true;
		endDate = endDate.toISOString().substr(0, 10);
	} else {
		document.getElementById("Next").disabled = false;
		document.getElementById("Current").disabled = false;
	}
	if(document.getElementById("showfavs").checked) {
		document.getElementById("Current").disabled = true;
		if(favs.length == 1) {
			document.getElementById("Random").disabled = true;
			document.getElementById("Previous").disabled = true;
			document.getElementById("First").disabled = true;
		
		}}
	else {
		document.getElementById("Random").disabled = false;}
}

function Rotate() {
	var element = document.getElementById('comic');
	if(element.className === "normal") {
		element.className = "rotate";
	} else if(element.className === "rotate") {
		element.className = "normal";
	}
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
    setStatus.onclick = function() {
        if(document.getElementById('swipe').checked) {
            localStorage.setItem('stat', "true");
        } else {
            localStorage.setItem('stat', "false");
			CompareDates();
			showComic();
        }
    }

	setStatus = document.getElementById('showfavs');
	favs = getFavs();
	setStatus.onclick = function() {
        if(document.getElementById('showfavs').checked) {
            localStorage.setItem('showfavs', "true");
			if(favs.indexOf(formattedComicDate) == -1)
			{
				
			}
			else
			{
				currentselectedDate = new Date(favs[0]);	
			}
			
	
       } else {
           localStorage.setItem('showfavs', "false");
			
        }

		}


getStatus = localStorage.getItem('stat');
    if (getStatus == "true") {
        document.getElementById("swipe").checked = true;
    } else {
        document.getElementById("swipe").checked = false;
    }

getStatus = localStorage.getItem('showfavs');
    if (getStatus == "true") {
        document.getElementById("showfavs").checked = true;
    } else {
        document.getElementById("showfavs").checked = false;
    }

	function getFavs() {
		return JSON.parse(localStorage.getItem('favs')) || [];
	  }
		  


	
   