import { translations } from './translations.js';
import { getAuthenticatedComic } from './comicExtractor.js';
import { fetchTop10 } from './favoritesApi.js';
import { getFocusableElements, trapFocusWithin } from './focusTrap.js';

// Community "Top Favorites" modal and browse mode. Loaded on first use to keep
// it off the startup path; the app supplies date/navigation hooks.
let deps;
let _top10LastFocusedElement = null;

// Top Favorites browsing mode state
let _top10Entries = [];
let _top10BrowseIndex = -1;
let _isTop10Mode = false;
const _thumbCache = new Map(); // date string → image URL

function getTop10FocusableElements() {
    return getFocusableElements(document.getElementById('top10Modal'));
}

function focusTop10Modal() {
    const modal = document.getElementById('top10Modal');
    if (!modal) return;

    const focusTarget = document.getElementById('top10CloseBtn') || getTop10FocusableElements()[0] || modal;
    focusTarget.focus();
}

function trapTop10ModalFocus(event) {
    trapFocusWithin(event, document.getElementById('top10Modal'));
}

function setTop10EntryCount(date, count, updatedAt = null) {
    const entry = _top10Entries.find(item => item && item.date === date);
    if (!entry) return;

    entry.count = Math.max(0, count);
    if (updatedAt) entry.updatedAt = updatedAt;

    if (_isTop10Mode && _top10Entries[_top10BrowseIndex]?.date === date) {
        updateTop10Indicator();
    }
}

/**
 * Build one leaderboard row as real DOM nodes.
 *
 * Deliberately avoids `innerHTML` for anything derived from the remote
 * leaderboard response (`entry.date`, `entry.count`, `entry.updatedAt`): those
 * values are attacker-influencable if the API is ever compromised, and they
 * previously flowed straight into an HTML string, including into an
 * `aria-label="..."` attribute where a quote would break out of the attribute.
 * @param {{date: string, count: number, updatedAt?: string}} entry
 * @param {number} index
 * @param {Record<string, string>} t - Active translation table
 * @param {string} dateFmtLocale
 * @returns {HTMLButtonElement}
 */
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
    // Static, developer-authored markup only.
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

function showTop10Modal() {
    const backdrop = document.getElementById('top10Backdrop');
    const modal = document.getElementById('top10Modal');
    const list = document.getElementById('top10List');
    if (!backdrop || !modal || !list) return;

    const lang = deps.UTILS.isSpanishMode() ? 'es' : 'en';
    const t = translations[lang] || translations.en;
    const dateFmtLocale = lang === 'es' ? 'es-ES' : 'en-US';

    if (!(document.activeElement instanceof HTMLElement) || !modal.contains(document.activeElement)) {
        _top10LastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    modal.setAttribute('aria-busy', 'true');
    list.replaceChildren(deps.UTILS.createMessageDiv('top10-loading', t.top10Loading));
    backdrop.classList.add('visible');
    modal.classList.add('visible');
    focusTop10Modal();

    fetchTop10().then(entries => {
        modal.removeAttribute('aria-busy');
        if (!entries || entries.length === 0) {
            list.replaceChildren(deps.UTILS.createMessageDiv('top10-empty', t.top10Empty));
            return;
        }
        _top10Entries = entries;

        list.replaceChildren(...entries.map((entry, i) => createTop10EntryButton(entry, i, t, dateFmtLocale)));

        // Load thumbnails in batches, using cached URLs when available.
        // Abort after too many consecutive failures (proxy may be down/rate-limited).
        const BATCH_SIZE = 5;
        const MAX_CONSECUTIVE_FAILURES = 3;
        let _consecutiveThumbFails = 0;
        // Honour the reader's own source and language preference so thumbnails
        // match the strips they will actually see when they open an entry.
        const thumbSource = deps.UTILS.getPreferredSource();
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
                const parts = entry.date.split('/');
                const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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

        // Click handlers — enter Top 10 browsing mode
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

function enterTop10Mode(index) {
    _top10BrowseIndex = index;
    _isTop10Mode = true;

    // Close modals and settings
    closeTop10Modal();
    const settingsPanel = document.getElementById('settingsDIV');
    if (settingsPanel?.classList.contains('visible')) {
        settingsPanel.classList.remove('visible');
    }

    // Show the floating indicator
    showTop10Indicator();

    // Load the selected comic
    loadTop10Comic();
}

function loadTop10Comic() {
    const entry = _top10Entries[_top10BrowseIndex];
    if (!entry) return;

    const parts = entry.date.split('/');
    deps.setCurrentDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));

    // Update nav button states for top 10 mode
    document.getElementById('Previous').disabled = _top10BrowseIndex === 0;
    document.getElementById('First').disabled = _top10BrowseIndex === 0;
    document.getElementById('Next').disabled = _top10BrowseIndex === _top10Entries.length - 1;
    document.getElementById('Last').disabled = _top10BrowseIndex === _top10Entries.length - 1;
    document.getElementById('Random').disabled = _top10Entries.length <= 1;
    document.getElementById('DatePicker').disabled = true;

    // Update indicator
    updateTop10Indicator();

    deps.showComic();
}

function exitTop10Mode() {
    _isTop10Mode = false;
    _top10BrowseIndex = -1;

    // Hide indicator
    const indicator = document.getElementById('top10Indicator');
    if (indicator) indicator.remove();

    // Re-enable navigation
    document.getElementById('DatePicker').disabled = false;
    deps.compareDates();
    deps.showComic();
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

function updateTop10Indicator() {
    const indicator = document.getElementById('top10Indicator');
    if (!indicator || !_isTop10Mode) return;

    const entry = _top10Entries[_top10BrowseIndex];
    if (!entry) return;

    const lang = deps.UTILS.isSpanishMode() ? 'es' : 'en';
    const t = translations[lang] || translations.en;
    const medal = _top10BrowseIndex === 0 ? '🥇' : _top10BrowseIndex === 1 ? '🥈' : _top10BrowseIndex === 2 ? '🥉' : '';
    const rank = medal || `#${_top10BrowseIndex + 1}`;

    // Built with DOM APIs rather than innerHTML: `entry.count` and the
    // translated exit label previously landed inside an HTML string (including
    // inside an aria-label attribute).
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

function closeTop10Modal() {
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

function browseTo(index) {
    if (index < 0 || index >= _top10Entries.length) return;
    _top10BrowseIndex = index;
    loadTop10Comic();
}

/**
 * @param {{ UTILS: object, setCurrentDate: (date: Date) => void, showComic: () => void, compareDates: () => void }} dependencies
 */
export function createTop10(dependencies) {
    deps = dependencies;
    return {
        open: showTop10Modal,
        close: closeTop10Modal,
        exit: exitTop10Mode,
        isActive: () => _isTop10Mode,
        step: delta => browseTo(_top10BrowseIndex + delta),
        first: () => browseTo(0),
        last: () => browseTo(_top10Entries.length - 1),
        setEntryCount: setTop10EntryCount,
        trapFocus: trapTop10ModalFocus
    };
}
