import { CONFIG } from './config.js';
import { translations } from './translations.js';

// "Days to show" preference: every strip, only the Sunday colour strips, or
// only the daily (Monday–Saturday) strips. Navigation, random/shuffle picks,
// favorites-only browsing and the date picker all route through these helpers.
export const DAY_FILTERS = Object.freeze(['all', 'sundays', 'no-sundays']);

const OPTION_LABEL_KEYS = Object.freeze({
    all: 'dayFilterAll',
    sundays: 'dayFilterSundays',
    'no-sundays': 'dayFilterNoSundays'
});

const MAX_RANDOM_ATTEMPTS = 50;

export function getValidDayFilter(value) {
    return DAY_FILTERS.includes(value) ? value : 'all';
}

export function getDayFilter() {
    try {
        return getValidDayFilter(localStorage.getItem(CONFIG.STORAGE_KEYS.DAY_FILTER));
    } catch {
        return 'all';
    }
}

export function setDayFilter(value) {
    const filter = getValidDayFilter(value);
    try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.DAY_FILTER, filter);
    } catch { /* storage blocked — the in-memory control still reflects the choice */ }
    const select = document.getElementById('dayFilter');
    if (select) select.value = filter;
    return filter;
}

export function isDateAllowed(date, filter = getDayFilter()) {
    if (filter === 'sundays') return date.getDay() === 0;
    if (filter === 'no-sundays') return date.getDay() !== 0;
    return true;
}

function dayIndex(date) {
    return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function addDays(date, days) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    result.setDate(result.getDate() + days);
    return result;
}

function favoriteToDate(favorite) {
    const [year, month, day] = favorite.split('/').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function filterFavoritesByDay(favorites, filter = getDayFilter()) {
    if (filter === 'all') return favorites;
    return favorites.filter(favorite => isDateAllowed(favoriteToDate(favorite), filter));
}

/**
 * The nearest allowed day strictly after (step 1) or before (step -1) `date`.
 * Every filter allows at least one weekday, so this terminates within a week.
 */
export function stepToAllowedDate(date, step, filter = getDayFilter()) {
    let next = addDays(date, step);
    while (!isDateAllowed(next, filter)) next = addDays(next, step);
    return next;
}

/**
 * Move `date` onto an allowed day inside [min, max]. `preferStep` picks the
 * search direction (1 = on/after, -1 = on/before, 0 = nearest, ties earlier).
 * Returns null when the range holds no allowed day.
 */
export function snapToAllowedDate(date, { min = null, max = null, preferStep = 0, filter = getDayFilter() } = {}) {
    const inRange = candidate => (!min || dayIndex(candidate) >= dayIndex(min)) && (!max || dayIndex(candidate) <= dayIndex(max));
    const current = addDays(date, 0);
    if (isDateAllowed(current, filter) && inRange(current)) return current;

    const before = stepToAllowedDate(current, -1, filter);
    const after = stepToAllowedDate(current, 1, filter);
    const candidates = preferStep > 0 ? [after, before]
        : preferStep < 0 ? [before, after]
            : [before, after].sort((a, b) => Math.abs(dayIndex(a) - dayIndex(current)) - Math.abs(dayIndex(b) - dayIndex(current)));

    const inBounds = candidates.find(inRange);
    if (inBounds) return inBounds;

    // The date sits outside the range: clamp to the closest allowed edge.
    if (min && dayIndex(current) < dayIndex(min)) return snapToAllowedDate(min, { min, max, preferStep: 1, filter });
    if (max && dayIndex(current) > dayIndex(max)) return snapToAllowedDate(max, { min, max, preferStep: -1, filter });
    return null;
}

/**
 * Uniformly pick an allowed day inside [start, end] (inclusive).
 */
export function randomAllowedDate(start, end, { filter = getDayFilter(), random = Math.random } = {}) {
    const from = dayIndex(start);
    const to = dayIndex(end);
    if (to < from) return null;

    if (filter === 'sundays') {
        const first = snapToAllowedDate(start, { min: start, max: end, preferStep: 1, filter });
        if (!first) return null;
        const count = Math.floor((to - dayIndex(first)) / 7) + 1;
        return addDays(first, 7 * Math.floor(random() * count));
    }

    for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
        const pick = addDays(start, Math.floor(random() * (to - from + 1)));
        if (isDateAllowed(pick, filter)) return pick;
    }
    return snapToAllowedDate(start, { min: start, max: end, preferStep: 1, filter });
}

function translateDayFilterControl() {
    const select = document.getElementById('dayFilter');
    if (!select) return;
    const t = translations[document.documentElement.lang === 'es' ? 'es' : 'en'] || translations.en;
    for (const option of select.options) {
        const key = OPTION_LABEL_KEYS[option.value];
        if (key && t[key]) option.textContent = t[key];
    }
}

/**
 * Restore the persisted choice into the settings control and report changes.
 * @param {(filter: string) => void} onChange
 */
export function initializeDayFilterControl(onChange) {
    const select = document.getElementById('dayFilter');
    if (!select) return;
    select.value = getDayFilter();
    translateDayFilterControl();
    window.addEventListener('language-changed', translateDayFilterControl);
    select.addEventListener('change', () => onChange(setDayFilter(select.value)));
}
