import { User, ClipboardList, Edit3, X } from 'lucide-react';
import { EditableDetailItem, CheckboxRemarkItem } from './shared';
import { useGlobalPopup } from '../GlobalPopup';
import { calculateSystemCapacityKwp } from '../../utils/capacity';
import { DOC_TYPE_LABELS } from '../../constants';
import { documentMode, dropdownOptions, isOn } from '../../config/index.js';
import { Field, SectionCard, Select } from '../../ui/index.js';

// Lead documents; the identity and property papers are not collected from cash customers.
const LEAD_DOCUMENTS = [
    { field: 'adhaar_card_front', label: 'Aadhar Card Front', skipForCash: true },
    { field: 'adhaar_card_back', label: 'Aadhar Card Back', skipForCash: true },
    { field: 'pan_card', label: 'PAN Card', skipForCash: true },
    { field: 'index_2', label: DOC_TYPE_LABELS.index_2, skipForCash: true },
    { field: 'house_geo_tag_photo', label: 'House Geo Tag Photo', skipForCash: true },
    { field: 'light_bill', label: 'Light Bill' },
    { field: 'bank_details', label: 'Bank Details' },
    { field: 'extra_docs', label: 'Extra Documents' },
];

// Only the payment routes this client tracks (Loan and Cash stages).
const PAYMENT_TYPES = [['Loan', 'loanTracking'], ['Cash', 'cashPayments']];
const enabledPaymentTypes = PAYMENT_TYPES.filter(([, feature]) => isOn(feature)).map(([label]) => label);
const PAYMENT_TYPE_OPTIONS = enabledPaymentTypes.length ? enabledPaymentTypes : PAYMENT_TYPES.map(([label]) => label);

const showPartnerField = isOn('channelPartners') || isOn('cpos');
const showDealerField = isOn('dealers');

export default function LeadsTab({
    editData,
    handleChange,
    editingSection,
    setEditingSection,
    channel_partners,
    subAgents = [],
    isAdmin,
    user,
    meta,
    isEditable,
    isRegChecklistDirty,
    handleSaveRegChecklist,
    documents = [],
    onFileUpload,
    onUpload,
    onViewDocument,
    onFilePreview,
    onPreview,
    onDeleteDocument,
    onFileDelete,
    onDelete,
    onUpdateRemark,
}) {
    const { showAlert } = useGlobalPopup();

    const autoCalcCapacity = () => {
        const kwp = calculateSystemCapacityKwp(editData.module_wp, editData.no_of_modules);
        if (kwp == null) {
            showAlert('Enter Module Wp and No of Modules first.', { title: 'Cannot calculate', type: 'warning' });
            return;
        }
        handleChange('system_capacity_kwp', String(kwp));
    };

    const filesOn = documentMode() !== 'checklist';
    const handlePreview = onPreview || onFilePreview || onViewDocument;
    const handleDelete = onDelete || onFileDelete || onDeleteDocument;
    const handleUpload = onUpload || onFileUpload;
    const canDeleteDocs = user?.userType === 'admin' || user?.userType === 'sales';
    // Agent 2 records always belong to that agent, so the field is filled from
    // their account and locked rather than being an optional free choice.
    const isAgent2 = user?.userType === 'agent2';
    const isChannelPartnerManager = user?.userType === 'office2';
    const managerCpoName = (user?.channel_partner || user?.name || '').trim();
    const isEditingInfo = editingSection === 'cus';
    const paymentType = String(editData.payment_type || '').trim().toLowerCase();

    const toggleInfoEditing = () => {
        setEditingSection?.(isEditingInfo ? null : 'cus');
        if (!isEditingInfo) {
            setTimeout(() => document.getElementById('section-cus')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <SectionCard
                id="section-cus"
                title="Customer Info"
                icon={User}
                actions={isEditable && (
                    <button
                        type="button"
                        onClick={toggleInfoEditing}
                        aria-pressed={isEditingInfo}
                        aria-label={isEditingInfo ? 'Stop editing customer info' : 'Edit customer info'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
                    >
                        {isEditingInfo ? <X size={16} aria-hidden="true" /> : <Edit3 size={15} aria-hidden="true" />}
                    </button>
                )}
            >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <EditableDetailItem label="Customer Name *" field="customer_name" value={editData.customer_name} onChange={handleChange} isEditing={isEditingInfo} />
                    <EditableDetailItem label="Phone Number *" field="phone_number" value={editData.phone_number} onChange={handleChange} type="number" isEditing={isEditingInfo} />
                    <EditableDetailItem label="Email Address" field="email_address" value={editData.email_address} onChange={handleChange} isEditing={isEditingInfo} />
                    <EditableDetailItem label="Consumer No" field="consumer_no" value={editData.consumer_no} onChange={handleChange} type="number" isEditing={isEditingInfo} />
                    <EditableDetailItem label="Villages" field="villages" value={editData.villages} onChange={handleChange} isEditing={isEditingInfo} />
                    <div className="col-span-2 md:col-span-3">
                        <EditableDetailItem label="Full Address" field="full_address" value={editData.full_address} onChange={handleChange} type="textarea" isEditing={isEditingInfo} />
                    </div>
                    <EditableDetailItem label="Pincode" field="pincode" value={editData.pincode} onChange={(field, value) => handleChange(field, String(value || '').replace(/\D/g, '').slice(0, 6))} isEditing={isEditingInfo} />
                    <EditableDetailItem label="Tehsil / Sub Division" field="sub_divisions" value={editData.sub_divisions} onChange={handleChange} isEditing={isEditingInfo} />
                    <EditableDetailItem label="District" field="district" value={editData.district} onChange={handleChange} isEditing={isEditingInfo} />
                    {paymentType === 'loan' && (
                        <>
                            <EditableDetailItem label="Bank Name" field="bank_name" value={editData.bank_name} onChange={handleChange} isEditing={isEditingInfo} />
                            <EditableDetailItem label="Bank Branch" field="bank_branch" value={editData.bank_branch} onChange={handleChange} isEditing={isEditingInfo} />
                        </>
                    )}
                    <EditableDetailItem label="Google Drive Link" field="google_drive_link" value={editData.google_drive_link} onChange={handleChange} isEditing={isEditingInfo} />
                    <EditableDetailItem label="Site Location Link" field="location_link" value={editData.location_link} onChange={handleChange} isEditing={isEditingInfo} />
                    {showPartnerField && (
                        <EditableDetailItem
                            label="Channel Partner Name"
                            field="channel_partner"
                            value={isChannelPartnerManager ? managerCpoName : editData.channel_partner}
                            onChange={handleChange}
                            /* Admin only. channel_partner IS the branch scope in RLS,
                               so a CPO editing this free-text field could hand the
                               record to another branch - losing it from their own
                               view - or trip the policy's WITH CHECK and fail the
                               entire record save, not just this field. */
                            isEditing={isAdmin && isEditingInfo}
                            channel_partners={channel_partners}
                            isAdmin={isAdmin}
                        />
                    )}
                    {showDealerField && (
                        <EditableDetailItem
                            label={isAgent2 ? 'Dealer Name *' : 'Dealer Name (optional)'}
                            field="sub_channel_partner"
                            value={isAgent2 ? (editData.sub_channel_partner || user?.name || '') : editData.sub_channel_partner}
                            onChange={handleChange}
                            isEditing={!isAgent2 && isEditingInfo}
                            options={subAgents}
                        />
                    )}
                    <EditableDetailItem label="MODULE BRAND" field="module_brand" value={editData.module_brand} onChange={handleChange} options={dropdownOptions('module_brand', meta)} category="module_brand" isEditing={isEditingInfo} />
                    <EditableDetailItem label="MODULE WP" field="module_wp" value={editData.module_wp} onChange={handleChange} options={dropdownOptions('module_wp', meta)} category="module_wp" isEditing={isEditingInfo} />
                    <EditableDetailItem label="No of Modules" field="no_of_modules" value={editData.no_of_modules} onChange={handleChange} type="number" isEditing={isEditingInfo} />
                    <EditableDetailItem label="System Capacity (kWp)" field="system_capacity_kwp" value={editData.system_capacity_kwp} onChange={handleChange} isEditing={isEditingInfo} onAutoCalc={autoCalcCapacity} />
                    {editData.created_at && (
                        <div className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 flex flex-col justify-center">
                            <span className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">Lead Generated (IST)</span>
                            <span className="text-xs font-semibold text-stone-800">
                                {new Date(editData.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        </div>
                    )}
                </div>
            </SectionCard>

            <SectionCard id="section-reg_checklist" title="Document Checklist" icon={ClipboardList}>
                <div className="pb-3 border-b border-stone-100">
                    {isEditable ? (
                        <Field label="Payment Type" htmlFor="lead-payment-type" className="md:w-1/3">
                            <Select
                                id="lead-payment-type"
                                options={PAYMENT_TYPE_OPTIONS}
                                placeholder="Select payment type…"
                                value={editData.payment_type}
                                onChange={e => handleChange('payment_type', e.target.value)}
                            />
                        </Field>
                    ) : (
                        <Field label="Payment Type">
                            <p className="text-sm font-bold text-stone-700">{editData.payment_type || 'Not Specified'}</p>
                        </Field>
                    )}
                </div>

                {editData.payment_type ? (
                    <div className="flex flex-col gap-2">
                        {LEAD_DOCUMENTS.filter(doc => !(doc.skipForCash && paymentType === 'cash')).map(doc => (
                            <CheckboxRemarkItem
                                key={doc.field}
                                label={doc.label}
                                field={doc.field}
                                value={editData[doc.field]}
                                onChange={handleChange}
                                isEditing={isEditable}
                                documents={documents}
                                onUpload={filesOn ? handleUpload : undefined}
                                onDelete={filesOn ? handleDelete : undefined}
                                onPreview={handlePreview}
                                onUpdateRemark={onUpdateRemark}
                                canDelete={canDeleteDocs}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-stone-500 italic">Select a payment type above to see the document checklist.</p>
                )}

                {isEditable && isRegChecklistDirty && (
                    <div className="pt-3 border-t border-stone-100 flex justify-end">
                        <button
                            type="button"
                            onClick={handleSaveRegChecklist}
                            className="sf-btn-success min-h-11"
                        >
                            Save Checklist
                        </button>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
