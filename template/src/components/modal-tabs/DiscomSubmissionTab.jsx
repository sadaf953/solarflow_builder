import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { ClipboardList, Save, FileText, Printer, RotateCcw, AlertTriangle, CheckCircle2, SendHorizonal, Loader2, Upload } from 'lucide-react';
import { Page1 } from '../agreement/Page1';
import { CheckboxRemarkItem, ChecklistModeToggle } from './shared';
import { formatDateToDDMMYYYY } from '../../utils';

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
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    meta = {}
}) {
    const storedSubmissionData = editData.discom_submission || {};
    const submissionData = {
        ...storedSubmissionData,
        date: storedSubmissionData.date || new Date().toISOString().split('T')[0],
        first_party: storedSubmissionData.first_party || customer.customer_name || '',
        second_party: storedSubmissionData.second_party || 'SOLARFLOW DEMO ENERGY',
        purchased_party: storedSubmissionData.purchased_party || 'SOLARFLOW DEMO ENERGY',
    };
    const isStampSent = !!submissionData.stamp_sent;
    const isSentToStampMaker = !!submissionData.sent_to_stamp_maker;

    const [sendBackRemark, setSendBackRemark] = useState('');
    const [sendingBack, setSendingBack] = useState(false);
    const [sendBackDone, setSendBackDone] = useState(false);
    const [sendingToStamp, setSendingToStamp] = useState(false);
    // Stamp makers come from the actual login accounts (profiles.user_type =
    // 'stamp'), not a separate name list - a separate list drifts from the real
    // accounts, which is how a fabricated vendor ended up on live customers.
    const [stampMakers, setStampMakers] = useState([]);
    const [selectedStampMaker, setSelectedStampMaker] = useState('');
    const [reassigning, setReassigning] = useState(false);
    const [reassignConfirm, setReassignConfirm] = useState(null); // { from, to }
    const [recalling, setRecalling] = useState(false);
    const [showConfirmSend, setShowConfirmSend] = useState(false);
    const [showConfirmRecall, setShowConfirmRecall] = useState(false);
    const [approvingStamp, setApprovingStamp] = useState(false);
    const [showResendBox, setShowResendBox] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [staffList, setStaffList] = useState([]);

    React.useEffect(() => {
        const staff = meta['registration_by'] || [];
        setStaffList(staff);
    }, [meta]);

    const canDeleteDocs = user?.userType === "admin" || user?.userType === "sales" || user?.userType === "office";

    const isDiscomDetailsEditable = isEditable || 
        user?.userType === 'sales' || 
        user?.userType === 'admin' || 
        user?.userType === 'channel_partner_office';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('demo_profiles')
                .select('id, name')
                .eq('user_type', 'stamp')
                .neq('status', 'inactive')
                .order('name');
            if (error) {
                console.warn('Could not load stamp makers:', error.message);
                return;
            }
            if (!cancelled) setStampMakers(data || []);
        })();
        return () => { cancelled = true; };
    }, []);

    // Preselect whoever it was already assigned to, so re-sending keeps them.
    useEffect(() => {
        setSelectedStampMaker(submissionData.assigned_stamp_maker || '');
    }, [submissionData.assigned_stamp_maker]);

    /* Send details to stamp maker */
    const handleSendToStampMaker = async () => {
        setSendingToStamp(true);
        setActionError(null);
        try {
            const chosen = stampMakers.find(m => m.name === selectedStampMaker);
            const merged = {
                ...submissionData,
                sent_to_stamp_maker: true,
                sent_to_stamp_maker_at: new Date().toISOString(),
                sent_to_stamp_maker_by: user?.name || user?.email || 'Office',
                assigned_stamp_maker: selectedStampMaker || null,
                assigned_stamp_maker_id: chosen?.id || null,
            };
            const ok = await onUpdate(customer.id, { discom_submission: merged });
            if (ok === false) throw new Error('The database did not accept the change.');
            await logActivity(user.id, 'update',
                `${customer.customer_name}: Discom details sent to Stamp Maker`, '', customer.id);
            setEditData(prev => ({ ...prev, discom_submission: merged }));
            fetchLogs();
        } catch (err) { setActionError('Failed to send to stamp maker: ' + err.message); }
        finally { setSendingToStamp(false); }
    };

    /* Hand an already-sent record to a different stamp maker */
    const handleReassignStampMaker = async (name) => {
        setReassigning(true);
        setActionError(null);
        try {
            const chosen = stampMakers.find(m => m.name === name);
            const merged = {
                ...submissionData,
                assigned_stamp_maker: name || null,
                assigned_stamp_maker_id: chosen?.id || null,
                assigned_stamp_maker_by: user?.name || user?.email || 'Office',
                assigned_stamp_maker_at: new Date().toISOString(),
            };
            const ok = await onUpdate(customer.id, { discom_submission: merged });
            if (ok === false) throw new Error('The database did not accept the change.');
            setEditData(prev => ({ ...prev, discom_submission: merged }));
            setSelectedStampMaker(name || '');
            const fromLabel = submissionData.assigned_stamp_maker || 'nobody';
            await logActivity(user.id, 'update',
                `${customer.customer_name}: Stamp reassigned from ${fromLabel} to ${name || 'nobody (unassigned)'}`, '', customer.id);
            fetchLogs();
        } catch (err) {
            setActionError('Failed to reassign: ' + err.message);
        } finally {
            setReassigning(false);
        }
    };

    /* Recall - pull back from stamp maker */
    const handleRecall = async () => {
        setShowConfirmRecall(false);
        setRecalling(true);
        setActionError(null);
        try {
            const merged = {
                ...submissionData,
                sent_to_stamp_maker: false,
                recalled_by: user?.name || user?.email || 'Office',
                recalled_at: new Date().toISOString(),
            };
            const ok = await onUpdate(customer.id, { discom_submission: merged });
            if (ok === false) throw new Error('The database did not accept the change.');
            await logActivity(user.id, 'update',
                `${customer.customer_name}: Recalled from Stamp Maker`, '', customer.id);
            setEditData(prev => ({ ...prev, discom_submission: merged }));
            fetchLogs();
        } catch (err) { setActionError('Failed to recall: ' + err.message); }
        finally { setRecalling(false); }
    };

    /* Approve Stamp */
    const handleApproveStamp = async () => {
        setApprovingStamp(true);
        setActionError(null);
        try {
            const merged = {
                ...submissionData,
                stamp_approved: true,
                stamp_approved_by: user?.name || user?.email || 'Office',
                stamp_approved_at: new Date().toISOString(),
                stamp_sendback_remark: null,
            };
            const ok = await onUpdate(customer.id, { discom_submission: merged });
            if (ok === false) throw new Error('The database did not accept the approval.');
            await logActivity(
                user.id,
                'update',
                `${customer.customer_name}: PM Surya Ghar Stamp approved by ${user?.name || 'Office'}`,
                '',
                customer.id
            );
            setEditData(prev => ({ ...prev, discom_submission: merged }));
            setShowResendBox(false);
            fetchLogs();
        } catch (err) {
            setActionError('Failed to approve stamp: ' + err.message);
        } finally {
            setApprovingStamp(false);
        }
    };

    /* Resend (Send Back) with remark */
    const handleSendBack = async () => {
        if (!sendBackRemark.trim()) {
            setActionError('Please write a remark explaining what needs to be fixed before resending.');
            return;
        }
        setSendingBack(true);
        setActionError(null);
        try {
            const merged = {
                ...submissionData,
                stamp_sent: false,
                sent_to_stamp_maker: true,
                stamp_approved: false,
                stamp_sendback_remark: sendBackRemark.trim(),
                stamp_sendback_by: user?.name || user?.email || 'Office',
                stamp_sendback_at: new Date().toISOString(),
            };
            // Was a direct supabase.update() while the other three stamp actions
            // go through onUpdate. That bypassed the parent's error handling,
            // its state sync and the column sanitiser - and its result was never
            // checked, so a failed send-back still cleared the remark box and
            // looked like it had worked.
            const ok = await onUpdate(customer.id, { discom_submission: merged });
            if (ok === false) throw new Error('The database did not accept the send-back.');
            await logActivity(
                user.id, 'update',
                `${customer.customer_name}: Stamp sent back to Stamp Maker - "${sendBackRemark.trim()}"`,
                '', customer.id
            );
            // Reflect in editData so UI updates immediately
            setEditData(prev => ({ ...prev, discom_submission: merged }));
            setSendBackDone(true);
            setSendBackRemark('');
            setShowResendBox(false);
            fetchLogs();
        } catch (err) { setActionError('Failed to resend: ' + err.message); }
        finally { setSendingBack(false); }
    };

    const handleSubmissionFieldChange = (field, val) => {
        const updated = {
            ...submissionData,
            [field]: val
        };
        setEditData(prev => ({ ...prev, discom_submission: updated }));
    };

    const isSubmissionDirty = JSON.stringify(editData.discom_submission) !== JSON.stringify(customer.discom_submission);

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                    <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-amber-500" /> Utility File Checklist
                    </h4>
                </div>
                <div className="flex flex-col gap-2">
                    <CheckboxRemarkItem label="DCR Certificate" field="dcr_certificate" value={editData.dcr_certificate} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                    <CheckboxRemarkItem label="PCR Certificate" field="pcr_certificate" value={editData.pcr_certificate} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                    <CheckboxRemarkItem label="Signature" field="signature_pic" value={editData.signature_pic} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                    <CheckboxRemarkItem label="PM Surya Ghar Model Agreement" field="discom_agreement" value={editData.discom_agreement} onChange={handleChange} isEditing={isEditable} documents={documents} onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
                </div>
                {isEditable && (
                    editData.dcr_certificate !== customer.dcr_certificate || 
                    editData.pcr_certificate !== customer.pcr_certificate ||
                    editData.signature_pic !== customer.signature_pic ||
                    editData.discom_agreement !== customer.discom_agreement
                ) && (
                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={async () => {
                                setSaving(true);
                                // A failed save must stop here - otherwise the activity log below
                                // records a change that never reached the database.
                                if (await onUpdate(customer.id, {
                                    dcr_certificate: editData.dcr_certificate,
                                    pcr_certificate: editData.pcr_certificate,
                                    signature_pic: editData.signature_pic,
                                    discom_agreement: editData.discom_agreement
                                }) === false) { setSaving(false); return; }
                                await logActivity(
                                    user.id, 
                                    'update', 
                                    `${customer.customer_name}: Updated Utility File Checklist (DCR: ${editData.dcr_certificate ? 'Uploaded' : 'Pending'}, PCR: ${editData.pcr_certificate ? 'Uploaded' : 'Pending'}, Signature: ${editData.signature_pic ? 'Uploaded' : 'Pending'})`,
                                    '', 
                                    customer.id
                                );
                                setSaving(false);
                                fetchLogs();
                            }}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5 disabled:bg-stone-300 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <Save className="w-4 h-4" /> Save Checklist
                        </button>
                    </div>
                )}
            </div>

            {/* Discom Submission Details Card */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <div>
                        <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest font-bold">Discom Submission Details</h4>
                        <p className="text-[11px] text-stone-500 font-medium mt-0.5">Track paperwork submission handler and date.</p>
                    </div>
                    {isDiscomDetailsEditable && isSubmissionDirty && (
                        <button
                            onClick={async () => {
                                setSaving(true);
                                // A failed save must stop here - otherwise the activity log below
                                // records a change that never reached the database.
                                if (await onUpdate(customer.id, { discom_submission: submissionData }) === false) { setSaving(false); return; }
                                await logActivity(
                                    user.id,
                                    'update',
                                    `${customer.customer_name}: Updated Discom Submission details (Submitted By: ${submissionData.submitted_by || 'N/A'}, Date: ${submissionData.date || 'N/A'})`,
                                    '',
                                    customer.id
                                );
                                setSaving(false);
                                fetchLogs();
                            }}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10 flex-shrink-0 disabled:opacity-55 cursor-pointer"
                        >
                            {saving ? 'Saving...' : 'Save Details'}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">File Submitted By</label>
                        <select
                            disabled={!isDiscomDetailsEditable}
                            value={submissionData.submitted_by || ''}
                            onChange={e => handleSubmissionFieldChange('submitted_by', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        >
                            <option value="">Select Staff...</option>
                            {staffList.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Submission Date</label>
                        <input
                            type="date"
                            disabled={!isDiscomDetailsEditable}
                            value={submissionData.date || new Date().toISOString().split('T')[0]}
                            onChange={e => handleSubmissionFieldChange('date', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        />
                    </div>

                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">First Party</label>
                        <input
                            type="text"
                            disabled={true}
                            value={submissionData.first_party || customer.customer_name}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Second Party</label>
                        <input
                            type="text"
                            disabled={true}
                            value={submissionData.second_party || 'SOLARFLOW DEMO ENERGY'}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        />
                    </div>

                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Purchased Party</label>
                        <input
                            type="text"
                            disabled={true}
                            value={submissionData.purchased_party || 'SOLARFLOW DEMO ENERGY'}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        />
                    </div>

                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Stamp Value</label>
                        <select
                            disabled={!isDiscomDetailsEditable}
                            value={submissionData.stamp_value || ''}
                            onChange={e => handleSubmissionFieldChange('stamp_value', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        >
                            <option value="">Select Value...</option>
                            <option value="50">50</option>
                            <option value="300">300</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Stamp Description</label>
                        <select
                            disabled={!isDiscomDetailsEditable}
                            value={submissionData.stamp_description || ''}
                            onChange={e => handleSubmissionFieldChange('stamp_description', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                        >
                            <option value="">Select Description...</option>
                            <option value="Affidavit">Affidavit</option>
                            <option value="Undertaking">Undertaking</option>
                            <option value="Option 3">Option 3</option>
                        </select>
                    </div>
                </div>

                {/* ── Send to Stamp Maker footer & PM Surya Ghar Stamp ── */}
                <div className="border-t border-stone-100 pt-4 flex flex-col gap-3">
                    {isSentToStampMaker ? (
                        /* Already sent - show status */
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-xs font-bold text-emerald-700">
                                        Sent to Stamp Maker
                                    </span>
                                    {submissionData.sent_to_stamp_maker_by && (
                                        <span className="text-[10px] text-stone-400 font-medium">
                                            by {submissionData.sent_to_stamp_maker_by}
                                        </span>
                                    )}
                                </div>

                                {/* Who it is with, and the ability to hand it to
                                    someone else. Previously the picker only existed
                                    before sending, so an already-sent record showed
                                    no assignment at all and could not be reassigned. */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Stamp Maker</span>
                                    {isEditable && !isStampSent ? (
                                        <select
                                            value={selectedStampMaker}
                                            disabled={reassigning}
                                            onChange={e => setReassignConfirm({
                                                from: submissionData.assigned_stamp_maker || '',
                                                to: e.target.value,
                                            })}
                                            className="bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-[11px] font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="">Unassigned</option>
                                            {stampMakers.map(m => (
                                                <option key={m.id} value={m.name}>{m.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="text-[11px] font-bold text-stone-800">
                                            {submissionData.assigned_stamp_maker || 'Anyone (unassigned)'}
                                        </span>
                                    )}
                                    {reassigning && <Loader2 className="w-3 h-3 animate-spin text-sky-500" />}
                                </div>
                                {isEditable && !isStampSent && (
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmRecall(true)}
                                        disabled={recalling}
                                        className="text-[10px] font-bold text-stone-500 hover:text-rose-600 underline underline-offset-2 cursor-pointer disabled:opacity-50 transition-colors"
                                    >
                                        {recalling ? 'Recalling...' : 'Recall'}
                                    </button>
                                )}
                            </div>

                            {/* Who did what, in order. Everything here is already
                                recorded on discom_submission by the actions above. */}
                            {(() => {
                                const fmt = (iso) => {
                                    if (!iso) return '';
                                    const d = new Date(iso);
                                    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                };
                                const trail = [
                                    ['Sent to stamp', submissionData.sent_to_stamp_maker_by, submissionData.sent_to_stamp_maker_at],
                                    ['Assigned', submissionData.assigned_stamp_maker_by && `${submissionData.assigned_stamp_maker_by} → ${submissionData.assigned_stamp_maker}`, submissionData.assigned_stamp_maker_at],
                                    ['Stamp uploaded', submissionData.stamp_completed_by, submissionData.stamp_completed_at],
                                    ['Sent back', submissionData.stamp_sendback_by, submissionData.stamp_sendback_at],
                                    ['Approved', submissionData.stamp_approved_by, submissionData.stamp_approved_at],
                                    ['Recalled', submissionData.recalled_by, submissionData.recalled_at],
                                ].filter(([, who]) => who);

                                if (trail.length === 0) return null;
                                return (
                                    <div className="border-t border-stone-100 pt-2.5 space-y-1">
                                        <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">History</p>
                                        {trail.map(([label, who, at]) => (
                                            <div key={label} className="flex items-baseline justify-between gap-3 text-[10px]">
                                                <span className="font-bold text-stone-600 flex-shrink-0">{label}</span>
                                                <span className="text-stone-500 font-medium text-right truncate">
                                                    {who}{at ? ` · ${fmt(at)}` : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            <div className="border-t border-stone-100 pt-3 space-y-3">
                                <CheckboxRemarkItem
                                    label="PM Surya Ghar Stamp"
                                    field="pm_surya_ghar_stamp"
                                    value={editData.pm_surya_ghar_stamp}
                                    onChange={handleChange}
                                    isEditing={isEditable}
                                    documents={documents}
                                    onUpload={onFileUpload}
                                    onDelete={onFileDelete}
                                    onPreview={onFilePreview}
                                    onUpdateRemark={onUpdateRemark}
                                    note={isStampSent && submissionData.stamp_completed_at ? `Uploaded by ${submissionData.stamp_completed_by || 'Document Maker'} on ${new Date(submissionData.stamp_completed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : isStampSent ? 'Uploaded by Document Maker' : null}
                                    canDelete={canDeleteDocs}
                                />

                                {/* ── Stamp Sent to Document Making Review Box (Positioned directly below PM Surya Ghar Stamp) ── */}
                                {isStampSent ? (
                                    <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-2.5">
                                                <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-sky-900">Stamp Sent to Document Making</p>
                                                    <p className="text-[11px] text-sky-700 font-medium mt-0.5">
                                                        The stamp maker has uploaded the official stamp. Review the stamp and choose to approve or resend with remarks.
                                                    </p>
                                                    {submissionData.stamp_remark && (
                                                        <p className="mt-1.5 text-[11px] text-sky-800 bg-white/80 border border-sky-100 rounded-lg p-2 font-medium italic">
                                                            Stamp maker's note: "{submissionData.stamp_remark}"
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {submissionData.stamp_approved && (
                                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 flex-shrink-0">
                                                    <CheckCircle2 size={12} /> Approved
                                                </span>
                                            )}
                                        </div>

                                        {/* Action Area: Approve and Resend (with expandable remark box) */}
                                        {isEditable && (
                                            <div className="pt-1">
                                                {submissionData.stamp_approved ? (
                                                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                                                        <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                                                            <CheckCircle2 size={15} className="text-emerald-600" />
                                                            <span>Stamp Approved {submissionData.stamp_approved_by ? `by ${submissionData.stamp_approved_by}` : ''}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowResendBox(prev => !prev)}
                                                            className="text-[10px] font-bold text-stone-500 hover:text-rose-600 underline cursor-pointer"
                                                        >
                                                            {showResendBox ? 'Hide Resend' : 'Re-open / Resend'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={handleApproveStamp}
                                                            disabled={approvingStamp}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-emerald-600/15 cursor-pointer disabled:opacity-50"
                                                        >
                                                            {approvingStamp ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                                            Approve Stamp
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setShowResendBox(prev => !prev); setActionError(null); }}
                                                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                                                                showResendBox
                                                                    ? 'bg-rose-100 border-rose-300 text-rose-800'
                                                                    : 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50'
                                                            }`}
                                                        >
                                                            <RotateCcw size={13} />
                                                            {showResendBox ? 'Cancel Resend' : 'Resend to Stamp Maker'}
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Resend Remark Input Box */}
                                                {showResendBox && (
                                                    <div className="mt-3 p-3 bg-white rounded-xl border border-rose-200 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                                        <label className="text-[9px] font-bold text-rose-700 uppercase tracking-wider block">
                                                            Reason / Remark for Resending (Required)
                                                        </label>
                                                        <textarea
                                                            value={sendBackRemark}
                                                            onChange={e => setSendBackRemark(e.target.value)}
                                                            placeholder="Describe what needs to be fixed or corrected by the stamp maker..."
                                                            rows={2}
                                                            className="w-full bg-stone-50 border border-rose-200 rounded-lg px-3 py-2 text-xs font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-rose-400 resize-none"
                                                        />
                                                        {actionError && (
                                                            <p className="text-[10px] text-rose-600 font-bold">{actionError}</p>
                                                        )}
                                                        <div className="flex justify-end gap-2 pt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => { setShowResendBox(false); setActionError(null); }}
                                                                className="px-3 py-1.5 text-xs font-bold text-stone-500 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleSendBack}
                                                                disabled={sendingBack}
                                                                className="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-rose-600/10 cursor-pointer disabled:opacity-50"
                                                            >
                                                                <RotateCcw size={12} />
                                                                {sendingBack ? 'Sending...' : 'Confirm Resend'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : submissionData.stamp_sendback_remark ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Sent Back to Stamp Maker</p>
                                            <p className="text-xs text-amber-800 font-semibold mt-0.5">"{submissionData.stamp_sendback_remark}"</p>
                                            {submissionData.stamp_sendback_by && (
                                                <p className="text-[10px] text-amber-600 font-medium mt-0.5">- {submissionData.stamp_sendback_by}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {isEditable && editData.pm_surya_ghar_stamp !== customer.pm_surya_ghar_stamp && (
                                    <div className="flex justify-end mt-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setSaving(true);
                                                // A failed save must stop here - otherwise the activity log below
                                                // records a change that never reached the database.
                                                if (await onUpdate(customer.id, { pm_surya_ghar_stamp: editData.pm_surya_ghar_stamp }) === false) { setSaving(false); return; }
                                                await logActivity(user.id, 'update', `${customer.customer_name}: Updated PM Surya Ghar Stamp status`, '', customer.id);
                                                setSaving(false);
                                            }}
                                            disabled={saving}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10"
                                        >
                                            Save Stamp Status
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Not yet sent */
                        isEditable && (
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-[200px] flex-1">
                                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                                        Send to which Stamp Maker <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={selectedStampMaker}
                                        onChange={e => setSelectedStampMaker(e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer"
                                    >
                                        <option value="">Select a stamp maker...</option>
                                        {stampMakers.map(m => (
                                            <option key={m.id} value={m.name}>{m.name}</option>
                                        ))}
                                    </select>
                                    {stampMakers.length === 0 && (
                                        <p className="text-[9px] text-amber-700 font-semibold mt-1">
                                            No Stamp Maker accounts found - create one in User Management.
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        if (!selectedStampMaker) {
                                            setActionError('Please choose which stamp maker to send this to.');
                                            return;
                                        }
                                        setShowConfirmSend(true);
                                    }}
                                    disabled={sendingToStamp}
                                    className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-600/15 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
                                >
                                    <SendHorizonal className="w-3.5 h-3.5" />
                                    {sendingToStamp ? 'Sending...' : 'Send to Stamp Maker'}
                                </button>
                            </div>
                        )
                    )}
                </div>
            </div>

            {reassignConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <SendHorizonal className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-stone-800">Reassign this stamp?</h3>
                                <p className="text-xs text-stone-500 font-medium mt-0.5">Please confirm the handover.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mb-5 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">From</p>
                                <p className="text-sm font-bold text-stone-700 truncate">{reassignConfirm.from || 'Unassigned'}</p>
                            </div>
                            <span className="text-stone-300 font-black text-lg flex-shrink-0">→</span>
                            <div className="min-w-0 flex-1 text-right">
                                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">To</p>
                                <p className="text-sm font-bold text-amber-700 truncate">{reassignConfirm.to || 'Unassigned'}</p>
                            </div>
                        </div>

                        <p className="text-sm text-stone-600 mb-6 font-medium">
                            {reassignConfirm.to
                                ? `This customer will move into ${reassignConfirm.to}'s stamp queue${reassignConfirm.from ? ` and leave ${reassignConfirm.from}'s` : ''}.`
                                : 'This will leave the stamp unassigned, so it stays visible to every stamp maker.'}
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setReassignConfirm(null)}
                                className="px-4 py-2 text-sm font-bold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const target = reassignConfirm.to;
                                    setReassignConfirm(null);
                                    handleReassignStampMaker(target);
                                }}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors shadow-md cursor-pointer"
                            >
                                Yes, Reassign
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConfirmSend && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <SendHorizonal className="w-5 h-5 text-sky-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-stone-800">Send for Document Making?</h3>
                                <p className="text-xs text-stone-500 font-medium mt-0.5">Please confirm before sending.</p>
                            </div>
                        </div>
                        <p className="text-sm text-stone-600 mb-6 font-medium">
                            Are you sure you want to send this customer's details to the stamp maker? They will be able to see the details and upload the official stamp.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowConfirmSend(false)}
                                className="px-4 py-2 text-sm font-bold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowConfirmSend(false);
                                    handleSendToStampMaker();
                                }}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Yes, Send Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConfirmRecall && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0 text-rose-600">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-stone-800">Recall from Stamp Maker?</h3>
                                <p className="text-xs text-stone-500 font-medium mt-0.5">Please confirm before recalling.</p>
                            </div>
                        </div>
                        <p className="text-sm text-stone-600 mb-6 font-medium">
                            Are you sure you want to recall this customer from the stamp maker? They will no longer see this customer in their portal.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowConfirmRecall(false)}
                                className="px-4 py-2 text-sm font-bold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRecall}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Yes, Recall
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Agreement Generator Card */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div>
                    <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> PM Surya Ghar Model Agreement
                    </h4>
                    <p className="text-xs text-stone-500 font-medium mt-1">
                        Generate and print the official model agreement pre-filled with this client's details.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Agreement Execution Date</label>
                            <input
                                type="date"
                                disabled={!isEditable}
                                value={editData.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0]}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEditData(prev => {
                                        const prevObj = typeof prev.stages_remarks === 'object' && prev.stages_remarks ? prev.stages_remarks : {};
                                        return {
                                            ...prev,
                                            stages_remarks: {
                                                ...prevObj,
                                                discom_agreement_date: val
                                            }
                                        };
                                    });
                                }}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                            />
                        </div>
                    </div>

                    {/* Inline Document Preview Box */}
                    <div className="border border-stone-150 rounded-[20px] bg-stone-50 p-4 shadow-inner">
                        <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider mb-2">Live Document Preview (Page 1)</p>
                        <div className="w-full overflow-x-auto overflow-y-hidden max-h-[350px] border border-stone-200 rounded-xl bg-white flex justify-center py-4">
                            <div className="origin-top scale-[0.6] -my-24" style={{ width: '210mm', height: '297mm' }}>
                                <Page1
                                    data={{
                                        executionDate: formatDateToDDMMYYYY(editData.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0]),
                                        consumerName: editData.customer_name || '',
                                        consumerNo: editData.consumer_no || '',
                                        village: editData.villages || '',
                                        taluka: editData.sub_divisions || '',
                                        district: editData.district || '',
                                        vendorName: 'SolarFlow Demo Energy',
                                        vendorAddress: '100 Demo Avenue, Sample City (fictional)',
                                        paymentTerms: 'Mutually Agreed Terms of Payment',
                                        showHighlights: true,
                                        highlightColor: '#fef08a'
                                    }}
                                    fontSizeClass="text-[14px]"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 flex justify-start gap-3">
                        {/* Save Agreement Date button */}
                        {isEditable && editData.stages_remarks?.discom_agreement_date !== customer.stages_remarks?.discom_agreement_date && (
                            <button
                                type="button"
                                onClick={async () => {
                                    setSaving(true);
                                    const updatedRemarks = {
                                        ...(typeof editData.stages_remarks === 'object' && editData.stages_remarks ? editData.stages_remarks : {}),
                                        discom_agreement_date: editData.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0]
                                    };
                                    // A failed save must stop here - otherwise the activity log below
                                    // records a change that never reached the database.
                                    if (await onUpdate(customer.id, { stages_remarks: updatedRemarks }) === false) { setSaving(false); return; }
                                    await logActivity(user.id, 'update', `${customer.customer_name}: Updated Agreement Execution Date`, '', customer.id);
                                    setSaving(false);
                                    fetchLogs();
                                }}
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5 disabled:bg-stone-300 disabled:cursor-not-allowed"
                            >
                                <Save className="w-4 h-4" /> Save Date
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onGenerateAgreement}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 cursor-pointer"
                        >
                            <Printer className="w-4 h-4" /> Pop Open & Print Agreement
                        </button>
                        <button
                            type="button"
                            onClick={onAddAgreementToDocuments}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <Upload className="w-4 h-4" />
                            {documents.some(doc => doc?.doc_type === 'discom_agreement') ? 'Replace in Documents' : 'Add to Documents'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
