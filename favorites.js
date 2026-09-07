const FIRST_COMIC = '1978/06/19';
const easternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
});

function easternToday() {
    const today = Object.fromEntries(easternFormatter.formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${today.year}/${today.month}/${today.day}`;
}

export function normalizeFavoriteDate(value, today = easternToday()) {
    if (typeof value !== 'string' || !/^\d{4}([/-])\d{2}\1\d{2}$/.test(value)) return null;
    const date = value.replaceAll('-', '/');
    const [year, month, day] = date.split('/').map(Number);
    const parsed = new Date(year, month - 1, day, 12);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return date >= FIRST_COMIC && date <= today ? date : null;
}

export function normalizeFavorites(value) {
    if (!Array.isArray(value)) return [];
    const today = easternToday();
    return [...new Set(value.map(entry => normalizeFavoriteDate(
        typeof entry === 'object' && entry !== null ? entry.date : entry, today
    )).filter(Boolean))];
}