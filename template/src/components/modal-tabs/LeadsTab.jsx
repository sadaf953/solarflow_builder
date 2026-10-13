import React from 'react';
import { User, ClipboardList, Edit3, X } from 'lucide-react';
import { SectionHeader, EditableDetailItem, CheckboxRemarkItem, ChecklistModeToggle } from './shared';
import { useGlobalPopup } from '../GlobalPopup';
import { calculateSystemCapacityKwp } from '../../utils/capacity';

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
    uploading,
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

    const handlePreview = onPreview || onFilePreview || onViewDocument;
    const handleDelete = onDelete || onFileDelete || onDeleteDocument;
    const handleUpload = onUpload || onFileUpload;
    const canDeleteDocs = user?.userType === "admin" || user?.userType === "sales" || user?.userType === "office";
    // Agent 2 records always belong to that agent, so the field is filled from
    // their account and locked rather than being an optional free choice.
    const isAgent2 = user?.userType === 'agent2';
    const isChannelPartnerManager = user?.userType === 'office2';
    const managerCpoName = (user?.channel_partner || user?.name || '').trim();
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Customer Info */}
            <section id="section-cus">
                <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-1.5 mt-2">
                    <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                        <User size={12} className="text-amber-500" /> Customer Info
                    </h3>
                    <div className="flex items-center gap-2.5">
                        {isEditable && (
                            <button 
                                type="button"
                                onClick={() => {
                                    const isOpening = editingSection !== 'cus';
                                    if (setEditingSection) {
                                        setEditingSection(isOpening ? 'cus' : null);
                                    }
                                    if (isOpening) {
                                        setTimeout(() => {
                                            const el = document.getElementById('section-cus');
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }, 150);
                                    }
                                }} 
                                className="text-stone-400 hover:text-amber-600 transition-colors p-1 cursor-pointer"
                            >
                                {editingSection === 'cus' ? <X size={14} /> : <Edit3 size={13} />}
                            </button>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <EditableDetailItem label="Customer Name *" field="customer_name" value={editData.customer_name} onChange={handleChange} isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="Phone Number *" field="phone_number" value={editData.phone_number} onChange={handleChange} type="number" isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="Email Address" field="email_address" value={editData.email_address || editData.email_address} onChange={handleChange} isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="Consumer No" field="consumer_no" value={editData.consumer_no} onChange={handleChange} type="number" isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="Villages" field="villages" value={editData.villages} onChange={handleChange} isEditing={editingSection === 'cus'} />
                    <div className="col-span-2 md:col-span-3">
                        <EditableDetailItem label="Full Address" field="full_address" value={editData.full_address} onChange={handleChange} type="textarea" isEditing={editingSection === 'cus'} />
                    </div>
                    <EditableDetailItem label="Pincode" field="pincode" value={editData.pincode} onChange={(field, value) => handleChange(field, String(value || '').replace(/\D/g, '').slice(0, 6))} isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="Tehsil / Sub Division" field="sub_divisions" value={editData.sub_divisions} onChange={handleChange} isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="District" field="district" value={editData.district} onChange={handleChange} isEditing={editingSection === 'cus'} />
                    {String(editData.payment_type || '').trim().toLowerCase() === 'loan' && (
                        <>
                            <EditableDetailItem label="Bank Name" field="bank_name" value={editData.bank_name} onChange={handleChange} isEditing={editingSection === 'cus'} />
                            <EditableDetailItem label="Bank Branch" field="bank_branch" value={editData.bank_branch} onChange={handleChange} isEditing={editingSection === 'cus'} />
                        </>
                    )}
                    <EditableDetailItem label="Google Drive Link" field="google_drive_link" value={editData.google_drive_link} onChange={handleChange} isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="Site Location Link" field="location_link" value={editData.location_link} onChange={handleChange} isEditing={editingSection === 'cus'} />
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
                        isEditing={isAdmin && editingSection === 'cus'}
                        channel_partners={channel_partners}
                        isAdmin={isAdmin}
                    />
                    <EditableDetailItem
                        label={isAgent2 ? 'Dealer Name *' : 'Dealer Name (optional)'}
                        field="sub_channel_partner"
                        value={isAgent2 ? (editData.sub_channel_partner || user?.name || '') : editData.sub_channel_partner}
                        onChange={handleChange}
                        isEditing={!isAgent2 && editingSection === 'cus'}
                        options={subAgents}
                    />
                    <EditableDetailItem label="MODULE BRAND" field="module_brand" value={editData.module_brand} onChange={handleChange} options={meta['module_brand']} category="module_brand" isEditing={editingSection === 'cus'} user={user} />
                    <EditableDetailItem label="MODULE WP" field="module_wp" value={editData.module_wp} onChange={handleChange} options={meta['module_wp'] && meta['module_wp'].length > 0 ? meta['module_wp'] : ['540', '545', '550', '570', '575', '580', '585', '590', '600', '610', '615', '620']} category="module_wp" isEditing={editingSection === 'cus'} user={user} />
                    <EditableDetailItem label="No of Modules" field="no_of_modules" value={editData.no_of_modules} onChange={handleChange} type="number" isEditing={editingSection === 'cus'} />
                    <EditableDetailItem label="System Capacity (kWp)" field="system_capacity_kwp" value={editData.system_capacity_kwp} onChange={handleChange} isEditing={editingSection === 'cus'} onAutoCalc={autoCalcCapacity} />
                    {editData.created_at && (
                        <div className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 flex flex-col justify-center">
                            <span className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">Lead Generated (IST)</span>
                            <span className="text-xs font-semibold text-stone-800">
                                {new Date(editData.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* Document Checklist */}
            <section id="section-reg_checklist">
                <div className="flex flex-wrap items-center justify-between mb-3 border-b border-stone-100 pb-2 mt-4 gap-2">
                    <h3 className="text-[10px] font-bold text-stone-700 uppercase tracking-widest flex items-center gap-2">
                        <ClipboardList size={13} className="text-amber-500" /> Document Checklist
                    </h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm space-y-4">
                    {/* Payment Type Selection at the top */}
                    <div className="pb-3 border-b border-stone-100">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Payment Type Selection</label>
                        {isEditable ? (
                            (() => {
                                // Stored values are title-cased ('Cash'/'Loan') but these
                                // options come from metadata in another case, so the select
                                // rendered blank for a value that was actually saved.
                                const ptOptions = meta['payment_type'] || [];
                                const stored = String(editData.payment_type || '').trim();
                                const matched = ptOptions.find(o => String(o).trim().toLowerCase() === stored.toLowerCase());
                                return (
                            <select
                                value={matched ?? stored}
                                onChange={(e) => handleChange('payment_type', e.target.value)}
                                className="w-full md:w-1/3 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700"
                            >
                                <option value="">Select Payment Type...</option>
                                {stored && !matched && (
                                    <option value={stored}>{stored}</option>
                                )}
                                {ptOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                                );
                            })()
                        ) : (
                            <p className="text-xs font-bold text-stone-700">{editData.payment_type || "Not Specified"}</p>
                        )}
                    </div>

                    {/* Checklist items only visible if payment_type is selected */}
                    {editData.payment_type ? (
                        <div className="flex flex-col gap-2">
                            {editData.payment_type?.trim().toLowerCase() !== 'cash' && (
                                <>
                                    <CheckboxRemarkItem label="Aadhar Card Front" field="adhaar_card_front" value={editData.adhaar_card_front} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                                    <CheckboxRemarkItem label="Aadhar Card Back" field="adhaar_card_back" value={editData.adhaar_card_back} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                                    <CheckboxRemarkItem label="PAN Card" field="pan_card" value={editData.pan_card} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                                    <CheckboxRemarkItem label="Vera Pavti / aakarni" field="index_2" value={editData.index_2} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                                    <CheckboxRemarkItem label="House Geo Tag Photo" field="house_geo_tag_photo" value={editData.house_geo_tag_photo} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                                </>
                            )}
                            <CheckboxRemarkItem label="Light Bill" field="light_bill" value={editData.light_bill} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                            <CheckboxRemarkItem label="Bank Details" field="bank_details" value={editData.bank_details} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                            <CheckboxRemarkItem label="Extra Documents" field="extra_docs" value={editData.extra_docs} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={handleUpload} onDelete={handleDelete} onPreview={handlePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                        </div>
                    ) : (
                        <p className="text-xs text-stone-400 italic">Please select a Payment Type above to display the Document Checklist.</p>
                    )}

                    {isEditable && isRegChecklistDirty && (
                        <div className="mt-4 pt-3 border-t border-stone-100 flex justify-end">
                            <button onClick={handleSaveRegChecklist}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10">
                                Save Checklist
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
