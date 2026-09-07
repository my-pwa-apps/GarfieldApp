import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComicImage } from '../../comicPresentation.js';

test('comic presentation rejects failed, empty, undecodable and stalled images', async () => {
    const previous = globalThis.Image;
    try {
        for (const mode of ['error', 'empty', 'decode', 'timeout', 'ready']) {
            globalThis.Image = class {
                naturalWidth = mode === 'empty' ? 0 : 100;
                complete = false;
                set src(value) {
                    this.url = value;
                    if (mode !== 'timeout') queueMicrotask(() => mode === 'error' ? this.onerror?.() : this.onload?.());
                }
                async decode() { if (mode === 'decode') throw new Error('decode'); }
            };
            const result = loadComicImage('comic.gif', 10);
            if (mode === 'ready') assert.equal((await result).url, 'comic.gif');
            else await assert.rejects(result);
        }
    } finally {
        globalThis.Image = previous;
    }
});