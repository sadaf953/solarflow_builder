// Rules for the admin stage override on a customer card. They match the
// customer modal's "Move to next stage": a forward move needs the current
// stage's requirements; backward moves and parking (Lost Project) stay open.

import { PRIMARY_STAGES, STAGE_BY_ID, isStageApplicable, missingStageRequirements, stageLabel } from '../config/index.js';

/** Why `record` cannot move to `newStage`, as { title, message }, or null when it can. */
export function stageMoveProblem(record, newStage) {
    const target = STAGE_BY_ID[newStage];
    if (!target) {
        return { title: 'Stage not in use', message: `${stageLabel(newStage)} is not one of your pipeline stages.` };
    }
    if (target.parking) return null;
    if (!isStageApplicable(target, record)) {
        return {
            title: 'Stage does not apply',
            message: `${target.label} is skipped for customers paying by ${String(record?.payment_type || '').trim().toLowerCase()}. Change the payment type first if this is wrong.`,
        };
    }
    const from = PRIMARY_STAGES.findIndex(stage => stage.id === record?.stage);
    const to = PRIMARY_STAGES.findIndex(stage => stage.id === newStage);
    if (from === -1 || to <= from) return null;
    const missing = missingStageRequirements(record.stage, record);
    if (!missing.length) return null;
    return {
        title: `${stageLabel(record.stage)} details incomplete`,
        message: `This customer is not ready to move to ${target.label}. Please complete:\n\n• ${missing.join('\n• ')}\n\nOpen the customer to fill these in.`,
    };
}

/** Stages offered in the card's override menu: those that apply to this customer, plus the one it is in. */
export const overrideStages = record => PRIMARY_STAGES.filter(stage => stage.id === record?.stage || isStageApplicable(stage, record));
