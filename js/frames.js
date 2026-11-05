// Shared setup for every <controlledframe> in the app.

const HOTKEY_TOKEN = `iwa-hotkey-${crypto.randomUUID()}`;

// Key presses inside a frame never reach this page, so a content script in the
// frame watches for the hotkey and reports it through the console.
const HOTKEY_SCRIPT = `addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && e.shiftKey && e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.log(${JSON.stringify(HOTKEY_TOKEN)});
    }
}, true);`;

// Outside an Isolated Web App the <controlledframe> tag is just an unknown element.
export const isSupported = !(document.createElement('controlledframe') instanceof HTMLUnknownElement);

let hotkeyListener = () => {};

export function onHotkey(listener) {
    hotkeyListener = listener;
}

export function isHotkey(e) {
    return e.key === 'Enter' && e.ctrlKey && e.shiftKey && e.altKey;
}

// Creates a frame inside `parent`. Set `src` on the result to load a page.
export async function createFrame(parent, { onNewWindow, partition = 'persist:main' }) {
    const frame = document.createElement('controlledframe');
    frame.setAttribute('partition', partition);
    parent.append(frame);

    frame.addEventListener('consolemessage', (e) => {
        if (e.message === HOTKEY_TOKEN) hotkeyListener();
    });
    frame.addEventListener('newwindow', onNewWindow);
    frame.addEventListener('permissionrequest', handlePermission);
    frame.addEventListener('dialog', handleDialog);

    try {
        // Controlled Frame uses web-style names (urlPatterns, runAt, allFrames),
        // not <webview>'s matches/run_at/all_frames.
        await frame.addContentScripts([{
            name: 'hotkey',
            urlPatterns: ['http://*/*', 'https://*/*'],
            js: { code: HOTKEY_SCRIPT },
            runAt: 'document-start',
            allFrames: true,
        }]);
    } catch (err) {
        console.warn('Could not add the hotkey script to the frame:', err);
    }
    return frame;
}

export async function getPageTitle(frame) {
    try {
        const result = await frame.executeScript({ code: 'document.title' });
        return (Array.isArray(result) ? result[0] : result) || '';
    } catch {
        return '';
    }
}

// executeScript doesn't wait for promises, so the favicon is fetched in the
// background and stored on the page's (isolated) window, then polled for.
const FAVICON_START = `(() => {
    window.__portalFavicon = 'pending';
    (async () => {
        const links = [...document.querySelectorAll('link[rel~="icon"]')];
        const link = links.find((l) => /\\b32x32\\b/.test(l.sizes)) ||
            links.find((l) => /\\b16x16\\b/.test(l.sizes)) || links[0];
        const response = await fetch(link ? link.href : location.origin + '/favicon.ico');
        if (!response.ok) throw new Error(response.status);
        const blob = await response.blob();
        try {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 32;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, 32, 32);
            window.__portalFavicon = canvas.toDataURL('image/png');
        } catch {
            if (!blob.type.startsWith('image/')) throw new Error('Not an image');
            window.__portalFavicon = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }
    })().catch(() => { window.__portalFavicon = null; });
    return 1;
})()`;

// Returns the page's favicon as a data URL, or null if it can't be read.
export async function getFavicon(frame) {
    try {
        await frame.executeScript({ code: FAVICON_START });
        for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            const [value] = await frame.executeScript({ code: 'window.__portalFavicon' });
            if (value !== 'pending') return typeof value === 'string' ? value : null;
        }
    } catch {
        // The page navigated away or can't be scripted.
    }
    return null;
}

function handlePermission(e) {
    if (e.permission === 'download' || e.permission === 'fullscreen') {
        e.request.allow();
    } else {
        e.request.deny();
    }
}

// Controlled frames don't show alert/confirm/prompt on their own.
function handleDialog(e) {
    const { messageType, messageText, dialog } = e;
    if (messageType === 'alert') {
        alert(messageText);
        dialog.ok();
    } else if (messageType === 'confirm') {
        confirm(messageText) ? dialog.ok() : dialog.cancel();
    } else if (messageType === 'prompt') {
        const value = prompt(messageText, e.defaultPromptText);
        value === null ? dialog.cancel() : dialog.ok(value);
    }
}
