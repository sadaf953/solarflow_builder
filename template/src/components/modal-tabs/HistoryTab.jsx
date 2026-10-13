import React from 'react';
import { ShieldCheck, Send } from 'lucide-react';
import { SectionHeader } from './shared';
import { formatLogDate } from '../../utils';
import { ACTION_COLORS } from '../../constants';

export default function HistoryTab({
    editData,
    handleChange,
    isEditable,
    editingSection,
    setEditingSection,
    followUpText,
    setFollowUpText,
    handleAddNote,
    activityLogs
}) {
    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <section id="section-rem">
                <SectionHeader title="Internal Remarks (Staff Only)" id="rem" icon={ShieldCheck} isEditable={isEditable} editingSection={editingSection} setEditingSection={setEditingSection} />
                {editingSection === 'rem' ? (
                    <textarea value={editData.internal_remarks || ''} onChange={e => handleChange('internal_remarks', e.target.value)}
                        className="w-full p-4 border rounded-2xl text-xs bg-stone-50 focus:ring-1 focus:ring-amber-400 outline-none" rows={4}
                        placeholder="Sensitive notes visible only to internal staff..." />
                ) : (
                    <div className="bg-stone-100/50 p-4 rounded-2xl border border-stone-200 text-xs text-stone-600 italic whitespace-pre-line">
                        {editData.internal_remarks || 'No internal remarks recorded yet.'}
                    </div>
                )}
            </section>

            <section>
                <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-6">Activity Notes</h3>
                <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2">
                    {(editData.follow_ups || []).slice().reverse().map((f, i) => (
                        <div key={i} className="bg-white p-3.5 rounded-xl border border-stone-100 shadow-sm">
                            <p className="text-xs text-stone-800 leading-relaxed">{f.text}</p>
                            <div className="flex justify-between mt-2.5 text-[8px] text-stone-400 font-bold uppercase">
                                <span>{f.author}</span><span>{formatLogDate(f.date)}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input value={followUpText} onChange={e => setFollowUpText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                        placeholder="Share an update with the team..."
                        className="flex-1 px-4 py-3 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-amber-400" />
                    <button onClick={handleAddNote} className="bg-stone-900 text-white px-6 rounded-xl hover:bg-stone-800 transition-all flex items-center justify-center">
                        <Send size={16} />
                    </button>
                </div>
            </section>

            <section>
                <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-6">Detailed System History</h3>
                <div className="space-y-4">
                    {activityLogs.length > 0 ? activityLogs.map((log, i) => (
                        <div key={i} className="relative pl-6 pb-4 border-l border-stone-100 last:border-0">
                            <div className="absolute -left-[4.5px] top-0 w-2 h-2 rounded-full bg-white border-2 border-amber-500 shadow-sm" />
                            <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm -mt-1.5 hover:border-amber-200 transition-colors">
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${ACTION_COLORS[log.action] || 'bg-stone-100 text-stone-600'}`}>{log.action}</span>
                                    <span className="text-[8px] text-stone-400 font-bold">{formatLogDate(log.created_at)}</span>
                                </div>
                                <div className="text-xs text-stone-700 font-medium whitespace-pre-wrap leading-relaxed">
                                    {String(log?.message || '').includes('|') ? (
                                        <div className="space-y-1">
                                            {String(log?.message || '').split('|').map((line, idx) => (
                                                <div key={idx} className="flex items-center gap-1"><span className="text-stone-400">↳</span> {line.trim()}</div>
                                            ))}
                                        </div>
                                    ) : (log?.message || '–')}
                                </div>
                                <p className="text-[8px] text-stone-400 font-bold uppercase mt-2 border-t border-stone-50 pt-1.5">User: {log.profiles?.name || 'System'}</p>
                            </div>
                        </div>
                    )) : <p className="text-[8px] text-stone-400 italic">No timeline entries found.</p>}
                </div>
            </section>
        </div>
    );
}
