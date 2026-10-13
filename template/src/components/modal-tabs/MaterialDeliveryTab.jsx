import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Building2, CalendarDays, IndianRupee, Printer, Truck } from 'lucide-react';
import { supabase } from '../../supabase';
import { STAGE_IDS, isOn, stageLabel } from '../../config/index.js';
import { formatDate, todayIST } from '../../lib/format.js';
import { LazyBoundary, lazyWithRetry } from '../../lib/lazy.js';
import { Field, FieldList, FieldRenderer, SectionCard, Select } from '../../ui/index.js';
import { useGlobalPopup } from '../GlobalPopup';
import { EditableDetailItem, EditToggle, fetchVendorNames } from './shared';
import useStageSave from './useStageSave';

const DeliveryNoteModal = lazyWithRetry(() => import('./DeliveryNoteModal.jsx'));
const VendorScheduleModal = lazyWithRetry(() => import('./VendorScheduleModal.jsx'));

const SECTION_ID = 'equip_details';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_OPTIONS = [
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_TRANSIT', label: 'In transit' },
    { value: 'DELIVERED', label: 'Delivered' },
];
const STATUS_STYLES = {
    DELIVERED: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    IN_TRANSIT: 'border-amber-300 bg-amber-100 text-amber-800',
    PENDING: 'border-stone-300 bg-stone-100 text-stone-600',
};
const DETAIL_FIELDS = [
    { field: 'invoice_no', label: 'Invoice no' },
    { field: 'material_delivery_date', label: 'Delivery date *', type: 'date' },
    { field: 'vehicle_number', label: 'Vehicle / truck no' },
    { field: 'driver_name', label: 'Driver name' },
    { field: 'driver_phone_number', label: 'Driver phone' },
];
const QUOTE_FIELD = { key: 'vendor_quote', label: 'Commission / vendor quote', type: 'money' };
const PAYMENT_FIELDS = [QUOTE_FIELD, { key: 'vendor_payment_status', label: 'Vendor payment' }];
// Only head office may change the delivery status, vendor quote and vendor
// payment; the database refuses anyone else (the installer sets the status
// from their own portal).
const HEAD_OFFICE = new Set(['admin', 'sales']);

const paidText = record => (record.vendor_paid_date
    ? `Paid on ${formatDate(record.vendor_paid_date, 'short')}${record.vendor_paid_by ? ` by ${record.vendor_paid_by}` : ''}`
    : undefined);

// The "unavailable" calendar entry that covers `day` for this vendor, if any.
async function findVendorUnavailability(vendorName, day) {
    const { data, error } = await supabase.from('calendar_events')
        .select('title, notes, starts_on, ends_on')
        .eq('kind', 'unavailable')
        .eq('vendor_name', vendorName)
        .lte('starts_on', day)
        .or(`ends_on.gte.${day},and(ends_on.is.null,starts_on.eq.${day})`)
        .order('starts_on')
        .limit(1);
    if (error) {
        console.warn('Could not check the vendor calendar:', error.message);
        return null;
    }
    return data?.[0] || null;
}

export default function MaterialDeliveryTab({
    customer,
    editData,
    setEditData,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    handleChange,
    saving,
    setSaving,
    editingSection,
    setEditingSection,
}) {
    const baseId = useId();
    const save = useStageSave({ customer, user, onUpdate, logActivity, fetchLogs, setSaving });
    const { showConfirm } = useGlobalPopup();
    const isHeadOffice = HEAD_OFFICE.has(user?.userType);
    const batchesOn = isOn('deliveryBatches');
    const calendarOn = isOn('calendar');
    const commissionOn = isOn('installationCommission') || isOn('vendorCommission');
    // With truck deliveries on, the delivery details are entered there, which
    // also keeps delivery_batches.project_ids in step; only head office may
    // override them here.
    const canEditDelivery = isEditable && (!batchesOn || isHeadOffice);
    const canEditHeadOfficeFields = isEditable && isHeadOffice;
    const editing = editingSection === SECTION_ID;

    const [vendors, setVendors] = useState([]);
    const [statusOverride, setStatusOverride] = useState(null);
    const [openModal, setOpenModal] = useState(null);      // 'note' | 'schedule' | null
    const [clash, setClash] = useState({ key: '', entry: null });

    const vendor = editData.vendor || '';
    const deliveryDay = String(editData.material_delivery_date || '').slice(0, 10);
    const clashKey = calendarOn && vendor && DAY.test(deliveryDay) ? `${vendor}|${deliveryDay}` : '';
    const unavailable = clashKey && clash.key === clashKey ? clash.entry : null;
    const deliveryStatus = statusOverride
        || (editData.delivery_status === 'DELIVERED' ? 'DELIVERED' : editData.delivery_batch_id ? 'IN_TRANSIT' : (editData.delivery_status || 'PENDING'));

    useEffect(() => {
        // Cached in shared.jsx; the list rarely changes between opens.
        let cancelled = false;
        fetchVendorNames().then(names => { if (!cancelled) setVendors(names); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!clashKey) return undefined;
        let cancelled = false;
        const [name, day] = clashKey.split('|');
        findVendorUnavailability(name, day).then(entry => { if (!cancelled) setClash({ key: clashKey, entry }); });
        return () => { cancelled = true; };
    }, [clashKey]);

    const changeVendor = async name => {
        if (!name) {
            await save({ vendor: null }, 'Removed assigned vendor');
            return;
        }
        const confirmed = await showConfirm(`Assign ${name} to this project?`, { title: 'Assign vendor', confirmLabel: 'Assign', type: 'info' });
        if (confirmed) await save({ vendor: name }, `Assigned vendor to ${name}`);
    };

    // Shown straight away; put back if the save fails.
    const changeStatus = async next => {
        const previous = deliveryStatus;
        setStatusOverride(next);
        let saved = false;
        try {
            saved = await save({ delivery_status: next }, `Delivery status set to ${STATUS_OPTIONS.find(option => option.value === next)?.label || next}`);
        } catch (error) {
            console.error('Delivery status was not saved:', error);
        }
        if (!saved) setStatusOverride(previous);
    };

    const setPaymentStatus = value => {
        const paid = value === 'Paid';
        // Same as the installation payments page: the paid date and who marked
        // it are set together, and both are cleared when it goes back to unpaid.
        setEditData(prev => ({
            ...prev,
            vendor_payment_status: paid ? 'Paid' : 'Pending',
            vendor_paid_date: paid ? todayIST() : null,
            vendor_paid_by: paid ? (user?.name || 'Admin') : null,
        }));
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard
                id="section-pick_vendor"
                title={<>Vendor<span className="text-red-500" aria-hidden="true"> *</span></>}
                subtitle="Who will deliver and install for this customer."
                icon={Building2}
                actions={calendarOn && (
                    <button type="button" onClick={() => setOpenModal('schedule')} className="sf-btn-secondary min-h-11">
                        <CalendarDays size={14} aria-hidden="true" /> Vendor schedule
                    </button>
                )}
            >
                <Field label="Assigned vendor" htmlFor={`${baseId}-vendor`}>
                    <Select
                        id={`${baseId}-vendor`}
                        options={vendors}
                        placeholder="Select a vendor…"
                        value={vendor}
                        disabled={!isEditable || saving}
                        onChange={event => changeVendor(event.target.value)}
                    />
                </Field>
                {unavailable && (
                    <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" aria-hidden="true" />
                        <span>
                            <strong>{vendor}</strong> is marked unavailable on <strong>{formatDate(deliveryDay, 'short')}</strong>
                            {unavailable.notes || unavailable.title ? ` (${unavailable.notes || unavailable.title})` : ''}.
                            Check with the vendor or change the delivery date.
                        </span>
                    </p>
                )}
            </SectionCard>

            <SectionCard
                id={`section-${SECTION_ID}`}
                title={`${stageLabel(STAGE_IDS.MATERIAL_DELIVERY)} details`}
                icon={Truck}
                actions={(
                    <>
                        {batchesOn && (canEditHeadOfficeFields ? (
                            <select
                                aria-label="Delivery status"
                                disabled={saving}
                                value={deliveryStatus}
                                onChange={event => changeStatus(event.target.value)}
                                className={`min-h-11 rounded-xl border px-2.5 text-xs font-bold disabled:cursor-not-allowed ${STATUS_STYLES[deliveryStatus] || STATUS_STYLES.PENDING}`}
                            >
                                {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        ) : (
                            <span className={`inline-flex min-h-11 items-center rounded-xl border px-2.5 text-xs font-bold ${STATUS_STYLES[deliveryStatus] || STATUS_STYLES.PENDING}`}>
                                <span className="sr-only">Delivery status: </span>
                                {STATUS_OPTIONS.find(option => option.value === deliveryStatus)?.label || deliveryStatus}
                            </span>
                        ))}
                        {canEditDelivery && <EditToggle id={SECTION_ID} label="delivery details" editingSection={editingSection} setEditingSection={setEditingSection} />}
                    </>
                )}
            >
                {batchesOn && !isHeadOffice && (
                    <p className="text-[11px] font-medium text-stone-500">Delivery details are filled in from Truck deliveries.</p>
                )}

                {commissionOn && (canEditHeadOfficeFields ? (
                    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-100 bg-stone-50/60 p-3 sm:grid-cols-2">
                        <FieldRenderer
                            id={`${baseId}-quote`}
                            field={QUOTE_FIELD}
                            value={editData.vendor_quote}
                            onChange={value => setEditData(prev => ({ ...prev, vendor_quote: value }))}
                        />
                        <Field
                            label={<span className="inline-flex items-center gap-1"><IndianRupee size={12} aria-hidden="true" /> Vendor payment</span>}
                            htmlFor={`${baseId}-paid`}
                            hint={paidText(editData)}
                        >
                            <Select
                                id={`${baseId}-paid`}
                                options={[{ value: 'Pending', label: 'Unpaid' }, { value: 'Paid', label: 'Paid' }]}
                                value={editData.vendor_payment_status === 'Paid' ? 'Paid' : 'Pending'}
                                onChange={event => setPaymentStatus(event.target.value)}
                            />
                        </Field>
                    </div>
                ) : (
                    <FieldList
                        fields={PAYMENT_FIELDS}
                        record={editData}
                        getValue={(record, field) => (field.key === 'vendor_quote'
                            ? record.vendor_quote
                            : record.vendor_payment_status === 'Paid' ? (paidText(record) || 'Paid') : 'Unpaid')}
                    />
                ))}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                    {DETAIL_FIELDS.map(({ field, label, type }) => (
                        <EditableDetailItem
                            key={field}
                            label={label}
                            field={field}
                            type={type}
                            value={editData[field]}
                            onChange={handleChange}
                            isEditing={editing && canEditDelivery}
                        />
                    ))}
                </div>

                {batchesOn && (
                    <div className="flex justify-end">
                        <button type="button" onClick={() => setOpenModal('note')} className="sf-btn-secondary min-h-11">
                            <Printer size={14} aria-hidden="true" /> Print delivery note
                        </button>
                    </div>
                )}
            </SectionCard>

            {openModal && (
                <LazyBoundary>
                    {openModal === 'note' && <DeliveryNoteModal record={{ ...customer, ...editData }} user={user} onClose={() => setOpenModal(null)} />}
                    {openModal === 'schedule' && <VendorScheduleModal vendorName={vendor} deliveryDate={deliveryDay} onClose={() => setOpenModal(null)} />}
                </LazyBoundary>
            )}
        </div>
    );
}
