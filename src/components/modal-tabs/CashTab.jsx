import React from 'react';
import { Banknote, Save } from 'lucide-react';
import { toIndianCommas, parseIndianNumber, formatINR } from '../../utils';
import { SectionHeader } from './shared';

export default function CashTab({
    customer,
    editData,
    setEditData,
    isEditable,
    editingSection,
    setEditingSection,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    saving,
    setSaving
}) {
    const defaultPaymentNames = ['1st Payment', '2nd Payment', '3rd Payment'];
    const rawCashDetails = editData.cash_details || { total_amount: 0, payments: [] };
    const rawPayments = Array.isArray(rawCashDetails.payments) ? rawCashDetails.payments : [];

    const cashDetails = {
        total_amount: rawCashDetails.total_amount || 0,
        payments: [0, 1, 2].map(i => ({
            name: defaultPaymentNames[i],
            amount: rawPayments[i]?.amount || 0,
            type: rawPayments[i]?.type || 'Cash',
            date: rawPayments[i]?.date || '',
            transaction_id: rawPayments[i]?.transaction_id || ''
        }))
    };

    const handleCashFieldChange = (field, val) => {
        const updatedDetails = {
            ...cashDetails,
            [field]: val
        };
        setEditData(prev => ({ ...prev, cash_details: updatedDetails }));
    };

    const handleCashPaymentChange = (idx, field, val) => {
        const newPayments = cashDetails.payments.map((p, i) => 
            i === idx ? { ...p, [field]: val } : p
        );
        const updatedDetails = {
            ...cashDetails,
            payments: newPayments
        };
        setEditData(prev => ({ ...prev, cash_details: updatedDetails }));
    };

    const totalReceived = cashDetails.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const leftToReceive = (Number(cashDetails.total_amount) || 0) - totalReceived;

    const isCashDetailsDirty = JSON.stringify(editData.cash_details) !== JSON.stringify(customer.cash_details);
    const isSectionEditing = editingSection === 'cash_details';
    const canEdit = isEditable && isSectionEditing;

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {editData.payment_type?.trim().toLowerCase() !== 'cash' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-xs font-semibold text-amber-700">
                    This customer's payment type is "{editData.payment_type || 'not specified'}" (not Cash). Cash tracking is not applicable.
                </div>
            ) : (
                <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                    <div className="border-b border-stone-100 pb-3">
                        <SectionHeader
                            title="Cash Payment Tracker"
                            id="cash_details"
                            icon={Banknote}
                            isEditable={isEditable}
                            editingSection={editingSection}
                            setEditingSection={setEditingSection}
                        />
                        <p className="text-xs text-stone-500 font-medium mt-1">Manage deal valuation, payment modes, and balance reconciliation.</p>
                    </div>

                    {/* Total Deal Amount input */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Total Deal Amount (₹)</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                placeholder="Total Amount"
                                value={cashDetails.total_amount ? toIndianCommas(cashDetails.total_amount) : ''}
                                onChange={(e) => handleCashFieldChange('total_amount', parseIndianNumber(e.target.value))}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                            />
                        </div>
                    </div>

                    {/* Payments Cards (1st, 2nd, 3rd Payment) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        {cashDetails.payments.map((p, idx) => (
                            <div key={idx} className="bg-stone-50 p-4 rounded-2xl border border-stone-155 space-y-3">
                                <div className="flex justify-between items-center border-b border-stone-200 pb-1.5">
                                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">{p.name || `Payment ${idx + 1}`}</span>
                                </div>

                                <div className="space-y-2">
                                    <div>
                                        <label className="text-[8px] font-bold text-stone-400 uppercase block mb-0.5">Amount (₹)</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            disabled={!canEdit}
                                            placeholder="0"
                                            value={p.amount ? toIndianCommas(p.amount) : ''}
                                            onChange={(e) => handleCashPaymentChange(idx, 'amount', parseIndianNumber(e.target.value))}
                                            className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[8px] font-bold text-stone-400 uppercase block mb-0.5">Payment Type</label>
                                        <select
                                            disabled={!canEdit}
                                            value={p.type || 'Cash'}
                                            onChange={(e) => handleCashPaymentChange(idx, 'type', e.target.value)}
                                            className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100"
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="Online">Online</option>
                                            <option value="DD">DD</option>
                                            <option value="Cheque">Cheque</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-[8px] font-bold text-stone-400 uppercase block mb-0.5">Date</label>
                                        <input
                                            type="date"
                                            disabled={!canEdit}
                                            value={p.date || ''}
                                            onChange={(e) => handleCashPaymentChange(idx, 'date', e.target.value)}
                                            className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[8px] font-bold text-stone-400 uppercase block mb-0.5">Transaction ID</label>
                                        <input
                                            type="text"
                                            disabled={!canEdit}
                                            placeholder="Txn ID / Ref"
                                            value={p.transaction_id || ''}
                                            onChange={(e) => handleCashPaymentChange(idx, 'transaction_id', e.target.value)}
                                            className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-medium text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Reconciliation Card */}
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                        <div className="flex flex-col sm:flex-row gap-6">
                            <div>
                                <p className="text-[9px] font-bold text-emerald-800 uppercase tracking-wide">Total Received</p>
                                <p className="text-base font-bold text-emerald-800">{formatINR(totalReceived)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-stone-500 uppercase tracking-wide">Left to Receive</p>
                                <p className={`text-base font-bold ${leftToReceive <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {formatINR(Math.max(0, leftToReceive))}
                                </p>
                            </div>
                        </div>

                        {canEdit && isCashDetailsDirty && (
                            <button
                                type="button"
                                onClick={async () => {
                                    setSaving(true);
                                    // A failed save must stop here - otherwise the activity log below
                                    // records a change that never reached the database.
                                    if (await onUpdate(customer.id, { cash_details: cashDetails }) === false) { setSaving(false); return; }
                                    await logActivity(user.id, 'update', `${customer.customer_name}: Updated Cash Payment ledger details`, '', customer.id);
                                    setSaving(false);
                                    fetchLogs();
                                }}
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/10 transition disabled:bg-stone-300 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
                            >
                                <Save className="w-4 h-4" /> Save Payments
                            </button>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}
