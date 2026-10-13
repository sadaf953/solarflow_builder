import React, { useEffect, useState } from 'react';
import { History, Paperclip, IndianRupee, CheckCircle2, Lock, Edit3, X, ClipboardList, Upload, Eye, Loader2 } from 'lucide-react';
import { LOAN_TAGS, LOAN_TAG_COLORS, isFinalTagValue } from '../../constants';
import { CheckboxRemarkItem, EditableDetailItem, ChecklistModeToggle } from './shared';
import { toIndianCommas, formatInputValue, parseIndianNumber } from '../../utils';
import { createFeasibilityPdf, getMissingFeasibilityFields, mapFeasibilityReport } from '../../feasibilityReport';
import { useGlobalPopup } from '../GlobalPopup';

const LOAN_STATUS_OPTIONS = ['Processed', 'Sanctioned', 'Rejected', 'Returned', '1st Payment', '2nd Payment'];

const shouldUseNativeMobilePdfViewer = () => typeof window !== 'undefined'
    && window.matchMedia('(max-width: 767px)').matches;

export default function LoanTab({
    customer,
    editData,
    setEditData,
    handleChange,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    meta = {},
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark
}) {
    const { showAlert } = useGlobalPopup();
    const canDeleteDocs = user?.userType === "admin" || user?.userType === "sales" || user?.userType === "office";
    const today = new Date().toISOString().split('T')[0];
    const [loanDraftStatus, setLoanDraftStatus] = useState('Sanctioned');
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

    const handleLocalChange = (field, val) => {
        if (handleChange) {
            handleChange(field, val);
        } else {
            setEditData(prev => ({ ...prev, [field]: val }));
        }
    };

    const handleToggleLoanTag = (tagId) => {
        const newTag = editData.loan_tag === tagId ? null : tagId;
        setEditData(prev => ({ ...prev, loan_tag: newTag }));
        if (newTag) {
            setLoanDraftStatus(newTag);
        }
    };

    const handleSaveLoanTag = async () => {
        const newTag = editData.loan_tag;
        const entryDate = today;
        let updatedHistory = Array.isArray(editData.loan_history) ? [...editData.loan_history] : [];
        
        if (newTag) {
            const newEntry = {
                status: newTag,
                date: entryDate,
                remark: 'Status updated via tag selector',
                created_at: new Date().toISOString()
            };
            updatedHistory.push(newEntry);
        }
        
        setEditData(prev => ({ 
            ...prev, 
            loan_history: updatedHistory,
            loan_tag: newTag
        }));
        
        // A failed save must stop here - otherwise the activity log below
        
        // records a change that never reached the database.
        
        if (await onUpdate(customer.id, {
            loan_tag: newTag,
            loan_history: updatedHistory
        }) === false) return;
        
        const tagLabel = LOAN_TAGS.find(t => t.id === newTag)?.label || newTag;
        await logActivity(
            user.id,
            'update',
            `${customer.customer_name}: Loan Tag saved to ${newTag ? tagLabel : 'None'} (logged to history)`,
            '',
            customer.id
        );
        
        fetchLogs();
    };

    const handleClearLoanTag = async () => {
        setEditData(prev => ({ ...prev, loan_tag: null }));
        // A failed save must stop here - otherwise the activity log below
        // records a change that never reached the database.
        if (await onUpdate(customer.id, { loan_tag: null }) === false) return;
        await logActivity(
            user.id,
            'update',
            `${customer.customer_name}: Cleared Loan Tag (All Clear)`,
            '',
            customer.id
        );
        fetchLogs();
    };

    // ── Payment Structure directly from loan_history ──
    const historyList = Array.isArray(editData.loan_history) ? editData.loan_history : [];

    const getPaymentItem = (statusName) => {
        return historyList.find(h => h.status === statusName) || {};
    };

    const quotationPayment = getPaymentItem('Total Quotation').amount !== undefined
        ? getPaymentItem('Total Quotation')
        : getPaymentItem('Quotation');
    const downPayment = getPaymentItem('Down Payment');
    const firstPayment = getPaymentItem('1st Payment');
    const secondPayment = getPaymentItem('2nd Payment');

    const quotationAmount = parseIndianNumber(quotationPayment.amount) || 0;
    const downAmount = parseIndianNumber(downPayment.amount) || 0;
    const firstAmount = parseIndianNumber(firstPayment.amount) || 0;
    const secondAmount = parseIndianNumber(secondPayment.amount) || 0;
    const totalReceived = downAmount + firstAmount + secondAmount;
    const leftToReceive = quotationAmount > 0 ? (quotationAmount - totalReceived) : 0;

    const currentTag = editData.loan_tag;
    const isFirstPaymentTag = currentTag === '1st Payment';
    const isSecondPaymentTag = currentTag === '2nd Payment';
    const isAllClearTag = !currentTag || currentTag === 'Total Loan Payment Received';

    // Show Payment Breakdown ONLY for 1st Payment, 2nd Payment, or All Clear
    const showPaymentBreakdown = isFirstPaymentTag || isSecondPaymentTag || isAllClearTag;

    // Permissions per stage
    const canEditDown = isCustomEditing || isFirstPaymentTag;
    const canEditFirst = isCustomEditing || isFirstPaymentTag;
    const canEditSecond = isCustomEditing || isSecondPaymentTag;

    const updatePaymentInHistory = (statusName, field, value) => {
        setIsPaymentsDirty(true);
        const list = Array.isArray(editData.loan_history) ? [...editData.loan_history] : [];
        const idx = list.findIndex(h => h.status === statusName);
        
        if (idx >= 0) {
            list[idx] = {
                ...list[idx],
                [field]: value,
                date: field === 'date' ? value : (list[idx].date || today)
            };
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
        // A failed save must stop here - otherwise the activity log below
        // records a change that never reached the database.
        if (await onUpdate(customer.id, { loan_history: editData.loan_history }) === false) return;
        await logActivity(
            user.id,
            'update',
            `${customer.customer_name}: Updated loan payment figures (Quotation: ₹${quotationAmount.toLocaleString('en-IN')}, Received: ₹${totalReceived.toLocaleString('en-IN')})`,
            '',
            customer.id
        );
        setSavedSuccess(true);
        setIsPaymentsDirty(false);
        setTimeout(() => setSavedSuccess(false), 3000);
        setIsCustomEditing(false);
        fetchLogs();
    };

    // Filter timeline entries for general status history (excluding internal payment item rows)
    const timelineEntries = historyList.filter(e => !['Down Payment', 'Total Quotation', 'Quotation'].includes(e.status));

    const getFeasibilityInputs = async ({ allowIncomplete = false } = {}) => {
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
                // Desktop keeps the inline modal. This is also the safe fallback
                // if a phone blocks opening the new tab.
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
            const blob = await createFeasibilityPdf(inputs.data);
            const safeName = (inputs.data.consumerName || 'Customer').replace(/[^a-z0-9]+/gi, '_');
            const file = new File([blob], `Feasibility_Report_${safeName}.pdf`, { type: 'application/pdf' });
            const uploaded = await onFileUpload({ target: { files: [file], value: '' } }, 'site_feasibility');
            if (uploaded) {
                setFeasibilityPreviewUrl('');
                showAlert(
                    documents.some(doc => doc?.doc_type === 'site_feasibility')
                        ? 'The feasibility report was regenerated and replaced in Documents.'
                        : 'The feasibility report was generated and added to Documents.',
                    { title: 'Document saved', type: 'success' }
                );
            }
        } catch (error) {
            showAlert(error.message || 'The feasibility report could not be generated.', { type: 'error' });
        } finally { setFeasibilityBusy(false); }
    };

    return (
        <>
        <div className="space-y-5 animate-in fade-in duration-300">
            {editData.payment_type?.trim().toLowerCase() !== 'loan' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-xs font-semibold text-amber-700">
                    This customer's payment type is "{editData.payment_type || 'not specified'}" (not Loan). Loan tracking is not applicable.
                </div>
            ) : (
                <>
                    {/* Loan Application Details */}
                    <section className="bg-white p-5 rounded-2xl border border-stone-200/70 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                <ClipboardList size={12} className="text-amber-500" /> Application Details
                            </h4>
                            {isEditable && (
                                <button 
                                    type="button"
                                    onClick={() => setIsEditingAppDetails(!isEditingAppDetails)}
                                    className="text-stone-400 hover:text-amber-600 transition-colors p-1 cursor-pointer"
                                >
                                    {isEditingAppDetails ? <X size={14} /> : <Edit3 size={13} />}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="p-1">
                                <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1.5 font-bold">Loan By</p>
                                {isEditingAppDetails ? (
                                    <select
                                        value={editData.loan_by || ''}
                                        onChange={async (event) => {
                                            const nextValue = event.target.value;
                                            handleLocalChange('loan_by', nextValue);
                                            if (await onUpdate(customer.id, { loan_by: nextValue || null }) === false) return;
                                            await logActivity(user.id, 'update', `${customer.customer_name}: Updated Loan By to ${nextValue || 'None'}`, '', customer.id);
                                            fetchLogs();
                                        }}
                                        className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-sm"
                                    >
                                        <option value="">Select...</option>
                                        {editData.loan_by && !(meta['registration_by'] || []).includes(editData.loan_by) && (
                                            <option value={editData.loan_by}>{editData.loan_by}</option>
                                        )}
                                        {(meta['registration_by'] || []).map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                ) : (
                                    <p className="text-xs font-bold text-stone-800 break-words">{editData.loan_by || '–'}</p>
                                )}
                            </div>
                            <div className="p-1">
                                <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1.5 font-bold">Total Quotation Amount (₹)</p>
                                {isEditingAppDetails ? (
                                    <input 
                                        type="text" 
                                        placeholder="e.g. 3,50,000"
                                        value={quotationPayment.amount ? formatInputValue(quotationPayment.amount) : ''}
                                        onChange={(e) => updatePaymentInHistory('Total Quotation', 'amount', formatInputValue(e.target.value))}
                                        onBlur={async () => {
                                            if (isPaymentsDirty) {
                                                await handleSavePayments();
                                            }
                                        }}
                                        className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-sm text-stone-900"
                                    />
                                ) : (
                                    <p className="text-xs font-bold text-stone-800 break-words">{quotationAmount > 0 ? `₹${toIndianCommas(quotationAmount)}` : '–'}</p>
                                )}
                            </div>
                            <div className="p-1">
                                <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1.5 font-bold">Jansamarth Application No <span className="text-red-500 font-bold">*</span></p>
                                {isEditingAppDetails ? (
                                    <input 
                                        type="text" 
                                        placeholder="Enter number..."
                                        value={editData.jansamarth_application_no || ''}
                                        onChange={(e) => handleLocalChange('jansamarth_application_no', e.target.value)}
                                        onBlur={async (e) => {
                                            if (editData.jansamarth_application_no !== customer.jansamarth_application_no) {
                                                // A failed save must stop here - otherwise the activity log below
                                                // records a change that never reached the database.
                                                if (await onUpdate(customer.id, { jansamarth_application_no: e.target.value }) === false) return;
                                                await logActivity(user.id, 'update', `${customer.customer_name}: Updated Jansamarth Application No`, '', customer.id);
                                                fetchLogs();
                                            }
                                        }}
                                        className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-sm"
                                    />
                                ) : (
                                    <p className="text-xs font-bold text-stone-800 break-words">{editData.jansamarth_application_no || '–'}</p>
                                )}
                            </div>
                            <div className="p-1">
                                <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1.5 font-bold">Loan Date</p>
                                {isEditingAppDetails ? (
                                    <input
                                        type="date"
                                        placeholder=""
                                        value={editData.loan_registration_date || ''}
                                        onChange={(e) => handleLocalChange('loan_registration_date', e.target.value)}
                                        onBlur={async (e) => {
                                            if (editData.loan_registration_date !== customer.loan_registration_date) {
                                                // A failed save must stop here - otherwise the activity log below
                                                // records a change that never reached the database.
                                                if (await onUpdate(customer.id, { loan_registration_date: e.target.value || null }) === false) return;
                                                await logActivity(user.id, 'update', `${customer.customer_name}: Updated Loan Date`, '', customer.id);
                                                fetchLogs();
                                            }
                                        }}
                                        className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-sm"
                                    />
                                ) : (
                                    <p className="text-xs font-bold text-stone-800 break-words">{editData.loan_registration_date || '–'}</p>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold text-stone-800">Solar Feasibility Report</p>
                                <p className="mt-0.5 text-[10px] font-medium text-stone-500">Preview anytime. Yellow fields show mapped values to verify; the saved PDF has no highlights.</p>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={handlePreviewFeasibility} disabled={feasibilityBusy}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[10px] font-bold text-stone-700 disabled:opacity-50 cursor-pointer">
                                    <Eye size={13} /> Preview
                                </button>
                                <button type="button" onClick={handleGenerateFeasibility} disabled={feasibilityBusy}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">
                                    {feasibilityBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                    {documents.some(doc => doc?.doc_type === 'site_feasibility') ? 'Replace in Documents' : 'Add to Documents'}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* 1. Loan Documents Checklist */}
                    <section className="bg-white p-5 rounded-2xl border border-stone-200/70 shadow-xs space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                            <h4 className="text-[10px] font-bold text-stone-700 uppercase tracking-widest flex items-center gap-1.5">
                                <Paperclip size={12} className="text-amber-500" /> Loan Documents
                            </h4>
                        </div>

                        <div className="flex flex-col gap-2">
                            

                            <CheckboxRemarkItem
                                label="Vendor Feasibility"
                                field="vendor_feasibility"
                                value={editData.vendor_feasibility}
                                onChange={handleLocalChange}
                                isEditing={isEditable}
                                documents={documents}
                                onUpload={onFileUpload}
                                onDelete={onFileDelete}
                                onPreview={onFilePreview}
                                onUpdateRemark={onUpdateRemark}
                                canDelete={canDeleteDocs}
                            />
                            <CheckboxRemarkItem
                                label="Site Feasibility"
                                field="site_feasibility"
                                value={editData.site_feasibility}
                                onChange={handleLocalChange}
                                isEditing={isEditable}
                                documents={documents}
                                onUpload={onFileUpload}
                                onDelete={onFileDelete}
                                onPreview={onFilePreview}
                                onUpdateRemark={onUpdateRemark}
                                canDelete={canDeleteDocs}
                            />
                            <CheckboxRemarkItem
                                label="Digital Certificate"
                                field="digital_certificate"
                                value={editData.digital_certificate}
                                onChange={handleLocalChange}
                                isEditing={isEditable}
                                documents={documents}
                                onUpload={onFileUpload}
                                onDelete={onFileDelete}
                                onPreview={onFilePreview}
                                onUpdateRemark={onUpdateRemark}
                                canDelete={canDeleteDocs}
                            />
                        </div>
                    </section>

                    {/* 2. Loan Tag Selector */}
                    <section className="bg-white p-5 rounded-2xl border border-stone-200/70 shadow-xs space-y-3">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                            <label className="text-[10px] text-stone-400 font-bold uppercase tracking-widest block">Loan Tag Tracking</label>
                            <div className="flex items-center gap-2">
                                {isEditable && editData.loan_tag && (
                                    <button
                                        onClick={handleClearLoanTag}
                                        className="bg-stone-50 hover:bg-rose-50 hover:text-rose-600 text-stone-500 border border-stone-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                                        title="Clear active loan tag"
                                    >
                                        Clear Tag
                                    </button>
                                )}
                                {isEditable && editData.loan_tag !== customer.loan_tag && (
                                    <button
                                        onClick={handleSaveLoanTag}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all shadow-xs cursor-pointer"
                                    >
                                        Save Tag
                                    </button>
                                )}
                            </div>
                        </div>

                        {customer.loan_tag === 'Total Loan Payment Received' && (
                            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold mb-2">
                                <CheckCircle2 size={15} className="text-emerald-600" />
                                <span>Loan Settlement Completed (Locked to "All Clear")</span>
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 w-full">
                            {LOAN_TAGS.map(tag => {
                                const isSelected = editData.loan_tag === tag.id;
                                const colors = LOAN_TAG_COLORS[tag.id] || {};
                                // 'All Clear' no longer exists; the terminal value now comes from the constant.
                                const isLocked = isFinalTagValue(customer.loan_tag, LOAN_TAGS) && user?.userType !== 'admin';
                                return (
                                    <button
                                        key={tag.id}
                                        disabled={!isEditable || isLocked}
                                        onClick={() => !isLocked && handleToggleLoanTag(tag.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 w-full ${
                                            isLocked && !tag.isFinal ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                        } ${
                                            isSelected
                                                ? `${colors.bg} ${colors.text} ${colors.border} shadow-2xs`
                                                : 'bg-stone-50/60 hover:bg-stone-100 border-stone-200 text-stone-600'
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${isSelected ? colors.dot : 'bg-stone-300'}`} />
                                        {tag.label}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* 3. Classy Loan Payment Breakdown (Only shown for 1st Payment, 2nd Payment, All Clear) */}
                    {showPaymentBreakdown && (
                        <section className="bg-white p-5 rounded-2xl border border-stone-200/70 shadow-xs space-y-4 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                                <div>
                                    <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <IndianRupee size={12} className="text-emerald-600" /> Loan Payments Breakdown
                                    </h4>
                                    <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                                        {isAllClearTag 
                                            ? 'Finalized payment summary.' 
                                            : isSecondPaymentTag 
                                                ? 'Down payment & 1st payment locked; enter 2nd payment amount.' 
                                                : 'Enter down payment and 1st payment amounts.'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isEditable && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextEditing = !isCustomEditing;
                                                setIsCustomEditing(nextEditing);
                                                if (nextEditing) setIsPaymentsDirty(true);
                                            }}
                                            className="text-stone-400 hover:text-amber-600 text-xs font-semibold flex items-center gap-1 p-1 cursor-pointer transition-colors"
                                        >
                                            {isCustomEditing ? <X size={13} /> : <Edit3 size={12} />}
                                            <span className="text-[10px] font-bold uppercase">{isCustomEditing ? 'Cancel' : 'Edit All'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {savedSuccess && (
                                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-2 animate-in fade-in">
                                    <CheckCircle2 size={14} className="text-emerald-600" /> Payment details saved to loan history!
                                </div>
                            )}

                            {/* Total Quotation Amount */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5 space-y-1.5">
                                    <div className="flex items-center justify-between pb-1 border-b border-stone-200/50">
                                        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                                            Total Quotation Amount (₹)
                                        </span>
                                        {!isCustomEditing && (
                                            <span className="text-[9px] text-stone-400 font-bold uppercase flex items-center gap-0.5">
                                                <Lock size={8} /> Locked
                                            </span>
                                        )}
                                    </div>
                                    {isCustomEditing ? (
                                        <div>
                                            <input
                                                type="text"
                                                placeholder="e.g. 3,50,000"
                                                value={quotationPayment.amount ? formatInputValue(quotationPayment.amount) : ''}
                                                onChange={e => updatePaymentInHistory('Total Quotation', 'amount', formatInputValue(e.target.value))}
                                                className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none focus:border-amber-400"
                                            />
                                        </div>
                                    ) : (
                                        <div className="py-0.5">
                                            <p className="text-base font-bold text-stone-800">
                                                {quotationAmount > 0 ? `₹${toIndianCommas(quotationAmount)}` : '–'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Down Payment Card */}
                                <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between pb-1 border-b border-stone-200/50">
                                        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                                            Down Payment
                                        </span>
                                        {!canEditDown && (
                                            <span className="text-[9px] text-stone-400 font-bold uppercase flex items-center gap-0.5">
                                                <Lock size={8} /> View
                                            </span>
                                        )}
                                    </div>
                                    {canEditDown ? (
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Amount (₹)</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 25,000"
                                                    value={downPayment.amount ? formatInputValue(downPayment.amount) : ''}
                                                    onChange={e => updatePaymentInHistory('Down Payment', 'amount', formatInputValue(e.target.value))}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Date</label>
                                                <input
                                                    type="date"
                                                    value={downPayment.date || today}
                                                    onChange={e => updatePaymentInHistory('Down Payment', 'date', e.target.value)}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Mode / Remark</label>
                                                <input
                                                    type="text"
                                                    placeholder="Cash / UPI / Cheque..."
                                                    value={downPayment.remark || ''}
                                                    onChange={e => updatePaymentInHistory('Down Payment', 'remark', e.target.value)}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 py-1">
                                            <p className="text-base font-bold text-stone-800">
                                                {downAmount > 0 ? `₹${toIndianCommas(downAmount)}` : '–'}
                                            </p>
                                            <p className="text-[10px] text-stone-400">Date: <span className="font-medium text-stone-600">{downPayment.date || '–'}</span></p>
                                            {downPayment.remark && <p className="text-[10px] text-stone-500 italic truncate">{downPayment.remark}</p>}
                                        </div>
                                    )}
                                </div>

                                {/* 1st Payment Card */}
                                <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between pb-1 border-b border-stone-200/50">
                                        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                                            1st Payment
                                        </span>
                                        {!canEditFirst && (
                                            <span className="text-[9px] text-stone-400 font-bold uppercase flex items-center gap-0.5">
                                                <Lock size={8} /> View
                                            </span>
                                        )}
                                    </div>
                                    {canEditFirst ? (
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Amount (₹)</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 50,000"
                                                    value={firstPayment.amount ? formatInputValue(firstPayment.amount) : ''}
                                                    onChange={e => updatePaymentInHistory('1st Payment', 'amount', formatInputValue(e.target.value))}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Date</label>
                                                <input
                                                    type="date"
                                                    value={firstPayment.date || today}
                                                    onChange={e => updatePaymentInHistory('1st Payment', 'date', e.target.value)}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Disbursal Ref / Remark</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ref No..."
                                                    value={firstPayment.remark || ''}
                                                    onChange={e => updatePaymentInHistory('1st Payment', 'remark', e.target.value)}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 py-1">
                                            <p className="text-base font-bold text-stone-800">
                                                {firstAmount > 0 ? `₹${toIndianCommas(firstAmount)}` : '–'}
                                            </p>
                                            <p className="text-[10px] text-stone-400">Date: <span className="font-medium text-stone-600">{firstPayment.date || '–'}</span></p>
                                            {firstPayment.remark && <p className="text-[10px] text-stone-500 italic truncate">{firstPayment.remark}</p>}
                                        </div>
                                    )}
                                </div>

                                {/* 2nd Payment Card */}
                                <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between pb-1 border-b border-stone-200/50">
                                        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                                            2nd Payment
                                        </span>
                                        {!canEditSecond && (
                                            <span className="text-[9px] text-stone-400 font-bold uppercase flex items-center gap-0.5">
                                                {isAllClearTag ? <><Lock size={8} /> View</> : 'Pending'}
                                            </span>
                                        )}
                                    </div>
                                    {canEditSecond ? (
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Amount (₹)</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 25,000"
                                                    value={secondPayment.amount ? formatInputValue(secondPayment.amount) : ''}
                                                    onChange={e => updatePaymentInHistory('2nd Payment', 'amount', formatInputValue(e.target.value))}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-800 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Date</label>
                                                <input
                                                    type="date"
                                                    value={secondPayment.date || today}
                                                    onChange={e => updatePaymentInHistory('2nd Payment', 'date', e.target.value)}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wide block mb-0.5">Final Disbursal Ref</label>
                                                <input
                                                    type="text"
                                                    placeholder="Ref No..."
                                                    value={secondPayment.remark || ''}
                                                    onChange={e => updatePaymentInHistory('2nd Payment', 'remark', e.target.value)}
                                                    className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 py-1">
                                            <p className="text-base font-bold text-stone-800">
                                                {secondAmount > 0 ? `₹${toIndianCommas(secondAmount)}` : '–'}
                                            </p>
                                            <p className="text-[10px] text-stone-400">Date: <span className="font-medium text-stone-600">{secondPayment.date || '–'}</span></p>
                                            {secondPayment.remark && <p className="text-[10px] text-stone-500 italic truncate">{secondPayment.remark}</p>}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Classy Bottom Summary Bar */}
                            <div className="bg-stone-50 border border-stone-200/80 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-6">
                                    <div>
                                        <p className="text-[9px] text-stone-400 uppercase font-bold tracking-widest">Total Quotation</p>
                                        <p className="text-base font-bold text-stone-900 mt-0.5">
                                            {quotationAmount > 0 ? `₹${toIndianCommas(quotationAmount)}` : '–'}
                                        </p>
                                    </div>
                                    <div className="border-l border-stone-200 pl-4">
                                        <p className="text-[9px] text-emerald-700 uppercase font-bold tracking-widest">Total Received</p>
                                        <p className="text-base font-bold text-emerald-800 mt-0.5">
                                            ₹{toIndianCommas(totalReceived)}
                                        </p>
                                    </div>
                                    <div className="border-l border-stone-200 pl-4">
                                        <p className="text-[9px] text-stone-400 uppercase font-bold tracking-widest">Left to Receive</p>
                                        <p className={`text-base font-bold mt-0.5 ${leftToReceive <= 0 && quotationAmount > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {quotationAmount > 0 ? `₹${toIndianCommas(Math.max(0, leftToReceive))}` : '–'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold uppercase">
                                        {isAllClearTag ? 'Total Received' : (currentTag || 'Active')}
                                    </span>

                                    {isEditable && (
                                        <button
                                            type="button"
                                            onClick={handleSavePayments}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1 ${
                                                isPaymentsDirty
                                                    ? 'bg-stone-900 hover:bg-stone-800 text-white'
                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            }`}
                                        >
                                            <CheckCircle2 size={13} /> {isPaymentsDirty ? 'Save Payments' : 'Saved'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* 4. Loan Status Timeline */}
                    <section className="bg-white p-5 rounded-2xl border border-stone-200/70 shadow-xs space-y-3">
                        <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                            <History size={14} className="text-stone-400" />
                            <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Loan Status Timeline</h3>
                        </div>

                        {(!timelineEntries || timelineEntries.length === 0) ? (
                            <p className="text-xs text-stone-400 italic">No loan history recorded</p>
                        ) : (
                            <div className="relative border-l border-stone-200 ml-3 pl-4 space-y-3 py-1">
                                {timelineEntries.map((e, idx) => {
                                    const pillColors = {
                                        Sanctioned: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
                                        Rejected: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
                                        Returned: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
                                        '1st Payment': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400' },
                                        '2nd Payment': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-400' },
                                    };
                                    const colors = pillColors[e.status] || { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200', dot: 'bg-stone-400' };
                                    return (
                                        <div key={idx} className="relative">
                                            <span className={`absolute -left-[21.5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-white ${colors.dot}`} />
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                        {e.status}
                                                    </span>
                                                    {e.remark && <span className="text-xs text-stone-600 font-medium">{e.remark}</span>}
                                                </div>
                                                {e.date && <span className="text-[10px] text-stone-400 font-semibold">{e.date}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Add Manual Loan Entry */}
                        {isEditable && (
                            <div className="pt-2">
                                <div className="bg-stone-50/70 p-3.5 rounded-xl border border-stone-200/70 space-y-2.5">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Status</label>
                                            <select
                                                value={loanDraftStatus}
                                                onChange={e => setLoanDraftStatus(e.target.value)}
                                                className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400"
                                            >
                                                {LOAN_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Date</label>
                                            <input
                                                type="date"
                                                value={loanDraftDate}
                                                onChange={e => setLoanDraftDate(e.target.value)}
                                                className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Remark</label>
                                        <input
                                            type="text"
                                            placeholder="Remark details..."
                                            value={loanDraftRemark}
                                            onChange={e => setLoanDraftRemark(e.target.value)}
                                            className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400"
                                        />
                                    </div>
                                    <div className="flex justify-end pt-1">
                                        <button
                                            onClick={async () => {
                                                const entryDate = loanDraftDate || today;
                                                const newEntry = {
                                                    status: loanDraftStatus,
                                                    date: entryDate,
                                                    remark: loanDraftRemark,
                                                    created_at: new Date().toISOString()
                                                };
                                                const updatedHistory = [...(editData.loan_history || []), newEntry];
                                                
                                                setEditData(prev => ({ 
                                                    ...prev, 
                                                    loan_history: updatedHistory,
                                                    loan_tag: loanDraftStatus
                                                }));
                                                // A failed save must stop here - otherwise the activity log below
                                                // records a change that never reached the database.
                                                if (await onUpdate(customer.id, { 
                                                    loan_history: updatedHistory,
                                                    loan_tag: loanDraftStatus
                                                }) === false) return;
                                                
                                                await logActivity(
                                                    user.id,
                                                    'update',
                                                    `${customer.customer_name}: Added loan entry (${loanDraftStatus} on ${entryDate}${loanDraftRemark ? `: ${loanDraftRemark}` : ''})`,
                                                    '',
                                                    customer.id
                                                );
                                                
                                                setLoanDraftRemark('');
                                                setLoanDraftDate(today);
                                                fetchLogs();
                                            }}
                                            className="px-3 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                                        >
                                            Add Entry
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
        {feasibilityPreviewUrl && (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onClick={() => setFeasibilityPreviewUrl('')}>
                <div className="flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
                    <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-stone-700 bg-stone-900 px-3">
                        <button type="button" onClick={handleGenerateFeasibility} disabled={feasibilityBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50 cursor-pointer">
                            {feasibilityBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            {documents.some(doc => doc?.doc_type === 'site_feasibility') ? 'Replace in Documents' : 'Add to Documents'}
                        </button>
                        <button type="button" aria-label="Close feasibility preview" onClick={() => setFeasibilityPreviewUrl('')} className="rounded-lg p-2 text-white hover:bg-white/10 cursor-pointer"><X size={18} /></button>
                    </div>
                    <iframe
                        title="Solar feasibility report preview"
                        src={`${feasibilityPreviewUrl}#toolbar=0&navpanes=0`}
                        className="min-h-0 flex-1 bg-stone-100"
                    />
                </div>
            </div>
        )}
        </>
    );
}
