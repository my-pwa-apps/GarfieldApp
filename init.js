const initialComic = document.getElementById('comic');
if (initialComic && new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date()) === 'Sun') {
    initialComic.height = 633;
}

/**
 * Fullscreen detection and state management
 */
(function startEarlyComicPreload() {
    try {
        if (navigator.onLine === false) return;
        const source = localStorage.getItem('comicSource');
        if (source === 'fandom') return;

        let dateStr = null;
        const params = new URLSearchParams(window.location.search);
        const showFavs = params.get('view') === 'favorites' || localStorage.getItem('showfavs') === 'true';
        if (showFavs) {
            const favs = JSON.parse(localStorage.getItem('favs') || '[]');
            if (Array.isArray(favs) && typeof favs[0] === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(favs[0])) {
                dateStr = favs[0];
            }
        }
        if (!dateStr && !params.get('action') && !params.get('view') && localStorage.getItem('lastdate') !== 'false') {
            const last = localStorage.getItem('lastcomic');
            if (typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last)) {
                dateStr = last.replaceAll('-', '/');
            }
        }
        if (!dateStr) {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(new Date());
            const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
            dateStr = `${map.year}/${map.month}/${map.day}`;
        }

        const [yearStr, monthStr, dayStr] = dateStr.split('/');
        const yyyy = Number(yearStr);
        const mm = monthStr.padStart(2, '0');
        const dd = dayStr.padStart(2, '0');
        const yy = String(yyyy).slice(-2);
        const isSunday = new Date(yyyy, Number(monthStr) - 1, Number(dayStr), 12).getDay() === 0;
        const ext = isSunday ? 'jpg' : 'gif';
        const targetUrl = `https://picayune.uclick.com/comics/ga/${yyyy}/ga${yy}${mm}${dd}.${ext}`;
        const proxiedUrl = `https://garfieldapp-corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(targetUrl)}`;

        const promise = fetch(proxiedUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(4000),
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-cache'
        }).then(response => {
            if (response.ok) {
                const img = new Image();
                img.fetchPriority = 'high';
                img.src = proxiedUrl;
                window.__earlyComicImage = img;
            }
            return { ok: response.ok, status: response.status };
        });
        window.__earlyUClickProbe = { proxiedUrl, promise };
        promise.catch(() => {});
    } catch {
        // Best-effort early preload only.
    }
})();

document.addEventListener('DOMContentLoaded', function() {
    function checkFullscreen() {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        document.body.classList.toggle('fullscreen-active', isFullscreen);
    }
    
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    checkFullscreen();
});

/**
 * Service Worker Registration with update handling
 */
function getServiceWorkerContainer() {
    try {
        return navigator.serviceWorker || null;
    } catch {
        return null;
    }
}

const serviceWorkerContainer = getServiceWorkerContainer();
if (serviceWorkerContainer) {
    // A single reload guard: `controllerchange` fires once the accepted worker
    // takes over, and only then is it safe to reload onto the new cache.
    let reloadingForUpdate = false;
    serviceWorkerContainer.addEventListener('controllerchange', () => {
        if (!reloadingForUpdate) return;
        reloadingForUpdate = false;
        location.reload();
    });

    window.addEventListener('load', () => {
        try {
            serviceWorkerContainer.register('./serviceworker.js', { scope: './' })
                .then(registration => {
                    const offerUpdate = worker => {
                        if (!worker || !serviceWorkerContainer.controller) return;
                        showUpdateNotification(() => {
                            reloadingForUpdate = true;
                            worker.postMessage({ type: 'SKIP_WAITING' });
                        });
                    };

                    // An update may already be parked from a previous visit.
                    offerUpdate(registration.waiting);

                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker?.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed') {
                                offerUpdate(newWorker);
                            }
                        });
                    });
                })
                .catch(() => {/* Silent fail - app still works without SW */});
        } catch {
            // Silent fail - app still works without SW
        }
    });
}

/**
 * Show update notification banner
 * @param {() => void} onAccept Invoked when the user opts into the update.
 */
function showUpdateNotification(onAccept) {
    if (document.getElementById('update-banner')) return;

    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.className = 'update-banner';

    const message = document.createElement('p');
    const text = window.translations?.en;
    message.textContent = text?.updateAvailable || 'A new version is available.';

    const updateButton = document.createElement('button');
    updateButton.textContent = text?.updateRefresh || 'Refresh';
    updateButton.className = 'button update-banner-button';
    updateButton.addEventListener('click', () => {
        updateButton.disabled = true;
        if (typeof onAccept === 'function') {
            onAccept();
        } else {
            location.reload();
        }
    });

    updateBanner.append(message, updateButton);
    document.body?.insertBefore(updateBanner, document.body.firstChild);
}
