import assert from 'node:assert/strict';
import test from 'node:test';
import { createDriveFavoritesSync } from '../../driveFavorites.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

// Mirrors real Drive v3: no ETag header, If-Match ignored, and a `version` that increases on every write.
function createRemote(initial = [{ id: 'canonical', data: { version: 2, favorites: ['2024/01/01'] } }]) {
    const files = new Map(initial.map(file => [file.id, { data: file.data, version: 1 }]));
    const remote = { files, writes: 0, fail: false, hold: null };
    remote.request = async (url, options = {}) => {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        const id = parsed.pathname.split('/').at(-1);
        if (method === 'GET' && id === 'files') return Response.json({ files: [...files].map(([id, file]) => ({ id, version: String(file.version) })) });
        const file = files.get(id);
        if (!file && method !== 'POST') return new Response('', { status: 404 });
        if (method === 'GET' && parsed.searchParams.get('fields') === 'version') return Response.json({ version: String(file.version) });
        if (method === 'GET') return Response.json(file.data);
        if (method === 'DELETE') {
            files.delete(id);
            return new Response(null, { status: 204 });
        }
        remote.writes++;
        if (remote.hold) await remote.hold();
        if (remote.fail) return new Response('', { status: 503 });
        if (method === 'POST') {
            const content = options.body.split('\r\n\r\n')[2].split('\r\n--')[0];
            files.set(`created-${remote.writes}`, { data: JSON.parse(content), version: 1 });
            return Response.json({ id: `created-${remote.writes}` });
        }
        file.data = JSON.parse(options.body);
        file.version++;
        return Response.json({ version: String(file.version) });
    };
    return remote;
}

function device(remote, favorites = ['2024/01/01']) {
    const storage = new Map();
    const device = { favorites, pending: false };
    device.sync = createDriveFavoritesSync({
        withLock: run => run(),
        storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        identify: async () => ({ accountId: 'reader', accessToken: 'token' }),
        request: remote.request,
        getFavorites: () => [...device.favorites], getPreferences: () => ({ spanish: false }),
        applyPreferences() {}, commitFavorites: favorites => { device.favorites = favorites; },
        onStatus: pending => { device.pending = pending; }
    });
    return device;
}

test('overlapping local sync requests cannot complete uploads out of order', async () => {
    const remote = createRemote();
    const reader = device(remote);
    const started = deferred();
    const release = deferred();
    remote.hold = async () => { started.resolve(); await release.promise; };
    const first = reader.sync();
    await started.promise;
    reader.favorites.push('2024/01/02');
    const second = reader.sync();
    assert.equal(first, second);
    assert.equal(remote.writes, 1);
    remote.hold = null;
    release.resolve();
    assert.equal(await first, true);
    assert.deepEqual(remote.files.get('canonical').data.favorites, ['2024/01/01', '2024/01/02']);
});

test('two-device delete and stale reconnect converge without resurrection', async () => {
    const remote = createRemote();
    const first = device(remote);
    const second = device(remote);
    await first.sync(true);
    await second.sync(true);
    first.favorites = [];
    assert.equal(await first.sync(), true);
    assert.equal(await second.sync(true), true);
    assert.deepEqual(second.favorites, []);
    assert.deepEqual(remote.files.get('canonical').data.favorites, []);
});

test('concurrent device additions retry revision conflicts without losing either addition', async () => {
    const remote = createRemote();
    const first = device(remote);
    const second = device(remote);
    await first.sync(true);
    await second.sync(true);
    const writesBefore = remote.writes;
    first.favorites.push('2024/01/02');
    second.favorites.push('2024/01/03');
    await Promise.all([first.sync(), second.sync()]);
    assert.ok(remote.writes - writesBefore > 2, 'a conflicting writer must re-merge and write again');
    assert.deepEqual(remote.files.get('canonical').data.favorites, ['2024/01/01', '2024/01/02', '2024/01/03']);
});

test('existing Drive favorites are imported on a fresh device even though Drive sends no ETag', async () => {
    const remote = createRemote([{ id: 'legacy', data: { favorites: ['2020/05/05', '2021/06/06'], preferences: { spanish: true } } }]);
    const fresh = device(remote, ['2024/01/01']);
    assert.equal(await fresh.sync(true), true);
    assert.equal(fresh.pending, false);
    assert.deepEqual(fresh.favorites, ['2020/05/05', '2021/06/06', '2024/01/01']);
    assert.deepEqual(remote.files.get('legacy').data.favorites, ['2020/05/05', '2021/06/06', '2024/01/01']);
});

test('duplicate creation files are merged before cleanup and initial creation settles', async () => {
    const remote = createRemote([
        { id: 'first', data: ['2024/01/01'] },
        { id: 'second', data: [{ date: '2024/01/02' }] }
    ]);
    assert.equal(await device(remote, []).sync(true), true);
    assert.equal(remote.files.size, 1);
    assert.deepEqual(remote.files.get('first').data.favorites, ['2024/01/01', '2024/01/02']);
    const empty = createRemote([]);
    assert.equal(await device(empty).sync(), true);
    assert.equal(empty.files.size, 1);
});

test('failed deletion upload stays pending and retries without losing local intent', async () => {
    const remote = createRemote();
    const reader = device(remote);
    await reader.sync(true);
    reader.favorites = [];
    remote.fail = true;
    assert.equal(await reader.sync(), false);
    assert.equal(reader.pending, true);
    remote.fail = false;
    assert.equal(await reader.sync(), true);
    assert.equal(reader.pending, false);
    assert.deepEqual(remote.files.get('canonical').data.favorites, []);
});