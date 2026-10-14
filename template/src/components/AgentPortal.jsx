import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import {
    Phone, MapPin, Zap, Home, ChevronLeft, ChevronRight, Users, Folder, Plus, X, Save, CheckCircle2,
    Paperclip, Eye, Download, FileText, FolderOpen, Layers, Printer, ClipboardCheck, Banknote,
    Package, Gauge, AlertTriangle, CalendarDays,
} from 'lucide-react';
import {
    logActivity, formatInputValue, parseIndianNumber, uploadDocument, getCustomerDocuments, getDownloadUrl,
    getViewUrl, updateDocumentRemark, sanitizeAdminUpdate, normalizeAdminValues, updateAdminRecord,
    normalizeMeterInstallation, downloadFileWithSaveAs, downloadDocumentsAsPdf, deleteDocument,
    getTelephoneHref, useMetadata,
} from '../utils';
import {
    BRANDING, PRIMARY_STAGES, STAGE_IDS, isOn, isStageEnabled, stageLabel, applicableStages,
    getNextStageId, missingStageRequirements,
} from '../config/index.js';
import {
    Field, Input, Select, Textarea, TagPicker, Modal, StatTile, SearchInput, EmptyState, ErrorBanner, LoadingState,
    FieldList, useRefreshOnFocus,
} from '../ui/index.js';
import { fetchAllPages } from '../lib/db.js';
import { lazyWithRetry, LazyBoundary } from '../lib/lazy.js';
import { formatINR, formatDate, todayIST } from '../lib/format.js';
import { readModuleSerials } from '../serials/record.js';
import { FilePreviewModal, CheckboxRemarkItem } from './modal-tabs/shared';
import { useGlobalPopup } from './GlobalPopup';
import BrandMark from './BrandMark';
import AgentStageDetails, { StageCustomFields } from './AgentStageDetails';
import {
    MobilePortalShell, PortalCalendar, PortalCustomFields, PortalHeader, PortalHero,
    customFieldChanges, saveCustomFieldChanges, withCustomFieldChanges,
} from './portal';

// Switched-off features are never downloaded.
const QuotationModule = isOn('quotationMaker') ? lazyWithRetry(() => import('../quotations/QuotationModule')) : null;
const BomPrintModal = isOn('bomMaker') ? lazyWithRetry(() => import('./BomPrintModal')) : null;
const AddLeadModal = lazyWithRetry(() => import('./AddLeadModal'));
const AgreementPreview = lazyWithRetry(() => import('./agreement/AgreementPreview').then(module => ({ default: module.AgreementPreview })));

const documentUploadsOn = isOn('documentUploads');
const documentChecksOn = documentUploadsOn || isOn('checklists');

// The stages a partner or dealer fills in from the portal, with the client's
// extra fields for them. Every other stage, custom stages included, is
// read-only here.
const EDITOR_FIELDS = {
    [STAGE_IDS.MATERIAL_ORDER]: ['roof_shed', 'dc_cable', 'ac_cable', 'structure_front_leg_height', 'structure_rear_leg_height', 'invoice_value', 'material_order_notes'],
    [STAGE_IDS.METER_INSTALLATION]: ['meter_installation', 'installation_date', 'meter_installation_photo'],
    [STAGE_IDS.DISCOM_INSPECTION]: ['discom_inspection'],
};
// Most urgent first: the work queue opens on the first of these with customers waiting.
const PRIORITY_STAGES = [STAGE_IDS.METER_INSTALLATION, STAGE_IDS.DISCOM_INSPECTION, STAGE_IDS.MATERIAL_ORDER].filter(isStageEnabled);
const HOME_TILE_STAGES = [STAGE_IDS.MATERIAL_ORDER, STAGE_IDS.DISCOM_SUBMISSION, STAGE_IDS.METER_INSTALLATION].filter(isStageEnabled);

// Customer documents asked for at the Leads stage; the ID documents are not
// needed for customers paying cash.
const LEAD_DOCUMENTS = [
    { field: 'adhaar_card_front', label: 'Aadhaar card (front)', idDocument: true },
    { field: 'adhaar_card_back', label: 'Aadhaar card (back)', idDocument: true },
    { field: 'pan_card', label: 'PAN card', idDocument: true },
    { field: 'index_2', label: 'Vera Pavti / Aakarni', idDocument: true },
    { field: 'house_geo_tag_photo', label: 'House geo-tag photo', idDocument: true },
    { field: 'light_bill', label: 'Light bill' },
    { field: 'bank_details', label: 'Bank details' },
    { field: 'extra_docs', label: 'Other documents' },
];
const METER_PHOTO_TYPES = ['meter_installation_photo', 'meter_photo'];
const YES_NO = [
    { id: 'Yes', label: 'Yes', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
    { id: 'No', label: 'No', activeClass: 'bg-rose-600 text-white border-rose-600' },
];
const INTEGRATION_FIELDS = [
    { key: 'inverter_make', label: 'Inverter make' },
    { key: 'inverter_serial_no', label: 'Inverter serial no.' },
    { key: 'integration_by', label: 'Integration by' },
];
const MILESTONE_FIELDS = [
    { key: 'paper_prepared_by', label: 'Paper prepared by' },
    { key: 'paper_prepared_date', label: 'Paper prepared date', type: 'date' },
    { key: 'material_loaded_by', label: 'Material loaded by' },
    { key: 'material_loaded_date', label: 'Material loaded date', type: 'date' },
];
const EMPTY_BOM = { bom: null, items: [], type: 'ROOF' };

const stageRemarks = (value) => {
    if (value && typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const matchesSearch = (customer, query) => {
    const q = query.trim().toLowerCase();
    return !q || [customer?.customer_name, customer?.phone_number, customer?.consumer_no]
        .some(value => String(value || '').toLowerCase().includes(q));
};

function PhoneLink({ phone }) {
    const href = getTelephoneHref(phone);
    if (!href) return <span className="font-semibold text-stone-900">{phone || '–'}</span>;
    return (
        <a href={href} onClick={event => event.stopPropagation()} className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline">
            <Phone size={11} aria-hidden="true" /> <span>{phone}</span>
        </a>
    );
}

function Card({ icon: Icon, title, actions, children }) {
    return (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
            <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-2">
                <h5 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500">
                    {Icon && <Icon size={12} aria-hidden="true" />} {title}
                </h5>
                {actions}
            </div>
            {children}
        </section>
    );
}

export default function AgentPortal({ user, onLogout, onChangePassword }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const meta = useMetadata();
    const isAgent2 = user?.userType === 'agent2';
    const portalLabel = isAgent2 ? 'Dealer Portal' : 'Channel Partner Portal';

    const [view, setView] = useState(() => (QuotationModule && window.location.hash.startsWith('#/quotations') ? 'quotations' : 'menu'));
    const [activeWorkdeskTab, setActiveWorkdeskTab] = useState(STAGE_IDS.LEADS);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [showAddLead, setShowAddLead] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [homeSearchQuery, setHomeSearchQuery] = useState('');

    const [selectedCust, setSelectedCust] = useState(null);
    // The record keeps its real stage; this is the stage panel being viewed.
    const [activeCustomerStage, setActiveCustomerStage] = useState(null);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [custDocs, setCustDocs] = useState([]);
    const [downloadingAllDocs, setDownloadingAllDocs] = useState(false);
    const [integration, setIntegration] = useState(EMPTY_BOM);
    const [showBomPrint, setShowBomPrint] = useState(false);
    const [agreementData, setAgreementData] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [validation, setValidation] = useState(null);   // { issues, nextLabel }

    useEffect(() => {
        if (view !== 'quotations' && window.location.hash.startsWith('#/quotations')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }, [view]);

    const showError = useCallback((title, error, fallback) => {
        showAlert([error?.message, error?.details, error?.hint].filter(Boolean).join('\n') || fallback, { title, type: 'error' });
    }, [showAlert]);

    // ── Customers ────────────────────────────────────────────────────────
    // The database returns only this login's customers (row-level security).
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await fetchAllPages(() => supabase.from('admin').select('*').is('deleted_at', null)
                .order('updated_at', { ascending: false }).order('id'));
            setCustomers(rows);
            setLoadError('');
        } catch (err) {
            console.error('Error fetching customers:', err);
            setLoadError(err?.message || 'Your customers could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user?.id) return undefined;
        fetchCustomers();
        const channel = supabase.channel(`agent_customers_${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin' }, payload => {
                const record = payload.new;
                const id = record?.id || payload.old?.id;
                setCustomers(previous => {
                    if (payload.eventType === 'DELETE' || !record || record.deleted_at) return previous.filter(customer => customer.id !== id);
                    if (!previous.some(customer => customer.id === record.id)) return [record, ...previous];
                    return previous.map(customer => (customer.id === record.id ? record : customer));
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, fetchCustomers]);

    useRefreshOnFocus(fetchCustomers, { enabled: Boolean(user?.id) });

    // Keep the open customer in step with the list (realtime and refreshes).
    useEffect(() => {
        if (!selectedCust) return;
        const fresh = customers.find(customer => customer.id === selectedCust.id);
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedCust)) setSelectedCust(fresh);
    }, [customers]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!selectedCust?.id) { setCustDocs([]); return undefined; }
        let active = true;
        getCustomerDocuments(selectedCust.id)
            .then(docs => { if (active) setCustDocs(docs || []); })
            .catch(err => console.error('Could not load documents:', err));
        return () => { active = false; };
    }, [selectedCust?.id]);

    const displayedStage = activeCustomerStage || selectedCust?.stage;

    // Material Integration is view-only here; load its bill of materials.
    useEffect(() => {
        if (!BomPrintModal || !selectedCust?.id || displayedStage !== STAGE_IDS.MATERIAL_INTEGRATION) {
            setIntegration(EMPTY_BOM);
            return undefined;
        }
        let active = true;
        import('../utils/bom').then(async ({ loadBomForCustomer, getBomTypeForCustomer }) => {
            const type = getBomTypeForCustomer(selectedCust);
            const { bom, items, loadError: bomError } = await loadBomForCustomer(selectedCust, type);
            if (!active) return;
            setIntegration({ bom, items, type });
            if (bomError) {
                showAlert('The bill of materials could not be loaded, so the standard list is shown. Refresh to try again.', { title: 'Bill of materials not loaded', type: 'error' });
            }
        });
        return () => { active = false; };
    }, [selectedCust?.id, selectedCust?.roof_shed, displayedStage]); // eslint-disable-line react-hooks/exhaustive-deps

    // Extra fields this user edited since opening the customer (see customFieldChanges).
    const touchedCustom = useRef(new Set());
    const openCustomer = (customer) => {
        touchedCustom.current = new Set();
        setSelectedCust(customer);
        setEditData({ ...customer });
        setActiveCustomerStage(isStageEnabled(customer.stage) && customer.stage !== STAGE_IDS.COMPLETED ? customer.stage : STAGE_IDS.LEADS);
    };
    const closeCustomer = () => {
        touchedCustom.current = new Set();
        setSelectedCust(null);
        setEditData({});
        setActiveCustomerStage(null);
    };

    const handleChange = (field, value) => setEditData(prev => ({ ...prev, [field]: value }));
    const handleCustomFieldChange = (key, value) => {
        touchedCustom.current.add(key);
        setEditData(prev => ({ ...prev, custom_fields: { ...(prev.custom_fields || {}), [key]: value } }));
    };

    // Extra-field values (`customChanges`) are merged on the server.
    const handleUpdateCustomer = async (id, updates, customChanges = {}) => {
        setSaving(true);
        const clean = normalizeAdminValues(sanitizeAdminUpdate(updates));
        const applyLocal = patch => {
            setSelectedCust(prev => (prev?.id === id ? { ...prev, ...patch } : prev));
            setEditData(prev => ({ ...prev, ...patch }));
            setCustomers(prev => prev.map(customer => (customer.id === id ? { ...customer, ...patch } : customer)));
        };
        try {
            const { ok, error } = await updateAdminRecord(id, clean);
            if (!ok) throw error || new Error('The change was not saved.');
            applyLocal(clean);
            if (Object.keys(customChanges).length) {
                applyLocal({ custom_fields: await saveCustomFieldChanges(id, customChanges) });
                touchedCustom.current = new Set();
            }
            return true;
        } catch (err) {
            console.error('Update failed:', err);
            showError('Changes not saved', err, 'Your changes could not be saved. Please try again.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitLead = async (formData, attachedFiles = [], quotation = null) => {
        const now = new Date().toISOString();
        const leadData = {
            ...formData,
            channel_partner: user.channel_partner || user.name,
            sub_channel_partner: user.name,
            application_done_by: user.name,
            lead_creator_profile_id: user.id,
            created_at: now,
            updated_at: now,
        };
        ['system_capacity_kwp', 'module_wp', 'no_of_modules'].forEach(key => {
            if (leadData[key] !== undefined && leadData[key] !== null && leadData[key] !== '') leadData[key] = parseIndianNumber(leadData[key]);
        });
        const insertData = Object.fromEntries(Object.entries(leadData).map(([key, value]) => [key, value === '' ? null : value]));

        let result;
        if (quotation) {
            const { quotationRepository } = await import('../quotations/client');
            result = await quotationRepository.insertConversionLead(quotation, insertData, user);
        } else {
            result = await supabase.from('admin').insert(insertData).select().single();
        }
        const { data: newCustomer, error } = result;
        if (error) throw error;

        // The lead is saved either way; say which documents did not upload.
        const failedUploads = [];
        await Promise.all((attachedFiles || []).filter(item => item.file).map(async item => {
            try {
                await uploadDocument(item.file, newCustomer.id, item.doc_type, user?.id);
            } catch (uploadErr) {
                console.error('Failed to upload file for new lead:', uploadErr);
                failedUploads.push(item.file.name || item.doc_type || 'a document');
            }
        }));
        if (failedUploads.length > 0) {
            showAlert(`The lead was saved, but ${failedUploads.length} document(s) did not upload: ${failedUploads.join(', ')}. Open the customer and attach them again.`,
                { title: 'Some documents did not upload', type: 'error' });
        }

        setCustomers(prev => (prev.some(customer => customer.id === newCustomer.id) ? prev : [newCustomer, ...prev]));
        setShowAddLead(false);
        void logActivity(user.id, 'create', `Added new lead: ${formData.customer_name}`, `Added by ${user.name}`, newCustomer.id);
        return newCustomer;
    };

    // ── Documents ────────────────────────────────────────────────────────
    const handlePreviewFile = async (doc) => {
        if (!doc?.storage_path) {
            showAlert('This document has no stored file to preview.', { title: 'Preview unavailable', type: 'error' });
            return;
        }
        try {
            const url = await getViewUrl(doc.storage_path);
            if (!url) throw new Error('Could not open a secure link for this document. Please try again.');
            setPreviewDoc({ doc, url });
        } catch (err) {
            showError('Preview failed', err, 'Could not open this document.');
        }
    };

    const handleDownloadDoc = async (doc) => {
        const url = doc?.storage_path ? await getDownloadUrl(doc.storage_path, doc.file_name) : null;
        if (!url) {
            showAlert('Could not create a download link for this document.', { title: 'Download failed', type: 'error' });
            return;
        }
        await downloadFileWithSaveAs(url, doc.file_name);
    };

    const handleDownloadAllDocs = async () => {
        if (downloadingAllDocs) return;
        setDownloadingAllDocs(true);
        try {
            const result = await downloadDocumentsAsPdf(custDocs, selectedCust?.customer_name);
            if (result.failed.length > 0) {
                showAlert(`${result.downloaded} document(s) downloaded; ${result.failed.length} could not be included.`, { type: 'warning' });
            }
        } catch (err) {
            showError('Download failed', err, 'The documents could not be downloaded.');
        } finally {
            setDownloadingAllDocs(false);
        }
    };

    // Lead documents can be added at Leads and Registration; the meter photo at Meter Installation.
    const handleUploadDocForCustomer = async (event, docType) => {
        const allowed = [STAGE_IDS.LEADS, STAGE_IDS.REGISTRATION].includes(displayedStage)
            || (displayedStage === STAGE_IDS.METER_INSTALLATION && String(docType).includes('meter'));
        if (!allowed) {
            showAlert('Lead documents can only be added during the Leads and Registration stages.', { title: 'Upload not allowed', type: 'error' });
            return false;
        }
        const file = event.target.files?.[0];
        if (!file || !selectedCust?.id) return false;
        try {
            await uploadDocument(file, selectedCust.id, docType, user?.id);
            setCustDocs(await getCustomerDocuments(selectedCust.id) || []);
            return true;
        } catch (err) {
            showError('Upload failed', err, 'The document could not be uploaded.');
            return false;
        }
    };

    // Agents may only replace a document the office sent back.
    const handleDeleteDoc = async (doc) => {
        if (!String(doc?.remark || '').trim().toUpperCase().startsWith('[RETURNED]')) {
            showAlert('This document is locked. The office must send it back before it can be replaced.', { title: 'Document locked', type: 'warning' });
            return false;
        }
        const res = await deleteDocument(doc.id, doc.storage_path);
        if (!res?.ok) {
            showError('Replacement failed', res?.error, 'The old document could not be removed.');
            return false;
        }
        setCustDocs(prev => prev.filter(item => item.id !== doc.id));
        return true;
    };

    const handleUpdateDocRemark = async (docId, remark) => {
        const res = await updateDocumentRemark(docId, remark);
        if (!res?.ok) {
            showError('Remark not saved', res?.error, 'The remark was not saved.');
            return false;
        }
        setCustDocs(prev => prev.map(doc => (doc.id === docId ? { ...doc, remark } : doc)));
        return true;
    };

    const docItem = (label, field) => (
        <CheckboxRemarkItem
            key={field} label={label} field={field} value={editData[field]} onChange={handleChange}
            onAutoSave={(key, value) => handleUpdateCustomer(selectedCust.id, { [key]: value })}
            isEditing documents={custDocs} onUpload={handleUploadDocForCustomer} onDelete={handleDeleteDoc}
            onPreview={handlePreviewFile} onUpdateRemark={handleUpdateDocRemark}
        />
    );

    // ── Stage editors ────────────────────────────────────────────────────
    const fieldValue = field => editData[field] ?? selectedCust?.[field] ?? '';
    const customChangesFor = stage => customFieldChanges(stage, editData.custom_fields, selectedCust?.custom_fields, touchedCustom.current);
    const isEditorDirty = stage => Boolean(selectedCust && EDITOR_FIELDS[stage]
        && (EDITOR_FIELDS[stage].some(field => String(fieldValue(field)) !== String(selectedCust[field] ?? ''))
            || Object.keys(customChangesFor(stage)).length > 0));
    const meterPhotoUploaded = custDocs.some(doc => METER_PHOTO_TYPES.includes(doc.doc_type));

    const editorUpdates = (stage) => {
        if (stage === STAGE_IDS.MATERIAL_ORDER) {
            const updates = Object.fromEntries(EDITOR_FIELDS[stage].map(field => [field, fieldValue(field)]));
            return { ...updates, dc_cable: parseIndianNumber(updates.dc_cable), ac_cable: parseIndianNumber(updates.ac_cable), invoice_value: parseIndianNumber(updates.invoice_value) };
        }
        if (stage === STAGE_IDS.METER_INSTALLATION) {
            return {
                meter_installation: normalizeMeterInstallation(fieldValue('meter_installation')),
                installation_date: fieldValue('installation_date'),
                meter_installation_photo: Boolean(editData.meter_installation_photo ?? selectedCust?.meter_installation_photo) || meterPhotoUploaded,
            };
        }
        return { discom_inspection: fieldValue('discom_inspection') };
    };

    // The client's requirements for leaving the stage. Where documents are in
    // use, the meter photo is also required (uploaded or ticked off) before
    // leaving Meter Installation, as it is the evidence the office checks.
    const stageIssues = (stage, record) => {
        const issues = missingStageRequirements(stage, record);
        if (stage === STAGE_IDS.METER_INSTALLATION && documentChecksOn && !record.meter_installation_photo) issues.push('Meter Installation Photo');
        return issues;
    };

    const saveEditor = async (stage, advance = false) => {
        if (!selectedCust || !EDITOR_FIELDS[stage]) return false;
        const updates = editorUpdates(stage);
        const customChanges = customChangesFor(stage);
        const fromStage = selectedCust.stage;
        let nextStage = null;
        if (advance) {
            const record = { ...selectedCust, ...updates, custom_fields: withCustomFieldChanges(selectedCust.custom_fields, customChanges) };
            nextStage = getNextStageId(record);
            if (!nextStage) return false;
            const issues = stageIssues(fromStage, record);
            if (issues.length) {
                setValidation({ issues, nextLabel: stageLabel(nextStage) });
                return false;
            }
        }
        if (!(await handleUpdateCustomer(selectedCust.id, updates, customChanges))) return false;
        if (!nextStage) return true;

        setSaving(true);
        try {
            const { data: moved, error } = await supabase.rpc('move_stage', {
                p_customer_id: selectedCust.id,
                p_new_stage: nextStage,
                p_old_stage: fromStage,
                p_remark: stageRemarks(selectedCust.stages_remarks)[fromStage] || '',
            });
            if (error) throw error;
            const patch = moved || { stage: nextStage };
            setSelectedCust(prev => ({ ...prev, ...patch }));
            setEditData(prev => ({ ...prev, ...patch }));
            setCustomers(prev => prev.map(customer => (customer.id === selectedCust.id ? { ...customer, ...patch } : customer)));
            setActiveCustomerStage(nextStage);
            return true;
        } catch (err) {
            showError('Stage not moved', err, 'The details were saved, but the customer could not be moved to the next stage.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Offers to save the stage being edited before leaving it. False = stay.
    const confirmLeaveStage = async (confirmLabel) => {
        if (!isEditorDirty(displayedStage)) return true;
        const shouldSave = await showConfirm('You have unsaved changes on this stage. Save them before leaving?', {
            title: 'Unsaved changes', confirmLabel, cancelLabel: 'Keep editing', type: 'success',
        });
        if (!shouldSave) return false;
        return saveEditor(displayedStage, false);
    };

    const handleGenerateAgreementPreview = async () => {
        if (!selectedCust) return;
        const findDoc = types => custDocs.find(doc => types.includes(doc.doc_type));
        const urlOf = async doc => (doc ? await getViewUrl(doc.storage_path) : '') || '';
        const signatureUrl = await urlOf(findDoc(['signature_pic', 'signature', 'firstPartySignature', 'customer_signature']));
        const stampUrl = await urlOf(findDoc(['stamp', 'stamp_pic', 'vendor_stamp', 'secondPartyStamp']));
        const gpaStampUrl = await urlOf(findDoc(['pm_surya_ghar_stamp', 'surya_ghar_stamp', 'ghar_stamp']));
        const rawDate = stageRemarks(editData.stages_remarks).discom_agreement_date || todayIST();
        const [y, m, d] = rawDate.split('-');
        setAgreementData({
            executionDate: y && m && d ? `${d}-${m}-${y}` : rawDate,
            consumerName: selectedCust.customer_name || '',
            consumerNo: selectedCust.consumer_no || '',
            village: selectedCust.villages || '',
            taluka: selectedCust.sub_divisions || '',
            district: selectedCust.district || '',
            vendorName: BRANDING.companyName,
            vendorAddress: BRANDING.address,
            paymentTerms: 'Mutually Agreed Terms of Payment',
            firstPartySignature: signatureUrl,
            secondPartyStamp: stampUrl,
            secondPartySignature: '',
            signatureUrl,
            stampUrl,
            gpaStampUrl,
            highlightColor: '#fef08a',
            showHighlights: true,
        });
    };

    // ── Derived lists ────────────────────────────────────────────────────
    const countAt = stage => customers.filter(customer => customer.stage === stage).length;
    const priorityWorkdeskTab = PRIORITY_STAGES.find(stage => countAt(stage) > 0) || STAGE_IDS.LEADS;
    const workdeskCustomers = customers.filter(customer => customer.stage === activeWorkdeskTab && matchesSearch(customer, searchQuery));
    const homeSearchResults = homeSearchQuery.trim() ? customers.filter(customer => matchesSearch(customer, homeSearchQuery)) : [];
    const openWorkdesk = stage => { setActiveWorkdeskTab(stage); setView('workdesk'); };

    const stageData = { ...selectedCust, ...editData };
    const currentStageIdx = PRIMARY_STAGES.findIndex(stage => stage.id === selectedCust?.stage);
    const displayedStageIdx = PRIMARY_STAGES.findIndex(stage => stage.id === displayedStage);
    const isFutureStage = currentStageIdx !== -1 && displayedStageIdx > currentStageIdx;
    const editingCurrentStage = selectedCust?.stage === displayedStage;
    const nextStageId = selectedCust && editingCurrentStage ? getNextStageId(stageData) : null;
    const customerTabs = selectedCust
        ? [
            ...applicableStages(selectedCust).filter(stage => !stage.terminal),
            ...(documentUploadsOn ? [{ id: 'DOCUMENTS', label: 'Documents', icon: FolderOpen }] : []),
        ]
        : [];
    const isIdDocumentCustomer = String(stageData.payment_type || '').trim().toLowerCase() !== 'cash';
    const leadRecord = { ...stageData, sub_channel_partner: stageData.sub_channel_partner || (isAgent2 ? user?.name : '') };
    const leadOmit = isAgent2 ? ['channel_partner'] : [];

    // The end of a stage editor: the client's extra fields for the stage, then Save (and move).
    const editorFooter = (stage) => {
        const dirty = isEditorDirty(stage);
        return (
            <>
                <StageCustomFields stage={stage} customer={stageData} title="Files" types={['file']} />
                <PortalCustomFields stage={stage} values={editData.custom_fields} onChange={handleCustomFieldChange} />
                <div className={`grid gap-2 border-t border-stone-200 pt-3 ${editingCurrentStage && nextStageId ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <button type="button" onClick={() => saveEditor(stage, false)} disabled={saving || !dirty}
                        className={dirty ? 'sf-btn-secondary min-h-11' : 'sf-btn-success min-h-11 disabled:opacity-100'}>
                        {dirty ? <Save size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                    </button>
                    {editingCurrentStage && nextStageId && (
                        <button type="button" onClick={() => saveEditor(stage, true)} disabled={saving} className="sf-btn-primary min-h-11">
                            <ChevronRight size={14} aria-hidden="true" /> {saving ? 'Saving…' : `Save & move to ${stageLabel(nextStageId)}`}
                        </button>
                    )}
                </div>
            </>
        );
    };

    const loanPayments = Array.isArray(stageData.loan_history) ? stageData.loan_history : [];
    const panelSerials = readModuleSerials(stageData.panel_serial_no);

    return (
        <>
            {view === 'menu' && (
                <MobilePortalShell label={portalLabel} user={user} onLogout={onLogout} onChangePassword={onChangePassword}
                    onBeforeLeave={() => confirmLeaveStage('Save & log out')}>
                    <PortalHero
                        kicker={isAgent2 ? 'Dealer workspace' : 'Channel partner workspace'}
                        title={`Good to see you, ${user.name}.`}
                        actions={(
                            <>
                                <button type="button" onClick={() => openWorkdesk(priorityWorkdeskTab)}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-amber-400 px-4 text-xs font-black text-stone-950 hover:bg-amber-300">
                                    <Layers size={15} aria-hidden="true" /> Open work queue <ChevronRight size={15} aria-hidden="true" />
                                </button>
                                <button type="button" onClick={() => setShowAddLead(true)}
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/20 bg-white/15 px-4 text-xs font-bold text-white hover:bg-white/25">
                                    <Plus size={15} aria-hidden="true" /> Add customer
                                </button>
                            </>
                        )}
                    >
                        Your customers, the work waiting on you, and what needs attention today.
                    </PortalHero>

                    <ErrorBanner title="Customers not loaded" onRetry={fetchCustomers}>{loadError}</ErrorBanner>

                    {PortalCalendar && (
                        <button type="button" onClick={() => setView('calendar')}
                            className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-stone-300">
                            <CalendarDays size={24} className="text-amber-600" aria-hidden="true" />
                            <span className="flex-1"><strong className="block text-base text-stone-900">Calendar</strong><span className="text-xs text-stone-500">Site visits, follow-ups and days off, shared with the office</span></span>
                            <ChevronRight size={18} className="text-stone-400" aria-hidden="true" />
                        </button>
                    )}

                    {QuotationModule && (
                        <button type="button" onClick={() => { window.location.hash = '/quotations'; setView('quotations'); }}
                            className="flex w-full items-center gap-3 rounded-2xl bg-blue-950 p-5 text-left text-white shadow-sm">
                            <FileText size={24} aria-hidden="true" />
                            <span className="flex-1"><strong className="block text-base">Quotation maker</strong><span className="text-xs text-blue-200">Create, share and follow up on solar quotations</span></span>
                            <ChevronRight size={18} aria-hidden="true" />
                        </button>
                    )}

                    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                        <div>
                            <p className="text-xs font-black text-stone-900">Find any customer</p>
                            <p className="mt-0.5 text-[11px] font-medium text-stone-500">Search every customer you can see, across all stages.</p>
                        </div>
                        <SearchInput value={homeSearchQuery} onChange={setHomeSearchQuery} delay={150} label="Search customers" placeholder="Name, phone or consumer no." />
                        {homeSearchQuery.trim() && (
                            homeSearchResults.length === 0
                                ? <p className="rounded-xl border border-dashed border-stone-200 px-3 py-5 text-center text-xs font-semibold text-stone-500">No matching customers.</p>
                                : (
                                    <div className="max-h-72 space-y-2 overflow-y-auto">
                                        {homeSearchResults.map(cust => (
                                            <button type="button" key={cust.id} onClick={() => openCustomer(cust)}
                                                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-3 text-left hover:border-amber-300 hover:bg-amber-50/40">
                                                <span className="min-w-0">
                                                    <span className="block truncate text-xs font-black text-stone-900">{cust.customer_name || 'Unnamed customer'}</span>
                                                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-stone-500">
                                                        {[cust.phone_number, cust.consumer_no].filter(Boolean).join(' · ') || 'No phone or consumer number'}
                                                    </span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-2">
                                                    <span className="max-w-[110px] truncate rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black uppercase text-stone-600">{stageLabel(cust.stage) || 'Unknown stage'}</span>
                                                    <ChevronRight size={14} className="text-stone-400" aria-hidden="true" />
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )
                        )}
                    </section>

                    <section className="grid grid-cols-2 gap-3">
                        <StatTile label="Total customers" value={customers.length} icon={Users} tone="stone" onClick={() => openWorkdesk(STAGE_IDS.LEADS)} />
                        {HOME_TILE_STAGES.map(stage => (
                            <StatTile key={stage} label={stageLabel(stage)} value={countAt(stage)} icon={PRIMARY_STAGES.find(item => item.id === stage)?.icon || Folder}
                                tone="orange" onClick={() => openWorkdesk(stage)} />
                        ))}
                    </section>

                    <button type="button" onClick={() => openWorkdesk(STAGE_IDS.LEADS)}
                        className="group flex min-h-11 w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm hover:border-stone-300">
                        <span className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700"><Users size={17} aria-hidden="true" /></span>
                            <span><span className="block text-xs font-black text-stone-900">Customer directory</span><span className="mt-0.5 block text-[11px] font-medium text-stone-500">Browse customers stage by stage</span></span>
                        </span>
                        <ChevronRight size={16} className="text-stone-400" aria-hidden="true" />
                    </button>
                </MobilePortalShell>
            )}

            {view === 'workdesk' && (
                <div className="flex h-screen justify-center overflow-hidden bg-stone-100 font-sans text-stone-800">
                    <div className="relative flex h-full w-full max-w-md flex-col bg-[#FCFBFA] shadow-2xl">
                        {isSidebarOpen && (
                            <div className="fixed inset-0 z-[100] flex" role="dialog" aria-modal="true" aria-label="Pipeline stages">
                                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />
                                <aside className="relative z-10 flex h-full w-[280px] flex-col bg-slate-900 shadow-2xl">
                                    <div className="flex shrink-0 items-center justify-between border-b border-slate-800 p-3">
                                        <BrandMark variant="white" />
                                        <button type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close stage list"
                                            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:text-white">
                                            <X size={16} aria-hidden="true" />
                                        </button>
                                    </div>
                                    <div className="shrink-0 border-b border-slate-800 p-3">
                                        <button type="button" onClick={() => setView('menu')}
                                            className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-slate-800 p-3 text-white hover:bg-slate-700">
                                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500"><Home size={14} aria-hidden="true" /></span>
                                            <span className="text-xs font-bold">Home</span>
                                        </button>
                                    </div>
                                    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Stages">
                                        <p className="px-1 pb-2 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Pipeline stages</p>
                                        {PRIMARY_STAGES.map(stage => {
                                            const StageIcon = stage.icon || Folder;
                                            const isActive = activeWorkdeskTab === stage.id;
                                            return (
                                                <button type="button" key={stage.id} aria-current={isActive ? 'true' : undefined}
                                                    onClick={() => { setActiveWorkdeskTab(stage.id); setIsSidebarOpen(false); }}
                                                    className={`flex min-h-11 w-full items-center justify-between rounded-xl p-2.5 ${isActive ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                                                    <span className="flex items-center gap-2.5"><StageIcon size={16} aria-hidden="true" /><span className="text-xs font-bold">{stage.label}</span></span>
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isActive ? 'bg-white/20' : 'bg-slate-800 text-slate-400'}`}>{countAt(stage.id)}</span>
                                                </button>
                                            );
                                        })}
                                    </nav>
                                </aside>
                            </div>
                        )}

                        <main className="relative flex h-screen flex-1 flex-col overflow-hidden bg-stone-50/50">
                            <PortalHeader
                                leading={(
                                    <>
                                        <button type="button" onClick={() => setIsSidebarOpen(true)}
                                            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-[10px] font-black uppercase tracking-wide text-white">
                                            <Layers size={14} aria-hidden="true" /> Stages
                                        </button>
                                        <h2 className="truncate text-sm font-black uppercase tracking-tight text-stone-900">{stageLabel(activeWorkdeskTab)}</h2>
                                    </>
                                )}
                                onLogout={onLogout} onChangePassword={onChangePassword}
                                onBeforeLeave={() => confirmLeaveStage('Save & log out')}
                            />
                            <div className="shrink-0 border-b border-stone-200 bg-white px-4 py-3">
                                <SearchInput value={searchQuery} onChange={setSearchQuery} delay={150} label="Search customers in this stage" placeholder="Search customers…" />
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 pb-24">
                                <ErrorBanner title="Customers not loaded" onRetry={fetchCustomers} className="mb-3">{loadError}</ErrorBanner>
                                {loading && customers.length === 0 ? (
                                    <LoadingState label="Loading customers…" />
                                ) : workdeskCustomers.length === 0 ? (
                                    <EmptyState icon={Users} title="No customers">{searchQuery ? 'No matches found.' : 'No customers in this stage.'}</EmptyState>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3">
                                        {workdeskCustomers.map(cust => (
                                            <div key={cust.id} className="relative rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
                                                <div className="mb-3 flex items-start justify-between gap-2">
                                                    <button type="button" onClick={() => openCustomer(cust)} className="min-w-0 text-left after:absolute after:inset-0 after:content-['']">
                                                        <h4 className="text-sm font-black leading-snug text-stone-900">{cust.customer_name || 'Unnamed customer'}</h4>
                                                    </button>
                                                    {getTelephoneHref(cust.phone_number) && (
                                                        <a href={getTelephoneHref(cust.phone_number)} aria-label={`Call ${cust.customer_name}`}
                                                            className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white">
                                                            <Phone size={14} aria-hidden="true" />
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5 text-xs text-stone-600">
                                                    <p>{cust.phone_number || '–'}</p>
                                                    {cust.villages && <p className="flex items-start gap-2"><MapPin size={11} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" /><span className="line-clamp-1">{cust.villages}</span></p>}
                                                    {cust.consumer_no && <p><span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-700">#{cust.consumer_no}</span></p>}
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-3 text-[11px]">
                                                    {cust.system_capacity_kwp && <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-bold text-amber-800"><Zap size={10} aria-hidden="true" />{cust.system_capacity_kwp} kWp</span>}
                                                    {cust.payment_type && <span className="rounded border border-stone-100 bg-stone-50 px-2 py-0.5 font-bold uppercase text-stone-600">{cust.payment_type}</span>}
                                                    {activeWorkdeskTab === STAGE_IDS.DISCOM_INSPECTION && cust.discom_inspection === 'Yes' && <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Inspected</span>}
                                                    {activeWorkdeskTab === STAGE_IDS.METER_INSTALLATION && normalizeMeterInstallation(cust.meter_installation) === 'Yes' && <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Installed</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button type="button" onClick={() => setShowAddLead(true)} aria-label="Add customer"
                                className="absolute bottom-6 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/40">
                                <Plus size={22} aria-hidden="true" />
                            </button>
                        </main>
                    </div>
                </div>
            )}

            {view === 'calendar' && PortalCalendar && (
                <MobilePortalShell label={portalLabel} user={user} onLogout={onLogout} onChangePassword={onChangePassword}
                    onBeforeLeave={() => confirmLeaveStage('Save & log out')} mainClassName="max-w-4xl">
                    <button type="button" onClick={() => setView('menu')} className="flex min-h-11 items-center gap-1 text-xs font-bold text-stone-600 hover:text-stone-900">
                        <ChevronLeft size={18} aria-hidden="true" /> Back to home
                    </button>
                    <LazyBoundary fallback={<LoadingState label="Opening calendar…" />}>
                        <PortalCalendar currentUser={user} />
                    </LazyBoundary>
                </MobilePortalShell>
            )}

            {view === 'quotations' && QuotationModule && (
                <LazyBoundary fallback={<LoadingState label="Opening quotations…" />}>
                    <QuotationModule embedded user={user} meta={meta} onCreateLead={handleSubmitLead}
                        onViewLead={lead => openCustomer(lead)} onClose={() => setView('menu')} />
                </LazyBoundary>
            )}

            {showAddLead && (
                <LazyBoundary>
                    <AddLeadModal isOpen onClose={() => setShowAddLead(false)} onSave={handleSubmitLead} meta={meta} channel_partners={[]} user={user} />
                </LazyBoundary>
            )}

            {selectedCust && (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-xs sm:items-center sm:p-4"
                    role="dialog" aria-modal="true" aria-labelledby="agent-customer-title">
                    <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-lg sm:rounded-[28px]">
                        <div className="flex shrink-0 items-start justify-between border-b border-stone-200 bg-stone-50/90 px-5 py-4">
                            <div className="min-w-0 space-y-1">
                                <span className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">{stageLabel(selectedCust.stage)}</span>
                                <h3 id="agent-customer-title" className="pt-1 text-base font-black uppercase leading-tight text-stone-900">{selectedCust.customer_name || 'Unnamed customer'}</h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-600">
                                    <PhoneLink phone={selectedCust.phone_number} />
                                    {selectedCust.consumer_no && <span className="rounded bg-stone-200/70 px-1.5 py-0.5 text-[11px] font-bold text-stone-800">#{selectedCust.consumer_no}</span>}
                                    {selectedCust.villages && <span className="flex max-w-[160px] items-center gap-1 truncate text-stone-500"><MapPin size={11} aria-hidden="true" /> {selectedCust.villages}</span>}
                                </div>
                            </div>
                            <button type="button" aria-label="Close customer" onClick={async () => { if (await confirmLeaveStage('Save & close')) closeCustomer(); }}
                                className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-200/70 text-stone-600 hover:bg-stone-300 hover:text-stone-900">
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="shrink-0 overflow-x-auto border-b border-stone-200 bg-white px-4 py-3">
                            <div className="flex min-w-max gap-2" role="tablist" aria-label="Customer stages">
                                {customerTabs.map(stage => {
                                    const StageIcon = stage.icon || Folder;
                                    const isActive = displayedStage === stage.id;
                                    return (
                                        <button type="button" role="tab" aria-selected={isActive} key={stage.id}
                                            onClick={async () => { if (stage.id === displayedStage || await confirmLeaveStage('Save & continue')) setActiveCustomerStage(stage.id); }}
                                            className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-wide ${isActive ? 'border-amber-500 bg-amber-500 text-white' : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-amber-300 hover:bg-amber-50'}`}>
                                            <StageIcon size={13} aria-hidden="true" /> {stage.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-10 pt-5">
                            {isFutureStage && (
                                <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-center text-xs font-bold text-amber-800">
                                    This customer has not reached this stage yet.{EDITOR_FIELDS[displayedStage] ? ' You can save details here, but you can only move them on from their current stage.' : ''}
                                </p>
                            )}

                            {displayedStage === 'DOCUMENTS' && (
                                <Card icon={FolderOpen} title={`Uploaded documents (${custDocs.length})`}
                                    actions={custDocs.length > 0 && (
                                        <button type="button" onClick={handleDownloadAllDocs} disabled={downloadingAllDocs} className="sf-btn-primary min-h-11 px-3">
                                            {downloadingAllDocs ? 'Preparing PDF…' : 'Download all as PDF'}
                                        </button>
                                    )}>
                                    {custDocs.length === 0 ? (
                                        <EmptyState icon={FolderOpen} title="No documents yet" />
                                    ) : custDocs.map(doc => (
                                        <div key={doc.id} className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3 sm:flex-row sm:items-center">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-stone-800">{doc.file_name || doc.doc_type}</p>
                                                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{String(doc.doc_type || '').replace(/_/g, ' ')}</p>
                                            </div>
                                            <div className="flex shrink-0 gap-2">
                                                <button type="button" onClick={() => handlePreviewFile(doc)} className="sf-btn-secondary min-h-11 flex-1 px-3"><Eye size={12} aria-hidden="true" /> View</button>
                                                <button type="button" onClick={() => handleDownloadDoc(doc)} className="sf-btn-secondary min-h-11 flex-1 px-3"><Download size={12} aria-hidden="true" /> Download</button>
                                            </div>
                                        </div>
                                    ))}
                                </Card>
                            )}

                            {displayedStage === STAGE_IDS.LEADS && (
                                <>
                                    <AgentStageDetails stage={STAGE_IDS.LEADS} customer={leadRecord} title="Lead information" omit={leadOmit} />
                                    {documentChecksOn && (
                                        <Card icon={Paperclip} title="Customer documents">
                                            <div className="flex flex-col gap-2">
                                                {LEAD_DOCUMENTS.filter(doc => !doc.idDocument || isIdDocumentCustomer).map(doc => docItem(doc.label, doc.field))}
                                            </div>
                                        </Card>
                                    )}
                                </>
                            )}

                            {displayedStage === STAGE_IDS.LOAN && loanPayments.length > 0 && (
                                <Card icon={Banknote} title="Loan payments">
                                    <dl className="divide-y divide-stone-200 text-xs">
                                        {['Down Payment', '1st Payment', '2nd Payment'].map(label => {
                                            const entry = loanPayments.find(item => item.status === label) || {};
                                            return (
                                                <div key={label} className="flex items-start justify-between gap-3 py-2">
                                                    <dt className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{label}</dt>
                                                    <dd className="flex flex-col items-end gap-0.5 text-right">
                                                        <span className="text-sm font-bold text-stone-800">{formatINR(entry.amount)}</span>
                                                        <span className="text-[11px] text-stone-500">Date: {entry.date ? formatDate(entry.date, 'short') : '–'}</span>
                                                        {entry.remark && <span className="text-[11px] italic text-stone-500">{entry.remark}</span>}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </Card>
                            )}

                            {displayedStage === STAGE_IDS.MATERIAL_ORDER && (
                                <>
                                    <Card icon={Package} title={`${stageLabel(STAGE_IDS.MATERIAL_ORDER)} details`}>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Roof / shed" htmlFor="mo-roof_shed" className="col-span-2">
                                                <Select id="mo-roof_shed" options={['Roof', 'Shed']} placeholder="Select roof or shed" value={fieldValue('roof_shed')} onChange={event => handleChange('roof_shed', event.target.value)} />
                                            </Field>
                                            {[
                                                ['dc_cable', 'DC cable (metres)'], ['ac_cable', 'AC cable (metres)'],
                                                ['structure_front_leg_height', 'Front leg height (ft)'], ['structure_rear_leg_height', 'Rear leg height (ft)'],
                                            ].map(([field, label]) => (
                                                <Field key={field} label={label} htmlFor={`mo-${field}`}>
                                                    <Input id={`mo-${field}`} type="number" inputMode="decimal" min="0" value={fieldValue(field)}
                                                        onKeyDown={event => ['e', 'E', '-', '+'].includes(event.key) && event.preventDefault()}
                                                        onChange={event => handleChange(field, event.target.value)} />
                                                </Field>
                                            ))}
                                            <Field label="Invoice value (₹)" htmlFor="mo-invoice_value" className="col-span-2">
                                                <Input id="mo-invoice_value" type="text" inputMode="decimal" value={formatInputValue(fieldValue('invoice_value'))}
                                                    onChange={event => handleChange('invoice_value', formatInputValue(event.target.value))} />
                                            </Field>
                                            <Field label="Notes / instructions" htmlFor="mo-notes" className="col-span-2">
                                                <Textarea id="mo-notes" rows={4} value={fieldValue('material_order_notes')} onChange={event => handleChange('material_order_notes', event.target.value)} />
                                            </Field>
                                        </div>
                                        {editorFooter(STAGE_IDS.MATERIAL_ORDER)}
                                    </Card>
                                    <AgentStageDetails stage={STAGE_IDS.LEADS} customer={leadRecord} title="Customer and site" omit={leadOmit} />
                                </>
                            )}

                            {displayedStage === STAGE_IDS.MATERIAL_INTEGRATION && (BomPrintModal ? (
                                <>
                                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                                        <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">{integration.type === 'SHED' ? 'Shed' : 'Roof'} BOM</span>
                                        <button type="button" onClick={() => setShowBomPrint(true)} className="sf-btn-primary min-h-11 px-3">
                                            <Printer size={13} aria-hidden="true" /> Print / save as PDF
                                        </button>
                                    </div>
                                    <Card icon={Zap} title="Inverter and panels">
                                        <FieldList fields={INTEGRATION_FIELDS} record={stageData} variant="rows" className="text-xs" />
                                        <p className="text-[11px] font-bold uppercase text-amber-800">Panel serial numbers: {panelSerials.length}</p>
                                        {panelSerials.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {panelSerials.map((serial, idx) => (
                                                    <div key={`${serial}-${idx}`} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-1.5 py-1">
                                                        <span className="w-5 shrink-0 text-center text-[10px] font-bold text-stone-500">{idx + 1}.</span>
                                                        <span className="truncate font-mono text-[11px] font-bold text-stone-900">{serial}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <p className="text-[11px] italic text-stone-500">No panel serial numbers recorded.</p>}
                                    </Card>
                                    <Card icon={ClipboardCheck} title="Paperwork and loading">
                                        <FieldList fields={MILESTONE_FIELDS} record={integration.bom || {}} variant="rows" className="text-xs" />
                                    </Card>
                                    <Card icon={Layers} title="Bill of materials">
                                        {integration.items.length === 0 ? (
                                            <p className="py-3 text-center text-xs font-semibold text-stone-500">No bill of materials items yet for this customer.</p>
                                        ) : (
                                            <dl className="divide-y divide-stone-200 text-xs">
                                                {integration.items.map((item, idx) => (
                                                    <div key={item.id || `${item.product_name}-${idx}`} className="flex items-start justify-between gap-3 py-2">
                                                        <dt className="text-[11px] font-bold text-stone-600">{item.sr_no ?? idx + 1}. {item.product_name || item.description || '–'}</dt>
                                                        <dd className="whitespace-nowrap font-semibold text-stone-900">{String(item.quantity ?? '').trim() === '' ? '–' : `${item.quantity}${item.uom ? ` ${item.uom}` : ''}`}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        )}
                                    </Card>
                                    <StageCustomFields stage={STAGE_IDS.MATERIAL_INTEGRATION} customer={stageData} />
                                </>
                            ) : (
                                <AgentStageDetails stage={STAGE_IDS.MATERIAL_INTEGRATION} customer={stageData} />
                            ))}

                            {displayedStage === STAGE_IDS.METER_INSTALLATION && (
                                <>
                                    <Card icon={Gauge} title={`${stageLabel(STAGE_IDS.METER_INSTALLATION)} details`}>
                                        <Field label="Meter installed" required>
                                            <TagPicker label="Meter installed" options={YES_NO} columns={2} value={normalizeMeterInstallation(fieldValue('meter_installation'))}
                                                onChange={value => handleChange('meter_installation', value)} />
                                        </Field>
                                        <Field label="Installation date" htmlFor="meter-date" required>
                                            <Input id="meter-date" type="date" value={fieldValue('installation_date')} onChange={event => handleChange('installation_date', event.target.value)} />
                                        </Field>
                                        {documentChecksOn && (
                                            <div>
                                                <p className="mb-1 text-xs font-bold text-stone-700">Meter installation photo <span className="text-red-500" aria-hidden="true">*</span></p>
                                                {docItem('Meter installation photo', 'meter_installation_photo')}
                                            </div>
                                        )}
                                        {editorFooter(STAGE_IDS.METER_INSTALLATION)}
                                    </Card>
                                </>
                            )}

                            {displayedStage === STAGE_IDS.DISCOM_INSPECTION && (
                                <>
                                    <Card icon={ClipboardCheck} title={`${stageLabel(STAGE_IDS.DISCOM_INSPECTION)} details`}>
                                        <Field label="Inspection passed" required>
                                            <TagPicker label="Inspection passed" options={YES_NO} columns={2} value={fieldValue('discom_inspection')}
                                                onChange={value => handleChange('discom_inspection', value)} />
                                        </Field>
                                        {editorFooter(STAGE_IDS.DISCOM_INSPECTION)}
                                    </Card>
                                </>
                            )}

                            {displayedStage !== 'DOCUMENTS' && displayedStage !== STAGE_IDS.LEADS && !EDITOR_FIELDS[displayedStage]
                                && displayedStage !== STAGE_IDS.MATERIAL_INTEGRATION && (
                                <AgentStageDetails stage={displayedStage} customer={stageData} documents={custDocs}
                                    onPreview={documentUploadsOn ? handlePreviewFile : undefined} />
                            )}

                            {displayedStage === STAGE_IDS.DISCOM_SUBMISSION && (
                                <button type="button" onClick={handleGenerateAgreementPreview} className="sf-btn-primary min-h-11 w-full">
                                    <FileText size={14} aria-hidden="true" /> Preview PM Surya Ghar agreement
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Modal open={Boolean(validation)} onClose={() => setValidation(null)} title="A few details need attention" size="sm"
                footer={<button type="button" onClick={() => setValidation(null)} className="sf-btn-secondary min-h-11 w-full" data-autofocus>Back to fill these in</button>}>
                <p className="text-sm leading-relaxed text-stone-600">
                    Complete these before moving this customer to <strong className="text-stone-900">{validation?.nextLabel}</strong>.
                </p>
                <ul className="mt-4 space-y-2">
                    {(validation?.issues || []).map(issue => (
                        <li key={issue} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">
                            <AlertTriangle size={16} className="shrink-0 text-rose-600" aria-hidden="true" /> {issue}
                        </li>
                    ))}
                </ul>
            </Modal>

            {agreementData && (
                <LazyBoundary>
                    <AgreementPreview data={agreementData} onChange={setAgreementData} onClose={() => setAgreementData(null)} />
                </LazyBoundary>
            )}

            {BomPrintModal && showBomPrint && selectedCust && (
                <LazyBoundary>
                    <BomPrintModal customer={stageData} bom={integration.bom} bomItems={integration.items} activeType={integration.type} onClose={() => setShowBomPrint(false)} />
                </LazyBoundary>
            )}

            {previewDoc?.doc && (
                <FilePreviewModal file={previewDoc.doc} fileUrl={previewDoc.url} onClose={() => setPreviewDoc(null)}
                    onDownload={() => handleDownloadDoc(previewDoc.doc)} onUpdateRemark={handleUpdateDocRemark} />
            )}
        </>
    );
}
