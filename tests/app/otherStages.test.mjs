import test from 'node:test';
import assert from 'node:assert/strict';
import { configWith, importTemplate } from '../dashboard/fixtures/templateModules.mjs';

const shipped = configWith();
const views = await importTemplate('app/views.js', {
    config: configWith({ pipeline: { ...shipped.pipeline, stages: shipped.pipeline.stages.filter(stage => stage.id !== 'LOAN') } }),
});

test('customers left in a stage that is no longer in the pipeline get their own list', () => {
    assert.deepEqual(views.otherStageIds({ LEADS: 4, LOAN: 20, 'OLD SURVEY': 2, 'EMPTY ONE': 0, COMPLETED: 9 }), ['LOAN', 'OLD SURVEY']);
    assert.deepEqual(views.otherStageIds({ LEADS: 4 }), []);
    assert.deepEqual(views.otherStageIds(undefined), []);
    assert.deepEqual(views.otherStageIds(null), []);
});
