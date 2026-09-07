import { readFavoriteState, mergeFavoriteStates, favoriteDatesFromState, captureFavoriteChanges } from './driveSyncState.js';

const FILE_NAME = 'garfield-favorites.json';
const STATE_PREFIX = 'gDriveFavoriteState:';
const ACTOR_KEY = 'gDriveFavoriteActor';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export function createDriveFavoritesSync({ storage, identify, request, getFavorites, getPreferences, applyPreferences, commitFavorites, onStatus,
    withLock = run => globalThis.navigator?.locks ? navigator.locks.request('garfield-drive-favorites', run) : run()
}) {
    let running = null;
    let requested = false;
    let pullRequested = false;

    async function listFiles(send) {
        const files = [];
        let pageToken;
        do {
            const query = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${FILE_NAME}' and trashed=false`, fields: 'nextPageToken,files(id)', pageSize: '100' });
            if (pageToken) query.set('pageToken', pageToken);
            const response = await send(`${API}?${query}`);
            if (!response.ok) throw new Error(`Drive search failed (${response.status})`);
            const data = await response.json();
            files.push(...(data.files || []));
            pageToken = data.nextPageToken;
        } while (pageToken);
        return files.sort((first, second) => first.id.localeCompare(second.id));
    }

    async function synchronize(pull) {
        const identity = await identify();
        if (!identity) throw new Error('Google account unavailable');
        const send = (url, options = {}) => request(url, {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${identity.accessToken}` }
        });
        const stateKey = STATE_PREFIX + encodeURIComponent(identity.accountId);
        let actor = storage.getItem(ACTOR_KEY);
        if (!actor) {
            actor = crypto.randomUUID();
            storage.setItem(ACTOR_KEY, actor);
        }
        let persisted;
        try { persisted = JSON.parse(storage.getItem(stateKey)); } catch (_) {}
        let snapshot = persisted?.snapshot || getFavorites();
        let entries = readFavoriteState(persisted || { favorites: snapshot });
        const capture = () => {
            const current = getFavorites();
            entries = captureFavoriteChanges(entries, snapshot, current, actor);
            snapshot = current;
            storage.setItem(stateKey, JSON.stringify({ version: 3, entries, snapshot }));
        };
        capture();

        for (let attempt = 0; attempt < 3; attempt++) {
            const files = await listFiles(send);
            const remote = [];
            for (const file of files) {
                const response = await send(`${API}/${encodeURIComponent(file.id)}?alt=media`);
                if (!response.ok) throw new Error(`Drive read failed (${response.status})`);
                const data = await response.json();
                if (!Array.isArray(data) && (!data || !Array.isArray(data.favorites))) throw new Error('Invalid Drive favorites file');
                remote.push({ ...file, data, etag: response.headers.get('ETag') });
            }
            capture();
            entries = mergeFavoriteStates(entries, ...remote.map(file => readFavoriteState(file.data)));
            const currentIdentity = await identify();
            if (currentIdentity?.accountId !== identity.accountId) throw new Error('Google account changed during sync');
            const favorites = favoriteDatesFromState(entries);
            const preferencesBeforeWrite = JSON.stringify(getPreferences());
            const preferences = pull && remote[0]?.data.preferences ? remote[0].data.preferences : getPreferences();
            const content = JSON.stringify({ version: 3, entries, favorites, preferences });
            let response;
            if (remote.length) {
                if (!remote[0].etag) throw new Error('Drive did not provide a revision validator');
                response = await send(`${UPLOAD}/${encodeURIComponent(remote[0].id)}?uploadType=media`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': remote[0].etag }, body: content
                });
                if (response.status === 412) continue;
            } else {
                const boundary = `garfield_${crypto.randomUUID()}`;
                const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
                response = await send(`${UPLOAD}?uploadType=multipart`, {
                    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                    body: `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
                });
            }
            if (!response.ok) throw new Error(`Drive write failed (${response.status})`);
            if ((await identify())?.accountId !== identity.accountId) throw new Error('Google account changed during sync');
            const latest = getFavorites();
            const finalEntries = captureFavoriteChanges(entries, snapshot, latest, actor);
            const finalFavorites = favoriteDatesFromState(finalEntries);
            const changedDuringWrite = JSON.stringify(latest) !== JSON.stringify(snapshot);
            const preferencesChanged = JSON.stringify(getPreferences()) !== preferencesBeforeWrite;
            storage.setItem(stateKey, JSON.stringify({ version: 3, entries: finalEntries, snapshot: finalFavorites }));
            commitFavorites(finalFavorites);
            if (pull && preferences && !preferencesChanged) applyPreferences(preferences);
            if (changedDuringWrite || preferencesChanged || !remote.length) requested = true;
            for (const duplicate of remote.slice(1)) {
                if (!duplicate.etag) continue;
                const deleted = await send(`${API}/${encodeURIComponent(duplicate.id)}`, { method: 'DELETE', headers: { 'If-Match': duplicate.etag } });
                if (!deleted.ok && deleted.status !== 404) requested = true;
            }
            return;
        }
        throw new Error('Drive changed repeatedly; sync remains pending');
    }

    return function sync(pull = false) {
        requested = true;
        pullRequested ||= pull;
        if (running) return running;
        const run = async () => {
            try {
                let passes = 0;
                while (requested && passes++ < 5) {
                    requested = false;
                    const shouldPull = pullRequested;
                    pullRequested = false;
                    await synchronize(shouldPull);
                }
                if (requested) throw new Error('More changes remain to sync');
                onStatus(false);
                return true;
            } catch (error) {
                onStatus(true, error);
                return false;
            } finally {
                running = null;
            }
        };
        running = withLock(run);
        return running;
    };
}