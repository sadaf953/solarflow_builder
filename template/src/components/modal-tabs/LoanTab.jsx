import { useEffect, useId, useState } from 'react';
import { History, Paperclip, IndianRupee, CheckCircle2, Lock, Edit3, X, ClipboardList, Upload, Eye, Download, Tag } from 'lucide-react';
import { LOAN_TAGS, LOAN_TAG_COLORS, isFinalTagValue } from '../../constants';
import { CheckboxRemarkItem } from './shared';
import { formatInputValue, parseIndianNumber } from '../../utils';
import { documentMode, dropdownOptions, tagLabel } from '../../config/index.js';
import { formatINR, todayIST } from '../../lib/format.js';
import { downloadBlob } from '../../lib/download.js';
import { Field, FieldList, Input, Modal, SectionCard, Select, Spinner, SuccessBanner, TagPicker } from '../../ui/index.js';
import { useGlobalPopup } from '../GlobalPopup';
import useStageSave from './useStageSave';

// Tag ids the payment breakdown depends on (locked in config/catalog/dropdowns.js).
const FIRST_PAYMENT = '1st Payment';
const SECOND_PAYMENT = '2nd Payment';
const FINAL_TAG = LOAN_TAGS.find(tag => tag.isFinal)?.id;
// A manual history entry can record any status except the final "all received" one.
const STATUS_OPTIONS = LOAN_TAGS.filter(tag => !tag.isFinal).map(tag => ({ value: tag.id, label: tag.label }));
const DEFAULT_DRAFT_STATUS = STATUS_OPTIONS.find(option => option.value === 'Sanctioned')?.value || STATUS_OPTIONS[0]?.value || '';
// Amount rows kept in loan_history next to the status entries.
const PAYMENT_ROWS = ['Down Payment', 'Total Quotation', 'Quotation'];
const NEUTRAL_PILL = { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200', dot: 'bg-stone-400' };

const LOAN_DOCUMENTS = [
    { field: 'vendor_feasibility', label: 'Vendor Feasibility' },
    { field: 'site_feasibility', label: 'Site Feasibility' },
    { field: 'digital_certificate', label: 'Digital Certificate' },
];

const APP_DETAIL_FIELDS = [
    { key: 'loan_by', label: 'Loan By' },
    { key: 'quotation_amount', label: 'Total Quotation Amount (₹)', type: 'money' },
    { key: 'jansamarth_application_no', label: 'Jansamarth Application No' },
    { key: 'loan_registration_date', label: 'Loan Date', type: 'date' },
];

const loadFeasibility = () => import('../../feasibilityReport.js');

const shouldUseNativeMobilePdfViewer = () => typeof window !== 'undefined'
    && window.matchMedia('(max-width: 767px)').matches;

function PaymentCard({ title, entry, amount, editable, lockNote, amountPlaceholder, remarkLabel, remarkPlaceholder, today, onChange }) {
    const id = useId();
    return (
        <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between pb-1 border-b border-stone-200/50">
                <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">{title}</span>
                {!editable && <span className="text-[9px] text-stone-400 font-bold uppercase flex items-center gap-0.5">{lockNote}</span>}
            </div>
            {editable ? (
                <div className="space-y-2">
                    <Field label="Amount (₹)" htmlFor={`${id}-amount`}>
                        <Input id={`${id}-amount`} inputMode="decimal" placeholder={amountPlaceholder}
                            value={entry.amount ? formatInputValue(entry.amount) : ''}
                            onChange={e => onChange('amount', formatInputValue(e.target.value))} />
                    </Field>
                    <Field label="Date" htmlFor={`${id}-date`}>
                        <Input id={`${id}-date`} type="date" value={entry.date || today} onChange={e => onChange('date', e.target.value)} />
                    </Field>
                    <Field label={remarkLabel} htmlFor={`${id}-remark`}>
                        <Input id={`${id}-remark`} placeholder={remarkPlaceholder} value={entry.remark || ''} onChange={e => onChange('remark', e.target.value)} />
                    </Field>
                </div>
            ) : (
                <div className="space-y-1 py-1">
                    <p className="text-base font-bold text-stone-800">{formatINR(amount)}</p>
                    <p className="text-[10px] text-stone-500">Date: <span className="font-medium text-stone-600">{entry.date || '–'}</span></p>
                    {entry.remark && <p className="text-[10px] text-stone-500 italic truncate">{entry.remark}</p>}
                </div>
            )}
        </div>
    );
}

export default function LoanTab(props) {
    const {
        customer, editData, setEditData, handleChange, isEditable, user, meta,
        documents = [], onFileUpload, onFileDelete, onFilePreview, onUpdateRemark,
    } = props;
    const save = useStageSave(props);
    const { showAlert } = useGlobalPopup();
    const filesOn = documentMode() !== 'checklist';
    const canDeleteDocs = user?.userType === 'admin' || user?.userType === 'sales';
    const today = todayIST();
    const loanStaff = dropdownOptions('registration_by', meta);
    const [loanDraftStatus, setLoanDraftStatus] = useState(DEFAULT_DRAFT_STATUS);
    const [loanDraftDate, setLoanDraftDate] = useState(today);
    const [loanDraftRemark, setLoanDraftRemark] = useState('');
    const [isCustomEditing, setIsCustomEditing] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);
    const [isPaymentsDirty, setIsPaymentsDirty] = useState(false);
    const [isEditingAppDetails, setIsEditingAppDetails] = useState(false);
    const [feasibilityBusy, setFeasibilityBusy] = useState(false);
    const [feasibilityPreviewUrl, setFeasibilityPreviewUrl] = useState('');
    const [feasibilityPreviewInputs, setFeasibilityPreviewInputs] = useState(null);
    useEffect(() => () => {
        if (feasibilityPreviewUrl) URL.revokeObjectURL(feasibilityPreviewUrl);
    }, [feasibilityPreviewUrl]);
    useEffect(() => {
        if (!savedSuccess) return undefined;
        const timer = setTimeout(() => setSavedSuccess(false), 3000);
        return () => clearTimeout(timer);
    }, [savedSuccess]);

    const handleLocalChange = (field, val) => {
        if (handleChange) handleChange(field, val);
        else setEditData(prev => ({ ...prev, [field]: val }));
    };

    // The final tag locks the tag for everyone except Admin.
    const isLocked = isFinalTagValue(customer.loan_tag, LOAN_TAGS) && user?.userType !== 'admin';

    const handleToggleLoanTag = (tagId) => {
        setEditData(prev => ({ ...prev, loan_tag: tagId }));
        if (STATUS_OPTIONS.some(option => option.value === tagId)) setLoanDraftStatus(tagId);
    };

    const handleSaveLoanTag = async () => {
        const newTag = editData.loan_tag;
        const updatedHistory = Array.isArray(editData.loan_history) ? [...editData.loan_history] : [];
        if (newTag) {
            updatedHistory.push({
                status: newTag,
                date: today,
                remark: 'Status updated via tag selector',
                created_at: new Date().toISOString()
            });
        }
        setEditData(prev => ({ ...prev, loan_history: updatedHistory, loan_tag: newTag }));
        await save(
            { loan_tag: newTag, loan_history: updatedHistory },
            `Loan Tag saved to ${newTag ? tagLabel(LOAN_TAGS, newTag) : 'None'} (logged to history)`,
        );
    };

    const handleClearLoanTag = async () => {
        setEditData(prev => ({ ...prev, loan_tag: null }));
        await save({ loan_tag: null }, 'Cleared Loan Tag');
    };

    // ── Payment structure, read from loan_history ──
    const historyList = Array.isArray(editData.loan_history) ? editData.loan_history : [];
    const getPaymentItem = (statusName) => historyList.find(h => h.status === statusName) || {};

    const quotationPayment = getPaymentItem('Total Quotation').amount !== undefined
        ? getPaymentItem('Total Quotation')
        : getPaymentItem('Quotation');
    const downPayment = getPaymentItem('Down Payment');
    const firstPayment = getPaymentItem(FIRST_PAYMENT);
    const secondPayment = getPaymentItem(SECOND_PAYMENT);

    const quotationAmount = parseIndianNumber(quotationPayment.amount) || 0;
    const downAmount = parseIndianNumber(downPayment.amount) || 0;
    const firstAmount = parseIndianNumber(firstPayment.amount) || 0;
    const secondAmount = parseIndianNumber(secondPayment.amount) || 0;
    const totalReceived = downAmount + firstAmount + secondAmount;
    const leftToReceive = quotationAmount > 0 ? (quotationAmount - totalReceived) : 0;

    const currentTag = editData.loan_tag;
    const isFirstPaymentTag = currentTag === FIRST_PAYMENT;
    const isSecondPaymentTag = currentTag === SECOND_PAYMENT;
    const isAllClearTag = !currentTag || currentTag === FINAL_TAG;

    // The breakdown is shown only for the payment tags and once everything is received.
    const showPaymentBreakdown = isFirstPaymentTag || isSecondPaymentTag || isAllClearTag;

    const canEditDown = isEditable && (isCustomEditing || isFirstPaymentTag);
    const canEditFirst = isEditable && (isCustomEditing || isFirstPaymentTag);
    const canEditSecond = isEditable && (isCustomEditing || isSecondPaymentTag);

    const updatePaymentInHistory = (statusName, field, value) => {
        setIsPaymentsDirty(true);
        const list = [...historyList];
        const idx = list.findIndex(h => h.status === statusName);
        if (idx >= 0) {
            list[idx] = { ...list[idx], [field]: value, date: field === 'date' ? value : (list[idx].date || today) };
        } else {
            list.push({
                status: statusName,
                amount: field === 'amount' ? value : '',
                date: field === 'date' ? value : today,
                remark: field === 'remark' ? value : '',
                created_at: new Date().toISOString()
            });
        }
        setEditData(prev => ({ ...prev, loan_history: list }));
    };

    const handleSavePayments = async () => {
        const saved = await save(
            { loan_history: editData.loan_history },
            `Updated loan payment figures (Quotation: ${formatINR(quotationAmount, { zero: '₹0' })}, Received: ${formatINR(totalReceived, { zero: '₹0' })})`,
        );
        if (!saved) return;
        setSavedSuccess(true);
        setIsPaymentsDirty(false);
        setIsCustomEditing(false);
    };

    const handleAddEntry = async () => {
        const entryDate = loanDraftDate || today;
        const updatedHistory = [...historyList, {
            status: loanDraftStatus,
            date: entryDate,
            remark: loanDraftRemark,
            created_at: new Date().toISOString()
        }];
        setEditData(prev => ({ ...prev, loan_history: updatedHistory, loan_tag: loanDraftStatus }));
        const saved = await save(
            { loan_history: updatedHistory, loan_tag: loanDraftStatus },
            `Added loan entry (${tagLabel(LOAN_TAGS, loanDraftStatus)} on ${entryDate}${loanDraftRemark ? `: ${loanDraftRemark}` : ''})`,
        );
        if (!saved) return;
        setLoanDraftRemark('');
        setLoanDraftDate(today);
    };

    const timelineEntries = historyList.filter(e => !PAYMENT_ROWS.includes(e.status));

    // ── Feasibility report ──
    const hasFeasibilityDoc = documents.some(doc => doc?.doc_type === 'site_feasibility');
    const generateLabel = !filesOn ? 'Download PDF' : hasFeasibilityDoc ? 'Replace in Documents' : 'Add to Documents';

    const getFeasibilityInputs = async ({ allowIncomplete = false } = {}) => {
        const { mapFeasibilityReport, getMissingFeasibilityFields } = await loadFeasibility();
        const data = mapFeasibilityReport(editData);
        const missing = getMissingFeasibilityFields(data);
        if (!allowIncomplete && missing.length) {
            showAlert(
                `Please fill these values first:\n\n${missing.map(item => `• ${item.field} - ${item.tab} tab`).join('\n')}`,
                { title: 'Feasibility report is incomplete', type: 'warning' }
            );
            return null;
        }
        return { data, missing };
    };

    const handlePreviewFeasibility = async () => {
        if (feasibilityBusy) return;
        // Mobile browsers generally cannot render a blob PDF inside an iframe;
        // they replace it with a restricted "Open" placeholder. Open a tab
        // synchronously (before PDF generation awaits) so popup blockers still
        // recognise it as a direct user action, then send the finished preview
        // to the phone's full-screen native PDF viewer.
        const useNativeMobileViewer = shouldUseNativeMobilePdfViewer();
        const mobilePreviewTab = useNativeMobileViewer ? window.open('', '_blank') : null;
        setFeasibilityBusy(true);
        try {
            const inputs = await getFeasibilityInputs({ allowIncomplete: true });
            if (!inputs) {
                mobilePreviewTab?.close();
                return;
            }
            const { createFeasibilityPdf } = await loadFeasibility();
            const blob = await createFeasibilityPdf(inputs.data, { highlightMapped: true });
            if (feasibilityPreviewUrl) URL.revokeObjectURL(feasibilityPreviewUrl);
            // Keep the exact values and validation state used to open this
            // preview. Uploading the generated PDF triggers a realtime customer
            // refresh; that must not make the document action disappear.
            setFeasibilityPreviewInputs(inputs);
            const previewUrl = URL.createObjectURL(blob);
            if (useNativeMobileViewer && mobilePreviewTab) {
                mobilePreviewTab.opener = null;
                mobilePreviewTab.location.replace(previewUrl);
                // Give the external viewer enough time to finish reading the
                // blob without retaining it for the rest of the CRM session.
                window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5 * 60 * 1000);
            } else {
                // Desktop keeps the inline preview. This is also the safe
                // fallback if a phone blocks opening the new tab.
                setFeasibilityPreviewUrl(previewUrl);
            }
        } catch (error) {
            mobilePreviewTab?.close();
            showAlert(error.message || 'The feasibility preview could not be created.', { type: 'error' });
        } finally { setFeasibilityBusy(false); }
    };

    const handleGenerateFeasibility = async () => {
        if (feasibilityBusy) return;
        setFeasibilityBusy(true);
        try {
            const inputs = feasibilityPreviewInputs?.missing?.length === 0
                ? feasibilityPreviewInputs
                : await getFeasibilityInputs();
            if (!inputs) return;
            const { createFeasibilityPdf } = await loadFeasibility();
            const blob = await createFeasibilityPdf(inputs.data);
            const safeName = (inputs.data.consumerName || 'Customer').replace(/[^a-z0-9]+/gi, '_');
            const fileName = `Feasibility_Report_${safeName}.pdf`;
            if (!filesOn) {
                downloadBlob(blob, 'application/pdf', fileName);
                setFeasibilityPreviewUrl('');
                return;
            }
            const file = new File([blob], fileName, { type: 'application/pdf' });
            const uploaded = await onFileUpload({ target: { files: [file], value: '' } }, 'site_feasibility');
            if (uploaded) {
                setFeasibilityPreviewUrl('');
                showAlert(
                    hasFeasibilityDoc
                        ? 'The feasibility report was regenerated and replaced in Documents.'
                        : 'The feasibility report was generated and added to Documents.',
                    { title: 'Document saved', type: 'success' }
                );
            }
        } catch (error) {
            showAlert(error.message || 'The feasibility report could not be generated.', { type: 'error' });
        } finally { setFeasibilityBusy(false); }
    };

    const generateButton = (
        <button type="button" onClick={handleGenerateFeasibility} disabled={feasibilityBusy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
            {feasibilityBusy ? <Spinner size={13} /> : filesOn ? <Upload size={13} aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
            {generateLabel}
        </button>
    );

    if (editData.payment_type?.trim().toLowerCase() !== 'loan') {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-xs font-semibold text-amber-700 animate-in fade-in duration-300">
                This customer's payment type is "{editData.payment_type || 'not specified'}" (not Loan). Loan tracking is not applicable.
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <SectionCard
                title="Application Details"
                icon={ClipboardList}
                actions={isEditable && (
                    <button
                        type="button"
                        onClick={() => setIsEditingAppDetails(open => !open)}
                        aria-pressed={isEditingAppDetails}
                        aria-label={isEditingAppDetails ? 'Stop editing application details' : 'Edit application details'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
                    >
                        {isEditingAppDetails ? <X size={16} aria-hidden="true" /> : <Edit3 size={15} aria-hidden="true" />}
                    </button>
                )}
            >
                {isEditingAppDetails ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <Field label="Loan By" htmlFor="loan-by">
                            <Select
                                id="loan-by"
                                options={loanStaff}
                                placeholder="Select…"
                                value={editData.loan_by}
                                onChange={async (event) => {
                                    const nextValue = event.target.value;
                                    handleLocalChange('loan_by', nextValue);
                                    await save({ loan_by: nextValue || null }, `Updated Loan By to ${nextValue || 'None'}`);
                                }}
                            />
                        </Field>
                        <Field label="Total Quotation Amount (₹)" htmlFor="loan-quotation">
                            <Input
                                id="loan-quotation"
                                inputMode="decimal"
                                placeholder="e.g. 3,50,000"
                                value={quotationPayment.amount ? formatInputValue(quotationPayment.amount) : ''}
                                onChange={(e) => updatePaymentInHistory('Total Quotation', 'amount', formatInputValue(e.target.value))}
                                onBlur={() => { if (isPaymentsDirty) handleSavePayments(); }}
                            />
                        </Field>
                        <Field label="Jansamarth Application No" required htmlFor="loan-jansamarth">
                            <Input
                                id="loan-jansamarth"
                                placeholder="Enter number..."
                                value={editData.jansamarth_application_no || ''}
                                onChange={(e) => handleLocalChange('jansamarth_application_no', e.target.value)}
                                onBlur={(e) => {
                                    if (editData.jansamarth_application_no !== customer.jansamarth_application_no) {
                                        save({ jansamarth_application_no: e.target.value }, 'Updated Jansamarth Application No');
                                    }
                                }}
                            />
                        </Field>
                        <Field label="Loan Date" htmlFor="loan-date">
                            <Input
                                id="loan-date"
                                type="date"
                                value={editData.loan_registration_date || ''}
                                onChange={(e) => handleLocalChange('loan_registration_date', e.target.value)}
                                onBlur={(e) => {
                                    if (editData.loan_registration_date !== customer.loan_registration_date) {
                                        save({ loan_registration_date: e.target.value || null }, 'Updated Loan Date');
                                    }
                                }}
                            />
                        </Field>
                    </div>
                ) : (
                    <FieldList
                        fields={APP_DETAIL_FIELDS}
                        record={editData}
                        getValue={(record, field) => (field.key === 'quotation_amount' ? (quotationAmount > 0 ? quotationAmount : null) : record[field.key])}
                        className="lg:grid-cols-4"
                    />
                )}
            </SectionCard>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold text-stone-800">Solar Feasibility Report</p>
                        <p className="mt-0.5 text-[11px] font-medium text-stone-600">Preview anytime. Yellow fields show mapped values to verify; the saved PDF has no highlights.</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={handlePreviewFeasibility} disabled={feasibilityBusy}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 disabled:opacity-50 cursor-pointer">
                            <Eye size={13} aria-hidden="true" /> Preview
                        </button>
                        {generateButton}
                    </div>
                </div>
            </section>

            <SectionCard title="Loan Documents" icon={Paperclip}>
                <div className="flex flex-col gap-2">
                    {LOAN_DOCUMENTS.map(doc => (
                        <CheckboxRemarkItem
                            key={doc.field}
                            label={doc.label}
                            field={doc.field}
                            value={editData[doc.field]}
                            onChange={handleLocalChange}
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

            <SectionCard
                title="Loan Tag Tracking"
                icon={Tag}
                actions={isEditable && !isLocked && (
                    <>
                        {editData.loan_tag && (
                            <button type="button" onClick={handleClearLoanTag} className="sf-btn-secondary min-h-11 hover:text-rose-600">
                                Clear Tag
                            </button>
                        )}
                        {editData.loan_tag !== customer.loan_tag && (
                            <button type="button" onClick={handleSaveLoanTag} className="sf-btn-success min-h-11">
                                Save Tag
                            </button>
                        )}
                    </>
                )}
            >
                {isFinalTagValue(customer.loan_tag, LOAN_TAGS) && (
                    <SuccessBanner>Loan settlement completed (locked at "{tagLabel(LOAN_TAGS, customer.loan_tag)}")</SuccessBanner>
                )}
                <TagPicker
                    label="Loan tag"
                    options={LOAN_TAGS}
                    colors={LOAN_TAG_COLORS}
                    columns={8}
                    value={editData.loan_tag}
                    onChange={handleToggleLoanTag}
                    allowDeselect
                    locked={isLocked}
                    disabled={!isEditable}
                />
            </SectionCard>

            {showPaymentBreakdown && (
                <SectionCard
                    title="Loan Payments Breakdown"
                    subtitle={isAllClearTag
                        ? 'Finalized payment summary.'
                        : isSecondPaymentTag
                            ? 'Down payment & 1st payment locked; enter 2nd payment amount.'
                            : 'Enter down payment and 1st payment amounts.'}
                    icon={IndianRupee}
                    tone="green"
                    actions={isEditable && (
                        <button
                            type="button"
                            onClick={() => {
                                const nextEditing = !isCustomEditing;
                                setIsCustomEditing(nextEditing);
                                if (nextEditing) setIsPaymentsDirty(true);
                            }}
                            aria-pressed={isCustomEditing}
                            className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
                        >
                            {isCustomEditing ? <X size={13} aria-hidden="true" /> : <Edit3 size={12} aria-hidden="true" />}
                            <span className="text-[10px] font-bold uppercase">{isCustomEditing ? 'Cancel' : 'Edit All'}</span>
                        </button>
                    )}
                >
                    {savedSuccess && <SuccessBanner>Payment details saved to loan history.</SuccessBanner>}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5 space-y-1.5">
                            <div className="flex items-center justify-between pb-1 border-b border-stone-200/50">
                                <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">Total Quotation Amount (₹)</span>
                                {!isCustomEditing && (
                                    <span className="text-[9px] text-stone-400 font-bold uppercase flex items-center gap-0.5">
                                        <Lock size={8} aria-hidden="true" /> Locked
                                    </span>
                                )}
                            </div>
                            {isCustomEditing ? (
                                <Input
                                    aria-label="Total Quotation Amount"
                                    inputMode="decimal"
                                    placeholder="e.g. 3,50,000"
                                    value={quotationPayment.amount ? formatInputValue(quotationPayment.amount) : ''}
                                    onChange={e => updatePaymentInHistory('Total Quotation', 'amount', formatInputValue(e.target.value))}
                                />
                            ) : (
                                <p className="py-0.5 text-base font-bold text-stone-800">{formatINR(quotationAmount)}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <PaymentCard
                            title="Down Payment" entry={downPayment} amount={downAmount} editable={canEditDown}
                            lockNote={<><Lock size={8} aria-hidden="true" /> View</>}
                            amountPlaceholder="e.g. 25,000" remarkLabel="Mode / Remark" remarkPlaceholder="Cash / UPI / Cheque..."
                            today={today} onChange={(field, value) => updatePaymentInHistory('Down Payment', field, value)}
                        />
                        <PaymentCard
                            title="1st Payment" entry={firstPayment} amount={firstAmount} editable={canEditFirst}
                            lockNote={<><Lock size={8} aria-hidden="true" /> View</>}
                            amountPlaceholder="e.g. 50,000" remarkLabel="Disbursal Ref / Remark" remarkPlaceholder="Ref No..."
                            today={today} onChange={(field, value) => updatePaymentInHistory(FIRST_PAYMENT, field, value)}
                        />
                        <PaymentCard
                            title="2nd Payment" entry={secondPayment} amount={secondAmount} editable={canEditSecond}
                            lockNote={isAllClearTag ? <><Lock size={8} aria-hidden="true" /> View</> : 'Pending'}
                            amountPlaceholder="e.g. 25,000" remarkLabel="Final Disbursal Ref" remarkPlaceholder="Ref No..."
                            today={today} onChange={(field, value) => updatePaymentInHistory(SECOND_PAYMENT, field, value)}
                        />
                    </div>

                    <div className="bg-stone-50 border border-stone-200/80 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-6">
                            <div>
                                <p className="text-[9px] text-stone-500 uppercase font-bold tracking-widest">Total Quotation</p>
                                <p className="text-base font-bold text-stone-900 mt-0.5">{formatINR(quotationAmount)}</p>
                            </div>
                            <div className="border-l border-stone-200 pl-4">
                                <p className="text-[9px] text-emerald-700 uppercase font-bold tracking-widest">Total Received</p>
                                <p className="text-base font-bold text-emerald-800 mt-0.5">{formatINR(totalReceived, { zero: '₹0' })}</p>
                            </div>
                            <div className="border-l border-stone-200 pl-4">
                                <p className="text-[9px] text-stone-500 uppercase font-bold tracking-widest">Left to Receive</p>
                                <p className={`text-base font-bold mt-0.5 ${leftToReceive <= 0 && quotationAmount > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {quotationAmount > 0 ? formatINR(Math.max(0, leftToReceive), { zero: '₹0' }) : '–'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold uppercase">
                                {isAllClearTag ? tagLabel(LOAN_TAGS, FINAL_TAG) : tagLabel(LOAN_TAGS, currentTag)}
                            </span>
                            {isEditable && (
                                <button
                                    type="button"
                                    onClick={handleSavePayments}
                                    className={`min-h-11 px-3 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1 text-white ${
                                        isPaymentsDirty ? 'bg-stone-900 hover:bg-stone-800' : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                >
                                    <CheckCircle2 size={13} aria-hidden="true" /> {isPaymentsDirty ? 'Save Payments' : 'Saved'}
                                </button>
                            )}
                        </div>
                    </div>
                </SectionCard>
            )}

            <SectionCard title="Loan Status Timeline" icon={History} tone="stone">
                {timelineEntries.length === 0 ? (
                    <p className="text-xs text-stone-500 italic">No loan history recorded</p>
                ) : (
                    <ol className="relative border-l border-stone-200 ml-3 pl-4 space-y-3 py-1">
                        {timelineEntries.map((e, idx) => {
                            const colors = LOAN_TAG_COLORS[e.status] || NEUTRAL_PILL;
                            return (
                                <li key={`${e.created_at || ''}-${idx}`} className="relative">
                                    <span className={`absolute -left-[21.5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-white ${colors.dot}`} aria-hidden="true" />
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                {tagLabel(LOAN_TAGS, e.status)}
                                            </span>
                                            {e.remark && <span className="text-xs text-stone-600 font-medium">{e.remark}</span>}
                                        </div>
                                        {e.date && <span className="text-[10px] text-stone-500 font-semibold">{e.date}</span>}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}

                {isEditable && !isLocked && (
                    <div className="bg-stone-50/70 p-3.5 rounded-xl border border-stone-200/70 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                            <Field label="Status" htmlFor="loan-entry-status">
                                <Select id="loan-entry-status" options={STATUS_OPTIONS} value={loanDraftStatus} onChange={e => setLoanDraftStatus(e.target.value)} />
                            </Field>
                            <Field label="Date" htmlFor="loan-entry-date">
                                <Input id="loan-entry-date" type="date" value={loanDraftDate} onChange={e => setLoanDraftDate(e.target.value)} />
                            </Field>
                        </div>
                        <Field label="Remark" htmlFor="loan-entry-remark">
                            <Input id="loan-entry-remark" placeholder="Remark details..." value={loanDraftRemark} onChange={e => setLoanDraftRemark(e.target.value)} />
                        </Field>
                        <div className="flex justify-end pt-1">
                            <button type="button" onClick={handleAddEntry} disabled={!loanDraftStatus} className="sf-btn-success min-h-11">
                                Add Entry
                            </button>
                        </div>
                    </div>
                )}
            </SectionCard>

            <Modal
                open={Boolean(feasibilityPreviewUrl)}
                onClose={() => setFeasibilityPreviewUrl('')}
                title="Solar feasibility report preview"
                size="xl"
                busy={feasibilityBusy}
                footer={generateButton}
            >
                <iframe
                    title="Solar feasibility report preview"
                    src={`${feasibilityPreviewUrl}#toolbar=0&navpanes=0`}
                    className="h-[70vh] w-full rounded-xl border border-stone-200 bg-stone-100"
                />
            </Modal>
        </div>
    );
}
