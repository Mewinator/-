// Turns an icon URL or file into a small data URL that can be stored and used offline.

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
