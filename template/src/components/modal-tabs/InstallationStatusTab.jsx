import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, Truck, Wrench } from 'lucide-react';
import { INSTALLATION_TAGS, STAGE_IDS, isOn, isStageEnabled, stageLabel, tagLabel } from '../../config/index.js';
import { isFinalTagValue } from '../../constants';
import { formatDate, todayIST } from '../../lib/format.js';
import { Field, Input, SectionCard, Select, TagPicker, Textarea } from '../../ui/index.js';
import { useGlobalPopup } from '../GlobalPopup';
import { CheckboxRemarkItem, fetchVendorNames } from './shared';
import useStageSave from './useStageSave';

const TAG_STYLES = {
    Pending: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10',
    'In process': 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/10',
    Installed: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10',
    Giveup: 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/10',
};
const STATUS_OPTIONS = INSTALLATION_TAGS.map(tag => ({ ...tag, activeClass: TAG_STYLES[tag.id] }));
// These statuses need an installation date; picking one fills in today.
const DATED_STATUSES = ['In process', 'Installed'];
const DETAIL_FIELDS = ['installation_status', 'installation_date', 'vendor', 'installation_note', 'vendor_note'];
const orNull = value => (value === undefined || value === '' ? null : value);

export default function InstallationStatusTab({
    customer,
    editData,
    setEditData,
    isEditable,
    isSfdcEditable = isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    handleChange,
    saving,
    setSaving,
    canDeleteDocs = false,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    onSfdcSaved,
}) {
    const baseId = useId();
    const save = useStageSave({ customer, user, onUpdate, logActivity, fetchLogs, setSaving });
    const { showConfirm } = useGlobalPopup();
    const vendorLogin = isOn('vendorLogin');
    const userType = user?.userType;
    const status = editData.installation_status || null;
    const isFinal = isFinalTagValue(customer.installation_status, INSTALLATION_TAGS);
    // A final status (Installed) locks the tag for everyone except the admin.
    const locked = isFinal && userType !== 'admin';
    const giveUpApproved = Boolean(editData.vendor_give_up_approved || customer.vendor_give_up_approved);
    const currentVendor = editData.vendor || customer.vendor || '';
    const deliveryDate = editData.material_delivery_date || customer.material_delivery_date;
    const detailsDirty = DETAIL_FIELDS.some(field => orNull(editData[field]) !== orNull(customer[field]));
    const sfdcDirty = Boolean(editData.sfdc_photo) !== Boolean(customer.sfdc_photo);
    const [vendors, setVendors] = useState([]);

    useEffect(() => {
        if (!vendorLogin) return undefined;
        let cancelled = false;
        fetchVendorNames().then(names => { if (!cancelled) setVendors(names); });
        return () => { cancelled = true; };
    }, [vendorLogin]);

    // Leaving "Given up" clears the give-up approval and the vendor's reason.
    const pickStatus = next => setEditData(prev => ({
        ...prev,
        installation_status: next,
        installation_date: DATED_STATUSES.includes(next) ? (prev.installation_date || todayIST()) : prev.installation_date,
        ...(prev.installation_status === 'Giveup' && next !== 'Giveup' ? { vendor_give_up_approved: false, vendor_note: '' } : {}),
    }));

    const saveSfdc = async () => {
        if (await save({ sfdc_photo: editData.sfdc_photo }, `Updated SFDC Photo status to ${editData.sfdc_photo ? 'Checked' : 'Unchecked'}`)) onSfdcSaved?.();
    };

    const saveDetails = () => {
        let message = `Updated Installation Status to ${status ? tagLabel(INSTALLATION_TAGS, status) : 'None'}`;
        if (status === 'Installed') message += ` (Date: ${editData.installation_date || 'N/A'}, installed by: ${editData.vendor || 'N/A'})`;
        else if (status === 'Giveup') message += ` (vendor gave up: ${editData.vendor || 'None'})`;
        if (editData.installation_note) message += ` [Note: ${editData.installation_note}]`;
        return save({
            installation_status: status,
            installation_date: editData.installation_date || null,
            vendor: editData.vendor || null,
            installation_note: editData.installation_note || null,
            vendor_note: editData.vendor_note || null,
            vendor_give_up_approved: editData.vendor_give_up_approved ?? customer.vendor_give_up_approved ?? false,
        }, message);
    };

    const approveGiveUp = () => save({
        vendor_give_up_approved: true,
        vendor_note: editData.vendor_note || null,
        installation_status: status || customer.installation_status,
    }, `Approved vendor give up request (${customer.vendor || editData.vendor})`);

    const changeVendor = async name => {
        if (!name) {
            await save({ vendor: null }, 'Removed assigned vendor');
            return;
        }
        const confirmed = await showConfirm(`Assign ${name} to this project?`, { title: 'Assign vendor', confirmLabel: 'Assign', type: 'info' });
        if (confirmed) await save({ vendor: name }, `Assigned vendor to ${name}`);
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard
                title="SFDC photo"
                icon={ClipboardList}
                actions={isSfdcEditable && sfdcDirty && (
                    <button type="button" onClick={saveSfdc} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                        Save SFDC photo
                    </button>
                )}
            >
                <CheckboxRemarkItem
                    label="SFDC photo"
                    field="sfdc_photo"
                    value={editData.sfdc_photo}
                    onChange={handleChange}
                    isEditing={isSfdcEditable}
                    documents={documents}
                    onUpload={onFileUpload}
                    onDelete={onFileDelete}
                    onPreview={onFilePreview}
                    onUpdateRemark={onUpdateRemark}
                    canDelete={canDeleteDocs}
                />
            </SectionCard>

            <SectionCard
                title={<>{stageLabel(STAGE_IDS.INSTALLATION_STATUS)}<span className="text-red-500" aria-hidden="true"> *</span></>}
                subtitle="Where the installation stands and who is doing it."
                icon={Wrench}
                actions={isEditable && detailsDirty && (
                    <button type="button" onClick={saveDetails} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save details'}
                    </button>
                )}
            >
                {userType === 'office2' && (
                    <p role="note" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-900">
                        Installation details are managed by your partner office. You can update the SFDC photo only.
                    </p>
                )}

                {isStageEnabled(STAGE_IDS.MATERIAL_DELIVERY) && (
                    <div className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-stone-50 p-3.5">
                        <span className="rounded-xl bg-amber-100 p-2 text-amber-700"><Truck size={16} aria-hidden="true" /></span>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Delivery date (from {stageLabel(STAGE_IDS.MATERIAL_DELIVERY)})</p>
                            <p className="text-xs font-bold text-stone-800">{formatDate(deliveryDate, 'short') || 'Not set yet'}</p>
                        </div>
                    </div>
                )}

                {isFinal && (
                    <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-600" aria-hidden="true" />
                        Installation {tagLabel(INSTALLATION_TAGS, customer.installation_status).toLowerCase()}. Only the admin can change this status.
                    </p>
                )}
                <TagPicker
                    label="Installation status"
                    options={STATUS_OPTIONS}
                    columns={4}
                    value={status}
                    allowDeselect
                    locked={locked}
                    disabled={!isEditable}
                    onChange={pickStatus}
                />

                {vendorLogin && status === 'Giveup' && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" aria-hidden="true" />
                                    <div>
                                        <h4 className="text-xs font-bold text-rose-900">Vendor gave up this job</h4>
                                        <p className="text-[11px] font-medium text-rose-700">
                                            <b>{customer.vendor || editData.vendor || 'The assigned vendor'}</b> asked to give up this installation.
                                        </p>
                                    </div>
                                </div>
                                <span className={`shrink-0 rounded-xl border px-2.5 py-1 text-[11px] font-bold ${giveUpApproved ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-rose-200 bg-rose-100 text-rose-700'}`}>
                                    {giveUpApproved ? 'Approved' : 'Waiting for approval'}
                                </span>
                            </div>

                            {isEditable && !giveUpApproved ? (
                                <Field label="Vendor's reason" htmlFor={`${baseId}-reason`}>
                                    <Textarea
                                        id={`${baseId}-reason`}
                                        rows={2}
                                        value={editData.vendor_note || ''}
                                        onChange={event => setEditData(prev => ({ ...prev, vendor_note: event.target.value }))}
                                        placeholder="Why the vendor gave up"
                                    />
                                </Field>
                            ) : (
                                <p className="rounded-xl border border-rose-200/70 bg-white p-3 text-xs font-semibold italic text-rose-900">
                                    {editData.vendor_note || customer.vendor_note || 'No reason given'}
                                </p>
                            )}

                            {isEditable && (giveUpApproved ? (
                                <p className="flex items-center gap-1 text-xs font-bold text-emerald-800">
                                    <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" /> Give up approved. Assign a new vendor below.
                                </p>
                            ) : (
                                <div className="flex justify-end">
                                    <button
                                        type="button" onClick={approveGiveUp} disabled={saving}
                                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                                    >
                                        <CheckCircle2 size={14} aria-hidden="true" /> Approve give up
                                    </button>
                                </div>
                            ))}
                        </div>

                        {giveUpApproved && (
                            <Field label={<span className="inline-flex items-center gap-1.5"><Building2 size={13} className="text-amber-500" aria-hidden="true" /> Assign a new vendor</span>} htmlFor={`${baseId}-vendor`}>
                                <Select
                                    id={`${baseId}-vendor`}
                                    options={vendors}
                                    placeholder="Select a vendor…"
                                    value={editData.vendor || ''}
                                    disabled={!isEditable || saving}
                                    onChange={event => changeVendor(event.target.value)}
                                />
                            </Field>
                        )}
                    </div>
                )}

                {DATED_STATUSES.includes(status) && (
                    <div className="grid grid-cols-1 gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2">
                        <Field label="Installation date" htmlFor={`${baseId}-date`}>
                            <Input
                                id={`${baseId}-date`}
                                type="date"
                                disabled={!isEditable}
                                value={editData.installation_date || ''}
                                onChange={event => setEditData(prev => ({ ...prev, installation_date: event.target.value }))}
                            />
                        </Field>
                        <div className="space-y-1.5">
                            <p className="text-xs font-bold text-stone-700">Installed by</p>
                            <p className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 text-sm font-semibold text-stone-800">
                                <Building2 size={14} className="shrink-0 text-amber-600" aria-hidden="true" />
                                {currentVendor || 'No vendor assigned yet'}
                            </p>
                        </div>
                    </div>
                )}

                <Field label="Installation note" htmlFor={`${baseId}-note`} className="border-t border-stone-100 pt-3">
                    <Textarea
                        id={`${baseId}-note`}
                        rows={2}
                        disabled={!isEditable}
                        value={editData.installation_note || ''}
                        onChange={event => setEditData(prev => ({ ...prev, installation_note: event.target.value }))}
                        placeholder="Notes about the installation work"
                    />
                </Field>
            </SectionCard>
        </div>
    );
}
