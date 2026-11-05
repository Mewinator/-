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
