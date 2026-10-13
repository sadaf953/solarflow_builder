// ─── TrashView.jsx ────────────────────────────────────────────────────────────
// Soft-deleted customers (deleted_at is set): view (read only) or recover.
// Permanent delete is shown to admins only; the database refuses anyone else.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Trash2, RotateCcw, Eye } from 'lucide-react';
import { SUBSIDY_TAGS, isOn, stageLabel } from '../config/index.js';
import { CUSTOMER_CARD_COLUMNS } from '../constants';
import { fetchAllPages } from '../lib/db.js';
import { formatDate } from '../lib/format.js';
import { EmptyState, ErrorBanner, LoadingState, Modal } from '../ui/index.js';

const deletedOn = value => formatDate(value, 'short') || '–';

function TrashDetail({ customer, onClose }) {
    const tagInfo = isOn('subsidyTracking') ? SUBSIDY_TAGS.find(tag => tag.id === customer.subsidy_tag) : null;
    const rows = [
        ['Phone', customer.phone_number],
        ['Email', customer.email_address],
        ['Channel partner', customer.channel_partner],
        ['Capacity', customer.system_capacity_kwp ? `${customer.system_capacity_kwp} kWp` : null],
        ['Modules', customer.no_of_modules ? `${customer.no_of_modules} modules` : null],
        ['Panel / WP', (customer.module_brand || customer.module_wp) ? `${customer.module_brand || ''} ${customer.module_wp ? `(${customer.module_wp}W)` : ''}`.trim() : null],
        ['Stage when deleted', stageLabel(customer.stage)],
        ['Subsidy status', tagInfo?.label],
    ].filter(([, value]) => value);
    return (
        <Modal open onClose={onClose} title={customer.customer_name || 'Unnamed customer'}>
            <p className="mb-3 text-xs text-stone-500">Deleted {deletedOn(customer.deleted_at)} · Read only</p>
            <dl className="space-y-3">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 text-sm">
                        <dt className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">{label}</dt>
                        <dd className="text-stone-700 font-medium text-right">{value}</dd>
                    </div>
                ))}
            </dl>
        </Modal>
    );
}

export default function TrashView({ onRecover, onHardDelete, isAdmin, onCountChange }) {
    const [viewing, setViewing] = useState(null);
    const [confirmHard, setConfirmHard] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [trashedCustomers, setTrashedCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchAllPages(() => supabase
            .from('admin')
            .select(`${CUSTOMER_CARD_COLUMNS}, email_address`)
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false })
            .order('id', { ascending: true }))
            .then(rows => { if (!cancelled) setTrashedCustomers(rows); })
            .catch(error => {
                console.error('Error fetching trashed customers:', error);
                if (!cancelled) setLoadError('Trash could not be loaded. Check your connection and refresh the page.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!loading && !loadError) onCountChange?.(trashedCustomers.length);
    }, [trashedCustomers.length, onCountChange, loading, loadError]);

    const handleRecover = async customer => {
        if (await onRecover(customer.id, customer.customer_name) === false) return;
        setTrashedCustomers(prev => prev.filter(c => c.id !== customer.id));
    };

    const handleHardDelete = async () => {
        const customer = confirmHard;
        setDeleting(true);
        const ok = await onHardDelete(customer.id, customer.customer_name);
        setDeleting(false);
        setConfirmHard(null);
        if (ok !== false) setTrashedCustomers(prev => prev.filter(c => c.id !== customer.id));
    };

    if (loading) return <LoadingState label="Loading Trash…" />;
    if (loadError) return <ErrorBanner className="max-w-4xl mx-auto">{loadError}</ErrorBanner>;

    if (trashedCustomers.length === 0) {
        return <EmptyState icon={Trash2} title="Trash is empty" className="max-w-4xl mx-auto">Deleted customers will appear here.</EmptyState>;
    }

    const totalKwp = trashedCustomers.reduce((acc, c) => acc + (parseFloat(c.system_capacity_kwp) || 0), 0);
    const totalModules = trashedCustomers.reduce((acc, c) => acc + (parseInt(c.no_of_modules, 10) || 0), 0);

    return (
        <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    <Trash2 className="w-4 h-4 text-stone-400" aria-hidden="true" />
                    <p className="text-sm text-stone-600 font-medium">
                        {trashedCustomers.length} deleted record{trashedCustomers.length !== 1 ? 's' : ''}
                    </p>
                    {totalKwp > 0 && (
                        <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                            {totalKwp % 1 === 0 ? totalKwp : totalKwp.toFixed(1)} kWp total
                        </span>
                    )}
                    {totalModules > 0 && (
                        <span className="text-xs bg-stone-100 text-stone-700 border border-stone-200 px-2 py-0.5 rounded-full font-semibold">
                            {totalModules} modules total
                        </span>
                    )}
                </div>
                {isAdmin && <span className="text-[11px] text-stone-500">Admins can delete records permanently</span>}
            </div>

            {trashedCustomers.map(c => (
                <div key={c.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-center gap-4 hover:border-red-100 transition-all">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-stone-700 truncate">{c.customer_name || 'Unnamed customer'}</p>
                            <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded font-bold uppercase">Deleted</span>
                            {c.system_capacity_kwp && (
                                <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-md font-bold">{c.system_capacity_kwp} kWp</span>
                            )}
                            {c.no_of_modules && (
                                <span className="text-[10px] bg-stone-100 text-stone-700 border border-stone-200/80 px-2 py-0.5 rounded-md font-semibold">
                                    Qty: {c.no_of_modules} {parseInt(c.no_of_modules, 10) === 1 ? 'module' : 'modules'}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-stone-500">
                            {stageLabel(c.stage) || '–'} · {c.villages || 'No location'}
                            {c.channel_partner ? ` · ${c.channel_partner}` : ''} · Deleted {deletedOn(c.deleted_at)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button type="button" onClick={() => setViewing(c)} aria-label={`View ${c.customer_name || 'customer'}`} title="View"
                            className="flex h-11 w-11 items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer">
                            <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleRecover(c)}
                            className="min-h-11 flex items-center gap-1.5 px-3 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors cursor-pointer">
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Recover
                        </button>
                        {isAdmin && (
                            <button type="button" onClick={() => setConfirmHard(c)} aria-label={`Permanently delete ${c.customer_name || 'customer'}`} title="Permanently delete"
                                className="flex h-11 w-11 items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {viewing && <TrashDetail customer={viewing} onClose={() => setViewing(null)} />}

            <Modal
                open={Boolean(isAdmin && confirmHard)} onClose={() => setConfirmHard(null)} busy={deleting} size="sm" title="Delete permanently?"
                footer={<>
                    <button type="button" onClick={() => setConfirmHard(null)} disabled={deleting} className="sf-btn-secondary min-h-11">Cancel</button>
                    <button type="button" onClick={handleHardDelete} disabled={deleting}
                        className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                        <Trash2 className="w-4 h-4" aria-hidden="true" /> {deleting ? 'Deleting…' : 'Delete forever'}
                    </button>
                </>}
            >
                <p className="text-sm text-stone-600">
                    <strong>{confirmHard?.customer_name || 'This customer'}</strong> will be removed from the database for good. This cannot be undone.
                </p>
            </Modal>
        </div>
    );
}
