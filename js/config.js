const CONFIG_KEY = 'app-config';
const TABS_KEY = 'browser-tabs';

export const SEARCH_ENGINES = {
    google: { name: 'Google', search: 'https://www.google.com/search?q=%s', home: 'https://www.google.com/' },
    bing: { name: 'Bing', search: 'https://www.bing.com/search?q=%s', home: 'https://www.bing.com/' },
    duckduckgo: { name: 'DuckDuckGo', search: 'https://duckduckgo.com/?q=%s', home: 'https://duckduckgo.com/' },
};

export const DEFAULT_CONFIG = {
    title: '',
    iconUrl: '',
    icon: '', // Data URL (or plain URL) actually used for the favicon.
    siteUrl: '',
    searchEngine: 'google',
    customSearch: '',
    newTabUrl: '',
};

function read(key) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function loadConfig() {
    const saved = read(CONFIG_KEY);
    return saved ? { ...DEFAULT_CONFIG, ...saved } : null;
}

export function saveConfig(config) {
    return write(CONFIG_KEY, config);
}

export function loadTabs() {
    return read(TABS_KEY);
}

export function saveTabs(tabs) {
    write(TABS_KEY, tabs);
}

export function clearAll() {
    try {
        localStorage.clear();
    } catch {
        // Nothing stored, or storage is unavailable.
    }
}

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

// Turns "example.com" into "https://example.com/", rejecting anything that isn't http(s).
export function normalizeUrl(value, label = 'URL') {
    const text = value.trim();
    try {
        const url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {
        // Fall through to the error below.
    }
    throw new Error(`${label} isn't a valid web address.`);
}

function searchTemplate(config) {
    if (config.searchEngine === 'custom' && config.customSearch.includes('%s')) return config.customSearch;
    return (SEARCH_ENGINES[config.searchEngine] ?? SEARCH_ENGINES.google).search;
}

export function newTabPage(config) {
    if (config.newTabUrl) return config.newTabUrl;
    if (config.searchEngine === 'custom' && config.customSearch) {
        try {
            return new URL(config.customSearch).origin + '/';
        } catch {
            // Invalid custom engine; use the default below.
        }
    }
    return (SEARCH_ENGINES[config.searchEngine] ?? SEARCH_ENGINES.google).home;
}

// Address bar input: a URL, something that looks like a domain, or a search.
export function toUrl(input, config) {
    const text = input.trim();
    if (HAS_SCHEME.test(text)) return text;
    const looksLikeHost = /^([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text) ||
        /^localhost(:\d+)?([/?#].*)?$/i.test(text);
    if (looksLikeHost) return `https://${text}`;
    return searchTemplate(config).replace('%s', encodeURIComponent(text));
}
