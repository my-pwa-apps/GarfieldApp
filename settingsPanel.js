import { CONFIG } from './config.js';
import { translations } from './translations.js';
import { getFocusableElements, trapFocusWithin } from './focusTrap.js';

// Settings dialog: a centered modal with a backdrop whose content is split into
// accordion groups. Only one group is open at a time and the last opened group
// is restored the next time the dialog is shown.
const GROUP_LABEL_KEYS = Object.freeze({
    reading: 'settingsGroupReading',
    favorites: 'settingsGroupFavorites',
    sync: 'googleDriveSync'
});

// Dragging was removed; drop the stale position left by earlier versions.
const LEGACY_POSITION_KEY = CONFIG.STORAGE_KEYS.SETTINGS + '_pos';

let lastFocusedElement = null;

function getPanel() {
    return document.getElementById('settingsDIV');
}

function getGroups(panel = getPanel()) {
    return panel ? [...panel.querySelectorAll('details.settings-group')] : [];
}

function persist(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch { /* storage blocked — dialog state is not critical */ }
}

export function isSettingsOpen() {
    return getPanel()?.classList.contains('visible') === true;
}

export function openSettings() {
    const panel = getPanel();
    if (!panel || panel.classList.contains('visible')) return;

    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.classList.add('visible');
    persist(CONFIG.STORAGE_KEYS.SETTINGS, 'true');

    // Move focus into the dialog so keyboard and screen-reader users land on
    // its controls instead of staying behind it.
    getFocusableElements(panel)[0]?.focus();
}

export function closeSettings() {
    const panel = getPanel();
    if (!panel) return;

    panel.classList.remove('visible');
    persist(CONFIG.STORAGE_KEYS.SETTINGS, 'false');

    if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
    lastFocusedElement = null;
}

export function toggleSettings(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (isSettingsOpen()) closeSettings();
    else openSettings();
}

function initializeAccordion(panel) {
    const groups = getGroups(panel);
    if (!groups.length) return;

    let saved = null;
    try {
        saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS_GROUP);
    } catch { /* fall back to the markup default */ }

    if (saved && groups.some(group => group.dataset.group === saved)) {
        groups.forEach(group => { group.open = group.dataset.group === saved; });
    }

    groups.forEach(group => {
        // `<details name>` already makes the groups exclusive in current
        // browsers; this keeps older engines consistent.
        group.addEventListener('toggle', () => {
            if (!group.open) return;
            groups.forEach(other => {
                if (other !== group && other.open) other.open = false;
            });
            persist(CONFIG.STORAGE_KEYS.SETTINGS_GROUP, group.dataset.group);
            // Collapsing the previous group can leave the list scrolled mid-way.
            group.scrollIntoView?.({ block: 'nearest' });
        });
    });
}

function translateGroups() {
    const t = translations[document.documentElement.lang === 'es' ? 'es' : 'en'] || translations.en;
    const title = document.getElementById('settingsTitle');
    if (title) title.textContent = t.settings;
    for (const group of getGroups()) {
        const label = group.querySelector('.settings-group-label');
        const key = GROUP_LABEL_KEYS[group.dataset.group];
        if (label && key && t[key]) label.textContent = t[key];
    }
}

export function initializeSettingsPanel() {
    const panel = getPanel();
    if (!panel) return;

    try {
        localStorage.removeItem(LEGACY_POSITION_KEY);
    } catch { /* ignore */ }

    initializeAccordion(panel);
    translateGroups();
    window.addEventListener('language-changed', translateGroups);

    document.getElementById('settingsBtn')?.addEventListener('click', toggleSettings);
    document.getElementById('settingsCloseBtn')?.addEventListener('click', toggleSettings);
    document.getElementById('settingsBackdrop')?.addEventListener('click', () => closeSettings());

    document.addEventListener('keydown', event => {
        if (!isSettingsOpen()) return;
        if (event.key === 'Tab') {
            trapFocusWithin(event, panel);
        } else if (event.key === 'Escape') {
            closeSettings();
        }
    });

    let wasOpen = false;
    try {
        wasOpen = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS) === 'true';
    } catch { /* ignore */ }
    panel.classList.toggle('visible', wasOpen);
}
