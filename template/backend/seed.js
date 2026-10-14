// Per-client database seed, generated from the client config.
//
// Pure: the builder and the zip generator call it with a config and write the
// result next to schema.sql. Every value from the setup form goes through
// sqlText(), so a quote in a company name cannot break out of the SQL.
// It seeds settings, enabled login types and dropdown lists - never people
// or customers.

import { resolveClientConfig } from '../src/config/resolve.js';
import { ROLE_FEATURE } from '../src/config/catalog/features.js';
import { METADATA_CATEGORIES } from '../src/config/catalog/dropdowns.js';

// {{NAME}} placeholders in README.client.md, each with the value the zip
// generator puts in its place. *_SQL values sit inside a '...' SQL literal.
const ownerEmail = config => String(resolveClientConfig(config).client.ownerEmail || '').trim() || 'your own email address';
export const README_PLACEHOLDERS = Object.freeze({
    CLIENT_NAME: config => resolveClientConfig(config).client.name,
    OWNER_EMAIL: ownerEmail,
    OWNER_EMAIL_SQL: config => clean(ownerEmail(config)).replaceAll("'", "''"),
});

const ALWAYS_ENABLED_ROLES = ['admin', 'sales'];
const TERMINAL_STAGES = ['COMPLETED', 'LOST PROJECT'];

// Postgres rejects NUL in text and lone surrogates in jsonb, so both are
// removed from every string before it is written. Everything else is safe once
// quotes are doubled (standard_conforming_strings is on, so backslashes are literal).
const clean = value => String(value ?? '').toWellFormed().replaceAll('\0', '');
const cleanDeep = value => {
    if (typeof value === 'string') return clean(value);
    if (Array.isArray(value)) return value.map(cleanDeep);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [clean(key), cleanDeep(item)]));
    }
    return value;
};
const sqlText = value => `'${clean(value).replaceAll("'", "''")}'`;
const sqlJson = value => `${sqlText(JSON.stringify(cleanDeep(value)))}::jsonb`;
const sqlTextArray = values => (values.length ? `array[${values.map(sqlText).join(', ')}]` : `'{}'::text[]`);

export function configSeedSql(config) {
    const resolved = resolveClientConfig(config);
    const enabledRoles = [
        ...ALWAYS_ENABLED_ROLES,
        ...Object.entries(ROLE_FEATURE).filter(([, feature]) => resolved.features[feature]).map(([role]) => role),
    ];
    const settings = [
        ['features', resolved.features],
        ['pipeline', { stages: resolved.stages.map(stage => stage.id), terminal: TERMINAL_STAGES }],
        ['owner_email', clean(resolved.client.ownerEmail).trim().toLowerCase()],
        ['client', { name: clean(resolved.client.name), slug: clean(resolved.client.slug) }],
    ];
    const metadataRows = METADATA_CATEGORIES.flatMap(category => (resolved.dropdowns.metadata[category] || [])
        .map((label, index) => `  (${sqlText(category)}, ${sqlText(label)}, ${index + 1})`));

    return [
        `-- Settings for ${clean(resolved.client.name).replace(/\s+/g, ' ')}. Safe to run again.`,
        'begin;',
        '',
        'insert into public.app_settings(key, value) values',
        settings.map(([key, value]) => `  (${sqlText(key)}, ${sqlJson(value)})`).join(',\n'),
        'on conflict (key) do update set value = excluded.value, updated_at = now();',
        '',
        `update public.app_roles set enabled = (user_type = any(${sqlTextArray(enabledRoles)}));`,
        '',
        ...(metadataRows.length ? [
            'insert into public.metadata(category, label, sort_order) values',
            metadataRows.join(',\n'),
            'on conflict (category, label) do nothing;',
            '',
        ] : []),
        '-- Profiles for logins created before this script ran (owner email is now known).',
        'select solarflow_private.backfill_profiles();',
        '',
        'commit;',
        '',
        "notify pgrst, 'reload schema';",
        '',
    ].join('\n');
}

// The single file the client pastes into the SQL Editor (backend/setup.sql).
export function setupSql({ schema, config }) {
    return `${schema.trimEnd()}\n\n${configSeedSql(config)}`;
}
