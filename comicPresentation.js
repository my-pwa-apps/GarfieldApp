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