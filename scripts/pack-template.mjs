// Packs template/ into builder/public/client-template.json, the file the
// builder website turns into client zips:
//   {version, createdAt, files: {path: {encoding: 'utf8' | 'base64', data}}}
// Exports collectTemplateFiles() for scripts/make-client.mjs.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPackExcluded } from '../builder/src/zip/build.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const TEMPLATE_DIR = join(repoRoot, 'template');
const OUT_FILE = join(repoRoot, 'builder', 'public', 'client-template.json');
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm)$/i;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function encode(path, bytes) {
    if (!BINARY.test(path) && !bytes.includes(0)) {
        try { return { encoding: 'utf8', data: utf8.decode(bytes) }; } catch { /* not text */ }
    }
    return { encoding: 'base64', data: Buffer.from(bytes).toString('base64') };
}

export function collectTemplateFiles(dir = TEMPLATE_DIR) {
    const files = {};
    const walk = folder => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
            const full = join(folder, entry.name);
            const path = relative(dir, full).split(sep).join('/');
            if (isPackExcluded(path)) continue;
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) files[path] = encode(path, readFileSync(full));
        }
    };
    walk(dir);
    return Object.fromEntries(Object.keys(files).sort().map(path => [path, files[path]]));
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
    const files = collectTemplateFiles();
    const pkg = JSON.parse(files['package.json'].data);
    mkdirSync(join(repoRoot, 'builder', 'public'), { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify({ version: pkg.version, createdAt: new Date().toISOString(), files }));
    console.log(`✓ Packed ${Object.keys(files).length} template files into ${relative(repoRoot, OUT_FILE)}.`);
}
