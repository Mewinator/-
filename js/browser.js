import { loadTabs, newTabPage, saveTabs, toUrl } from './config.js';
import { createFrame, getPageTitle } from './frames.js';

// The tabbed browser opened with the hotkey.
export class TabBrowser {
    #tabs = [];
    #active = null;
    #started = false;

    constructor(root, { getConfig, onSettings, onExit }) {
        this.getConfig = getConfig;
        this.tabStrip = root.querySelector('#tabs');
        this.frames = root.querySelector('#tab-frames');
        this.address = root.querySelector('#address');
        this.backButton = root.querySelector('#back');
        this.forwardButton = root.querySelector('#forward');

        root.querySelector('#new-tab').addEventListener('click', async () => {
            await this.newTab();
            this.address.focus();
        });
        this.backButton.addEventListener('click', () => this.#active?.frame.back());
        this.forwardButton.addEventListener('click', () => this.#active?.frame.forward());
        root.querySelector('#reload').addEventListener('click', () => this.#active?.frame.reload());
        root.querySelector('#open-settings').addEventListener('click', onSettings);
        root.querySelector('#close-browser').addEventListener('click', onExit);

        root.querySelector('#address-form').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.address.value.trim()) this.#navigate(this.address.value);
        });
        this.address.addEventListener('focus', () => this.address.select());
        this.address.addEventListener('blur', () => this.#showAddress());
    }

    async show() {
        if (!this.#started) {
            this.#started = true;
            const saved = loadTabs();
            if (saved?.urls?.length) {
                for (const url of saved.urls) await this.newTab(url || undefined, { activate: false });
                this.#activate(this.#tabs[saved.active] ?? this.#tabs[0]);
            } else {
                await this.newTab();
            }
        }
        this.#active?.frame.focus();
    }

    async newTab(url = newTabPage(this.getConfig()), { activate = true } = {}) {
        const tab = { url, title: '' };
        tab.frame = await createFrame(this.frames, { onNewWindow: (e) => this.#adoptWindow(e) });
        tab.button = this.#createTabButton(tab);
        this.tabStrip.append(tab.button);
        this.#tabs.push(tab);
        this.#watch(tab);

        if (url) tab.frame.src = url;
        if (activate) this.#activate(tab);
        this.#persist();
        return tab;
    }

    // Pages that open a new window (target="_blank", window.open) get a new tab.
    async #adoptWindow(e) {
        e.preventDefault();
        const tab = await this.newTab(null, { activate: e.windowOpenDisposition !== 'new_background_tab' });
        tab.url = e.targetUrl;
        e.window.attach(tab.frame);
    }

    #createTabButton(tab) {
        const button = document.createElement('div');
        button.className = 'tab';
        button.setAttribute('role', 'tab');

        tab.titleEl = document.createElement('span');
        tab.titleEl.className = 'tab-title';
        tab.titleEl.textContent = 'New tab';

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'tab-close';
        close.title = 'Close tab';
        close.setAttribute('aria-label', 'Close tab');
        close.textContent = '×';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#close(tab);
        });

        button.addEventListener('click', () => this.#activate(tab));
        button.addEventListener('auxclick', (e) => {
            if (e.button === 1) this.#close(tab);
        });
        button.append(tab.titleEl, close);
        return button;
    }

    #watch(tab) {
        const { frame, button } = tab;
        frame.addEventListener('loadstart', (e) => {
            if (e.isTopLevel) button.classList.add('loading');
        });
        frame.addEventListener('loadcommit', (e) => {
            if (!e.isTopLevel) return;
            tab.url = e.url;
            if (tab === this.#active) this.#showAddress();
            this.#persist();
        });
        frame.addEventListener('loadstop', async () => {
            button.classList.remove('loading');
            this.#setTitle(tab, await getPageTitle(frame));
            if (tab === this.#active) this.#updateNavButtons();
        });
        frame.addEventListener('loadabort', (e) => {
            if (e.isTopLevel) button.classList.remove('loading');
        });
    }

    #setTitle(tab, title) {
        let fallback = 'New tab';
        try {
            fallback = new URL(tab.url).hostname || fallback;
        } catch {
            // No URL yet.
        }
        tab.title = title || fallback;
        tab.titleEl.textContent = tab.title;
        tab.button.title = tab.title;
    }

    #activate(tab) {
        if (this.#active) {
            this.#active.frame.classList.remove('active');
            this.#active.button.classList.remove('active');
            this.#active.button.setAttribute('aria-selected', 'false');
        }
        this.#active = tab;
        tab.frame.classList.add('active');
        tab.button.classList.add('active');
        tab.button.setAttribute('aria-selected', 'true');
        tab.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        this.#showAddress();
        this.#updateNavButtons();
        this.#persist();
    }

    #close(tab) {
        const index = this.#tabs.indexOf(tab);
        this.#tabs.splice(index, 1);
        tab.frame.remove();
        tab.button.remove();

        if (tab === this.#active) {
            this.#active = null;
            const next = this.#tabs[Math.min(index, this.#tabs.length - 1)];
            if (next) this.#activate(next);
        }
        if (this.#tabs.length === 0) {
            this.newTab();
        } else {
            this.#persist();
        }
    }

    async #navigate(input) {
        const url = toUrl(input, this.getConfig());
        if (this.#active) {
            this.#active.frame.src = url;
        } else {
            await this.newTab(url);
        }
        this.#active.frame.focus();
    }

    #showAddress() {
        if (document.activeElement !== this.address) this.address.value = this.#active?.url ?? '';
    }

    async #updateNavButtons() {
        const frame = this.#active?.frame;
        try {
            this.backButton.disabled = !(frame && await frame.canGoBack());
            this.forwardButton.disabled = !(frame && await frame.canGoForward());
        } catch {
            this.backButton.disabled = this.forwardButton.disabled = true;
        }
    }

    #persist() {
        saveTabs({
            urls: this.#tabs.map((tab) => tab.url || ''),
            active: Math.max(0, this.#tabs.indexOf(this.#active)),
        });
    }
}
