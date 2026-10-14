import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { defaultClientConfig } from '../../template/src/config/resolve.js';
import { clientConfigSource } from '../../template/src/config/serialize.js';
import { setupSql, README_PLACEHOLDERS } from '../../template/backend/seed.js';
import { isZipExcluded } from '../../builder/src/zip/build.js';

const TEMPLATE = fileURLToPath(new URL('../../template/', import.meta.url));
const run = promisify(execFile);

// The parts of an unzipped client folder that `npm run setup-sql` reads.
async function clientFolder(config) {
    const dir = await mkdtemp(join(tmpdir(), 'sf-setup-sql-'));
    for (const path of ['package.json', 'scripts/setup-sql.mjs', 'backend/schema.sql', 'backend/seed.js', 'src/config']) {
        await cp(join(TEMPLATE, path), join(dir, path), { recursive: true });
    }
    await writeFile(join(dir, 'src/config/client.config.js'), clientConfigSource(config, { generatedAt: '2026-10-14T00:00:00.000Z' }));
    return dir;
}

test('npm run setup-sql rebuilds backend/setup.sql from an edited client.config.js', async () => {
    const pkg = JSON.parse(await readFile(join(TEMPLATE, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['setup-sql'], 'node scripts/setup-sql.mjs');

    const config = defaultClientConfig();
    config.client = { name: "Surya's Solar", slug: 'surya-solar', ownerEmail: 'owner@surya.in' };
    config.features = { ...config.features, vendorLogin: true, inventory: true, loanTracking: false };
    config.pipeline.stages.splice(2, 0, { id: 'SITE SURVEY', custom: true, label: 'Site survey', group: 'enquiry' });
    const dir = await clientFolder(config);
    try {
        const { stdout } = await run(process.execPath, ['scripts/setup-sql.mjs'], { cwd: dir });
        assert.match(stdout, /Wrote backend\/setup\.sql/);
        const schema = await readFile(join(dir, 'backend/schema.sql'), 'utf8');
        const written = await readFile(join(dir, 'backend/setup.sql'), 'utf8');
        assert.equal(written, setupSql({ schema, config }), 'same SQL as the builder writes');
        assert.match(written, /"SITE SURVEY"/);
        assert.match(written, /user_type = any\(array\[[^\]]*'vendor'/);

        // A broken config leaves the old setup.sql alone and says why.
        const broken = structuredClone(config);
        broken.client.slug = 'Not A Slug';
        await writeFile(join(dir, 'src/config/client.config.js'), clientConfigSource(broken));
        await assert.rejects(run(process.execPath, ['scripts/setup-sql.mjs'], { cwd: dir }), error => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /Client slug/);
            return true;
        });
        assert.equal(await readFile(join(dir, 'backend/setup.sql'), 'utf8'), written);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('the zip carries what it needs to change features later and to host from Git', async () => {
    for (const path of ['scripts/setup-sql.mjs', 'backend/seed.js', 'backend/schema.sql', '.gitignore', 'package-lock.json']) {
        assert.equal(isZipExcluded(path), false, path);
    }
    const gitignore = (await readFile(join(TEMPLATE, '.gitignore'), 'utf8')).split('\n');
    for (const line of ['node_modules/', 'dist/', '.env', '.env.*', '!.env.example']) assert.ok(gitignore.includes(line), line);

    const pkg = JSON.parse(await readFile(join(TEMPLATE, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(TEMPLATE, 'package-lock.json'), 'utf8'));
    assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
    assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);

    const readme = await readFile(join(TEMPLATE, 'README.client.md'), 'utf8');
    assert.match(readme, /npm ci/);
    assert.match(readme, /## Changing features later[\s\S]*npm run setup-sql/);
    assert.match(readme, /VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`[^\n]*Environment variables/);
    const header = clientConfigSource(defaultClientConfig());
    assert.match(header, /npm run setup-sql/);
    assert.doesNotMatch(header, /changing true\/false below, then rebuild/);
});

test("the owner email in the README's SQL snippet is a safe SQL literal", async () => {
    const readme = await readFile(join(TEMPLATE, 'README.client.md'), 'utf8');
    assert.match(readme, /lower\('\{\{OWNER_EMAIL_SQL\}\}'\)/);
    assert.doesNotMatch(readme, /'\{\{OWNER_EMAIL\}\}'/);
    const config = { ...defaultClientConfig(), client: { name: 'A', slug: 'a-solar', ownerEmail: "o'brien@sun.in" } };
    assert.equal(README_PLACEHOLDERS.OWNER_EMAIL_SQL(config), "o''brien@sun.in");
    assert.equal(README_PLACEHOLDERS.OWNER_EMAIL(config), "o'brien@sun.in");
});
