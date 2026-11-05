import { DEFAULT_FAVICON } from './icons.js';
import { hidePopup, showPopup, togglePopup } from './popups.js';

const BOOKMARKS_KEY = 'bookmarks';
const BAR_KEY = 'show-bookmarks-bar';

function read(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or unavailable; bookmarks last for this session only.
    }
}

// The star in the address bar, the bookmarks bar, and their menus.
export class Bookmarks {
    #items = read(BOOKMARKS_KEY, []);
    #current = null; // The active page: { url, title, favicon }.
    #editing = null; // Bookmark shown in the bubble.
    #menuTarget = null; // Bookmark the context menu was opened on.

    constructor(root, { open, onBarToggle }) {
        this.open = open;
        this.onBarToggle = onBarToggle;
        this.root = root;
        this.bar = root.querySelector('#bookmarks-bar');
        this.list = root.querySelector('#bookmarks-items');
        this.overflowButton = root.querySelector('#bookmarks-overflow');
        this.overflowMenu = root.querySelector('#bookmarks-overflow-menu');
        this.contextMenu = root.querySelector('#bookmark-menu');
        this.star = root.querySelector('#bookmark-star');
        this.bubble = root.querySelector('#bookmark-bubble');
        this.bubbleTitle = root.querySelector('#bookmark-bubble-title');
        this.nameInput = root.querySelector('#bookmark-name');
        this.urlInput = root.querySelector('#bookmark-url');

        this.star.addEventListener('click', () => this.bookmarkCurrent());

        root.querySelector('#bookmark-done').addEventListener('click', () => hidePopup());
        root.querySelector('#bookmark-remove').addEventListener('click', () => {
            const bookmark = this.#editing;
            this.#editing = null;
            hidePopup();
            this.#remove(bookmark);
        });
        this.bubble.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') hidePopup();
        });

        this.contextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            const bookmark = this.#menuTarget;
            if (!action || !bookmark) return;
            hidePopup();
            if (action === 'open') this.open(bookmark.url, { newTab: false });
            if (action === 'open-new-tab') this.open(bookmark.url, { newTab: true });
            if (action === 'edit') this.#showBubble(bookmark, 'Edit bookmark', this.#buttonFor(bookmark) ?? this.star);
            if (action === 'delete') this.#remove(bookmark);
        });

        this.overflowButton.addEventListener('click', () => {
            this.overflowMenu.replaceChildren(...this.#hiddenItems().map((b) => this.#bookmarkButton(b, 'menuitem')));
            togglePopup(this.overflowMenu, { anchor: this.overflowButton, align: 'right' });
        });

        new ResizeObserver(() => this.#fit()).observe(this.bar);
        this.setBarVisible(read(BAR_KEY, true));
        this.#render();
    }

    get barVisible() {
        return !this.bar.hidden;
    }

    setBarVisible(visible) {
        this.bar.hidden = !visible;
        this.root.classList.toggle('show-bookmarks', visible);
        write(BAR_KEY, visible);
        this.#fit();
        this.onBarToggle?.(visible);
    }

    // Called whenever the active tab or its URL, title or favicon changes.
    setCurrent(page) {
        this.#current = page?.url?.startsWith('http') ? page : null;
        const bookmark = this.#find(this.#current?.url);
        // Like Chrome, keep bookmark favicons up to date with the site.
        if (bookmark && page.favicon && page.favicon !== DEFAULT_FAVICON && bookmark.favicon !== page.favicon) {
            bookmark.favicon = page.favicon;
            this.#save();
        }
        this.#updateStar();
    }

    // Star button / Ctrl+D: bookmark the page, or edit its existing bookmark.
    bookmarkCurrent() {
        if (!this.#current) return;
        const existing = this.#find(this.#current.url);
        const bookmark = existing ?? this.#add(this.#current);
        this.#showBubble(bookmark, existing ? 'Edit bookmark' : 'Bookmark added', this.star);
    }

    #find(url) {
        return url ? this.#items.find((b) => b.url === url) : undefined;
    }

    #add({ url, title, favicon }) {
        const bookmark = { id: crypto.randomUUID(), url, title: title || url, favicon: favicon || DEFAULT_FAVICON };
        this.#items.push(bookmark);
        this.#save();
        return bookmark;
    }

    #remove(bookmark) {
        this.#items = this.#items.filter((b) => b !== bookmark);
        this.#save();
    }

    #save() {
        write(BOOKMARKS_KEY, this.#items);
        this.#render();
    }

    #showBubble(bookmark, heading, anchor) {
        this.#editing = bookmark;
        this.bubbleTitle.textContent = heading;
        this.nameInput.value = bookmark.title;
        this.urlInput.value = bookmark.url;
        showPopup(this.bubble, {
            anchor,
            align: anchor === this.star ? 'right' : 'left',
            onHide: () => this.#commitBubble(),
        });
        this.nameInput.select();
    }

    // Closing the bubble keeps the edits, like Chrome.
    #commitBubble() {
        const bookmark = this.#editing;
        this.#editing = null;
        if (!bookmark || !this.#items.includes(bookmark)) return;
        bookmark.title = this.nameInput.value.trim() || bookmark.title;
        bookmark.url = this.urlInput.value.trim() || bookmark.url;
        this.#save();
    }

    #render() {
        this.list.replaceChildren(...this.#items.map((b) => this.#bookmarkButton(b)));
        this.bar.classList.toggle('empty', this.#items.length === 0);
        this.#fit();
        this.#updateStar();
    }

    #bookmarkButton(bookmark, role = null) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bookmark';
        button.title = `${bookmark.title}\n${bookmark.url}`;
        button.dataset.id = bookmark.id;
        if (role) button.setAttribute('role', role);

        const icon = document.createElement('img');
        icon.src = bookmark.favicon || DEFAULT_FAVICON;
        icon.alt = '';
        const label = document.createElement('span');
        label.textContent = bookmark.title || bookmark.url;
        button.append(icon, label);

        button.addEventListener('click', (e) => {
            hidePopup();
            this.open(bookmark.url, { newTab: e.ctrlKey || e.metaKey });
        });
        button.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            this.open(bookmark.url, { newTab: true, background: true });
        });
        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.#menuTarget = bookmark;
            showPopup(this.contextMenu, { point: { x: e.clientX, y: e.clientY } });
        });
        return button;
    }

    #buttonFor(bookmark) {
        const button = this.list.querySelector(`[data-id="${bookmark.id}"]`);
        return button && !button.hidden ? button : null;
    }

    // Hide bookmarks that don't fit and offer them from the » button.
    #fit() {
        if (this.bar.hidden) return;
        const buttons = [...this.list.children];
        buttons.forEach((b) => (b.hidden = false));
        const width = this.list.clientWidth;
        let overflowing = false;
        for (const button of buttons) {
            if (overflowing || button.offsetLeft + button.offsetWidth > width) {
                button.hidden = true;
                overflowing = true;
            }
        }
        this.overflowButton.hidden = !overflowing;
    }

    #hiddenItems() {
        const hidden = new Set([...this.list.children].filter((b) => b.hidden).map((b) => b.dataset.id));
        return this.#items.filter((b) => hidden.has(b.id));
    }

    #updateStar() {
        const bookmarked = !!this.#find(this.#current?.url);
        this.star.hidden = !this.#current;
        this.star.classList.toggle('on', bookmarked);
        this.star.setAttribute('aria-pressed', String(bookmarked));
        this.star.title = bookmarked ? 'Edit bookmark for this tab' : 'Bookmark this tab';
    }
}
