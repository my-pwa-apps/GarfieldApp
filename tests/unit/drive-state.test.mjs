import assert from 'node:assert/strict';
import test from 'node:test';
import { readFavoriteState, mergeFavoriteStates, favoriteDatesFromState, captureFavoriteChanges } from '../../driveSyncState.js';

test('independent additions converge and deleted favorites stay deleted on stale reconnect', () => {
    const original = readFavoriteState(['2024/01/01']);
    const first = captureFavoriteChanges(original, ['2024/01/01'], ['2024/01/01', '2024/01/02'], 'first');
    const second = captureFavoriteChanges(original, ['2024/01/01'], ['2024/01/03'], 'second');
    const merged = mergeFavoriteStates(first, second);
    assert.deepEqual(favoriteDatesFromState(merged), ['2024/01/02', '2024/01/03']);
    assert.deepEqual(mergeFavoriteStates(second, first), merged);
    assert.deepEqual(favoriteDatesFromState(mergeFavoriteStates(merged, original)), ['2024/01/02', '2024/01/03']);
    const readded = captureFavoriteChanges(merged, ['2024/01/02', '2024/01/03'], ['2024/01/01', '2024/01/02', '2024/01/03'], 'first');
    assert.equal(favoriteDatesFromState(readded).length, 3);
});

test('legacy objects normalize and malformed remote entries cannot poison state', () => {
    assert.deepEqual(favoriteDatesFromState(readFavoriteState([{ date: '2024-02-29' }, { date: '2024/02/31' }])), ['2024/02/29']);
    assert.deepEqual(readFavoriteState({ version: 3, entries: JSON.parse('{"__proto__":{"clock":1},"2024/01/01":{"clock":-1,"actor":"x","removed":false}}') }), {});
});