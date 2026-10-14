// Builds a client zip from a submission. Pure: runs in the browser (admin
// page) and in Node (scripts/make-client.mjs), so both produce the same zip.

import { zipSync, strToU8 } from 'fflate';
import { clientConfigSource } from '../../../template/src/config/serialize.js';
import { validateClientConfig } from '../../../template/src/config/resolve.js';
import { setupSql, README_PLACEHOLDERS } from '../../../template/backend/seed.js';
import { submissionToClientConfig } from '../catalog/submission.js';
import { setupSummaryMarkdown } from './summary.js';

export const TEMPLATE_README = 'README.client.md';
export const CONFIG_PATH = 'src/config/client.config.js';
const SCHEMA_PATH = 'backend/schema.sql';
const PACKAGE_LOCK = 'package-lock.json';

const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'tests', '.git', '.vite']);

// Template paths (relative to template/) that are never packed.
export function isPackExcluded(path) {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    return parts.some(part => SKIPPED_FOLDERS.has(part))
        || name.startsWith('.env') || name === '.DS_Store' || name.endsWith('.log')
        || path === CONFIG_PATH;
}

// Packed template paths that never go into a zip. README.client.md is packed
// only so buildClientFiles can turn it into README.md.
export const isZipExcluded = path => isPackExcluded(path) || path === TEMPLATE_README;

// Files that are already compressed are stored as they are.
const STORED = /\.(png|jpe?g|gif|webp|ico|woff2?|zip|gz|pdf)$/i;

function base64ToBytes(data) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// One entry of client-template.json ({encoding, data}), or a string / bytes.
export function decodeTemplateFile(entry) {
    if (typeof entry === 'string' || entry instanceof Uint8Array) return entry;
    if (entry?.encoding === 'base64') return base64ToBytes(entry.data);
    if (entry?.encoding === 'utf8') return entry.data;
    throw new Error('Unknown file format in the client template.');
}

function templateText(templateFiles, path) {
    const entry = templateFiles?.[path];
    if (entry == null) throw new Error(`The client template has no ${path}. Run npm run pack:template and try again.`);
    const value = decodeTemplateFile(entry);
    return typeof value === 'string' ? value : new TextDecoder().decode(value);
}

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

// Fills the {{TOKENS}} of README.client.md in one pass. Inserted values are
// never scanned again, and a replacer function keeps "$&" and friends
// literal, so a company name like "{{FOO}}" or "A$&B" is printed as typed.
export function fillReadme(text, config) {
    const unknown = [...new Set([...text.matchAll(PLACEHOLDER)]
        .filter(([, name]) => !Object.hasOwn(README_PLACEHOLDERS, name)).map(([token]) => token))];
    if (unknown.length) throw new Error(`README.client.md has placeholders with no value: ${unknown.join(', ')}.`);
    const values = {};
    return text.replace(PLACEHOLDER, (_, name) => (values[name] ??= String(README_PLACEHOLDERS[name](config) ?? '')));
}

export const ENV_EXAMPLE = [
    '# Copy this file to .env and fill in both values from',
    '# Supabase -> Project Settings -> API. Use only the anon / publishable key,',
    '# never the service_role or secret key: everything here ends up in the browser.',
    'VITE_SUPABASE_URL=https://your-project-ref.supabase.co',
    'VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key',
    '',
].join('\n');

function clientPackageJson(text, slug) {
    const pkg = JSON.parse(text);
    return `${JSON.stringify({ ...pkg, name: slug }, null, 2)}\n`;
}

// package-lock.json names the package twice; both follow package.json, so
// npm ci does not report the lock file as out of date.
function clientPackageLock(text, slug) {
    const lock = JSON.parse(text);
    const root = lock.packages?.[''];
    const packages = root ? { ...lock.packages, '': { ...root, name: slug } } : lock.packages;
    return `${JSON.stringify({ ...lock, name: slug, ...(packages ? { packages } : {}) }, null, 2)}\n`;
}

// schema.sql and seed.js ship for `npm run setup-sql`; this note says which
// file to run, since schema.sql alone has no owner email, features or stages.
export const BACKEND_README = [
    '# Which file to run',
    '',
    'Run **`setup.sql`** in the Supabase SQL Editor (README.md, step 3). It is `schema.sql` with this app\'s settings (features, stages, lists and the owner email) added at the end.',
    '',
    '- `schema.sql` and `seed.js` are what `npm run setup-sql` builds `setup.sql` from. Do not run `schema.sql` on its own: the database would have no stages, and the first login created would become the admin.',
    '- `functions/add_user` is the staff-login function (README.md, step 4).',
    '',
].join('\n');

const isoTime = value => (value ? new Date(value) : new Date()).toISOString();

// Files the generator writes over / next to the template, as {path: text}.
export function buildClientFiles({ templateFiles, config, schemaSql, generatedAt, summaryMarkdown }) {
    const at = isoTime(generatedAt);
    return {
        [CONFIG_PATH]: clientConfigSource(config, { generatedAt: at }),
        'backend/setup.sql': setupSql({ schema: schemaSql ?? templateText(templateFiles, SCHEMA_PATH), config }),
        'backend/README.md': BACKEND_README,
        'README.md': fillReadme(templateText(templateFiles, TEMPLATE_README), config),
        '.env.example': ENV_EXAMPLE,
        'package.json': clientPackageJson(templateText(templateFiles, 'package.json'), config.client.slug),
        ...(templateFiles?.[PACKAGE_LOCK] != null
            ? { [PACKAGE_LOCK]: clientPackageLock(templateText(templateFiles, PACKAGE_LOCK), config.client.slug) } : {}),
        'SETUP-SUMMARY.md': summaryMarkdown ?? setupSummaryMarkdown({ config, generatedAt: at }),
    };
}

// Template files plus generated files (which win) as one zip, every path
// under rootFolder. Entries are sorted and dated `mtime` so the same input
// gives the same bytes.
export function makeZip({ templateFiles = {}, files = {}, rootFolder = '', mtime } = {}) {
    const root = rootFolder ? `${rootFolder.replace(/\/+$/, '')}/` : '';
    const date = mtime ? new Date(mtime) : new Date();
    const entries = new Map();
    for (const [path, entry] of Object.entries(templateFiles)) {
        if (!isZipExcluded(path)) entries.set(path, decodeTemplateFile(entry));
    }
    for (const [path, content] of Object.entries(files)) entries.set(path, content);
    const zippable = {};
    for (const path of [...entries.keys()].sort()) {
        const content = entries.get(path);
        const bytes = typeof content === 'string' ? strToU8(content) : content;
        zippable[root + path] = [bytes, { mtime: date, level: STORED.test(path) ? 0 : 6 }];
    }
    return zipSync(zippable);
}

// validateClientConfig plus what the agency should know before sending.
// `adminWorkflow` is the workflow the admin set up on the client page.
export function checkClientConfig(config, { adminWorkflow } = {}) {
    const { errors, warnings } = validateClientConfig(config);
    if (!String(config?.client?.ownerEmail || '').trim()) {
        warnings.push('No owner email: the first login created in the client’s Supabase project becomes the admin.');
    }
    if (config?.workflowSource?.type === 'sheet' && !adminWorkflow) {
        warnings.push('The client shared a sheet instead of filling in the workflow. The standard stages are used until you set them up from the sheet.');
    }
    return { errors, warnings };
}

function configFor(submission, { adminOverrides, slug, ownerEmail, branding, workflow }) {
    if (!submission || typeof submission !== 'object') throw new Error('There is no submission to build from.');
    const config = submissionToClientConfig(submission, { adminOverrides, slug, ownerEmail, branding, workflow });
    const validation = checkClientConfig(config, { adminWorkflow: workflow });
    if (validation.errors.length) {
        const error = new Error(`This setup cannot be built yet: ${validation.errors.join(' ')}`);
        error.code = 'invalid_config';
        error.validation = validation;
        throw error;
    }
    return { config, validation };
}

// `workflow` is the admin's workflow (settings.workflow); it wins over the client's.
export function createClientZip({ templateFiles, schemaSql, submission, adminOverrides = {}, slug, ownerEmail, branding, workflow, generatedAt }) {
    const at = isoTime(generatedAt);
    const { config, validation } = configFor(submission, { adminOverrides, slug, ownerEmail, branding, workflow });
    const summaryMarkdown = setupSummaryMarkdown({ submission, adminOverrides, adminWorkflow: workflow, config, validation, generatedAt: at });
    const files = buildClientFiles({ templateFiles, config, schemaSql, generatedAt: at, summaryMarkdown });
    const folder = `${config.client.slug}-solarflow`;
    const bytes = makeZip({ templateFiles, files, rootFolder: folder, mtime: at });
    return { fileName: `${folder}.zip`, bytes, config, validation, summaryMarkdown };
}

export function createSetupSql({ schemaSql, submission, adminOverrides = {}, slug, ownerEmail, branding, workflow }) {
    const { config } = configFor(submission, { adminOverrides, slug, ownerEmail, branding, workflow });
    return { fileName: `${config.client.slug}-setup.sql`, sql: setupSql({ schema: schemaSql, config }), config };
}

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const filledText = value => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

// The admin settings {adminOverrides, slug, ownerEmail, branding, workflow}
// as build options. The admin page and scripts/make-client.mjs both use it,
// so the same settings give the same zip.
export function buildOptions(settings = {}) {
    return {
        adminOverrides: isPlainObject(settings?.adminOverrides) ? settings.adminOverrides : {},
        slug: filledText(settings?.slug),
        ownerEmail: filledText(settings?.ownerEmail),
        branding: isPlainObject(settings?.branding) ? settings.branding : {},
        workflow: isPlainObject(settings?.workflow) ? settings.workflow : undefined,
    };
}

// A submission file: either the payload itself, or an export that wraps it
// as {payload | submission, adminOverrides?, slug?, ownerEmail?, branding?, workflow?}.
// Returns {submission, ...buildOptions}.
export function parseSubmissionJson(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
    const wrapped = data?.payload ?? data?.submission;
    const submission = wrapped && typeof wrapped === 'object' ? wrapped : data;
    if (!submission || typeof submission !== 'object' || submission.schemaVersion !== 1) {
        throw new Error('This file is not a SolarFlow setup submission (schemaVersion 1).');
    }
    return { submission, ...buildOptions(wrapped ? data : {}) };
}
