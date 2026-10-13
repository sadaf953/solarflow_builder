import { getChecklistMode, setChecklistMode } from '../../utils/checklistMode';
export { getChecklistMode, setChecklistMode } from '../../utils/checklistMode';
import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Edit3, X, Paperclip, Eye, Upload, FileText, Image as ImageIcon, Download, MessageSquare, Check, Sparkles, Phone, CheckSquare, FolderOpen } from 'lucide-react';
import { formatINR, toIndianCommas, parseIndianNumber, formatInputValue, getTelephoneHref } from '../../utils';
import { supabase } from '../../supabase';
import { useGlobalPopup } from '../GlobalPopup';

// Generate synthetic demo documents for 1-click sample upload in demo mode
export function generateDemoSampleFile(field = 'document', label = 'Sample Document') {
    const cleanLabel = (label || field || 'Sample Document').replace(/[<>]/g, '');
    const timestamp = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fffbeb" />
      <stop offset="100%" stop-color="#fef3c7" />
    </linearGradient>
  </defs>
  <rect width="600" height="400" rx="16" fill="url(#bgGrad)" stroke="#f59e0b" stroke-width="4"/>
  <rect x="24" y="24" width="552" height="352" rx="12" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
  <circle cx="70" cy="70" r="24" fill="#f59e0b" />
  <path d="M70 54 L70 86 M54 70 L86 70 M59 59 L81 81 M59 81 L81 59" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <text x="110" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="bold" fill="#1f2937">SolarFlow Demo Verification Document</text>
  <text x="110" y="88" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#6b7280">Sample Document for Testing &amp; Verification</text>
  <line x1="44" y1="120" x2="556" y2="120" stroke="#f3f4f6" stroke-width="2"/>
  <rect x="44" y="140" width="512" height="150" rx="8" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
  <text x="64" y="175" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#4b5563">DOCUMENT TYPE:</text>
  <text x="210" y="175" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="bold" fill="#b45309">${cleanLabel}</text>
  <text x="64" y="210" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#4b5563">VERIFIED DATE:</text>
  <text x="210" y="210" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" fill="#111827">${timestamp}</text>
  <text x="64" y="245" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#4b5563">AUTHENTICATION:</text>
  <text x="210" y="245" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" fill="#059669">✓ Demo Record Certified (Simulated)</text>
  <rect x="44" y="315" width="220" height="36" rx="6" fill="#fef3c7" stroke="#fbbf24" stroke-width="1"/>
  <text x="56" y="338" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="bold" fill="#92400e">DEMO SAMPLE ATTACHMENT</text>
  <text x="440" y="340" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-style="italic" fill="#9ca3af">SolarFlow CRM v2.0</text>
</svg>`;
    const fileName = `${(field || 'sample').toLowerCase().replace(/[^a-z0-9]/g, '_')}_demo_sample.svg`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    return new File([blob], fileName, { type: 'image/svg+xml' });
}

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

// ─── StageRemarkSection ───────────────────────────────────────────────────────
export function StageRemarkSection({ stageId, editData, setEditData, isFrozen, onSave }) {
    const [localSaved, setLocalSaved] = useState(true);
    const remark = getStageRemarkFromData(editData.stages_remarks, stageId);

    return (
        <section className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-1">
                <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Stage Remark ({stageId})</label>
                {!isFrozen && !localSaved && (
                    <button
                        onClick={async () => {
                            await onSave(stageId);
                            setLocalSaved(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-md shadow-emerald-600/10"
                    >
                        Save Remark
                    </button>
                )}
            </div>
            {isFrozen ? (
                <div className="text-xs text-stone-500 font-medium italic min-h-[36px] bg-stone-50 p-2.5 rounded-xl">
                    {remark || 'No remarks for this stage.'}
                </div>
            ) : (
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder={`Add remark for ${stageId}...`}
                        value={remark}
                        onChange={e => {
                            const newVal = e.target.value;
                            setLocalSaved(false);
                            setEditData(prev => {
                                const prevObj = typeof prev.stages_remarks === 'object' && prev.stages_remarks ? prev.stages_remarks : {};
                                return {
                                    ...prev,
                                    stages_remarks: {
                                        ...prevObj,
                                        [stageId]: newVal
                                    }
                                };
                            });
                        }}
                        onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                                await onSave(stageId);
                                setLocalSaved(true);
                            }
                        }}
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-700 placeholder:text-stone-400"
                    />
                </div>
            )}
        </section>
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

                {/* Remark Bar in Preview - only when there is somewhere to save it.
                    The input used to render unconditionally while just the Save
                    button was guarded, so on the three screens that pass no
                    onUpdateRemark (Add Lead, Stamp Portal, the Customer Detail
                    file preview) you could type a remark into a live field,
                    press Enter to no effect, and lose it silently on close. */}
                {onUpdateRemark && (
                <div className="p-3.5 bg-white border-t border-stone-100 flex items-center gap-2">
                    <MessageSquare size={14} className="text-stone-400 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Add remark for this document (e.g. Verified by DISCOM, Valid KYC, Approved)..."
                        value={remark}
                        onChange={e => setRemark(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveRemark();
                        }}
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    {onUpdateRemark && (
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
                    )}
                </div>
                )}
            </div>
        </div>
    );
}

// ─── Compact Document Remark Row ─────────────────────────────────────────────
function DocRemarkRow({ doc, onUpdateRemark, isEditing }) {
    const [isEditingRemark, setIsEditingRemark] = useState(false);
    const [remarkVal, setRemarkVal] = useState(doc.remark || '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setRemarkVal(doc.remark || '');
    }, [doc.remark]);

    const handleSave = async () => {
        if (!onUpdateRemark) return;
        setSaving(true);
        const ok = await onUpdateRemark(doc.id, remarkVal);
        setSaving(false);
        // Keep the editor open on failure so the typed text is not lost.
        if (ok === false) return;
        setIsEditingRemark(false);
    };

    if (isEditingRemark) {
        return (
            <div className="flex items-center gap-1.5 mt-1 animate-in fade-in">
                <input
                    type="text"
                    value={remarkVal}
                    placeholder="Enter remark for this file..."
                    onChange={e => setRemarkVal(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleSave();
                        if (e.key === 'Escape') setIsEditingRemark(false);
                    }}
                    autoFocus
                    className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-0.5 text-[10px] text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                />
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[9px] font-bold cursor-pointer transition"
                >
                    {saving ? '...' : 'Save'}
                </button>
                <button
                    type="button"
                    onClick={() => setIsEditingRemark(false)}
                    className="px-1.5 py-0.5 text-stone-400 hover:text-stone-600 text-[9px] font-medium cursor-pointer"
                >
                    Cancel
                </button>
            </div>
        );
    }

    if (doc.remark) {
        return (
            <div className="flex items-center justify-between gap-1.5 mt-0.5 px-1 py-0.5 bg-amber-50/60 rounded border border-amber-200/50">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                    <MessageSquare size={9} className="text-amber-600 flex-shrink-0" />
                    <span className="text-[10px] text-amber-900 font-medium truncate" title={doc.remark}>
                        {doc.remark}
                    </span>
                </div>
                {isEditing && (
                    <button
                        type="button"
                        onClick={() => setIsEditingRemark(true)}
                        className="text-[9px] font-bold text-amber-700 hover:text-amber-900 underline cursor-pointer flex-shrink-0"
                    >
                        Edit
                    </button>
                )}
            </div>
        );
    }

    if (isEditing && onUpdateRemark) {
        return (
            <div className="mt-0.5">
                <button
                    type="button"
                    onClick={() => setIsEditingRemark(true)}
                    className="text-[9px] text-stone-400 hover:text-stone-700 font-semibold flex items-center gap-1 cursor-pointer transition"
                >
                    <MessageSquare size={9} />
                    <span>+ Add remark</span>
                </button>
            </div>
        );
    }

    return null;
}

// Recall marker. Admin/Office stamp a document with this to send it back; only
// then may the uploader replace it. Exported so every portal enforces the same
// rule instead of re-implementing (or skipping) it.
export const RETURNED_DOCUMENT_PREFIX = '[RETURNED]';
export const isReturnedDocument = (doc) => String(doc?.remark || '').trim().toUpperCase().startsWith(RETURNED_DOCUMENT_PREFIX);

export function ChecklistModeToggle({ className = '', onFillAllDemoDocs = null, isFilling = false }) {
    const [mode, setMode] = React.useState(() => getChecklistMode());

    React.useEffect(() => {
        const handleModeChange = (e) => {
            if (e.detail?.mode) setMode(e.detail.mode);
        };
        window.addEventListener('solarflow-checklist-mode-changed', handleModeChange);
        return () => window.removeEventListener('solarflow-checklist-mode-changed', handleModeChange);
    }, []);

    const handleSwitch = (newMode) => {
        setChecklistMode(newMode);
        setMode(newMode);
    };

    if (mode === 'files' && onFillAllDemoDocs) {
        return (
            <div className={`inline-flex items-center ${className}`}>
                <button
                    type="button"
                    onClick={onFillAllDemoDocs}
                    disabled={isFilling}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    title="Generate and attach sample demo documents for all missing checklist items in this section"
                >
                    <Sparkles size={11} className="text-amber-500" />
                    <span>{isFilling ? 'Attaching...' : '✨ Fill Demo Docs'}</span>
                </button>
            </div>
        );
    }

    return null;
}

export function CheckboxRemarkItem({ label, field, value, onChange, onAutoSave, isEditing, documents = [], onUpload, onDelete, onPreview, onDownload, onUpdateRemark, note, canDelete = false, canReplace = canDelete, allowReturnedReplace = !canDelete }) {
    const { showConfirm, showImageCropper } = useGlobalPopup();
    const fieldDocs = documents.filter(d => d.doc_type === field);
    const fileInputRef = React.useRef(null);
    const [replacingDocId, setReplacingDocId] = React.useState(null);

    const [checklistMode, setLocalChecklistMode] = React.useState(() => getChecklistMode());

    React.useEffect(() => {
        const handleModeChange = (e) => {
            if (e.detail?.mode) setLocalChecklistMode(e.detail.mode);
        };
        window.addEventListener('solarflow-checklist-mode-changed', handleModeChange);
        return () => window.removeEventListener('solarflow-checklist-mode-changed', handleModeChange);
    }, []);

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
        } else if (!isUploaded) {
            handleUploadClick();
        }
    };

    const handleUploadClick = (existingDocId = null) => {
        setReplacingDocId(existingDocId);
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile) return;
        const inputEl = e.target;
        inputEl.value = '';

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: `Crop & Adjust ${label || 'Document'}` });
            if (!file) return; // User cancelled upload
        }

        const wrappedEvent = { target: { files: [file], value: '' } };

        // If replacing a specific document, or if field already has a document, delete old one first
        const replacingDoc = fieldDocs.find(d => d.id === replacingDocId);
        const replacementAllowed = canReplace || (allowReturnedReplace && isReturnedDocument(replacingDoc));
        if (replacementAllowed && replacingDocId && onDelete) {
            const oldDoc = fieldDocs.find(d => d.id === replacingDocId);
            if (oldDoc) await onDelete(oldDoc);
        } else if (canReplace && fieldDocs.length > 0 && onDelete) {
            for (const oldDoc of fieldDocs) {
                await onDelete(oldDoc);
            }
        }

        if (onUpload) await onUpload(wrappedEvent, field, replacingDocId);
        // Automatically check when a file is uploaded
        if (onChange) {
            onChange(field, true);
        }
        setReplacingDocId(null);
    };

    const handleUploadSampleDoc = async (existingDocId = null) => {
        const sampleFile = generateDemoSampleFile(field, label);
        const wrappedEvent = { target: { files: [sampleFile], value: '' } };

        const replacingDoc = fieldDocs.find(d => d.id === existingDocId);
        const replacementAllowed = canReplace || (allowReturnedReplace && isReturnedDocument(replacingDoc));
        if (replacementAllowed && existingDocId && onDelete) {
            const oldDoc = fieldDocs.find(d => d.id === existingDocId);
            if (oldDoc) await onDelete(oldDoc);
        } else if (canReplace && fieldDocs.length > 0 && onDelete) {
            for (const oldDoc of fieldDocs) {
                await onDelete(oldDoc);
            }
        }

        if (onUpload) await onUpload(wrappedEvent, field, existingDocId);
        if (onChange) {
            onChange(field, true);
        }
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

    const handleDirectDownload = async (doc) => {
        if (onDownload) {
            onDownload(doc);
            return;
        }
        try {
            const { getDownloadUrl } = await import('../../utils');
            const url = await getDownloadUrl(doc.storage_path, doc.file_name);
            if (url) {
                const a = document.createElement('a');
                a.href = url;
                a.download = doc.file_name;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (err) {
            console.error('Download error:', err);
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
                        title={isChecklistOnly ? (isChecked ? 'Completed (click to uncheck)' : 'Click to mark checked') : (isUploaded ? 'Verified & Uploaded' : 'Click to upload file to verify')}
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

            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,application/pdf,.png,.jpg,.jpeg,.pdf"
                onChange={handleFileSelected}
                className="hidden"
            />

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
                                {isEditing && (canReplace || (allowReturnedReplace && isReturnedDocument(doc))) && (
                                    <button onClick={() => handleUploadClick(doc.id)} className="text-[9px] font-bold text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-0.5 cursor-pointer" title="Change / Replace File">
                                        <Upload size={10} /> Change
                                    </button>
                                )}
                                {isEditing && onDelete && canDelete && (
                                    <button onClick={() => handleDeleteClick(doc)} className="text-[9px] font-bold text-red-500 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors flex items-center gap-0.5 cursor-pointer" title="Delete Document">
                                        <Trash2 size={10} /> Delete
                                    </button>
                                )}
                                {isEditing && canDelete && onUpdateRemark && !isReturnedDocument(doc) && (
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
                        <DocRemarkRow doc={doc} onUpdateRemark={onUpdateRemark} isEditing={isEditing && canDelete} />
                    </div>
                ))}
                {!isChecklistOnly && fieldDocs.length === 0 && isEditing && onUpload && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handleUploadClick()}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 hover:text-amber-600 px-2 py-1 rounded-lg border border-dashed border-stone-200 hover:border-amber-300 hover:bg-amber-50/30 transition-all cursor-pointer"
                        >
                            <Paperclip size={11} /> Attach File / Photo
                        </button>
                        <button
                            type="button"
                            onClick={() => handleUploadSampleDoc()}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 hover:text-amber-800 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-all cursor-pointer shadow-xs"
                            title="Generate and attach a sample document instantly (1-click test upload)"
                        >
                            <Sparkles size={11} className="text-amber-500" /> Use Demo Doc
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── PaymentsEditor ───────────────────────────────────────────────────────────
export function PaymentsEditor({ payments = [], onChange, isEditing }) {
    const handleChange = (idx, field, val) => {
        const next = payments.map((p, i) => i === idx ? { ...p, [field]: val } : p);
        const total = next.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        onChange(next, total);
    };
    const addPayment = () => {
        const next = [...payments, { no: payments.length + 1, amount: '', date: '' }];
        const total = next.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        onChange(next, total);
    };
    const removePayment = (idx) => {
        const next = payments.filter((_, i) => i !== idx);
        const total = next.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        onChange(next, total);
    };

    const displayTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    if (!isEditing) return (
        <div className="space-y-2">
            {payments.length === 0 && <p className="text-xs text-stone-400 italic">No payments recorded</p>}
            {payments.map((p, i) => (
                <div key={i} className="bg-stone-50 p-3 rounded-xl flex justify-between items-center">
                    <div>
                        <p className="text-[9px] text-stone-400 font-bold uppercase">Payment {p.no || i + 1}</p>
                        <p className="text-sm font-semibold text-emerald-600">{fmt(p.amount)}</p>
                    </div>
                    {p.date && <p className="text-xs text-stone-400">{p.date}</p>}
                </div>
            ))}
            {payments.length > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 flex justify-between items-center border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Total Received</p>
                    <p className="text-sm font-bold text-emerald-700">{fmt(displayTotal)}</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-2">
            {payments.map((p, i) => (
                <div key={i} className="bg-stone-50 p-3 rounded-xl space-y-2 border border-stone-200">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-stone-400 uppercase">Payment {p.no || i + 1}</p>
                        <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" inputMode="decimal" placeholder="Amount (₹)" value={p.amount ? toIndianCommas(p.amount) : ''}
                            onChange={e => handleChange(i, 'amount', parseIndianNumber(e.target.value))}
                            className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                        <input type="date" value={p.date || ''}
                            onChange={e => handleChange(i, 'date', e.target.value)}
                            className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-300" />
                    </div>
                </div>
            ))}
            <button onClick={addPayment}
                className="w-full flex items-center justify-center gap-1.5 border border-dashed border-stone-300 rounded-xl py-2 text-xs text-stone-500 hover:border-amber-400 hover:text-amber-600 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Payment
            </button>
            {payments.length > 0 && (
                <div className="bg-amber-50 rounded-xl p-3 flex justify-between items-center border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Auto Total (will save)</p>
                    <p className="text-sm font-bold text-amber-700">{fmt(displayTotal)}</p>
                </div>
            )}
        </div>
    );
}

// ─── SectionHeader: simple section headers with edit toggle buttons ───────────
export function SectionHeader({ title, id, icon: Icon, isEditable, editingSection, setEditingSection }) {
    return (
        <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-1.5 mt-4">
            <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Icon size={12} /> {title}
            </h3>
            {isEditable && (
                <button onClick={() => {
                    const isOpening = editingSection !== id;
                    if (setEditingSection) {
                        setEditingSection(isOpening ? id : null);
                    }
                    if (isOpening) {
                        setTimeout(() => {
                            const el = document.getElementById(`section-${id}`);
                            if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 150);
                    }
                }} className="text-stone-400 hover:text-amber-600 transition-colors">
                    {editingSection === id ? <X size={14} /> : <Edit3 size={12} />}
                </button>
            )}
        </div>
    );
}

export function DocGalleryRemarkRow({ doc, onUpdateRemark, isEditable }) {
    const [isEditing, setIsEditing] = useState(false);
    const [remarkVal, setRemarkVal] = useState(doc.remark || '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setRemarkVal(doc.remark || '');
    }, [doc.remark]);

    const handleSave = async () => {
        if (!onUpdateRemark) return;
        setSaving(true);
        const ok = await onUpdateRemark(doc.id, remarkVal);
        setSaving(false);
        if (ok === false) return;
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="pt-2 mt-1 border-t border-stone-200/60 flex items-center gap-1.5 animate-in fade-in">
                <input
                    type="text"
                    value={remarkVal}
                    placeholder="Remark for this document..."
                    onChange={e => setRemarkVal(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleSave();
                        if (e.key === 'Escape') setIsEditing(false);
                    }}
                    autoFocus
                    className="flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                />
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                    {saving ? '...' : 'Save'}
                </button>
                <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-2 py-1 text-stone-400 hover:text-stone-600 text-xs font-medium cursor-pointer"
                >
                    Cancel
                </button>
            </div>
        );
    }

    if (doc.remark) {
        return (
            <div className="pt-2 mt-1 border-t border-stone-200/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200/60">
                    <MessageSquare size={11} className="text-amber-600 flex-shrink-0" />
                    <span className="text-[11px] text-amber-900 font-medium truncate" title={doc.remark}>
                        {doc.remark}
                    </span>
                </div>
                {isEditable && (
                    <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="text-[10px] font-bold text-stone-500 hover:text-stone-800 underline cursor-pointer flex-shrink-0"
                    >
                        Edit Remark
                    </button>
                )}
            </div>
        );
    }

    if (isEditable) {
        return (
            <div className="pt-1.5 mt-0.5 border-t border-dashed border-stone-200 flex justify-end">
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-[10px] text-stone-400 hover:text-stone-700 font-bold flex items-center gap-1 cursor-pointer transition"
                >
                    <MessageSquare size={10} />
                    <span>+ Add Remark</span>
                </button>
            </div>
        );
    }

    return null;
}
