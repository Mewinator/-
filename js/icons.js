// Turns an icon URL or file into a small data URL that can be stored and used offline.

// Shown for pages and bookmarks whose favicon can't be loaded.
export const DEFAULT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#80868b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
);

const MAX_ICON_SIZE = 256;

// Runs inside a frame showing the image itself, where the image is same-origin
// and can be read back from a canvas.
const CAPTURE_SCRIPT = `(() => {
    const root = document.documentElement;
    if (root instanceof SVGSVGElement) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(root));
    }
    const img = document.images[0];
    if (!img || !img.naturalWidth) return null;
    const scale = Math.min(1, ${MAX_ICON_SIZE} / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
})()`;

export async function resolveIcon(url) {
    // Works when the image host allows cross-origin requests.
    try {
        const response = await fetch(url);
        if (response.ok) {
            const blob = await response.blob();
            if (blob.type.startsWith('image/')) return await fileToIcon(blob);
        }
    } catch {
        // Blocked by CORS or the network; try loading it in a frame instead.
    }

    try {
        return await captureInFrame(url);
    } catch {
        throw new Error("Couldn't load an image from that URL.");
    }
}

export async function fileToIcon(blob) {
    if (blob.type === 'image/svg+xml') return blobToDataUrl(blob);

    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_ICON_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/png');
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function captureInFrame(url) {
    const frame = document.createElement('controlledframe');
    frame.setAttribute('partition', 'icon-loader');
    frame.className = 'offscreen';
    document.body.append(frame);
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timed out')), 10000);
            frame.addEventListener('loadstop', () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
            frame.addEventListener('loadabort', (e) => {
                if (!e.isTopLevel) return;
                clearTimeout(timer);
                reject(new Error(e.reason));
            });
            frame.src = url;
        });
        const result = await frame.executeScript({ code: CAPTURE_SCRIPT });
        const dataUrl = Array.isArray(result) ? result[0] : result;
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('Not an image');
        return dataUrl;
    } finally {
        frame.remove();
    }
}
