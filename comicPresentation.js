import { getAuthenticatedComic } from './comicExtractor.js';

export function getAdjacentComicDirection(currentDate, targetDate) {
    const currentDay = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const targetDay = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dayDifference = (targetDay - currentDay) / 86400000;

    if (dayDifference === 1) return 'next';
    if (dayDifference === -1) return 'previous';
    return null;
}

export function startComicMorph(element) {
    // Commit the clone's initial styles before applying the transition endpoint.
    element.offsetHeight;
    requestAnimationFrame(() => element.classList.add('morph-out'));
}

const SLIDE_CLASSES = ['slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right', 'no-transition'];

/**
 * Swap a comic image: adjacent dates slide like a filmstrip, other jumps blur-morph.
 * The same sequence drives the page comic and the rotated fullscreen copy.
 * @param {HTMLImageElement} image
 * @param {{ animate: boolean, direction: 'next'|'previous'|null, container: Element,
 *   cloneClass: { slide: string, morph: string }, setImage: () => void,
 *   setTransitionsEnabled: (enabled: boolean) => void,
 *   prepareClone?: (clone: HTMLImageElement, kind: 'slide'|'morph') => void, onSwapped?: () => void }} options
 * @returns {Promise<void>} Resolves once the outgoing clone has been removed.
 */
export function transitionComicImage(image, { animate, direction, container, cloneClass, setImage, setTransitionsEnabled, prepareClone = () => {}, onSwapped = () => {} }) {
    if (!animate) {
        setImage();
        onSwapped();
        return Promise.resolve();
    }
    return new Promise(resolve => {
        const kind = direction ? 'slide' : 'morph';
        const clone = createTransitionClone(image);
        clone.classList.remove(...SLIDE_CLASSES);
        clone.classList.add(cloneClass[kind]);
        prepareClone(clone, kind);
        container.appendChild(clone);
        const removeCloneAfter = ms => setTimeout(() => { clone.remove(); resolve(); }, ms);

        if (kind === 'morph') {
            setImage();
            onSwapped();
            startComicMorph(clone);
            removeCloneAfter(600);
            return;
        }

        const slideOutClass = direction === 'previous' ? 'slide-out-right' : 'slide-out-left';
        const slideInClass = direction === 'previous' ? 'slide-in-right' : 'slide-in-left';
        setTransitionsEnabled(false);
        setImage();
        image.classList.add(slideInClass);
        // Commit the start positions before re-enabling transitions.
        image.offsetHeight;
        clone.offsetHeight;
        setTransitionsEnabled(true);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            clone.classList.add(slideOutClass);
            image.classList.remove(slideInClass);
            onSwapped();
            removeCloneAfter(500);
        }));
    });
}

export function prefersReducedMotion() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// Transition clones only exist for the animation, so they must not repeat the comic's description.
export function createTransitionClone(image) {
    const clone = image.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    clone.alt = '';
    return clone;
}

// The sentence follows the interface language; the parenthesis names the strip's own language.
export function describeComic(date, uiLanguage, comicLanguage) {
    const spanishUi = uiLanguage === 'es';
    const dateLabel = date.toLocaleDateString(spanishUi ? 'es-ES' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const spanishComic = comicLanguage === 'es';
    return spanishUi
        ? `Garfield del ${dateLabel} (${spanishComic ? 'español' : 'inglés'})`
        : `Garfield for ${dateLabel} (${spanishComic ? 'Spanish' : 'English'})`;
}

export function reserveComicSpace(image, date) {
    if (image.getAttribute('src')) return;
    image.width = 900;
    image.height = date.getDay() === 0 ? 633 : 270;
}

export function setComicImage(image, result) {
    if (result.imageWidth > 0 && result.imageHeight > 0) {
        image.width = result.imageWidth;
        image.height = result.imageHeight;
    }
    image.src = result.imageUrl;
}

export async function decodeComicResult(result, timeoutMs, signal) {
    const image = await loadComicImage(result.imageUrl, timeoutMs, signal);
    Object.assign(result, { imageWidth: image.naturalWidth, imageHeight: image.naturalHeight });
}

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
    let readyImage;
    try {
        const result = await Promise.race([
            fetchComic(date, language, source, {
                signal: controller.signal,
                validateImage: async imageUrl => {
                    controller.signal.throwIfAborted();
                    decodeStart = performance.now();
                    readyImage = await loadImage(imageUrl, imageTimeoutMs, controller.signal);
                    decoded = performance.now();
                }
            }),
            aborted
        ]);
        if (result.success) return { ...result, imageReady: true, imageWidth: readyImage?.naturalWidth, imageHeight: readyImage?.naturalHeight, decodeStart, decoded };
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
            readyImage = await loadImage(fallback.imageUrl, imageTimeoutMs, signal);
            return { ...fallback, success: true, imageReady: true, imageWidth: readyImage?.naturalWidth, imageHeight: readyImage?.naturalHeight, isFallback: true, decodeStart, decoded: performance.now() };
        } catch (error) {
            if (signal?.aborted) throw error;
        }
    }
    return { success: false, imageUrl: null };
}