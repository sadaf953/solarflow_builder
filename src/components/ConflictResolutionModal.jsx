import React from 'react';
import { AlertTriangle, X, Check, RefreshCw, ArrowRight, ShieldAlert } from 'lucide-react';

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
        ? new Date(serverUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'recently';

    // Combine all fields that differ
    const allDiffFields = Array.from(new Set([...localChanges, ...remoteChanges]));

    const formatValue = (val) => {
        if (val === null || val === undefined || val === '') return <span className="text-stone-400 italic">Empty</span>;
        if (typeof val === 'object') return <span className="text-stone-600 font-mono text-xs">[Complex data]</span>;
        return String(val);
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-amber-50 border-b border-amber-100 p-5 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-bold text-stone-900">
                            Edit Conflict Detected
                        </h3>
                        <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                            Another team member saved changes to this customer at <strong>{formattedServerTime}</strong> while you were editing. 
                            Review the differences below to avoid losing work.
                        </p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-amber-100/50 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Diff Table */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                        Comparison of Changed Fields
                    </div>

                    <div className="border border-stone-200 rounded-xl overflow-hidden text-xs">
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
                                ) : (
                                    allDiffFields.map((field) => {
                                        const isDirectCollision = overlappingFields.includes(field);
                                        const serverVal = serverData ? serverData[field] : undefined;
                                        const localVal = localUpdates ? localUpdates[field] : undefined;

                                        return (
                                            <tr key={field} className={isDirectCollision ? 'bg-amber-50/30' : ''}>
                                                <td className="p-3 font-semibold text-stone-700">
                                                    {field.replace(/_/g, ' ').toUpperCase()}
                                                    {isDirectCollision && (
                                                        <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                                            Conflict
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 bg-blue-50/20 text-blue-950">
                                                    {formatValue(serverVal)}
                                                </td>
                                                <td className="p-3 bg-emerald-50/20 text-emerald-950 font-medium">
                                                    {formatValue(localVal)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Action Footer */}
                <div className="bg-stone-50 border-t border-stone-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onDiscardAndReload}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Discard My Edits & Load Latest
                    </button>

                    <div className="flex items-center gap-2">
                        {overlappingFields.length === 0 && (
                            <button
                                type="button"
                                onClick={onMergeAndSave}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                                <Check className="w-3.5 h-3.5" />
                                Merge & Save
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onOverwrite}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-stone-900 hover:bg-black transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                        >
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                            Overwrite with My Edits
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
