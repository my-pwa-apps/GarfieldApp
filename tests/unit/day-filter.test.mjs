import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: key => { storage.delete(key); }
};
globalThis.document = { getElementById: () => null, documentElement: { lang: 'en' } };

const {
    filterFavoritesByDay, getDayFilter, isDateAllowed, randomAllowedDate, setDayFilter, snapToAllowedDate, stepToAllowedDate
} = await import('../../dayFilter.js');

const day = (y, m, d) => new Date(y, m - 1, d, 12);
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test.beforeEach(() => storage.clear());

test('the filter defaults to all days and rejects unknown values', () => {
    assert.equal(getDayFilter(), 'all');
    assert.equal(setDayFilter('sundays'), 'sundays');
    assert.equal(getDayFilter(), 'sundays');
    assert.equal(setDayFilter('fridays'), 'all');
    storage.set('dayFilter', 'bogus');
    assert.equal(getDayFilter(), 'all');
});

test('allowed days follow the selected filter', () => {
    const sunday = day(2024, 1, 7);
    const monday = day(2024, 1, 8);
    assert.equal(isDateAllowed(sunday, 'all') && isDateAllowed(monday, 'all'), true);
    assert.equal(isDateAllowed(sunday, 'sundays'), true);
    assert.equal(isDateAllowed(monday, 'sundays'), false);
    assert.equal(isDateAllowed(sunday, 'no-sundays'), false);
    assert.equal(isDateAllowed(monday, 'no-sundays'), true);
});

test('stepping skips days hidden by the filter', () => {
    const saturday = day(2024, 1, 6);
    assert.equal(iso(stepToAllowedDate(saturday, 1, 'no-sundays')), '2024-01-08');
    assert.equal(iso(stepToAllowedDate(day(2024, 1, 8), -1, 'no-sundays')), '2024-01-06');
    assert.equal(iso(stepToAllowedDate(day(2024, 1, 7), 1, 'sundays')), '2024-01-14');
    assert.equal(iso(stepToAllowedDate(day(2024, 1, 10), -1, 'sundays')), '2024-01-07');
    assert.equal(iso(stepToAllowedDate(saturday, 1, 'all')), '2024-01-07');
});

test('snapping picks the nearest allowed day inside the range', () => {
    const min = day(1978, 6, 19); // Monday
    const max = day(2024, 1, 10); // Wednesday
    assert.equal(iso(snapToAllowedDate(day(2023, 12, 28), { min, max, filter: 'sundays' })), '2023-12-31');
    assert.equal(iso(snapToAllowedDate(day(2023, 12, 27), { min, max, filter: 'sundays' })), '2023-12-24');
    assert.equal(iso(snapToAllowedDate(min, { min, max, preferStep: 1, filter: 'sundays' })), '1978-06-25');
    assert.equal(iso(snapToAllowedDate(max, { min, max, preferStep: -1, filter: 'sundays' })), '2024-01-07');
    assert.equal(iso(snapToAllowedDate(day(2024, 1, 20), { min, max, filter: 'sundays' })), '2024-01-07');
    assert.equal(iso(snapToAllowedDate(day(2024, 1, 7), { min, max, preferStep: 1, filter: 'no-sundays' })), '2024-01-08');
    assert.equal(snapToAllowedDate(day(2024, 1, 8), { min: day(2024, 1, 8), max: day(2024, 1, 9), filter: 'sundays' }), null);
});

test('random picks stay on allowed days and cover the whole range', () => {
    const start = day(2024, 1, 1);
    const end = day(2024, 1, 31);
    const sundays = new Set();
    for (let i = 0; i < 200; i += 1) {
        const pick = randomAllowedDate(start, end, { filter: 'sundays' });
        assert.equal(pick.getDay(), 0);
        sundays.add(iso(pick));
    }
    assert.deepEqual([...sundays].sort(), ['2024-01-07', '2024-01-14', '2024-01-21', '2024-01-28']);

    for (let i = 0; i < 200; i += 1) {
        const pick = randomAllowedDate(start, end, { filter: 'no-sundays' });
        assert.notEqual(pick.getDay(), 0);
        assert.ok(pick >= start && pick <= end);
    }
    assert.equal(iso(randomAllowedDate(start, end, { filter: 'all', random: () => 0 })), '2024-01-01');
    assert.equal(iso(randomAllowedDate(start, end, { filter: 'all', random: () => 0.999 })), '2024-01-31');
});

test('favorites are filtered by weekday without touching the stored list', () => {
    const favorites = ['2024/01/06', '2024/01/07', '2024/01/08'];
    assert.deepEqual(filterFavoritesByDay(favorites, 'all'), favorites);
    assert.deepEqual(filterFavoritesByDay(favorites, 'sundays'), ['2024/01/07']);
    assert.deepEqual(filterFavoritesByDay(favorites, 'no-sundays'), ['2024/01/06', '2024/01/08']);
});
