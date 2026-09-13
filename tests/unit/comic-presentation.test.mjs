import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComicImage, loadComicWithFallback, reserveComicSpace, setComicImage } from '../../comicPresentation.js';

test('first comic reserves a daily or Sunday ratio and commits actual decoded dimensions', () => {
    const image = { getAttribute: () => image.src };
    reserveComicSpace(image, new Date(2026, 8, 12));
    assert.deepEqual([image.width, image.height], [900, 270]);
    reserveComicSpace(image, new Date(2026, 8, 13));
    assert.deepEqual([image.width, image.height], [900, 633]);
    setComicImage(image, { imageUrl: 'comic.webp', imageWidth: 1200, imageHeight: 850 });
    assert.deepEqual([image.width, image.height, image.src], [1200, 850, 'comic.webp']);
    reserveComicSpace(image, new Date(2026, 8, 14));
    assert.deepEqual([image.width, image.height], [1200, 850]);
});

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

test('online deadline aborts discovery and selects a decoded fallback', async () => {
    let requestSignal;
    const fallback = { imageUrl: 'first.gif', actualDate: new Date(1978, 5, 19), language: 'en' };
    const result = await loadComicWithFallback({
        date: new Date(), language: 'en', source: 'gocomics', timeoutMs: 10, imageTimeoutMs: 10,
        fetchComic: (date, language, source, options) => {
            requestSignal = options.signal;
            return new Promise(() => {});
        },
        getFallbacks: async () => [{ imageUrl: 'evicted.gif' }, fallback],
        loadImage: async url => { if (url === 'evicted.gif') throw new Error('missing cache'); }
    });
    assert.equal(requestSignal.aborted, true);
    assert.equal(result.imageUrl, fallback.imageUrl);
    assert.equal(result.actualDate, fallback.actualDate);
    assert.equal(result.isFallback, true);
    assert.equal(result.imageReady, true);
});

test('successful online image avoids fallback and cancellation never selects a fallback', async () => {
    const controller = new AbortController();
    let fallbackCalls = 0;
    const options = {
        date: new Date(), language: 'en', source: 'gocomics', timeoutMs: 100, imageTimeoutMs: 10,
        signal: controller.signal,
        getFallbacks: async () => { fallbackCalls++; return []; },
        loadImage: async () => ({ naturalWidth: 900, naturalHeight: 633 }),
        fetchComic: async (date, language, source, request) => {
            await request.validateImage('good.gif');
            return { success: true, imageUrl: 'good.gif' };
        }
    };
    const result = await loadComicWithFallback(options);
    assert.equal(result.imageUrl, 'good.gif');
    assert.deepEqual([result.imageWidth, result.imageHeight], [900, 633]);
    assert.equal(result.imageReady, true);
    controller.abort();
    await assert.rejects(loadComicWithFallback(options), { name: 'AbortError' });
    assert.equal(fallbackCalls, 0);
});

test('cancelling an in-flight image aborts discovery without choosing a fallback', async () => {
    const controller = new AbortController();
    let imageSignal;
    let imageStarted;
    const started = new Promise(resolve => { imageStarted = resolve; });
    const pending = loadComicWithFallback({
        date: new Date(), language: 'en', source: 'gocomics', timeoutMs: 1000, imageTimeoutMs: 1000,
        signal: controller.signal,
        fetchComic: async (date, language, source, request) => {
            await request.validateImage('pending.gif');
            return { success: true, imageUrl: 'pending.gif' };
        },
        loadImage: (url, timeout, signal) => new Promise((resolve, reject) => {
            imageSignal = signal;
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            imageStarted();
        }),
        getFallbacks: () => assert.fail('Cancelled navigation must not select a fallback')
    });
    await started;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(imageSignal.aborted, true);
});