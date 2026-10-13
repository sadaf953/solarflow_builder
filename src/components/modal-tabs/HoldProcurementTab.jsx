import React from 'react';
import { PauseCircle, AlertTriangle, CheckCircle2, MessageSquare, CornerUpLeft, Save, Sparkles } from 'lucide-react';
import { PRIMARY_STAGES, HOLD_STATUS_TAGS } from '../../constants';

export default function HoldProcurementTab({
    customer,
    editData,
    setEditData,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    saving,
    setSaving
}) {
    const today = new Date().toISOString().split('T')[0];

    // Normalize hold_procurement object safely from editData or customer
    const getHoldState = () => {
        const raw = editData.hold_procurement ?? customer.hold_procurement;
        let defaultOrigin = (customer.stage !== 'LOST PROJECT') ? customer.stage : 'LEADS';
        
        if (!raw) {
            return {
                previous_stage: defaultOrigin,
                hold_status: '',
                comment: '',
                hold_date: today
            };
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'object' && parsed) {
                    return {
                        previous_stage: parsed.previous_stage || defaultOrigin,
                        hold_status: parsed.hold_status || '',
                        comment: parsed.comment || '',
                        hold_date: parsed.hold_date || today
                    };
                }
            } catch {
                // If raw string is a status like "Project Win"
                return {
                    previous_stage: defaultOrigin,
                    hold_status: raw,
                    comment: '',
                    hold_date: today
                };
            }
        }
        return {
            previous_stage: raw.previous_stage || defaultOrigin,
            hold_status: raw.hold_status || '',
            comment: raw.comment || '',
            hold_date: raw.hold_date || today
        };
    };

    const getSavedHoldState = () => {
        const raw = customer.hold_procurement;
        let defaultOrigin = (customer.stage !== 'LOST PROJECT') ? customer.stage : 'LEADS';
        if (!raw) {
            return {
                previous_stage: defaultOrigin,
                hold_status: '',
                comment: '',
                hold_date: today
            };
        }
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'object' && parsed) {
                    return {
                        previous_stage: parsed.previous_stage || defaultOrigin,
                        hold_status: parsed.hold_status || '',
                        comment: parsed.comment || '',
                        hold_date: parsed.hold_date || today
                    };
                }
            } catch {
                return {
                    previous_stage: defaultOrigin,
                    hold_status: raw,
                    comment: '',
                    hold_date: today
                };
            }
        }
        return {
            previous_stage: raw.previous_stage || defaultOrigin,
            hold_status: raw.hold_status || '',
            comment: raw.comment || '',
            hold_date: raw.hold_date || today
        };
    };

    const holdData = getHoldState();
    const savedHoldData = getSavedHoldState();

    const isHoldDirty = (
        (holdData.previous_stage || '') !== (savedHoldData.previous_stage || '') ||
        (holdData.hold_status || '') !== (savedHoldData.hold_status || '') ||
        (holdData.comment || '').trim() !== (savedHoldData.comment || '').trim() ||
        (holdData.hold_date || '') !== (savedHoldData.hold_date || '')
    );

    const updateHoldField = (field, value) => {
        const updated = {
            ...holdData,
            [field]: value
        };
        setEditData(prev => ({
            ...prev,
            hold_procurement: updated
        }));
    };

    const handleToggleStatus = (statusId) => {
        const nextStatus = holdData.hold_status === statusId ? '' : statusId;
        updateHoldField('hold_status', nextStatus);
    };

    const handleSaveHoldDetails = async () => {
        setSaving(true);
        const payload = {
            ...holdData,
            updated_at: new Date().toISOString()
        };

        // A failed save must stop here - otherwise the activity log below

        // records a change that never reached the database.

        if (await onUpdate(customer.id, { hold_procurement: payload }) === false) { setSaving(false); return; }
        if (logActivity && user?.id) {
            await logActivity(
                user.id,
                'update',
                `${customer.customer_name}: Saved Lost Project details (Status: ${payload.hold_status || 'None'}, Origin: ${payload.previous_stage}, Comment: ${payload.comment || 'None'})`,
                '',
                customer.id
            );
        }
        setSaving(false);
        if (fetchLogs) fetchLogs();
    };

    const handleResumeToPreviousStage = async () => {
        setSaving(true);
        const destStage = holdData.previous_stage || 'LEADS';
        const payload = {
            ...holdData,
            resumed_at: new Date().toISOString(),
            resumed_to: destStage
        };

        // A failed save must stop here - otherwise the activity log below

        // records a change that never reached the database.

        if (await onUpdate(customer.id, {
            stage: destStage,
            hold_procurement: payload
        }) === false) { setSaving(false); return; }

        if (logActivity && user?.id) {
            await logActivity(
                user.id,
                'stage_change',
                `${customer.customer_name}: Resumed from Lost Project → ${destStage}`,
                '',
                customer.id
            );
        }

        setSaving(false);
        if (fetchLogs) fetchLogs();
    };

    const originStageLabel = PRIMARY_STAGES.find(s => s.id === holdData.previous_stage)?.label || holdData.previous_stage || 'Unknown';

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Origin & Info Card */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3">
                <div className="p-2 bg-amber-100/80 text-amber-700 rounded-xl flex-shrink-0">
                    <PauseCircle size={18} />
                </div>
                <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                            Lost Project / On Hold
                        </h4>
                        <span className="text-[10px] bg-amber-200/60 text-amber-900 font-bold px-2.5 py-0.5 rounded-full">
                            Date: {holdData.hold_date || today}
                        </span>
                    </div>
                    <p className="text-[11px] text-amber-800 font-medium mt-1">
                        Parked from stage: <strong className="text-amber-950">{originStageLabel}</strong>
                    </p>
                </div>
            </div>

            {/* Main Hold Details Card */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/70 shadow-xs space-y-4">
                <div className="border-b border-stone-100 pb-2">
                    <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-amber-500" /> Lost Project Classification & Origin
                    </h4>
                </div>

                {/* Origin Stage & Hold Date Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-stone-50/70 p-3 rounded-xl border border-stone-200/60">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                            Origin / Dumped From Stage
                        </label>
                        {isEditable ? (
                            <select
                                value={holdData.previous_stage || ''}
                                onChange={e => updateHoldField('previous_stage', e.target.value)}
                                className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none focus:border-amber-400"
                            >
                                {PRIMARY_STAGES.filter(s => s.id !== 'LOST PROJECT' && s.id !== 'COMPLETED').map(stg => (
                                    <option key={stg.id} value={stg.id}>{stg.label}</option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-xs font-bold text-stone-800">{originStageLabel}</p>
                        )}
                    </div>

                    <div className="bg-stone-50/70 p-3 rounded-xl border border-stone-200/60">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                            Hold Placed Date
                        </label>
                        {isEditable ? (
                            <input
                                type="date"
                                value={holdData.hold_date || today}
                                onChange={e => updateHoldField('hold_date', e.target.value)}
                                className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                            />
                        ) : (
                            <p className="text-xs font-bold text-stone-800">{holdData.hold_date || '–'}</p>
                        )}
                    </div>
                </div>

                {/* Hold Status Tags - Glowing & Active */}
                <div>
                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">
                        Hold Status Tag
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {HOLD_STATUS_TAGS.map(tag => {
                            const isSelected = holdData.hold_status === tag.id;
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    disabled={!isEditable}
                                    onClick={() => handleToggleStatus(tag.id)}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 w-full cursor-pointer ${
                                        isSelected
                                            ? tag.activeClass
                                            : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                    }`}
                                >
                                    <span className={`w-2.5 h-2.5 rounded-full transition-all ${isSelected ? tag.dotClass : 'bg-stone-300'}`} />
                                    {tag.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Reason & Comments Textarea */}
                <div>
                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                        <MessageSquare size={11} className="text-stone-400" /> Hold Reason / Comments
                    </label>
                    {isEditable ? (
                        <textarea
                            rows={3}
                            placeholder="Add details about what went wrong, client concerns, financing delay, or resolution notes..."
                            value={holdData.comment || ''}
                            onChange={e => updateHoldField('comment', e.target.value)}
                            className="w-full bg-white border border-stone-200 rounded-xl p-3 text-xs text-stone-800 outline-none focus:border-amber-400 transition"
                        />
                    ) : (
                        <div className="bg-stone-50/70 p-3 rounded-xl border border-stone-200/60 text-xs text-stone-700 min-h-[60px]">
                            {holdData.comment || <span className="text-stone-400 italic">No hold comments recorded</span>}
                        </div>
                    )}
                </div>

                {/* Bottom Two Options: Save OR Save & Go Back to Previous Stage */}
                {isEditable && (
                    <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row gap-2.5">
                        <button
                            type="button"
                            onClick={handleSaveHoldDetails}
                            disabled={saving}
                            className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                                isHoldDirty
                                    ? 'bg-stone-900 hover:bg-stone-800 text-white'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/15'
                            }`}
                        >
                            {saving ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Saving...
                                </>
                            ) : isHoldDirty ? (
                                <>
                                    <Save size={14} /> Save
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={14} /> Saved
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleResumeToPreviousStage}
                            disabled={saving}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 px-4 rounded-xl text-xs font-bold transition shadow-md shadow-amber-500/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            <CornerUpLeft size={14} /> {saving ? 'Saving & Moving...' : `Save & Go Back to ${originStageLabel}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
