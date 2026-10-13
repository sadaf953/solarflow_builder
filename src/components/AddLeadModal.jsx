import { demoLeadSchema } from '../utils/validation';
// src/components/AddLeadModal.jsx  -  SolarFlow Demo Energy
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { 
    X, Plus, User, ClipboardList, Paperclip, Eye, 
    Upload, FileText, Image as ImageIcon, Loader2, Banknote, AlertTriangle,
    HardDrive, MapPin, Sparkles
} from 'lucide-react';
import { DEFAULT_LEAD_FORM } from '../models';
import { FilePreviewModal } from './modal-tabs/shared';
import { toIndianCommas, fetchAgent2SubAgents, sanitizePhoneNumber, downloadFileWithSaveAs } from '../utils';
import { useGlobalPopup } from './GlobalPopup';
import { calculateSystemCapacityKwp } from '../utils/capacity';

// Dropdown component for metadata fields (clean single outline)
function AddLeadMetaSelect({ label, field, value, onChange, options = [] }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">{label}</label>
            <select
                aria-label={label} value={value || ''}
                onChange={e => onChange(field, e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
            >
                <option value="">Select {label}...</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}

// Autocomplete component for Channel Partner Name selector (clean single outline)
function ChannelPartnerAutocomplete({ label, value, onChange, suggestions = [], isAdmin = false }) {
    const [inputValue, setInputValue] = useState(value || '');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = inputValue.trim()
        ? suggestions.filter(s => s.toLowerCase().includes(inputValue.trim().toLowerCase()))
        : suggestions;

    const handleSelect = (val) => {
        setInputValue(val);
        onChange(val);
        setShowSuggestions(false);
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputValue(val);
        onChange(val);
        setShowSuggestions(true);
    };

    return (
        <div className="space-y-1 relative" ref={containerRef}>
            <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                {label}
            </label>
            <div className="relative">
                <input name="channel_partner" id="channel_partner"
                    type="text"
                    aria-label={label} value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                    placeholder={`Enter ${label}...`}
                />
                {showSuggestions && filtered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-100 rounded-xl shadow-xl z-50 max-h-40 overflow-y-auto py-1">
                        {filtered.map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => handleSelect(s)}
                                className="w-full text-left px-3.5 py-2 text-xs hover:bg-stone-50 text-stone-700 font-medium transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function AddLeadChecklistItem({ label, field, checked, onToggle, pendingFile, onFileAttach, onFileRemove, onPreview }) {
    const { showImageCropper } = useGlobalPopup();
    const fileInputRef = useRef(null);

    // Unchecked by default; checked only when a file is attached
    const isUploaded = Boolean(pendingFile);

    const handleFileChange = async (e) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile) return;
        e.target.value = '';

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: `Crop & Adjust ${label || 'Lead Document'}` });
            if (!file) return; // User cancelled upload
        }

        onFileAttach(field, file);
        if (onToggle) onToggle(field, true);
    };

    const handleRemove = () => {
        onFileRemove(field);
        if (onToggle) onToggle(field, false);
    };

    return (
        <div className="py-2.5 border-b border-stone-100 last:border-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    {/* Non-editable check indicator box driven solely by attached file */}
                    <div 
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                            isUploaded 
                                ? 'bg-emerald-500 border-emerald-500 text-white' 
                                : 'bg-stone-100 border-stone-300 text-transparent'
                        }`}
                        title={isUploaded ? 'File Attached' : 'Attach file to verify'}
                    >
                        {isUploaded && (
                            <svg className="w-2.5 h-2.5 stroke-[3] stroke-current" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        )}
                    </div>
                    <span className={`text-xs select-none ${isUploaded ? 'font-bold text-stone-900' : 'font-medium text-stone-600'}`}>
                        {label}
                    </span>
                    {isUploaded ? (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Attached
                        </span>
                    ) : (
                        <span className="text-[9px] font-bold text-stone-600 bg-stone-100 px-1.5 py-0.2 rounded">
                            Not Attached
                        </span>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                />

                {!pendingFile ? (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 hover:text-amber-600 px-2.5 py-1 rounded-lg border border-dashed border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all cursor-pointer"
                    >
                        <Paperclip size={11} /> Attach File / Photo
                    </button>
                ) : null}
            </div>

            {pendingFile && (
                <div className="flex items-center justify-between gap-1.5 bg-amber-50/80 border border-amber-200/80 rounded-xl px-2.5 py-1.5 ml-6">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Paperclip size={11} className="text-amber-600 flex-shrink-0" />
                        <span className="text-[10px] text-amber-900 font-semibold truncate">
                            {pendingFile.name}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => onPreview(pendingFile)}
                            className="text-[9px] font-bold text-amber-700 hover:text-amber-900 px-1.5 py-0.5 rounded hover:bg-amber-100 transition-colors flex items-center gap-0.5 cursor-pointer"
                            title="View preview & download"
                        >
                            <Eye size={10} /> View
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-[9px] font-bold text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-0.5 cursor-pointer"
                            title="Change file"
                        >
                            <Upload size={10} /> Change
                        </button>
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="text-[9px] font-bold text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors flex items-center gap-0.5 cursor-pointer"
                            title="Unstage this file (nothing has been uploaded yet)"
                        >
                            <X size={10} /> Remove
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AddLeadModal({ isOpen, onClose, onSave, meta = {}, channel_partners = [], user, initialValues = null }) {
    const fillSampleIndex = useRef(0);
    const { showAlert, showConfirm } = useGlobalPopup();
    const [formData, setFormData] = useState({ ...DEFAULT_LEAD_FORM });
    const [pendingFiles, setPendingFiles] = useState({}); // { [doc_type]: File }
    const [previewDoc, setPreviewDoc] = useState(null); // { doc, url }
    const [saving, setSaving] = useState(false);
    const [showOptional, setShowOptional] = useState(false);
    const [validationErrors, setValidationErrors] = useState([]);
    const [isFormDirty, setIsFormDirty] = useState(false);

    const isAgent = user?.userType === 'agent';
    // Anyone working in the Agent Portal is the sub channel partner for the
    // leads they add, so the field is theirs and locked - not a dropdown.
    const isAgent2 = user?.userType === 'agent2';
    const isPortalAgent = isAgent || isAgent2;
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office'
       
        || user?.userType === 'office2';
    const partnerName = (user?.channel_partner || user?.name || '').trim();

    const [subAgentOptions, setSubAgentOptions] = useState([]);

    useEffect(() => {
        const branch = (isAgent || isChannelPartnerOffice) ? partnerName : (formData.channel_partner || '');
        if (!branch) { setSubAgentOptions([]); return; }
        let cancelled = false;
        fetchAgent2SubAgents(branch).then(names => { if (!cancelled) setSubAgentOptions(names); });
        return () => { cancelled = true; };
    }, [isAgent, isChannelPartnerOffice, partnerName, formData.channel_partner]);

    useEffect(() => {
        if (isOpen) {
            const defaults = { ...DEFAULT_LEAD_FORM, ...initialValues };
            if (isAgent2) {
                defaults.channel_partner = user?.channel_partner || partnerName || '';
                defaults.sub_channel_partner = user?.name || '';
            } else if (isAgent) {
                defaults.channel_partner = partnerName || '';
                defaults.sub_channel_partner = user?.name || '';
            } else if (isChannelPartnerOffice) {
                defaults.channel_partner = partnerName || '';
                defaults.sub_channel_partner = null;
            }
            setFormData(defaults);
            setPendingFiles({});
            setShowOptional(false);
            setValidationErrors([]);
            setSaving(false);
            setIsFormDirty(false);
        }
    }, [isOpen, user, isAgent, isAgent2, isChannelPartnerOffice, partnerName, initialValues]);

    const requestCloseRef = useRef(null);
    const formDialogRef = useRef(null);
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
            // Let the file preview or a native confirmation handle its own keys.
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

    // Protect against accidental browser refresh or tab close when new lead form has unsaved edits
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

    const handleChange = (field, value) => {
        setIsFormDirty(true);
        setValidationErrors([]);
        let processedValue = value;
        // Consumer No is digits only. It used to be type="number", which
        // silently accepts "e" (exponent) and then reports the value as an
        // empty string - so typing a letter produced "must be at least 3
        // characters" instead of anything about letters.
        if (field === 'consumer_no') {
            processedValue = String(value).replace(/[^0-9]/g, '');
        }
        if (field === 'phone_number') {
            processedValue = sanitizePhoneNumber(value);
        }
        setFormData(prev => {
            const next = { ...prev, [field]: processedValue };
            return next;
        });
    };

    // Module Wp x No of Modules, on demand only. This used to run on every
    // keystroke in either field, silently overwriting a value typed by hand.
    const autoCalcCapacity = () => {
        const kwp = calculateSystemCapacityKwp(formData.module_wp, formData.no_of_modules);
        if (kwp == null) {
            showAlert('Enter Module Wp and No of Modules first.', { title: 'Cannot calculate', type: 'warning' });
            return;
        }
        // Wp x modules gives WATTS; the field is kWp, so divide by 1000.
        // This used to be Math.round(wp * count) - 540Wp x 6 wrote "3,240" into
        // a kWp field, when the answer is 3.24. Every imported record is in kWp
        // (4,536 of 4,646 carry decimals), so the auto-calc was the odd one out
        // and any lead created through this button had a capacity 1000x too big.
        //
        // Two decimals, trailing zeros trimmed: 3.24 stays 3.24, 3.00 becomes 3.
        handleChange('system_capacity_kwp', String(kwp));
    };

    const handleFillTestData = () => {
        setShowOptional(true);
        const samples = [
            {
                customer_name: 'Rajesh Sharma',
                phone_number: '9876543210',
                email_address: 'rajesh.sharma@example.com',
                consumer_no: '1089423589',
                villages: 'Bhavnagar Rural Area',
                full_address: 'Plot 42, Sector 8, Near Sun Temple, Bhavnagar',
                pincode: '364001',
                sub_divisions: 'Bhavnagar East Sub-Division',
                district: 'Bhavnagar',
                module_brand: meta['module_brand']?.[0] || 'WAAREE',
                module_wp: '580',
                no_of_modules: '6',
                system_capacity_kwp: '3.48',
                payment_type: 'Loan',
                bank_name: 'State Bank of India',
                bank_branch: 'Bhavnagar Main Branch',
                google_drive_link: 'https://drive.google.com/drive/folders/sample-solarflow-drive',
                location_link: 'https://maps.google.com/?q=21.7645,72.1519'
            },
            {
                customer_name: 'Priya Patel',
                phone_number: '9825123456',
                email_address: 'priya.patel@example.com',
                consumer_no: '1092837461',
                villages: 'Anand City West',
                full_address: 'B-14, Shanti Nagar Society, Station Road, Anand',
                pincode: '388001',
                sub_divisions: 'Anand Sub-Division',
                district: 'Anand',
                module_brand: meta['module_brand']?.[1] || 'ADANI',
                module_wp: '545',
                no_of_modules: '8',
                system_capacity_kwp: '4.36',
                payment_type: 'Cash',
                bank_name: '',
                bank_branch: '',
                google_drive_link: 'https://drive.google.com/drive/folders/sample-solarflow-drive',
                location_link: 'https://maps.google.com/?q=22.5645,72.9289'
            },
            {
                customer_name: 'Amitabh Joshi',
                phone_number: '9898012345',
                email_address: 'amitabh.joshi@example.com',
                consumer_no: '1073829104',
                villages: 'Varachha Rural',
                full_address: 'Shop 12, Crystal Heights, Mini Bazar, Surat',
                pincode: '395006',
                sub_divisions: 'Surat City Sub-Division',
                district: 'Surat',
                module_brand: meta['module_brand']?.[2] || 'GOLDEN SUN',
                module_wp: '580',
                no_of_modules: '10',
                system_capacity_kwp: '5.8',
                payment_type: 'Loan',
                bank_name: 'Bank of Baroda',
                bank_branch: 'Surat Textile Market',
                google_drive_link: 'https://drive.google.com/drive/folders/sample-solarflow-drive',
                location_link: 'https://maps.google.com/?q=21.1702,72.8311'
            }
        ];

        const sample = samples[fillSampleIndex.current % samples.length];
        fillSampleIndex.current += 1;

        setIsFormDirty(true);
        setValidationErrors([]);
        setFormData(prev => ({
            ...prev,
            ...sample,
            channel_partner: isAgent2 ? (user?.channel_partner || partnerName || '') : ((isAgent || isChannelPartnerOffice) ? partnerName : (prev.channel_partner || 'Demo Aurora Solar')),
            sub_channel_partner: isChannelPartnerOffice ? null : (isPortalAgent ? user?.name : (prev.sub_channel_partner || 'Demo Dealer'))
        }));
    };

    const handleFileAttach = (docType, file) => {
        setIsFormDirty(true);
        setPendingFiles(prev => ({ ...prev, [docType]: file }));
    };

    const handleFileRemove = (docType) => {
        setIsFormDirty(true);
        setPendingFiles(prev => {
            const next = { ...prev };
            delete next[docType];
            return next;
        });
    };

    const handlePreviewFile = (file) => {
        const url = URL.createObjectURL(file);
        setPreviewDoc({
            doc: {
                file_name: file.name,
                file_type: file.type,
            },
            url
        });
    };

    const handleClosePreview = () => {
        if (previewDoc?.url) URL.revokeObjectURL(previewDoc.url);
        setPreviewDoc(null);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (saving) return false; // Prevent double-submission from fast clicking
        
        const finalData = {
            ...formData,
            lead_creator_profile_id: user?.demo_profile_id || user?.id || null,
            channel_partner: isAgent2 ? (user?.channel_partner || partnerName || '') : ((isAgent || isChannelPartnerOffice) ? partnerName : (formData.channel_partner || '').trim()),
            sub_channel_partner: isChannelPartnerOffice ? null : isPortalAgent ? user?.name : (formData.sub_channel_partner || '').trim() || null,
            created_at: formData.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Ensure string fields are strings to pass Zod schema
        ['customer_name', 'phone_number', 'email_address', 'consumer_no', 'villages', 'full_address', 'pincode', 'district', 'channel_partner', 'module_brand', 'module_wp', 'no_of_modules', 'system_capacity_kwp', 'sub_divisions', 'bank_name', 'bank_branch', 'google_drive_link', 'location_link'].forEach(key => {
            if (finalData[key] !== undefined && finalData[key] !== null) {
                finalData[key] = String(finalData[key]);
            }
        });

        const result = demoLeadSchema.safeParse(finalData);
        if (!result.success) {
            if (result.error.issues.some(issue => !['customer_name', 'phone_number'].includes(issue.path[0]))) setShowOptional(true);
            setValidationErrors(result.error.issues.map(err => err.message));
            // Scroll to top
            const bodyEl = document.querySelector('.modal-body');
            if (bodyEl) bodyEl.scrollTop = 0;
            return false;
        }

        // Apply validated data
        const validatedData = result.data;

        // Package attached files as list of { file, doc_type }
        const filesToUpload = Object.entries(pendingFiles).map(([doc_type, file]) => ({
            file,
            doc_type
        }));

        setSaving(true);
        try {
            await onSave(validatedData, filesToUpload);
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
            confirmLabel: 'Discard Lead',
            cancelLabel: 'Keep Editing',
            type: 'warning'
        });
        closingRef.current = false;
        if (shouldDiscard) onClose();
    };
    requestCloseRef.current = handleRequestClose;

    const moduleWpOptions = (meta['module_wp'] && meta['module_wp'].length > 0)
        ? meta['module_wp']
        : ['540', '545', '550', '570', '575', '580', '585', '590', '600', '610', '615', '620'];


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
            <div ref={formDialogRef} role="dialog" aria-modal="true" aria-labelledby="add-lead-title" aria-describedby="add-lead-help" className="bg-white rounded-[28px] shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-stone-100 bg-white sticky top-0 z-10">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 id="add-lead-title" className="text-base font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                                <Plus size={18} className="text-amber-500" /> Add New Lead
                            </h2>

                        </div>
                        <p id="add-lead-help" className="text-xs text-stone-600 mt-1">
                            Start with a name and phone number. Everything else can wait.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleFillTestData}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-all cursor-pointer shadow-xs"
                            title="Fill a fictional customer and optional details for this demo"
                        >
                            <Sparkles size={13} className="text-amber-600" />
                            <span>Use sample customer</span>
                        </button>
                        <button 
                            onClick={handleRequestClose} 
                            aria-label="Close Add Lead"
                            disabled={saving}
                            className="p-2 hover:bg-stone-100 text-stone-600 hover:text-stone-700 rounded-xl transition cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Modal Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 modal-body">
                    {validationErrors.length > 0 && (
                        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wide">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                Please fix the following errors
                            </div>
                            <ul className="list-disc pl-5 text-xs text-red-750 font-medium space-y-1">
                                {validationErrors.map((err, idx) => {
                                    const msg = typeof err === 'string'
                                        ? err
                                        : (err?.message || (err?.text ? (err?.label ? `${err.label}: ${err.text}` : err.text) : JSON.stringify(err)));
                                    return <li key={idx}>{msg}</li>;
                                })}
                            </ul>
                        </div>
                    )}
                    {/* Section 1: Customer Info (Strictly Line-by-Line) */}
                    <section>
                        <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-stone-100">
                            <User size={13} className="text-amber-500" />
                            <h3 className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                                Customer Info
                            </h3>
                        </div>

                        <div className="space-y-3">
                            {/* Customer Name * */}
                            <div className="space-y-1">
                                <label htmlFor="new-lead-name" className="text-xs text-stone-600 font-bold block">
                                    Customer Name *
                                </label>
                                <input
                                    type="text"
                                    id="new-lead-name" aria-required="true" autoComplete="name"
                                    value={formData.customer_name || ''}
                                    onChange={e => handleChange('customer_name', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="Enter full name"

                                />
                            </div>

                            {/* Phone Number * */}
                            <div className="space-y-1">
                                <label htmlFor="new-lead-phone" className="text-xs text-stone-600 font-bold block">
                                    Phone Number *
                                </label>
                                <input
                                    type="tel" id="new-lead-phone" aria-required="true" autoComplete="tel"
                                    // 16 = "+" plus the E.164 maximum of 15 digits.
                                    // At 10 a +91 number could not be typed at all.
                                    maxLength={16}
                                    value={formData.phone_number || ''}
                                    onChange={e => handleChange('phone_number', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="0000000000 or +910000000000"

                                />
                            </div>

                        </div>
                    </section>
                    <details open={showOptional} onToggle={event => setShowOptional(event.currentTarget.open)} className="rounded-2xl border border-stone-200 p-4">
                        <summary className="cursor-pointer text-sm font-bold text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">Optional details &amp; documents</summary>
                        <p className="text-xs text-stone-500 mt-2 mb-4">Add address, team assignment, system details or documents now. Closing this section keeps your entries.</p>
                        <section><div className="space-y-3">
                            {/* Email Address */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    aria-label="Email Address" value={formData.email_address || ''}
                                    onChange={e => handleChange('email_address', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="name@example.com"

                                />
                            </div>

                            {/* Consumer No */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    Consumer No
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    aria-label="Consumer No" value={formData.consumer_no || ''}
                                    onChange={e => handleChange('consumer_no', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="Consumer number"

                                />
                            </div>

                            {/* Villages */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    Villages / Address
                                </label>
                                <input
                                    type="text"
                                    aria-label="Villages / Address" value={formData.villages || ''}
                                    onChange={e => handleChange('villages', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="Village or address"

                                />
                            </div>

                            {/* Tehsil / Sub Division */}
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">Full Address <span className="normal-case text-stone-600">(optional)</span></label>
                                <textarea
                                    rows={3}
                                    aria-label="Full Address (optional)" value={formData.full_address || ''}
                                    onChange={e => handleChange('full_address', e.target.value)}
                                    className="w-full resize-y bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="Complete installation address"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">Pincode <span className="normal-case text-stone-600">(optional)</span></label>
                                <input type="text" inputMode="numeric" maxLength={6} aria-label="Pincode (optional)" value={formData.pincode || ''}
                                    onChange={e => handleChange('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="6-digit pincode" />
                            </div>

                            {/* Tehsil / Sub Division */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    Tehsil / Sub Division
                                </label>
                                <input
                                    type="text"
                                    aria-label="Tehsil / Sub Division" value={formData.sub_divisions || ''}
                                    onChange={e => handleChange('sub_divisions', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="Tehsil or sub division"

                                />
                            </div>

                            {/* District */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    District
                                </label>
                                <input
                                    type="text"
                                    aria-label="District" value={formData.district || ''}
                                    onChange={e => handleChange('district', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="District"
                                />
                            </div>

                            {/* Google Drive Link */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold flex items-center gap-1.5">
                                    <HardDrive size={12} className="text-blue-500" />
                                    Google Drive Link <span className="normal-case text-stone-600 font-medium">(optional)</span>
                                </label>
                                <input
                                    type="url"
                                    aria-label="Google Drive Link (optional)" value={formData.google_drive_link || ''}
                                    onChange={e => handleChange('google_drive_link', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    placeholder="https://drive.google.com/..."
                                />
                            </div>

                            {/* Site Location Link */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold flex items-center gap-1.5">
                                    <MapPin size={12} className="text-emerald-500" />
                                    Site Location Link <span className="normal-case text-stone-600 font-medium">(optional)</span>
                                </label>
                                <input
                                    type="url"
                                    aria-label="Site Location Link (optional)" value={formData.location_link || ''}
                                    onChange={e => handleChange('location_link', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                                    placeholder="https://maps.google.com/?q=..."
                                />
                            </div>

                            {/* Agents and Channel Partner Office users are always assigned to
                                themselves. agent2 (a Dealer under a CPO) does not see the field
                                at all - the value is still enforced on submit from
                                user.channel_partner, it is just not shown to them. */}
                            {isAgent2 ? null : (isAgent || isChannelPartnerOffice) ? (
                                <div className="space-y-1">
                                    <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                        Channel Partner Name
                                    </label>
                                    <input
                                        type="text"
                                        value={partnerName}
                                        disabled
                                        className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-700 cursor-not-allowed"
                                    /> 
                                </div>
                            ) : (
                                <ChannelPartnerAutocomplete
                                    label="Channel Partner Name"
                                    value={formData.channel_partner}
                                    onChange={val => handleChange('channel_partner', val)}
                                    suggestions={channel_partners}
                                    isAdmin={user?.userType === 'admin'}
                                />
                            )}

                            {/* A Channel Partner files leads under their own name. CPO and
                                Manager accounts get a dropdown scoped to their CPO. */}
                            {isChannelPartnerOffice ? (
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                                    <strong>Added by your office</strong><p>This lead belongs to your CPO. Leads added by your dealers appear here automatically.</p>
                                </div>
                            ) : isPortalAgent ? (
                                <div className="space-y-1">
                                    <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                        Dealer Name
                                    </label>
                                    <input
                                        type="text"
                                        value={user?.name || ''}
                                        disabled
                                        readOnly
                                        className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-700 cursor-not-allowed"
                                    />
                                    <p className="text-[10px] text-stone-600 italic">Set automatically to your account.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                        Dealer Name <span className="normal-case text-stone-600 font-medium">(optional)</span>
                                    </label>
                                    <select
                                        aria-label="Dealer Name (optional)" value={formData.sub_channel_partner || ''}
                                        onChange={e => handleChange('sub_channel_partner', e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    >
                                        <option value="">None</option>
                                        {formData.sub_channel_partner && !subAgentOptions.includes(formData.sub_channel_partner) && (
                                            <option value={formData.sub_channel_partner}>{formData.sub_channel_partner}</option>
                                        )}
                                        {subAgentOptions.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                    {subAgentOptions.length === 0 && (
                                        <p className="text-[10px] text-stone-600 italic">No Channel Partners are registered under this CPO yet - add them in User Management first.</p>
                                    )}
                                </div>
                            )}

                            {/* MODULE BRAND */}
                            <div className="space-y-1">
                                 <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                     MODULE BRAND
                                 </label>
                                 <select
                                     aria-label="Module Brand" value={formData.module_brand || ''}
                                     onChange={e => handleChange('module_brand', e.target.value)}
                                     className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"

                                 >
                                     <option value="">Select MODULE BRAND...</option>
                                     {(meta['module_brand'] || []).map(o => <option key={o} value={o}>{o}</option>)}
                                 </select>
                            </div>

                            {/* MODULE WP */}
                            <div className="space-y-1">
                                 <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                     MODULE WP
                                 </label>
                                 <select
                                     aria-label="Module Wp" value={formData.module_wp || ''}
                                     onChange={e => handleChange('module_wp', e.target.value)}
                                     className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"

                                 >
                                     <option value="">Select MODULE WP...</option>
                                     {moduleWpOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                 </select>
                            </div>

                            {/* No of Modules */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    No of Modules
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    aria-label="No of Modules" value={formData.no_of_modules || ''}
                                    onChange={e => handleChange('no_of_modules', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    placeholder="e.g. 10"

                                />
                            </div>

                            {/* System Capacity */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                                    System Capacity
                                </label>
                                <span className="relative block">
                                    <input
                                        type="text"
                                        aria-label="System Capacity" value={formData.system_capacity_kwp || ''}
                                        onChange={e => handleChange('system_capacity_kwp', e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 pr-16 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                        placeholder="e.g. 32,940"

                                    />
                                    <button
                                        type="button"
                                        onClick={autoCalcCapacity}
                                        title="Calculate from Module Wp x No of Modules"
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-amber-500 hover:bg-amber-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-950 transition cursor-pointer"
                                    >
                                        Auto
                                    </button>
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Document Checklist (Strictly Line-by-Line) */}
                    <section>
                        <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-stone-100">
                            <div className="flex items-center gap-2">
                                <ClipboardList size={13} className="text-amber-500" />
                                <h3 className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                                    Document Checklist (optional uploads)
                                </h3>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Payment Type Selection at the top */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                                    Payment Type Selection
                                </label>
                                {/* The saved value is title-cased by the Zod schema ('Cash'
                                    / 'Loan') while these options come from metadata, which
                                    is uppercase. A <select> whose value matches no <option>
                                    renders BLANK - which is why a chosen Payment Type looked
                                    like it had disappeared. Match case-insensitively, and
                                    keep any unrecognised stored value visible. */}
                                {(() => {
                                    const ptOptions = meta['payment_type'] || ['CASH', 'LOAN'];
                                    const stored = String(formData.payment_type || '').trim();
                                    const matched = ptOptions.find(o => String(o).trim().toLowerCase() === stored.toLowerCase());
                                    return (
                                <select
                                    aria-label="Payment Type Selection" value={matched ?? stored}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        handleChange('payment_type', val);
                                    }}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-semibold text-stone-800 transition-all"

                                >
                                    <option value="">Select Payment Type...</option>
                                    {stored && !matched && (
                                        <option value={stored}>{stored}</option>
                                    )}
                                    {ptOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                                    );
                                })()}
                            </div>

                            {String(formData.payment_type || '').trim().toLowerCase() === 'loan' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Bank Name</label>
                                        <input
                                            type="text"
                                            aria-label="Bank Name" value={formData.bank_name || ''}
                                            onChange={e => handleChange('bank_name', e.target.value)}
                                            placeholder="Enter bank name"
                                            className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Bank Branch</label>
                                        <input
                                            type="text"
                                            aria-label="Bank Branch" value={formData.bank_branch || ''}
                                            onChange={e => handleChange('bank_branch', e.target.value)}
                                            placeholder="Enter bank branch"
                                            className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Checklist items only visible if payment_type is selected */}
                            {formData.payment_type ? (
                                <div className="space-y-1 divide-y divide-stone-100">
                                    {formData.payment_type?.trim().toLowerCase() !== 'cash' && (
                                        <>
                                            <AddLeadChecklistItem
                                                label="Aadhar Card Front"
                                                field="adhaar_card_front"
                                                checked={formData.adhaar_card_front}
                                                onToggle={handleChange}
                                                pendingFile={pendingFiles['adhaar_card_front']}
                                                onFileAttach={handleFileAttach}
                                                onFileRemove={handleFileRemove}
                                                onPreview={handlePreviewFile}
                                            />
                                            <AddLeadChecklistItem
                                                label="Aadhar Card Back"
                                                field="adhaar_card_back"
                                                checked={formData.adhaar_card_back}
                                                onToggle={handleChange}
                                                pendingFile={pendingFiles['adhaar_card_back']}
                                                onFileAttach={handleFileAttach}
                                                onFileRemove={handleFileRemove}
                                                onPreview={handlePreviewFile}
                                            />
                                            <AddLeadChecklistItem
                                                label="PAN Card"
                                                field="pan_card"
                                                checked={formData.pan_card}
                                                onToggle={handleChange}
                                                pendingFile={pendingFiles['pan_card']}
                                                onFileAttach={handleFileAttach}
                                                onFileRemove={handleFileRemove}
                                                onPreview={handlePreviewFile}
                                            />
                                            <AddLeadChecklistItem
                                                label="Index 2"
                                                field="index_2"
                                                checked={formData.index_2}
                                                onToggle={handleChange}
                                                pendingFile={pendingFiles['index_2']}
                                                onFileAttach={handleFileAttach}
                                                onFileRemove={handleFileRemove}
                                                onPreview={handlePreviewFile}
                                            />
                                            <AddLeadChecklistItem
                                                label="House Geo Tag Photo"
                                                field="house_geo_tag_photo"
                                                checked={formData.house_geo_tag_photo}
                                                onToggle={handleChange}
                                                pendingFile={pendingFiles['house_geo_tag_photo']}
                                                onFileAttach={handleFileAttach}
                                                onFileRemove={handleFileRemove}
                                                onPreview={handlePreviewFile}
                                            />
                                        </>
                                    )}

                                    <AddLeadChecklistItem
                                        label="Light Bill"
                                        field="light_bill"
                                        checked={formData.light_bill}
                                        onToggle={handleChange}
                                        pendingFile={pendingFiles['light_bill']}
                                        onFileAttach={handleFileAttach}
                                        onFileRemove={handleFileRemove}
                                        onPreview={handlePreviewFile}
                                    />

                                    <AddLeadChecklistItem
                                        label="Bank Details"
                                        field="bank_details"
                                        checked={formData.bank_details}
                                        onToggle={handleChange}
                                        pendingFile={pendingFiles['bank_details']}
                                        onFileAttach={handleFileAttach}
                                        onFileRemove={handleFileRemove}
                                        onPreview={handlePreviewFile}
                                    />

                                    <AddLeadChecklistItem
                                        label="Extra Documents"
                                        field="extra_docs"
                                        checked={formData.extra_docs}
                                        onToggle={handleChange}
                                        pendingFile={pendingFiles['extra_docs']}
                                        onFileAttach={handleFileAttach}
                                        onFileRemove={handleFileRemove}
                                        onPreview={handlePreviewFile}
                                    />
                                </div>
                            ) : (
                                <p className="text-xs text-stone-600 italic py-2">
                                    Please select a Payment Type above to display the Document Checklist.
                                </p>
                            )}
                        </div>
                    </section>
                    </details>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-100 bg-white sticky bottom-0 z-10">
                    <button 
                        type="button"
                        onClick={handleRequestClose}
                        disabled={saving}
                        className="px-4 py-2.5 text-xs font-bold text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button 
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2.5 text-xs font-bold text-stone-950 bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-md shadow-amber-500/10 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving Lead & Uploading Files...
                            </>
                        ) : (
                            <>
                                <Plus className="w-3.5 h-3.5" />
                                Add Lead
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* File Preview Modal */}
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
