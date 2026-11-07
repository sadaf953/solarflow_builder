import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { makeClient } from '../../scripts/make-client.mjs';
import { collectTemplateFiles } from '../../scripts/pack-template.mjs';
import { agency, agencyFrom, inviteEmailText } from '../../builder/src/agency.js';
import { emptyGoLive } from '../../builder/src/catalog/goLive.js';
import {
    ADD_ON_DECISIONS, ADD_ON_LIMITS, ADD_ON_RULE, CUSTOMIZATION_MENU, LAUNCH_DAYS, PAYMENT_TAB_FEATURES,
    addOnList, normalizeAddOnRequests, normalizeAddOns, withAddOn, withoutAddOn,
} from '../../builder/src/catalog/menu.js';
import { questionById } from '../../builder/src/catalog/questions.js';
import { emptySubmission, submissionToClientConfig } from '../../builder/src/catalog/submission.js';
import { normalizeSettings, normalizeSubmission } from '../../builder/src/components/wizardData.js';
import { goLiveErrors } from '../../builder/src/pages/wizard/checks.js';
import { buildOptions, createClientZip, parseSubmissionJson } from '../../builder/src/zip/build.js';
import { setupSummaryMarkdown } from '../../builder/src/zip/summary.js';
import { FEATURE_REGISTRY } from '../../template/src/config/catalog/features.js';
import { CUSTOM_FIELD_TYPES, DROPDOWN_CATALOG } from '../../template/src/config/catalog/dropdowns.js';
import { LIMITS } from '../../template/src/config/resolve.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/submission.json', import.meta.url), 'utf8'));
const GENERATED_AT = '2026-10-01T10:00:00.000Z';
const SLUG = 'surya-o-neil-solar';
const tmp = () => mkdtempSync(join(tmpdir(), 'sf-golive-'));

const READY = {
    domainMode: 'ours', ownDomain: '', supabaseOrg: 'https://supabase.com/dashboard/org/surya-solar/team', supabaseInvited: true,
    senderEmail: 'Info@Surya.example', senderName: '', brevoReady: true,
};
const withGoLive = (goLive, extra = {}) => ({ ...fixture, goLive: { ...emptyGoLive(), ...goLive }, ...extra });
const summaryFor = (submission, options = {}) => setupSummaryMarkdown({
    submission, config: submissionToClientConfig(submission), generatedAt: GENERATED_AT, ...options,
});
const sectionOf = (markdown, title) => (markdown.split(`## ${title}\n`)[1]?.split('\n## ')[0] ?? '').trim();

test('older payloads get empty go-live details and no add-on requests', () => {
    const empty = emptySubmission();
    assert.deepEqual(empty.goLive, emptyGoLive());
    assert.deepEqual(empty.addOnRequests, []);
    const old = normalizeSubmission({ schemaVersion: 1, contact: { company: 'Sun' }, answers: {}, workflow: {} });
    assert.deepEqual(old.goLive, emptyGoLive());
    assert.deepEqual(old.addOnRequests, []);
    assert.deepEqual(normalizeSubmission(null).goLive, emptyGoLive());
});

test('stored go-live details and add-on requests are typed and within the limits', () => {
    const submission = normalizeSubmission({
        ...fixture,
        goLive: { domainMode: 'own', ownDomain: 'crm.surya.in', supabaseInvited: 'yes', brevoReady: true, senderName: 4, extra: 1 },
        addOnRequests: [
            { id: 'a1', text: 'A custom report' }, { id: 'a1', text: 'duplicate id' }, { id: 'not an id!', text: 'x' },
            'text', { id: 'b2' }, { id: 'c3', text: 'z'.repeat(600) }, { id: 'd4', text: '' },
        ],
    });
    assert.deepEqual(submission.goLive, { ...emptyGoLive(), domainMode: 'own', ownDomain: 'crm.surya.in', brevoReady: true });
    assert.deepEqual(submission.addOnRequests.map(request => request.id), ['a1', 'c3', 'd4']);
    assert.equal(submission.addOnRequests[1].text.length, ADD_ON_LIMITS.text);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, text: `Request ${i}` }));
    assert.equal(normalizeAddOnRequests(many).length, ADD_ON_LIMITS.requests);
    assert.deepEqual(normalizeAddOnRequests({ id: 'a1' }), []);
});

test('admin go-live changes keep only known keys of the right type; add-on decisions are typed', () => {
    const settings = normalizeSettings({
        goLive: { domainMode: 'xyz', ownDomain: 'crm.surya.in', supabaseInvited: 'yes', brevoReady: false, senderEmail: '', extra: 1 },
        addOns: [
            { id: 'a1', from: 'client', text: 'copied text', decision: 'addon', price: '₹1,50,000', timeline: '2 weeks', note: 'n' },
            { id: 'a1', from: 'client', decision: 'menu' },
            { id: 'm1', from: 'admin', text: 'Data migration', decision: 'maybe', price: 12000.5 },
            { id: 'x1', from: 'someone', text: 'dropped' },
            'dropped',
        ],
    });
    assert.deepEqual(settings.goLive, { ownDomain: 'crm.surya.in', senderEmail: '', brevoReady: false });
    assert.deepEqual(settings.addOns, [
        { id: 'a1', from: 'client', text: '', decision: 'addon', price: '150000', timeline: '2 weeks', note: 'n' },
        { id: 'm1', from: 'admin', text: 'Data migration', decision: '', price: '12000', timeline: '', note: '' },
    ]);
    assert.deepEqual(normalizeSettings(settings), settings, 'normalizing twice changes nothing');
    assert.deepEqual(normalizeSettings({ goLive: [], addOns: {} }).goLive, {});
    assert.equal(normalizeAddOns(Array.from({ length: 150 }, (_, i) => ({ id: `a${i}`, from: 'admin' }))).length, ADD_ON_LIMITS.entries);
});

test('the go-live step only stops sending for malformed values', () => {
    assert.deepEqual(goLiveErrors(emptyGoLive()), {}, 'skipping the step is fine');
    assert.deepEqual(goLiveErrors(undefined), {});
    assert.deepEqual(goLiveErrors(READY), {});
    assert.deepEqual(goLiveErrors({ ...READY, domainMode: 'own', ownDomain: 'https://CRM.Surya.in/login' }), {});
    assert.deepEqual(goLiveErrors({ ...READY, supabaseOrg: 'surya-solar', supabaseInvited: false, brevoReady: false }), {}, 'unticked boxes never block');
    assert.deepEqual(Object.keys(goLiveErrors({ domainMode: 'own', ownDomain: '' })), ['ownDomain']);
    assert.deepEqual(Object.keys(goLiveErrors({ ...READY, domainMode: 'own', ownDomain: 'crm surya' })), ['ownDomain']);
    assert.deepEqual(Object.keys(goLiveErrors({ supabaseOrg: 'https://supabase.com/dashboard/projects' })), ['supabaseOrg']);
    assert.deepEqual(Object.keys(goLiveErrors({ senderEmail: 'info@' })), ['senderEmail']);
    assert.deepEqual(Object.keys(goLiveErrors({ senderName: 'Surya "Solar"' })), ['senderName']);
});

test('the menu names only switchable features and the real limits', () => {
    const available = Object.keys(FEATURE_REGISTRY).filter(id => FEATURE_REGISTRY[id].status === 'available');
    const mentioned = CUSTOMIZATION_MENU.flatMap(section => [...(section.features || []), ...(section.groups || []).flatMap(group => group.features)]);
    for (const id of mentioned) assert.equal(FEATURE_REGISTRY[id]?.status, 'available', `${id} is a switchable feature`);
    const switches = CUSTOMIZATION_MENU.find(section => section.id === 'features').groups.flatMap(group => group.features);
    assert.deepEqual([...switches].sort(), [...available].sort(), 'every feature switch is on the menu, once');

    assert.deepEqual(PAYMENT_TAB_FEATURES, ['loanTracking', 'cashPayments', 'installationCommission', 'vendorCommission']);
    const payments = questionById('payments').options.flatMap(option => option.features);
    assert.ok(payments.includes('loanTracking') && payments.includes('cashPayments'), 'loan and cash follow the payments question');

    const section = id => CUSTOMIZATION_MENU.find(item => item.id === id);
    assert.ok(section('stages').items.some(item => item.includes(`up to ${LIMITS.customStages} stages`)));
    assert.match(section('fields').text, new RegExp(`Up to ${LIMITS.customFields} fields`));
    assert.match(section('lists').text, new RegExp(`up to ${LIMITS.listItems} per list`));
    for (const label of Object.values(CUSTOM_FIELD_TYPES)) assert.ok(section('fields').items[0].includes(label), label);
    assert.deepEqual(section('lists').items, Object.values(DROPDOWN_CATALOG).map(list => list.label));

    assert.equal(LAUNCH_DAYS, '3–5 working days');
    assert.ok(ADD_ON_RULE.includes(LAUNCH_DAYS));
    assert.deepEqual(ADD_ON_DECISIONS.map(option => option.value), ['', 'menu', 'addon', 'declined']);
});

test('the add-on list joins client requests, admin decisions and admin items', () => {
    const submission = { addOnRequests: [{ id: 'a1', text: '  A custom report  ' }, { id: 'a2', text: ' ' }, { id: 'a3', text: 'WhatsApp messages' }] };
    let addOns = withAddOn([], { id: 'a1', from: 'client', text: 'ignored', decision: 'addon', price: '15,000', timeline: '2 weeks after launch' });
    addOns = withAddOn(addOns, { id: 'gone', from: 'client', decision: 'declined' });
    addOns = withAddOn(addOns, { id: 'm1', from: 'admin', text: 'Old data migration', decision: 'addon' });
    assert.deepEqual(addOns[0], { id: 'a1', from: 'client', text: '', decision: 'addon', price: '15000', timeline: '2 weeks after launch', note: '' });

    const list = addOnList(submission, addOns);
    assert.deepEqual(list.map(entry => `${entry.from}:${entry.id}`), ['client:a1', 'client:a3', 'admin:m1'], 'blank and removed requests are left out');
    assert.equal(list[0].text, 'A custom report');
    assert.equal(list[1].decision, '', 'a request without a decision is undecided');

    addOns = withAddOn(addOns, { ...list[0], decision: 'menu' });
    assert.equal(addOns.length, 3, 'an existing decision is replaced, not added');
    assert.equal(addOnList(submission, addOns)[0].decision, 'menu');
    assert.deepEqual(addOnList(submission, withoutAddOn(addOns, list[2])).map(entry => entry.id), ['a1', 'a3']);
});

test('agency details come from the env, and the copy still reads without them', () => {
    assert.deepEqual(agency, { domain: '', email: '' }, 'Node has no import.meta.env');
    assert.deepEqual(agencyFrom({ VITE_AGENCY_DOMAIN: 'https://SolarFlow.example/', VITE_AGENCY_EMAIL: ' Team@SolarFlow.example ' }),
        { domain: 'solarflow.example', email: 'team@solarflow.example' });
    assert.deepEqual(agencyFrom({ VITE_AGENCY_DOMAIN: 'not a domain', VITE_AGENCY_EMAIL: 'team@' }), { domain: '', email: '' });
    assert.deepEqual(agencyFrom(), { domain: '', email: '' });
    assert.match(inviteEmailText(), /our team email/);
    assert.equal(inviteEmailText({ email: 'team@solarflow.example' }), 'team@solarflow.example');
});

test('SETUP-SUMMARY has the go-live details, with admin changes winning', () => {
    const submission = withGoLive(READY);
    const known = sectionOf(summaryFor(submission, { agencyDomain: 'solarflow.example', goLive: { senderName: 'Surya Team' } }), 'Go live');
    assert.match(known, /- Web address: `https:\/\/surya-o-neil-solar\.solarflow\.example` \(free address on the agency domain\)/);
    assert.match(known, /- Supabase organization: surya-solar \(agency invited as Administrator: yes\)/);
    assert.match(known, /- Email sender: Surya Team, info@surya\.example \(verified in Brevo: yes\)/);
    assert.match(known, /SMTP key is never stored by the builder/);
    assert.doesNotMatch(known, /Fix before provisioning|\*\*Check:\*\*/);

    // The CLI does not know the agency domain: the address keeps a placeholder, and that is not a problem.
    const cli = sectionOf(summaryFor(submission), 'Go live');
    assert.match(cli, /- Web address: `https:\/\/surya-o-neil-solar\.<agency domain>`/);
    assert.doesNotMatch(cli, /agency domain for free addresses is not set|invalid/);

    const own = sectionOf(summaryFor(withGoLive({ ...READY, domainMode: 'own', ownDomain: 'CRM.Surya.in' })), 'Go live');
    assert.match(own, /- Web address: `https:\/\/crm\.surya\.in` \(the client’s own address: they add one CNAME record/);

    const blank = sectionOf(summaryFor(fixture), 'Go live');
    assert.match(blank, /- Supabase organization: not given yet/);
    assert.match(blank, /- Email sender: none yet/);
    assert.match(blank, /\*\*Fix before provisioning:\*\*\n\n- The client’s Supabase organization is not known yet\./);
    assert.match(blank, /\*\*Check:\*\*\n\n- No email sender yet/);
    const fixed = sectionOf(summaryFor(fixture, { goLive: { supabaseOrg: 'surya-solar', supabaseInvited: true } }), 'Go live');
    assert.doesNotMatch(fixed, /Fix before provisioning/, 'the admin can fill in what the client left out');
});

test('SETUP-SUMMARY lists paid add-ons apart from the launch', () => {
    const submission = {
        ...fixture,
        addOnRequests: [{ id: 'a1', text: 'A *custom* report\n# by district' }, { id: 'a2', text: 'Rename a stage' }, { id: 'a3', text: 'A new login type' }, { id: 'a4', text: 'Undecided' }],
    };
    const addOns = [
        { id: 'a1', from: 'client', decision: 'addon', price: '15000', timeline: '2 weeks after launch', note: 'Bank format' },
        { id: 'a2', from: 'client', decision: 'menu' },
        { id: 'a3', from: 'client', decision: 'declined' },
        { id: 'm1', from: 'admin', text: 'Old data migration', decision: 'addon' },
    ];
    const markdown = summaryFor(submission, { addOns });
    const section = sectionOf(markdown, 'Paid add-ons (separate timeline, not part of the launch)');
    assert.match(section, /^The launch takes 3–5 working days\. Paid add-ons are quoted separately/);
    assert.match(section, /- \*\*A \\\*custom\\\* report \\# by district\*\* \(asked by the client\): ₹15,000; 2 weeks after launch; note: Bank format/);
    assert.match(section, /- \*\*Old data migration\*\* \(added by the SolarFlow team\): price not set; timeline not set/);
    assert.match(section, /Not decided yet:\n\n- Undecided \(asked by the client\)/);
    assert.match(section, /Covered by the menu at no charge:\n\n- Rename a stage/);
    assert.match(section, /Not doing:\n\n- A new login type/);
    assert.match(sectionOf(summaryFor(fixture), 'Paid add-ons (separate timeline, not part of the launch)'), /\n\nNone\.$/);
    assert.ok(markdown.indexOf('## Go live') < markdown.indexOf('## Paid add-ons'));
});

test('go-live and add-on settings reach the zip summary only, and exports carry them to make-client', () => {
    const templateFiles = { 'package.json': '{"name":"x"}', 'README.client.md': '# {{CLIENT_NAME}}' };
    const submission = withGoLive(READY, { addOnRequests: [{ id: 'a1', text: 'A custom report' }] });
    const settings = normalizeSettings({ goLive: { senderName: 'Surya Team' }, addOns: [{ id: 'a1', from: 'client', decision: 'addon', price: '15000' }] });
    const plain = createClientZip({ templateFiles, schemaSql: '-- schema', submission, generatedAt: GENERATED_AT });
    const full = createClientZip({ templateFiles, schemaSql: '-- schema', submission, ...buildOptions({ ...settings, agencyDomain: 'solarflow.example' }), generatedAt: GENERATED_AT });
    assert.deepEqual(full.config, plain.config, 'go-live details never change the app config');
    const [a, b] = [plain, full].map(result => unzipSync(result.bytes));
    for (const path of Object.keys(a)) {
        if (!path.endsWith('SETUP-SUMMARY.md')) assert.ok(Buffer.from(a[path]).equals(Buffer.from(b[path])), `${path} is unchanged`);
    }
    const summary = strFromU8(b[`${SLUG}-solarflow/SETUP-SUMMARY.md`]);
    assert.match(summary, /surya-o-neil-solar\.solarflow\.example/);
    assert.match(summary, /Surya Team, info@surya\.example/);
    assert.match(summary, /\*\*A custom report\*\* \(asked by the client\): ₹15,000/);

    assert.deepEqual(buildOptions({}), {
        adminOverrides: {}, slug: undefined, ownerEmail: undefined, branding: {}, workflow: undefined, goLive: {}, addOns: [], agencyDomain: undefined,
    });
    const parsed = parseSubmissionJson(JSON.stringify({ submission, ...settings, agencyDomain: 'solarflow.example' }));
    assert.deepEqual(parsed.goLive, settings.goLive);
    assert.deepEqual(parsed.addOns, settings.addOns);
    assert.equal(parsed.agencyDomain, 'solarflow.example');
    assert.deepEqual(parseSubmissionJson(JSON.stringify(fixture)).goLive, {}, 'a bare payload has no admin changes');

    // "Download answers (JSON)" -> make-client gives the admin page's zip, byte for byte.
    const dir = tmp();
    const exportPath = join(dir, `${SLUG}-setup.json`);
    writeFileSync(exportPath, JSON.stringify({ submission, ...settings, agencyDomain: 'solarflow.example' }));
    const cliZip = makeClient({ submissionPath: exportPath, outDir: dir, generatedAt: GENERATED_AT });
    const web = createClientZip({
        templateFiles: JSON.parse(JSON.stringify(collectTemplateFiles())),
        schemaSql: readFileSync(join(repoRoot, 'template/backend/schema.sql'), 'utf8'),
        submission, ...buildOptions({ ...settings, agencyDomain: 'solarflow.example' }), generatedAt: GENERATED_AT,
    });
    assert.equal(cliZip.summaryMarkdown, web.summaryMarkdown);
    assert.ok(Buffer.from(cliZip.bytes).equals(Buffer.from(web.bytes)), 'the CLI and the website build the same zip');
});
