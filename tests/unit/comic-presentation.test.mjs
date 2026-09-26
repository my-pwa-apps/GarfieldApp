import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
    createTransitionClone,
    describeComic,
    getAdjacentComicDirection,
    loadComicImage,
    loadComicWithFallback,
    prefersReducedMotion,
    reserveComicSpace,
    setComicImage,
    startComicMorph,
    transitionComicImage
} from '../../comicPresentation.js';

function fakeImage(events, name) {
    const classes = new Set();
    const element = {
        alt: `${name} alt`,
        attributes: new Map([['id', name]]),
        style: {},
        classList: {
            add: (...names) => names.forEach(n => { classes.add(n); events.push(`${name}+${n}`); }),
            remove: (...names) => names.forEach(n => classes.delete(n)),
            contains: n => classes.has(n)
        },
        get offsetHeight() { events.push(`${name}:layout`); return 1; },
        removeAttribute: attribute => element.attributes.delete(attribute),
        setAttribute: (attribute, value) => element.attributes.set(attribute, value),
        remove: () => events.push(`${name}:removed`),
        cloneNode: () => {
            const clone = fakeImage(events, 'clone');
            clone.classList.add('slide-in-left', 'no-transition');
            events.length = 0;
            return clone;
        }
    };
    return element;
}

test('comic transitions share one sequence for slide, morph and reduced motion', async () => {
    const previousFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = callback => callback();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const run = (options) => {
            const events = [];
            const image = fakeImage(events, 'comic');
            const appended = [];
            const done = transitionComicImage(image, {
                container: { appendChild: clone => { appended.push(clone); events.push('appended'); } },
                cloneClass: { slide: 'slide-clone', morph: 'morph-clone' },
                setImage: () => events.push('setImage'),
                setTransitionsEnabled: enabled => events.push(`transitions:${enabled}`),
                onSwapped: () => events.push('swapped'),
                ...options
            });
            return { events, appended, done };
        };

        const still = run({ animate: false, direction: 'next' });
        await still.done;
        assert.deepEqual(still.events, ['setImage', 'swapped']);
        assert.equal(still.appended.length, 0);

        const morph = run({ animate: true, direction: null });
        mock.timers.tick(600);
        await morph.done;
        assert.deepEqual(morph.events, ['clone+morph-clone', 'appended', 'setImage', 'swapped', 'clone:layout', 'clone+morph-out', 'clone:removed']);
        assert.equal(morph.appended[0].classList.contains('no-transition'), false, 'a morph clone must not inherit a paused slide');
        assert.equal(morph.appended[0].attributes.get('aria-hidden'), 'true');

        const slide = run({ animate: true, direction: 'previous' });
        mock.timers.tick(500);
        await slide.done;
        assert.deepEqual(slide.events, [
            'clone+slide-clone', 'appended', 'transitions:false', 'setImage', 'comic+slide-in-right',
            'comic:layout', 'clone:layout', 'transitions:true', 'clone+slide-out-right', 'swapped', 'clone:removed'
        ]);
        assert.equal(slide.appended[0].classList.contains('slide-in-left'), false);
    } finally {
        mock.timers.reset();
        globalThis.requestAnimationFrame = previousFrame;
    }
});

test('transition clones are hidden from assistive technology without touching the original', () => {
    const attributes = new Map([['id', 'comic']]);
    const clone = {
        alt: 'Garfield for June 19, 1978 (English)',
        removeAttribute: name => attributes.delete(name),
        setAttribute: (name, value) => attributes.set(name, value)
    };
    const original = { alt: clone.alt, cloneNode: deep => { assert.equal(deep, true); return clone; } };

    assert.equal(createTransitionClone(original), clone);
    assert.equal(attributes.has('id'), false);
    assert.equal(attributes.get('aria-hidden'), 'true');
    assert.equal(clone.alt, '');
    assert.equal(original.alt, 'Garfield for June 19, 1978 (English)');
});

test('comic descriptions never mix the interface language with the strip language', () => {
    const date = new Date(1978, 5, 19);
    assert.equal(describeComic(date, 'en', 'en'), 'Garfield for June 19, 1978 (English)');
    assert.equal(describeComic(date, 'es', 'es'), 'Garfield del 19 de junio de 1978 (español)');
    // Spanish interface showing the bundled English fallback strip.
    assert.equal(describeComic(date, 'es', 'en'), 'Garfield del 19 de junio de 1978 (inglés)');
    assert.equal(describeComic(date, 'en', 'es'), 'Garfield for June 19, 1978 (Spanish)');
});

test('reduced motion follows the user preference and defaults to animating', () => {
    const previous = globalThis.matchMedia;
    try {
        delete globalThis.matchMedia;
        assert.equal(prefersReducedMotion(), false);
        globalThis.matchMedia = query => ({ matches: query === '(prefers-reduced-motion: reduce)' });
        assert.equal(prefersReducedMotion(), true);
        globalThis.matchMedia = () => ({ matches: false });
        assert.equal(prefersReducedMotion(), false);
    } finally {
        if (previous) globalThis.matchMedia = previous;
        else delete globalThis.matchMedia;
    }
});

test('comic transitions slide only between adjacent calendar dates', () => {
    const current = new Date(2026, 2, 8);

    assert.equal(getAdjacentComicDirection(current, new Date(2026, 2, 9)), 'next');
    assert.equal(getAdjacentComicDirection(current, new Date(2026, 2, 7)), 'previous');
    assert.equal(getAdjacentComicDirection(current, new Date(2026, 2, 10)), null);
    assert.equal(getAdjacentComicDirection(current, new Date(2025, 11, 31)), null);

    assert.equal(
        getAdjacentComicDirection(new Date(2026, 2, 31), new Date(2026, 3, 1)),
        'next'
    );
});

test('comic morph commits the initial clone before starting its transition', () => {
    const events = [];
    const previousAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = callback => {
        events.push('animation-frame');
        callback();
    };
    const element = {
        get offsetHeight() {
            events.push('layout');
            return 270;
        },
        classList: {
            add(className) {
                events.push(`add:${className}`);
            }
        }
    };

    try {
        startComicMorph(element);
        assert.deepEqual(events, ['layout', 'animation-frame', 'add:morph-out']);
    } finally {
        globalThis.requestAnimationFrame = previousAnimationFrame;
    }
});

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