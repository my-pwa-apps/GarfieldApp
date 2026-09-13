import { getAuthenticatedComic } from './comicExtractor.js';

export function selectOfflineComic(dateString, comics, direction, parseDate, firstDate) {
    let comic = comics.find(entry => entry.date === dateString);
    if (!comic && direction === 'previous') {
        comic = [...comics].reverse().find(entry => entry.date < dateString);
    } else if (!comic && direction === 'next') {
        comic = comics.find(entry => entry.date > dateString);
    } else if (!comic && !direction) {
        comic = comics.at(-1);
    }
    if (comic) return { success: true, imageUrl: comic.imageUrl, actualDate: parseDate(comic.date), isOffline: true };
    if (comics.length === 0) {
        return { success: true, imageUrl: './garfield-first.gif', actualDate: parseDate(firstDate), language: 'en', isOffline: true };
    }
    return { success: false, imageUrl: null, isOffline: true };
}

export function loadComicImage(imageUrl, timeoutMs = 8000, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const image = new Image();
        image.fetchPriority = 'high';
        let settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            image.onload = null;
            image.onerror = null;
            if (error) {
                image.src = '';
                reject(error);
            }
            else resolve(image);
        };
        const abort = () => finish(signal.reason);
        const ready = async () => {
            try {
                if (!image.naturalWidth) throw new Error('Comic image is empty');
                if (typeof image.decode === 'function') await image.decode();
                finish();
            } catch (error) {
                finish(error);
            }
        };
        const timer = setTimeout(() => finish(new Error('Comic image timed out')), timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        image.onload = ready;
        image.onerror = () => finish(new Error('Comic image failed to load'));
        image.src = imageUrl;
        if (image.complete) void ready();
    });
}

export async function loadComicWithFallback({
    date, language, source, timeoutMs, imageTimeoutMs, getFallbacks,
    signal, fetchComic = getAuthenticatedComic, loadImage = loadComicImage
}) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    if (signal?.aborted) throw signal.reason;
    signal?.addEventListener('abort', cancel, { once: true });
    let timer;
    let rejectAborted;
    const aborted = new Promise((resolve, reject) => { rejectAborted = reject; });
    const onAbort = () => rejectAborted(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => controller.abort(new Error('Comic loading deadline exceeded')), timeoutMs);
    let decodeStart;
    let decoded;
    try {
        const result = await Promise.race([
            fetchComic(date, language, source, {
                signal: controller.signal,
                validateImage: async imageUrl => {
                    controller.signal.throwIfAborted();
                    decodeStart = performance.now();
                    await loadImage(imageUrl, imageTimeoutMs, controller.signal);
                    decoded = performance.now();
                }
            }),
            aborted
        ]);
        if (result.success) return { ...result, imageReady: true, decodeStart, decoded };
    } catch (error) {
        if (signal?.aborted) throw error;
    } finally {
        clearTimeout(timer);
        controller.abort();
        controller.signal.removeEventListener('abort', onAbort);
        signal?.removeEventListener('abort', cancel);
    }

    signal?.throwIfAborted();
    for (const fallback of await getFallbacks()) {
        signal?.throwIfAborted();
        try {
            decodeStart = performance.now();
            await loadImage(fallback.imageUrl, imageTimeoutMs, signal);
            return { ...fallback, success: true, imageReady: true, isFallback: true, decodeStart, decoded: performance.now() };
        } catch (error) {
            if (signal?.aborted) throw error;
        }
    }
    return { success: false, imageUrl: null };
}