import { normalizeFavoriteDate, normalizeFavorites } from './favorites.js';

export function readFavoriteState(data) {
    const entries = {};
    if (data?.version === 3 && data.entries && typeof data.entries === 'object') {
        for (const [date, entry] of Object.entries(data.entries)) {
            if (normalizeFavoriteDate(date) !== date || !entry || !Number.isSafeInteger(entry.clock) || entry.clock < 0 || entry.clock >= Number.MAX_SAFE_INTEGER || typeof entry.removed !== 'boolean' || typeof entry.actor !== 'string') continue;
            entries[date] = { clock: entry.clock, removed: entry.removed, actor: entry.actor.slice(0, 128) };
        }
    } else {
        for (const date of normalizeFavorites(Array.isArray(data) ? data : data?.favorites)) {
            entries[date] = { clock: 0, removed: false, actor: 'legacy' };
        }
    }
    return entries;
}

export function mergeFavoriteStates(...states) {
    const merged = {};
    for (const entries of states) {
        for (const [date, incoming] of Object.entries(entries)) {
            const current = merged[date];
            if (!current || incoming.clock > current.clock ||
                (incoming.clock === current.clock && (Number(incoming.removed) > Number(current.removed) ||
                (incoming.removed === current.removed && incoming.actor > current.actor)))) merged[date] = { ...incoming };
        }
    }
    return merged;
}

export function favoriteDatesFromState(entries) {
    return Object.keys(entries).filter(date => !entries[date].removed).sort();
}

export function captureFavoriteChanges(entries, previous, current, actor) {
    const updated = mergeFavoriteStates(entries);
    const before = new Set(normalizeFavorites(previous));
    const after = new Set(normalizeFavorites(current));
    const clock = Math.max(0, ...Object.values(updated).map(entry => entry.clock)) + 1;
    for (const date of new Set([...before, ...after])) {
        if (before.has(date) !== after.has(date)) updated[date] = { clock, removed: !after.has(date), actor };
    }
    return updated;
}