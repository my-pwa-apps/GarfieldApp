import { translations } from './translations.js';
import { getAuthenticatedComic } from './comicExtractor.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TOOLBAR_ICONS = Object.freeze({
    first: 'icon-first',
    previous: 'icon-previous',
    random: 'icon-random',
    next: 'icon-next',
    last: 'icon-last',
    shuffleFirst: 'icon-shuffleFirst',
    shufflePrevious: 'icon-shufflePrevious',
    shuffleNextRandom: 'icon-shuffleNextRandom',
    shuffleNextHistory: 'icon-shuffleNextHistory',
    shuffleLast: 'icon-shuffleLast'
});

let _shuffleCandidateGeneration = 0;
const _shuffleCandidateQueue = [];
const _shuffleBackStack = [];
const _shuffleForwardStack = [];

let _deps = {
    getConfig: () => ({
        GARFIELD_START_EN: '1978-06-19',
        GARFIELD_START_ES: '1999-12-06',
        PREFETCH_SHUFFLE_QUEUE_SIZE: 3,
        PREFETCH_STAGGER_MS: 150,
        SHUFFLE_HISTORY_MAX: 200
    }),
    getUtils: () => null,
    getCurrentDate: () => new Date(),
    setCurrentDate: () => {},
    getFormattedComicDate: () => '',
    isTop10Mode: () => false,
    compareDates: () => {},
    showComic: () => {}
};

export function configureShuffle(deps = {}) {
    _deps = { ..._deps, ...deps };
}

export function hasShuffleBackHistory() {
    return _shuffleBackStack.length > 0;
}

export function hasShuffleForwardHistory() {
    return _shuffleForwardStack.length > 0;
}

export function isShuffleEnabled() {
    const btn = document.getElementById('Shuffle');
    return btn?.getAttribute('aria-pressed') === 'true';
}

export function createToolbarIcon(symbolId) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'toolbar-svg');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${symbolId}`);
    svg.appendChild(use);
    return svg;
}

export function _setToolbarIcon(id, iconKey) {
    const btn = document.getElementById(id);
    const symbolId = TOOLBAR_ICONS[iconKey];
    if (!btn || !symbolId || btn.dataset.iconKey === iconKey) return;
    btn.replaceChildren(createToolbarIcon(symbolId));
    btn.dataset.iconKey = iconKey;
}

export function _setToolbarLabel(id, label) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

export function updateToolbarModeControls() {
    const utils = _deps.getUtils();
    const lang = utils?.isSpanishMode() ? 'es' : 'en';
    const t = translations[lang] || translations.en;
    const shuffle = isShuffleEnabled();

    if (!shuffle) {
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
        return;
    }

    _setToolbarIcon('First', 'shuffleFirst');
    _setToolbarIcon('Previous', 'shufflePrevious');
    _setToolbarIcon('Random', 'random');
    _setToolbarIcon('Next', _shuffleForwardStack.length > 0 ? 'shuffleNextHistory' : 'shuffleNextRandom');
    _setToolbarIcon('Last', 'shuffleLast');
    _setToolbarLabel('First', t.shuffleFirst);
    _setToolbarLabel('Previous', t.shufflePrevious);
    _setToolbarLabel('Random', t.randomDisabledInShuffle);
    _setToolbarLabel('Next', _shuffleForwardStack.length > 0 ? t.shuffleNextHistory : t.shuffleNextRandom);
    _setToolbarLabel('Last', t.shuffleLast);
}

export function setDatePickerDisabled(disabled) {
    const datePicker = document.getElementById('DatePicker');
    const datePickerBtn = document.getElementById('DatePickerBtn');
    if (datePicker) datePicker.disabled = disabled;
    if (datePickerBtn) {
        datePickerBtn.disabled = disabled;
        datePickerBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
}

export function clearShuffleCandidates() {
    _shuffleCandidateGeneration++;
    _shuffleCandidateQueue.length = 0;
}

export function resetShuffleSession() {
    clearShuffleCandidates();
    _shuffleBackStack.length = 0;
    _shuffleForwardStack.length = 0;
}

function _shuffleDateKey(date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime();
}

function _pushBoundedShuffleEntry(stack, entry) {
    const maxDepth = _deps.getConfig().SHUFFLE_HISTORY_MAX || 200;
    stack.push(entry);
    if (stack.length > maxDepth) {
        stack.splice(0, stack.length - maxDepth);
    }
}

function _pushShuffleHistory(date) {
    if (!date) return;
    const entry = new Date(date);
    entry.setHours(12, 0, 0, 0);
    const previous = _shuffleBackStack[_shuffleBackStack.length - 1];
    if (!previous || _shuffleDateKey(previous) !== _shuffleDateKey(entry)) {
        _pushBoundedShuffleEntry(_shuffleBackStack, entry);
    }
}

function _pushShuffleForwardHistory(date) {
    if (!date) return;
    const entry = new Date(date);
    entry.setHours(12, 0, 0, 0);
    const next = _shuffleForwardStack[_shuffleForwardStack.length - 1];
    if (!next || _shuffleDateKey(next) !== _shuffleDateKey(entry)) {
        _pushBoundedShuffleEntry(_shuffleForwardStack, entry);
    }
}

function _pickRandomAnyDate() {
    const utils = _deps.getUtils();
    const config = _deps.getConfig();
    if (!utils) return null;

    const showFavs = document.getElementById('showfavs')?.checked;
    if (showFavs) {
        const favs = utils.getFavorites();
        const formattedComicDate = _deps.getFormattedComicDate();
        const pool = favs.filter(d => d !== formattedComicDate);
        if (pool.length === 0) return null;
        return utils.dateFromFavoriteDateString(pool[Math.floor(Math.random() * pool.length)]);
    }
    const start = utils.isSpanishMode()
        ? utils.dateFromISODateString(config.GARFIELD_START_ES)
        : utils.dateFromISODateString(config.GARFIELD_START_EN);
    start.setHours(0, 0, 0, 0);
    const end = utils.getEasternDate();
    end.setHours(0, 0, 0, 0);
    const span = end.getTime() - start.getTime();
    if (span <= 0) return null;
    const currentTs = new Date(_deps.getCurrentDate()).setHours(0, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
        const pick = new Date(start.getTime() + Math.random() * span);
        pick.setHours(12, 0, 0, 0);
        if (pick.getTime() !== new Date(currentTs).setHours(12, 0, 0, 0)) return pick;
    }
    return new Date(start.getTime() + Math.random() * span);
}

function _shiftShuffleCandidate() {
    return _shuffleCandidateQueue.shift() || null;
}

export function pickShuffleCandidates() {
    const utils = _deps.getUtils();
    const config = _deps.getConfig();
    if (_deps.isTop10Mode() || !utils?.shouldPrefetch()) return;

    const generation = ++_shuffleCandidateGeneration;
    _shuffleCandidateQueue.length = 0;

    const language = utils.isSpanishMode() ? 'es' : 'en';
    const source = utils.getPreferredSource();
    const showFavs = document.getElementById('showfavs')?.checked || false;

    const warmImageCache = (imageUrl) => {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = imageUrl;
    };

    const fetchAndCache = (date) => {
        getAuthenticatedComic(date, language, source, {
            silent: true,
            maxSources: 1,
            disableTodayFallback: true
        }).then(result => {
            const stateStillMatches =
                generation === _shuffleCandidateGeneration &&
                isShuffleEnabled() &&
                (utils.isSpanishMode() ? 'es' : 'en') === language &&
                utils.getPreferredSource() === source &&
                (document.getElementById('showfavs')?.checked || false) === showFavs;

            if (!stateStillMatches) return;

            if (result.success && result.imageUrl) {
                warmImageCache(result.imageUrl);
                const alreadyQueued = _shuffleCandidateQueue.some(candidate => _shuffleDateKey(candidate) === _shuffleDateKey(date));
                if (!alreadyQueued && _shuffleCandidateQueue.length < config.PREFETCH_SHUFFLE_QUEUE_SIZE) {
                    _shuffleCandidateQueue.push(date);
                    updateToolbarModeControls();
                }
            }
        }).catch(() => {});
    };

    const pickedKeys = new Set();
    const candidates = [];
    const maxAttempts = config.PREFETCH_SHUFFLE_QUEUE_SIZE * 6;

    for (let attempt = 0; candidates.length < config.PREFETCH_SHUFFLE_QUEUE_SIZE && attempt < maxAttempts; attempt += 1) {
        const next = _pickRandomAnyDate();
        if (!next) break;

        const key = _shuffleDateKey(next);
        if (pickedKeys.has(key)) continue;

        pickedKeys.add(key);
        candidates.push(next);
    }

    candidates.forEach((candidate, index) => {
        setTimeout(() => {
            if (generation === _shuffleCandidateGeneration) fetchAndCache(candidate);
        }, index * config.PREFETCH_STAGGER_MS);
    });
}

export function RandomNewerClick() {
    const utils = _deps.getUtils();
    if (!utils?.canShuffleNavigate('next')) return;

    const target = _shuffleForwardStack.pop() || _shiftShuffleCandidate() || _pickRandomAnyDate();
    if (!target) return;

    _pushShuffleHistory(_deps.getCurrentDate());
    _deps.setCurrentDate(new Date(target));
    clearShuffleCandidates();
    _deps.compareDates();
    _deps.showComic();
}

export function RandomOlderClick() {
    const target = _shuffleBackStack.pop();
    if (!target) return;

    _pushShuffleForwardHistory(_deps.getCurrentDate());
    _deps.setCurrentDate(new Date(target));
    clearShuffleCandidates();
    _deps.compareDates();
    _deps.showComic();
}

export function _jumpToFirstShuffle() {
    if (_shuffleBackStack.length === 0) return;

    let current = _deps.getCurrentDate();
    while (_shuffleBackStack.length > 0) {
        _pushShuffleForwardHistory(current);
        current = new Date(_shuffleBackStack.pop());
    }
    _deps.setCurrentDate(current);

    clearShuffleCandidates();
    _deps.compareDates();
    _deps.showComic();
}

export function _jumpToLastShuffle() {
    if (_shuffleForwardStack.length === 0) return;

    let current = _deps.getCurrentDate();
    while (_shuffleForwardStack.length > 0) {
        _pushShuffleHistory(current);
        current = new Date(_shuffleForwardStack.pop());
    }
    _deps.setCurrentDate(current);

    clearShuffleCandidates();
    _deps.compareDates();
    _deps.showComic();
}
