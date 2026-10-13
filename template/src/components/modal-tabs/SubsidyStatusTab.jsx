import { useId, useState } from 'react';
import { CheckCircle2, FileText, History, Tag } from 'lucide-react';
import { SUBSIDY_TAGS, tagLabel } from '../../config/index.js';
import { SUBSIDY_TAG_COLORS, isFinalTagValue } from '../../constants';
import { formatDate, todayIST } from '../../lib/format.js';
import { Field, Input, SectionCard, Select, TagPicker } from '../../ui/index.js';
import { CheckboxRemarkItem } from './shared';
import useStageSave from './useStageSave';

const STATUS_OPTIONS = SUBSIDY_TAGS.map(tag => ({ value: tag.id, label: tag.label }));
const NEUTRAL = { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200', dot: 'bg-stone-400' };

export default function SubsidyStatusTab({
    customer,
    editData,
    setEditData,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    saving,
    setSaving,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
}) {
    const baseId = useId();
    const ids = { status: `${baseId}-status`, date: `${baseId}-date`, remark: `${baseId}-remark` };
    const save = useStageSave({ customer, user, onUpdate, logActivity, fetchLogs, setSaving });
    const [draftStatus, setDraftStatus] = useState(() => editData.subsidy_tag || SUBSIDY_TAGS[0]?.id || '');
    const [draftDate, setDraftDate] = useState(todayIST);
    const [draftRemark, setDraftRemark] = useState('');
    const canDeleteDocs = ['admin', 'sales'].includes(user?.userType);
    // A final status (Received) locks the tag for everyone except the admin.
    const isFinal = isFinalTagValue(customer.subsidy_tag, SUBSIDY_TAGS);
    const locked = isFinal && user?.userType !== 'admin';
    const history = Array.isArray(editData.subsidy_history) ? editData.subsidy_history : [];

    const pickTag = tag => {
        setEditData(prev => ({ ...prev, subsidy_tag: tag }));
        if (tag) setDraftStatus(tag);
    };

    const saveTag = async () => {
        const tag = editData.subsidy_tag || null;
        const nextHistory = tag
            ? [...history, { status: tag, date: todayIST(), remark: 'Status updated via tag selector', created_at: new Date().toISOString() }]
            : history;
        await save({ subsidy_tag: tag, subsidy_history: nextHistory },
            `Subsidy tag saved to ${tag ? tagLabel(SUBSIDY_TAGS, tag) : 'None'} (logged to history)`);
    };

    const addEntry = async () => {
        if (!draftStatus) return;
        const date = draftDate || todayIST();
        const remark = draftRemark.trim();
        const nextHistory = [...history, { status: draftStatus, date, remark, created_at: new Date().toISOString() }];
        const saved = await save({ subsidy_history: nextHistory, subsidy_tag: draftStatus },
            `Added subsidy entry (${tagLabel(SUBSIDY_TAGS, draftStatus)} on ${date}${remark ? `: ${remark}` : ''})`);
        if (!saved) return;
        setDraftRemark('');
        setDraftDate(todayIST());
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard
                title="Subsidy status"
                icon={Tag}
                actions={isEditable && (editData.subsidy_tag || null) !== (customer.subsidy_tag || null) && (
                    <button type="button" onClick={saveTag} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                        Save status
                    </button>
                )}
            >
                {isFinal && (
                    <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-600" aria-hidden="true" />
                        Subsidy {tagLabel(SUBSIDY_TAGS, customer.subsidy_tag).toLowerCase()}. Only the admin can change this status.
                    </p>
                )}
                <TagPicker
                    label="Subsidy status"
                    options={SUBSIDY_TAGS}
                    colors={SUBSIDY_TAG_COLORS}
                    columns={4}
                    value={editData.subsidy_tag || null}
                    allowDeselect
                    locked={locked}
                    disabled={!isEditable}
                    onChange={pickTag}
                />
            </SectionCard>

            {/* The uploaded document is the record; there is no separate column to tick. */}
            <SectionCard title="Subsidy documents" subtitle="Optional supporting documents" icon={FileText}>
                <CheckboxRemarkItem
                    label="Plant commissioning report"
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
            </SectionCard>

            <SectionCard title="Subsidy history" icon={History} tone="stone">
                {history.length === 0 ? (
                    <p className="text-xs italic text-stone-500">No subsidy history yet.</p>
                ) : (
                    <ol className="relative ml-3 space-y-4 border-l border-stone-200 pl-5">
                        {history.map((entry, index) => {
                            const colors = SUBSIDY_TAG_COLORS[entry.status] || NEUTRAL;
                            return (
                                <li key={`${entry.created_at || ''}-${index}`} className="relative">
                                    <span className={`absolute -left-[25.5px] top-1.5 h-2 w-2 rounded-full ring-4 ring-white ${colors.dot}`} aria-hidden="true" />
                                    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colors.bg} ${colors.text} ${colors.border}`}>
                                                {tagLabel(SUBSIDY_TAGS, entry.status)}
                                            </span>
                                            {entry.remark && <span className="text-xs font-medium text-stone-600">{entry.remark}</span>}
                                        </div>
                                        {entry.date && <span className="text-[11px] font-semibold text-stone-500">{formatDate(entry.date, 'short')}</span>}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}

                {isEditable && !locked && (
                    <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Status" htmlFor={ids.status}>
                                <Select id={ids.status} options={STATUS_OPTIONS} value={draftStatus} onChange={event => setDraftStatus(event.target.value)} />
                            </Field>
                            <Field label="Date" htmlFor={ids.date}>
                                <Input id={ids.date} type="date" value={draftDate} onChange={event => setDraftDate(event.target.value)} />
                            </Field>
                        </div>
                        <Field label="Remark" htmlFor={ids.remark}>
                            <Input id={ids.remark} type="text" placeholder="Optional note" value={draftRemark} onChange={event => setDraftRemark(event.target.value)} />
                        </Field>
                        <div className="flex justify-end">
                            <button type="button" onClick={addEntry} disabled={saving || !draftStatus} className="sf-btn-success min-h-11 disabled:opacity-50">
                                Add entry
                            </button>
                        </div>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
