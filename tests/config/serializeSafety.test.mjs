import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultClientConfig, validateClientConfig, hasControlChars } from '../../template/src/config/resolve.js';
import { clientConfigSource } from '../../template/src/config/serialize.js';

// Every way a line can end in JavaScript, plus bidi overrides.
const BREAKS = ['\n', '\r', '\r\n', ' ', ' '];
const payload = (end, n) => `Acme Solar${end}globalThis.__sfInjected${n} = true;//`;

function hostileConfig(end, n) {
    const config = defaultClientConfig();
    config.client.name = payload(end, n);
    config.branding.companyName = payload(end, n);
    config.pipeline.stages[1] = { ...config.pipeline.stages[1], label: payload(end, n) };
    config.pipeline.groups[0] = { ...config.pipeline.groups[0], label: payload(end, n) };
    config.customFields = [{ key: 'roof', label: payload(end, n), type: 'select', stage: 'LEADS', options: [payload(end, n), 'Ok'] }];
    config.dropdowns.module_brand = ['ADANI', payload(end, n)];
    config.dropdowns.loan_tags = [{ id: 'Inprocess', label: payload(end, n) }];
    return config;
}

test('client text cannot break out of the generated client.config.js', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sf-serialize-'));
    try {
        for (const [n, end] of BREAKS.entries()) {
            const config = hostileConfig(end, n);
            const source = clientConfigSource(config, { generatedAt: `2026-10-14${end}globalThis.__sfInjected${n} = true;//`, generator: `x${end}globalThis.__sfInjected${n} = true;//` });
            for (const ch of ['\r', ' ', ' ']) assert.ok(!source.includes(ch), `raw ${JSON.stringify(ch)} in the source`);
            // Only comment lines come before the single `export default`.
            const lines = source.split('\n');
            const start = lines.findIndex(line => line.startsWith('export default '));
            assert.ok(lines.slice(0, start).every(line => line === '' || line.startsWith('//')), 'header is comments only');
            assert.equal(source.match(/export default/g).length, 1);

            const file = join(dir, `client.config.${n}.js`);
            await writeFile(file, source);
            const module = await import(pathToFileURL(file).href);
            assert.equal(globalThis[`__sfInjected${n}`], undefined, `code ran for ${JSON.stringify(end)}`);
            assert.deepEqual(Object.keys(module), ['default']);
            assert.deepEqual(module.default, config, 'the config survives the round trip unchanged');
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('the validator rejects line breaks and control characters in one-line text', () => {
    for (const end of [...BREAKS, '\u0000', '\u001b', '\t']) {
        const { errors } = validateClientConfig(hostileConfig(end, 0));
        for (const what of ['client name', 'Company detail "companyName"', 'stage "REGISTRATION"', 'stage group "enquiry"', 'extra field "roof"', 'dropdown field "roof"', 'Solar panel brands', 'Loan statuses']) {
            assert.ok(errors.some(error => error.includes(what) && /line break or hidden character/.test(error)), `${JSON.stringify(end)}: ${what}\n${errors.join('\n')}`);
        }
    }
    assert.equal(hasControlChars('Surya Urja Pvt. Ltd. – सूर्य'), false);
    assert.equal(hasControlChars('  trailing space is trimmed  '), false);
    // The address may span lines.
    const config = defaultClientConfig();
    config.branding.address = '12 Ring Road\nSurat';
    assert.deepEqual(validateClientConfig(config).errors, []);
});

test('owner emails that could break a SQL or Markdown snippet are rejected', () => {
    const errorsFor = ownerEmail => validateClientConfig({ ...defaultClientConfig(), client: { name: 'A', slug: 'a-solar', ownerEmail } }).errors;
    for (const email of ["x');delete/**/from/**/public.profiles;--@a.co", 'a\\b@x.in', 'a"b@x.in', 'a`b@x.in', 'a\u0000b@x.in']) {
        assert.ok(errorsFor(email).some(error => /Owner email/.test(error)), email);
    }
    assert.deepEqual(errorsFor("o'brien@sun.in"), []);
});

test('own __proto__ / constructor keys from client JSON never reach the generated module', async () => {
    const { defaultClientConfig } = await import('../../template/src/config/resolve.js');
    const { clientConfigSource } = await import('../../template/src/config/serialize.js');
    const config = defaultClientConfig();
    config.customFields = JSON.parse('[{"key":"x1","label":"X","type":"text","stage":"LEADS","__proto__":{"required":true,"showInAddLead":true}}]');
    config.dropdowns.loan_tags = JSON.parse('[{"id":"A","label":"A","constructor":{"x":1}}]');
    const source = clientConfigSource(config);
    assert.ok(!source.includes('__proto__') && !source.includes('"constructor"'));
    const { default: loaded } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    assert.equal(Object.getPrototypeOf(loaded.customFields[0]), Object.prototype);
    assert.equal(loaded.customFields[0].required, undefined);
});
