import { ListPlus } from 'lucide-react';
import { customFieldsForStage, customFieldValue, isOn } from '../../config/index.js';
import { FieldRenderer, SectionCard } from '../../ui/index.js';
import { CheckboxRemarkItem } from './shared';

// The client's extra fields for one stage. Values live in
// editData.custom_fields[key] and are saved by the footer Save; file fields
// are documents of type cf_<key>, ticked once a file is uploaded.
export default function CustomFieldsSection({
    stageId,
    title = 'Additional details',
    subtitle,
    icon = ListPlus,
    editData,
    onCustomFieldChange,
    isEditable,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    canDeleteDocs = false,
}) {
    const fields = customFieldsForStage(stageId).filter(field => field.type !== 'file' || isOn('documentUploads'));
    if (!fields.length) return null;

    const renderFile = field => (
        <CheckboxRemarkItem
            mode="files"
            label={field.label}
            field={`cf_${field.key}`}
            isEditing={isEditable}
            documents={documents}
            onUpload={onFileUpload}
            onDelete={onFileDelete}
            onPreview={onFilePreview}
            onUpdateRemark={onUpdateRemark}
            canDelete={canDeleteDocs}
        />
    );

    return (
        <SectionCard title={title} subtitle={subtitle} icon={icon} className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map(field => (
                    <div key={field.key} className={field.type === 'textarea' || field.type === 'file' ? 'sm:col-span-2' : ''}>
                        <FieldRenderer
                            field={field}
                            value={customFieldValue(editData, field.key)}
                            onChange={value => onCustomFieldChange(field.key, value)}
                            readOnly={!isEditable}
                            renderFile={renderFile}
                        />
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}
