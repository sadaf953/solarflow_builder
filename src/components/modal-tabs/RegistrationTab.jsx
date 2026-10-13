import React, { useState } from 'react';
import { ClipboardList, Paperclip, Edit3, X } from 'lucide-react';
import { SectionHeader, EditableDetailItem, CheckboxRemarkItem, ChecklistModeToggle, generateDemoSampleFile } from './shared';

export default function RegistrationTab({
    customer,
    editData,
    handleChange,
    editingSection,
    setEditingSection,
    meta,
    user,
    isEditable,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    onUpdate
}) {
    const [fillingDemoDocs, setFillingDemoDocs] = useState(false);
    const canDeleteDocs = user?.userType === "admin" || user?.userType === "sales" || user?.userType === "office";

    const handleFillAllDemoDocs = async () => {
        if (!onFileUpload || fillingDemoDocs) return;
        setFillingDemoDocs(true);
        try {
            const itemsToFill = [
                { field: 'application_acknowledgment', label: 'Application Acknowledgment' },
                { field: 'feasibilty_document', label: 'Feasibility Document' },
                { field: 'subsidy_token_photo', label: 'Subsidy Token Photo' },
            ];
            for (const item of itemsToFill) {
                const hasDoc = documents.some(d => d.doc_type === item.field);
                if (!hasDoc) {
                    const file = generateDemoSampleFile(item.field, item.label);
                    await onFileUpload({ target: { files: [file], value: '' } }, item.field);
                }
            }
        } finally {
            setFillingDemoDocs(false);
        }
    };

    const handleAutoSave = async (field, val) => {
        if (onUpdate && customer?.id) {
            await onUpdate(customer.id, { [field]: val });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Registration Details */}
            <section id="section-reg_details">
                <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-1.5 mt-2">
                    <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                        <ClipboardList size={12} className="text-amber-500" /> Registration Details
                    </h3>
                    <div className="flex items-center gap-2.5">
                        {isEditable && (
                            <button 
                                type="button"
                                onClick={() => {
                                    const isOpening = editingSection !== 'reg_details';
                                    if (setEditingSection) {
                                        setEditingSection(isOpening ? 'reg_details' : null);
                                    }
                                    if (isOpening) {
                                        setTimeout(() => {
                                            const el = document.getElementById('section-reg_details');
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }, 150);
                                    }
                                }} 
                                className="text-stone-400 hover:text-amber-600 transition-colors p-1 cursor-pointer"
                            >
                                {editingSection === 'reg_details' ? <X size={14} /> : <Edit3 size={13} />}
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <EditableDetailItem label="Payment Type *" field="payment_type" value={editData.payment_type ? String(editData.payment_type).charAt(0).toUpperCase()+String(editData.payment_type).slice(1).toLowerCase() : ''} onChange={handleChange} options={['Loan','Cash']} isEditing={editingSection === 'reg_details'} />
                    <EditableDetailItem 
                        label={<span>Registration date <span className="text-red-500">*</span></span>} 
                        field="registration_date" 
                        value={editData.registration_date} 
                        onChange={handleChange} 
                        type="date" 
                        isEditing={editingSection === 'reg_details'} 
                    />
                    <EditableDetailItem 
                        label={<span>Registration By</span>}
                        field="registration_by" 
                        value={editData.registration_by} 
                        onChange={handleChange} 
                        options={meta['registration_by']} 
                        category="registration_by" 
                        isEditing={editingSection === 'reg_details'} 
                        user={user} 
                    />
                    <EditableDetailItem 
                        label={<span>Feasibility No</span>}
                        field="registration_no" 
                        value={editData.registration_no || editData.feasibility_no} 
                        onChange={handleChange} 
                        isEditing={editingSection === 'reg_details'} 
                    />
                    <EditableDetailItem 
                        label="File No"
                        field="folder_no" 
                        value={editData.folder_no} 
                        onChange={handleChange} 
                        type="number" 
                        isEditing={editingSection === 'reg_details'} 
                    />
                </div>

                {/* Registration Checklists & Uploads - Interactive outside pencil edit mode */}
                <div className="mt-5 bg-white p-4 rounded-2xl border border-stone-100 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                        <div className="flex items-center gap-2">
                            <h4 className="text-[10px] font-bold text-stone-700 uppercase tracking-widest flex items-center gap-1.5">
                                <Paperclip size={12} className="text-amber-500" /> Registration Documents & Checklists
                            </h4>
                            <span className="text-[9px] font-semibold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                                3 items
                            </span>
                        </div>

                        {/* Demo document helper */}
                        <div className="flex items-center gap-2">
                            <ChecklistModeToggle
                                onFillAllDemoDocs={isEditable && onFileUpload ? handleFillAllDemoDocs : null}
                                isFilling={fillingDemoDocs}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <CheckboxRemarkItem
                            label="Application Acknowledgment"
                            field="application_acknowledgment"
                            value={editData.application_acknowledgment}
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
                        <CheckboxRemarkItem
                            label="Feasibility Document"
                            field="feasibilty_document"
                            value={editData.feasibilty_document}
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
                        <CheckboxRemarkItem
                            label="Subsidy Token Photo"
                            field="subsidy_token_photo"
                            value={editData.subsidy_token_photo}
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
                    </div>
                </div>
            </section>
        </div>
    );
}
