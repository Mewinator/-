import { SEARCH_ENGINES, normalizeUrl } from './config.js';
import { fileToIcon, resolveIcon } from './icons.js';

const template = document.getElementById('config-form-template');

// Renders the title/icon/website form into `slot`. In "setup" mode only the
// first-run fields are shown; "settings" mode shows everything.
export function mountConfigForm(slot, { mode, config, onSave, onCancel, onReset }) {
    slot.replaceChildren(template.content.cloneNode(true));
    const form = slot.querySelector('form');
    const fields = form.elements;
    const preview = form.querySelector('.icon-preview');
    const iconStatus = form.querySelector('.icon-status');
    const error = form.querySelector('.form-error');
    const customSearch = form.querySelector('.custom-search');
    form.dataset.mode = mode;

    for (const [value, { name }] of Object.entries(SEARCH_ENGINES)) {
        fields.searchEngine.append(new Option(name, value));
    }
    fields.searchEngine.append(new Option('Custom', 'custom'));

    fields.title.value = config.title;
    fields.iconUrl.value = config.iconUrl;
    fields.siteUrl.value = config.siteUrl;
    fields.searchEngine.value = config.searchEngine;
    fields.customSearch.value = config.customSearch;
    fields.newTabUrl.value = config.newTabUrl;

    const showCustomSearch = () => {
        customSearch.hidden = fields.searchEngine.value !== 'custom';
    };
    showCustomSearch();
    fields.searchEngine.addEventListener('change', showCustomSearch);

    let icon = config.icon;
    let iconError = '';
    let iconTask = Promise.resolve();

    const showPreview = () => {
        preview.src = icon || '/icon.png';
    };
    showPreview();

    const loadIcon = (load) => {
        iconError = '';
        iconStatus.textContent = 'Loading icon…';
        iconTask = load().then(
            (result) => {
                icon = result;
                iconStatus.textContent = '';
            },
            (err) => {
                iconError = err.message;
                iconStatus.textContent = err.message;
            },
        ).finally(showPreview);
    };

    fields.iconUrl.addEventListener('change', () => {
        const value = fields.iconUrl.value.trim();
        if (value) {
            loadIcon(async () => resolveIcon(normalizeUrl(value, 'Icon URL')));
        } else {
            icon = '';
            iconError = '';
            iconStatus.textContent = '';
            showPreview();
        }
    });

    fields.iconFile.addEventListener('change', () => {
        const [file] = fields.iconFile.files;
        if (!file) return;
        fields.iconUrl.value = '';
        loadIcon(() => fileToIcon(file));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = form.querySelector('[type="submit"]');
        saveButton.disabled = true;
        error.textContent = '';
        try {
            await iconTask;
            if (iconError) throw new Error(iconError);

            const newConfig = {
                title: fields.title.value.trim(),
                iconUrl: fields.iconUrl.value.trim(),
                icon,
                siteUrl: normalizeUrl(fields.siteUrl.value, 'Website URL'),
                searchEngine: fields.searchEngine.value,
                customSearch: fields.customSearch.value.trim(),
                newTabUrl: fields.newTabUrl.value.trim() ? normalizeUrl(fields.newTabUrl.value, 'New tab page') : '',
            };
            if (newConfig.searchEngine === 'custom' && !newConfig.customSearch.includes('%s')) {
                throw new Error('The custom search URL needs a %s where the search text goes.');
            }
            await onSave(newConfig);
        } catch (err) {
            error.textContent = err.message;
        } finally {
            saveButton.disabled = false;
        }
    });

    form.querySelector('.cancel').addEventListener('click', () => onCancel?.());
    form.querySelector('.reset').addEventListener('click', () => onReset?.());

    fields.title.focus();
}
