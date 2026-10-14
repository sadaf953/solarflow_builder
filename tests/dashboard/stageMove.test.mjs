import test from 'node:test';
import assert from 'node:assert/strict';
import { overrideStages, stageMoveProblem } from '../../template/src/dashboard/stageMove.js';
import { PRIMARY_STAGES, STAGE_BY_ID } from '../../template/src/config/index.js';
import { configWith, importTemplate } from './fixtures/templateModules.mjs';

// The shipped template config has every stage, in the built-in order.

const LEAD = { stage: 'LEADS', customer_name: 'Asha Patel', phone_number: '9876543210' };
const ALL_STAGES = PRIMARY_STAGES.map(stage => stage.id);
const missingFrom = problem => problem.message.split('\n').filter(line => line.startsWith('• ')).map(line => line.slice(2));
const offered = (record, module = { overrideStages }) => module.overrideStages(record).map(stage => stage.id);

test('a forward move needs the requirements of the stage being left', () => {
    assert.deepEqual(stageMoveProblem({ ...LEAD, phone_number: '  ' }, 'REGISTRATION'), {
        title: 'Leads details incomplete',
        message: 'This customer is not ready to move to Registration. Please complete:\n\n• Phone Number\n\nOpen the customer to fill these in.',
    });
    assert.deepEqual(missingFrom(stageMoveProblem({ stage: 'LEADS' }, 'REGISTRATION')), ['Customer Name', 'Phone Number']);
    assert.equal(stageMoveProblem(LEAD, 'REGISTRATION'), null);
});

test('each built-in stage checks its own rules before a forward move', () => {
    const cases = [
        // [from, to, incomplete record, what is missing, complete record]
        ['REGISTRATION', 'MATERIAL ORDER', { payment_type: 'Cheque' }, ['Registration Date', 'Payment Type'], { registration_date: '2026-10-01', payment_type: ' cash ' }],
        ['LOAN', 'MATERIAL ORDER', { payment_type: 'Loan' }, ['Jansamarth Application No'], { payment_type: 'Loan', jansamarth_application_no: 'JS-1042' }],
        ['CASH', 'MATERIAL ORDER', {}, ['Payment Type'], { payment_type: 'Cash' }],
        ['MATERIAL ORDER', 'MATERIAL INTEGRATION', { roof_shed: 'Roof', invoice_value: '0' }, ['Invoice Value'], { roof_shed: 'Roof', invoice_value: '1,20,000' }],
        ['MATERIAL INTEGRATION', 'MATERIAL DELIVERY', { inverter_make: 'SunVolt' }, ['Inverter Serial Number'], { inverter_make: 'SunVolt', inverter_serial_no: 'SV-77' }],
        ['MATERIAL DELIVERY', 'INSTALLATION STATUS', { vendor: 'Kiran Installers' }, ['Delivery Date'], { vendor: 'Kiran Installers', material_delivery_date: '2026-10-10' }],
        ['INSTALLATION STATUS', 'GEO TAG PHOTO', { installation_status: 'In Progress' }, ['Installation Status must be Installed'], { installation_status: 'Installed' }],
        ['GEO TAG PHOTO', 'DISCOM SUBMISSION', { geo_tag_status: 'proceed' }, ['Geo Tag Status must be Proceed'], { geo_tag_status: 'Proceed' }],
        ['DISCOM SUBMISSION', 'METER INSTALLATION', { discom_submission: { submitted_by: 'Ravi' } }, ['Submitted By and Date'], { discom_submission: { submitted_by: 'Ravi', date: '2026-10-01' } }],
        ['METER INSTALLATION', 'DISCOM INSPECTION', { meter_installation: 'No' }, ['Meter Installation must be Yes', 'Installation Date'], { meter_installation: 'Yes', installation_date: '2026-10-01' }],
        ['DISCOM INSPECTION', 'SUBSIDY STATUS', {}, ['Discom Inspection must be Yes'], { discom_inspection: 'yes' }],
        ['SUBSIDY STATUS', 'FINAL REVIEW', { subsidy_tag: '' }, ['Subsidy Tag'], { subsidy_tag: 'Received' }],
        ['FINAL REVIEW', 'COMPLETED', {}, ['Customer Name'], { customer_name: 'Asha Patel' }],
    ];
    for (const [from, to, incomplete, missing, complete] of cases) {
        const problem = stageMoveProblem({ stage: from, ...incomplete }, to);
        assert.equal(problem?.title, `${STAGE_BY_ID[from].label} details incomplete`, from);
        assert.match(problem.message, new RegExp(`ready to move to ${STAGE_BY_ID[to].label}\\.`), from);
        assert.deepEqual(missingFrom(problem), missing, from);
        assert.equal(stageMoveProblem({ stage: from, ...complete }, to), null, from);
    }
});

test('a forward jump checks only the stage the customer is leaving', () => {
    assert.equal(stageMoveProblem(LEAD, 'SUBSIDY STATUS'), null);
    assert.equal(stageMoveProblem(LEAD, 'COMPLETED'), null);
    assert.match(stageMoveProblem({ stage: 'LEADS' }, 'COMPLETED').message, /ready to move to Completed\./);
});

test('moving back, or to the same stage, is always allowed', () => {
    for (const target of ['LEADS', 'REGISTRATION', 'LOAN', 'MATERIAL ORDER', 'MATERIAL DELIVERY']) {
        assert.equal(stageMoveProblem({ stage: 'MATERIAL DELIVERY', payment_type: 'Loan' }, target), null, target);
    }
    assert.equal(stageMoveProblem({ stage: 'COMPLETED' }, 'FINAL REVIEW'), null);
    assert.equal(stageMoveProblem({ stage: 'COMPLETED' }, 'LEADS'), null);
});

test('Lost Project is open from every stage, and a lost project can be resumed', () => {
    for (const stage of ALL_STAGES) {
        assert.equal(stageMoveProblem({ stage }, 'LOST PROJECT'), null, stage);
        assert.equal(stageMoveProblem({ stage, payment_type: 'Cash' }, 'LOST PROJECT'), null, stage);
    }
    assert.equal(stageMoveProblem({ stage: 'LOST PROJECT' }, 'LEADS'), null);
    // Resuming still respects the payment type.
    assert.equal(stageMoveProblem({ stage: 'LOST PROJECT', payment_type: 'Cash' }, 'LOAN')?.title, 'Stage does not apply');
});

test('the payment type decides whether Loan or Cash applies', () => {
    const registered = { ...LEAD, stage: 'REGISTRATION', registration_date: '2026-10-01' };
    assert.deepEqual(stageMoveProblem({ ...registered, payment_type: ' CASH ' }, 'LOAN'), {
        title: 'Stage does not apply',
        message: 'Loan is skipped for customers paying by cash. Change the payment type first if this is wrong.',
    });
    assert.deepEqual(stageMoveProblem({ ...registered, payment_type: 'Loan' }, 'CASH'), {
        title: 'Stage does not apply',
        message: 'Cash is skipped for customers paying by loan. Change the payment type first if this is wrong.',
    });
    assert.equal(stageMoveProblem({ ...registered, payment_type: 'Loan' }, 'LOAN'), null);
    assert.equal(stageMoveProblem({ ...registered, payment_type: 'Cash' }, 'CASH'), null);

    // Checked before direction and before requirements.
    assert.equal(stageMoveProblem({ stage: 'MATERIAL ORDER', payment_type: 'cash' }, 'LOAN')?.title, 'Stage does not apply');
    assert.equal(stageMoveProblem({ stage: 'LEADS', payment_type: 'Cash' }, 'LOAN')?.title, 'Stage does not apply');

    // Without a known payment type both stages apply.
    for (const payment_type of [undefined, null, '', '  ', 'Cheque']) {
        assert.equal(stageMoveProblem({ ...LEAD, payment_type }, 'LOAN'), null, String(payment_type));
        assert.equal(stageMoveProblem({ ...LEAD, payment_type }, 'CASH'), null, String(payment_type));
    }
});

test('a stage that is not in the pipeline is refused', () => {
    assert.deepEqual(stageMoveProblem(LEAD, 'NOT A STAGE'), {
        title: 'Stage not in use',
        message: 'Not A Stage is not one of your pipeline stages.',
    });
    assert.equal(stageMoveProblem(LEAD, 'HOLD PROCUREMENT')?.title, 'Stage not in use');
    assert.equal(stageMoveProblem({ stage: 'LOST PROJECT' }, 'MATERIAL INSTALLATION')?.title, 'Stage not in use');
});

test('a customer in a stage the pipeline no longer has can still be moved', () => {
    assert.equal(stageMoveProblem({ stage: 'HOLD PROCUREMENT' }, 'MATERIAL ORDER'), null);
    assert.equal(stageMoveProblem({ stage: undefined }, 'REGISTRATION'), null);
    assert.equal(stageMoveProblem(null, 'REGISTRATION'), null);
});

test('the override menu offers the stages that apply, plus the current one', () => {
    assert.deepEqual(offered({ stage: 'REGISTRATION', payment_type: 'Cash' }), ALL_STAGES.filter(id => id !== 'LOAN'));
    assert.deepEqual(offered({ stage: 'REGISTRATION', payment_type: ' loan ' }), ALL_STAGES.filter(id => id !== 'CASH'));
    assert.deepEqual(offered({ stage: 'LEADS' }), ALL_STAGES);
    assert.deepEqual(offered(null), ALL_STAGES);
    // A cash customer still sitting in Loan sees Loan as the current stage.
    assert.deepEqual(offered({ stage: 'LOAN', payment_type: 'Cash' }), ALL_STAGES);
    assert.ok(overrideStages({ stage: 'LEADS' }).every((stage, index) => stage === PRIMARY_STAGES[index]));
});

test('nothing the override menu offers is refused as unused or not applicable', () => {
    const records = [
        { stage: 'LEADS' }, { ...LEAD, payment_type: 'Cash' }, { stage: 'REGISTRATION', payment_type: 'Loan' },
        { stage: 'MATERIAL DELIVERY', payment_type: 'cash' }, { stage: 'LOST PROJECT', payment_type: 'Loan' }, { stage: 'COMPLETED' },
    ];
    for (const record of records) {
        for (const stage of overrideStages(record)) {
            if (stage.id === record.stage) continue;
            const problem = stageMoveProblem(record, stage.id);
            assert.ok(problem === null || problem.title.endsWith('details incomplete'), `${record.stage} -> ${stage.id}: ${problem?.title}`);
        }
    }
});

test('a client without loan tracking has no Loan stage to move to', async () => {
    const noLoan = await importTemplate('dashboard/stageMove.js', { config: configWith({ features: { loanTracking: false } }) });
    const registered = { ...LEAD, stage: 'REGISTRATION', registration_date: '2026-10-01', payment_type: 'Loan' };
    assert.deepEqual(noLoan.stageMoveProblem(registered, 'LOAN'), {
        title: 'Stage not in use',
        message: 'Loan is not one of your pipeline stages.',
    });
    assert.equal(noLoan.stageMoveProblem(registered, 'MATERIAL ORDER'), null);
    assert.ok(!offered(registered, noLoan).includes('LOAN'));
    assert.ok(!offered({ stage: 'LOAN', payment_type: 'Loan' }, noLoan).includes('LOAN'));
    // Records left in Loan can move on without its requirements.
    assert.equal(noLoan.stageMoveProblem({ stage: 'LOAN', payment_type: 'Loan' }, 'MATERIAL ORDER'), null);
});

test('required extra fields, custom stages and renamed stages follow the client config', async () => {
    const base = configWith();
    const [leads, ...rest] = base.pipeline.stages;
    assert.equal(leads.id, 'LEADS');
    const config = configWith({
        pipeline: {
            ...base.pipeline,
            stages: [
                { ...leads, label: 'Enquiries' },
                { id: 'SITE SURVEY', label: 'Site Survey', group: 'enquiry', custom: true, icon: 'Ruler' },
                ...rest,
            ],
        },
        customFields: [
            { key: 'referral_code', label: 'Referral code', type: 'text', stage: 'LEADS', required: true },
            { key: 'survey_done', label: 'Survey done', type: 'yesno', stage: 'SITE SURVEY', required: true },
            { key: 'roof_photo', label: 'Roof photo', type: 'file', stage: 'SITE SURVEY', required: true },
            { key: 'survey_notes', label: 'Survey notes', type: 'textarea', stage: 'SITE SURVEY' },
        ],
    });
    const survey = await importTemplate('dashboard/stageMove.js', { config });

    assert.deepEqual(survey.stageMoveProblem(LEAD, 'SITE SURVEY'), {
        title: 'Enquiries details incomplete',
        message: 'This customer is not ready to move to Site Survey. Please complete:\n\n• Referral code\n\nOpen the customer to fill these in.',
    });
    assert.deepEqual(missingFrom(survey.stageMoveProblem({ ...LEAD, custom_fields: { referral_code: '  ' } }, 'REGISTRATION')), ['Referral code']);
    assert.equal(survey.stageMoveProblem({ ...LEAD, custom_fields: { referral_code: 'RF-12' } }, 'SITE SURVEY'), null);

    // Yes/No fields must be answered (No counts); a file can never be required; optional fields are not asked for.
    const atSurvey = { ...LEAD, stage: 'SITE SURVEY', custom_fields: { referral_code: 'RF-12' } };
    assert.deepEqual(survey.stageMoveProblem(atSurvey, 'REGISTRATION'), {
        title: 'Site Survey details incomplete',
        message: 'This customer is not ready to move to Registration. Please complete:\n\n• Survey done\n\nOpen the customer to fill these in.',
    });
    assert.equal(survey.stageMoveProblem({ ...atSurvey, custom_fields: { survey_done: 'No' } }, 'REGISTRATION'), null);
    assert.equal(survey.stageMoveProblem({ ...atSurvey, custom_fields: { survey_done: 'Yes' } }, 'REGISTRATION'), null);

    assert.equal(survey.stageMoveProblem({ stage: 'REGISTRATION' }, 'SITE SURVEY'), null);
    assert.equal(survey.stageMoveProblem({ stage: 'SITE SURVEY' }, 'LOST PROJECT'), null);
    assert.deepEqual(offered({ stage: 'LEADS', payment_type: 'Cash' }, survey).slice(0, 3), ['LEADS', 'SITE SURVEY', 'REGISTRATION']);
});

test('a parked (Lost) project must resume into the pipeline before it can be completed', () => {
    assert.equal(stageMoveProblem({ stage: 'LOST PROJECT', customer_name: 'A' }, 'COMPLETED')?.title, 'Resume the project first');
    assert.equal(stageMoveProblem({ stage: 'LOST PROJECT', customer_name: 'A' }, 'REGISTRATION'), null);
});
