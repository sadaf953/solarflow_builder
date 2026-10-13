import React, { useState, useEffect } from 'react';
import { ClipboardList, Save, Building2, Mail, AlertTriangle, CheckCircle2, User, Calendar, FileText, Truck, IndianRupee } from 'lucide-react';

import { CheckboxRemarkItem, fetchVendorNames } from './shared';
import { INSTALLATION_TAGS, isFinalTagValue } from '../../constants';
import { sendVendorLeadNotification } from '../../utils/vendorNotification';

export default function InstallationStatusTab({
    customer,
    editData,
    setEditData,
    isEditable,
    isSfdcEditable = isEditable,
    isOffice = false,
    isAdmin = false,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    handleChange,
    saving,
    setSaving,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
    onSfdcSaved
}) {
    const canDeleteDocs = isAdmin || isOffice;
    const [vendors, setVendors] = useState([]);
    const [sendingInfo, setSendingInfo] = useState(false);
    const [infoSentStatus, setInfoSentStatus] = useState(null);
    const [infoSentMessage, setInfoSentMessage] = useState('');
    const [vendorConfirm, setVendorConfirm] = useState({ isOpen: false, vendorName: '' });

    useEffect(() => {
        // Cached in shared.jsx - this tab re-mounts on every open, and the
        // vendor list does not change between them.
        let cancelled = false;
        fetchVendorNames().then(names => { if (!cancelled) setVendors(names); });
        return () => { cancelled = true; };
    }, []);

    const handleToggleInstallationTag = (tagId) => {
        const newTag = editData.installation_status === tagId ? null : tagId;
        const todayStr = new Date().toISOString().split('T')[0];
        // If user is moving away from "Give Up", reset the approval flag
        const wasGiveUp = editData.installation_status === 'Giveup';
        const resetApproval = wasGiveUp && newTag !== 'Giveup';
        setEditData(prev => ({
            ...prev,
            installation_status: newTag,
            // Auto-set installation date when moving to Process or Yes if not already set
            installation_date: (newTag === 'In process' || newTag === 'Installed') ? (prev.installation_date || todayStr) : prev.installation_date,
            ...(resetApproval ? { vendor_give_up_approved: false, vendor_note: '' } : {})
        }));
    };

    const handleSaveInstallationDetails = async () => {
        setSaving(true);

        const updates = {
            installation_status: editData.installation_status || null,
            installation_date: editData.installation_date || null,
            vendor: editData.vendor || null,
            installation_note: editData.installation_note || null,
            vendor_note: editData.vendor_note || null,
            vendor_give_up_approved: editData.vendor_give_up_approved ?? customer.vendor_give_up_approved ?? false
        };
        // A failed save must stop here - otherwise the activity log below
        // records a change that never reached the database.
        if (await onUpdate(customer.id, updates) === false) { setSaving(false); return; }
        
        let logMsg = `${customer.customer_name}: Updated Installation Status to ${editData.installation_status || 'None'}`;
        if (editData.installation_status === 'Installed') {
            logMsg += ` (Date: ${editData.installation_date || 'N/A'}, Installed By Vendor: ${editData.vendor || 'N/A'})`;
        } else if (editData.installation_status === 'Giveup') {
            logMsg += ` (Vendor Give Up - Allotted Vendor: ${editData.vendor || 'None'})`;
        }
        if (editData.installation_note) {
            logMsg += ` [Note: ${editData.installation_note}]`;
        }
        await logActivity(user.id, 'update', logMsg, '', customer.id);
        
        setSaving(false);
        fetchLogs();
    };

    const currentVendor = editData.vendor || customer.vendor || '';

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* SFDC Photo Checklist Card */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-500" /> SFDC Photo Checklist
                </h4>
                <div className="flex flex-col gap-2">
                    <CheckboxRemarkItem 
                        label="SFDC Photo" 
                        field="sfdc_photo" 
                        value={editData.sfdc_photo} 
                        onChange={handleChange} 
                        isEditing={isSfdcEditable} 
                        documents={documents} 
                        onUpload={onFileUpload} 
                        onDelete={onFileDelete} 
                        onPreview={onFilePreview} 
                        onUpdateRemark={onUpdateRemark}
                        canDelete={canDeleteDocs}
                    />
                </div>
                {isSfdcEditable && editData.sfdc_photo !== customer.sfdc_photo && (
                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={async () => {
                                setSaving(true);
                                // A failed save must stop here - otherwise the activity log below
                                // records a change that never reached the database.
                                if (await onUpdate(customer.id, { sfdc_photo: editData.sfdc_photo }) === false) { setSaving(false); return; }
                                await logActivity(user.id, 'update', `${customer.customer_name}: Updated SFDC Photo status to ${editData.sfdc_photo ? 'Checked' : 'Unchecked'}`, '', customer.id);
                                onSfdcSaved?.();
                                setSaving(false);
                                fetchLogs();
                            }}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5 disabled:bg-stone-300 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" /> Save SFDC Photo
                        </button>
                    </div>
                )}
            </div>

            {/* Main Installation Status Tag Selector Card */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-5">
                {isOffice && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] font-medium text-blue-800">
                        Installation details are managed by the Channel Partner. Office users can edit only the SFDC Photo Checklist.
                    </div>
                )}
                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <div>
                        <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Installation Status <span className="text-red-500">*</span></h4>
                        <p className="text-[11px] text-stone-500 font-medium mt-0.5">Track current physical installation state & vendor assignment.</p>
                    </div>
                    {isEditable && (
                        (editData.installation_status !== customer.installation_status) ||
                        (editData.installation_date !== customer.installation_date) ||
                        (editData.vendor !== customer.vendor) ||
                        (editData.installation_note !== customer.installation_note) ||
                        (editData.vendor_note !== customer.vendor_note)
                    ) && (
                        <button
                            onClick={handleSaveInstallationDetails}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10 flex-shrink-0 disabled:opacity-55 cursor-pointer"
                        >
                            {saving ? 'Saving...' : 'Save Details'}
                        </button>
                    )}
                </div>

                {/* Material Delivery Reference Card */}
                <div className="flex items-center justify-between p-3.5 bg-stone-50 border border-stone-200/80 rounded-2xl">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                            <Truck size={16} />
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Material Delivery Date (From Delivery Stage)</p>
                            <p className="text-xs font-bold text-stone-800">
                                {editData.material_delivery_date || customer.material_delivery_date || 'Not Set in Material Delivery'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 4 Status Buttons: Give Up, Yes, Process, Pending */}
                {customer.installation_status === 'Installed' && (
                    <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold">
                        <CheckCircle2 size={15} className="text-emerald-600" />
                        <span>Installation Completed (Locked to "Yes")</span>
                    </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                    {[
                        { id: 'Giveup', label: 'Giveup', activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/10', dotClass: 'bg-white' },
                        { id: 'Installed', label: 'Installed', isFinal: true, activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' },
                        { id: 'In process', label: 'In process', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' },
                        { id: 'Pending', label: 'Pending', activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10', dotClass: 'bg-white' }
                    ].map(tag => {
                        const isSelected = editData.installation_status === tag.id;
                        // Terminal value locks the field - Admin can still change it.
                        const isLocked = isFinalTagValue(customer.installation_status, INSTALLATION_TAGS) && user?.userType !== 'admin';
                        return (
                            <button
                                key={tag.id}
                                type="button"
                                disabled={!isEditable || isLocked}
                                onClick={() => !isLocked && handleToggleInstallationTag(tag.id)}
                                className={`px-3 py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 w-full ${
                                    isLocked && !tag.isFinal ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                    isSelected
                                        ? tag.activeClass
                                        : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${isSelected ? tag.dotClass : 'bg-stone-300'}`} />
                                {tag.label}
                            </button>
                        );
                    })}
                </div>

                {/* WHEN STATUS IS "GIVE UP" - Admin Reviews & Approves Reason */}
                {editData.installation_status === 'Giveup' && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        {/* 1. Vendor Give Up Box */}
                        <div className="p-4 bg-rose-50/70 border border-rose-200/90 rounded-2xl space-y-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h5 className="text-xs font-bold text-rose-900">Vendor Give Up Request</h5>
                                        <p className="text-[11px] text-rose-700 font-medium">
                                            Vendor <b>{customer.vendor || editData.vendor || 'Assigned Vendor'}</b> has requested to give up this installation.
                                        </p>
                                    </div>
                                </div>
                                {editData.vendor_give_up_approved || customer.vendor_give_up_approved ? (
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/90 px-3 py-1 rounded-xl border border-emerald-200 flex items-center gap-1 flex-shrink-0">
                                        <CheckCircle2 size={13} /> Approved
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-xl border border-rose-200 flex-shrink-0">
                                        Pending Admin Approval
                                    </span>
                                )}
                            </div>

                            {/* Vendor Note / Reason (Viewable and Editable by Admin) */}
                            <div className="space-y-1 bg-white p-3 rounded-xl border border-rose-200/70 shadow-xs">
                                <label className="text-[9px] font-bold text-rose-800 uppercase tracking-wider block">
                                    Vendor Give Up Reason / Note
                                </label>
                                {isEditable && !(editData.vendor_give_up_approved || customer.vendor_give_up_approved) ? (
                                    <textarea
                                        rows={2}
                                        value={editData.vendor_note || ''}
                                        onChange={e => setEditData(prev => ({ ...prev, vendor_note: e.target.value }))}
                                        placeholder="Vendor reason or remarks..."
                                        className="w-full bg-rose-50/30 border border-rose-200 rounded-lg p-2 text-xs text-rose-950 font-medium focus:outline-none focus:ring-1 focus:ring-rose-400 placeholder:text-rose-300"
                                    />
                                ) : (
                                    <p className="text-xs font-semibold text-rose-900 italic">
                                        {editData.vendor_note || customer.vendor_note || 'No reason provided'}
                                    </p>
                                )}
                            </div>

                            {/* Approval Button inside the box */}
                            {isEditable && (
                                <div className="flex items-center justify-end pt-1">
                                    {!(editData.vendor_give_up_approved || customer.vendor_give_up_approved) ? (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                // First persist approval to backend
                                                // A failed save must stop here - otherwise the activity log below
                                                // records a change that never reached the database.
                                                if (await onUpdate(customer.id, {
                                                    vendor_give_up_approved: true,
                                                    vendor_note: editData.vendor_note || null,
                                                    installation_status: editData.installation_status || customer.installation_status,
                                                }) === false) return;
                                                // Then update local editData to reflect approval without causing flicker
                                                setEditData(prev => ({ ...prev, vendor_give_up_approved: true }));
                                                await logActivity(
                                                    user.id,
                                                    'update',
                                                    `${customer.customer_name}: Approved vendor give up request (${customer.vendor || editData.vendor})`,
                                                    '',
                                                    customer.id
                                                );
                                                fetchLogs();
                                            }}
                                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                                        >
                                            <CheckCircle2 size={13} /> Approve Give Up
                                        </button>
                                    ) : (
                                        <span className="text-xs text-emerald-800 font-bold flex items-center gap-1">
                                            <CheckCircle2 size={14} className="text-emerald-600" /> Give up approved. Assign a new vendor below.
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. OUTSIDE THE BOX: Assign New Vendor (Visible once approved) */}
                        {(editData.vendor_give_up_approved || customer.vendor_give_up_approved) && (
                            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-1 duration-200">
                                <div className="flex-1 min-w-[200px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Building2 size={13} className="text-amber-500" />
                                        <p className="text-[10px] text-stone-700 uppercase tracking-wide font-bold">Assign New Vendor</p>
                                    </div>
                                    <select
                                        disabled={!isEditable}
                                        value={editData.vendor || ''}
                                        onChange={(e) => {
                                            const selectedVal = e.target.value;
                                            if (selectedVal) {
                                                setVendorConfirm({ isOpen: true, vendorName: selectedVal });
                                            } else {
                                                setEditData(prev => ({ ...prev, vendor: null }));
                                                setInfoSentStatus(null);
                                                // .then() fires when the promise RESOLVES - including resolving
                                            // false on failure - so the removal was logged whether
                                            // or not it happened.
                                            onUpdate(customer.id, { vendor: null }).then((ok) => {
                                                if (ok === false) return;
                                                    logActivity(
                                                        user.id,
                                                        'update',
                                                        `${customer.customer_name}: Removed assigned vendor`,
                                                        '',
                                                        customer.id
                                                    ).then(fetchLogs);
                                                });
                                            }
                                        }}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                                    >
                                        <option value="">Select New Vendor...</option>
                                        {vendors.map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                {editData.vendor && (
                                    <div className="flex flex-col items-start sm:items-end gap-1 flex-shrink-0">
                                        <button
                                            type="button"
                                            disabled={sendingInfo}
                                            onClick={async () => {
                                                setSendingInfo(true);
                                                setInfoSentStatus(null);
                                                try {
                                                    const res = await sendVendorLeadNotification({
                                                        customerId: customer.id,
                                                        customer: { ...customer, ...editData },
                                                        vendorName: editData.vendor
                                                    });
                                                    setInfoSentStatus('sent');
                                                    setInfoSentMessage(res.message || 'Email sent successfully');
                                                    await logActivity(
                                                        user.id,
                                                        'email',
                                                        `Vendor notification triggered for new vendor ${editData.vendor} (${res.recipient || 'no email found'})`,
                                                        '',
                                                        customer.id
                                                    );
                                                    fetchLogs();
                                                } catch (err) {
                                                    console.error('Error invoking vendor notification:', err);
                                                    setInfoSentStatus('failed');
                                                } finally {
                                                    setSendingInfo(false);
                                                }
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer ${
                                                sendingInfo
                                                    ? 'bg-stone-200 text-stone-400 cursor-wait'
                                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10'
                                            }`}
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            {sendingInfo ? 'Sending...' : 'Resend Info to New Vendor'}
                                        </button>
                                        {infoSentStatus === 'sent' && (
                                            <p className="text-[8px] font-bold text-emerald-600 mt-0.5 animate-in fade-in duration-200">
                                                {infoSentMessage}
                                            </p>
                                        )}
                                        {infoSentStatus === 'failed' && (
                                            <p className="text-[8px] font-bold text-red-500 mt-0.5 animate-in fade-in duration-200">
                                                Failed to send
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* WHEN STATUS IS "PROCESS" - Installation Date & Automatically Grabbed Vendor Name */}
                {(editData.installation_status === 'In process' || editData.installation_status === 'Installed') && (
                    <div className="pt-4 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                <Calendar size={11} /> Installation Date
                            </label>
                            <input
                                type="date"
                                disabled={!isEditable}
                                value={editData.installation_date || ''}
                                onChange={e => setEditData(prev => ({ ...prev, installation_date: e.target.value }))}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 disabled:bg-stone-100 disabled:text-stone-500"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                <User size={11} /> Installed By (Allotted Vendor)
                            </label>
                            <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 flex items-center gap-2 min-h-[38px]">
                                <Building2 size={13} className="text-amber-600 flex-shrink-0" />
                                <span>{currentVendor || 'No vendor allotted yet'}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Installation Note Section (Always available) */}
                <div className="pt-3 border-t border-stone-100 space-y-1.5">
                    <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block flex items-center gap-1">
                        <FileText size={11} /> Installation Note
                    </label>
                    <textarea
                        rows={2}
                        disabled={!isEditable}
                        value={editData.installation_note || ''}
                        onChange={e => setEditData(prev => ({ ...prev, installation_note: e.target.value }))}
                        placeholder="Add notes / remarks regarding physical installation..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-300 placeholder:text-stone-400 disabled:bg-stone-100 disabled:text-stone-500"
                    />
                </div>
            </div>
        
            {vendorConfirm.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-stone-50 border-b border-stone-100 p-4">
                            <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                                <Building2 size={16} className="text-blue-500" />
                                Confirm Vendor Assignment
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-stone-600 leading-relaxed">
                                You are about to assign <strong className="text-stone-900">{vendorConfirm.vendorName}</strong> to this project.
                            </p>
                            <p className="text-xs text-stone-600 leading-relaxed">
                                This will automatically assign them in the database and send an email notification with the project details. Do you want to proceed?
                            </p>
                        </div>
                        <div className="p-4 bg-stone-50 border-t border-stone-100 flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setVendorConfirm({ isOpen: false, vendorName: '' })}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 bg-white border border-stone-200 hover:bg-stone-100 transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const selectedVal = vendorConfirm.vendorName;
                                    setVendorConfirm({ isOpen: false, vendorName: '' });
                                    setSendingInfo(true);
                                    setInfoSentStatus(null);
                                    
                                    setEditData(prev => ({ ...prev, vendor: selectedVal }));
                                    // A failed save must stop here - otherwise the activity log below
                                    // records a change that never reached the database.
                                    if (await onUpdate(customer.id, { vendor: selectedVal }) === false) { setSendingInfo(false); return; }
                                    
                                    await logActivity(
                                        user.id,
                                        'update',
                                        `${customer.customer_name}: Assigned vendor to ${selectedVal}`,
                                        '',
                                        customer.id
                                    );
                                    
                                    try {
                                        const res = await sendVendorLeadNotification({
                                            customerId: customer.id,
                                            customer: { ...customer, ...editData, vendor: selectedVal },
                                            vendorName: selectedVal
                                        });

                                        setInfoSentStatus('sent');
                                        setInfoSentMessage(res.message || 'Email sent successfully');
                                        await logActivity(
                                            user.id,
                                            'email',
                                            `Vendor notification triggered for ${selectedVal} (${res.recipient || 'no email found'})`,
                                            '',
                                            customer.id
                                        );
                                    } catch (err) {
                                        console.error('Error sending vendor notification:', err);
                                        setInfoSentStatus('failed');
                                    } finally {
                                        setSendingInfo(false);
                                        fetchLogs();
                                    }
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
                            >
                                <Mail size={14} />
                                Confirm & Send Email
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
