export function loadComicImage(imageUrl, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.fetchPriority = 'high';
        let settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            if (error) reject(error);
            else resolve(image);
        };
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
        image.onload = ready;
        image.onerror = () => finish(new Error('Comic image failed to load'));
        image.src = imageUrl;
        if (image.complete) void ready();
    });
}

export function animateComicTransition(comicImg, wrapper, imageUrl, direction) {
    return new Promise((resolve) => {
        const hasExistingComicImage = comicImg?.src && comicImg.src !== window.location.href;
        if (!hasExistingComicImage || !wrapper) {
            if (comicImg) comicImg.src = imageUrl;
            resolve();
            return;
        }

        if (direction === 'next' || direction === 'previous') {
            const slideOutClass = direction === 'previous' ? 'slide-out-right' : 'slide-out-left';
            const slideInClass = direction === 'previous' ? 'slide-in-right' : 'slide-in-left';

            const outgoingClone = comicImg.cloneNode(true);
            outgoingClone.removeAttribute('id');
            outgoingClone.classList.add('comic-outgoing');
            outgoingClone.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right', 'dissolve', 'no-transition');
            wrapper.appendChild(outgoingClone);

            comicImg.classList.add('no-transition');
            comicImg.src = imageUrl;
            comicImg.classList.add(slideInClass);

            comicImg.offsetHeight;
            outgoingClone.offsetHeight;

            comicImg.classList.remove('no-transition');

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    outgoingClone.classList.add(slideOutClass);
                    comicImg.classList.remove(slideInClass);

                    setTimeout(() => {
                        outgoingClone.remove();
                        resolve();
                    }, 500);
                });
            });
        } else {
            const outgoingClone = comicImg.cloneNode(true);
            outgoingClone.removeAttribute('id');
            outgoingClone.classList.add('comic-pixelate-outgoing');
            wrapper.appendChild(outgoingClone);

            comicImg.src = imageUrl;

            requestAnimationFrame(() => {
                outgoingClone.classList.add('morph-out');
            });

            setTimeout(() => {
                outgoingClone.remove();
                resolve();
            }, 600);
        }
    });
}

export function animateRotatedComicTransition(rotatedComic, imageUrl, direction, onResize) {
    return new Promise((resolve) => {
        if (!rotatedComic) {
            resolve();
            return;
        }

        if (direction === 'next' || direction === 'previous') {
            const slideOutClass = direction === 'previous' ? 'slide-out-right' : 'slide-out-left';
            const slideInClass = direction === 'previous' ? 'slide-in-right' : 'slide-in-left';

            const outgoingClone = rotatedComic.cloneNode(true);
            outgoingClone.removeAttribute('id');
            outgoingClone.classList.add('rotated-comic-outgoing');
            outgoingClone.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right', 'dissolve');
            outgoingClone.style.cssText = rotatedComic.style.cssText;
            outgoingClone.style.transition = 'transform 0.5s ease-out';
            document.body.appendChild(outgoingClone);

            rotatedComic.style.transition = 'none';
            rotatedComic.src = imageUrl;
            rotatedComic.classList.add(slideInClass);

            rotatedComic.offsetHeight;
            outgoingClone.offsetHeight;

            rotatedComic.style.transition = '';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    outgoingClone.classList.add(slideOutClass);
                    rotatedComic.classList.remove(slideInClass);

                    onResize?.(rotatedComic);

                    setTimeout(() => {
                        outgoingClone.remove();
                        resolve();
                    }, 500);
                });
            });
        } else {
            const outgoingClone = rotatedComic.cloneNode(true);
            outgoingClone.removeAttribute('id');
            outgoingClone.classList.add('rotated-comic-morph-outgoing');
            outgoingClone.style.cssText = rotatedComic.style.cssText;
            outgoingClone.style.transition = 'filter 0.6s ease-in-out, opacity 0.6s ease-in-out';
            document.body.appendChild(outgoingClone);

            rotatedComic.src = imageUrl;
            onResize?.(rotatedComic);

            requestAnimationFrame(() => {
                outgoingClone.classList.add('morph-out');
            });

            setTimeout(() => {
                outgoingClone.remove();
                resolve();
            }, 600);
        }
    });
}
