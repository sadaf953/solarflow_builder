import { useId } from 'react';
import { ClipboardList, FileText, Printer, Save, Send, Upload } from 'lucide-react';
import { BRANDING, STAGE_IDS, dropdownOptions, isOn, stageLabel } from '../../config/index.js';
import { todayIST } from '../../lib/format.js';
import { Field, Input, SectionCard, Select } from '../../ui/index.js';
import { Page1 } from '../agreement/Page1';
import { agreementData, agreementDate } from '../agreement/agreementData.js';
import { CheckboxRemarkItem } from './shared';
import useStageSave from './useStageSave';

const CHECKLIST = [
    ['dcr_certificate', 'DCR certificate'],
    ['pcr_certificate', 'PCR certificate'],
    ['signature_pic', 'Signature'],
    ['discom_agreement', 'PM Surya Ghar model agreement'],
    ['pm_surya_ghar_stamp', 'PM Surya Ghar stamp paper'],
];
const asObject = value => (value && typeof value === 'object' ? value : {});

export default function DiscomSubmissionTab({
    customer,
    editData,
    setEditData,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    handleChange,
    saving,
    setSaving,
    onGenerateAgreement,
    onAddAgreementToDocuments,
    canDeleteDocs = false,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    meta = {},
}) {
    const baseId = useId();
    const save = useStageSave({ customer, user, onUpdate, logActivity, fetchLogs, setSaving });
    const userType = user?.userType;
    const canEditDetails = isEditable || ['admin', 'sales', 'channel_partner_office'].includes(userType);
    const company = BRANDING.companyName.toUpperCase();

    // Defaults are shown straight away and saved with the first change.
    const stored = asObject(editData.discom_submission);
    const submission = {
        ...stored,
        date: stored.date || todayIST(),
        first_party: stored.first_party || customer.customer_name || '',
        second_party: stored.second_party || company,
        purchased_party: stored.purchased_party || company,
    };
    const staff = dropdownOptions('registration_by', meta);

    const checklistDirty = CHECKLIST.some(([field]) => Boolean(editData[field]) !== Boolean(customer[field]));
    const detailsDirty = JSON.stringify(asObject(editData.discom_submission)) !== JSON.stringify(asObject(customer.discom_submission));
    const remarks = asObject(editData.stages_remarks);
    const executionDate = agreementDate(editData);
    const dateDirty = remarks.discom_agreement_date !== asObject(customer.stages_remarks).discom_agreement_date;
    const hasAgreementDocument = documents.some(doc => doc?.doc_type === 'discom_agreement');

    const setDetail = (field, value) => setEditData(prev => ({ ...prev, discom_submission: { ...submission, [field]: value } }));

    const saveChecklist = () => save(
        Object.fromEntries(CHECKLIST.map(([field]) => [field, Boolean(editData[field])])),
        `Updated ${BRANDING.discomName} file checklist (${CHECKLIST.map(([field, label]) => `${label}: ${editData[field] ? 'Done' : 'Pending'}`).join(', ')})`,
    );

    const saveDetails = () => save(
        { discom_submission: submission },
        `Updated Discom Submission details (Submitted By: ${submission.submitted_by || 'N/A'}, Date: ${submission.date || 'N/A'})`,
    );

    const setAgreementDate = value => setEditData(prev => ({
        ...prev,
        stages_remarks: { ...asObject(prev.stages_remarks), discom_agreement_date: value },
    }));

    const saveAgreementDate = () => save(
        { stages_remarks: { ...remarks, discom_agreement_date: executionDate } },
        'Updated Agreement Execution Date',
    );

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <SectionCard
                title={`${BRANDING.discomName} file checklist`}
                icon={ClipboardList}
                actions={isEditable && checklistDirty && (
                    <button type="button" onClick={saveChecklist} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                        <Save size={14} aria-hidden="true" /> Save checklist
                    </button>
                )}
            >
                <div className="flex flex-col gap-2">
                    {CHECKLIST.map(([field, label]) => (
                        <CheckboxRemarkItem
                            key={field}
                            label={label}
                            field={field}
                            value={editData[field]}
                            onChange={handleChange}
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

            <SectionCard
                title={`${stageLabel(STAGE_IDS.DISCOM_SUBMISSION)} details`}
                subtitle={`Who filed the papers with ${BRANDING.discomName}, and when.`}
                icon={Send}
                actions={canEditDetails && detailsDirty && (
                    <button type="button" onClick={saveDetails} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save details'}
                    </button>
                )}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Filed by" htmlFor={`${baseId}-by`} required>
                        <Select
                            id={`${baseId}-by`}
                            options={staff}
                            placeholder="Select staff…"
                            disabled={!canEditDetails}
                            value={submission.submitted_by || ''}
                            onChange={event => setDetail('submitted_by', event.target.value)}
                        />
                    </Field>
                    <Field label="Submission date" htmlFor={`${baseId}-date`} required>
                        <Input
                            id={`${baseId}-date`}
                            type="date"
                            disabled={!canEditDetails}
                            value={submission.date}
                            onChange={event => setDetail('date', event.target.value)}
                        />
                    </Field>
                    <Field label="First party" htmlFor={`${baseId}-first`}>
                        <Input id={`${baseId}-first`} type="text" disabled value={submission.first_party} />
                    </Field>
                    <Field label="Second party" htmlFor={`${baseId}-second`}>
                        <Input id={`${baseId}-second`} type="text" disabled value={submission.second_party} />
                    </Field>
                    <Field label="Purchased party" htmlFor={`${baseId}-purchased`}>
                        <Input id={`${baseId}-purchased`} type="text" disabled value={submission.purchased_party} />
                    </Field>
                </div>
                {staff.length === 0 && canEditDetails && (
                    <p className="text-[11px] font-medium text-amber-700">No staff names yet. An admin can add them to the Registration staff list.</p>
                )}
            </SectionCard>

            <SectionCard
                title="PM Surya Ghar model agreement"
                subtitle="Print the model agreement filled in with this customer’s details."
                icon={FileText}
                tone="blue"
            >
                <Field label="Agreement date" htmlFor={`${baseId}-agreement-date`} className="sm:max-w-xs">
                    <Input
                        id={`${baseId}-agreement-date`}
                        type="date"
                        disabled={!isEditable}
                        value={executionDate}
                        onChange={event => setAgreementDate(event.target.value)}
                    />
                </Field>

                <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4 shadow-inner">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">Preview (page 1)</p>
                    {/* A 60% page; on narrow screens it scrolls sideways from the left edge. */}
                    <div className="max-h-[350px] w-full overflow-x-auto overflow-y-hidden rounded-xl border border-stone-200 bg-white py-4" aria-hidden="true">
                        <div className="mx-auto" style={{ width: '126mm', height: '178.2mm' }}>
                            <div className="origin-top-left scale-[0.6]" style={{ width: '210mm', height: '297mm' }}>
                                <Page1 data={agreementData(editData)} fontSizeClass="text-[14px]" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    {isEditable && dateDirty && (
                        <button type="button" onClick={saveAgreementDate} disabled={saving} className="sf-btn-success min-h-11 disabled:opacity-50">
                            <Save size={14} aria-hidden="true" /> Save date
                        </button>
                    )}
                    <button type="button" onClick={onGenerateAgreement} className="sf-btn-primary min-h-11">
                        <Printer size={14} aria-hidden="true" /> Open and print agreement
                    </button>
                    {isOn('documentUploads') && onAddAgreementToDocuments && (
                        <button type="button" onClick={onAddAgreementToDocuments} disabled={saving} className="sf-btn-secondary min-h-11">
                            <Upload size={14} aria-hidden="true" />
                            {hasAgreementDocument ? 'Replace in documents' : 'Add to documents'}
                        </button>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}
