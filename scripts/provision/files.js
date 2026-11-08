// The client's files: the same zip scripts/make-client.mjs writes, unzipped
// next to it so it can be built, and the built dist/ zipped for Netlify.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { buildOptions, createClientZip, parseSubmissionJson } from '../../builder/src/zip/build.js';
import { collectTemplateFiles, TEMPLATE_DIR } from '../pack-template.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

/** createClientZip with the same inputs as makeClient(), in memory. */
export function buildClientZip({ answersText, generatedAt, templateFiles = collectTemplateFiles() }) {
    const { submission, ...settings } = parseSubmissionJson(answersText);
    return createClientZip({
        templateFiles,
        schemaSql: readFileSync(join(TEMPLATE_DIR, 'backend', 'schema.sql'), 'utf8'),
        submission,
        ...buildOptions(settings),
        generatedAt,
    });
}

/** Unzips `bytes` into `outDir`. Existing .env, node_modules and dist stay. */
export function extractZip(bytes, outDir) {
    const root = resolve(outDir);
    for (const [path, content] of Object.entries(unzipSync(bytes))) {
        if (path.endsWith('/')) continue;
        const target = resolve(root, path);
        if (!target.startsWith(root + sep)) throw new Error(`Unsafe path in the client zip: ${path}`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
    }
}

function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(path);
        else if (entry.isFile()) yield path;
    }
}

const ZIP_TIME = new Date('2000-01-01T00:00:00Z');

/** dist/ as a zip with fixed dates and order, so the same build gives the same bytes and hash. */
export function zipFolder(dir) {
    const entries = {};
    for (const path of [...walk(dir)].sort()) {
        entries[relative(dir, path).split(sep).join('/')] = [readFileSync(path), { mtime: ZIP_TIME }];
    }
    return zipSync(entries);
}

/** Text files of a folder, for the secret scan before upload. */
export function* textFiles(dir) {
    for (const path of walk(dir)) {
        if (/\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm|wasm)$/i.test(path)) continue;
        if (statSync(path).size > 20 * 1024 * 1024) continue;
        yield { path, text: readFileSync(path, 'utf8') };
    }
}
