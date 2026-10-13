import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PRIMARY_STAGES, STAGE_IDS, getNextStageId, missingStageRequirements, isViewOn, isRoleEnabled, isOn,
    documentMode, LOAN_TAGS, HOLD_STATUS_TAGS, stageLabel, applicableStages,
} from '../../template/src/config/index.js';

// The template ships with every available feature on (client.config.js).

test('next stage skips LOAN for cash customers and CASH for loan customers', () => {
    assert.equal(getNextStageId({ stage: STAGE_IDS.REGISTRATION, payment_type: 'Cash' }), STAGE_IDS.CASH);
    assert.equal(getNextStageId({ stage: STAGE_IDS.REGISTRATION, payment_type: 'Loan' }), STAGE_IDS.LOAN);
    assert.equal(getNextStageId({ stage: STAGE_IDS.LOAN, payment_type: 'Loan' }), STAGE_IDS.MATERIAL_ORDER);
    assert.equal(getNextStageId({ stage: STAGE_IDS.FINAL_REVIEW }), STAGE_IDS.COMPLETED);
    assert.equal(getNextStageId({ stage: STAGE_IDS.COMPLETED }), null);
    assert.equal(getNextStageId({ stage: STAGE_IDS.LOST_PROJECT }), null);
    assert.equal(getNextStageId({ stage: 'NOT A STAGE' }), null);
    assert.ok(!applicableStages({ payment_type: 'cash' }).some(stage => stage.id === 'LOAN'));
});

test('stage requirements use the configured rules', () => {
    assert.deepEqual(missingStageRequirements('LEADS', { customer_name: 'A', phone_number: '' }), ['Phone Number']);
    assert.deepEqual(missingStageRequirements('MATERIAL ORDER', { roof_shed: 'Roof', invoice_value: '1,20,000' }), []);
    assert.deepEqual(missingStageRequirements('GEO TAG PHOTO', { geo_tag_status: 'Pending' }), ['Geo Tag Status must be Proceed']);
    assert.deepEqual(missingStageRequirements('DISCOM SUBMISSION', { discom_submission: { submitted_by: 'Ravi', date: '2026-10-01' } }), []);
    assert.deepEqual(missingStageRequirements('COMPLETED', {}), []);
});

test('removed features and their roles and views are off', () => {
    assert.equal(isOn('stampLogin'), false);
    assert.equal(isRoleEnabled('stamp'), false);
    assert.equal(isRoleEnabled('admin'), true);
    assert.equal(isRoleEnabled('vendor'), true);
    assert.equal(isViewOn('toolbox'), false);
    assert.equal(isViewOn('dashboard'), true);
    assert.equal(isViewOn('calendar'), true);
    assert.equal(documentMode(), 'both');
});

test('stages carry icons and tags carry the styling the UI expects', () => {
    assert.equal(PRIMARY_STAGES[0].id, 'LEADS');
    assert.ok(PRIMARY_STAGES.every(stage => stage.icon && stage.iconName));
    assert.equal(stageLabel('MATERIAL DELIVERY'), 'Material Delivery');
    assert.equal(stageLabel('SOME OLD STAGE'), 'Some Old Stage');
    assert.ok(LOAN_TAGS.every(tag => tag.icon));
    assert.equal(LOAN_TAGS.at(-1).isFinal, true);
    assert.ok(HOLD_STATUS_TAGS.every(tag => tag.activeClass));
});
