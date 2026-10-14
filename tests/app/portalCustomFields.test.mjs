import test from 'node:test';
import assert from 'node:assert/strict';
import { configWith, importTemplate } from '../dashboard/fixtures/templateModules.mjs';

const config = configWith({ customFields: [
    { key: 'roof_ok', label: 'Roof OK', type: 'yesno', stage: 'INSTALLATION STATUS' },
    { key: 'panels_note', label: 'Panels note', type: 'text', stage: 'INSTALLATION STATUS' },
] });

test('portals send only the extra fields the user edited, never a stale copy of the office’s change', async () => {
    const { customFieldChanges } = await importTemplate('components/portal/customFields.js', { config });
    const openedWith = { roof_ok: 'Yes', panels_note: '' };
    const officeSavedSince = { roof_ok: 'No', panels_note: 'Use 2 extra clamps' };
    const draft = { ...openedWith, roof_ok: 'Yes' };
    const touched = new Set();
    assert.deepEqual(customFieldChanges('INSTALLATION STATUS', draft, officeSavedSince, touched), {}, 'nothing edited: nothing sent');
    touched.add('roof_ok');
    assert.deepEqual(customFieldChanges('INSTALLATION STATUS', draft, officeSavedSince, touched), { roof_ok: 'Yes' });
    assert.deepEqual(customFieldChanges('INSTALLATION STATUS', draft, officeSavedSince), { roof_ok: 'Yes', panels_note: null }, 'without touched keys every difference counts');
});
