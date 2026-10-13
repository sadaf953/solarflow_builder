import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { CheckboxRemarkItem, EditableDetailItem, SectionHeader } from './shared';

export default function FinalReviewTab({
    editData,
    handleChange,
    isEditable,
    isOperationalChecklistDirty,
    handleSaveOperationalChecklist,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    editingSection,
    setEditingSection,
    user
}) {
    const canDeleteDocs = user?.userType === "admin" || user?.userType === "sales" || user?.userType === "office";

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Checklist Milestones */}
            <section>
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm mb-3">
                    <div>
                        <h3 className="text-sm font-bold text-stone-800">Operational Checklist Milestones</h3>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <CheckboxRemarkItem label="Warranty Card" field="warranty_card" value={editData.warranty_card} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                        <CheckboxRemarkItem label="Insurance Status" field="insurance_status" value={editData.insurance_status} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                    </div>
                    {isEditable && isOperationalChecklistDirty && (
                        <div className="mt-4 pt-3 border-t border-stone-100 flex justify-end">
                            <button onClick={handleSaveOperationalChecklist}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10">
                                Save Checklist
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* Same pencil-to-edit pattern as every other detail section:
                read-only until the header pencil is clicked, then the three
                fields become inputs. All optional - the checklist above can be
                left empty. */}
            <section>
                <SectionHeader
                    title="Final Review Details"
                    id="finalrev"
                    icon={ClipboardCheck}
                    isEditable={isEditable}
                    editingSection={editingSection}
                    setEditingSection={setEditingSection}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <EditableDetailItem
                        label="SFDC Photo"
                        field="sfdc_photo_text"
                        value={editData.sfdc_photo_text}
                        onChange={handleChange}
                        isEditing={editingSection === 'finalrev'}
                    />
                    <EditableDetailItem
                        label="Warranty Card"
                        field="warranty_card_text"
                        value={editData.warranty_card_text}
                        onChange={handleChange}
                        isEditing={editingSection === 'finalrev'}
                    />
                    <EditableDetailItem
                        label="File Status"
                        field="file_status"
                        value={editData.file_status}
                        onChange={handleChange}
                        isEditing={editingSection === 'finalrev'}
                    />
                </div>
            </section>
        </div>
    );
}
