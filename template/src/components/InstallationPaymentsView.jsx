import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Check, CheckCircle2, CreditCard, Phone, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';
import { getTelephoneHref, logActivity, runWrite } from '../utils';
import { fetchAllPages } from '../lib/db.js';
import { MONTH_NAMES, formatDate, formatINR, formatKwp, todayIST } from '../lib/format.js';
import { EmptyState, ErrorBanner, LoadingState, SearchInput, Select, Spinner, StatTile, TagPicker } from '../ui/index.js';
import { useGlobalPopup } from './GlobalPopup';

const COLUMNS = 'id, customer_name, phone_number, consumer_no, system_capacity_kwp, vendor, vendor_quote, vendor_payment_status, vendor_paid_date, vendor_paid_by, material_delivery_date, installation_date, installation_status, created_at';
const NO_DATE = 'none';
const STATUS_OPTIONS = [
    { id: 'All', label: 'All' },
    { id: 'Pending', label: 'Unpaid' },
    { id: 'Paid', label: 'Paid' },
];
const amount = r => Number(r.vendor_quote) || 0;
const isPaid = r => r.vendor_payment_status === 'Paid';
const sum = rows => rows.reduce((total, r) => total + amount(r), 0);

// Installers are paid on the 1st of the month after the installation date.
function payoutFor(installationDate) {
    const match = /^(\d{4})-(\d{2})-\d{2}/.exec(String(installationDate || '').trim());
    if (!match) return null;
    const year = Number(match[1]) + (match[2] === '12' ? 1 : 0);
    const month = match[2] === '12' ? 1 : Number(match[2]) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { key, label: `${MONTH_NAMES[month - 1]} ${year}`, due: `${key}-01` };
}

function DateCell({ value }) {
    return value
        ? <span className="text-xs font-semibold text-stone-800">{formatDate(value, 'short')}</span>
        : <span className="text-xs text-stone-500">Not set</span>;
}

export default function InstallationPaymentsView({ onSelectCustomer, currentUser }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const canEditPayment = currentUser?.userType === 'admin';
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [monthFilter, setMonthFilter] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');
    const [updatingId, setUpdatingId] = useState(null);
    const [payingAll, setPayingAll] = useState(false);
    const [installations, setInstallations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // Installed projects with an installer. Older rows say 'Yes' instead of 'Installed'.
    const fetchInstallations = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await fetchAllPages(() => supabase
                .from('admin')
                .select(COLUMNS)
                .is('deleted_at', null)
                .not('vendor', 'is', null)
                .neq('vendor', '')
                .or('installation_status.ilike.%yes%,installation_status.ilike.%installed%')
                .order('created_at', { ascending: false }));
            setInstallations(rows);
            setLoadError('');
        } catch (error) {
            console.error('Could not load installation payouts:', error);
            setLoadError(error?.message || 'Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchInstallations(); }, [fetchInstallations]);

    const records = useMemo(() => installations
        .filter(r => String(r.vendor || '').trim())
        .map(r => ({ ...r, vendor: String(r.vendor).trim(), payout: payoutFor(r.installation_date) })), [installations]);

    const vendors = useMemo(() => [...new Set(records.map(r => r.vendor))].sort((a, b) => a.localeCompare(b)), [records]);

    const months = useMemo(() => {
        const groups = new Map();
        for (const r of records) {
            const key = r.payout?.key || NO_DATE;
            const group = groups.get(key) || { label: r.payout?.label || 'No installation date', count: 0 };
            group.count += 1;
            groups.set(key, group);
        }
        return [...groups.entries()].sort(([a], [b]) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : b.localeCompare(a)));
    }, [records]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return records.filter(r => (
            (!q || [r.customer_name, r.vendor, r.phone_number, r.consumer_no].some(v => String(v || '').toLowerCase().includes(q)))
            && (statusFilter === 'All' || (statusFilter === 'Paid') === isPaid(r))
            && (!monthFilter || (r.payout?.key || NO_DATE) === monthFilter)
            && (!vendorFilter || r.vendor.toLowerCase() === vendorFilter.toLowerCase())
        ));
    }, [records, search, statusFilter, monthFilter, vendorFilter]);

    const paid = filtered.filter(isPaid);
    const unpaid = filtered.filter(r => !isPaid(r));
    const totalAmount = sum(filtered);
    const paidAmount = sum(paid);
    const pendingAmount = sum(unpaid);
    const missingQuotes = filtered.filter(r => !amount(r)).length;

    const applyLocal = (ids, changes) => {
        const set = new Set(ids);
        setInstallations(prev => prev.map(item => (set.has(item.id) ? { ...item, ...changes } : item)));
    };

    const handleStatusChange = async (record, nextStatus) => {
        if (!canEditPayment) return;
        const changes = nextStatus === 'Paid'
            ? { vendor_payment_status: 'Paid', vendor_paid_date: todayIST(), vendor_paid_by: currentUser.name || null }
            : { vendor_payment_status: 'Pending', vendor_paid_date: null, vendor_paid_by: null };
        setUpdatingId(record.id);
        try {
            // A refused update returns no error and no rows, so the row count is checked.
            const res = await runWrite(
                supabase.from('admin').update(changes).eq('id', record.id).select('id'),
                { action: 'payment status change' },
            );
            if (!res.ok) throw res.error;
            applyLocal([record.id], changes);
            await logActivity(
                currentUser?.id, 'payment',
                `${record.customer_name}: installer payment set to ${nextStatus === 'Paid' ? `Paid on ${formatDate(changes.vendor_paid_date, 'short')}` : 'Unpaid'}`,
                `Installer: ${record.vendor} | Amount: ${formatINR(record.vendor_quote, { zero: '₹0' })}`,
                record.id,
            );
        } catch (error) {
            console.error('Could not change payment status:', error);
            showAlert(`Could not change the payment status: ${error.message}`, { type: 'error' });
        } finally {
            setUpdatingId(null);
        }
    };

    const handlePayAll = async () => {
        if (!canEditPayment || !vendorFilter || unpaid.length === 0) return;
        const ok = await showConfirm(
            `Mark ${unpaid.length} unpaid ${unpaid.length === 1 ? 'installation' : 'installations'} for ${vendorFilter} as paid (${formatINR(pendingAmount, { zero: '₹0' })})?`,
            { title: 'Pay all', confirmLabel: 'Mark as paid' },
        );
        if (!ok) return;
        const ids = unpaid.map(r => r.id);
        const changes = { vendor_payment_status: 'Paid', vendor_paid_date: todayIST(), vendor_paid_by: currentUser.name || null };
        setPayingAll(true);
        try {
            const res = await runWrite(
                supabase.from('admin').update(changes).in('id', ids).select('id'),
                { action: 'bulk payment' },
            );
            if (!res.ok) throw res.error;
            // Every row must come back, or the screen would show payments the database did not record.
            if (res.rows.length !== ids.length) {
                throw new Error(`Only ${res.rows.length} of ${ids.length} payments were recorded. Reload and check before paying again.`);
            }
            applyLocal(ids, changes);
            await logActivity(
                currentUser?.id, 'payment',
                `Paid ${ids.length} installations for ${vendorFilter} (${formatINR(pendingAmount, { zero: '₹0' })})`,
                `Installer: ${vendorFilter} | Projects: ${ids.length}`,
                ids[0],
            );
        } catch (error) {
            console.error('Could not pay all:', error);
            showAlert(`Could not mark the payments as paid: ${error.message}`, { type: 'error' });
            if (/Only \d+ of/.test(error.message)) fetchInstallations();
        } finally {
            setPayingAll(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-bold text-stone-900">Installation payouts</h2>
                    <p className="mt-0.5 max-w-xl text-xs text-stone-600">
                        Installed projects and what each installer is owed. Payouts fall due on the 1st of the month after installation.
                    </p>
                </div>
                <button type="button" onClick={fetchInstallations} aria-label="Refresh" title="Refresh"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50">
                    <RefreshCw size={14} className={loading ? 'animate-spin text-orange-500' : ''} aria-hidden="true" />
                </button>
            </div>

            <ErrorBanner title="Payouts could not be loaded." onRetry={fetchInstallations}>{loadError}</ErrorBanner>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile icon={CreditCard} tone="orange" label={`Total owed (${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'})`}
                    value={formatINR(totalAmount, { zero: '₹0' })}
                    hint={missingQuotes ? `${missingQuotes} without an installer amount` : undefined} />
                <StatTile icon={CheckCircle2} tone="green" label={`Paid (${paid.length})`} value={formatINR(paidAmount, { zero: '₹0' })} />
                <StatTile icon={AlertCircle} tone="red" label={`Unpaid (${unpaid.length})`} value={formatINR(pendingAmount, { zero: '₹0' })} />
            </div>

            {vendorFilter && (
                <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-orange-500 p-2.5 text-stone-900"><Building2 size={20} aria-hidden="true" /></span>
                        <div>
                            <p className="text-sm font-bold text-stone-900">{vendorFilter}</p>
                            <p className="mt-0.5 text-xs text-stone-700">
                                {filtered.length} {filtered.length === 1 ? 'project' : 'projects'} · Paid <b className="text-emerald-700">{formatINR(paidAmount, { zero: '₹0' })}</b> · Due <b className="text-red-700">{formatINR(pendingAmount, { zero: '₹0' })}</b>
                            </p>
                        </div>
                    </div>
                    {canEditPayment && (unpaid.length > 0 ? (
                        <button type="button" disabled={payingAll} onClick={handlePayAll} className="sf-btn-success min-h-11 disabled:opacity-50">
                            {payingAll ? <Spinner size={14} /> : <Check size={14} aria-hidden="true" />}
                            {payingAll ? 'Saving…' : `Pay all (${formatINR(pendingAmount, { zero: '₹0' })})`}
                        </button>
                    ) : (
                        <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">
                            <Check size={13} aria-hidden="true" /> Everything shown is paid
                        </span>
                    ))}
                </div>
            )}

            <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-stone-100 bg-stone-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <SearchInput value={search} onChange={setSearch} className="max-w-md flex-1"
                        label="Search payouts" placeholder="Search customer, installer, phone, consumer no…" />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Select aria-label="Installer" value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
                            placeholder={`All installers (${vendors.length})`} options={vendors} className="sm:w-auto" />
                        <Select aria-label="Payout month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                            placeholder="All payout months" className="sm:w-auto"
                            options={months.map(([key, group]) => ({ value: key, label: `${group.label} (${group.count})` }))} />
                        <div className="sm:w-56">
                            <TagPicker label="Payment status" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} columns={3} />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <LoadingState label="Loading payouts…" />
                    ) : filtered.length === 0 ? (
                        <EmptyState icon={CheckCircle2} className="m-4" title="No installed projects to show">
                            {search ? `Nothing matched "${search}".` : 'Projects appear here once they are marked Installed and have an installer.'}
                        </EmptyState>
                    ) : (
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-b border-stone-100 bg-stone-50/40 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                    <th scope="col" className="px-5 py-3.5">Customer</th>
                                    <th scope="col" className="px-5 py-3.5">Installer</th>
                                    <th scope="col" className="px-5 py-3.5">Amount</th>
                                    <th scope="col" className="px-5 py-3.5">Delivery date</th>
                                    <th scope="col" className="px-5 py-3.5">Installation date</th>
                                    <th scope="col" className="px-5 py-3.5">Payout due</th>
                                    <th scope="col" className="px-5 py-3.5">Payment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => {
                                    const paidRow = isPaid(r);
                                    const tel = getTelephoneHref(r.phone_number);
                                    return (
                                        <tr key={r.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                                            <td className="px-5 py-3">
                                                <button type="button" onClick={() => onSelectCustomer?.(r)} className="text-left text-xs font-bold text-stone-900 hover:text-orange-700">
                                                    {r.customer_name || 'Unnamed customer'}
                                                </button>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-500">
                                                    {tel
                                                        ? <a href={tel} className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 hover:underline"><Phone size={10} aria-hidden="true" />{r.phone_number}</a>
                                                        : <span>{r.phone_number || '–'}</span>}
                                                    <span>· {formatKwp(r.system_capacity_kwp)}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-xs font-bold text-stone-800">{r.vendor}</td>
                                            <td className="px-5 py-3 text-xs">
                                                {amount(r) ? <span className="font-bold text-stone-900">{formatINR(r.vendor_quote)}</span> : <span className="text-stone-500">Not set</span>}
                                            </td>
                                            <td className="px-5 py-3"><DateCell value={r.material_delivery_date} /></td>
                                            <td className="px-5 py-3"><DateCell value={r.installation_date} /></td>
                                            <td className="px-5 py-3">
                                                {r.payout
                                                    ? <span className="text-xs font-bold text-stone-800">{formatDate(r.payout.due, 'short')}</span>
                                                    : <span className="text-xs text-stone-500">Needs installation date</span>}
                                            </td>
                                            <td className="px-5 py-3">
                                                {canEditPayment ? (
                                                    <div className="flex items-center gap-2">
                                                        <select aria-label={`Payment status for ${r.customer_name || 'customer'}`}
                                                            value={paidRow ? 'Paid' : 'Pending'} disabled={updatingId === r.id}
                                                            onChange={e => handleStatusChange(r, e.target.value)}
                                                            className={`min-h-11 rounded-xl border px-3 text-xs font-bold disabled:opacity-50 ${paidRow ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                            <option value="Pending">Unpaid</option>
                                                            <option value="Paid">Paid</option>
                                                        </select>
                                                        {updatingId === r.id
                                                            ? <Spinner size={12} className="text-stone-400" />
                                                            : paidRow && r.vendor_paid_date && <span className="text-[11px] text-stone-500">{formatDate(r.vendor_paid_date, 'short')}</span>}
                                                    </div>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${paidRow ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                        {paidRow ? 'Paid' : 'Unpaid'}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
