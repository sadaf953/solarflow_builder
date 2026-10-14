// Add Lead form, shared by the dashboard, the partner portal and quotation
// conversion. Only a name and a phone number are needed; everything else,
// including this client's own extra fields, can be filled in now or later.

import { useState, useEffect, useRef } from 'react';
import { X, Plus, User, ClipboardList, Paperclip, Eye, Upload, Loader2, HardDrive, MapPin } from 'lucide-react';
import { leadSchema } from '../utils/validation';
import { DEFAULT_LEAD_FORM } from '../models';
import { FilePreviewModal } from './modal-tabs/shared';
import { fetchAgent2SubAgents, sanitizePhoneNumber, downloadFileWithSaveAs } from '../utils';
import { useGlobalPopup } from './GlobalPopup';
import { calculateSystemCapacityKwp } from '../utils/capacity';
import {
    STAGE_IDS, isOn, documentMode, dropdownOptions, addLeadCustomFields, getStageRequirements, missingStageRequirements,
    paymentTypeOptions,
} from '../config/index.js';
import { Field, Input, Select, Textarea, ErrorBanner, FieldRenderer } from '../ui/index.js';

const PAYMENT_TYPES = paymentTypeOptions();

// Lead documents; `loan` ones are asked for only when the customer is not paying cash.
const LEAD_DOCUMENTS = [
    { field: 'adhaar_card_front', label: 'Aadhaar Card Front', loan: true },
    { field: 'adhaar_card_back', label: 'Aadhaar Card Back', loan: true },
    { field: 'pan_card', label: 'PAN Card', loan: true },
    { field: 'index_2', label: 'Index 2', loan: true },
    { field: 'house_geo_tag_photo', label: 'House Geo Tag Photo', loan: true },
    { field: 'light_bill', label: 'Light Bill' },
    { field: 'bank_details', label: 'Bank Details' },
    { field: 'extra_docs', label: 'Extra Documents' },
];

// Text fields the form keeps as strings before validation.
const TEXT_FIELDS = [
    'customer_name', 'phone_number', 'email_address', 'consumer_no', 'villages', 'full_address', 'pincode', 'district',
    'channel_partner', 'module_brand', 'module_wp', 'no_of_modules', 'system_capacity_kwp', 'sub_divisions',
    'bank_name', 'bank_branch', 'google_drive_link', 'location_link',
];

const partnerFieldOn = isOn('channelPartners') || isOn('cpos');
const dealersOn = isOn('dealers');
const docMode = documentMode();

function PendingDocument({ label, field, pendingFile, onFileAttach, onFileRemove, onPreview }) {
    const { showImageCropper } = useGlobalPopup();
    const fileInputRef = useRef(null);
    const attached = Boolean(pendingFile);

    const handleFileChange = async (e) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile) return;
        e.target.value = '';
        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: `Crop ${label}` });
            if (!file) return;
        }
        onFileAttach(field, file);
    };

    return (
        <div className="py-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <span
                        aria-hidden="true"
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            attached ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-stone-100 border-stone-300 text-transparent'
                        }`}
                    >
                        {attached && (
                            <svg className="w-2.5 h-2.5 stroke-[3] stroke-current" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        )}
                    </span>
                    <span className={`text-xs ${attached ? 'font-bold text-stone-900' : 'font-medium text-stone-600'}`}>{label}</span>
                    <span className={`text-[9px] font-bold px-1.5 rounded ${attached ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-stone-600 bg-stone-100'}`}>
                        {attached ? 'Attached' : 'Not attached'}
                    </span>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" aria-label={`Attach ${label}`} />
                {!attached && (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex min-h-11 items-center gap-1.5 text-[11px] font-bold text-stone-600 hover:text-amber-700 px-3 rounded-lg border border-dashed border-stone-300 hover:border-amber-300 hover:bg-amber-50/50 transition-all cursor-pointer"
                    >
                        <Paperclip size={12} aria-hidden="true" /> Attach file / photo
                    </button>
                )}
            </div>

            {attached && (
                <div className="flex flex-wrap items-center justify-between gap-1.5 bg-amber-50/80 border border-amber-200/80 rounded-xl px-2.5 py-1 ml-6">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Paperclip size={11} className="text-amber-600 flex-shrink-0" aria-hidden="true" />
                        <span className="text-[11px] text-amber-900 font-semibold truncate">{pendingFile.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => onPreview(pendingFile)}
                            className="min-h-11 text-[11px] font-bold text-amber-700 hover:text-amber-900 px-2 rounded hover:bg-amber-100 flex items-center gap-1 cursor-pointer">
                            <Eye size={12} aria-hidden="true" /> View
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                            className="min-h-11 text-[11px] font-bold text-blue-600 hover:text-blue-800 px-2 rounded hover:bg-blue-50 flex items-center gap-1 cursor-pointer">
                            <Upload size={12} aria-hidden="true" /> Change
                        </button>
                        <button type="button" onClick={() => onFileRemove(field)}
                            className="min-h-11 text-[11px] font-bold text-red-600 hover:text-red-700 px-2 rounded hover:bg-red-50 flex items-center gap-1 cursor-pointer">
                            <X size={12} aria-hidden="true" /> Remove
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AddLeadModal({ isOpen, onClose, onSave, meta = {}, channel_partners = [], user, initialValues = null }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const [formData, setFormData] = useState({ ...DEFAULT_LEAD_FORM });
    const [customValues, setCustomValues] = useState({});
    const [pendingFiles, setPendingFiles] = useState({}); // { [doc_type]: File }
    const [previewDoc, setPreviewDoc] = useState(null); // { doc, url }
    const [saving, setSaving] = useState(false);
    const [showOptional, setShowOptional] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [isFormDirty, setIsFormDirty] = useState(false);
    const [subAgentOptions, setSubAgentOptions] = useState([]);

    const userType = user?.userType;
    const isAgent = userType === 'agent';
    const isAgent2 = userType === 'agent2';
    const isPortalAgent = isAgent || isAgent2;
    const isPartnerOffice = userType === 'channel_partner_office' || userType === 'office2';
    const partnerName = (user?.channel_partner || user?.name || '').trim();

    const customFields = addLeadCustomFields();
    const requiredCustomFields = customFields.filter(field => field.required);
    const optionalCustomFields = customFields.filter(field => !field.required);

    useEffect(() => {
        if (!dealersOn || isPortalAgent) { setSubAgentOptions([]); return; }
        const branch = isPartnerOffice ? partnerName : (formData.channel_partner || '');
        if (!branch) { setSubAgentOptions([]); return; }
        let cancelled = false;
        fetchAgent2SubAgents(branch).then(names => { if (!cancelled) setSubAgentOptions(names); });
        return () => { cancelled = true; };
    }, [isPortalAgent, isPartnerOffice, partnerName, formData.channel_partner]);

    useEffect(() => {
        if (!isOpen) return;
        const defaults = { ...DEFAULT_LEAD_FORM, ...initialValues };
        if (isAgent2) {
            defaults.channel_partner = partnerName;
            defaults.sub_channel_partner = user?.name || '';
        } else if (isAgent) {
            defaults.channel_partner = partnerName;
            defaults.sub_channel_partner = user?.name || '';
        } else if (isPartnerOffice) {
            defaults.channel_partner = partnerName;
            defaults.sub_channel_partner = null;
        }
        setFormData(defaults);
        setCustomValues({});
        setPendingFiles({});
        setShowOptional(false);
        setValidationErrors([]);
        setSaving(false);
        setIsFormDirty(false);
    }, [isOpen, user, isAgent, isAgent2, isPartnerOffice, partnerName, initialValues]);

    const requestCloseRef = useRef(null);
    const formDialogRef = useRef(null);
    const bodyRef = useRef(null);
    const closingRef = useRef(false);
    useEffect(() => {
        if (!isOpen) return;
        const previousFocus = document.activeElement;
        formDialogRef.current?.querySelector('#new-lead-name')?.focus();
        return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = event => {
            // Let the file preview or a confirmation dialog handle its own keys.
            if (previewDoc || document.querySelector('dialog[open]') || event.defaultPrevented) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (!saving) requestCloseRef.current?.();
            }
            if (event.key !== 'Tab') return;
            const controls = [...formDialogRef.current.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]')]
                .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); return; }
            if (!formDialogRef.current.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
                event.preventDefault(); (event.shiftKey ? last : first).focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [isOpen, previewDoc, saving]);

    // Warn before a refresh or tab close throws away an unsaved lead.
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isOpen && isFormDirty) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isOpen, isFormDirty]);

    if (!isOpen) return null;

    const touch = () => { setIsFormDirty(true); setValidationErrors([]); };

    const handleChange = (field, value) => {
        touch();
        let processedValue = value;
        if (field === 'consumer_no') processedValue = String(value).replace(/[^0-9]/g, '');
        if (field === 'phone_number') processedValue = sanitizePhoneNumber(value);
        setFormData(prev => ({ ...prev, [field]: processedValue }));
    };

    const handleCustomChange = (key, value) => {
        touch();
        setCustomValues(prev => ({ ...prev, [key]: value }));
    };

    // Module Wp x No of Modules, on demand only, so a typed value is never overwritten.
    const autoCalcCapacity = () => {
        const kwp = calculateSystemCapacityKwp(formData.module_wp, formData.no_of_modules);
        if (kwp == null) {
            showAlert('Enter Module Wp and No of Modules first.', { title: 'Cannot calculate', type: 'warning' });
            return;
        }
        handleChange('system_capacity_kwp', String(kwp));
    };

    const handleFileAttach = (docType, file) => {
        touch();
        setPendingFiles(prev => ({ ...prev, [docType]: file }));
        setFormData(prev => ({ ...prev, [docType]: true }));
    };

    const handleFileRemove = (docType) => {
        touch();
        setPendingFiles(prev => {
            const next = { ...prev };
            delete next[docType];
            return next;
        });
        setFormData(prev => ({ ...prev, [docType]: false }));
    };

    const handlePreviewFile = (file) => {
        setPreviewDoc({ doc: { file_name: file.name, file_type: file.type }, url: URL.createObjectURL(file) });
    };

    const handleClosePreview = () => {
        if (previewDoc?.url) URL.revokeObjectURL(previewDoc.url);
        setPreviewDoc(null);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (saving) return false;

        const custom = Object.fromEntries(Object.entries(customValues).filter(([, value]) => value != null && value !== ''));
        const finalData = {
            ...formData,
            lead_creator_profile_id: user?.id || null,
            channel_partner: (isPortalAgent || isPartnerOffice) ? partnerName : (formData.channel_partner || '').trim(),
            sub_channel_partner: isPartnerOffice ? null : isPortalAgent ? user?.name : (formData.sub_channel_partner || '').trim() || null,
            created_at: formData.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        if (Object.keys(custom).length) finalData.custom_fields = custom;

        TEXT_FIELDS.forEach(key => {
            if (finalData[key] !== undefined && finalData[key] !== null) finalData[key] = String(finalData[key]);
        });

        const result = leadSchema.safeParse(finalData);
        const issues = result.success ? [] : [...result.error.issues];
        // Required extra fields shown on this form join the base checks.
        const shownPaths = new Set(customFields.map(field => `custom_fields.${field.key}`));
        const checked = new Set(issues.map(issue => issue.path[0]));
        const missing = new Set(missingStageRequirements(STAGE_IDS.LEADS, finalData));
        getStageRequirements(STAGE_IDS.LEADS)
            .filter(([path, label]) => missing.has(label) && !checked.has(path) && shownPaths.has(path))
            .forEach(([path, label]) => issues.push({ path: [path], message: `${label} is required` }));

        if (issues.length) {
            if (issues.some(issue => !['customer_name', 'phone_number'].includes(issue.path[0]) && !String(issue.path[0]).startsWith('custom_fields.'))) {
                setShowOptional(true);
            }
            setValidationErrors(issues.map(issue => issue.message));
            if (bodyRef.current) bodyRef.current.scrollTop = 0;
            return false;
        }

        const filesToUpload = Object.entries(pendingFiles).map(([doc_type, file]) => ({ file, doc_type }));

        setSaving(true);
        try {
            await onSave(result.data, filesToUpload);
            setIsFormDirty(false);
            onClose();
            return true;
        } catch (err) {
            console.error('Error in onSave:', err);
            showAlert('Failed to save lead: ' + (err.message || err), { type: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleRequestClose = async () => {
        if (saving || closingRef.current) return;
        if (!isFormDirty) {
            onClose();
            return;
        }
        closingRef.current = true;
        const shouldDiscard = await showConfirm('This new lead has unsaved changes.', {
            title: 'Close without saving?',
            confirmLabel: 'Discard lead',
            cancelLabel: 'Keep editing',
            type: 'warning',
        });
        closingRef.current = false;
        if (shouldDiscard) onClose();
    };
    requestCloseRef.current = handleRequestClose;

    const text = (field, label, props = {}) => (
        <Field label={label} htmlFor={`new-lead-${field}`}>
            <Input id={`new-lead-${field}`} type="text" value={formData[field] || ''}
                onChange={e => handleChange(field, e.target.value)} {...props} />
        </Field>
    );
    const customField = field => (
        <FieldRenderer key={field.key} field={field} value={customValues[field.key]} onChange={value => handleCustomChange(field.key, value)} />
    );

    const paymentType = String(formData.payment_type || '').trim().toLowerCase();
    const documents = LEAD_DOCUMENTS.filter(doc => !doc.loan || paymentType !== 'cash');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
            <div ref={formDialogRef} role="dialog" aria-modal="true" aria-labelledby="add-lead-title" aria-describedby="add-lead-help"
                className="bg-white rounded-[28px] shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-100 bg-white">
                    <div>
                        <h2 id="add-lead-title" className="text-base font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                            <Plus size={18} className="text-amber-500" aria-hidden="true" /> Add New Lead
                        </h2>
                        <p id="add-lead-help" className="text-xs text-stone-600 mt-1">
                            Start with a name and phone number. Everything else can wait.
                        </p>
                    </div>
                    <button onClick={handleRequestClose} aria-label="Close Add Lead" disabled={saving}
                        className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-stone-100 text-stone-600 hover:text-stone-700 rounded-xl transition cursor-pointer">
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div ref={bodyRef} className="flex-1 overflow-y-auto p-5 space-y-5">
                    {validationErrors.length > 0 && (
                        <ErrorBanner title="Please fix the following">
                            <ul className="list-disc pl-5 text-xs font-medium space-y-1">
                                {validationErrors.map((message, idx) => <li key={idx}>{message}</li>)}
                            </ul>
                        </ErrorBanner>
                    )}

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 pb-1.5 border-b border-stone-100">
                            <User size={13} className="text-amber-500" aria-hidden="true" />
                            <h3 className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">Customer Info</h3>
                        </div>
                        <Field label="Customer Name" htmlFor="new-lead-name" required>
                            <Input id="new-lead-name" type="text" aria-required="true" autoComplete="name" maxLength={100}
                                value={formData.customer_name || ''} onChange={e => handleChange('customer_name', e.target.value)}
                                placeholder="Enter full name" />
                        </Field>
                        <Field label="Phone Number" htmlFor="new-lead-phone" required>
                            {/* 16 = "+" plus the E.164 maximum of 15 digits. */}
                            <Input id="new-lead-phone" type="tel" aria-required="true" autoComplete="tel" maxLength={16}
                                value={formData.phone_number || ''} onChange={e => handleChange('phone_number', e.target.value)}
                                placeholder="10-digit mobile number" />
                        </Field>
                        {requiredCustomFields.map(customField)}
                    </section>

                    <details open={showOptional} onToggle={event => setShowOptional(event.currentTarget.open)} className="rounded-2xl border border-stone-200 p-4">
                        <summary className="min-h-11 flex items-center cursor-pointer text-sm font-bold text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
                            Optional details{docMode !== 'checklist' ? ' & documents' : ''}
                        </summary>
                        <p className="text-xs text-stone-500 mt-2 mb-4">Add address, team assignment, system details or documents now. Closing this section keeps your entries.</p>
                        <div className="space-y-3">
                            {text('email_address', 'Email Address', { type: 'email', autoComplete: 'email', placeholder: 'name@example.com' })}
                            {text('consumer_no', 'Consumer No', { inputMode: 'numeric', placeholder: 'Consumer number' })}
                            {text('villages', 'Villages / Address', { placeholder: 'Village or address' })}
                            <Field label="Full Address" htmlFor="new-lead-full_address">
                                <Textarea id="new-lead-full_address" rows={3} value={formData.full_address || ''}
                                    onChange={e => handleChange('full_address', e.target.value)} placeholder="Complete installation address" />
                            </Field>
                            <Field label="Pincode" htmlFor="new-lead-pincode">
                                <Input id="new-lead-pincode" type="text" inputMode="numeric" maxLength={6} value={formData.pincode || ''}
                                    onChange={e => handleChange('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit pincode" />
                            </Field>
                            {text('sub_divisions', 'Tehsil / Sub Division', { placeholder: 'Tehsil or sub division' })}
                            {text('district', 'District', { placeholder: 'District' })}
                            <Field label={<span className="inline-flex items-center gap-1.5"><HardDrive size={12} className="text-blue-500" aria-hidden="true" /> Google Drive Link</span>} htmlFor="new-lead-google_drive_link">
                                <Input id="new-lead-google_drive_link" type="url" value={formData.google_drive_link || ''}
                                    onChange={e => handleChange('google_drive_link', e.target.value)} placeholder="https://drive.google.com/..." />
                            </Field>
                            <Field label={<span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-emerald-500" aria-hidden="true" /> Site Location Link</span>} htmlFor="new-lead-location_link">
                                <Input id="new-lead-location_link" type="url" value={formData.location_link || ''}
                                    onChange={e => handleChange('location_link', e.target.value)} placeholder="https://maps.google.com/?q=..." />
                            </Field>

                            {/* Partners, dealers and partner offices always file leads under themselves. */}
                            {partnerFieldOn && !isAgent2 && ((isAgent || isPartnerOffice) ? (
                                <Field label="Channel Partner Name" htmlFor="new-lead-channel_partner">
                                    <Input id="new-lead-channel_partner" type="text" value={partnerName} disabled />
                                </Field>
                            ) : (
                                <Field label="Channel Partner Name" htmlFor="new-lead-channel_partner">
                                    <Input id="new-lead-channel_partner" type="text" list="new-lead-partner-options" autoComplete="off"
                                        value={formData.channel_partner || ''} onChange={e => handleChange('channel_partner', e.target.value)}
                                        placeholder="Enter Channel Partner Name..." />
                                    <datalist id="new-lead-partner-options">
                                        {channel_partners.map(name => <option key={name} value={name} />)}
                                    </datalist>
                                </Field>
                            ))}

                            {isPartnerOffice ? (
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                                    <strong>Added by your office</strong><p>This lead belongs to your office. Leads added by your dealers appear here automatically.</p>
                                </div>
                            ) : isAgent2 ? (
                                <Field label="Dealer Name" htmlFor="new-lead-dealer" hint="Set automatically to your account.">
                                    <Input id="new-lead-dealer" type="text" value={user?.name || ''} disabled readOnly />
                                </Field>
                            ) : dealersOn && !isAgent && (
                                <Field label="Dealer Name" htmlFor="new-lead-dealer"
                                    hint={subAgentOptions.length === 0 ? 'No dealers are registered under this channel partner yet - add them in User Management first.' : undefined}>
                                    <Select id="new-lead-dealer" placeholder="None" options={subAgentOptions}
                                        value={formData.sub_channel_partner || ''} onChange={e => handleChange('sub_channel_partner', e.target.value)} />
                                </Field>
                            )}

                            <Field label="Module Brand" htmlFor="new-lead-module_brand">
                                <Select id="new-lead-module_brand" placeholder="Select module brand..." options={dropdownOptions('module_brand', meta)}
                                    value={formData.module_brand || ''} onChange={e => handleChange('module_brand', e.target.value)} />
                            </Field>
                            <Field label="Module Wp" htmlFor="new-lead-module_wp">
                                <Select id="new-lead-module_wp" placeholder="Select module Wp..." options={dropdownOptions('module_wp', meta)}
                                    value={formData.module_wp || ''} onChange={e => handleChange('module_wp', e.target.value)} />
                            </Field>
                            {text('no_of_modules', 'No of Modules', { type: 'number', min: '1', inputMode: 'numeric', placeholder: 'e.g. 10' })}
                            <Field label="System Capacity (kWp)" htmlFor="new-lead-system_capacity_kwp">
                                <div className="relative">
                                    <Input id="new-lead-system_capacity_kwp" type="text" inputMode="decimal" className="pr-20"
                                        value={formData.system_capacity_kwp || ''} onChange={e => handleChange('system_capacity_kwp', e.target.value)}
                                        placeholder="e.g. 3.24" />
                                    <button type="button" onClick={autoCalcCapacity} title="Calculate from Module Wp x No of Modules"
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-9 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 text-[11px] font-bold uppercase tracking-wide text-stone-950 transition cursor-pointer">
                                        Auto
                                    </button>
                                </div>
                            </Field>
                            {optionalCustomFields.map(customField)}
                        </div>

                        <section className="mt-5 space-y-3">
                            <div className="flex items-center gap-2 pb-1.5 border-b border-stone-100">
                                <ClipboardList size={13} className="text-amber-500" aria-hidden="true" />
                                <h3 className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                                    Payment{docMode === 'checklist' ? ' & document checklist' : ' & documents'}
                                </h3>
                            </div>
                            <Field label="Payment Type" htmlFor="new-lead-payment_type">
                                <Select id="new-lead-payment_type" placeholder="Select payment type..." options={PAYMENT_TYPES}
                                    value={formData.payment_type || ''} onChange={e => handleChange('payment_type', e.target.value)} />
                            </Field>

                            {paymentType === 'loan' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
                                    {text('bank_name', 'Bank Name', { placeholder: 'Enter bank name' })}
                                    {text('bank_branch', 'Bank Branch', { placeholder: 'Enter bank branch' })}
                                </div>
                            )}

                            {!formData.payment_type ? (
                                <p className="text-xs text-stone-600 italic py-2">Choose a payment type to see the documents needed.</p>
                            ) : docMode === 'checklist' ? (
                                <div className="divide-y divide-stone-100">
                                    {documents.map(doc => (
                                        <label key={doc.field} className="flex min-h-11 items-center gap-3 text-xs font-medium text-stone-700 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={formData[doc.field] === true}
                                                onChange={e => handleChange(doc.field, e.target.checked)} />
                                            {doc.label}
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <div className="divide-y divide-stone-100">
                                    {documents.map(doc => (
                                        <PendingDocument key={doc.field} label={doc.label} field={doc.field} pendingFile={pendingFiles[doc.field]}
                                            onFileAttach={handleFileAttach} onFileRemove={handleFileRemove} onPreview={handlePreviewFile} />
                                    ))}
                                </div>
                            )}
                        </section>
                    </details>
                </div>

                <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-stone-100 bg-white">
                    <button type="button" onClick={handleRequestClose} disabled={saving} className="sf-btn-secondary min-h-11">
                        Cancel
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving}
                        className="min-h-11 px-5 text-xs font-bold text-stone-950 bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-md shadow-amber-500/10 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                        {saving
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Saving lead…</>
                            : <><Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Lead</>}
                    </button>
                </div>
            </div>

            {previewDoc && (
                <FilePreviewModal
                    file={previewDoc.doc}
                    fileUrl={previewDoc.url}
                    onClose={handleClosePreview}
                    onDownload={() => downloadFileWithSaveAs(previewDoc.url, previewDoc.doc.file_name)}
                />
            )}
        </div>
    );
}
