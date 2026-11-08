// Agency settings (.env.provision at the repo root) and per-client secrets
// (client-zips/<slug>.secrets.env). Both files are git-ignored. Values stay
// in memory: nothing here is ever written back.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const AGENCY_ENV_FILE = '.env.provision';
export const AGENCY_KEYS = Object.freeze([
    'SUPABASE_ACCESS_TOKEN', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_ACCOUNT_SLUG', 'AGENCY_DOMAIN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID',
]);

/** KEY=value lines; # comments, optional quotes and `export ` are allowed. */
export function parseEnvFile(text) {
    const values = {};
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        // A quoted value keeps any # inside the quotes; a comment may follow
        // the closing quote (KEY="value" # note).
        const quoted = value.match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
        if (quoted) value = quoted[2];
        else value = value.replace(/\s+#.*$/, '');
        values[match[1]] = value;
    }
    return values;
}

const readEnv = path => (existsSync(path) ? parseEnvFile(readFileSync(path, 'utf8')) : null);

/**
 * The agency settings. Shell environment variables win over the file (as with
 * dotenv), so CI can pass them as secrets. AGENCY_DOMAIN falls back to
 * VITE_AGENCY_DOMAIN in .env.local, the builder's own setting.
 */
export function loadAgencyEnv({ repoRoot, env = process.env } = {}) {
    const file = readEnv(join(repoRoot, AGENCY_ENV_FILE));
    const local = readEnv(join(repoRoot, '.env.local'));
    const values = {};
    for (const key of AGENCY_KEYS) {
        const value = String(env[key] ?? file?.[key] ?? '').trim();
        if (value) values[key] = value;
    }
    if (!values.AGENCY_DOMAIN && local?.VITE_AGENCY_DOMAIN?.trim()) values.AGENCY_DOMAIN = local.VITE_AGENCY_DOMAIN.trim();
    return { values, fileFound: Boolean(file) };
}

export const clientSecretsPath = (root, slug) => join(root, `${slug}.secrets.env`);

/**
 * The client's Brevo SMTP login and key:
 * {smtp: {login, key} | null, problems, warnings, path, found}.
 * A missing file is not a problem (SMTP is skipped with a warning); a Brevo
 * API key instead of an SMTP key is. An SMTP key without the xsmtpsib-
 * prefix only warns: older Brevo SMTP passwords have none.
 */
export function loadClientSecrets(path) {
    const values = readEnv(path);
    if (!values) return { smtp: null, problems: [], warnings: [], path, found: false };
    const login = String(values.BREVO_SMTP_LOGIN || '').trim();
    const key = String(values.BREVO_SMTP_KEY || '').trim();
    const problems = [];
    const warnings = [];
    if (!login && !key) return { smtp: null, problems, warnings, path, found: true };
    if (!login) problems.push(`${path} has no BREVO_SMTP_LOGIN (Brevo → SMTP & API → SMTP: the "Login", e.g. 8a1b2c001@smtp-brevo.com).`);
    if (!key) problems.push(`${path} has no BREVO_SMTP_KEY.`);
    else if (key.startsWith('xkeysib-')) problems.push(`${path}: BREVO_SMTP_KEY is a Brevo API key. Use an SMTP key instead (Brevo → SMTP & API → SMTP → Generate a new SMTP key; it starts with xsmtpsib-).`);
    else if (!key.startsWith('xsmtpsib-')) warnings.push(`${path}: BREVO_SMTP_KEY does not start with xsmtpsib-. Fine for an older Brevo SMTP password; if emails do not arrive, generate a new SMTP key in Brevo.`);
    return { smtp: problems.length ? null : { login, key }, problems, warnings, path, found: true };
}

// Variables a client build must never see: the agency's tokens (vite only
// exposes VITE_*, but there is no reason to hand them to npm scripts), and any
// VITE_* or SF_ENV_DIR of the agency's shell, which would win over the
// client's .env and build the app against the wrong project.
const STRIPPED = /^(VITE_|SF_ENV_DIR$|SUPABASE_|NETLIFY_|CLOUDFLARE_|BREVO_|AGENCY_DOMAIN$)/;
export const childEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([key]) => !STRIPPED.test(key)));
