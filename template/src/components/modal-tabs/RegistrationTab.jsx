import { ClipboardList, Paperclip } from 'lucide-react';
import { EditableDetailItem, CheckboxRemarkItem, EditToggle } from './shared';
import { dropdownOptions, paymentTypeOptions } from '../../config/index.js';
import { Badge, SectionCard } from '../../ui/index.js';
import useStageSave from './useStageSave';
import { REGISTRATION_DOCUMENTS } from './registrationDocuments.js';

const titleCase = value => (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase() : '');

export default function RegistrationTab(props) {
    const {
        customer, editData, handleChange, editingSection, setEditingSection, meta, isEditable,
        canDeleteDocs = false, documents = [], onFileUpload, onFileDelete, onFilePreview, onUpdateRemark,
    } = props;
    const save = useStageSave(props);
    const isEditingDetails = editingSection === 'reg_details';
    // With no staff names set up yet the field stays free text.
    const registrationStaff = dropdownOptions('registration_by', meta);

    // Ticking a checklist item saves straight away; it is not logged.
    const handleAutoSave = async (field, val) => {
        if (customer?.id) await save({ [field]: val }, null, { log: false });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <SectionCard
                id="section-reg_details"
                title="Registration Details"
                icon={ClipboardList}
                actions={isEditable && <EditToggle id="reg_details" label="registration details" editingSection={editingSection} setEditingSection={setEditingSection} />}
            >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <EditableDetailItem label="Payment Type *" field="payment_type" value={titleCase(editData.payment_type)} onChange={handleChange} options={paymentTypeOptions()} isEditing={isEditingDetails} />
                    <EditableDetailItem label="Registration Date *" field="registration_date" value={editData.registration_date} onChange={handleChange} type="date" isEditing={isEditingDetails} />
                    <EditableDetailItem label="Registration By" field="registration_by" value={editData.registration_by} onChange={handleChange} options={registrationStaff.length ? registrationStaff : undefined} category="registration_by" isEditing={isEditingDetails} />
                    <EditableDetailItem label="Feasibility No" field="registration_no" value={editData.registration_no || editData.feasibility_no} onChange={handleChange} isEditing={isEditingDetails} />
                    <EditableDetailItem label="File No" field="folder_no" value={editData.folder_no} onChange={handleChange} type="number" isEditing={isEditingDetails} />
                </div>
            </SectionCard>

            <SectionCard
                title="Registration Documents & Checklists"
                icon={Paperclip}
                actions={<Badge>{REGISTRATION_DOCUMENTS.length} items</Badge>}
            >
                <div className="flex flex-col gap-2">
                    {REGISTRATION_DOCUMENTS.map(doc => (
                        <CheckboxRemarkItem
                            key={doc.field}
                            label={doc.label}
                            field={doc.field}
                            value={editData[doc.field]}
                            onChange={handleChange}
                            onAutoSave={handleAutoSave}
                            isEditing={isEditable}
                            documents={documents}
                            onUpload={onFileUpload}
                            onDelete={onFileDelete}
                            onPreview={onFilePreview}
                            onUpdateRemark={onUpdateRemark}
                            canDelete={canDeleteDocs}
                        />
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
