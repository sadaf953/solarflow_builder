import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseEnvProblem, isSupabaseConfigured, supabase } from '../../template/src/supabase.js';

const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = claims => `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase', ...claims })}.signature-not-checked`;
const URL_ = 'https://abcdefghijklmnop.supabase.co';
const anon = jwt({ ref: 'abcdefghijklmnop', role: 'anon' });

test('anon and publishable keys are accepted', () => {
    assert.equal(supabaseEnvProblem(URL_, anon), null);
    assert.equal(supabaseEnvProblem(`${URL_}/`, ` ${anon} `), null);
    assert.equal(supabaseEnvProblem(URL_, 'sb_publishable_abc123'), null);
    assert.equal(supabaseEnvProblem('https://api.example.in', jwt({ ref: 'other', role: 'anon' })), null);
});

test('secret keys are refused', () => {
    assert.match(supabaseEnvProblem(URL_, jwt({ ref: 'abcdefghijklmnop', role: 'service_role' })), /SECRET key/);
    assert.match(supabaseEnvProblem(URL_, 'sb_secret_abc123'), /SECRET key/);
});

test('missing or malformed values explain the fix', () => {
    assert.match(supabaseEnvProblem('', anon), /VITE_SUPABASE_URL is missing/);
    assert.match(supabaseEnvProblem(URL_, ''), /VITE_SUPABASE_ANON_KEY is missing/);
    assert.match(supabaseEnvProblem('http://abcdefghijklmnop.supabase.co', anon), /https:\/\//);
    assert.match(supabaseEnvProblem(`${URL_}/rest/v1`, anon), /just the project address/);
    assert.match(supabaseEnvProblem('not a url', anon), /not a valid web address/);
    assert.match(supabaseEnvProblem(URL_, 'hello'), /not a Supabase key/);
    assert.match(supabaseEnvProblem(URL_, jwt({ ref: 'abcdefghijklmnop', role: 'authenticated' })), /role "authenticated"/);
    assert.match(supabaseEnvProblem(URL_, jwt({ ref: 'zzzzzzzzzzzzzzzz', role: 'anon' })), /same project/);
});

test('without env values the app is not configured and the client points nowhere', () => {
    assert.equal(isSupabaseConfigured, false);
    assert.equal(supabase.supabaseUrl, 'https://unconfigured.invalid');
});

test('check-env passes for a public key and fails for a secret one', () => {
    const script = fileURLToPath(new URL('../../template/scripts/check-env.mjs', import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), 'sf-env-'));
    const env = { ...process.env, SF_ENV_DIR: dir };
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_ANON_KEY;
    const run = () => spawnSync(process.execPath, [script, 'production'], { env, encoding: 'utf8' });
    try {
        let result = run();
        assert.equal(result.status, 1);
        assert.match(result.stderr, /There is no \.env file/);

        writeFileSync(join(dir, '.env'), `VITE_SUPABASE_URL=${URL_}\nVITE_SUPABASE_ANON_KEY=${anon}\n`);
        result = run();
        assert.equal(result.status, 0, result.stderr);

        writeFileSync(join(dir, '.env.local'), 'VITE_SUPABASE_ANON_KEY=sb_secret_abc123\n');
        result = run();
        assert.equal(result.status, 1);
        assert.match(result.stderr, /SECRET key[\s\S]*Fix it in \.env, \.env\.local/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
