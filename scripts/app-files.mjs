import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Everything that ships in the app. Paths are relative to the project root.
const APP_ENTRIES = ['index.html', 'icon.png', 'css', 'js', '.well-known'];

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// Headers Chrome requires on every Isolated Web App response.
export const IWA_HEADERS = {
    'Content-Security-Policy':
        "base-uri 'none'; default-src 'self'; object-src 'none'; " +
        "frame-src 'self' https: blob: data:; connect-src 'self' https: wss:; " +
        "script-src 'self' 'wasm-unsafe-eval'; img-src 'self' https: blob: data:; " +
        "media-src 'self' https: blob: data:; font-src 'self' blob: data:; " +
        "style-src 'self' 'unsafe-inline'; require-trusted-types-for 'script'; " +
        "frame-ancestors 'self';",
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
};

export function mimeType(file) {
    return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Returns app file paths relative to ROOT, using forward slashes.
export function listAppFiles() {
    const files = [];
    const walk = (rel) => {
        const abs = path.join(ROOT, rel);
        if (fs.statSync(abs).isDirectory()) {
            for (const name of fs.readdirSync(abs).sort()) walk(`${rel}/${name}`);
        } else {
            files.push(rel);
        }
    };
    APP_ENTRIES.forEach(walk);
    return files;
}
