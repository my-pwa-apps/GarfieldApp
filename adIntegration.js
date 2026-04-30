// ========================================
// NON-INTRUSIVE AD INTEGRATION
// ========================================

const AD_CONFIG = Object.freeze({
    ADSENSE_CLIENT: '',
    ADSENSE_SLOT: '',
    SCRIPT_ID: 'adsenseScript',
    CONTAINER_ID: 'adSupportSlot',
    FRAME_ID: 'adSupportFrame'
});

function isAdSenseConfigured() {
    return /^ca-pub-\d{10,}$/.test(AD_CONFIG.ADSENSE_CLIENT) && /^\d{4,}$/.test(AD_CONFIG.ADSENSE_SLOT);
}

function hideAdContainer(reason = 'not-configured') {
    const container = document.getElementById(AD_CONFIG.CONTAINER_ID);
    if (!container) return;

    container.hidden = true;
    container.setAttribute('aria-hidden', 'true');
    container.dataset.adState = reason;
}

function loadAdSenseScript() {
    const existingScript = document.getElementById(AD_CONFIG.SCRIPT_ID);
    if (existingScript) return Promise.resolve(existingScript);

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = AD_CONFIG.SCRIPT_ID;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(AD_CONFIG.ADSENSE_CLIENT)}`;
        script.addEventListener('load', () => resolve(script), { once: true });
        script.addEventListener('error', () => reject(new Error('AdSense script failed to load')), { once: true });
        document.head.appendChild(script);
    });
}

async function initializeAds() {
    const container = document.getElementById(AD_CONFIG.CONTAINER_ID);
    const frame = document.getElementById(AD_CONFIG.FRAME_ID);
    if (!container || !frame) return;

    if (!isAdSenseConfigured()) {
        hideAdContainer();
        return;
    }

    container.hidden = false;
    container.removeAttribute('aria-hidden');
    container.dataset.adState = 'loading';

    frame.replaceChildren();
    const adElement = document.createElement('ins');
    adElement.className = 'adsbygoogle ad-support-ad';
    adElement.style.display = 'block';
    adElement.setAttribute('data-ad-client', AD_CONFIG.ADSENSE_CLIENT);
    adElement.setAttribute('data-ad-slot', AD_CONFIG.ADSENSE_SLOT);
    adElement.setAttribute('data-ad-format', 'auto');
    adElement.setAttribute('data-full-width-responsive', 'true');
    frame.appendChild(adElement);

    try {
        await loadAdSenseScript();
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
        container.dataset.adState = 'ready';
    } catch (error) {
        console.warn(error.message);
        hideAdContainer('load-failed');
    }
}

window.GarfieldAds = Object.freeze({
    config: AD_CONFIG,
    isConfigured: isAdSenseConfigured,
    initialize: initializeAds
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAds, { once: true });
} else {
    initializeAds();
}
