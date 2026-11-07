// Per-client provisioning state: client-zips/<slug>/provision-state.json.
// It holds refs, ids, host names, hashes and times so a re-run finds what
// exists instead of creating it again. It never holds a secret: saveState
// refuses to write when the JSON contains a secret value of this run or
// anything check-secrets would flag.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findSecrets } from '../check-secrets.mjs';

export const STATE_FILE = 'provision-state.json';
export const STATE_VERSION = 1;

export const statePath = (root, slug) => join(root, slug, STATE_FILE);

export function emptyState(slug) {
    return { version: STATE_VERSION, slug, steps: {} };
}

export function loadState(path, slug) {
    if (!existsSync(path)) return emptyState(slug);
    let state;
    try { state = JSON.parse(readFileSync(path, 'utf8')); } catch {
        throw new Error(`${path} is not valid JSON. Fix it, or move it away to start this client again (that would create a second project).`);
    }
    if (state?.slug && state.slug !== slug) throw new Error(`${path} belongs to “${state.slug}”, not “${slug}”.`);
    return { ...emptyState(slug), ...state, steps: { ...(state.steps || {}) } };
}

/** Throws when `text` contains a secret; `secrets` are this run's secret values. */
export function assertNoSecrets(text, secrets = [], where = 'the state file') {
    const leaked = [...secrets].filter(value => typeof value === 'string' && value.length >= 8 && text.includes(value));
    const flagged = findSecrets(text);
    if (leaked.length || flagged.length) {
        throw new Error(`Refusing to write a secret to ${where}${flagged.length ? ` (${flagged.map(([kind]) => kind).join(', ')})` : ''}. This is a bug in scripts/provision; nothing was written.`);
    }
}

export function saveState(path, state, { secrets = [] } = {}) {
    const text = `${JSON.stringify(state, null, 2)}\n`;
    assertNoSecrets(text, secrets);
    mkdirSync(dirname(path), { recursive: true });
    // Write then rename, so an interrupted run never leaves half a file.
    const temp = `${path}.tmp`;
    writeFileSync(temp, text);
    renameSync(temp, path);
}

/** Every provisioned client under `root`: [{path, state}]. */
export function listStates(root) {
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, STATE_FILE)))
        .map(entry => {
            const path = join(root, entry.name, STATE_FILE);
            try { return { path, state: JSON.parse(readFileSync(path, 'utf8')) }; } catch { return { path, state: null }; }
        })
        .sort((a, b) => a.path.localeCompare(b.path));
}
