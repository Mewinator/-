import { Bookmarks } from './bookmarks.js';
import { loadTabs, newTabPage, saveTabs, toUrl } from './config.js';
import { createFrame, getFavicon, getPageTitle } from './frames.js';
import { DEFAULT_FAVICON } from './icons.js';
import { hidePopup, togglePopup } from './popups.js';

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

        this.bookmarks = new Bookmarks(root, {
            open: (url, options) => this.openUrl(url, options),
            onBarToggle: (visible) => {
                this.menu.querySelector('[data-action="toggle-bookmarks-bar"]')
                    ?.setAttribute('aria-checked', String(visible));
            },
        });
        this.#setUpTabStrip(root);
        this.#setUpToolbar(root);
        this.#setUpMenu({ onSettings, onExit });
        this.menu.querySelector('[data-action="toggle-bookmarks-bar"]')
            .setAttribute('aria-checked', String(this.bookmarks.barVisible));
    }

    handleShortcut(name) {
        if (name === 'bookmark') this.bookmarks.bookmarkCurrent();
        if (name === 'bookmarks-bar') this.bookmarks.setBarVisible(!this.bookmarks.barVisible);
        if (name === 'focus-address') this.address.focus();
    }

    // Opens a URL in the current tab, or a new one.
    async openUrl(url, { newTab = false, background = false } = {}) {
        if (newTab || !this.#active) {
            await this.newTab(url, { activate: !background });
        } else {
            this.#active.frame.src = url;
            this.#active.frame.focus();
        }
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
            'bookmark-tab': () => this.bookmarks.bookmarkCurrent(),
            'toggle-bookmarks-bar': () => this.bookmarks.setBarVisible(!this.bookmarks.barVisible),
            settings: onSettings,
            exit: onExit,
        };
        this.menuButton.addEventListener('click', () => {
            togglePopup(this.menu, { anchor: this.menuButton, align: 'right' });
        });
        this.menu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            hidePopup();
            actions[item.dataset.action]?.();
        });
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
            if (tab === this.#active) {
                this.#showAddress();
                this.bookmarks.setCurrent(tab);
            }
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
        if (tab === this.#active) this.bookmarks.setCurrent(tab);
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
        this.bookmarks.setCurrent(tab);
        this.#updateNavButtons();
        this.#persist();
    }

    // Called after chrome-tabs removes a tab (close button, middle click).
    #removed(tab) {
        if (!tab) return;
        this.#tabs.delete(tab.el);
        tab.frame.remove();
        if (tab === this.#active) {
            this.#active = null;
            this.bookmarks.setCurrent(null);
        }
        this.#placeNewTabButton();

        if (this.#tabs.size === 0) {
            this.newTab();
        } else {
            this.#persist();
        }
    }

    async #navigate(input) {
        this.address.blur();
        await this.openUrl(toUrl(input, this.getConfig()));
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
