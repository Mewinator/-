import { TabBrowser } from './browser.js';
import { DEFAULT_CONFIG, clearAll, loadConfig, saveConfig } from './config.js';
import { mountConfigForm } from './config-form.js';
import { createFrame, isHotkey, isSupported, onHotkey } from './frames.js';

const setupView = document.getElementById('setup-view');
const appView = document.getElementById('app-view');
const browserView = document.getElementById('browser-view');
const settingsDialog = document.getElementById('settings-dialog');
const favicon = document.getElementById('favicon');

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

onHotkey(toggleBrowser);
document.addEventListener('keydown', (e) => {
    if (!isHotkey(e)) return;
    e.preventDefault();
    toggleBrowser();
}, true);

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
    appFrame = await createFrame(appView, {
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
        onSettings: openSettings,
        onExit: toggleBrowser,
    });
}

function applyIdentity() {
    document.title = config.title;
    favicon.href = config.icon || '/icon.png';
}

function toggleBrowser() {
    if (!browser || settingsDialog.open) return;
    const opening = browserView.classList.contains('inactive');
    browserView.classList.toggle('inactive', !opening);
    appView.classList.toggle('inactive', opening);
    if (opening) {
        browser.show();
    } else {
        appFrame.focus();
    }
}

function openSettings() {
    mountConfigForm(document.getElementById('settings-form-slot'), {
        mode: 'settings',
        config,
        onSave(newConfig) {
            const siteChanged = newConfig.siteUrl !== config.siteUrl;
            store(newConfig);
            applyIdentity();
            if (siteChanged) appFrame.src = config.siteUrl;
            settingsDialog.close();
        },
        onCancel: () => settingsDialog.close(),
        onReset() {
            if (!confirm('Reset everything? This clears the title, icon, website, and saved tabs.')) return;
            clearAll();
            location.reload();
        },
    });
    settingsDialog.showModal();
}

function store(newConfig) {
    if (!saveConfig(newConfig)) throw new Error("Couldn't save settings. Try a smaller icon.");
    config = newConfig;
}
