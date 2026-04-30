// ========================================
// NON-INTRUSIVE AD INTEGRATION
// ========================================

const AD_CONFIG = Object.freeze({
    ADSENSE_CLIENT: '',
    ADSENSE_SLOT: '',
    SUPPORTER_KEY: 'supporterAdFree',
    SUPPORTER_CODE_KEY: 'supporterCode',
    SUPPORTER_LABEL_KEY: 'supporterLabel',
    SUPPORTER_EXPIRY_KEY: 'supporterExpiry',
    SUPPORTER_CODE_PUBLIC_KEY_JWK: Object.freeze({
        kty: 'EC',
        crv: 'P-256',
        x: 'SY7_4IFCOxYFoeAr67LtmtcY_wLW6oaSPAzm9jFEaf4',
        y: '8seKwREcdSF9Lc_JTaaa-FTIcUbjSHnuT5EkelH62Vc',
        ext: true,
        key_ops: ['verify']
    }),
    SCRIPT_ID: 'adsenseScript',
    CONTAINER_ID: 'adSupportSlot',
    FRAME_ID: 'adSupportFrame'
});

function isSupporterAdFree() {
    if (localStorage.getItem(AD_CONFIG.SUPPORTER_KEY) !== 'true') return false;

    const expiry = localStorage.getItem(AD_CONFIG.SUPPORTER_EXPIRY_KEY);
    if (expiry && Date.now() > Date.parse(`${expiry}T23:59:59Z`)) {
        setSupporterAdFree(false);
        return false;
    }

    return true;
}

function setSupporterAdFree(enabled, details = {}) {
    if (enabled) {
        localStorage.setItem(AD_CONFIG.SUPPORTER_KEY, 'true');
        if (details.code) localStorage.setItem(AD_CONFIG.SUPPORTER_CODE_KEY, details.code);
        if (details.label) localStorage.setItem(AD_CONFIG.SUPPORTER_LABEL_KEY, details.label);
        if (details.expiry) localStorage.setItem(AD_CONFIG.SUPPORTER_EXPIRY_KEY, details.expiry);
        hideAdContainer('supporter');
        return;
    }

    localStorage.removeItem(AD_CONFIG.SUPPORTER_KEY);
    localStorage.removeItem(AD_CONFIG.SUPPORTER_CODE_KEY);
    localStorage.removeItem(AD_CONFIG.SUPPORTER_LABEL_KEY);
    localStorage.removeItem(AD_CONFIG.SUPPORTER_EXPIRY_KEY);
    initializeAds();
}

function getSupporterLabel() {
    return localStorage.getItem(AD_CONFIG.SUPPORTER_LABEL_KEY) || '';
}

function base64UrlDecode(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function parseSupporterCode(code) {
    const trimmed = String(code || '').trim();
    const parts = trimmed.split('.');
    if (parts.length !== 3 || parts[0] !== 'GARFIELD') {
        throw new Error('invalid-format');
    }

    const payloadText = new TextDecoder().decode(base64UrlDecode(parts[1]));
    const payload = JSON.parse(payloadText);
    if (!payload || payload.v !== 1 || typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new Error('invalid-payload');
    }
    if (payload.exp && Date.now() > Date.parse(`${payload.exp}T23:59:59Z`)) {
        throw new Error('expired');
    }

    return { trimmed, payloadPart: parts[1], signaturePart: parts[2], payload };
}

async function verifySupporterCode(code) {
    try {
        const parsed = parseSupporterCode(code);
        const key = await crypto.subtle.importKey(
            'jwk',
            AD_CONFIG.SUPPORTER_CODE_PUBLIC_KEY_JWK,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );
        const isValid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            base64UrlDecode(parsed.signaturePart),
            new TextEncoder().encode(parsed.payloadPart)
        );

        if (!isValid) throw new Error('invalid-signature');
        return { ok: true, code: parsed.trimmed, payload: parsed.payload };
    } catch (error) {
        return { ok: false, error: error.message || 'invalid-code' };
    }
}

async function applySupporterCode(code) {
    const result = await verifySupporterCode(code);
    if (!result.ok) return result;

    setSupporterAdFree(true, {
        code: result.code,
        label: result.payload.sub,
        expiry: result.payload.exp || ''
    });
    return result;
}

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

function showAdContainer(state) {
    const container = document.getElementById(AD_CONFIG.CONTAINER_ID);
    if (!container) return;

    container.hidden = false;
    container.removeAttribute('aria-hidden');
    container.dataset.adState = state;
}

function renderPlaceholderAd(frame) {
    showAdContainer('placeholder');
    frame.replaceChildren();

    const placeholder = document.createElement('div');
    placeholder.className = 'ad-placeholder-preview';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', 'Advertisement preview placeholder');
    placeholder.innerHTML = `
        <div class="ad-placeholder-copy">
            <strong>GarfieldApp Sponsor</strong>
            <span>Quiet responsive banner preview</span>
        </div>
        <div class="ad-placeholder-badge">Ad preview</div>
    `;
    frame.appendChild(placeholder);
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

    if (isSupporterAdFree()) {
        hideAdContainer('supporter');
        return;
    }

    if (!isAdSenseConfigured()) {
        renderPlaceholderAd(frame);
        return;
    }

    showAdContainer('loading');

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
    isSupporterAdFree,
    getSupporterLabel,
    verifySupporterCode,
    applySupporterCode,
    setSupporterAdFree,
    initialize: initializeAds
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAds, { once: true });
} else {
    initializeAds();
}
