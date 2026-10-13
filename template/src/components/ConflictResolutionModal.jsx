import { AlertTriangle, Check, RefreshCw, ShieldAlert } from 'lucide-react';
import { CUSTOM_FIELDS, readPath } from '../config/index.js';
import { formatFieldValue } from '../lib/format.js';
import { Modal } from '../ui/index.js';

const CUSTOM_PREFIX = 'custom_fields.';
const customField = name => (name.startsWith(CUSTOM_PREFIX) ? CUSTOM_FIELDS.find(field => field.key === name.slice(CUSTOM_PREFIX.length)) : null);

// Extra fields arrive as 'custom_fields.<key>' so each one is compared on its own.
const fieldLabel = name => {
    if (name.startsWith(CUSTOM_PREFIX)) return customField(name)?.label || name.slice(CUSTOM_PREFIX.length).replace(/_/g, ' ');
    return name.replace(/_/g, ' ').toUpperCase();
};

function FieldValue({ name, value }) {
    if (value === null || value === undefined || value === '') return <span className="text-stone-400 italic">Empty</span>;
    const field = customField(name);
    if (field) return formatFieldValue(field, value);
    if (typeof value === 'object') return <span className="text-stone-600 font-mono text-xs">[Complex data]</span>;
    return String(value);
}

export default function ConflictResolutionModal({
    isOpen,
    conflict,
    onOverwrite,
    onMergeAndSave,
    onDiscardAndReload,
    onClose
}) {
    if (!isOpen || !conflict) return null;

    const {
        serverData,
        localUpdates,
        localChanges = [],
        remoteChanges = [],
        overlappingFields = [],
        serverUpdatedAt
    } = conflict;

    const formattedServerTime = serverUpdatedAt
        ? new Date(serverUpdatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'recently';

    const allDiffFields = Array.from(new Set([...localChanges, ...remoteChanges]));

    const footer = (
        <>
            <button
                type="button"
                onClick={onDiscardAndReload}
                className="min-h-11 px-4 rounded-xl text-xs font-semibold text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 transition-colors flex items-center gap-2 cursor-pointer sm:mr-auto"
            >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Discard My Edits & Load Latest
            </button>
            {overlappingFields.length === 0 && (
                <button
                    type="button"
                    onClick={onMergeAndSave}
                    className="min-h-11 px-4 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-2 cursor-pointer"
                >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Merge & Save
                </button>
            )}
            <button
                type="button"
                onClick={onOverwrite}
                className="min-h-11 px-4 rounded-xl text-xs font-semibold text-white bg-stone-900 hover:bg-black transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
            >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                Overwrite with My Edits
            </button>
        </>
    );

    return (
        <Modal open onClose={onClose} title="Edit Conflict Detected" size="lg" footer={footer}>
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700" aria-hidden="true" />
                    <p className="text-xs text-stone-700 leading-relaxed">
                        Another team member saved changes to this customer at <strong>{formattedServerTime}</strong> while you were editing.
                        Review the differences below to avoid losing work.
                    </p>
                </div>

                <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                    Comparison of Changed Fields
                </div>

                <div className="border border-stone-200 rounded-xl overflow-x-auto text-xs">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold">
                                <th className="p-3">Field</th>
                                <th className="p-3 bg-blue-50/50 text-blue-800">Saved by Colleague</th>
                                <th className="p-3 bg-emerald-50/50 text-emerald-800">Your Unsaved Edit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {allDiffFields.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="p-4 text-center text-stone-500 italic">
                                        No direct field conflicts detected (record timestamp was updated).
                                    </td>
                                </tr>
                            ) : allDiffFields.map((field) => {
                                const isDirectCollision = overlappingFields.includes(field);
                                return (
                                    <tr key={field} className={isDirectCollision ? 'bg-amber-50/30' : ''}>
                                        <td className="p-3 font-semibold text-stone-700">
                                            {fieldLabel(field)}
                                            {isDirectCollision && (
                                                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                                    Conflict
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 bg-blue-50/20 text-blue-950">
                                            <FieldValue name={field} value={serverData ? readPath(serverData, field) : undefined} />
                                        </td>
                                        <td className="p-3 bg-emerald-50/20 text-emerald-950 font-medium">
                                            <FieldValue name={field} value={localUpdates ? readPath(localUpdates, field) : undefined} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
}
