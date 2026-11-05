// Generates the Ed25519 key that signs the app. The key determines the app's
// isolated-app:// origin, so keep it safe and reuse it for every release.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './app-files.mjs';

const keyPath = path.join(ROOT, 'keys', 'private.pem');

if (fs.existsSync(keyPath)) {
    console.error(`${keyPath} already exists; refusing to overwrite it.`);
    process.exit(1);
}

const { privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(keyPath), { recursive: true });
fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
console.log(`Wrote ${keyPath}`);
