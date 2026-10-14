import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_QUESTIONS, UNSURE_REASON, answersToFeatures, visibleQuestions, describeAnswer, questionById } from '../../builder/src/catalog/questions.js';
import { FEATURE_REGISTRY } from '../../template/src/config/catalog/features.js';

test('every question points at selectable features only', () => {
    const ids = new Set(ALL_QUESTIONS.map(question => question.id));
    assert.equal(ids.size, ALL_QUESTIONS.length, 'question ids are unique');
    for (const question of ALL_QUESTIONS) {
        const featureIds = question.kind === 'choice' ? question.options.flatMap(option => option.features) : question.features;
        for (const id of featureIds) assert.equal(FEATURE_REGISTRY[id]?.status, 'available', `${question.id} -> ${id}`);
        assert.ok(question.question && question.example && question.because, question.id);
    }
});

test('every selectable feature can be reached from some answer', () => {
    const reachable = new Set(ALL_QUESTIONS.flatMap(question => (question.kind === 'choice' ? question.options.flatMap(option => option.features) : question.features)));
    for (const [id, feature] of Object.entries(FEATURE_REGISTRY)) {
        if (feature.status === 'available') assert.ok(reachable.has(id), `${id} has no question`);
    }
});

test('removed features are never asked about', () => {
    const text = JSON.stringify(ALL_QUESTIONS.map(({ showIf, ...question }) => question)).toLowerCase();
    for (const word of ['stamp', 'warranty', 'mis upload', 'technician', 'toolbox']) assert.ok(!text.includes(word), word);
});

test('follow-up questions appear only when they apply', () => {
    assert.ok(!visibleQuestions({}).some(question => question.id === 'dealers'));
    assert.ok(visibleQuestions({ partnerOffices: 'yes' }).some(question => question.id === 'dealers'));
    assert.ok(visibleQuestions({ partnerOffices: 'yes' }).some(question => question.id === 'partnerManagers'));
    assert.ok(!visibleQuestions({ installerLogins: 'no' }).some(question => question.id === 'installerPayouts'));
});

test('answers become features with reasons; not sure goes to discuss', () => {
    const { features, reasons, discuss, unanswered } = answersToFeatures({
        partners: 'yes', partnerOffices: 'no', dealers: 'unsure', quotations: 'yes', payments: 'cash', subsidy: 'yes',
        bom: 'no', trucks: 'yes', godown: 'no', documents: 'tick',
    });
    assert.equal(features.channelPartners, true);
    assert.equal(features.cpos, false);
    assert.equal(features.dealers, false, 'not sure never switches on');
    assert.ok(discuss.includes('dealers'));
    assert.equal(features.loanTracking, false);
    assert.equal(features.cashPayments, true);
    assert.equal(features.deliveryBatches, true);
    assert.equal(features.bomMaker, true, 'truck deliveries pull in the BOM maker');
    assert.match(reasons.bomMaker, /Truck deliveries & challans needs it/);
    assert.equal(features.documentUploads, false);
    assert.equal(features.checklists, true);
    assert.match(reasons.channelPartners, /^Because agents or partners bring you customers\.$/);
    assert.ok(unanswered.includes('calendar'));
    assert.ok(!unanswered.includes('partnerManagers'), 'hidden follow-ups are not "unanswered"');
});

test('manual overrides from the review step win', () => {
    const { features, reasons } = answersToFeatures({ calendar: 'yes' }, { calendar: false, attendance: true });
    assert.equal(features.calendar, false);
    assert.equal(features.attendance, true);
    assert.equal(reasons.attendance, 'You switched this on.');
});

test('answers read back in plain words', () => {
    assert.equal(describeAnswer(questionById('payments'), 'both'), 'Loan and cash');
    assert.equal(describeAnswer(questionById('calendar'), 'unsure'), 'Not sure');
    assert.equal(describeAnswer(questionById('calendar'), undefined), 'Not answered');
});

test('"Not sure" on payments and documents keeps the usual setup, says why, and stays to discuss', () => {
    const { features, reasons, discuss } = answersToFeatures({ payments: 'unsure', documents: 'unsure', calendar: 'unsure' });
    assert.equal(features.loanTracking, true);
    assert.equal(features.cashPayments, true);
    assert.equal(features.checklists, true);
    assert.equal(features.documentUploads, false);
    assert.equal(features.calendar, false, 'other questions still switch nothing on');
    for (const id of ['loanTracking', 'cashPayments', 'checklists']) assert.equal(reasons[id], UNSURE_REASON);
    assert.match(UNSURE_REASON, /Not sure/);
    assert.deepEqual(discuss.sort(), ['calendar', 'documents', 'payments']);
});
