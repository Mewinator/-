// Isolated Web Apps require Trusted Types, so plain strings can't be assigned
// to innerHTML. chrome-tabs does that in two places: its static tab template
// and the <style> rules that position tabs. This default policy lets exactly
// those through and rejects everything else.
(() => {
    const TAB_TEMPLATE = /^\s*<div class="chrome-tab">[\s\S]*chrome-tab-geometry-left[\s\S]*<div class="chrome-tab-close"><\/div>\s*<\/div>\s*<\/div>\s*$/;
    const TAB_POSITIONS = /^(\s*\.chrome-tabs\[data-chrome-tabs-instance-id="\d+"\] \.chrome-tab:nth-child\(\d+\) \{\s*transform: translate3d\(-?[\d.]+px, 0, 0\)\s*\})*\s*$/;
    const UNSAFE = /<script|\son\w+\s*=|javascript:/i;

    trustedTypes.createPolicy('default', {
        createHTML(html) {
            if (!UNSAFE.test(html) && (TAB_TEMPLATE.test(html) || TAB_POSITIONS.test(html))) return html;
            throw new TypeError('Blocked HTML that did not come from chrome-tabs.');
        },
    });
})();
