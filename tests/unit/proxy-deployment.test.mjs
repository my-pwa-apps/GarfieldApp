import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shareComic } from '../../sharing.js';
import { translations } from '../../translations.js';

const origin = 'https://garfieldapp-corsproxy.garfieldapp.workers.dev';

test('the Garfield deployment and active clients cannot target the shared proxy', async () => {
    const config = await readFile(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
    assert.match(config, /^name = "garfieldapp-corsproxy"$/m);
    assert.match(config, /^account_id = "bb3893fab785508c512caa687c340bda"$/m);
    assert.match(config, /^workers_dev = true$/m);
    for (const file of ['comicExtractor.js', 'tests/support/live-worker-health.cjs']) {
        const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
        assert.ok(source.includes(origin), file);
        assert.ok(!source.includes('https://corsproxy.garfieldapp.workers.dev'), file);
    }
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    const connections = html.match(/connect-src ([^;]+)/)[1].split(' ');
    assert.ok(connections.includes(origin));
    assert.ok(!connections.includes('https://corsproxy.garfieldapp.workers.dev'));
    assert.ok(html.includes(`rel="preconnect" href="${origin}"`));
});

test('sharing old cached proxy URLs fetches the original image through the dedicated Worker', async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const requests = [];
    globalThis.window = { location: { href: 'https://garfieldapp.pages.dev/' } };
    globalThis.fetch = async url => {
        requests.push(url);
        return new Response(null, { status: 503 });
    };
    try {
        const target = 'https://picayune.uclick.com/comics/ga/2026/ga260907.gif';
        for (const query of [encodeURIComponent(target), `url=${encodeURIComponent(target)}`]) {
            await shareComic({
                comic: { date: '2026/09/07', imageUrl: `https://corsproxy.garfieldapp.workers.dev/?${query}` },
                t: translations.en, showNotification() {}
            });
        }
        assert.deepEqual(requests, [ `${origin}/?${encodeURIComponent(target)}`, `${origin}/?${encodeURIComponent(target)}` ]);
    } finally {
        globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
});