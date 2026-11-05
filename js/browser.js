import { loadTabs, newTabPage, saveTabs, toUrl } from './config.js';
import { createFrame, getFavicon, getPageTitle } from './frames.js';

export const DEFAULT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#80868b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
);

// Favicons already seen this session, by origin, so tabs show them right away.
const faviconCache = new Map();

function originOf(url) {
    try {
        return new URL(url).origin;
    } catch {
        return '';
    }
}

// The tabbed browser opened with the hotkey. Tab strip UI comes from chrome-tabs.
export class TabBrowser {
    #tabs = new Map(); // chrome-tabs element -> tab
    #active = null;
    #adding = null;
    #started = false;
    #chromeTabs = new window.ChromeTabs();

    constructor(root, { getConfig, onSettings, onExit }) {
        this.getConfig = getConfig;
        this.tabsEl = root.querySelector('.chrome-tabs');
        this.frames = root.querySelector('#tab-frames');
        this.toolbar = root.querySelector('.toolbar');
        this.address = root.querySelector('#address');
        this.siteInfo = root.querySelector('#site-info');
        this.backButton = root.querySelector('#back');
        this.forwardButton = root.querySelector('#forward');
        this.newTabButton = root.querySelector('#new-tab');
        this.menu = root.querySelector('#app-menu');
        this.menuButton = root.querySelector('#menu-button');

        this.#setUpTabStrip(root);
        this.#setUpToolbar(root);
        this.#setUpMenu({ onSettings, onExit });
    }

    #setUpTabStrip(root) {
        this.#chromeTabs.init(this.tabsEl);

        const dark = matchMedia('(prefers-color-scheme: dark)');
        const syncTheme = () => this.tabsEl.classList.toggle('chrome-tabs-dark-theme', dark.matches);
        syncTheme();
        dark.addEventListener('change', syncTheme);

        this.tabsEl.addEventListener('tabAdd', ({ detail }) => {
            if (!this.#adding) return;
            this.#adding.el = detail.tabEl;
            this.#tabs.set(detail.tabEl, this.#adding);
        });
        this.tabsEl.addEventListener('activeTabChange', ({ detail }) => {
            const tab = this.#tabs.get(detail.tabEl);
            if (tab) this.#activate(tab);
        });
        this.tabsEl.addEventListener('tabRemove', ({ detail }) => this.#removed(this.#tabs.get(detail.tabEl)));
        this.tabsEl.addEventListener('tabReorder', () => this.#persist());
        this.tabsEl.addEventListener('auxclick', (e) => {
            const tabEl = e.button === 1 && e.target.closest('.chrome-tab');
            if (tabEl) this.#chromeTabs.removeTab(tabEl);
        });

        // chrome-tabs adds a bare tab on double-click; open a real new tab instead.
        root.querySelector('.tabstrip').addEventListener('dblclick', (e) => {
            if (e.target.closest('.chrome-tab, .new-tab-button')) return;
            e.stopPropagation();
            this.newTab();
        }, true);

        this.newTabButton.addEventListener('click', async () => {
            await this.newTab();
            this.address.focus();
        });

        // Keep the + button just after the last tab, like Chrome.
        const place = () => this.#placeNewTabButton();
        addEventListener('resize', place);
        navigator.windowControlsOverlay?.addEventListener('geometrychange', () => {
            this.#chromeTabs.layoutTabs();
            place();
        });
    }

    #setUpToolbar(root) {
        this.backButton.addEventListener('click', () => this.#active?.frame.back());
        this.forwardButton.addEventListener('click', () => this.#active?.frame.forward());
        root.querySelector('#reload').addEventListener('click', () => {
            const tab = this.#active;
            if (!tab) return;
            tab.loading ? tab.frame.stop() : tab.frame.reload();
        });

        root.querySelector('#address-form').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.address.value.trim()) this.#navigate(this.address.value);
        });
        this.address.addEventListener('focus', () => {
            this.address.select();
            this.#showSiteInfo();
        });
        this.address.addEventListener('blur', () => this.#showAddress());
        this.address.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.address.blur();
                this.#active?.frame.focus();
            }
        });
    }

    #setUpMenu({ onSettings, onExit }) {
        const actions = {
            'new-tab': async () => {
                await this.newTab();
                this.address.focus();
            },
            settings: onSettings,
            exit: onExit,
        };
        this.menuButton.addEventListener('click', () => this.#toggleMenu());
        this.menu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            this.#toggleMenu(false);
            actions[item.dataset.action]?.();
        });
        document.addEventListener('pointerdown', (e) => {
            if (!this.menu.hidden && !e.target.closest('#app-menu, #menu-button')) this.#toggleMenu(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.menu.hidden) this.#toggleMenu(false);
        });
        // Clicking into a page doesn't reach this document, but it does blur it.
        addEventListener('blur', () => this.#toggleMenu(false));
    }

    #toggleMenu(open = this.menu.hidden) {
        this.menu.hidden = !open;
        this.menuButton.setAttribute('aria-expanded', String(open));
        this.menuButton.classList.toggle('pressed', open);
    }

    async show() {
        if (!this.#started) {
            this.#started = true;
            const saved = loadTabs();
            // Older versions saved { urls: [...] } instead of { tabs: [...] }.
            const savedTabs = saved?.tabs ?? saved?.urls?.map((url) => ({ url })) ?? [];
            if (savedTabs.length) {
                for (const { url, title, favicon } of savedTabs) {
                    await this.newTab(url || undefined, { activate: false, title, favicon });
                }
                const tabs = this.#orderedTabs();
                this.#chromeTabs.setCurrentTab((tabs[saved.active] ?? tabs[0]).el);
            } else {
                await this.newTab();
            }
        }
        this.#placeNewTabButton();
        this.#active?.frame.focus();
    }

    async newTab(url = newTabPage(this.getConfig()), { activate = true, title, favicon } = {}) {
        const tab = {
            url,
            title: title || 'New Tab',
            favicon: favicon || faviconCache.get(originOf(url)) || DEFAULT_FAVICON,
            loading: false,
            loadId: 0,
        };
        tab.frame = await createFrame(this.frames, { onNewWindow: (e) => this.#adoptWindow(e) });
        this.#watch(tab);

        this.#adding = tab;
        this.#chromeTabs.addTab({ title: tab.title, favicon: tab.favicon }, { background: !activate });
        this.#adding = null;
        tab.el.querySelector('.chrome-tab-content').title = tab.title;
        if (!this.#active) this.#chromeTabs.setCurrentTab(tab.el);

        if (url) tab.frame.src = url;
        this.#placeNewTabButton();
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

    #watch(tab) {
        const { frame } = tab;
        frame.addEventListener('loadstart', (e) => {
            if (e.isTopLevel) this.#setLoading(tab, true);
        });
        frame.addEventListener('loadcommit', (e) => {
            if (!e.isTopLevel) return;
            tab.url = e.url;
            const cached = faviconCache.get(originOf(e.url));
            if (cached) this.#update(tab, { favicon: cached });
            if (tab === this.#active) this.#showAddress();
            this.#persist();
        });
        frame.addEventListener('loadstop', async () => {
            this.#setLoading(tab, false);
            if (tab === this.#active) this.#updateNavButtons();

            const loadId = ++tab.loadId;
            const title = await getPageTitle(frame);
            if (loadId !== tab.loadId) return;
            this.#update(tab, { title: title || hostnameOf(tab.url) || 'Untitled' });

            const favicon = await getFavicon(frame);
            if (loadId !== tab.loadId) return;
            if (favicon) faviconCache.set(originOf(tab.url), favicon);
            this.#update(tab, { favicon: favicon || faviconCache.get(originOf(tab.url)) || DEFAULT_FAVICON });
        });
        frame.addEventListener('loadabort', (e) => {
            if (e.isTopLevel) this.#setLoading(tab, false);
        });
    }

    #update(tab, changes) {
        Object.assign(tab, changes);
        if (!tab.el) return;
        this.#chromeTabs.updateTab(tab.el, { title: tab.title, favicon: tab.favicon });
        tab.el.querySelector('.chrome-tab-content').title = tab.title;
        this.#persist();
    }

    #setLoading(tab, loading) {
        tab.loading = loading;
        tab.el?.classList.toggle('loading', loading);
        if (tab === this.#active) this.toolbar.classList.toggle('loading', loading);
    }

    #activate(tab) {
        this.#active?.frame.classList.remove('active');
        this.#active = tab;
        tab.frame.classList.add('active');
        this.toolbar.classList.toggle('loading', tab.loading);
        this.#showAddress();
        this.#updateNavButtons();
        this.#persist();
    }

    // Called after chrome-tabs removes a tab (close button, middle click).
    #removed(tab) {
        if (!tab) return;
        this.#tabs.delete(tab.el);
        tab.frame.remove();
        if (tab === this.#active) this.#active = null;
        this.#placeNewTabButton();

        if (this.#tabs.size === 0) {
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
        this.address.blur();
        this.#active.frame.focus();
    }

    #showAddress() {
        if (document.activeElement !== this.address) this.address.value = this.#active?.url ?? '';
        this.#showSiteInfo();
    }

    #showSiteInfo() {
        const url = this.#active?.url ?? '';
        let kind = 'search';
        if (document.activeElement !== this.address && url) {
            kind = url.startsWith('https:') ? 'secure' : 'insecure';
        }
        this.siteInfo.dataset.kind = kind;
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

    #placeNewTabButton() {
        const positions = this.#chromeTabs.tabContentPositions;
        const widths = this.#chromeTabs.tabContentWidths;
        const last = positions.length - 1;
        const tabsRight = last >= 0 ? positions[last] + widths[last] : 0;
        const content = this.tabsEl.querySelector('.chrome-tabs-content');
        this.newTabButton.style.left = `${content.offsetLeft + tabsRight + 4}px`;
    }

    #orderedTabs() {
        return this.#chromeTabs.tabEls.map((el) => this.#tabs.get(el)).filter(Boolean);
    }

    #persist() {
        const tabs = this.#orderedTabs();
        saveTabs({
            tabs: tabs.map(({ url, title, favicon }) => ({ url: url || '', title, favicon })),
            active: Math.max(0, tabs.indexOf(this.#active)),
        });
    }
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}
