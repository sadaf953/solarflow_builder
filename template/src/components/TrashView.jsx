// ─── TrashView.jsx ────────────────────────────────────────────────────────────
// Shows soft-deleted customers (deleted_at IS NOT NULL).
// Actions: View details (read-only) | Recover.
// Hard delete (permanent) for admin only.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from "../supabase";
import { Trash2, RotateCcw, Eye, AlertTriangle, X } from 'lucide-react';
import { PRIMARY_STAGES, SUBSIDY_TAGS, CUSTOMER_CARD_COLUMNS } from '../constants';

function formatDate(d) {
    if (!d) return '–';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function TrashDetailDrawer({ customer, onClose }) {
    const tagInfo = SUBSIDY_TAGS.find(f => f.id === customer.subsidy_tag);
    return (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-lg overflow-hidden border border-stone-100">
                <div className="bg-stone-700 px-6 py-5 flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-2">
                            <Trash2 size={14} className="text-red-400" />
                            <h2 className="text-lg font-bold text-white">{customer.customer_name}</h2>
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">Deleted {formatDate(customer.deleted_at)} · Read only</p>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white cursor-pointer"><X size={22} /></button>
                </div>
                <div className="p-6 space-y-3">
                    {[
                        ['Phone',            customer.phone_number],
                        ['Email',            customer.email_address],
                        ['Channel Partner',  customer.channel_partner],
                        ['Capacity',         customer.system_capacity_kwp ? `${customer.system_capacity_kwp} kWp` : null],
                        ['Quantity (Modules)', customer.no_of_modules ? `${customer.no_of_modules} Modules` : null],
                        ['Panel / WP',       (customer.module_brand || customer.module_wp) ? `${customer.module_brand || ''} ${customer.module_wp ? `(${customer.module_wp}W)` : ''}`.trim() : null],
                        ['Stage at Deletion',PRIMARY_STAGES.find(s => s.id === customer.stage)?.label || customer.stage],
                        ['Subsidy Status',   tagInfo?.label],
                    ].map(([label, val]) => val ? (
                        <div key={label} className="flex justify-between text-sm">
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">{label}</span>
                            <span className="text-stone-700 font-medium">{val}</span>
                        </div>
                    ) : null)}

                </div>
            </div>
        </div>
    );
}

export default function TrashView({ onRecover, onHardDelete, isAdmin, onCountChange }) {
    const [viewing, setViewing] = useState(null);
    const [confirmHard, setConfirmHard] = useState(null);
    const [trashedCustomers, setTrashedCustomers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrashed = async () => {
            setLoading(true);
            let data = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                const { data: page, error } = await supabase
                    .from('admin')
                    // Was select('*'): ~90 columns per row for a card that renders a
                // handful. CUSTOMER_CARD_COLUMNS was already imported here
                // and unused. The detail modal fetches the full record on open.
                .select(`${CUSTOMER_CARD_COLUMNS}, email_address`)
                    .not('deleted_at', 'is', null)
                    .order('deleted_at', { ascending: false })
                    .range(from, from + pageSize - 1);
                if (error) {
                    console.error('Error fetching trashed customers:', error);
                    break;
                }
                if (!page || page.length === 0) break;
                data = data.concat(page);
                if (page.length < pageSize) break;
                from += pageSize;
            }
            setTrashedCustomers(data || []);
            setLoading(false);
        };
        fetchTrashed();
    }, []);

    useEffect(() => {
        if (typeof onCountChange === 'function' && !loading) {
            onCountChange(trashedCustomers.length);
        }
    }, [trashedCustomers.length, onCountChange, loading]);

    const handleRecover = async (id) => {
        await onRecover(id);
        setTrashedCustomers(prev => prev.filter(c => c.id !== id));
    };

    const handleHardDelete = async (id) => {
        await onHardDelete(id);
        setTrashedCustomers(prev => prev.filter(c => c.id !== id));
    };

    if (loading) return <div className="p-10 text-center animate-pulse text-stone-400">Loading trash...</div>;

    if (trashedCustomers.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 text-stone-400">
            <Trash2 className="w-12 h-12 mb-3 text-stone-200" />
            <p className="font-medium text-stone-500">Trash is empty</p>
            <p className="text-sm mt-1">Deleted customers will appear here</p>
        </div>
    );

    const totalKwp = trashedCustomers.reduce((acc, c) => acc + (parseFloat(c.system_capacity_kwp) || 0), 0);
    const totalModules = trashedCustomers.reduce((acc, c) => acc + (parseInt(c.no_of_modules, 10) || 0), 0);

    return (
        <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    <Trash2 className="w-4 h-4 text-stone-400" />
                    <p className="text-sm text-stone-600 font-medium">
                        {trashedCustomers.length} deleted record{trashedCustomers.length !== 1 ? 's' : ''}
                    </p>
                    {(totalKwp > 0 || totalModules > 0) && (
                        <div className="flex items-center gap-1.5 ml-2">
                            {totalKwp > 0 && (
                                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                                    {totalKwp % 1 === 0 ? totalKwp : totalKwp.toFixed(1)} kWp Total
                                </span>
                            )}
                            {totalModules > 0 && (
                                <span className="text-xs bg-stone-100 text-stone-700 border border-stone-200 px-2 py-0.5 rounded-full font-semibold">
                                    {totalModules} Modules Total
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {isAdmin && <span className="text-[10px] text-stone-400">Admins can permanently delete</span>}
            </div>

            {trashedCustomers.map(c => (
                <div key={c.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-center gap-4 hover:border-red-100 transition-all">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-stone-700 truncate">{c.customer_name}</p>
                            <span className="text-[9px] bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded font-bold uppercase">Deleted</span>
                            {c.system_capacity_kwp && (
                                <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-md font-bold">
                                    {c.system_capacity_kwp} kWp
                                </span>
                            )}
                            {c.no_of_modules && (
                                <span className="text-[10px] bg-stone-100 text-stone-700 border border-stone-200/80 px-2 py-0.5 rounded-md font-semibold">
                                    Qty: {c.no_of_modules} {parseInt(c.no_of_modules, 10) === 1 ? 'module' : 'modules'}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-stone-400">
                            {PRIMARY_STAGES.find(s => s.id === c.stage)?.label || c.stage || '–'} ·{' '}
                            {c.villages || 'No location'}
                            {c.channel_partner ? ` · ${c.channel_partner}` : ''} · Deleted {formatDate(c.deleted_at)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => setViewing(c)}
                            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer" title="View">
                            <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRecover(c.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors cursor-pointer">
                            <RotateCcw className="w-3.5 h-3.5" /> Recover
                        </button>
                        {isAdmin && (
                            <button onClick={() => setConfirmHard(c)}
                                className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer" title="Permanently delete">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {/* View drawer */}
            {viewing && <TrashDetailDrawer customer={viewing} onClose={() => setViewing(null)} />}

            {/* Hard delete confirm */}
            {confirmHard && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-100 rounded-full"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                            <h3 className="font-bold text-stone-800">Permanently Delete?</h3>
                        </div>
                        <p className="text-sm text-stone-600 mb-5">
                            <strong>{confirmHard.customer_name}</strong> will be <strong>permanently removed</strong> from the database. This cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmHard(null)} className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium">Cancel</button>
                            <button onClick={() => { handleHardDelete(confirmHard.id); setConfirmHard(null); }}
                                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                                <Trash2 className="w-4 h-4" /> Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
