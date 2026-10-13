import { ClipboardList, Paperclip, Edit3, X } from 'lucide-react';
import { EditableDetailItem, CheckboxRemarkItem } from './shared';
import { documentMode, dropdownOptions, isOn } from '../../config/index.js';
import { Badge, SectionCard } from '../../ui/index.js';
import useStageSave from './useStageSave';

const REGISTRATION_DOCUMENTS = [
    { field: 'application_acknowledgment', label: 'Application Acknowledgment' },
    { field: 'feasibilty_document', label: 'Feasibility Document' },
    { field: 'subsidy_token_photo', label: 'Subsidy Token Photo' },
];

// Only the payment routes this client tracks (Loan and Cash stages).
const PAYMENT_TYPES = [['Loan', 'loanTracking'], ['Cash', 'cashPayments']];
const enabledPaymentTypes = PAYMENT_TYPES.filter(([, feature]) => isOn(feature)).map(([label]) => label);
const PAYMENT_TYPE_OPTIONS = enabledPaymentTypes.length ? enabledPaymentTypes : PAYMENT_TYPES.map(([label]) => label);

const titleCase = value => (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase() : '');

export default function RegistrationTab(props) {
    const {
        customer, editData, handleChange, editingSection, setEditingSection, meta, user, isEditable,
        documents = [], onFileUpload, onFileDelete, onFilePreview, onUpdateRemark,
    } = props;
    const save = useStageSave(props);
    const filesOn = documentMode() !== 'checklist';
    const canDeleteDocs = user?.userType === 'admin' || user?.userType === 'sales';
    const isEditingDetails = editingSection === 'reg_details';
    // With no staff names set up yet the field stays free text.
    const registrationStaff = dropdownOptions('registration_by', meta);

    // Ticking a checklist item saves straight away; it is not logged.
    const handleAutoSave = async (field, val) => {
        if (customer?.id) await save({ [field]: val }, null, { log: false });
    };

    const toggleDetailsEditing = () => {
        setEditingSection?.(isEditingDetails ? null : 'reg_details');
        if (!isEditingDetails) {
            setTimeout(() => document.getElementById('section-reg_details')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <SectionCard
                id="section-reg_details"
                title="Registration Details"
                icon={ClipboardList}
                actions={isEditable && (
                    <button
                        type="button"
                        onClick={toggleDetailsEditing}
                        aria-pressed={isEditingDetails}
                        aria-label={isEditingDetails ? 'Stop editing registration details' : 'Edit registration details'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
                    >
                        {isEditingDetails ? <X size={16} aria-hidden="true" /> : <Edit3 size={15} aria-hidden="true" />}
                    </button>
                )}
            >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <EditableDetailItem label="Payment Type *" field="payment_type" value={titleCase(editData.payment_type)} onChange={handleChange} options={PAYMENT_TYPE_OPTIONS} isEditing={isEditingDetails} />
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
                            onUpload={filesOn ? onFileUpload : undefined}
                            onDelete={filesOn ? onFileDelete : undefined}
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
