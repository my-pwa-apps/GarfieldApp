import { translations } from './translations.js';
import { getAuthenticatedComic } from './comicExtractor.js';
import { _setToolbarIcon, _setToolbarLabel, setDatePickerDisabled } from './shuffle.js';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let _top10Entries = [];
let _top10BrowseIndex = -1;
let _isTop10Mode = false;
let _top10LastFocusedElement = null;
const _thumbCache = new Map();

let _deps = {
    getUtils: () => null,
    fetchTop10: async () => [],
    setCurrentDate: () => {},
    compareDates: () => {},
    showComic: () => {}
};

export function configureTopFavorites(deps = {}) {
    _deps = { ..._deps, ...deps };
}

export function isTop10ModeActive() {
    return _isTop10Mode;
}

export function getTop10State() {
    return {
        isTop10Mode: _isTop10Mode,
        entries: _top10Entries,
        browseIndex: _top10BrowseIndex
    };
}

export function stepTop10BrowseIndex(direction) {
    if (!_isTop10Mode) return false;
    if (direction === 'previous' && _top10BrowseIndex > 0) {
        _top10BrowseIndex--;
        loadTop10Comic();
        return true;
    }
    if (direction === 'next' && _top10BrowseIndex < _top10Entries.length - 1) {
        _top10BrowseIndex++;
        loadTop10Comic();
        return true;
    }
    if (direction === 'first') {
        _top10BrowseIndex = 0;
        loadTop10Comic();
        return true;
    }
    if (direction === 'last') {
        _top10BrowseIndex = _top10Entries.length - 1;
        loadTop10Comic();
        return true;
    }
    if (direction === 'random') {
        if (_top10Entries.length <= 1) return true;
        let nextIndex = _top10BrowseIndex;
        for (let attempt = 0; attempt < 5 && nextIndex === _top10BrowseIndex; attempt++) {
            nextIndex = Math.floor(Math.random() * _top10Entries.length);
        }
        if (nextIndex === _top10BrowseIndex) {
            nextIndex = (_top10BrowseIndex + 1) % _top10Entries.length;
        }
        _top10BrowseIndex = nextIndex;
        loadTop10Comic();
        return true;
    }
    return true;
}

export function canSwipeTop10(direction) {
    if (!_isTop10Mode) return false;
    return direction === 'previous'
        ? _top10BrowseIndex > 0
        : _top10BrowseIndex < _top10Entries.length - 1;
}

export function syncTop10NavigationControls() {
    if (!_isTop10Mode) return false;
    const utils = _deps.getUtils();
    setDatePickerDisabled(true);
    document.getElementById('Previous').disabled = _top10BrowseIndex <= 0;
    document.getElementById('First').disabled = _top10BrowseIndex <= 0;
    document.getElementById('Next').disabled = _top10BrowseIndex >= _top10Entries.length - 1;
    document.getElementById('Last').disabled = _top10BrowseIndex >= _top10Entries.length - 1;
    document.getElementById('Random').disabled = _top10Entries.length <= 1;
    const lang = utils?.isSpanishMode() ? 'es' : 'en';
    const t = translations[lang] || translations.en;
    _setToolbarIcon('First', 'first');
    _setToolbarIcon('Previous', 'previous');
    _setToolbarIcon('Random', 'random');
    _setToolbarIcon('Next', 'next');
    _setToolbarIcon('Last', 'last');
    _setToolbarLabel('First', t.first);
    _setToolbarLabel('Previous', t.previous);
    _setToolbarLabel('Random', t.random);
    _setToolbarLabel('Next', t.next);
    _setToolbarLabel('Last', t.last);
    return true;
}

export function getFocusableElements(container) {
    if (!container) return [];

    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(element => !element.disabled && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null);
}

export function trapFocusWithin(event, container) {
    if (!container) return;

    const focusable = getFocusableElements(container);
    if (!focusable.length) {
        event.preventDefault();
        if (container instanceof HTMLElement) container.focus();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function focusTop10Modal() {
    const modal = document.getElementById('top10Modal');
    if (!modal) return;

    const focusTarget = document.getElementById('top10CloseBtn') || getFocusableElements(modal)[0] || modal;
    focusTarget.focus();
}

export function trapTop10ModalFocus(event) {
    trapFocusWithin(event, document.getElementById('top10Modal'));
}

export function setTop10EntryCount(date, count, updatedAt = null) {
    const entry = _top10Entries.find(item => item && item.date === date);
    if (!entry) return;

    entry.count = Math.max(0, count);
    if (updatedAt) entry.updatedAt = updatedAt;

    if (_isTop10Mode && _top10Entries[_top10BrowseIndex]?.date === date) {
        updateTop10Indicator();
    }
}

function createTop10EntryButton(entry, index, t, dateFmtLocale) {
    const [y, m, d] = entry.date.split('/').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formatted = dateObj.toLocaleDateString(dateFmtLocale, { year: 'numeric', month: 'short', day: 'numeric' });
    const updatedDate = entry.updatedAt ? new Date(entry.updatedAt) : null;
    const updatedLabel = updatedDate && !Number.isNaN(updatedDate.getTime())
        ? t.top10Updated.replace('{date}', updatedDate.toLocaleString(dateFmtLocale, { dateStyle: 'medium', timeStyle: 'short' }))
        : '';
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'top10-entry';
    button.dataset.index = String(index);
    button.dataset.date = entry.date;
    button.setAttribute('aria-label', t.top10ViewComic.replace('{date}', formatted));

    const rank = document.createElement('span');
    rank.className = 'top10-rank';
    rank.textContent = medal || String(index + 1);
    button.appendChild(rank);

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'top10-thumb-wrap';
    thumbWrap.id = `top10Thumb${index}`;
    const placeholder = document.createElement('div');
    placeholder.className = 'top10-thumb-placeholder';
    placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    thumbWrap.appendChild(placeholder);
    button.appendChild(thumbWrap);

    const info = document.createElement('div');
    info.className = 'top10-info';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'top10-date';
    dateSpan.textContent = formatted;
    info.appendChild(dateSpan);

    const countSpan = document.createElement('span');
    countSpan.className = 'top10-count';
    countSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2" width="14" height="14"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    countSpan.append(` ${Number(entry.count) || 0}`);
    info.appendChild(countSpan);

    if (updatedLabel) {
        const updatedSpan = document.createElement('span');
        updatedSpan.className = 'top10-updated';
        updatedSpan.textContent = updatedLabel;
        info.appendChild(updatedSpan);
    }

    button.appendChild(info);
    return button;
}

export function showTop10Modal() {
    const backdrop = document.getElementById('top10Backdrop');
    const modal = document.getElementById('top10Modal');
    const list = document.getElementById('top10List');
    const utils = _deps.getUtils();
    if (!backdrop || !modal || !list || !utils) return;

    const lang = utils.isSpanishMode() ? 'es' : 'en';
    const t = translations[lang] || translations.en;
    const dateFmtLocale = lang === 'es' ? 'es-ES' : 'en-US';

    if (!(document.activeElement instanceof HTMLElement) || !modal.contains(document.activeElement)) {
        _top10LastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    modal.setAttribute('aria-busy', 'true');
    list.replaceChildren(utils.createMessageDiv('top10-loading', t.top10Loading));
    backdrop.classList.add('visible');
    modal.classList.add('visible');
    focusTop10Modal();

    _deps.fetchTop10().then(entries => {
        modal.removeAttribute('aria-busy');
        if (!entries || entries.length === 0) {
            list.replaceChildren(utils.createMessageDiv('top10-empty', t.top10Empty));
            return;
        }
        _top10Entries = entries;

        list.replaceChildren(...entries.map((entry, i) => createTop10EntryButton(entry, i, t, dateFmtLocale)));

        const BATCH_SIZE = 5;
        const MAX_CONSECUTIVE_FAILURES = 3;
        let _consecutiveThumbFails = 0;
        const thumbSource = utils.getPreferredSource();
        const thumbLanguage = lang;

        function applyThumb(i, imageUrl, dateStr) {
            const thumbWrap = document.getElementById(`top10Thumb${i}`);
            if (thumbWrap) {
                const img = document.createElement('img');
                img.className = 'top10-thumb';
                img.loading = 'lazy';
                img.setAttribute('src', imageUrl);
                img.setAttribute('alt', t.top10ComicAlt.replace('{date}', dateStr));
                thumbWrap.replaceChildren(img);
            }
        }

        async function loadThumbBatch(startIndex) {
            if (!modal.classList.contains('visible')) return;
            if (_consecutiveThumbFails >= MAX_CONSECUTIVE_FAILURES) return;
            const batch = entries.slice(startIndex, startIndex + BATCH_SIZE);
            await Promise.all(batch.map((entry, offset) => {
                const i = startIndex + offset;
                const cached = _thumbCache.get(entry.date);
                if (cached) {
                    applyThumb(i, cached, entry.date);
                    _consecutiveThumbFails = 0;
                    return Promise.resolve();
                }
                const date = utils.dateFromFavoriteDateString(entry.date);
                return getAuthenticatedComic(date, thumbLanguage, thumbSource, {
                    silent: true,
                    maxSources: 1,
                    disableTodayFallback: true
                }).then(result => {
                    if (result.success && result.imageUrl) {
                        _thumbCache.set(entry.date, result.imageUrl);
                        applyThumb(i, result.imageUrl, entry.date);
                        _consecutiveThumbFails = 0;
                    } else {
                        _consecutiveThumbFails++;
                    }
                }).catch(() => {
                    _consecutiveThumbFails++;
                });
            }));
            if (startIndex + BATCH_SIZE < entries.length && _consecutiveThumbFails < MAX_CONSECUTIVE_FAILURES) {
                loadThumbBatch(startIndex + BATCH_SIZE);
            }
        }
        loadThumbBatch(0);

        list.querySelectorAll('.top10-entry').forEach(btn => {
            btn.addEventListener('click', () => {
                enterTop10Mode(parseInt(btn.dataset.index));
            });
        });
    }).catch(() => {
        modal.removeAttribute('aria-busy');
        const errorWrap = document.createElement('div');
        errorWrap.className = 'top10-empty';
        const message = document.createElement('p');
        message.textContent = t.top10Error;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'backup-button top10-retry-button';
        retry.id = 'top10RetryBtn';
        retry.textContent = t.retry;
        retry.addEventListener('click', showTop10Modal);
        errorWrap.append(message, retry);
        list.replaceChildren(errorWrap);
    });
}

export function enterTop10Mode(index) {
    _top10BrowseIndex = index;
    _isTop10Mode = true;

    closeTop10Modal();
    const settingsPanel = document.getElementById('settingsDIV');
    if (settingsPanel?.classList.contains('visible')) {
        settingsPanel.classList.remove('visible');
    }

    showTop10Indicator();
    loadTop10Comic();
}

export function loadTop10Comic() {
    const entry = _top10Entries[_top10BrowseIndex];
    const utils = _deps.getUtils();
    if (!entry || !utils) return;

    _deps.setCurrentDate(utils.dateFromFavoriteDateString(entry.date));
    syncTop10NavigationControls();
    updateTop10Indicator();
    _deps.showComic();
}

export function exitTop10Mode() {
    _isTop10Mode = false;
    _top10BrowseIndex = -1;

    const indicator = document.getElementById('top10Indicator');
    if (indicator) indicator.remove();

    setDatePickerDisabled(false);
    _deps.compareDates();
    _deps.showComic();
}

function showTop10Indicator() {
    let indicator = document.getElementById('top10Indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'top10Indicator';
        indicator.className = 'top10-indicator';
        document.body.appendChild(indicator);
    }
    updateTop10Indicator();
}

export function updateTop10Indicator() {
    const indicator = document.getElementById('top10Indicator');
    const utils = _deps.getUtils();
    if (!indicator || !_isTop10Mode || !utils) return;

    const entry = _top10Entries[_top10BrowseIndex];
    if (!entry) return;

    const lang = utils.isSpanishMode() ? 'es' : 'en';
    const t = translations[lang] || translations.en;
    const medal = _top10BrowseIndex === 0 ? '🥇' : _top10BrowseIndex === 1 ? '🥈' : _top10BrowseIndex === 2 ? '🥉' : '';
    const rank = medal || `#${_top10BrowseIndex + 1}`;

    const rankSpan = document.createElement('span');
    rankSpan.className = 'top10-indicator-rank';
    rankSpan.textContent = rank;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'top10-indicator-label';
    labelSpan.textContent = t.top10CommunityFavorites;

    const countSpan = document.createElement('span');
    countSpan.className = 'top10-indicator-count';
    countSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2" width="14" height="14"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    countSpan.append(` ${Number(entry.count) || 0}`);

    const posSpan = document.createElement('span');
    posSpan.className = 'top10-indicator-pos';
    posSpan.textContent = `${_top10BrowseIndex + 1}/${_top10Entries.length}`;

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'top10-indicator-exit';
    exitBtn.id = 'top10ExitBtn';
    exitBtn.setAttribute('aria-label', t.top10ExitLabel);
    exitBtn.textContent = '✕';
    exitBtn.addEventListener('click', exitTop10Mode);

    indicator.replaceChildren(rankSpan, labelSpan, countSpan, posSpan, exitBtn);
}

export function closeTop10Modal() {
    const backdrop = document.getElementById('top10Backdrop');
    const modal = document.getElementById('top10Modal');
    if (backdrop) backdrop.classList.remove('visible');
    if (modal) {
        modal.classList.remove('visible');
        modal.removeAttribute('aria-busy');
    }
    if (_top10LastFocusedElement) {
        _top10LastFocusedElement.focus();
        _top10LastFocusedElement = null;
    }
}

export function initTop10Modal() {
    const top10Btn = document.getElementById('top10Btn');
    const closeBtn = document.getElementById('top10CloseBtn');
    const backdrop = document.getElementById('top10Backdrop');

    if (top10Btn) top10Btn.addEventListener('click', showTop10Modal);
    if (closeBtn) closeBtn.addEventListener('click', closeTop10Modal);
    if (backdrop) backdrop.addEventListener('click', closeTop10Modal);

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('top10Modal');
        if (e.key === 'Tab' && modal?.classList.contains('visible')) {
            trapTop10ModalFocus(e);
            return;
        }

        if (e.key === 'Escape') {
            if (modal?.classList.contains('visible')) { closeTop10Modal(); return; }
            if (_isTop10Mode) { exitTop10Mode(); }
        }
    });
}
