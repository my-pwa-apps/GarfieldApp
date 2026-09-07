import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { shareComic } from '../../sharing.js';
import { translations } from '../../translations.js';

test('client feature modules stay bounded and the legacy app cannot grow', async () => {
    const root = new URL('../../', import.meta.url);
    for (const file of (await readdir(root)).filter(name => name.endsWith('.js'))) {
        const lines = (await readFile(new URL(file, root), 'utf8')).split(/\r?\n/).length;
        const limit = file === 'app.js' ? 4850 : 800;
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