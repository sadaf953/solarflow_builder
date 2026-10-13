import { useState, useEffect, useRef } from 'react';
import { Trash2, Edit3, X, Paperclip, Eye, Upload, FileText, Image as ImageIcon, Download, MessageSquare, Check, Phone } from 'lucide-react';
import { formatINR, toIndianCommas, formatInputValue, getTelephoneHref } from '../../utils';
import { supabase } from '../../supabase';
import { useGlobalPopup } from '../GlobalPopup';
import { useChecklistMode } from '../../utils/checklistMode';
import { documentMode } from '../../config/index.js';

// ─── Vendor name list (process-wide cache) ────────────────────────────────────
// InstallationStatusTab and MaterialDeliveryTab each fetched this on mount with
// a [] dependency array - but a modal tab re-mounts every time it is opened, so
// the same ~90ms round trip was paid again on every customer and every tab
// switch, with the vendor dropdown empty until it landed.
//
// The list changes only when someone adds a vendor, which is rare and already
// requires a reload to show up elsewhere. A failed fetch is deliberately NOT
// cached, so a transient error retries on the next open instead of leaving the
// dropdown permanently empty.
let vendorNamesCache = null;
let vendorNamesInflight = null;

export async function fetchVendorNames() {
    if (vendorNamesCache) return vendorNamesCache;
    if (vendorNamesInflight) return vendorNamesInflight;   // dedupe concurrent mounts

    vendorNamesInflight = (async () => {
        const { data, error } = await supabase.from('vendors').select('name').order('name');
        vendorNamesInflight = null;
        if (error) {
            console.error('Error fetching vendors:', error);
            return [];
        }
        vendorNamesCache = (data || []).map(v => v.name).filter(Boolean);
        return vendorNamesCache;
    })();

    return vendorNamesInflight;
}

// Call after adding or renaming a vendor so open tabs pick it up.
export function invalidateVendorNames() {
    vendorNamesCache = null;
}

const fmt = formatINR;

// Render trailing required markers consistently. String labels such as
// "Customer Name *" would otherwise inherit the surrounding grey label colour.
function RequiredLabel({ label }) {
    if (typeof label !== 'string' || !label.trim().endsWith('*')) return <>{label}</>;
    const text = label.trim().slice(0, -1).trimEnd();
    return <>{text} <span className="text-red-500">*</span></>;
}

export function getStageRemarkFromData(remarks, stageId) {
    if (!remarks) return '';
    if (typeof remarks === 'object') {
        return remarks[stageId] || '';
    }
    if (typeof remarks === 'string') {
        try {
            const parsed = JSON.parse(remarks);
            if (typeof parsed === 'object' && parsed) {
                return parsed[stageId] || '';
            }
            return parsed || '';
        } catch {
            return remarks;
        }
    }
    return '';
}

// ─── MetaSelect: standard select dropdown for metadata fields ─────────────────
export function MetaSelect({ label, field, value, onChange, options = [], isEditing }) {
    if (!isEditing) {
        return (
            <div className="bg-stone-50 p-3 rounded-xl">
                <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1 font-bold"><RequiredLabel label={label} /></p>
                <p className="text-sm font-semibold truncate text-stone-800">{value || '–'}</p>
            </div>
        );
    }

    return (
        <div className="bg-stone-50 p-3 rounded-xl">
            <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1 font-bold"><RequiredLabel label={label} /></p>
            <select value={value || ''} onChange={e => onChange(field, e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300">
                <option value="">Select...</option>
                {value && !options.includes(value) && (
                    <option value={value}>{value}</option>
                )}
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}

// ─── DetailItem / EditableDetailItem ──────────────────────────────────────────
export function DetailItem({ label, value, isMoney = false, isEnergy = false }) {
    let displayVal = value;
    if (label && typeof label === 'string' && label.toLowerCase().includes('capacity') && value) {
        displayVal = toIndianCommas(value);
    }
    const isPhone = label && typeof label === 'string' && label.toLowerCase().includes('phone') && value;
    const telHref = isPhone ? getTelephoneHref(value) : null;
    const isUrl = label && typeof label === 'string' && label.toLowerCase().includes('link') && typeof value === 'string' && /^https?:\/\//i.test(value.trim());

    return (
        <div className="bg-stone-50 p-2.5 rounded-xl">
            <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-0.5 font-bold"><RequiredLabel label={label} /></p>
            {telHref ? (
                <a
                    href={telHref}
                    className="text-sm font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1.5 cursor-pointer"
                    title={`Click to call ${value}`}
                >
                    <Phone size={12} className="text-emerald-500 flex-shrink-0" />
                    <span className="truncate">{displayVal}</span>
                </a>
            ) : isUrl ? (
                <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1.5 cursor-pointer"
                    title={`Open link: ${value}`}
                >
                    <span className="truncate">{displayVal}</span>
                </a>
            ) : (
                <p className={`text-sm font-semibold truncate ${isMoney ? 'text-emerald-600' : isEnergy ? 'text-amber-600' : 'text-stone-800'}`}>
                    {isMoney ? fmt(value) : (displayVal || '–')}
                </p>
            )}
        </div>
    );
}

// Autocomplete component for Channel Partner Name selector inside editing view
export function ChannelPartnerAutocomplete({ label, value, onChange, suggestions = [], isAdmin = false }) {
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

    const filtered = (inputValue || '').trim()
        ? (suggestions || []).filter(s => String(s || '').toLowerCase().includes(inputValue.trim().toLowerCase()))
        : (suggestions || []);

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
        <div className="relative w-full" ref={containerRef}>
            <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setShowSuggestions(true)}
                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300"
                placeholder={label}
            />
            {showSuggestions && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-100 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto py-1">
                    {filtered.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => handleSelect(s)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50 text-stone-700 font-medium transition-colors"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function EditableDetailItem({ label, field, value, onChange, type = 'text', isMoney = false, isEnergy = false, isEditing, options, category, channel_partners = [], isAdmin = false, onAutoCalc }) {
    if (options && category) {
        return <MetaSelect label={label} field={field} value={value} onChange={onChange} options={options} isEditing={isEditing} />;
    }
    if (!isEditing) return <DetailItem label={label} value={value} isMoney={isMoney} isEnergy={isEnergy} />;

    if (field === 'channel_partner') {
        return (
            <div className="bg-stone-50 p-2.5 rounded-xl">
                <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1 font-bold"><RequiredLabel label={label} /></p>
                <ChannelPartnerAutocomplete label={label} value={value} onChange={(val) => onChange(field, val)} suggestions={channel_partners} isAdmin={isAdmin} />
            </div>
        );
    }

    return (
        <div className="bg-stone-50 p-2.5 rounded-xl">
            <p className="text-[9px] text-stone-400 uppercase tracking-wide mb-1 font-bold"><RequiredLabel label={label} /></p>
            {options ? (
                <select value={value || ''} onChange={e => onChange(field, e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300">
                    <option value="">Select...</option>
                    {value && !options.includes(value) && (
                        <option value={value}>{value}</option>
                    )}
                    {options.map(o => <option key={o}>{o}</option>)}
                </select>
            ) : isMoney || field === 'invoice_value' ? (
                <input type="text" inputMode="decimal" value={value ? formatInputValue(value) : ''}
                    onChange={e => onChange(field, formatInputValue(e.target.value))}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
            ) : onAutoCalc ? (
                <div className="relative">
                    <input type={type} value={value || ''} onChange={e => onChange(field, e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 pr-14 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-800" />
                    <button
                        type="button"
                        onClick={onAutoCalc}
                        title="Calculate from Module Wp x No of Modules"
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-amber-500 hover:bg-amber-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white transition cursor-pointer"
                    >
                        Auto
                    </button>
                </div>
            ) : type === 'textarea' ? (
                <textarea rows={3} value={value || ''} onChange={e => onChange(field, e.target.value)}
                    className="w-full resize-y bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
            ) : (
                <input type={type} value={value || ''} onChange={e => onChange(field, e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
            )}
        </div>
    );
}

// ─── FilePreviewModal ─────────────────────────────────────────────────────────
export function FilePreviewModal({ file, fileUrl, onClose, onDownload, onUpdateRemark }) {
    const [remark, setRemark] = useState(file?.remark || '');
    const [savingRemark, setSavingRemark] = useState(false);
    const [remarkSaved, setRemarkSaved] = useState(false);

    const [imgError, setImgError] = useState(false);

    if (!file) return null;
    const ext = (file.file_name || '').split('.').pop()?.toLowerCase();
    const isImage = file.file_type?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
    const isPdf = file.file_type === 'application/pdf' || ext === 'pdf' || (fileUrl && fileUrl.toLowerCase().includes('.pdf'));

    const handleSaveRemark = async () => {
        if (!onUpdateRemark) return;
        setSavingRemark(true);
        // The handlers now return false when the write was refused. "Saved!"
        // used to show unconditionally, so a remark the database rejected still
        // turned the button green.
        const ok = await onUpdateRemark(file.id, remark);
        setSavingRemark(false);
        if (ok === false) return;   // the handler has already shown the error
        setRemarkSaved(true);
        setTimeout(() => setRemarkSaved(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-stone-100">
                    <div className="flex items-center gap-2 min-w-0">
                        {isImage ? <ImageIcon size={16} className="text-stone-400 flex-shrink-0" /> : <FileText size={16} className="text-stone-400 flex-shrink-0" />}
                        <p className="text-sm font-bold text-stone-800 truncate">{file.file_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={onDownload}
                            className="flex items-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                        >
                            <Download size={12} /> Download
                        </button>
                        <button aria-label="Close file preview" onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer">
                            <X size={16} className="text-stone-400" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-stone-50">
                    {isImage && fileUrl && !imgError && (
                        <img 
                            src={fileUrl} 
                            alt={file.file_name} 
                            className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
                            onError={() => setImgError(true)}
                        />
                    )}
                    {isImage && (imgError || !fileUrl) && (
                        <div className="flex flex-col items-center gap-3 py-12 text-stone-400">
                            <ImageIcon size={48} className="text-stone-300" />
                            <p className="text-sm font-semibold text-stone-600">Could not preview image directly</p>
                            <button
                                type="button"
                                onClick={onDownload}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition"
                            >
                                <Download size={12} /> Download Image
                            </button>
                        </div>
                    )}
                    {isPdf && fileUrl && (
                        <iframe src={fileUrl} title={file.file_name} className="w-full h-[60vh] rounded-lg border border-stone-200" />
                    )}
                    {!isImage && !isPdf && (
                        <div className="flex flex-col items-center gap-3 py-12 text-stone-400">
                            <FileText size={48} className="text-stone-300" />
                            <p className="text-sm font-semibold">Preview not available</p>
                            <p className="text-xs">Click Download to view this file</p>
                        </div>
                    )}
                </div>

                {/* Only where there is somewhere to save the remark; otherwise typed text would be lost on close. */}
                {onUpdateRemark && (
                <div className="p-3.5 bg-white border-t border-stone-100 flex items-center gap-2">
                    <MessageSquare size={14} className="text-stone-400 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Add a remark for this document (e.g. Verified, Valid KYC, Approved)..."
                        aria-label="Document remark"
                        value={remark}
                        onChange={e => setRemark(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveRemark();
                        }}
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                        type="button"
                        disabled={savingRemark}
                        onClick={handleSaveRemark}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                            remarkSaved
                                ? 'bg-emerald-600 text-white'
                                : 'bg-stone-900 hover:bg-stone-800 text-white'
                        }`}
                    >
                        <Check size={12} />
                        <span>{savingRemark ? 'Saving...' : remarkSaved ? 'Saved!' : 'Save Remark'}</span>
                    </button>
                </div>
                )}
            </div>
        </div>
    );
}

// ─── Per-document remark: view, add and edit ─────────────────────────────────
// `compact` sits under a checklist item, `gallery` under a Documents card.
// The editor stays open when the save is refused so the typed text is kept.
const REMARK_STYLES = {
    compact: {
        editor: 'flex items-center gap-1.5 mt-1 animate-in fade-in',
        input: 'flex-1 bg-white border border-stone-200 rounded-lg px-2 py-0.5 text-[10px] text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium',
        save: 'px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[9px] font-bold cursor-pointer transition',
        cancel: 'px-1.5 py-0.5 text-stone-400 hover:text-stone-600 text-[9px] font-medium cursor-pointer',
        row: 'flex items-center justify-between gap-1.5 mt-0.5 px-1 py-0.5 bg-amber-50/60 rounded border border-amber-200/50',
        pill: 'flex items-center gap-1 min-w-0 flex-1',
        icon: 9,
        text: 'text-[10px] text-amber-900 font-medium truncate',
        edit: 'text-[9px] font-bold text-amber-700 hover:text-amber-900 underline cursor-pointer flex-shrink-0',
        editLabel: 'Edit',
        addWrap: 'mt-0.5',
        add: 'text-[9px] text-stone-400 hover:text-stone-700 font-semibold flex items-center gap-1 cursor-pointer transition',
        addLabel: '+ Add remark',
        placeholder: 'Enter remark for this file...',
    },
    gallery: {
        editor: 'pt-2 mt-1 border-t border-stone-200/60 flex items-center gap-1.5 animate-in fade-in',
        input: 'flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium',
        save: 'px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer',
        cancel: 'px-2 py-1 text-stone-400 hover:text-stone-600 text-xs font-medium cursor-pointer',
        row: 'pt-2 mt-1 border-t border-stone-200/60 flex items-center justify-between gap-2',
        pill: 'flex items-center gap-1.5 min-w-0 flex-1 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200/60',
        icon: 11,
        text: 'text-[11px] text-amber-900 font-medium truncate',
        edit: 'text-[10px] font-bold text-stone-500 hover:text-stone-800 underline cursor-pointer flex-shrink-0',
        editLabel: 'Edit Remark',
        addWrap: 'pt-1.5 mt-0.5 border-t border-dashed border-stone-200 flex justify-end',
        add: 'text-[10px] text-stone-400 hover:text-stone-700 font-bold flex items-center gap-1 cursor-pointer transition',
        addLabel: '+ Add Remark',
        placeholder: 'Remark for this document...',
    },
};

function DocRemarkEditor({ doc, onUpdateRemark, canEdit, variant = 'compact' }) {
    const style = REMARK_STYLES[variant];
    const [isEditing, setIsEditing] = useState(false);
    const [remarkVal, setRemarkVal] = useState(doc.remark || '');
    const [saving, setSaving] = useState(false);
    const editable = canEdit && Boolean(onUpdateRemark);

    useEffect(() => {
        setRemarkVal(doc.remark || '');
    }, [doc.remark]);

    const handleSave = async () => {
        setSaving(true);
        const ok = await onUpdateRemark(doc.id, remarkVal);
        setSaving(false);
        if (ok === false) return;
        setIsEditing(false);
    };

    if (isEditing && editable) {
        return (
            <div className={style.editor}>
                <input
                    type="text"
                    value={remarkVal}
                    placeholder={style.placeholder}
                    aria-label="Remark"
                    onChange={e => setRemarkVal(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleSave();
                        if (e.key === 'Escape') setIsEditing(false);
                    }}
                    autoFocus
                    className={style.input}
                />
                <button type="button" disabled={saving} onClick={handleSave} className={style.save}>
                    {saving ? '...' : 'Save'}
                </button>
                <button type="button" onClick={() => setIsEditing(false)} className={style.cancel}>
                    Cancel
                </button>
            </div>
        );
    }

    if (doc.remark) {
        return (
            <div className={style.row}>
                <div className={style.pill}>
                    <MessageSquare size={style.icon} className="text-amber-600 flex-shrink-0" />
                    <span className={style.text} title={doc.remark}>{doc.remark}</span>
                </div>
                {editable && (
                    <button type="button" onClick={() => setIsEditing(true)} className={style.edit}>
                        {style.editLabel}
                    </button>
                )}
            </div>
        );
    }

    if (!editable) return null;
    return (
        <div className={style.addWrap}>
            <button type="button" onClick={() => setIsEditing(true)} className={style.add}>
                <MessageSquare size={style.icon - 1} />
                <span>{style.addLabel}</span>
            </button>
        </div>
    );
}

// Recall marker. Admin/Office stamp a document with this to send it back; only
// then may the uploader replace it. Exported so every portal enforces the same
// rule instead of re-implementing (or skipping) it.
export const RETURNED_DOCUMENT_PREFIX = '[RETURNED]';
export const isReturnedDocument = (doc) => String(doc?.remark || '').trim().toUpperCase().startsWith(RETURNED_DOCUMENT_PREFIX);

// One document item: a tick in checklist mode, an upload in files mode.
// A client with only one of the two features always gets that one. With both,
// each user picks (utils/checklistMode.js), and `mode` forces one of them
// (extra file fields always need the upload).
//
// onUpload(event, field) stores event.target.files[0] and resolves false when
// nothing was stored. "Change" removes the replaced file through onDelete only
// after that, so a failed or refused upload never loses the old document.
export function CheckboxRemarkItem({ label, field, value, onChange, onAutoSave, isEditing, documents = [], onUpload, onDelete, onPreview, onUpdateRemark, note, canDelete = false, canReplace = canDelete, allowReturnedReplace = !canDelete, mode }) {
    const { showConfirm, showImageCropper } = useGlobalPopup();
    const fieldDocs = documents.filter(d => d.doc_type === field);
    const fileInputRef = useRef(null);
    const [replacingDocId, setReplacingDocId] = useState(null);
    const sharedMode = useChecklistMode();
    const clientMode = documentMode();
    const checklistMode = clientMode === 'both' ? (mode || sharedMode) : clientMode;
    const filesOn = clientMode !== 'checklist';
    const canUpload = filesOn && Boolean(onUpload);
    const canRemove = filesOn && canDelete && Boolean(onDelete);
    const canReplaceDoc = doc => canUpload && Boolean(onDelete) && (canReplace || (allowReturnedReplace && isReturnedDocument(doc)));

    const isUploaded = fieldDocs.length > 0;
    const isChecklistOnly = checklistMode === 'checklist';
    const isChecked = isChecklistOnly ? (Boolean(value) || isUploaded) : isUploaded;

    const handleCheckboxClick = async () => {
        if (!isEditing) return;
        if (isChecklistOnly) {
            const nextVal = !isChecked;
            if (onChange) onChange(field, nextVal);
            if (onAutoSave) {
                await onAutoSave(field, nextVal);
            }
        } else if (!isUploaded && canUpload) {
            handleUploadClick();
        }
    };

    const handleUploadClick = (existingDocId = null) => {
        setReplacingDocId(existingDocId);
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e) => {
        const rawFile = e.target.files?.[0];
        const replacing = fieldDocs.find(d => d.id === replacingDocId);
        setReplacingDocId(null);
        e.target.value = '';
        if (!rawFile || !canUpload) return;
        if (replacing && !canReplaceDoc(replacing)) return;

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: `Crop & Adjust ${label || 'Document'}` });
            if (!file) return; // User cancelled upload
        }

        const stored = await onUpload({ target: { files: [file], value: '' } }, field);
        if (stored === false) return;
        if (replacing) await onDelete(replacing);
        if (onChange) onChange(field, true);
    };

    const handleDeleteClick = async (doc) => {
        const confirmed = await showConfirm(
            `Are you sure you want to permanently delete “${doc.file_name || 'this document'}”? It will be removed from the backend and cannot be recovered.`,
            { title: 'Delete Document?', confirmLabel: 'Delete Permanently', cancelLabel: 'Cancel', type: 'danger' }
        );
        if (!confirmed) return;
        const result = onDelete ? await onDelete(doc) : false;
        if (result === false) return;
        const remaining = fieldDocs.filter(d => d.id !== doc.id);
        if (remaining.length === 0 && onChange && !isChecklistOnly) {
            onChange(field, false);
        }
    };

    return (
        <div className="py-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    {/* Interactive check indicator: clickable in checklist mode or triggers upload in file mode */}
                    <button
                        type="button"
                        onClick={handleCheckboxClick}
                        disabled={!isEditing}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                            isChecked 
                                ? 'bg-emerald-500 border-emerald-500 text-white' 
                                : isEditing ? 'border-stone-300 hover:border-amber-400 bg-white cursor-pointer' : 'bg-stone-100 border-stone-300 text-transparent'
                        }`}
                        title={isChecklistOnly ? (isChecked ? 'Completed (click to uncheck)' : 'Click to mark checked') : (isUploaded ? 'Verified & Uploaded' : canUpload ? 'Click to upload file to verify' : 'Not uploaded yet')}
                    >
                        {isChecked && (
                            <svg className="w-2.5 h-2.5 stroke-[3] stroke-current" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        )}
                    </button>
                    <span 
                        onClick={isChecklistOnly && isEditing ? handleCheckboxClick : undefined}
                        className={`text-xs select-none ${isChecklistOnly && isEditing ? 'cursor-pointer' : ''} ${isChecked ? 'font-bold text-stone-900' : 'font-medium text-stone-600'}`}
                    >
                        <RequiredLabel label={label} />
                    </span>
                    {isChecklistOnly ? (
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                            isChecked 
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                                : 'text-stone-400 bg-stone-100 border-stone-200'
                        }`}>
                            {isChecked ? 'Checked' : 'Pending'}
                        </span>
                    ) : isUploaded ? (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Uploaded
                        </span>
                    ) : (
                        <span className="text-[9px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.2 rounded">
                            Not Uploaded
                        </span>
                    )}
                </div>
            </div>
            {note && (
                <div className="ml-6.5 mt-0.5 mb-1.5">
                    <p className="text-[10px] text-stone-500 font-medium italic">{note}</p>
                </div>
            )}

            {canUpload && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,application/pdf,.png,.jpg,.jpeg,.pdf"
                    onChange={handleFileSelected}
                    className="hidden"
                />
            )}

            <div className="ml-6.5 mt-1.5 space-y-1.5">
                {fieldDocs.map(doc => (
                    <div key={doc.id} className="bg-stone-50 border border-stone-200 rounded-lg p-2 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <Paperclip size={11} className="text-stone-400 flex-shrink-0" />
                            <span className="text-[10px] text-stone-600 font-medium truncate flex-1">{doc.file_name}</span>
                            {isReturnedDocument(doc) && <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Returned</span>}
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {onPreview && (
                                    <button onClick={() => onPreview(doc)} className="text-[9px] font-bold text-amber-600 hover:text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-50 transition-colors flex items-center gap-0.5 cursor-pointer" title="View Document (opens preview & download)">
                                        <Eye size={10} /> View
                                    </button>
                                )}
                                {isEditing && canReplaceDoc(doc) && (
                                    <button onClick={() => handleUploadClick(doc.id)} className="text-[9px] font-bold text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-0.5 cursor-pointer" title="Change / Replace File">
                                        <Upload size={10} /> Change
                                    </button>
                                )}
                                {isEditing && canRemove && (
                                    <button onClick={() => handleDeleteClick(doc)} className="text-[9px] font-bold text-red-500 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors flex items-center gap-0.5 cursor-pointer" title="Delete Document">
                                        <Trash2 size={10} /> Delete
                                    </button>
                                )}
                                {isEditing && filesOn && canDelete && onUpdateRemark && !isReturnedDocument(doc) && (
                                    <button
                                        onClick={() => onUpdateRemark(doc.id, `${RETURNED_DOCUMENT_PREFIX} Please upload the correct document.`)}
                                        className="text-[9px] font-bold text-amber-700 hover:text-amber-800 px-1.5 py-0.5 rounded hover:bg-amber-50 transition-colors cursor-pointer"
                                        title="Send this document back for replacement"
                                    >
                                        Send Back
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Document Remark Row */}
                        <DocRemarkEditor doc={doc} onUpdateRemark={onUpdateRemark} canEdit={isEditing && canDelete} />
                    </div>
                ))}
                {!isChecklistOnly && fieldDocs.length === 0 && isEditing && canUpload && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handleUploadClick()}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 hover:text-amber-600 px-2 py-1 rounded-lg border border-dashed border-stone-200 hover:border-amber-300 hover:bg-amber-50/30 transition-all cursor-pointer"
                        >
                            <Paperclip size={11} /> Attach File / Photo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── EditToggle: pencil / done button for a section's `actions` ──────────────
// Opens section `id` for editing (one at a time, via editingSection) and
// scrolls its `section-<id>` element into view. Closing does not discard edits.
export function EditToggle({ id, label, editingSection, setEditingSection }) {
    const open = editingSection === id;
    const toggle = () => {
        setEditingSection?.(open ? null : id);
        if (!open) setTimeout(() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    };
    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={open}
            aria-label={`Edit ${label}`}
            title={open ? 'Done editing' : `Edit ${label}`}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
        >
            {open ? <Check size={16} aria-hidden="true" /> : <Edit3 size={15} aria-hidden="true" />}
        </button>
    );
}

// ─── SectionHeader: simple section headers with edit toggle buttons ───────────
export function SectionHeader({ title, id, icon: Icon, isEditable, editingSection, setEditingSection }) {
    return (
        <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-1.5 mt-4">
            <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Icon size={12} /> {title}
            </h3>
            {isEditable && <EditToggle id={id} label={String(title).toLowerCase()} editingSection={editingSection} setEditingSection={setEditingSection} />}
        </div>
    );
}

export function DocGalleryRemarkRow({ doc, onUpdateRemark, isEditable }) {
    return <DocRemarkEditor doc={doc} onUpdateRemark={onUpdateRemark} canEdit={isEditable} variant="gallery" />;
}
