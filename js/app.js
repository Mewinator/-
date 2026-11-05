import { TabBrowser } from './browser.js';
import { DEFAULT_CONFIG, clearAll, loadConfig, saveConfig } from './config.js';
import { mountConfigForm } from './config-form.js';
import { APP_SHORTCUTS, BROWSER_SHORTCUTS, createFrame, isSupported, matchShortcut, onShortcut } from './frames.js';

const setupView = document.getElementById('setup-view');
const appView = document.getElementById('app-view');
const browserView = document.getElementById('browser-view');
const favicon = document.getElementById('favicon');
const titlebarIcon = document.getElementById('app-titlebar-icon');
const titlebarTitle = document.getElementById('app-titlebar-title');

let config = loadConfig();
let appFrame = null;
let browser = null;

if (!isSupported) {
    document.getElementById('unsupported').hidden = false;
} else if (config) {
    startApp();
} else {
    showSetup();
}

onShortcut(handleShortcut);
document.addEventListener('keydown', (e) => {
    const name = matchShortcut(e, browserOpen() ? BROWSER_SHORTCUTS : APP_SHORTCUTS);
    if (!name) return;
    e.preventDefault();
    handleShortcut(name);
}, true);

function browserOpen() {
    return !browserView.classList.contains('inactive');
}

function handleShortcut(name) {
    if (name === 'toggle-browser') {
        toggleBrowser();
    } else if (browserOpen()) {
        browser.handleShortcut(name);
    }
}

function showSetup() {
    setupView.hidden = false;
    mountConfigForm(document.getElementById('setup-form-slot'), {
        mode: 'setup',
        config: DEFAULT_CONFIG,
        onSave(newConfig) {
            store(newConfig);
            setupView.hidden = true;
            startApp();
        },
    });
}

async function startApp() {
    applyIdentity();
    appView.classList.remove('inactive');
    appFrame = await createFrame(document.getElementById('app-frame-slot'), {
        shortcuts: APP_SHORTCUTS,
        // Keep the app to a single page: open new windows in place.
        onNewWindow(e) {
            e.window.discard();
            appFrame.src = e.targetUrl;
        },
    });
    appFrame.src = config.siteUrl;
    appFrame.focus();

    browser = new TabBrowser(browserView, {
        getConfig: () => config,
        renderSettings,
        onExit: toggleBrowser,
    });
}

function applyIdentity() {
    const icon = config.icon || '/icon.png';
    document.title = config.title;
    favicon.href = icon;
    titlebarIcon.src = icon;
    titlebarTitle.textContent = config.title;
}

function toggleBrowser() {
    if (!browser) return;
    const opening = browserView.classList.contains('inactive');
    browserView.classList.toggle('inactive', !opening);
    appView.classList.toggle('inactive', opening);
    if (opening) {
        browser.show();
    } else {
        appFrame.focus();
    }
}

const settingsTemplate = document.getElementById('settings-page-template');

// Fills the browser's settings tab (portal://settings).
function renderSettings(page) {
    page.replaceChildren(settingsTemplate.content.cloneNode(true));
    const toast = page.querySelector('.toast');
    let toastTimer;

    mountConfigForm(page.querySelector('.settings-form-slot'), {
        mode: 'settings',
        config,
        onSave(newConfig) {
            const siteChanged = newConfig.siteUrl !== config.siteUrl;
            store(newConfig);
            applyIdentity();
            if (siteChanged) appFrame.src = config.siteUrl;
            toast.hidden = false;
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => (toast.hidden = true), 3000);
        },
        // Throw away unsaved edits.
        onCancel: () => renderSettings(page),
        onReset() {
            if (!confirm('Reset everything? This clears the title, icon, website, bookmarks, and saved tabs.')) return;
            clearAll();
            location.reload();
        },
    });
}

function store(newConfig) {
    if (!saveConfig(newConfig)) throw new Error("Couldn't save settings. Try a smaller icon.");
    config = newConfig;
}
