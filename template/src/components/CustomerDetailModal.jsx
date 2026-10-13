// ─── CustomerDetailModal.jsx ──────────────────────────────────────────────────
// Full customer card: one tab per pipeline stage the customer passes through
// (from config), plus Documents and Notes & History. The footer saves every
// edit made in the tabs, including the client's extra fields, and moves the
// customer to the next stage.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Trash2, Save, AlertTriangle, CheckSquare, FolderOpen, MapPin, History, Lock, Unlock,
    PauseCircle, Check, CheckCircle2, Eye, Calendar, Phone, Clock, HardDrive, ExternalLink,
} from 'lucide-react';
import {
    BRANDING, CUSTOM_FIELDS, PRIMARY_STAGES, STAGE_BY_ID, STAGE_IDS, getNextStageId, getStageRequirements,
    isOn, isStageApplicable, missingStageRequirements, readPath, stageLabel,
} from '../config/index.js';
import { DOC_TYPE_LABELS, DOC_TYPE_FLAG_COLUMN, REG_CHECKLIST_FIELDS } from '../constants';
import {
    logActivity, formatDateToDDMMYYYY, parseIndianNumber, fetchAgent2SubAgents, normalizeMeterInstallation,
    sanitizePhoneNumber, getTelephoneHref, uploadDocument, getCustomerDocuments, getDownloadUrl, getViewUrl,
    deleteDocument, updateDocumentRemark, downloadFileWithSaveAs, downloadDocumentsAsPdf,
} from '../utils';
import { supabase } from '../supabase';
import { formatFieldValue, todayIST } from '../lib/format.js';
import { lazyWithRetry, LazyBoundary } from '../lib/lazy.js';
import { LoadingState, Modal } from '../ui/index.js';
import { canSwitchChecklistMode, setChecklistMode, useChecklistMode } from '../utils/checklistMode';
import CustomerModalTabsRouter from './CustomerModalTabsRouter';
import { FilePreviewModal, getStageRemarkFromData } from './modal-tabs/shared';
import { useGlobalPopup } from './GlobalPopup';
import ConflictResolutionModal from './ConflictResolutionModal';

const CustomerDocumentsTab = lazyWithRetry(() => import('./modal-tabs/CustomerDocumentsTab'));
const HistoryTab = lazyWithRetry(() => import('./modal-tabs/HistoryTab'));
const AgreementPreview = lazyWithRetry(() => import('./agreement/AgreementPreview').then(module => ({ default: module.AgreementPreview })));

const DOCUMENTS_TAB = 'DOCUMENTS';
const HISTORY_TAB = 'history';
const TAB_STORAGE_KEY = 'solarflow_modal_active_tab';
const OPERATIONAL_CHECKLIST = [{ field: 'insurance_status', label: 'Insurance Status' }];
// Logins that may edit any customer they can see (RLS already limits which).
const STAFF_EDITORS = new Set(['admin', 'sales', 'channel_partner_office', 'office2', 'agent2']);
// Text columns that hold numbers typed with Indian commas.
const NUMERIC_TEXT_FIELDS = ['system_capacity_kwp', 'module_wp', 'no_of_modules', 'invoice_value', 'dc_cable', 'ac_cable', 'vendor_quote'];
const IGNORED_KEYS = new Set(['id', 'created_at', 'updated_at', 'crn']);

const getDocTypeLabel = (type) => {
    if (!type) return 'Client Attachment';
    if (DOC_TYPE_LABELS[type]) return DOC_TYPE_LABELS[type];
    const extra = String(type).startsWith('cf_') && CUSTOM_FIELDS.find(field => `cf_${field.key}` === type);
    if (extra) return extra.label;
    return String(type).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// "04 Aug, 11:01 PM"
const formatDateTime = (date) => {
    const dObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dObj.getTime())) return String(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hours = dObj.getHours() % 12 || 12;
    return `${String(dObj.getDate()).padStart(2, '0')} ${months[dObj.getMonth()]}, ${String(hours).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')} ${dObj.getHours() >= 12 ? 'PM' : 'AM'}`;
};

const formatStamp = (value) => new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});

const isBlank = value => value === undefined || value === null || value === ''
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

// Postgres stores jsonb with its own key order, so objects compare key-sorted.
const stableStringify = value => JSON.stringify(value ?? null, (key, val) => (
    val && typeof val === 'object' && !Array.isArray(val)
        ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]]))
        : val
));

const getChangedFields = (draft = {}, saved = {}) => {
    const changed = new Set();
    const keys = new Set([...Object.keys(saved || {}), ...Object.keys(draft || {})]);
    keys.forEach(key => {
        if (IGNORED_KEYS.has(key)) return;
        const draftValue = draft?.[key];
        const savedValue = saved?.[key];
        if (typeof draftValue === 'boolean' || typeof savedValue === 'boolean') {
            if (Boolean(draftValue) !== Boolean(savedValue)) changed.add(key);
            return;
        }
        if (isBlank(draftValue) && isBlank(savedValue)) return;
        if (typeof draftValue === 'object' || typeof savedValue === 'object') {
            if (stableStringify(draftValue) !== stableStringify(savedValue)) changed.add(key);
            return;
        }
        if (String(draftValue ?? '').trim() !== String(savedValue ?? '').trim()) changed.add(key);
    });
    return changed;
};

const sameValue = (a, b) => getChangedFields({ value: a }, { value: b }).size === 0;

// Extra-field keys whose value differs; null means "remove the key".
const customFieldPatch = (draft, saved) => {
    const next = draft || {};
    const prev = saved || {};
    const patch = {};
    new Set([...Object.keys(next), ...Object.keys(prev)]).forEach(key => {
        if (!sameValue(next[key], prev[key])) patch[key] = isBlank(next[key]) ? null : next[key];
    });
    return patch;
};

// Changed field names; extra fields are listed one by one as custom_fields.<key>
// so two people editing different extra fields do not conflict.
const changedFieldNames = (draft, saved) => {
    const names = [];
    getChangedFields(draft, saved).forEach(key => {
        if (key !== 'custom_fields') names.push(key);
        else Object.keys(customFieldPatch(draft?.custom_fields, saved?.custom_fields)).forEach(k => names.push(`custom_fields.${k}`));
    });
    return names;
};

// '<Stage> > <Field>: old → new' for the activity log.
const customFieldLogLines = (patch, saved) => Object.entries(patch).map(([key, value]) => {
    const field = CUSTOM_FIELDS.find(f => f.key === key) || { key, label: key, type: 'text' };
    const stage = field.stage ? stageLabel(field.stage) : 'Extra fields';
    return `${stage} > ${field.label}: ${formatFieldValue(field, saved?.[key])} → ${formatFieldValue(field, value)}`;
});

const historyChanges = (oldList = [], newList = [], label) => {
    if (stableStringify(oldList) === stableStringify(newList)) return null;
    const changes = [];
    if (newList.length === 0 && oldList.length > 0) {
        changes.push(`Cleared all ${label.toLowerCase()} entries`);
    } else {
        for (let i = 0; i < Math.max(oldList.length, newList.length); i++) {
            const oldItem = oldList[i];
            const newItem = newList[i];
            if (!oldItem && newItem) {
                changes.push(`Added Entry ${i + 1} (${newItem.status}${newItem.date ? ` on ${newItem.date}` : ''}${newItem.remark ? `: ${newItem.remark}` : ''})`);
            } else if (oldItem && !newItem) {
                changes.push(`Removed Entry ${i + 1} (${oldItem.status})`);
            } else if (stableStringify(oldItem) !== stableStringify(newItem)) {
                const diffs = ['status', 'date', 'remark']
                    .filter(key => oldItem[key] !== newItem[key])
                    .map(key => `${key}: "${oldItem[key] || 'None'}" → "${newItem[key] || 'None'}"`);
                if (diffs.length) changes.push(`Updated Entry ${i + 1} (${diffs.join(', ')})`);
            }
        }
    }
    return changes.length ? `${label.toUpperCase()} STATUS: ${changes.join(' | ')}` : null;
};

const primitiveChangeSummary = (updates, original, skip = []) => Object.keys(updates)
    .filter(key => !IGNORED_KEYS.has(key) && !skip.includes(key) && typeof updates[key] !== 'object' && updates[key] !== original[key])
    .map(key => `${key.replace(/_/g, ' ').toUpperCase()}: ${original[key] || 'None'} → ${updates[key] || 'None'}`);

const withPlainNumbers = (record) => {
    const updates = { ...record };
    NUMERIC_TEXT_FIELDS.forEach(key => {
        if (updates[key] === '' && key === 'vendor_quote') updates[key] = null;
        else if (!isBlank(updates[key])) updates[key] = String(parseIndianNumber(updates[key]));
    });
    ['subsidy_history', 'loan_history'].forEach(key => {
        if (Array.isArray(updates[key])) updates[key] = updates[key].map(({ isNew, ...rest }) => rest);
    });
    return updates;
};

const parseRemarks = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch { /* not JSON: no per-stage remarks */ }
    }
    return {};
};

function isTabAvailable(id, record) {
    if (id === HISTORY_TAB) return true;
    if (id === DOCUMENTS_TAB) return isOn('documentUploads');
    // Lost Project has no tab of its own; Pause opens it.
    if (id === STAGE_IDS.LOST_PROJECT) return true;
    const stage = STAGE_BY_ID[id];
    return Boolean(stage && !stage.terminal && isStageApplicable(stage, record));
}

// A saved or requested tab that is switched off falls back to the record's stage, then Leads.
const resolveTab = (id, record) => {
    if (id && isTabAvailable(id, record)) return id;
    return record?.stage && isTabAvailable(record.stage, record) ? record.stage : STAGE_IDS.LEADS;
};

const readSavedTab = () => {
    try { return window.sessionStorage.getItem(TAB_STORAGE_KEY); } catch { return null; }
};

const findAgreementDocs = (documents) => ({
    sigDoc: documents.find(d => ['signature_pic', 'signature', 'firstPartySignature', 'customer_signature'].includes(d.doc_type)),
    stampDoc: documents.find(d => ['stamp', 'stamp_pic', 'vendor_stamp', 'secondPartyStamp'].includes(d.doc_type)),
    gpaStampDoc: documents.find(d => ['pm_surya_ghar_stamp', 'surya_ghar_stamp', 'ghar_stamp'].includes(d.doc_type)),
});

// ─── CustomerDetailModal ──────────────────────────────────────────────────────
export default function CustomerDetailModal({ customer, onClose, onUpdate, onDelete, user, meta, channel_partners = [], defaultTab }) {
    const { showAlert, showConfirm, showImageCropper } = useGlobalPopup();
    const [activeTab, setActiveTab] = useState(() => {
        if (customer?._autoPrintBom) return resolveTab(STAGE_IDS.MATERIAL_INTEGRATION, customer);
        if (defaultTab) return resolveTab(defaultTab, customer);
        // Completed customers open on Leads.
        if ((customer?.stage || '').trim().toUpperCase() === STAGE_IDS.COMPLETED) return STAGE_IDS.LEADS;
        return resolveTab(readSavedTab() || customer?.stage, customer);
    });
    useEffect(() => {
        if (customer?._autoPrintBom) setActiveTab(STAGE_IDS.MATERIAL_INTEGRATION);
        else if (defaultTab) setActiveTab(defaultTab);
    }, [defaultTab, customer?.id, customer?._autoPrintBom]);
    const [editingSection, setEditingSection] = useState(null);
    const [isFormDirty, setIsFormDirty] = useState(false);
    const [editData, setEditData] = useState({ ...customer });
    const savedDataRef = useRef({ ...customer });
    const loadedUpdatedAtRef = useRef(customer?.updated_at || null);
    const [concurrentConflict, setConcurrentConflict] = useState(null);
    const [subAgents, setSubAgents] = useState([]);
    const docChecklistMode = useChecklistMode();

    // Keep the open tab valid when the pipeline or payment type rules it out.
    useEffect(() => {
        const next = resolveTab(activeTab, editData);
        if (next !== activeTab) setActiveTab(next);
    }, [activeTab, editData]);

    useEffect(() => {
        try { window.sessionStorage.setItem(TAB_STORAGE_KEY, activeTab); } catch { /* storage blocked */ }
    }, [activeTab]);

    useEffect(() => {
        const managerBranch = user?.userType === 'office2' ? user?.channel_partner : '';
        const branch = (managerBranch || editData.channel_partner || customer.channel_partner || '').trim();
        if (!branch) { setSubAgents([]); return; }
        let cancelled = false;
        fetchAgent2SubAgents(branch).then(names => { if (!cancelled) setSubAgents(names); });
        return () => { cancelled = true; };
    }, [editData.channel_partner, customer.channel_partner, user?.userType, user?.channel_partner]);

    const handleEditDataChange = (updater) => {
        setEditData(previous => {
            const next = typeof updater === 'function' ? updater(previous) : updater;
            setIsFormDirty(getChangedFields(next, savedDataRef.current).size > 0);
            return next;
        });
    };

    // A colleague's save to this customer reloads the card while nothing is being edited.
    useEffect(() => {
        if (!customer?.id) return;
        const channel = supabase.channel(`customer_modal_concurrency_${customer.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin', filter: `id=eq.${customer.id}` }, (payload) => {
                if (!payload.new || isFormDirty) return;
                loadedUpdatedAtRef.current = payload.new.updated_at || loadedUpdatedAtRef.current;
                savedDataRef.current = { ...payload.new };
                setEditData({ ...payload.new });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [customer?.id, isFormDirty]);

    // Follow the parent's copy while not editing. The parent never hears about
    // extra fields saved through merge_custom_fields, so a copy older than the
    // row we last read is ignored in favour of that row.
    useEffect(() => {
        if (isFormDirty || !customer) return;
        const loaded = loadedUpdatedAtRef.current;
        const isOlder = loaded && customer.updated_at && new Date(customer.updated_at).getTime() < new Date(loaded).getTime();
        const record = isOlder ? savedDataRef.current : customer;
        if (!isOlder) loadedUpdatedAtRef.current = customer.updated_at || loadedUpdatedAtRef.current;
        savedDataRef.current = { ...record };
        setEditData({ ...record });
    }, [customer, isFormDirty]);

    // Protect against accidental browser refresh or tab close when form has unsaved edits
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isFormDirty) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isFormDirty]);

    const [followUpText, setFollowUpText] = useState('');
    const [saving, setSaving] = useState(false);
    const [validationIssues, setValidationIssues] = useState(null);
    const [activityLogs, setActivityLogs] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [filePreview, setFilePreview] = useState({ doc: null, url: null });

    // ── Permissions: decided by the login type only ──────────────────────────
    const userType = user?.userType;
    const isAdmin = userType === 'admin';
    // Head office: the only logins the database lets delete documents or use Trash.
    const isHeadOffice = isAdmin || userType === 'sales';
    const isChannelPartnerManager = userType === 'office2';
    const isChannelPartnerOfficeOrManager = userType === 'channel_partner_office' || isChannelPartnerManager;
    const canDeleteDocs = isHeadOffice;
    const isCompleted = customer.stage === STAGE_IDS.COMPLETED;
    const [adminUnlocked, setAdminUnlocked] = useState(false);
    // Frozen for ALL users when completed. Admin can temporarily unlock.
    const isFrozen = isCompleted && !(isAdmin && adminUnlocked);

    const canUserEdit = (() => {
        if (STAFF_EDITORS.has(userType)) return true;
        if (userType === 'agent') {
            // A partner may edit its own customer in DISCOM Submission and Meter Installation.
            const isMyClient = (customer.channel_partner || '').trim().toLowerCase() === (user.name || '').trim().toLowerCase();
            return isMyClient && [STAGE_IDS.DISCOM_SUBMISSION, STAGE_IDS.METER_INSTALLATION].includes(editData.stage);
        }
        return false;
    })();

    // Partner offices and their managers only view Material Integration and Material Delivery.
    const isStageRestrictedForUser = isChannelPartnerOfficeOrManager && (activeTab === STAGE_IDS.MATERIAL_INTEGRATION || activeTab === STAGE_IDS.MATERIAL_DELIVERY);
    const isEditable = !isFrozen && canUserEdit && !isStageRestrictedForUser;
    const canAddRemark = !isFrozen;
    // The partner office manager may only tick the SFDC photo in Installation Status.
    const isInstallationDetailsEditable = isEditable && !isChannelPartnerManager;
    const canDownloadAllDocuments = userType !== 'vendor';

    // Fetch the full record: the card may have been opened from a list that loads only some columns.
    useEffect(() => {
        if (!customer?.id) return;
        supabase.from('admin').select('*').eq('id', customer.id).single().then(({ data }) => {
            if (!data) return;
            loadedUpdatedAtRef.current = data.updated_at || loadedUpdatedAtRef.current;
            savedDataRef.current = { ...data };
            setEditData(prev => (isFormDirty ? { ...data, ...prev } : { ...data }));
        });
    }, [customer?.id, isFormDirty]);

    const saveBomRef = useRef(null);
    const prevCustomerRef = useRef(customer);
    const urlCacheRef = useRef({});
    const [agreement, setAgreement] = useState(null);

    const cachedViewUrl = async (doc) => {
        if (!doc) return '';
        const url = urlCacheRef.current[doc.storage_path] || await getViewUrl(doc.storage_path);
        if (url) urlCacheRef.current[doc.storage_path] = url;
        return url || '';
    };

    const handleGenerateAgreement = async (addToDocuments = false) => {
        const agreementDate = editData.stages_remarks?.discom_agreement_date || todayIST();
        const requiredFields = [
            ['Consumer Name', editData.customer_name, 'Leads'],
            ['Consumer No', editData.consumer_no, 'Leads'],
            ['Village', editData.villages, 'Leads'],
            ['Taluka / Sub Division', editData.sub_divisions, 'Leads'],
            ['District', editData.district, 'Leads'],
            ['Agreement Execution Date', agreementDate, 'DISCOM Submission'],
        ];
        const missing = requiredFields.filter(([, value]) => !String(value || '').trim());
        if (missing.length) {
            showAlert(`Please fill these values first:\n\n${missing.map(([field, , tab]) => `• ${field} - ${tab} tab`).join('\n')}`, {
                title: 'Agreement is incomplete',
                type: 'warning'
            });
            return;
        }

        const { sigDoc, stampDoc, gpaStampDoc } = findAgreementDocs(documents);
        const [sigUrl, stampUrl, gpaStampUrl] = await Promise.all([sigDoc, stampDoc, gpaStampDoc].map(cachedViewUrl));

        setAgreement({
            autoAdd: addToDocuments,
            data: {
                executionDate: formatDateToDDMMYYYY(agreementDate),
                consumerName: editData.customer_name || '',
                consumerNo: editData.consumer_no || '',
                village: editData.villages || '',
                taluka: editData.sub_divisions || '',
                district: editData.district || '',
                vendorName: BRANDING.companyName,
                vendorAddress: BRANDING.address,
                paymentTerms: 'Mutually Agreed Terms of Payment',
                firstPartySignature: sigUrl,
                secondPartyStamp: stampUrl,
                secondPartySignature: '',
                signatureUrl: sigUrl,
                stampUrl,
                gpaStampUrl,
                highlightColor: '#fef08a',
                showHighlights: true,
            },
        });
    };

    const fetchLogs = useCallback(async () => {
        const { data } = await supabase.from('activity_log').select('*, profiles(name)')
            .eq('customer_id', customer.id)
            .order('created_at', { ascending: false }).limit(25);
        if (data) setActivityLogs(data);
    }, [customer.id]);

    useEffect(() => {
        if (customer?.id) {
            getCustomerDocuments(customer.id).then(docs => {
                setDocuments(docs);
            });
        }
    }, [customer?.id]);

    // Stores one file as a document of `docType` and resolves true once it is
    // saved. With replaceExisting, the older documents of that type are removed
    // afterwards, so a failed upload never loses them. Checklist items crop
    // the image and remove the file they replace themselves.
    const storeDocument = async (file, docType = null, { replaceExisting = false } = {}) => {
        if (!file) return false;
        setUploading(true);
        try {
            const newDoc = await uploadDocument(file, customer.id, docType, user?.id);
            if (!newDoc) return false;
            const removedIds = new Set();
            const superseded = replaceExisting && docType ? documents.filter(d => d.doc_type === docType && d.id !== newDoc.id) : [];
            for (const oldDoc of superseded) {
                const res = await deleteDocument(oldDoc.id, oldDoc.storage_path);
                // The new file is stored; an old one left behind is untidy, not data loss.
                if (res?.ok) removedIds.add(oldDoc.id);
                else console.warn('New document saved, but removing the previous one failed:', res?.error);
            }
            setDocuments(prev => [newDoc, ...prev.filter(d => !removedIds.has(d.id))]);
            getViewUrl(newDoc.storage_path).then(url => {
                if (url) urlCacheRef.current[newDoc.storage_path] = url;
            });
            // Tick the matching checklist column, and say so if that was refused.
            const flagColumn = docType ? DOC_TYPE_FLAG_COLUMN[docType] : null;
            if (flagColumn && await handleSectionUpdate(customer.id, { [flagColumn]: true }) === false) {
                showAlert(
                    `The document uploaded, but its checklist tick could not be saved. Please tick "${getDocTypeLabel(docType)}" manually.`,
                    { title: 'Checklist not updated', type: 'warning' }
                );
            }
            logActivity(user.id, 'update', `${customer.customer_name}: Uploaded document (${file.name})`, '', customer.id).catch(console.error);
            fetchLogs();
            return true;
        } catch (err) {
            console.error('Document upload failed:', err);
            showAlert('Document upload failed: ' + (err.message || 'Please check your connection and try again.'), { type: 'error' });
            return false;
        } finally {
            setUploading(false);
        }
    };

    // The Documents tab's own file input: crop an image, then store it.
    const handleFileUpload = async (e) => {
        const rawFile = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!rawFile) return false;
        const file = await showImageCropper(rawFile, { title: 'Crop & Adjust Document' });
        return file ? storeDocument(file) : false;
    };

    // For the stage tabs: event.target.files[0] arrives ready to store.
    const handleTabUpload = (e, docType = null, options) => storeDocument(e.target.files?.[0], docType, options);

    const handleDownloadDoc = async (doc) => {
        const url = await getDownloadUrl(doc.storage_path, doc.file_name);
        if (url) {
            await downloadFileWithSaveAs(url, doc.file_name);
        }
    };

    const [downloadingAllDocuments, setDownloadingAllDocuments] = useState(false);
    const handleDownloadAllDocuments = async () => {
        if (!canDownloadAllDocuments || downloadingAllDocuments) return;
        setDownloadingAllDocuments(true);
        try {
            const result = await downloadDocumentsAsPdf(documents, customer.customer_name);
            if (result.failed.length > 0) {
                showAlert(`${result.downloaded} document(s) were downloaded. ${result.failed.length} could not be included.`, { type: 'warning' });
            }
        } catch (error) {
            showAlert(error?.message || 'The documents could not be downloaded.', { title: 'Download Failed', type: 'error' });
        } finally {
            setDownloadingAllDocuments(false);
        }
    };

    const handlePreviewDoc = async (doc) => {
        const url = await cachedViewUrl(doc);
        if (url) setFilePreview({ doc, url });
    };

    const handleDeleteDoc = async (doc) => {
        const res = await deleteDocument(doc.id, doc.storage_path);
        if (!res?.ok) {
            showAlert(res?.error?.message || 'The document could not be deleted. It has not been removed.', { type: 'error' });
            return false;
        }
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        await logActivity(user.id, 'update', `${customer.customer_name}: Deleted document (${doc.file_name})`, '', customer.id);
        fetchLogs();
        return true;
    };

    // Returns true/false so the remark rows can show the real outcome.
    const handleUpdateDocRemark = async (docId, newRemark) => {
        const res = await updateDocumentRemark(docId, newRemark);
        if (!res?.ok) {
            showAlert(res?.error?.message || 'The remark was not saved.', { type: 'error' });
            return false;
        }
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, remark: newRemark } : d));
        const fileName = documents.find(d => d.id === docId)?.file_name || 'Document';
        await logActivity(user.id, 'update', `${customer.customer_name}: Document remark update (${fileName}) - "${newRemark}"`, '', customer.id);
        fetchLogs();
        return true;
    };

    const isChecklistDirty = items => items.some(({ field }) => !!editData[field] !== !!customer[field]);

    const saveChecklist = async (items, title) => {
        const patch = {};
        const changes = [];
        items.forEach(({ field, label }) => {
            const oldCheck = !!customer[field];
            const newCheck = !!editData[field];
            if (oldCheck !== newCheck) {
                patch[field] = newCheck;
                changes.push(`${label}: ${oldCheck ? 'Checked' : 'Unchecked'} → ${newCheck ? 'Checked' : 'Unchecked'}`);
            }
        });
        // Never log a checklist change the database refused.
        if (await handleSectionUpdate(customer.id, patch) === false) return;
        if (changes.length > 0) {
            await logActivity(user.id, 'update', `${customer.customer_name}: ${title} update - ${changes.join(' | ')}`, '', customer.id);
        }
        fetchLogs();
    };

    useEffect(() => {
        setEditData(prev => {
            // On first mount or customer ID change, do a full reset
            if (!prev || prev.id !== customer.id) {
                prevCustomerRef.current = customer;
                return { ...customer };
            }
            // Accept a new server value only for fields the user has not changed locally.
            const merged = { ...prev };
            const prevCust = prevCustomerRef.current;
            for (const key of Object.keys(customer)) {
                const untouched = typeof prev[key] === 'object' && prev[key] !== null
                    ? stableStringify(prev[key]) === stableStringify(prevCust?.[key])
                    : prev[key] === prevCust?.[key];
                if (untouched || !(key in merged)) merged[key] = customer[key];
            }
            prevCustomerRef.current = customer;
            return merged;
        });
        fetchLogs();
    }, [customer, fetchLogs]);

    const handleSaveStageRemark = async (stageId) => {
        const targetStage = stageId || editData.stage;
        const currentRemark = getStageRemarkFromData(editData.stages_remarks, targetStage);
        const originalRemark = getStageRemarkFromData(customer.stages_remarks, targetStage);
        if (currentRemark === originalRemark) return;

        const updatedRemarks = { ...parseRemarks(customer.stages_remarks), [targetStage]: currentRemark };
        const appendText = `${stageLabel(targetStage)} (${formatDateTime(new Date())}): ${currentRemark.trim() || 'Remark cleared'}`;
        const updatedInternalRemarks = editData.internal_remarks ? `${editData.internal_remarks}\n${appendText}` : appendText;

        setEditData(prev => ({ ...prev, stages_remarks: updatedRemarks, internal_remarks: updatedInternalRemarks }));
        if (await handleSectionUpdate(customer.id, { stages_remarks: updatedRemarks, internal_remarks: updatedInternalRemarks }) === false) return;

        await logActivity(user.id, 'update', `${customer.customer_name}: Stage remark update for ${stageLabel(targetStage)} - "${currentRemark}"`, '', customer.id);
        fetchLogs();
    };

    const handleChange = (field, val) => {
        if (field === 'consumer_no') {
            val = String(val).replace(/[^0-9]/g, '');
        }
        if (field === 'driver_phone_number' || field === 'phone_number') {
            val = sanitizePhoneNumber(val);
        }
        handleEditDataChange(prev => ({ ...prev, [field]: val }));
    };

    // Extra fields live in custom_fields; an emptied field drops its key.
    const handleCustomFieldChange = (key, value) => {
        handleEditDataChange(prev => {
            const next = { ...(prev.custom_fields || {}) };
            if (isBlank(value)) delete next[key];
            else next[key] = value;
            return { ...prev, custom_fields: next };
        });
    };

    // Writes only the extra fields that changed (null removes one).
    const saveCustomFields = async (patch) => {
        if (!Object.keys(patch).length) return;
        const { error } = await supabase.rpc('merge_custom_fields', { p_customer_id: customer.id, p_values: patch });
        if (error) throw new Error(`The extra fields were not saved. ${error.message || ''}`.trim());
    };

    // Child tabs have their own Save buttons. Once one succeeds, merge only
    // that saved patch into the baseline and keep the form dirty solely for
    // any other fields that are still genuinely unsaved.
    const handleSectionUpdate = async (id, patch) => {
        const result = await onUpdate(id, patch);
        if (result === false) return false;
        savedDataRef.current = { ...savedDataRef.current, ...patch };
        handleEditDataChange(previous => ({ ...previous, ...patch }));
        return result;
    };

    // After a write, re-read what the server stored and use ITS updated_at as
    // the baseline: the client clock can drift, stored values are coerced
    // (numbers, jsonb key order), and the parent's copy lacks extra fields.
    const rebaseFromServer = async (sentPatch) => {
        const { data: savedRow } = await supabase.from('admin').select('*').eq('id', customer.id).maybeSingle();
        savedDataRef.current = savedRow ? { ...savedRow } : { ...savedDataRef.current, ...sentPatch };
        loadedUpdatedAtRef.current = savedRow?.updated_at || new Date().toISOString();
    };

    const nextStageId = getNextStageId(editData);
    const nextStageLabel = nextStageId ? stageLabel(nextStageId) : '';

    const saveBom = async () => {
        if (!saveBomRef.current) return;
        if (await saveBomRef.current() === false) throw new Error('The BOM could not be saved.');
    };

    const handleAdvanceStage = async (overrideNextStageId) => {
        const destStageId = overrideNextStageId || nextStageId;
        if (!destStageId) return;

        const missingRequirements = missingStageRequirements(editData.stage, editData);
        if (missingRequirements.length > 0) {
            setValidationIssues(missingRequirements);
            return;
        }

        setSaving(true);
        try {
            await saveBom();
        } catch (err) {
            console.error('Error saving BOM during stage advance:', err);
            setSaving(false);
            showAlert('Failed to save the Material Integration BOM, so the stage was not advanced: ' + (err.message || 'Unknown error'), { type: 'error' });
            return;
        }

        const oldStage = editData.stage;
        const updatedRemarks = { ...parseRemarks(editData.stages_remarks), [oldStage]: '' };
        const updates = withPlainNumbers({ ...editData, stage: destStageId, stages_remarks: updatedRemarks });

        if (destStageId === STAGE_IDS.LOST_PROJECT) {
            const prevHold = (typeof updates.hold_procurement === 'object' && updates.hold_procurement) ? updates.hold_procurement : {};
            updates.hold_procurement = {
                ...prevHold,
                previous_stage: (oldStage !== STAGE_IDS.LOST_PROJECT) ? oldStage : (prevHold.previous_stage || STAGE_IDS.LEADS),
                hold_date: todayIST()
            };
        }
        if (destStageId === STAGE_IDS.METER_INSTALLATION) {
            updates.meter_installation = normalizeMeterInstallation(updates.meter_installation) || 'No';
        }
        if (destStageId === STAGE_IDS.DISCOM_INSPECTION && !updates.discom_inspection) {
            updates.discom_inspection = 'No';
        }

        const cfPatch = customFieldPatch(updates.custom_fields, savedDataRef.current.custom_fields);
        const changeSummary = [
            ...primitiveChangeSummary(updates, customer, ['stage', 'stages_remarks']),
            ...customFieldLogLines(cfPatch, savedDataRef.current.custom_fields),
        ];

        // Send only what changed, plus the stage and its remarks, so a stale
        // copy never overwrites a colleague's edit.
        const narrowed = {};
        getChangedFields(updates, savedDataRef.current).forEach(key => { narrowed[key] = updates[key]; });
        delete narrowed.custom_fields;
        narrowed.stage = destStageId;
        narrowed.stages_remarks = updatedRemarks;

        setEditingSection(null);
        try {
            await saveCustomFields(cfPatch);
            const ok = await onUpdate(customer.id, narrowed);
            if (ok === false) throw new Error('The database did not accept the stage change.');

            await rebaseFromServer({ ...narrowed, custom_fields: updates.custom_fields });
            setEditData({ ...savedDataRef.current });
            setIsFormDirty(false);
            setActiveTab(destStageId);

            void logActivity(user.id, 'stage_change', `${customer.customer_name}: Stage changed`, `Stage: ${oldStage || 'Empty'} → ${destStageId}`, customer.id);
            if (changeSummary.length > 0) {
                void logActivity(user.id, 'update', `${customer.customer_name}: ${changeSummary.join(' | ')}`, '', customer.id);
            }
            void fetchLogs();
        } catch (err) {
            console.error('Stage advance failed:', err);
            showAlert(`The stage was NOT changed.\n\n${err.message || 'Unknown error'}`, { type: 'error' });
        }
        setSaving(false);
    };

    // ─── Move to Lost Project ────────────────────────────────────────────────
    // Records where the project was lost from (hold_procurement.previous_stage)
    // so Resume can return it there.
    const handleMoveToLostProject = async () => {
        const originStage = customer?.stage;
        if (!originStage) return;

        const confirmed = await showConfirm(
            `Move ${customer.customer_name || 'this customer'} to Lost Project?\n\n`
            + `Their current stage (${stageLabel(originStage)}) is recorded, so they can be resumed back to it later.`,
            { title: 'Move to Lost Project', confirmLabel: 'Move to Lost Project', cancelLabel: 'Cancel', type: 'warning' }
        );
        if (!confirmed) return;

        // Keep anything already stored (a previous hold's notes).
        let existing = {};
        const raw = editData.hold_procurement ?? customer.hold_procurement;
        if (raw) {
            try {
                existing = typeof raw === 'string' ? (JSON.parse(raw) || {}) : (raw || {});
            } catch { existing = {}; }
        }
        const payload = { ...existing, previous_stage: originStage, hold_date: todayIST() };

        const ok = await onUpdate(customer.id, { stage: STAGE_IDS.LOST_PROJECT, hold_procurement: payload });
        // onUpdate resolves false on failure and has already shown the error.
        if (ok === false) return;

        setEditData(prev => ({ ...prev, stage: STAGE_IDS.LOST_PROJECT, hold_procurement: payload }));
        // Re-base the conflict baseline so the next save does not see this write as a colleague's.
        savedDataRef.current = { ...savedDataRef.current, stage: STAGE_IDS.LOST_PROJECT, hold_procurement: payload };
        loadedUpdatedAtRef.current = new Date().toISOString();
        setActiveTab(STAGE_IDS.LOST_PROJECT);

        await logActivity(user.id, 'stage_change', `${customer.customer_name}: Stage changed`, `Stage: ${originStage || 'Empty'} → ${STAGE_IDS.LOST_PROJECT}`, customer.id);
        fetchLogs();
    };

    const handleSave = async (forceOverwrite = false, draft = editData) => {
        setSaving(true);
        try {
            await saveBom();
        } catch (err) {
            console.error('Error saving BOM during handleSave:', err);
            showAlert(`Your BOM was not saved. Please try again.\n\n${err.message || ''}`, { type: 'error' });
            setSaving(false);
            return false;
        }
        const updates = withPlainNumbers(draft);
        const baseline = savedDataRef.current;

        // A conflict is a field we and a colleague both changed, to different values.
        if (!forceOverwrite && customer?.id && loadedUpdatedAtRef.current) {
            try {
                const { data: serverRecord, error: checkErr } = await supabase.from('admin').select('*').eq('id', customer.id).single();
                if (!checkErr && serverRecord?.updated_at
                    && new Date(serverRecord.updated_at).getTime() > new Date(loadedUpdatedAtRef.current).getTime() + 1000) {
                    const remoteChanged = new Set(changedFieldNames(serverRecord, baseline));
                    const overlappingFields = changedFieldNames(updates, baseline)
                        .filter(name => remoteChanged.has(name) && !sameValue(readPath(serverRecord, name), readPath(updates, name)));
                    if (overlappingFields.length > 0) {
                        setSaving(false);
                        setConcurrentConflict({
                            serverData: serverRecord,
                            localUpdates: updates,
                            localChanges: overlappingFields,
                            remoteChanges: overlappingFields,
                            overlappingFields,
                            serverUpdatedAt: serverRecord.updated_at
                        });
                        return false;
                    }
                }
            } catch (concurrencyErr) {
                console.warn('Concurrency check warning:', concurrencyErr);
            }
        }

        const cfPatch = customFieldPatch(updates.custom_fields, baseline.custom_fields);
        const changeSummary = [
            ...primitiveChangeSummary(updates, customer),
            historyChanges(customer.subsidy_history || [], updates.subsidy_history || [], 'Subsidy'),
            historyChanges(customer.loan_history || [], updates.loan_history || [], 'Loan'),
            ...customFieldLogLines(cfPatch, baseline.custom_fields),
        ].filter(Boolean);

        // Saving is for drafts; requirements are only checked when moving stage.
        const stageChanged = draft.stage !== customer.stage;

        try {
            // Send only the fields this editor changed, so edits by two people
            // to different fields never overwrite each other.
            const narrowedUpdates = {};
            getChangedFields(updates, baseline).forEach(key => { narrowedUpdates[key] = updates[key]; });
            delete narrowedUpdates.custom_fields;
            if (updates.stage !== undefined && updates.stage !== baseline?.stage) {
                narrowedUpdates.stage = updates.stage;
            }

            if (Object.keys(narrowedUpdates).length === 0 && Object.keys(cfPatch).length === 0) {
                setEditingSection(null);
                setIsFormDirty(false);
                return true;
            }

            if (Object.keys(narrowedUpdates).length > 0 && await onUpdate(customer.id, narrowedUpdates) === false) {
                throw new Error('The database did not accept the changes.');
            }
            await saveCustomFields(cfPatch);

            if (changeSummary.length > 0) {
                await logActivity(user.id, 'update', `${customer.customer_name}: ${changeSummary.join(' | ')}`, '', customer.id);
            }
            // An admin may change the stage and use the regular Save.
            if (stageChanged) {
                await logActivity(user.id, 'stage_change', `${customer.customer_name}: Stage changed by admin override`,
                    `Stage: ${customer.stage || 'Empty'} → ${draft.stage || 'Empty'}`, customer.id);
            }

            await rebaseFromServer({ ...narrowedUpdates, custom_fields: updates.custom_fields });
            setConcurrentConflict(null);
            setEditingSection(null);
            setIsFormDirty(false);
            if (stageChanged) setActiveTab(draft.stage);
            void fetchLogs();
            return true;
        } catch (err) {
            console.error('Save failed:', err);
            showAlert(`Your changes were not saved. Please try again.\n\n${err.message || ''}`, { type: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleOverwriteConflict = async () => {
        setConcurrentConflict(null);
        return await handleSave(true);
    };

    // Take the colleague's record and re-apply only our own changes on top.
    const handleMergeAndSaveConflict = async () => {
        if (!concurrentConflict?.serverData) return;
        const serverRecord = concurrentConflict.serverData;
        const baseline = savedDataRef.current;
        const merged = { ...serverRecord };
        getChangedFields(editData, baseline).forEach(key => { if (key !== 'custom_fields') merged[key] = editData[key]; });
        const customFields = { ...(serverRecord.custom_fields || {}) };
        Object.entries(customFieldPatch(editData.custom_fields, baseline.custom_fields)).forEach(([key, value]) => {
            if (value === null) delete customFields[key];
            else customFields[key] = value;
        });
        merged.custom_fields = customFields;

        savedDataRef.current = { ...serverRecord };
        loadedUpdatedAtRef.current = serverRecord.updated_at;
        setEditData(merged);
        setConcurrentConflict(null);
        await handleSave(true, merged);
    };

    const handleDiscardAndReloadConflict = () => {
        if (!concurrentConflict?.serverData) return;
        const serverRecord = concurrentConflict.serverData;
        savedDataRef.current = { ...serverRecord };
        setEditData({ ...serverRecord });
        loadedUpdatedAtRef.current = serverRecord.updated_at;
        setIsFormDirty(false);
        setConcurrentConflict(null);
        showAlert('Reloaded latest data from server. Your unsaved edits were discarded.', { type: 'info' });
    };

    const handleAddNote = async () => {
        if (!followUpText.trim()) return;
        const updatedNotes = [...(editData.follow_ups || []), { text: followUpText, author: user.name, date: new Date().toISOString() }];
        // Keep the typed note when the save is refused.
        if (await handleSectionUpdate(customer.id, { follow_ups: updatedNotes }) === false) return;
        await logActivity(user.id, 'note', `Note Added: ${followUpText}`, '', customer.id);
        setFollowUpText('');
        fetchLogs();
    };

    const handleMoveToTrash = async () => {
        const confirmed = await showConfirm(
            `${customer.customer_name} will be moved to Trash. You can recover it later from the Trash view.`,
            { title: 'Move to Trash?', confirmLabel: 'Move to Trash', cancelLabel: 'Cancel', type: 'danger' }
        );
        if (!confirmed) return;
        await logActivity(user.id, 'delete', `Soft-deleted: ${customer.customer_name}`, '', customer.id);
        await onDelete(customer.id, new Date().toISOString());
        onClose();
    };

    const handleMoveClick = async () => {
        if (nextStageId === STAGE_IDS.COMPLETED) {
            const confirmed = await showConfirm(
                `Moving ${customer.customer_name} to Completed will lock this record. Only an admin will be able to unlock it for further edits. Do you want to proceed?`,
                { title: 'Mark as Completed?', confirmLabel: 'Proceed & Lock', cancelLabel: 'Cancel', type: 'warning' }
            );
            if (!confirmed) return;
        }
        handleAdvanceStage();
    };

    const confirmLeave = async (message, confirmLabel) => {
        if (!isFormDirty) return true;
        const shouldSave = await showConfirm(message, { title: 'Unsaved changes', confirmLabel, cancelLabel: 'Keep Editing', type: 'warning' });
        return shouldSave && await handleSave();
    };

    const tabProps = {
        activeTab, customer: savedDataRef.current, editData, setEditData: handleEditDataChange, handleChange,
        onCustomFieldChange: handleCustomFieldChange,
        isEditable, editingSection, setEditingSection, channel_partners, subAgents, isAdmin,
        canDeleteDocs, meta, user,
        isRegChecklistDirty: isChecklistDirty(REG_CHECKLIST_FIELDS),
        handleSaveRegChecklist: () => saveChecklist(REG_CHECKLIST_FIELDS, 'Registration checklist'),
        isOperationalChecklistDirty: isChecklistDirty(OPERATIONAL_CHECKLIST),
        handleSaveOperationalChecklist: () => saveChecklist(OPERATIONAL_CHECKLIST, 'Operational checklist'),
        documents,
        uploading,
        onFileUpload: handleTabUpload,
        onFileDelete: handleDeleteDoc,
        onFilePreview: handlePreviewDoc,
        onUpdateRemark: handleUpdateDocRemark,
        onUpdate: handleSectionUpdate, logActivity, fetchLogs, saving, setSaving, handleAdvanceStage,
        saveBomRef, onDirty: () => setIsFormDirty(true), onGenerateAgreement: () => handleGenerateAgreement(false),
        onAddAgreementToDocuments: () => handleGenerateAgreement(true),
        isInstallationDetailsEditable,
        isSfdcEditable: isEditable,
        onSfdcSaved: () => {
            if (isChannelPartnerManager) setIsFormDirty(false);
        }
    };

    const tabs = [
        ...PRIMARY_STAGES.filter(stage => !stage.terminal && isStageApplicable(stage, editData)).map(stage => ({ id: stage.id, label: stage.label, icon: stage.icon })),
        ...(isOn('documentUploads') ? [{ id: DOCUMENTS_TAB, label: 'Documents', icon: FolderOpen }] : []),
        { id: HISTORY_TAB, label: 'Notes & History', icon: History },
    ];
    const isStageTab = activeTab !== DOCUMENTS_TAB && activeTab !== HISTORY_TAB;
    const requirements = getStageRequirements(activeTab);
    const phone = customer.phone_number || editData.phone_number;
    const driveLink = customer.google_drive_link || editData.google_drive_link;
    const locationLink = customer.location_link || editData.location_link;

    return (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-none sm:rounded-[28px] shadow-2xl w-full max-w-5xl h-[100dvh] sm:h-[94vh] overflow-hidden flex flex-col border border-stone-100">

                {/* Header */}
                <div className="bg-stone-900 px-4 sm:px-6 py-3 sm:py-5 flex justify-between items-center flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-xl font-bold text-white">{customer.customer_name}</h2>
                            {phone && getTelephoneHref(phone) && (
                                <a
                                    href={getTelephoneHref(phone)}
                                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/60 hover:border-emerald-500 px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer group"
                                    title={`Click to call ${phone}`}
                                >
                                    <Phone size={12} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                                    <span>{phone}</span>
                                </a>
                            )}
                            {isCompleted && (
                                <span className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${isFrozen ? 'bg-stone-700 text-stone-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {isFrozen ? <><Lock size={9} /> Frozen</> : <><Unlock size={9} /> Unlocked</>}
                                </span>
                            )}
                            {driveLink && (
                                <a
                                    href={driveLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-blue-300 bg-blue-950/70 hover:bg-blue-900/80 border border-blue-700/60 hover:border-blue-500 px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer group"
                                    title={`Open Google Drive: ${driveLink}`}
                                >
                                    <HardDrive size={12} className="text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span>Google Drive</span>
                                    <ExternalLink size={10} className="text-blue-400 opacity-70" />
                                </a>
                            )}
                            {locationLink && (
                                <a
                                    href={locationLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/60 hover:border-emerald-500 px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer group"
                                    title={`Open Location Link: ${locationLink}`}
                                >
                                    <MapPin size={12} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                                    <span>Site Location</span>
                                    <ExternalLink size={10} className="text-emerald-400 opacity-70" />
                                </a>
                            )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mt-0.5">
                            {customer.created_at && (
                                <p className="text-[11px] text-stone-400 font-medium flex items-center gap-1.5">
                                    <Calendar size={11} className="text-stone-400 flex-shrink-0" />
                                    <span>Created: {formatStamp(customer.created_at)}</span>
                                </p>
                            )}
                            {customer.updated_at && customer.updated_at !== customer.created_at && (
                                <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1.5">
                                    <Clock size={11} className="text-amber-400 flex-shrink-0" />
                                    <span>Updated: {formatStamp(customer.updated_at)}</span>
                                </p>
                            )}
                            {customer.completed_at && (
                                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                                    <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />
                                    <span>Completed: {formatStamp(customer.completed_at)}</span>
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {canSwitchChecklistMode() && (
                            <div className="hidden sm:inline-flex rounded-xl bg-white/10 p-1 border border-white/10 mr-1" role="group" aria-label="Document mode">
                                {[
                                    { mode: 'checklist', label: 'Checklist', icon: CheckSquare, title: 'Checklist mode: tick items off without attaching a file' },
                                    { mode: 'files', label: 'Documents', icon: FolderOpen, title: 'Documents mode: upload the customer’s files and photos' },
                                ].map(option => (
                                    <button
                                        key={option.mode}
                                        type="button"
                                        onClick={() => setChecklistMode(option.mode)}
                                        aria-pressed={docChecklistMode === option.mode}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                            docChecklistMode === option.mode ? 'bg-amber-500 text-stone-900 shadow-sm' : 'text-stone-300 hover:text-white'
                                        }`}
                                        title={option.title}
                                    >
                                        <option.icon size={13} />
                                        <span>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Admin unlock/lock toggle for completed cards */}
                        {isCompleted && isAdmin && (
                            <button type="button" onClick={() => { setAdminUnlocked(prev => !prev); setEditingSection(null); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${adminUnlocked ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/30' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                                {adminUnlocked ? <><Lock size={12} /> Re-lock</> : <><Unlock size={12} /> Unlock to Edit</>}
                            </button>
                        )}
                        {isOn('trash') && isHeadOffice && onDelete && (
                            <button type="button" onClick={handleMoveToTrash} aria-label="Move to Trash" title="Move to Trash" className="p-2 text-white/30 hover:text-red-400"><Trash2 size={18} /></button>
                        )}
                        <button type="button" aria-label="Close" onClick={async () => {
                            if (await confirmLeave('You have unsaved changes. Save them before closing?', 'Save & Close')) onClose();
                        }} className="p-2 text-white/30 hover:text-white"><X size={24} /></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="relative bg-stone-900 border-t border-white/5 flex-shrink-0">
                    <div className="flex gap-6 overflow-x-auto scrollbar-none whitespace-nowrap px-4 sm:px-6 scroll-smooth" role="tablist">
                        {tabs.map(tab => (
                            <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={async () => {
                                if (tab.id !== activeTab && !await confirmLeave('You have unsaved changes. Save them before continuing?', 'Save & Continue')) return;
                                setActiveTab(tab.id); setEditingSection(null);
                            }}
                                className={`flex items-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 flex-shrink-0 ${activeTab === tab.id ? 'text-amber-400 border-amber-400' : 'text-stone-500 border-transparent hover:text-stone-300'}`}>
                                {tab.icon && <tab.icon size={12} />} {tab.label}
                            </button>
                        ))}
                    </div>
                    {/* Fade hinting that more tabs scroll into view */}
                    <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-stone-900/90" />
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 bg-[#FCFBFA]">

                    {/* Frozen banner for completed cards */}
                    {isCompleted && isFrozen && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-6 border bg-stone-100 border-stone-200">
                            <Lock className="w-4 h-4 text-stone-500 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs font-bold text-stone-600">This project is completed & frozen</p>
                                <p className="text-[10px] text-stone-400">{isAdmin ? 'Click "Unlock to Edit" in the header to make changes' : 'Only an admin can unlock this record for editing'}</p>
                            </div>
                        </div>
                    )}
                    {isCompleted && !isFrozen && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-6 border bg-amber-50 border-amber-200">
                            <Unlock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs font-bold text-amber-700">Admin edit mode - Record unlocked</p>
                                <p className="text-[10px] text-amber-500">Click "Re-lock" when done to freeze the record again</p>
                            </div>
                        </div>
                    )}

                    {isStageRestrictedForUser && (
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl mb-6 border bg-amber-50/70 border-amber-200/80 text-amber-950">
                            <Eye className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs font-bold text-amber-900">View-Only Stage</p>
                                <p className="text-[10px] text-amber-700 font-medium">Partner office accounts can view Material Integration and Material Delivery but not change them.</p>
                            </div>
                        </div>
                    )}

                    {activeTab !== HISTORY_TAB && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            {/* Primary Stage Info */}
                            <div className={`p-4 rounded-2xl border shadow-sm ${isCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-stone-100'} flex flex-col justify-between`}>
                                <div>
                                    <p className="text-[9px] text-stone-400 font-bold uppercase mb-2">Primary Stage</p>
                                    <div className="flex items-center gap-3 min-h-[38px]">
                                        <div className="text-xs text-stone-850 font-bold px-3 py-1.5 bg-stone-50 border border-stone-100 rounded-xl flex items-center gap-1.5">
                                            {stageLabel(editData.stage)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Stage Remark */}
                            <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm flex flex-col justify-between">
                                <div>
                                    <label htmlFor="stage-remark" className="text-[9px] text-stone-400 font-bold uppercase mb-2 block">Stage Remark (Current Stage)</label>
                                    {!canAddRemark ? (
                                        <div className="text-xs text-stone-500 font-medium italic min-h-[38px] bg-stone-50 p-2 rounded-lg">
                                            {getStageRemarkFromData(editData.stages_remarks, editData.stage) || 'No remarks for this stage.'}
                                        </div>
                                    ) : (() => {
                                        const curRemark = getStageRemarkFromData(editData.stages_remarks, editData.stage);
                                        const origRemark = getStageRemarkFromData(customer.stages_remarks, customer.stage);
                                        const isRemarkDirty = (curRemark || '').trim() !== (origRemark || '').trim();
                                        return (
                                            <div className="flex gap-2">
                                                <input
                                                    id="stage-remark"
                                                    type="text"
                                                    placeholder="Add remark for current stage..."
                                                    value={curRemark}
                                                    onChange={e => {
                                                        const newVal = e.target.value;
                                                        setEditData(prev => ({ ...prev, stages_remarks: { ...parseRemarks(prev.stages_remarks), [prev.stage]: newVal } }));
                                                    }}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveStageRemark()}
                                                    className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveStageRemark()}
                                                    disabled={!isRemarkDirty}
                                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                                                        !isRemarkDirty
                                                            ? 'bg-emerald-600 text-white cursor-default'
                                                            : 'bg-stone-900 text-white hover:bg-stone-800 cursor-pointer'
                                                    }`}
                                                >
                                                    {!isRemarkDirty ? 'Saved' : 'Save'}
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {requirements.length > 0 && (
                        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 mb-4 text-xs text-teal-900">
                            <strong>Needed to move on: </strong>{requirements.map(([, label]) => label).join(' · ')}. Other fields and all photos are optional.
                        </div>
                    )}

                    {isStageTab && <CustomerModalTabsRouter {...tabProps} />}

                    {activeTab === DOCUMENTS_TAB && (
                        <LazyBoundary fallback={<LoadingState />}>
                            <CustomerDocumentsTab
                                documents={documents}
                                isEditable={isEditable}
                                canDelete={canDeleteDocs}
                                uploading={uploading}
                                handleFileUpload={handleFileUpload}
                                getDocTypeLabel={getDocTypeLabel}
                                handlePreviewDoc={handlePreviewDoc}
                                handleDeleteDoc={handleDeleteDoc}
                                handleUpdateDocRemark={handleUpdateDocRemark}
                                handleDownloadAllDocuments={handleDownloadAllDocuments}
                                downloadingAllDocuments={downloadingAllDocuments}
                                canDownloadAllDocuments={canDownloadAllDocuments}
                            />
                        </LazyBoundary>
                    )}

                    {activeTab === HISTORY_TAB && (
                        <LazyBoundary fallback={<LoadingState />}>
                            <HistoryTab
                                editData={editData}
                                handleChange={handleChange}
                                isEditable={isEditable}
                                editingSection={editingSection}
                                setEditingSection={setEditingSection}
                                followUpText={followUpText}
                                setFollowUpText={setFollowUpText}
                                handleAddNote={handleAddNote}
                                activityLogs={activityLogs}
                            />
                        </LazyBoundary>
                    )}

                    {isEditable && isStageTab && activeTab !== STAGE_IDS.LOST_PROJECT && customer.stage !== STAGE_IDS.COMPLETED && (
                        <div className="mt-8 pt-4 border-t border-stone-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/70 p-3.5 rounded-2xl border border-stone-200/60">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg flex-shrink-0">
                                    <PauseCircle size={16} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-stone-700">Pause or stop this project?</p>
                                    <p className="text-[11px] text-stone-500 font-medium">Paused projects go to {stageLabel(STAGE_IDS.LOST_PROJECT)}. Their previous stage is saved so they can resume later.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleMoveToLostProject}
                                className="px-3.5 py-2 min-h-11 bg-white hover:bg-stone-100 text-stone-700 rounded-xl text-xs font-bold border border-stone-200 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                            >
                                Pause / Move to {stageLabel(STAGE_IDS.LOST_PROJECT)}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer: Save and, on the customer's current stage, Save & Move */}
                {isEditable && activeTab !== STAGE_IDS.LOST_PROJECT && (
                    <div className="p-4 border-t border-stone-100 bg-white flex-shrink-0 flex gap-3">
                        <button
                            type="button"
                            // Not onClick={handleSave}: the click event would arrive as forceOverwrite and skip the conflict check.
                            onClick={() => handleSave()}
                            disabled={saving}
                            className={`flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs cursor-pointer shadow-sm disabled:opacity-50 ${
                                isFormDirty
                                    ? 'bg-stone-900 text-white hover:bg-stone-800'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                        >
                            {saving ? 'Saving...' : isFormDirty ? (
                                <><Save size={14} /><span>Save</span></>
                            ) : (
                                <><Check size={14} className="text-white" /><span>Saved</span></>
                            )}
                        </button>

                        {nextStageId && activeTab === customer.stage && (
                            <button
                                type="button"
                                onClick={handleMoveClick}
                                disabled={saving}
                                className="flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Saving & Moving...' : `Save & Move to ${nextStageLabel}`}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <Modal
                open={Boolean(validationIssues)}
                onClose={() => setValidationIssues(null)}
                title="A few details need attention"
                size="sm"
                footer={<button type="button" onClick={() => setValidationIssues(null)} className="sf-btn-secondary min-h-11">Review</button>}
            >
                <p className="text-sm font-medium leading-relaxed text-stone-600">
                    Complete the required items below before moving this customer to <span className="font-bold text-stone-800">{nextStageLabel}</span>.
                </p>
                <ul className="mt-4 space-y-2.5" role="alert">
                    {(validationIssues || []).map(issue => (
                        <li key={issue} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">
                            <AlertTriangle size={16} className="flex-none text-rose-500" aria-hidden="true" />
                            <span>{issue}</span>
                        </li>
                    ))}
                </ul>
            </Modal>

            {agreement && (
                <LazyBoundary fallback={null}>
                    <AgreementPreview
                        data={agreement.data}
                        onChange={data => setAgreement(prev => ({ ...prev, data: typeof data === 'function' ? data(prev.data) : data }))}
                        onClose={() => setAgreement(null)}
                        existingDocument={documents.some(doc => doc?.doc_type === 'discom_agreement')}
                        autoAdd={agreement.autoAdd}
                        onAddToDocuments={async (file) => {
                            const replacing = documents.some(doc => doc?.doc_type === 'discom_agreement');
                            const uploaded = await storeDocument(file, 'discom_agreement', { replaceExisting: true });
                            if (uploaded) {
                                setAgreement(null);
                                showAlert(
                                    replacing
                                        ? 'The DISCOM agreement was regenerated and replaced in Documents.'
                                        : 'The DISCOM agreement was generated and added to Documents.',
                                    { title: 'Document saved', type: 'success' }
                                );
                            }
                        }}
                    />
                </LazyBoundary>
            )}

            {filePreview.doc && (
                <FilePreviewModal
                    file={filePreview.doc}
                    fileUrl={filePreview.url}
                    onClose={() => setFilePreview({ doc: null, url: null })}
                    onDownload={() => handleDownloadDoc(filePreview.doc)}
                    onUpdateRemark={handleUpdateDocRemark}
                />
            )}

            <ConflictResolutionModal
                isOpen={Boolean(concurrentConflict)}
                conflict={concurrentConflict}
                onOverwrite={handleOverwriteConflict}
                onMergeAndSave={handleMergeAndSaveConflict}
                onDiscardAndReload={handleDiscardAndReloadConflict}
                onClose={() => setConcurrentConflict(null)}
            />
        </div>
    );
}
