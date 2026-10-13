import React, { useState } from 'react';
import { ShoppingBag, Zap, Ruler, IndianRupee, Layers, CheckCircle2, ShieldAlert, AlertCircle, User, Edit3, X } from 'lucide-react';
import { SectionHeader, EditableDetailItem } from './shared';
import { parseIndianNumber } from '../../utils';

export default function MaterialOrderTab({
    customer,
    editData,
    setEditData,
    handleChange,
    editingSection,
    setEditingSection,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    meta = {},
    saving,
    setSaving
}) {
    // Channel Partner / Dealer / Channel Partner Office can edit; Office is view-only.
    // 'dealer' was never a real user_type - the Dealer role IS `agent2`
    // (constants.js APP_ROLES), so this test never matched and actual Dealers
    // silently had no Material Order edit while the legacy `agent` role did.
    const isAgent = user?.userType === 'agent' || user?.userType === 'agent2';
    const isAdmin = user?.userType === 'admin';
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office';
    // isEditable is the COMPLETED freeze. It used to apply to isAdmin ONLY, so an
    // Admin could not edit a completed Material Order while a Dealer could - the
    // freeze was inverted against the permission hierarchy. It now applies to
    // every role, which is what "frozen" is supposed to mean.
    const canEdit = (isAgent || isChannelPartnerOffice || isAdmin) && isEditable;

    const [validationError, setValidationError] = useState('');
    const [savedSuccess, setSavedSuccess] = useState(false);

    const roofShedOptions = ['Roof', 'Shed'];

    const handleLocalChange = (field, val) => {
        setValidationError('');
        if (handleChange) {
            handleChange(field, val);
        } else {
            setEditData(prev => ({ ...prev, [field]: val }));
        }
    };

    const isEditingOrder = editingSection === 'mat_order';

    return (
        <div className="space-y-3.5 animate-in fade-in duration-300">
            {/* Role permission info banner if not agent or channel partner office */}
            {!isAgent && !isChannelPartnerOffice && (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-amber-900 leading-tight">Channel Partner Controlled Stage</p>
                        <p className="text-[10px] text-amber-700 font-medium leading-tight">
                            Material Order specifications can also be modified with admin unlock. Channel partners configure these in their portal.
                        </p>
                    </div>
                </div>
            )}

            {/* 1. Material Order Specifications Card (Placed ABOVE Customer Details) */}
            <section id="section-mat_order">
                <div className="flex items-center justify-between mb-2 border-b border-stone-100 pb-1">
                    <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ShoppingBag size={12} className="text-amber-500" /> Material Order Specifications
                    </h3>
                    <div className="flex items-center gap-2">
                        {canEdit && (
                            <button
                                onClick={() => setEditingSection(isEditingOrder ? null : 'mat_order')}
                                className="text-stone-400 hover:text-amber-600 transition-colors p-0.5"
                                title={isEditingOrder ? 'Close edit' : 'Edit details'}
                            >
                                {isEditingOrder ? <X size={14} /> : <Edit3 size={14} />}
                            </button>
                        )}
                    </div>
                </div>

                {/* Validation Alert */}
                {validationError && (
                    <div className="mb-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                        <AlertCircle size={14} className="flex-shrink-0 text-red-500" />
                        <span>{validationError}</span>
                    </div>
                )}

                {savedSuccess && (
                    <div className="mb-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                        <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-600" />
                        <span>Material Order details saved successfully!</span>
                    </div>
                )}

                {/* Grid of Specifications with Front Leg, Rear Leg, and Notes */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <EditableDetailItem
                        label="Roof / Shed *"
                        field="roof_shed"
                        value={editData.roof_shed}
                        onChange={handleLocalChange}
                        options={roofShedOptions}
                        isEditing={isEditingOrder}
                    />
                    <EditableDetailItem
                        label="DC Cable (Meters)"
                        field="dc_cable"
                        value={editData.dc_cable}
                        onChange={handleLocalChange}
                        type="number"
                        isEditing={isEditingOrder}
                    />
                    <EditableDetailItem
                        label="AC Cable (Meters)"
                        field="ac_cable"
                        value={editData.ac_cable}
                        onChange={handleLocalChange}
                        type="number"
                        isEditing={isEditingOrder}
                    />
                    <EditableDetailItem
                        label="Structure Front Leg Height (ft)"
                        field="structure_front_leg_height"
                        value={editData.structure_front_leg_height}
                        onChange={handleLocalChange}
                        type="number"
                        isEditing={isEditingOrder}
                    />
                    <EditableDetailItem
                        label="Structure Rear Leg Height (ft)"
                        field="structure_rear_leg_height"
                        value={editData.structure_rear_leg_height}
                        onChange={handleLocalChange}
                        type="number"
                        isEditing={isEditingOrder}
                    />
                    <EditableDetailItem
                        label="Invoice Value (₹) *"
                        field="invoice_value"
                        value={editData.invoice_value}
                        onChange={handleLocalChange}
                        isMoney={true}
                        isEditing={isEditingOrder}
                    />
                    <div className="col-span-2 md:col-span-3 rounded-xl bg-stone-50 p-3">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">Notes / Special Instructions (Optional)</p>
                        {isEditingOrder ? (
                            <textarea
                                rows={5}
                                value={editData.material_order_notes || ''}
                                onChange={e => handleLocalChange('material_order_notes', e.target.value)}
                                placeholder="Enter material order notes"
                                className="min-h-[120px] w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm leading-6 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-300"
                            />
                        ) : (
                            <p className="min-h-[72px] whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">
                                {editData.material_order_notes || '–'}
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* 2. Non-Editable Customer & Site Reference (Reference below specifications) */}
            <section id="section-lead_details" className="pt-1.5 border-t border-stone-100">
                <div className="flex items-center justify-between mb-2 border-b border-stone-100 pb-1">
                    <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <User size={12} className="text-amber-500" /> Customer & Site Reference
                    </h3>
                    <span className="text-[9px] font-semibold text-stone-400 uppercase">View Only</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <EditableDetailItem label="Customer Name" field="customer_name" value={customer.customer_name} isEditing={false} />
                    <EditableDetailItem label="Phone Number" field="phone_number" value={customer.phone_number} isEditing={false} />
                    <EditableDetailItem label="Email Address" field="email" value={customer.email_address || customer.email} isEditing={false} />
                    <EditableDetailItem label="Consumer No" field="consumer_no" value={customer.consumer_no} isEditing={false} />
                    <EditableDetailItem label="Folder No" field="folder_no" value={customer.folder_no || editData?.folder_no} isEditing={false} />
                    <EditableDetailItem label="Feasibility No" field="feasibility_no" value={customer.registration_no || customer.feasibility_no || editData?.registration_no || editData?.feasibility_no} isEditing={false} />
                    <EditableDetailItem label="Villages" field="villages" value={customer.villages} isEditing={false} />
                    <EditableDetailItem label="Sub Division" field="sub_divisions" value={customer.sub_divisions} isEditing={false} />
                    <EditableDetailItem label="Channel Partner Name" field="channel_partner" value={customer.channel_partner} isEditing={false} />
                    <EditableDetailItem label="Dealer Name" field="sub_channel_partner" value={customer.sub_channel_partner} isEditing={false} />
                    <EditableDetailItem label="MODULE BRAND" field="module_brand" value={customer.module_brand} isEditing={false} />
                    <EditableDetailItem label="MODULE WP" field="module_wp" value={customer.module_wp} isEditing={false} />
                    <EditableDetailItem label="No of Modules" field="no_of_modules" value={customer.no_of_modules} isEditing={false} />
                    <EditableDetailItem label="System Capacity (kWp)" field="system_capacity_kwp" value={customer.system_capacity_kwp} isEditing={false} />
                </div>
            </section>
        </div>
    );
}
