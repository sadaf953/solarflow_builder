import { Banknote, Edit3, Save, X } from 'lucide-react';
import { dropdownOptions } from '../../config/index.js';
import { formatINR } from '../../lib/format.js';
import { FieldRenderer, SectionCard } from '../../ui/index.js';
import useStageSave from './useStageSave';

const PAYMENT_NAMES = ['1st Payment', '2nd Payment', '3rd Payment'];

export default function CashTab(props) {
    const { customer, editData, setEditData, isEditable, editingSection, setEditingSection, meta, saving } = props;
    const save = useStageSave(props);
    const paymentModes = dropdownOptions('payment_method_modes', meta);
    const rawCashDetails = editData.cash_details || { total_amount: 0, payments: [] };
    const rawPayments = Array.isArray(rawCashDetails.payments) ? rawCashDetails.payments : [];

    const cashDetails = {
        total_amount: rawCashDetails.total_amount || 0,
        payments: PAYMENT_NAMES.map((name, i) => ({
            name,
            amount: rawPayments[i]?.amount || 0,
            type: rawPayments[i]?.type || paymentModes[0] || '',
            date: rawPayments[i]?.date || '',
            transaction_id: rawPayments[i]?.transaction_id || ''
        }))
    };

    const handleCashFieldChange = (field, val) => {
        setEditData(prev => ({ ...prev, cash_details: { ...cashDetails, [field]: val } }));
    };

    const handleCashPaymentChange = (idx, field, val) => {
        const payments = cashDetails.payments.map((p, i) => (i === idx ? { ...p, [field]: val } : p));
        setEditData(prev => ({ ...prev, cash_details: { ...cashDetails, payments } }));
    };

    const totalReceived = cashDetails.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const leftToReceive = (Number(cashDetails.total_amount) || 0) - totalReceived;

    const isCashDetailsDirty = JSON.stringify(editData.cash_details) !== JSON.stringify(customer.cash_details);
    const isSectionEditing = editingSection === 'cash_details';
    const canEdit = isEditable && isSectionEditing;

    const toggleEditing = () => {
        setEditingSection?.(isSectionEditing ? null : 'cash_details');
        if (!isSectionEditing) {
            setTimeout(() => document.getElementById('section-cash_details')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }
    };

    if (editData.payment_type?.trim().toLowerCase() !== 'cash') {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-xs font-semibold text-amber-700 animate-in fade-in duration-300">
                This customer's payment type is "{editData.payment_type || 'not specified'}" (not Cash). Cash tracking is not applicable.
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard
                id="section-cash_details"
                title="Cash Payment Tracker"
                subtitle="Manage deal valuation, payment modes, and balance reconciliation."
                icon={Banknote}
                tone="green"
                actions={isEditable && (
                    <button
                        type="button"
                        onClick={toggleEditing}
                        aria-pressed={isSectionEditing}
                        aria-label={isSectionEditing ? 'Stop editing cash payments' : 'Edit cash payments'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
                    >
                        {isSectionEditing ? <X size={16} aria-hidden="true" /> : <Edit3 size={15} aria-hidden="true" />}
                    </button>
                )}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FieldRenderer
                        field={{ key: 'total_amount', label: 'Total Deal Amount (₹)', type: 'money' }}
                        value={cashDetails.total_amount || null}
                        onChange={value => handleCashFieldChange('total_amount', value ?? 0)}
                        disabled={!canEdit}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {cashDetails.payments.map((p, idx) => (
                        <div key={p.name} className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wide border-b border-stone-200 pb-1.5">{p.name}</p>
                            <FieldRenderer
                                field={{ key: `amount_${idx}`, label: 'Amount (₹)', type: 'money' }}
                                value={p.amount || null}
                                onChange={value => handleCashPaymentChange(idx, 'amount', value ?? 0)}
                                disabled={!canEdit}
                            />
                            <FieldRenderer
                                field={{ key: `type_${idx}`, label: 'Payment Type', type: 'select', options: paymentModes }}
                                value={p.type}
                                onChange={value => handleCashPaymentChange(idx, 'type', value ?? '')}
                                disabled={!canEdit}
                            />
                            <FieldRenderer
                                field={{ key: `date_${idx}`, label: 'Date', type: 'date' }}
                                value={p.date}
                                onChange={value => handleCashPaymentChange(idx, 'date', value ?? '')}
                                disabled={!canEdit}
                            />
                            <FieldRenderer
                                field={{ key: `transaction_${idx}`, label: 'Transaction ID', type: 'text' }}
                                value={p.transaction_id}
                                onChange={value => handleCashPaymentChange(idx, 'transaction_id', value ?? '')}
                                disabled={!canEdit}
                            />
                        </div>
                    ))}
                </div>

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
                            onClick={() => save({ cash_details: cashDetails }, 'Updated Cash Payment ledger details')}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 min-h-11 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/10 transition disabled:bg-stone-300 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
                        >
                            <Save className="w-4 h-4" aria-hidden="true" /> Save Payments
                        </button>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}
