import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('SQLite Durable Object transactions roll back failed votes and migrations', async () => {
    const workerPath = fileURLToPath(new URL('../../worker/favorites-api/index.js', import.meta.url));
    const entryPath = fileURLToPath(new URL('../../worker/favorites-api/runtime-test.js', import.meta.url));
    const runtime = new Miniflare(convertV4MiniflareOptions({
        modules: [
            { type: 'ESModule', path: workerPath, contents: await readFile(workerPath, 'utf8') },
            { type: 'ESModule', path: entryPath, contents: `
                import { FavoritesLeaderboard } from './index.js';
                export class TestLeaderboard extends FavoritesLeaderboard {
                    async resolveIdentity() { return { key: 'runtime-user' }; }
                    async fetch(request) {
                        if (new URL(request.url).pathname === '/inspect') {
                            return Response.json(Object.fromEntries(await this.state.storage.list()));
                        }
                        this.fail = request.headers.has('test-fail');
                        return super.fetch(request);
                    }
                    async refreshTop(changes, storage) {
                        await super.refreshTop(changes, storage);
                        if (this.fail) throw new Error('Injected failure after leaderboard writes');
                    }
                }
                export default { fetch(request, env) {
                    return env.TEST.get(env.TEST.idFromName(request.headers.get('test-object'))).fetch(request);
                } }`
            }
        ].reverse(),
        compatibilityDate: '2026-08-18',
        durableObjects: { TEST: { className: 'TestLeaderboard', useSQLite: true } }
    }));
    try {
        for (const route of ['/favorite', '/migrate']) {
            const headers = { 'Content-Type': 'application/json', 'test-object': route };
            const body = JSON.stringify(route === '/favorite'
                ? { date: '2024/01/01', action: 'add' } : { dates: ['2024/01/01'] });
            const failed = await runtime.dispatchFetch(`http://test${route}`, { method: 'POST', headers: { ...headers, 'test-fail': 'true' }, body });
            assert.equal(failed.status, 500);
            const rolledBack = await (await runtime.dispatchFetch('http://test/inspect', { headers })).json();
            assert.deepEqual(Object.keys(rolledBack).filter(key => !key.startsWith('rate:')), []);
            for (let attempt = 0; attempt < 2; attempt++) {
                const retry = await runtime.dispatchFetch(`http://test${route}`, { method: 'POST', headers, body });
                assert.equal(retry.status, 200);
            }
            const committed = await (await runtime.dispatchFetch('http://test/inspect', { headers })).json();
            assert.equal(committed['count:google-v1:2024/01/01'].count, 1);
            assert.equal(committed['top:google-v1'][0].count, 1);
        }
    } finally {
        await runtime.dispose();
    }
});