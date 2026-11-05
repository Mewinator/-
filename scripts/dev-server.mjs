// Serves the app for Chrome's IWA "Dev Mode Proxy" install.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { IWA_HEADERS, ROOT, listAppFiles, mimeType } from './app-files.mjs';

const PORT = Number(process.env.PORT) || 8080;

http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    if (file === '' || file.endsWith('/')) file += 'index.html';

    // Only serve files that would be in the bundle, so dev matches production.
    if (!listAppFiles().includes(file)) {
        res.writeHead(404, IWA_HEADERS).end('Not found');
        return;
    }

    res.writeHead(200, { ...IWA_HEADERS, 'Content-Type': mimeType(file), 'Cache-Control': 'no-cache' });
    fs.createReadStream(path.join(ROOT, file)).pipe(res);
}).listen(PORT, () => {
    console.log(`Serving on http://localhost:${PORT}`);
});
