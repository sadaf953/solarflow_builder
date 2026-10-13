import { ClipboardCheck, ClipboardList } from 'lucide-react';
import { SectionCard } from '../../ui/index.js';
import { CheckboxRemarkItem, EditableDetailItem, EditToggle } from './shared';

const SECTION_ID = 'finalrev';

export default function FinalReviewTab({
    editData,
    handleChange,
    isEditable,
    isOperationalChecklistDirty,
    handleSaveOperationalChecklist,
    saving,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    editingSection,
    setEditingSection,
    canDeleteDocs = false,
}) {
    const editing = editingSection === SECTION_ID;

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard title="Final checklist" icon={ClipboardList}>
                <CheckboxRemarkItem
                    label="Insurance status"
                    field="insurance_status"
                    value={editData.insurance_status}
                    onChange={handleChange}
                    isEditing={isEditable}
                    documents={documents}
                    onUpload={onFileUpload}
                    onDelete={onFileDelete}
                    onPreview={onFilePreview}
                    onUpdateRemark={onUpdateRemark}
                    canDelete={canDeleteDocs}
                />
                {isEditable && isOperationalChecklistDirty && (
                    <div className="flex justify-end">
                        <button type="button" onClick={handleSaveOperationalChecklist} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                            Save checklist
                        </button>
                    </div>
                )}
            </SectionCard>

            {/* Read-only until the pencil is clicked, like every other details section. All optional. */}
            <SectionCard
                id={`section-${SECTION_ID}`}
                title="Final review details"
                icon={ClipboardCheck}
                actions={isEditable && <EditToggle id={SECTION_ID} label="final review details" editingSection={editingSection} setEditingSection={setEditingSection} />}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <EditableDetailItem label="SFDC photo" field="sfdc_photo_text" value={editData.sfdc_photo_text} onChange={handleChange} isEditing={editing} />
                    <EditableDetailItem label="File status" field="file_status" value={editData.file_status} onChange={handleChange} isEditing={editing} />
                </div>
            </SectionCard>
        </div>
    );
}
