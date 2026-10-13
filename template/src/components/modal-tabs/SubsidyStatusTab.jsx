import React, { useState } from 'react';
import { History } from 'lucide-react';
import { SUBSIDY_TAGS, SUBSIDY_TAG_COLORS, isFinalTagValue } from '../../constants';
import { CheckboxRemarkItem } from './shared';

export default function SubsidyStatusTab({
    customer,
    editData,
    setEditData,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark
}) {
    const today = new Date().toISOString().split('T')[0];
    const [draftStatus, setDraftStatus] = useState('Approved');
    const [draftDate, setDraftDate] = useState(today);
    const [draftRemark, setDraftRemark] = useState('');
    const canDeleteDocs = ['admin', 'sales', 'office'].includes(user?.userType);

    const handleToggleSubsidyTag = (tagId) => {
        const newTag = editData.subsidy_tag === tagId ? null : tagId;
        setEditData(prev => ({ ...prev, subsidy_tag: newTag }));
        if (newTag) {
            setDraftStatus(newTag);
        }
    };

    const handleSaveSubsidyTag = async () => {
        const newTag = editData.subsidy_tag;
        const entryDate = new Date().toISOString().split('T')[0];
        let updatedHistory = editData.subsidy_history || [];
        
        if (newTag) {
            const newEntry = {
                status: newTag,
                date: entryDate,
                remark: 'Status updated via tag selector',
                created_at: new Date().toISOString()
            };
            updatedHistory = [...updatedHistory, newEntry];
        }
        
        setEditData(prev => ({ 
            ...prev, 
            subsidy_history: updatedHistory,
            subsidy_tag: newTag
        }));
        
        // A failed save must stop here - otherwise the activity log below
        
        // records a change that never reached the database.
        
        if (await onUpdate(customer.id, {
            subsidy_tag: newTag,
            subsidy_history: updatedHistory
        }) === false) return;
        
        const tagLabel = SUBSIDY_TAGS.find(t => t.id === newTag)?.label || newTag;
        await logActivity(
            user.id,
            'update',
            `${customer.customer_name}: Subsidy Tag saved to ${newTag ? tagLabel : 'None'} (logged to history)`,
            '',
            customer.id
        );
        
        fetchLogs();
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Subsidy Tag Selector */}
            <section className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-1">
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Subsidy Tag Tracking</label>
                    {isEditable && editData.subsidy_tag !== customer.subsidy_tag && (
                        <button
                            onClick={handleSaveSubsidyTag}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10"
                        >
                            Save Tag
                        </button>
                    )}
                </div>

                {customer.subsidy_tag === 'Received' && (
                    <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold mb-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">✓</span>
                        <span>Subsidy Disbursed (Locked to "Received")</span>
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                    {SUBSIDY_TAGS.map(tag => {
                        const isSelected = editData.subsidy_tag === tag.id;
                        const colors = SUBSIDY_TAG_COLORS[tag.id] || {};
                        // Terminal value locks the field - Admin can still change it.
                        const isLocked = isFinalTagValue(customer.subsidy_tag, SUBSIDY_TAGS) && user?.userType !== 'admin';
                        return (
                            <button
                                key={tag.id}
                                disabled={!isEditable || isLocked}
                                onClick={() => !isLocked && handleToggleSubsidyTag(tag.id)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 w-full ${
                                    isLocked && !tag.isFinal ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                    isSelected
                                        ? `${colors.bg} ${colors.text} ${colors.border} shadow-sm shadow-stone-900/5`
                                        : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${isSelected ? colors.dot : 'bg-stone-300'}`} />
                                {tag.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Optional supporting document: the document row itself is the
                source of truth, so no new admin-table boolean is required. */}
            <section className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-3">
                <div className="border-b border-stone-100 pb-2">
                    <h3 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Subsidy Documents</h3>
                    <p className="mt-1 text-[10px] font-medium text-stone-400">Optional supporting documents</p>
                </div>
                <CheckboxRemarkItem
                    label="Plant Commissioning Report (Optional)"
                    field="plant_commissioning_report"
                    value={editData.plant_commissioning_report}
                    onChange={(field, value) => setEditData(prev => ({ ...prev, [field]: value }))}
                    isEditing={isEditable}
                    documents={documents}
                    onUpload={onFileUpload}
                    onDelete={onFileDelete}
                    onPreview={onFilePreview}
                    onUpdateRemark={onUpdateRemark}
                    canDelete={canDeleteDocs}
                />
            </section>

            {/* Subsidy History Timeline */}
            <section className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-2 border-b border-stone-100 pb-2">
                    <History size={16} className="text-stone-400" />
                    <h3 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Subsidy Status Timeline</h3>
                </div>

                {(!editData.subsidy_history || editData.subsidy_history.length === 0) ? (
                    <p className="text-xs text-stone-400 italic">No subsidy history recorded</p>
                ) : (
                    <div className="relative border-l border-stone-200 ml-3 pl-5 space-y-4">
                        {(editData.subsidy_history || []).map((e, idx) => {
                            const pillColors = {
                                Approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
                                Returned: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
                                Rejected: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
                                Redeemed: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400' },
                                Received: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-400' },
                            };
                            const colors = pillColors[e.status] || { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200', dot: 'bg-stone-400' };
                            return (
                                <div key={idx} className="relative">
                                    <span className={`absolute -left-[25.5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-white ${colors.dot}`} />
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                {e.status}
                                            </span>
                                            {e.remark && <span className="text-xs text-stone-600 font-medium">{e.remark}</span>}
                                        </div>
                                        {e.date && <span className="text-[10px] text-stone-400 font-semibold">{e.date}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Add Subsidy Entry */}
                {isEditable && (
                    <div className="pt-2">
                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Status</label>
                                    <select
                                        value={draftStatus}
                                        onChange={e => setDraftStatus(e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-amber-400"
                                    >
                                        <option value="Approved">Approved</option>
                                        <option value="Returned">Returned</option>
                                        <option value="Rejected">Rejected</option>
                                        <option value="Redeemed">Redeemed</option>
                                        <option value="Received">Received</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={draftDate}
                                        onChange={e => setDraftDate(e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-amber-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Remark</label>
                                <input
                                    type="text"
                                    placeholder="Remark details..."
                                    value={draftRemark}
                                    onChange={e => setDraftRemark(e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-amber-400"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-1.5">
                                <button
                                    onClick={async () => {
                                        const entryDate = draftDate || new Date().toISOString().split('T')[0];
                                        const newEntry = {
                                            status: draftStatus,
                                            date: entryDate,
                                            remark: draftRemark,
                                            created_at: new Date().toISOString()
                                        };
                                        const updatedHistory = [...(editData.subsidy_history || []), newEntry];
                                        
                                        setEditData(prev => ({ 
                                            ...prev, 
                                            subsidy_history: updatedHistory,
                                            subsidy_tag: draftStatus
                                        }));
                                        // A failed save must stop here - otherwise the activity log below
                                        // records a change that never reached the database.
                                        if (await onUpdate(customer.id, { 
                                            subsidy_history: updatedHistory,
                                            subsidy_tag: draftStatus
                                        }) === false) return;
                                        
                                        await logActivity(
                                            user.id,
                                            'update',
                                            `${customer.customer_name}: Added subsidy entry (${draftStatus} on ${entryDate}${draftRemark ? `: ${draftRemark}` : ''})`,
                                            '',
                                            customer.id
                                        );
                                        
                                        setDraftRemark('');
                                        setDraftDate(today);
                                        fetchLogs();
                                    }}
                                    className="px-3.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10 transition-colors"
                                >
                                    Add Entry
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
