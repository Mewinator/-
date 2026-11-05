// Menus and bubbles: one open at a time, closed by clicking elsewhere, Escape,
// or focus moving into a page.

let current = null; // { el, anchor, onHide }

// Opens `el` below `anchor` (aligned to its left or right edge) or at `point`.
export function showPopup(el, { anchor = null, align = 'left', point = null, onHide = null } = {}) {
    hidePopup();
    current = { el, anchor, onHide };
    el.hidden = false;
    anchor?.setAttribute('aria-expanded', 'true');
    anchor?.classList.add('pressed');

    const box = el.getBoundingClientRect();
    let left;
    let top;
    if (point) {
        left = point.x;
        top = point.y;
    } else {
        const rect = anchor.getBoundingClientRect();
        left = align === 'right' ? rect.right - box.width : rect.left;
        top = rect.bottom + 4;
    }
    el.style.left = `${Math.max(4, Math.min(left, innerWidth - box.width - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(top, innerHeight - box.height - 4))}px`;
    el.querySelector('input, [role^="menuitem"]')?.focus();
}

export function hidePopup() {
    if (!current) return;
    const { el, anchor, onHide } = current;
    current = null;
    el.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    anchor?.classList.remove('pressed');
    onHide?.();
}

export function togglePopup(el, options) {
    if (current?.el === el) {
        hidePopup();
    } else {
        showPopup(el, options);
    }
}

document.addEventListener('pointerdown', (e) => {
    if (!current) return;
    // Clicks on the anchor are left to its own click handler (which toggles).
    if (current.el.contains(e.target) || current.anchor?.contains(e.target)) return;
    hidePopup();
}, true);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) {
        e.preventDefault();
        hidePopup();
    }
});

// Clicking into a <controlledframe> never reaches this document, but it blurs it.
addEventListener('blur', () => hidePopup());
addEventListener('resize', () => hidePopup());
