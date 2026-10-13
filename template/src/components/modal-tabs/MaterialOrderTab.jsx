import { ShoppingBag, ShieldAlert, User } from 'lucide-react';
import { EditableDetailItem, EditToggle } from './shared';
import { isOn } from '../../config/index.js';
import { Badge, FieldList, SectionCard, Textarea } from '../../ui/index.js';

// Roof / Shed also picks the BOM template (utils/bom.js getBomTypeForCustomer).
const ROOF_SHED_OPTIONS = ['Roof', 'Shed'];
const partnersOn = isOn('channelPartners') || isOn('cpos') || isOn('dealers');

// Read-only lead details shown under the order, from the saved record.
const CUSTOMER_REFERENCE = [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'phone_number', label: 'Phone Number', type: 'phone' },
    { key: 'email_address', label: 'Email Address', alt: 'email' },
    { key: 'consumer_no', label: 'Consumer No' },
    { key: 'folder_no', label: 'Folder No' },
    { key: 'registration_no', label: 'Feasibility No', alt: 'feasibility_no' },
    { key: 'villages', label: 'Villages' },
    { key: 'sub_divisions', label: 'Sub Division' },
    ...(isOn('channelPartners') || isOn('cpos') ? [{ key: 'channel_partner', label: 'Channel Partner Name' }] : []),
    ...(isOn('dealers') ? [{ key: 'sub_channel_partner', label: 'Dealer Name' }] : []),
    { key: 'module_brand', label: 'Module Brand' },
    { key: 'module_wp', label: 'Module Wp' },
    { key: 'no_of_modules', label: 'No of Modules' },
    { key: 'system_capacity_kwp', label: 'System Capacity (kWp)' },
];

export default function MaterialOrderTab({
    customer,
    editData,
    setEditData,
    handleChange,
    editingSection,
    setEditingSection,
    isEditable,
    user,
}) {
    // Channel Partner / Dealer / Channel Partner Office can edit; Office is view-only.
    const isAgent = user?.userType === 'agent' || user?.userType === 'agent2';
    const isAdmin = user?.userType === 'admin';
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office';
    // isEditable is the COMPLETED freeze and applies to every role.
    const canEdit = (isAgent || isChannelPartnerOffice || isAdmin) && isEditable;
    const isEditingOrder = editingSection === 'mat_order';

    const handleLocalChange = (field, val) => {
        if (handleChange) handleChange(field, val);
        else setEditData(prev => ({ ...prev, [field]: val }));
    };

    const referenceValue = (record, field) => record?.[field.key] || record?.[field.alt]
        || editData?.[field.key] || editData?.[field.alt];

    return (
        <div className="space-y-3.5 animate-in fade-in duration-300">
            {partnersOn && !isAgent && !isChannelPartnerOffice && (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
                    <div>
                        <p className="text-xs font-bold text-amber-900 leading-tight">Channel Partner Controlled Stage</p>
                        <p className="text-[10px] text-amber-700 font-medium leading-tight">
                            Material Order specifications can also be modified with admin unlock. Channel partners configure these in their portal.
                        </p>
                    </div>
                </div>
            )}

            <SectionCard
                id="section-mat_order"
                title="Material Order Specifications"
                icon={ShoppingBag}
                actions={canEdit && <EditToggle id="mat_order" label="the material order" editingSection={editingSection} setEditingSection={setEditingSection} />}
            >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <EditableDetailItem label="Roof / Shed *" field="roof_shed" value={editData.roof_shed} onChange={handleLocalChange} options={ROOF_SHED_OPTIONS} isEditing={isEditingOrder} />
                    <EditableDetailItem label="DC Cable (Meters)" field="dc_cable" value={editData.dc_cable} onChange={handleLocalChange} type="number" isEditing={isEditingOrder} />
                    <EditableDetailItem label="AC Cable (Meters)" field="ac_cable" value={editData.ac_cable} onChange={handleLocalChange} type="number" isEditing={isEditingOrder} />
                    <EditableDetailItem label="Structure Front Leg Height (ft)" field="structure_front_leg_height" value={editData.structure_front_leg_height} onChange={handleLocalChange} type="number" isEditing={isEditingOrder} />
                    <EditableDetailItem label="Structure Rear Leg Height (ft)" field="structure_rear_leg_height" value={editData.structure_rear_leg_height} onChange={handleLocalChange} type="number" isEditing={isEditingOrder} />
                    <EditableDetailItem label="Invoice Value (₹) *" field="invoice_value" value={editData.invoice_value} onChange={handleLocalChange} isMoney isEditing={isEditingOrder} />
                    <div className="col-span-2 md:col-span-3 rounded-xl bg-stone-50 p-3">
                        <label htmlFor={isEditingOrder ? 'material-order-notes' : undefined} className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-stone-500">Notes / Special Instructions (Optional)</label>
                        {isEditingOrder ? (
                            <Textarea
                                id="material-order-notes"
                                rows={5}
                                value={editData.material_order_notes || ''}
                                onChange={e => handleLocalChange('material_order_notes', e.target.value)}
                                placeholder="Enter material order notes"
                                className="min-h-[120px] resize-y leading-6"
                            />
                        ) : (
                            <p className="min-h-[72px] whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">
                                {editData.material_order_notes || '–'}
                            </p>
                        )}
                    </div>
                </div>
            </SectionCard>

            <SectionCard id="section-lead_details" title="Customer & Site Reference" icon={User} actions={<Badge>View only</Badge>}>
                <FieldList fields={CUSTOMER_REFERENCE} record={customer} getValue={referenceValue} className="md:grid-cols-3" />
            </SectionCard>
        </div>
    );
}
