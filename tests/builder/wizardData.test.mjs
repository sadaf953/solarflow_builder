import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adminWorkflowFrom, emailInviteText, fieldStages, normalizeSettings, whatsappInviteText,
} from '../../builder/src/components/wizardData.js';
import { defaultStageList, emptySubmission } from '../../builder/src/catalog/submission.js';

test('extra fields can never be put on Completed or Lost Project', () => {
    const stages = [...defaultStageList({ loanTracking: true }), { id: 'SITE SURVEY', label: 'Site survey', custom: true }];
    const ids = fieldStages(stages).map(stage => stage.id);
    assert.ok(ids.includes('LEADS') && ids.includes('SITE SURVEY') && ids.includes('FINAL REVIEW'));
    assert.ok(!ids.includes('COMPLETED'));
    assert.ok(!ids.includes('LOST PROJECT'));
});

test('the WhatsApp invite asks the client to keep their sheet handy', () => {
    const text = whatsappInviteText('Asha', 'https://x.example/#/s/1/t');
    assert.match(text, /^Hi Asha, /);
    assert.match(text, /Keep your Excel or Google Sheet handy for the last part\./);
    assert.match(emailInviteText('', 'L'), /^Hi there,/);
});

test('admin settings always have every key; anything else is dropped', () => {
    assert.deepEqual(normalizeSettings(null), { adminOverrides: {}, slug: '', ownerEmail: '', branding: {}, workflow: null });
    const settings = normalizeSettings({ adminOverrides: { calendar: true }, slug: 'x', ownerEmail: 4, branding: [], workflow: { stagesMode: 'custom' }, extra: 1 });
    assert.deepEqual(settings, { adminOverrides: { calendar: true }, slug: 'x', ownerEmail: '', branding: {}, workflow: { stagesMode: 'custom' } });
});

test('the admin starts from the client workflow, or the standard one for a sheet', () => {
    const submission = emptySubmission();
    submission.workflow = { ...submission.workflow, stagesMode: 'custom', stages: [{ id: 'LEADS' }], customFields: [{ key: 'a_1' }] };
    const copy = adminWorkflowFrom(submission);
    assert.deepEqual(copy.stages, [{ id: 'LEADS' }]);
    copy.stages.push({ id: 'X' });
    assert.equal(submission.workflow.stages.length, 1, 'a copy, not the client data');

    submission.workflow = { ...submission.workflow, source: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/a' };
    assert.deepEqual(adminWorkflowFrom(submission), { ...emptySubmission().workflow, source: 'form' });
});
