import test from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultClientConfig, resolveClientConfig, resolveFeaturesAndPipeline, validateClientConfig, resolveDropdowns,
    keyFromLabel, slugify, isAllowedSheetUrl, brandingErrors, isHttpsUrl,
} from '../../template/src/config/resolve.js';
import { FEATURE_REGISTRY } from '../../template/src/config/catalog/features.js';
import { BUILTIN_STAGE_IDS } from '../../template/src/config/catalog/stages.js';
import { clientConfigSource } from '../../template/src/config/serialize.js';

const config = (patch = {}) => {
    const base = defaultClientConfig();
    return { ...base, ...patch, features: { ...base.features, ...(patch.features || {}) }, pipeline: patch.pipeline || base.pipeline };
};
const stageIds = resolvedOrConfig => (resolvedOrConfig.stages || []).map(stage => stage.id);

test('registry is internally consistent', () => {
    for (const [id, feature] of Object.entries(FEATURE_REGISTRY)) {
        for (const dep of [...(feature.dependsOn || []), ...(feature.dependsOnAny || [])]) assert.ok(FEATURE_REGISTRY[dep], `${id} depends on unknown ${dep}`);
        for (const stage of feature.requiresStages || []) assert.ok(BUILTIN_STAGE_IDS.includes(stage), `${id} needs unknown stage ${stage}`);
        assert.ok(['core', 'available', 'removed', 'not_built'].includes(feature.status), id);
    }
});

test('the default config is valid and keeps every built-in stage in order', () => {
    const { errors } = validateClientConfig(defaultClientConfig());
    assert.deepEqual(errors, []);
    assert.deepEqual(stageIds(resolveClientConfig(defaultClientConfig())), BUILTIN_STAGE_IDS);
});

test('removed and never-built features stay off even when a config asks for them', () => {
    const { features, reasons } = resolveFeaturesAndPipeline(config({ features: { stampLogin: true, warrantyTracking: true, misUpload: true, toolbox: true, technicianLogin: true } }));
    for (const id of ['stampLogin', 'warrantyTracking', 'misUpload', 'toolbox', 'technicianLogin', 'cpCommission']) {
        assert.equal(features[id], false, id);
        assert.ok(reasons[id], id);
    }
    const { warnings } = validateClientConfig(config({ features: { stampLogin: true } }));
    assert.ok(warnings.some(message => /Stamp staff login/.test(message)));
});

test('dependencies switch features off with a reason', () => {
    const { features, reasons } = resolveFeaturesAndPipeline(config({ features: { vendorLogin: false, vendorCommission: true, channelPartners: false, cpos: false, dealers: true, branches: true } }));
    assert.equal(features.vendorCommission, false);
    assert.match(reasons.vendorCommission, /Installer \(vendor\) logins/);
    assert.equal(features.dealers, false);
    assert.equal(features.branches, false);
    assert.equal(features.dealerFiltering, false, 'dealer filtering follows dealers');
    const withCpo = resolveFeaturesAndPipeline(config({ features: { cpos: true, dealers: true, branches: true } })).features;
    assert.equal(withCpo.dealers, true);
    assert.equal(withCpo.branches, true);
    assert.equal(withCpo.dealerFiltering, true);
});

test('payment choices add or remove the LOAN and CASH stages', () => {
    const cashOnly = resolveClientConfig(config({ features: { loanTracking: false } }));
    assert.ok(!stageIds(cashOnly).includes('LOAN'));
    assert.ok(stageIds(cashOnly).includes('CASH'));
    const noLoanStage = defaultClientConfig();
    noLoanStage.pipeline.stages = noLoanStage.pipeline.stages.filter(stage => stage.id !== 'LOAN');
    const resolved = resolveClientConfig(noLoanStage);
    assert.equal(resolved.features.loanTracking, false);
    assert.match(resolved.featureReasons.loanTracking, /Loan stage/);
});

test('installer logins need their three stages', () => {
    const base = defaultClientConfig();
    base.features.vendorLogin = true;
    base.features.vendorCommission = true;
    base.pipeline.stages = base.pipeline.stages.filter(stage => stage.id !== 'GEO TAG PHOTO');
    const { features } = resolveFeaturesAndPipeline(base);
    assert.equal(features.vendorLogin, false);
    assert.equal(features.vendorCommission, false);
});

test('LEADS stays first and COMPLETED, LOST PROJECT stay last whatever the order', () => {
    const base = defaultClientConfig();
    base.pipeline.stages = [{ id: 'COMPLETED' }, { id: 'REGISTRATION', label: 'Sign-up' }, { id: 'LOST PROJECT' }, { id: 'LEADS', label: 'Enquiries' }, { id: 'SITE SURVEY', custom: true, label: 'Site survey', group: 'enquiry' }];
    const resolved = resolveClientConfig(base);
    assert.deepEqual(stageIds(resolved), ['LEADS', 'REGISTRATION', 'SITE SURVEY', 'COMPLETED', 'LOST PROJECT']);
    assert.equal(resolved.stages[0].label, 'Enquiries');
    assert.equal(resolved.stages[1].label, 'Sign-up');
    assert.equal(resolved.stages[2].custom, true);
    assert.deepEqual(resolved.groups.find(group => group.id === 'enquiry').stages, ['LEADS', 'REGISTRATION', 'SITE SURVEY']);
    assert.deepEqual(resolved.groups.find(group => group.id === 'closed').stages, ['COMPLETED', 'LOST PROJECT']);
});

test('required extra fields become stage requirements', () => {
    const base = defaultClientConfig();
    base.pipeline.stages.splice(2, 0, { id: 'SITE SURVEY', custom: true, label: 'Site survey', group: 'enquiry' });
    base.customFields = [
        { key: 'survey_date', label: 'Survey date', type: 'date', stage: 'SITE SURVEY', required: true },
        { key: 'roof_ok', label: 'Roof OK', type: 'yesno', stage: 'SITE SURVEY', required: true },
        { key: 'lead_source', label: 'Lead source', type: 'select', stage: 'LEADS', options: ['Referral', 'Walk-in', 'Referral'], showInAddLead: true },
        { key: 'survey_date', label: 'Duplicate', type: 'text', stage: 'LEADS' },
        { key: 'orphan', label: 'Orphan', type: 'text', stage: 'NOT A STAGE' },
    ];
    const resolved = resolveClientConfig(base);
    const survey = resolved.stages.find(stage => stage.id === 'SITE SURVEY');
    assert.deepEqual(survey.requirements, [['custom_fields.survey_date', 'Survey date', 'present'], ['custom_fields.roof_ok', 'Roof OK', 'present']]);
    assert.deepEqual(resolved.customFields.map(field => field.key), ['survey_date', 'roof_ok', 'lead_source']);
    assert.deepEqual(resolved.customFields[2].options, ['Referral', 'Walk-in']);
    const { errors, warnings } = validateClientConfig(base);
    assert.ok(errors.some(message => /used twice/.test(message)));
    assert.ok(warnings.some(message => /Orphan/.test(message)));
});

test('custom stages cannot reuse SolarFlow ids or bad names', () => {
    const base = defaultClientConfig();
    base.pipeline.stages.push({ id: 'DOCUMENTS', custom: true, label: 'Docs' }, { id: 'bad id!', custom: true, label: 'Bad' });
    const { errors } = validateClientConfig(base);
    assert.ok(errors.some(message => /already used by SolarFlow/.test(message)));
    assert.ok(errors.some(message => /capital letters/.test(message)));
});

test('status tags keep locked ids and put the final tag last', () => {
    const { tags, metadata } = resolveDropdowns({ dropdowns: {
        loan_tags: [{ id: 'Total Loan Payment Received', label: 'Paid in full' }, { id: 'Docs pending', label: 'Docs pending' }],
        installation_tags: [{ id: 'Installed', label: 'Done' }, { id: 'New thing', label: 'Not allowed' }],
        module_wp: ['540', 'abc', '540', '600'],
    } });
    assert.deepEqual(tags.loan_tags.map(tag => tag.id), ['Docs pending', '1st Payment', '2nd Payment', 'Total Loan Payment Received']);
    assert.equal(tags.loan_tags.at(-1).label, 'Paid in full');
    assert.equal(tags.loan_tags.at(-1).isFinal, true);
    assert.ok(!tags.installation_tags.some(tag => tag.id === 'New thing'));
    assert.deepEqual(tags.installation_tags.map(tag => tag.id).sort(), ['Giveup', 'In process', 'Installed', 'Pending']);
    assert.deepEqual(metadata.module_wp, ['540', '600']);
    assert.deepEqual(metadata.module_brand, ['ADANI', 'WAAREE', 'TATA', 'GOLDI', 'APS'], 'missing lists fall back to defaults');
});

test('helpers for names, keys and sheet links', () => {
    assert.equal(slugify('Ray2Volt Solar Pvt. Ltd.'), 'ray2volt-solar-pvt-ltd');
    assert.equal(keyFromLabel('Site survey date'), 'site_survey_date');
    assert.equal(keyFromLabel('2nd visit'), 'f_2nd_visit');
    assert.equal(keyFromLabel('Site survey!', { stage: true }), 'SITE SURVEY');
    assert.ok(isAllowedSheetUrl('https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing'));
    assert.ok(isAllowedSheetUrl('https://contoso.sharepoint.com/:x:/g/abc'));
    assert.ok(!isAllowedSheetUrl('http://docs.google.com/spreadsheets/d/abc'));
    assert.ok(!isAllowedSheetUrl('https://evil.example.com/spreadsheets'));
});

test('company details for documents are optional and default to empty', () => {
    const { branding } = defaultClientConfig();
    for (const key of ['logoUrl', 'website', 'epcCode', 'bankAccountName', 'bankAccountNumber', 'bankName', 'bankBranch', 'bankIfsc']) {
        assert.equal(branding[key], '', key);
    }
    assert.deepEqual(brandingErrors(branding), {});
    assert.equal(resolveClientConfig(config({ branding: { companyName: 'Acme' } })).branding.bankIfsc, '', 'older configs get the new fields');
});

test('company details are validated: IFSC, https logo, lengths and text only', () => {
    const withBranding = patch => config({ branding: { ...defaultClientConfig().branding, ...patch } });
    const good = withBranding({
        logoUrl: 'https://cdn.example.com/logo.png', website: 'www.example.com', epcCode: 'EPC-123',
        bankAccountName: 'Acme Solar', bankAccountNumber: '001234567890', bankName: 'State Bank of India', bankBranch: 'Surat', bankIfsc: 'SBIN0001234',
    });
    assert.deepEqual(validateClientConfig(good), { errors: [], warnings: [] });

    for (const bankIfsc of ['SBIN1001234', 'sbin0001234', 'SBIN000123', 'SB1N0001234']) {
        assert.ok(brandingErrors({ bankIfsc }).bankIfsc, bankIfsc);
        assert.ok(validateClientConfig(withBranding({ bankIfsc })).errors.some(message => /IFSC code must be 11 characters/.test(message)), bankIfsc);
    }
    assert.deepEqual(brandingErrors({ bankIfsc: 'HDFC0ABC123' }), {});

    for (const logoUrl of ['http://example.com/logo.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'logo.png']) {
        assert.match(brandingErrors({ logoUrl }).logoUrl || '', /https:\/\//, logoUrl);
    }
    assert.ok(isHttpsUrl('https://example.com/a.png') && !isHttpsUrl('ftp://example.com') && !isHttpsUrl(''));

    const long = validateClientConfig(withBranding({ epcCode: 'x'.repeat(61), address: 'y'.repeat(301), gstin: 'Z'.repeat(16) })).errors;
    for (const pattern of [/EPC code must be at most 60/, /Address must be at most 300/, /GSTIN must be at most 15/]) assert.ok(long.some(message => pattern.test(message)), String(pattern));
    assert.match(brandingErrors({ bankAccountNumber: 1234 }).bankAccountNumber, /Account number must be text/);
    assert.ok(validateClientConfig(withBranding({ companyName: 42 })).errors.some(message => /companyName/.test(message)));

    const noAccount = validateClientConfig(withBranding({ bankName: 'State Bank of India' }));
    assert.deepEqual(noAccount.errors, []);
    assert.ok(noAccount.warnings.some(message => /until the account number is filled in/.test(message)));
});

test('serialized config round-trips through a module import', async () => {
    const base = defaultClientConfig();
    base.client = { name: 'Test "Quote" Solar', slug: 'test-solar', ownerEmail: 'owner@example.com' };
    const source = clientConfigSource(base, { generatedAt: '2026-10-13' });
    const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    assert.deepEqual(module.default, base);
});
