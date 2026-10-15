import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { shareComic } from '../../sharing.js';
import { translations } from '../../translations.js';

test('client feature modules stay bounded and the legacy app cannot grow', async () => {
    const root = new URL('../../', import.meta.url);
    for (const file of (await readdir(root)).filter(name => name.endsWith('.js'))) {
        const lines = (await readFile(new URL(file, root), 'utf8')).split(/\r?\n/).length;
        const limit = file === 'app.js' ? 3000 : 800;
        assert.ok(lines <= limit, `${file}: ${lines} lines exceeds ${limit}; extract a focused feature module`);
    }
});

test('sharing takes a committed comic input and reports the empty state in either language', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { location: { href: 'https://garfieldapp.pages.dev/' } };
    try {
        for (const language of ['en', 'es']) {
            const messages = [];
            await shareComic({ comic: null, t: translations[language], showNotification: message => messages.push(message) });
            assert.deepEqual(messages, [translations[language].shareEmpty]);
        }
    } finally {
        globalThis.window = previousWindow;
    }
});

test('sharing a relative local comic URL resolves against window.location.href without proxying', async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const fetchedUrls = [];
    globalThis.window = { location: { href: 'https://garfieldapp.pages.dev/index.html', origin: 'https://garfieldapp.pages.dev' } };
    globalThis.fetch = async url => {
        fetchedUrls.push(String(url));
        return new Response(null, { status: 503 });
    };
    try {
        await shareComic({
            comic: { date: '1978/06/19', imageUrl: './garfield-first.gif' },
            t: translations.en,
            showNotification() {}
        });
        assert.deepEqual(fetchedUrls, ['https://garfieldapp.pages.dev/garfield-first.gif']);
    } finally {
        globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
});