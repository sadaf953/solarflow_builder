import { PauseCircle, AlertTriangle, CheckCircle2, CornerUpLeft, Save } from 'lucide-react';
import { PRIMARY_STAGES, STAGE_IDS, HOLD_STATUS_TAGS } from '../../constants';
import { stageLabel } from '../../config/index.js';
import { todayIST } from '../../lib/format.js';
import { Field, Input, SectionCard, Select, Spinner, TagPicker, Textarea } from '../../ui/index.js';
import useStageSave from './useStageSave';

// Stages a lost project can be parked from (and resumed to), including custom ones.
const ORIGIN_OPTIONS = PRIMARY_STAGES
    .filter(stage => stage.id !== STAGE_IDS.LOST_PROJECT && stage.id !== STAGE_IDS.COMPLETED)
    .map(stage => ({ value: stage.id, label: stage.label }));

// hold_procurement is stored as an object, as JSON text, or (old records) as a bare status.
function readHoldState(raw, defaultOrigin, today) {
    let value = raw;
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw);
        } catch {
            value = { hold_status: raw };
        }
    }
    if (!value || typeof value !== 'object') value = {};
    return {
        previous_stage: value.previous_stage || defaultOrigin,
        hold_status: value.hold_status || '',
        comment: value.comment || '',
        hold_date: value.hold_date || today,
    };
}

export default function HoldProcurementTab(props) {
    const { customer, editData, setEditData, isEditable, saving } = props;
    const save = useStageSave(props);
    const today = todayIST();
    const defaultOrigin = customer.stage !== STAGE_IDS.LOST_PROJECT ? customer.stage : STAGE_IDS.LEADS;

    const holdData = readHoldState(editData.hold_procurement ?? customer.hold_procurement, defaultOrigin, today);
    const savedHoldData = readHoldState(customer.hold_procurement, defaultOrigin, today);

    const isHoldDirty = (
        holdData.previous_stage !== savedHoldData.previous_stage ||
        holdData.hold_status !== savedHoldData.hold_status ||
        holdData.comment.trim() !== savedHoldData.comment.trim() ||
        holdData.hold_date !== savedHoldData.hold_date
    );

    // A stage the client has since switched off cannot be resumed to.
    const resumeStage = ORIGIN_OPTIONS.some(option => option.value === holdData.previous_stage)
        ? holdData.previous_stage
        : STAGE_IDS.LEADS;
    const originStageLabel = stageLabel(holdData.previous_stage) || 'Unknown';

    const updateHoldField = (field, value) => {
        setEditData(prev => ({ ...prev, hold_procurement: { ...holdData, [field]: value } }));
    };

    const handleSaveHoldDetails = async () => {
        const payload = { ...holdData, updated_at: new Date().toISOString() };
        await save(
            { hold_procurement: payload },
            `Saved Lost Project details (Status: ${payload.hold_status || 'None'}, Origin: ${payload.previous_stage}, Comment: ${payload.comment || 'None'})`,
        );
    };

    const handleResumeToPreviousStage = async () => {
        const payload = { ...holdData, resumed_at: new Date().toISOString(), resumed_to: resumeStage };
        await save(
            { stage: resumeStage, hold_procurement: payload },
            `Resumed from Lost Project → ${resumeStage}`,
            { action: 'stage_change' },
        );
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3">
                <div className="p-2 bg-amber-100/80 text-amber-700 rounded-xl flex-shrink-0">
                    <PauseCircle size={18} aria-hidden="true" />
                </div>
                <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                            Lost Project / On Hold
                        </h4>
                        <span className="text-[10px] bg-amber-200/60 text-amber-900 font-bold px-2.5 py-0.5 rounded-full">
                            Date: {holdData.hold_date}
                        </span>
                    </div>
                    <p className="text-[11px] text-amber-800 font-medium mt-1">
                        Parked from stage: <strong className="text-amber-950">{originStageLabel}</strong>
                    </p>
                </div>
            </div>

            <SectionCard title="Lost Project Classification & Origin" icon={AlertTriangle} tone="yellow">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Origin / Dumped From Stage" htmlFor={isEditable ? 'hold-previous-stage' : undefined}>
                        {isEditable ? (
                            <Select
                                id="hold-previous-stage"
                                options={ORIGIN_OPTIONS}
                                value={holdData.previous_stage}
                                onChange={e => updateHoldField('previous_stage', e.target.value)}
                            />
                        ) : (
                            <p className="text-sm font-bold text-stone-800">{originStageLabel}</p>
                        )}
                    </Field>

                    <Field label="Hold Placed Date" htmlFor={isEditable ? 'hold-date' : undefined}>
                        {isEditable ? (
                            <Input
                                id="hold-date"
                                type="date"
                                value={holdData.hold_date}
                                onChange={e => updateHoldField('hold_date', e.target.value)}
                            />
                        ) : (
                            <p className="text-sm font-bold text-stone-800">{holdData.hold_date || '–'}</p>
                        )}
                    </Field>
                </div>

                <Field label="Hold Status Tag">
                    <TagPicker
                        label="Hold Status Tag"
                        options={HOLD_STATUS_TAGS}
                        value={holdData.hold_status}
                        onChange={id => updateHoldField('hold_status', id || '')}
                        allowDeselect
                        disabled={!isEditable}
                    />
                </Field>

                <Field label="Hold Reason / Comments" htmlFor={isEditable ? 'hold-comment' : undefined}>
                    {isEditable ? (
                        <Textarea
                            id="hold-comment"
                            placeholder="Add details about what went wrong, client concerns, financing delay, or resolution notes..."
                            value={holdData.comment}
                            onChange={e => updateHoldField('comment', e.target.value)}
                        />
                    ) : (
                        <div className="bg-stone-50/70 p-3 rounded-xl border border-stone-200/60 text-sm text-stone-700 min-h-[60px] whitespace-pre-wrap">
                            {holdData.comment || <span className="text-stone-400 italic">No hold comments recorded</span>}
                        </div>
                    )}
                </Field>

                {isEditable && (
                    <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row gap-2.5">
                        <button
                            type="button"
                            onClick={handleSaveHoldDetails}
                            disabled={saving}
                            className={`flex-1 min-h-11 py-3 px-4 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                                isHoldDirty
                                    ? 'bg-stone-900 hover:bg-stone-800 text-white'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/15'
                            }`}
                        >
                            {saving ? (
                                <><Spinner size={14} /> Saving...</>
                            ) : isHoldDirty ? (
                                <><Save size={14} aria-hidden="true" /> Save</>
                            ) : (
                                <><CheckCircle2 size={14} aria-hidden="true" /> Saved</>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleResumeToPreviousStage}
                            disabled={saving}
                            className="flex-1 min-h-11 bg-amber-500 hover:bg-amber-600 text-white py-3 px-4 rounded-xl text-xs font-bold transition shadow-md shadow-amber-500/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            <CornerUpLeft size={14} aria-hidden="true" /> {saving ? 'Saving & Moving...' : `Save & Go Back to ${stageLabel(resumeStage)}`}
                        </button>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
