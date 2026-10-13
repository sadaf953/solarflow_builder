import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSecrets, scan } from '../../scripts/check-secrets.mjs';

const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = role => `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase', ref: 'abcdefghijklmnop', role })}.signature-not-checked`;

test('finds service keys, secret keys, database passwords and GitHub tokens', () => {
    const text = [
        `key: '${jwt('service_role')}'`,
        `secret = "sb_secret_${'A'.repeat(24)}"`,
        'DATABASE_URL=postgres://postgres:hunter2@db.example.com:5432/postgres',
        `token ghp_${'a'.repeat(36)}`,
        `token github_pat_${'b'.repeat(30)}`,
    ].join('\n');
    assert.deepEqual(findSecrets(text), [
        ['service_role JWT', 1],
        ['Supabase secret key', 2],
        ['postgres URL with password', 3],
        ['GitHub token', 4],
        ['GitHub token', 5],
    ]);
});

test('public keys, placeholders and the sb_secret_ check itself are fine', () => {
    const text = [
        `VITE_SUPABASE_ANON_KEY=${jwt('anon')}`,
        "if (key.startsWith('sb_secret_')) refuse();",
        'psql "postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnop.supabase.co:5432/postgres"',
        'postgres://localhost/solarflow',
    ].join('\n');
    assert.deepEqual(findSecrets(text), []);
});

test('scan covers dist folders and skips node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-secrets-'));
    try {
        mkdirSync(join(root, 'template/dist/assets'), { recursive: true });
        mkdirSync(join(root, 'template/node_modules/pkg'), { recursive: true });
        writeFileSync(join(root, 'template/dist/assets/index.js'), `const k="${jwt('service_role')}"`);
        writeFileSync(join(root, 'template/node_modules/pkg/index.js'), `const k="${jwt('service_role')}"`);
        assert.deepEqual(scan(root), [`${join('template/dist/assets/index.js')}:1  service_role JWT`]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
