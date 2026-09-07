export async function shareComic({ comic, t, showNotification }) {
    const shareDate = comic?.date || '';
    const imageUrl = comic?.imageUrl;
    const appUrl = new URL('.', window.location.href).href;
    const shareText = t.shareText.replace('{date}', shareDate);
    let shareBlob = null;

    if (!imageUrl) {
        showNotification(t.shareEmpty, 3000);
        return;
    }

    try {
        // Fetch the image to get a Blob.
        // If the URL already routes through our proxy (e.g. Fandom), safely use it directly.
        // Otherwise, wrap it in our Cloudflare CORS worker to avoid canvas tainting
        // and bypass opaque-response restrictions.
        let fetchUrl = imageUrl;
        if (!imageUrl.startsWith('https://garfieldapp-corsproxy.garfieldapp.workers.dev/')) {
            const parsed = new URL(imageUrl);
            const target = parsed.origin === 'https://corsproxy.garfieldapp.workers.dev'
                ? parsed.searchParams.get('url') || decodeURIComponent(parsed.search.slice(1))
                : imageUrl;
            fetchUrl = `https://garfieldapp-corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(target)}`;
        }

        const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const rawBlob = await response.blob();

        // Convert to JPEG via canvas so the Windows share dialog always shows a
        // thumbnail. The blob URL is same-origin so there is no canvas taint, even
        // though the original image came from a third-party CDN.
        const blobUrl = URL.createObjectURL(rawBlob);
        shareBlob = rawBlob;
        try {
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = blobUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            // Fill with white background to prevent transparent GIFs/PNGs from becoming black JPEGs
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            shareBlob = await new Promise((resolve, reject) => {
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92);
            });
        } finally {
            URL.revokeObjectURL(blobUrl);
        }

        const file = new File([shareBlob], 'garfield.jpg', { type: 'image/jpeg', lastModified: Date.now() });

        if (isNativeWebView()) {
            const openedNativeShare = await shareThroughNativeHost({
                title: `Garfield ${shareDate}`,
                text: `${shareText}\n${appUrl}`,
                file
            });
            if (openedNativeShare) return;
        }

        if (!navigator.share) {
            if (await copyShareFallbackToClipboard(shareBlob, `${shareText}\n${appUrl}`)) {
                showNotification(t.shareCopied, 3000);
            } else {
                showNotification(t.shareUnsupported, 3000);
            }
            return;
        }

        // When sharing a file, if you also provide text and a URL, many apps (WhatsApp, Messages)
        // will drop the file to create a link preview. To ensure the file is sent as an image attachment,
        // we omit the 'url' parameter and just append the link to the 'text'.
        await navigator.share({
            title: `Garfield ${shareDate}`,
            text: `${shareText}\n${appUrl}`,
            files: [file]
        });
    } catch (error) {
        // Fallback to text-only sharing on any error (proxy failure, unsupported files, etc.)
        if (error.name !== 'AbortError') {
            if (isNativeWebView() && await copyShareFallbackToClipboard(shareBlob, `${shareText}\n${appUrl}`)) {
                showNotification(t.shareCopied, 3000);
                return;
            }

            try {
                await navigator.share({
                    url: appUrl,
                    text: shareText
                });
            } catch (fallbackError) {
                if (fallbackError.name !== 'AbortError') {
                    if (await copyShareFallbackToClipboard(shareBlob, `${shareText}\n${appUrl}`)) {
                        showNotification(t.shareCopied, 3000);
                    } else {
                        showNotification(t.shareFailed, 3000);
                    }
                }
            }
        }
    }
}

function isNativeWebView() {
    return Boolean(window.chrome?.webview);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
    });
}

async function shareThroughNativeHost({ title, text, file }) {
    if (!isNativeWebView() || !file) return false;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base64 = await blobToBase64(file);

    return await new Promise(resolve => {
        const timeout = setTimeout(() => {
            window.chrome.webview.removeEventListener('message', handleMessage);
            resolve(false);
        }, 5000);

        const handleMessage = event => {
            const message = event.data || {};
            if (message.type !== 'garfield-share-result' || message.id !== id) return;

            clearTimeout(timeout);
            window.chrome.webview.removeEventListener('message', handleMessage);
            resolve(Boolean(message.ok));
        };

        window.chrome.webview.addEventListener('message', handleMessage);
        window.chrome.webview.postMessage({
            type: 'garfield-share',
            id,
            title,
            text,
            fileName: file.name || 'garfield.jpg',
            contentType: file.type || 'image/jpeg',
            base64
        });
    });
}

async function copyShareFallbackToClipboard(imageBlob, text) {
    if (!navigator.clipboard) return false;

    if (imageBlob && window.ClipboardItem && navigator.clipboard.write) {
        try {
            const pngBlob = await convertBlobToPng(imageBlob);
            await navigator.clipboard.write([new ClipboardItem({
                [pngBlob.type]: pngBlob,
                'text/plain': new Blob([text], { type: 'text/plain' })
            })]);
            return true;
        } catch {
            // Fall back to text only below.
        }
    }

    if (navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }

    return false;
}

async function convertBlobToPng(blob) {
    if (blob.type === 'image/png') return blob;

    const blobUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = blobUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        return await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
        });
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}
