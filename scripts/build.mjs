// Packages the app as a Signed Web Bundle (.swbn) for installing as an IWA.
import fs from 'node:fs';
import path from 'node:path';
import { BundleBuilder } from 'wbn';
import * as wbnSign from 'wbn-sign';
import { IWA_HEADERS, ROOT, listAppFiles, mimeType } from './app-files.mjs';

const keyPath = process.env.IWA_KEY ?? path.join(ROOT, 'keys', 'private.pem');
const outPath = path.join(ROOT, 'dist', 'portal.swbn');
const updateManifestPath = path.join(ROOT, 'update.json');

// Each release is a GitHub release tagged v<version> with portal.swbn attached.
const RELEASES_URL = 'https://github.com/Mewinator/-/releases/download';

if (!fs.existsSync(keyPath)) {
    console.error(`No signing key at ${keyPath}. Run "npm run keygen" first.`);
    process.exit(1);
}

const privateKey = wbnSign.parsePemKey(fs.readFileSync(keyPath, 'utf-8'));

// Exchanges use full isolated-app://<id>/ URLs. Chrome's developer-mode
// installer also accepts relative ones, but the regular installer (e.g. on
// ChromeOS with IWAs enabled in Settings) rejects them.
const baseURL = new wbnSign.WebBundleId(privateKey).serializeWithIsolatedWebAppOrigin();

const builder = new BundleBuilder('b2');
for (const file of listAppFiles()) {
    const body = fs.readFileSync(path.join(ROOT, file));
    const headers = { ...IWA_HEADERS, 'Content-Type': mimeType(file) };

    if (path.posix.basename(file) === 'index.html') {
        // Serve directories at "dir/" and redirect "dir/index.html" there.
        const dir = path.posix.dirname(file) === '.' ? '' : `${path.posix.dirname(file)}/`;
        builder.addExchange(baseURL + dir, 200, headers, body);
        builder.addExchange(baseURL + file, 301, { ...IWA_HEADERS, Location: './' }, '');
    } else {
        builder.addExchange(baseURL + file, 200, headers, body);
    }
}

const signed = await wbnSign.SignedWebBundle.fromWebBundle(builder.createBundle(), [
    new wbnSign.NodeCryptoSigningStrategy(privateKey),
]);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, signed.getSignedWebBundleBytes());

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, '.well-known', 'manifest.webmanifest'), 'utf-8'));
writeUpdateManifest(version);

console.log(`Built ${path.relative(ROOT, outPath)} (v${version})`);
console.log(`App origin: isolated-app://${signed.getWebBundleId()}/`);
console.log(`Upload dist/portal.swbn and update.json to the GitHub release v${version}.`);

// Adds (or refreshes) this version in update.json, which Chrome polls for updates.
function writeUpdateManifest(version) {
    const manifest = fs.existsSync(updateManifestPath)
        ? JSON.parse(fs.readFileSync(updateManifestPath, 'utf-8'))
        : { versions: [] };
    const entry = { version, src: `${RELEASES_URL}/v${version}/portal.swbn` };

    manifest.versions = manifest.versions.filter((v) => v.version !== version);
    manifest.versions.push(entry);
    manifest.versions.sort((a, b) => compareVersions(a.version, b.version));

    fs.writeFileSync(updateManifestPath, JSON.stringify(manifest, null, 2) + '\n');
    fs.copyFileSync(updateManifestPath, path.join(ROOT, 'dist', 'update.json'));
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff) return diff;
    }
    return 0;
}
