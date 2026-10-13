// ─── HistoryEntryEditor.jsx ───────────────────────────────────────────────────
// Generic reusable editor for any "status history" array stored in a JSONB column.
// Used for: subsidy history, loan history, inspection history, etc.
//
// Props:
//   entries        : array of { status, date, remark, created_at }
//   onChange       : (newEntries) => void
//   isEditing      : bool
//   statusOptions  : string[]   - dropdown values (e.g. ['Pending', 'Approved', 'Rejected'])
//   statusColors   : { [status]: { bg, text } }  - optional colour map for the read-only pills
//   title          : string  - singular label for "Add X Entry" button
//   emptyText      : string  - shown when there are no entries
// ──────────────────────────────────────────────────────────────────────────────

import { Plus, Trash2 } from 'lucide-react';

const DEFAULT_COLORS = {
    Approved:   'bg-emerald-100 text-emerald-700',
    Disbursed:  'bg-emerald-100 text-emerald-700',
    Redeemed:   'bg-blue-100 text-blue-700',
    Pending:    'bg-amber-100 text-amber-700',
    Rejected:   'bg-red-100 text-red-700',
    Submitted:  'bg-purple-100 text-purple-700',
    Return:     'bg-rose-100 text-rose-700',
    Inspected:  'bg-sky-100 text-sky-700',
    Completed:  'bg-emerald-100 text-emerald-700',
};

export default function HistoryEntryEditor({
    entries = [],
    onChange,
    isEditing,
    statusOptions = ['Pending', 'Approved', 'Rejected'],
    statusColors = {},
    title = 'Entry',
    emptyText = 'No entries recorded',
}) {
    const allColors = { ...DEFAULT_COLORS, ...statusColors };

    const today = new Date().toISOString().split('T')[0];
    const addEntry = () => onChange([
        ...entries,
        { status: statusOptions[0], date: today, remark: '', created_at: new Date().toISOString(), isNew: true },
    ]);

    const removeEntry = (idx) => onChange(entries.filter((_, i) => i !== idx));

    const updateEntry = (idx, field, val) =>
        onChange(entries.map((e, i) => i === idx ? { ...e, [field]: val } : e));

    // ── READ-ONLY view ──
    if (!isEditing) {
        if (entries.length === 0) return <p className="text-xs text-stone-400 italic">{emptyText}</p>;
        return (
            <div className="space-y-2">
                {entries.map((e, i) => {
                    const colorClass = allColors[e.status] || 'bg-stone-100 text-stone-600';
                    return (
                        <div key={i} className="bg-stone-50 p-3 rounded-xl">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${colorClass}`}>
                                    {e.status}
                                </span>
                                {e.date && <p className="text-xs text-stone-400">{e.date}</p>}
                            </div>
                            {e.remark && <p className="text-xs text-stone-600 mt-1 pl-4">💬 {e.remark}</p>}
                        </div>
                    );
                })}
            </div>
        );
    }

    // ── EDIT view ──
    return (
        <div className="space-y-2">
            {entries.map((e, idx) => {
                const isPast = !e.isNew;
                return (
                    <div key={idx} className="bg-stone-50 p-3 rounded-xl space-y-2 border border-stone-200">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] font-bold text-stone-400 uppercase">{title} {idx + 1} {isPast && '(Saved)'}</p>
                            {!isPast && (
                                <button onClick={() => removeEntry(idx)} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                disabled={isPast}
                                value={e.status || statusOptions[0]}
                                onChange={ev => updateEntry(idx, 'status', ev.target.value)}
                                className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-75 disabled:bg-stone-100/80"
                            >
                                {statusOptions.map(t => <option key={t}>{t}</option>)}
                            </select>
                            <input
                                type="date"
                                disabled={isPast}
                                value={e.date || ''}
                                onChange={ev => updateEntry(idx, 'date', ev.target.value)}
                                className="bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-75 disabled:bg-stone-100/80"
                            />
                        </div>
                        <input
                            type="text"
                            disabled={isPast}
                            placeholder="Remark..."
                            value={e.remark || ''}
                            onChange={ev => updateEntry(idx, 'remark', ev.target.value)}
                            className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300 disabled:opacity-75 disabled:bg-stone-100/80"
                        />
                    </div>
                );
            })}
            <button
                onClick={addEntry}
                className="w-full flex items-center justify-center gap-1.5 border border-dashed border-stone-300 rounded-xl py-2 text-xs text-stone-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
            >
                <Plus className="w-3.5 h-3.5" /> Add {title}
            </button>
        </div>
    );
}
