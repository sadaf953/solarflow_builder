import {missingStageRequirements,stageRequirements} from '../demo/stageRequirements';
// ─── CustomerDetailModal.jsx ──────────────────────────────────────────────────
// Full customer detail: 4-tab layout (Overview, Finance & Bank, Checklist,
// Notes & History). Section-level editing, payments array editor, generic
// history entry editor, financial tag toggle, and system activity timeline.
//
// CLIENT CUSTOMISATION:
//   • Sections and fields: edit the <section> blocks in the Overview/Finance tabs
//   • Checklist template: edit DEFAULT_PROJECT_CHECKLIST in models.jsx
//   • Stage/tag options: edit constants.js
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Edit3, Trash2, Save, Send, AlertTriangle, CheckSquare,
    User, Zap, IndianRupee, Building2, FolderOpen, MapPin,
    LayoutDashboard, History, Plus, ShieldCheck, Lock, Unlock, ClipboardList, Banknote, Tag, Mail, PauseCircle, Check, CheckCircle2,
    Eye, Search, Image as ImageIcon, MessageSquare, Calendar, Phone, Clock, HardDrive, ExternalLink
} from 'lucide-react';
import { PRIMARY_STAGES, STAGE_IDS, SUBSIDY_TAGS, SUBSIDY_TAG_COLORS, LOAN_TAGS, LOAN_TAG_COLORS, ROOF_BOM_TEMPLATE, SHED_BOM_TEMPLATE, DOC_TYPE_LABELS, DOC_TYPE_FLAG_COLUMN } from '../constants';
import { logActivity, formatDateToDDMMYYYY, formatINR, parseIndianNumber, fetchAgent2SubAgents, normalizeMeterInstallation, sanitizePhoneNumber, getTelephoneHref } from '../utils';
import { supabase } from '../supabase';
import HistoryEntryEditor from './HistoryEntryEditor';
import { AgreementPreview } from './agreement/AgreementPreview';
import { Page1 } from './agreement/Page1';
import { FileText, Printer } from 'lucide-react';
import { uploadDocument, getCustomerDocuments, getDownloadUrl, getViewUrl, deleteDocument, updateDocumentRemark, downloadFileWithSaveAs, downloadDocumentsAsPdf } from '../utils';

const getDocTypeLabel = (type) => {
    if (!type) return 'Client Attachment';
    if (DOC_TYPE_LABELS[type]) return DOC_TYPE_LABELS[type];
    return String(type).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

import CustomerModalTabsRouter from './CustomerModalTabsRouter';
import LeadsTab from './modal-tabs/LeadsTab';
import RegistrationTab from './modal-tabs/RegistrationTab';
import LoanTab from './modal-tabs/LoanTab';
import CashTab from './modal-tabs/CashTab';
import MaterialOrderTab from './modal-tabs/MaterialOrderTab';
import MaterialIntegrationTab from './modal-tabs/MaterialIntegrationTab';
import HoldProcurementTab from './modal-tabs/HoldProcurementTab';
import MaterialDeliveryTab from './modal-tabs/MaterialDeliveryTab';
import InstallationStatusTab from './modal-tabs/InstallationStatusTab';
import GeoTagPhotoTab from './modal-tabs/GeoTagPhotoTab';
import DiscomSubmissionTab from './modal-tabs/DiscomSubmissionTab';
import MeterInstallationTab from './modal-tabs/MeterInstallationTab';
import DiscomInspectionTab from './modal-tabs/DiscomInspectionTab';
import SubsidyStatusTab from './modal-tabs/SubsidyStatusTab';
import FinalReviewTab from './modal-tabs/FinalReviewTab';
import HistoryTab from './modal-tabs/HistoryTab';
import CustomerDocumentsTab from './modal-tabs/CustomerDocumentsTab';
import { FilePreviewModal, DocGalleryRemarkRow, getStageRemarkFromData, getChecklistMode, setChecklistMode } from './modal-tabs/shared';
import { useGlobalPopup } from './GlobalPopup';
import ConflictResolutionModal from './ConflictResolutionModal';
import { normalizeInstallationStatus } from '../utils';

// ─── formatMoney: uses centralized Indian comma system from utils ─────────────
const fmt = formatINR;

// ─── formatDateTime: helper to format date as "04 Aug, 11:01 PM" ──────────────
const formatDateTime = (date) => {
    if (!date) return '–';
    const dObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dObj.getTime())) return String(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = dObj.getDate().toString().padStart(2, '0');
    const m = months[dObj.getMonth()];
    let hours = dObj.getHours();
    const minutes = dObj.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const h = hours.toString().padStart(2, '0');
    return `${d} ${m}, ${h}:${minutes} ${ampm}`;
};


// ─── Subsidy status options ───────────────────────────────────────────────────

const getChangedFields = (draft = {}, saved = {}) => {
    const changed = new Set();
    const ignoreKeys = new Set(['id', 'created_at', 'updated_at', 'crn']);
    const keys = new Set([...Object.keys(saved || {}), ...Object.keys(draft || {})]);

    keys.forEach(key => {
        if (ignoreKeys.has(key)) return;
        const draftValue = draft?.[key];
        const savedValue = saved?.[key];
        if (typeof draftValue === 'boolean' || typeof savedValue === 'boolean') {
            if (Boolean(draftValue) !== Boolean(savedValue)) changed.add(key);
            return;
        }
        const draftEmpty = draftValue === undefined || draftValue === null || draftValue === '';
        const savedEmpty = savedValue === undefined || savedValue === null || savedValue === '';
        if (draftEmpty && savedEmpty) return;
        if (typeof draftValue === 'object' || typeof savedValue === 'object') {
            if (JSON.stringify(draftValue ?? null) !== JSON.stringify(savedValue ?? null)) changed.add(key);
            return;
        }
        if (String(draftValue ?? '').trim() !== String(savedValue ?? '').trim()) changed.add(key);
    });

    return changed;
};

// ─── CustomerDetailModal ──────────────────────────────────────────────────────
export default function CustomerDetailModal({ customer, onClose, onUpdate, onDelete, user, meta, channel_partners = [], defaultTab }) {
    const { showAlert, showConfirm, showImageCropper } = useGlobalPopup();
    const [activeTab, setActiveTab] = useState(() => {
        if (customer?._autoPrintBom) return STAGE_IDS.MATERIAL_INTEGRATION;
        if (defaultTab) return defaultTab;
        
        // Force completed customers to open on the LEADS tab by default
        if ((customer?.stage || '').trim().toUpperCase() === STAGE_IDS.COMPLETED) return STAGE_IDS.LEADS;
        
        if (typeof window !== 'undefined') {
            const saved = window.sessionStorage.getItem('solarflow_modal_active_tab');
            if (saved) return saved;
        }
        return customer?.stage || STAGE_IDS.LEADS;
    });
    useEffect(() => {
        if (customer?._autoPrintBom) {
            setActiveTab(STAGE_IDS.MATERIAL_INTEGRATION);
        } else if (defaultTab) {
            setActiveTab(defaultTab === STAGE_IDS.COMPLETED ? STAGE_IDS.LEADS : defaultTab);
        }
    }, [defaultTab, customer?.id, customer?._autoPrintBom]);
    const [editingSection, setEditingSection] = useState(null);
    const [isFormDirty, setIsFormDirty] = useState(false);
    const [editData, setEditData] = useState({ ...customer });
    const savedDataRef = useRef({ ...customer });
    const loadedUpdatedAtRef = useRef(customer?.updated_at || null);
    const [concurrentConflict, setConcurrentConflict] = useState(null);
    const [remoteUpdateAlert, setRemoteUpdateAlert] = useState(false);
    // TEMPORARILY DISABLED for the launch (2026-08-30).
    // The "a colleague just saved changes" banner was firing for single editors.
    // Three causes were fixed (client-clock baseline, pre-coercion baseline, and
    // realtime echoing our own writes) but that work is not yet proven in
    // production, so the banner stays hidden rather than alarming users.
    // The realtime SYNC below still runs - only the banner is suppressed.
    // Flip to true to re-enable once the fixes have been verified live.
    const SHOW_REMOTE_UPDATE_ALERT = false;
    // Realtime fires for EVERY update to this row, our own included. Stamp the
    // time of our own writes so the echo is not reported to the user as
    // "a colleague updated this record".
    const lastSelfWriteRef = useRef(0);
    const [subAgents, setSubAgents] = useState([]);
    const [docChecklistMode, setDocChecklistMode] = useState(() => getChecklistMode());

    useEffect(() => {
        const handleModeChange = (e) => {
            if (e.detail?.mode) setDocChecklistMode(e.detail.mode);
        };
        window.addEventListener('solarflow-checklist-mode-changed', handleModeChange);
        return () => window.removeEventListener('solarflow-checklist-mode-changed', handleModeChange);
    }, []);

    useEffect(() => {
        const managerBranch = user?.userType === 'office2' ? user?.channel_partner : '';
        const branch = (managerBranch || editData.channel_partner || customer.channel_partner || '').trim();
        if (!branch) { setSubAgents([]); return; }
        let cancelled = false;
        fetchAgent2SubAgents(branch).then(names => { if (!cancelled) setSubAgents(names); });
        return () => { cancelled = true; };
    }, [editData.channel_partner, customer.channel_partner, user?.userType, user?.channel_partner]);

    useEffect(() => {
        if (typeof window !== 'undefined' && activeTab) {
            window.sessionStorage.setItem('solarflow_modal_active_tab', activeTab);
        }
    }, [activeTab]);

    // Prevent any scenario where the active tab becomes COMPLETED or CUSTOMER_CARD (since they were removed from the nav)
    // We allow LOST PROJECT because there is an explicit "Move to Lost Project" button that needs to open it.
    useEffect(() => {
        if (activeTab === STAGE_IDS.COMPLETED || activeTab === 'CUSTOMER_CARD') {
            setActiveTab(STAGE_IDS.LEADS);
        }
    }, [activeTab]);


    const handleEditDataChange = (updater) => {
        setEditData(previous => {
            const next = typeof updater === 'function' ? updater(previous) : updater;
            setIsFormDirty(getChangedFields(next, savedDataRef.current).size > 0);
            return next;
        });
    };

    // Realtime watch for concurrent updates to this specific customer
    useEffect(() => {
        if (!customer?.id || String(customer.id).startsWith('demo-')) return;
        
        const channel = supabase.channel(`customer_modal_concurrency_${customer.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'admin',
                filter: `id=eq.${customer.id}`
            }, (payload) => {
                if (payload.new) {
                    const serverRecord = payload.new;
                    // Our own save echoes back here. Without this test the user
                    // was told a colleague had edited the record they had just
                    // saved themselves.
                    const isOwnWrite =
                        (serverRecord.updated_at && serverRecord.updated_at === loadedUpdatedAtRef.current) ||
                        (Date.now() - lastSelfWriteRef.current) < 5000;

                    if (!isFormDirty) {
                        loadedUpdatedAtRef.current = serverRecord.updated_at || loadedUpdatedAtRef.current;
                        savedDataRef.current = { ...serverRecord };
                        setEditData({ ...serverRecord });
                        setRemoteUpdateAlert(false);
                    } else if (!isOwnWrite) {
                        // A colleague changed the record while we have unsaved edits.
                        setRemoteUpdateAlert(true);
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [customer?.id, isFormDirty]);

    // Keep editData in sync with realtime prop updates if the user isn't currently editing
    useEffect(() => {
        if (!isFormDirty && customer) {
            loadedUpdatedAtRef.current = customer.updated_at || loadedUpdatedAtRef.current;
            savedDataRef.current = { ...customer };
            setEditData({ ...customer });
        }
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
    const [sendingInfo, setSendingInfo] = useState(false);
    const [infoSentStatus, setInfoSentStatus] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [validationError, setValidationError] = useState(null);
    const [validationIssues, setValidationIssues] = useState([]);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [showCompletedConfirm, setShowCompletedConfirm] = useState(false);
    const [activityLogs, setActivityLogs] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [docSearchQuery, setDocSearchQuery] = useState('');
    const [uploading, setUploading] = useState(false);
    const [filePreview, setFilePreview] = useState({ doc: null, url: null });
    const isAdmin = user?.userType === 'admin';
    const isCompleted = customer.stage === STAGE_IDS.COMPLETED;
    const [adminUnlocked, setAdminUnlocked] = useState(false);
    // Frozen for ALL users when completed. Admin can temporarily unlock.
    const isFrozen = isCompleted && !(isAdmin && adminUnlocked);
    const isAgent = user?.userType === 'agent';
    const isSales = user?.userType === 'sales';
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office';
    const isChannelPartnerManager = user?.userType === 'office2';
    const isChannelPartnerOfficeOrManager = isChannelPartnerOffice || isChannelPartnerManager;
    const isOffice = (user?.userType === 'sales' || user?.role?.toLowerCase().includes('office')) && !isChannelPartnerOfficeOrManager;
    const canDeleteDocs = isAdmin || isOffice;

    const isDiscomOrMeterStage = editData.stage === STAGE_IDS.DISCOM_SUBMISSION || editData.stage === STAGE_IDS.METER_INSTALLATION;

    const canUserEdit = (() => {
        if (isAdmin || isChannelPartnerOffice || isChannelPartnerManager || isOffice || isSales) return true;
        if (user?.role?.toLowerCase().includes('office') || user?.role?.toLowerCase().includes('admin') || user?.role?.toLowerCase().includes('sales')) return true;
        if (isAgent) {
            // Agent can edit if it's their client AND in DISCOM SUBMISSION or METER INSTALLATION stage
            const isMyClient = (customer.channel_partner || '').trim().toLowerCase() === (user.name || '').trim().toLowerCase();
            return isMyClient && isDiscomOrMeterStage;
        }
        // In main Dashboard, all staff members (except external vendor/stamp portals) can edit
        if (user?.userType !== 'vendor' && user?.userType !== 'stamp') return true;
        return false;
    })();

    // Channel Partner Office and Channel Partner Manager cannot edit Material Integration and Material Delivery (View only)
    const isStageRestrictedForUser = isChannelPartnerOfficeOrManager && (activeTab === STAGE_IDS.MATERIAL_INTEGRATION || activeTab === STAGE_IDS.MATERIAL_DELIVERY);

    const isEditable = !isFrozen && canUserEdit && !isStageRestrictedForUser;
    // Sales and Office can always add remarks and edit fields
    const canAddRemark = isEditable || !isFrozen;
    // CPO Manager can update only the SFDC Photo checklist in Installation
    // Status. All other installation status/details remain view-only.
    const isInstallationDetailsEditable = isEditable && !isChannelPartnerManager;

    // Fetch full customer record in background if opened from lightweight views (Subsidy, Loan, Installation)
    useEffect(() => {
        if (!customer?.id || String(customer.id).startsWith('demo-')) return;
        supabase.from('admin').select('*').eq('id', customer.id).single().then(({ data }) => {
            if (data) {
                loadedUpdatedAtRef.current = data.updated_at || loadedUpdatedAtRef.current;
                savedDataRef.current = { ...data };
                setEditData(prev => {
                    if (isFormDirty) {
                        return { ...data, ...prev };
                    }
                    return { ...data };
                });
            }
        });
    }, [customer?.id, isFormDirty]);

    const saveBomRef = useRef(null);
    const prevCustomerRef = useRef(customer);
    const [showAgreementPopup, setShowAgreementPopup] = useState(false);
    const [agreementAutoAdd, setAgreementAutoAdd] = useState(false);
    const [agreementData, setAgreementData] = useState({
        executionDate: '',
        consumerName: '',
        consumerNo: '',
        village: '',
        taluka: '',
        district: '',
        vendorName: 'SolarFlow Demo Energy',
        vendorAddress: '100 Demo Avenue, Sample City (fictional)',
        paymentTerms: 'Mutually Agreed Terms of Payment',
        firstPartySignature: '',
        secondPartyStamp: '',
        secondPartySignature: '',
        highlightColor: '#fef08a',
        showHighlights: true,
    });

    useEffect(() => {
        if (showAgreementPopup) {
            const rawDate = editData.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0];
            const formattedDate = formatDateToDDMMYYYY(rawDate);

            // Find signature and stamp documents
            const sigDoc = documents.find(d => 
                d.doc_type === 'signature_pic' || 
                d.doc_type === 'signature' || 
                d.doc_type === 'firstPartySignature' || 
                d.doc_type === 'customer_signature'
            );
            const stampDoc = documents.find(d => 
                d.doc_type === 'stamp' || 
                d.doc_type === 'stamp_pic' || 
                d.doc_type === 'vendor_stamp' || 
                d.doc_type === 'secondPartyStamp'
            );
            const gpaStampDoc = documents.find(d => 
                d.doc_type === 'pm_surya_ghar_stamp' || 
                d.doc_type === 'surya_ghar_stamp' || 
                d.doc_type === 'ghar_stamp'
            );

            const initialSigUrl = sigDoc ? (urlCacheRef.current[sigDoc.storage_path] || '') : '';
            const initialStampUrl = stampDoc ? (urlCacheRef.current[stampDoc.storage_path] || '') : '';
            const initialGpaStampUrl = gpaStampDoc ? (urlCacheRef.current[gpaStampDoc.storage_path] || '') : '';

            setAgreementData({
                executionDate: formattedDate,
                consumerName: editData.customer_name || '',
                consumerNo: editData.consumer_no || '',
                village: editData.villages || '',
                taluka: editData.sub_divisions || '',
                district: editData.district || '',
                vendorName: 'SolarFlow Demo Energy',
                vendorAddress: '100 Demo Avenue, Sample City (fictional)',
                paymentTerms: 'Mutually Agreed Terms of Payment',
                firstPartySignature: initialSigUrl,
                secondPartyStamp: initialStampUrl || '',
                secondPartySignature: '',
                signatureUrl: initialSigUrl,
                stampUrl: initialStampUrl || '',
                gpaStampUrl: initialGpaStampUrl,
                highlightColor: '#fef08a',
                showHighlights: true,
            });

            // If not yet in cache, fetch and update state
            if (sigDoc && !initialSigUrl) {
                getViewUrl(sigDoc.storage_path).then(url => {
                    if (url) {
                        urlCacheRef.current[sigDoc.storage_path] = url;
                        setAgreementData(prev => ({
                            ...prev,
                            firstPartySignature: url,
                            signatureUrl: url,
                        }));
                    }
                });
            }

            if (stampDoc && !initialStampUrl) {
                getViewUrl(stampDoc.storage_path).then(url => {
                    if (url) {
                        urlCacheRef.current[stampDoc.storage_path] = url;
                        setAgreementData(prev => ({
                            ...prev,
                            secondPartyStamp: url,
                            stampUrl: url,
                        }));
                    }
                });
            }

            if (gpaStampDoc && !initialGpaStampUrl) {
                getViewUrl(gpaStampDoc.storage_path).then(url => {
                    if (url) {
                        urlCacheRef.current[gpaStampDoc.storage_path] = url;
                        setAgreementData(prev => ({
                            ...prev,
                            gpaStampUrl: url,
                        }));
                    }
                });
            }
        }
    }, [showAgreementPopup, editData, documents]);

    const handleGenerateAgreement = async (addToDocuments = false) => {
        const requiredFields = [
            ['Consumer Name', editData.customer_name, 'Leads'],
            ['Consumer No', editData.consumer_no, 'Leads'],
            ['Village', editData.villages, 'Leads'],
            ['Taluka / Sub Division', editData.sub_divisions, 'Leads'],
            ['District', editData.district, 'Leads'],
            ['Agreement Execution Date', editData.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0], 'DISCOM Submission'],
        ];
        const missing = requiredFields.filter(([, value]) => !String(value || '').trim());
        if (missing.length) {
            showAlert(`Please fill these values first:\n\n${missing.map(([field, , tab]) => `• ${field} - ${tab} tab`).join('\n')}`, {
                title: 'Agreement is incomplete',
                type: 'warning'
            });
            return;
        }

        // Find signature, stamp and GPAE stamp documents
        const sigDoc = documents.find(d => 
            d.doc_type === 'signature_pic' || 
            d.doc_type === 'signature' || 
            d.doc_type === 'firstPartySignature' || 
            d.doc_type === 'customer_signature'
        );
        const stampDoc = documents.find(d => 
            d.doc_type === 'stamp' || 
            d.doc_type === 'stamp_pic' || 
            d.doc_type === 'vendor_stamp' || 
            d.doc_type === 'secondPartyStamp'
        );
        const gpaStampDoc = documents.find(d => 
            d.doc_type === 'pm_surya_ghar_stamp' || 
            d.doc_type === 'surya_ghar_stamp' || 
            d.doc_type === 'ghar_stamp'
        );

        let sigUrl = sigDoc ? (urlCacheRef.current[sigDoc.storage_path] || await getViewUrl(sigDoc.storage_path)) : '';
        let stampUrl = stampDoc ? (urlCacheRef.current[stampDoc.storage_path] || await getViewUrl(stampDoc.storage_path)) : '';
        let gpaStampUrl = gpaStampDoc ? (urlCacheRef.current[gpaStampDoc.storage_path] || await getViewUrl(gpaStampDoc.storage_path)) : '';

        if (sigDoc && sigUrl) urlCacheRef.current[sigDoc.storage_path] = sigUrl;
        if (stampDoc && stampUrl) urlCacheRef.current[stampDoc.storage_path] = stampUrl;
        if (gpaStampDoc && gpaStampUrl) urlCacheRef.current[gpaStampDoc.storage_path] = gpaStampUrl;

        const rawDate = editData.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0];
        const formattedDate = formatDateToDDMMYYYY(rawDate);

        setAgreementData({
            executionDate: formattedDate,
            consumerName: editData.customer_name || '',
            consumerNo: editData.consumer_no || '',
            village: editData.villages || '',
            taluka: editData.sub_divisions || '',
            district: editData.district || '',
            vendorName: 'SolarFlow Demo Energy',
            vendorAddress: '100 Demo Avenue, Sample City (fictional)',
            paymentTerms: 'Mutually Agreed Terms of Payment',
            firstPartySignature: sigUrl || '',
            secondPartyStamp: stampUrl || '',
            secondPartySignature: '',
            signatureUrl: sigUrl || '',
            stampUrl: stampUrl || '',
            gpaStampUrl: gpaStampUrl || '',
            highlightColor: '#fef08a',
            showHighlights: true,
        });

        setAgreementAutoAdd(addToDocuments);
        setShowAgreementPopup(true);
    };
    const ACTION_COLORS = {
        create: 'bg-emerald-100 text-emerald-700', update: 'bg-blue-100 text-blue-700',
        delete: 'bg-rose-100 text-rose-700', stage_change: 'bg-amber-100 text-amber-700',
        note: 'bg-indigo-100 text-indigo-700',
    };

    const fetchLogs = useCallback(async () => {
        const { data } = await supabase.from('activity_log').select('*, profiles(name)')
            .or(`new_value.eq.${customer.id},message.ilike.%${customer.customer_name}%`)
            .order('created_at', { ascending: false }).limit(25);
        if (data) setActivityLogs(data);
    }, [customer.id, customer.customer_name]);

    const urlCacheRef = useRef({});

    useEffect(() => {
        if (customer?.id) {
            getCustomerDocuments(customer.id).then(docs => {
                setDocuments(docs);
            });
        }
    }, [customer?.id]);

    const handleFileUpload = async (e, docType = null, replacingDocId = null) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile) return;

        if (e.target) e.target.value = '';

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: `Crop & Adjust ${getDocTypeLabel(docType) || 'Document'}` });
            if (!file) return; // User cancelled upload
        }

        setUploading(true);
        try {
            // Upload FIRST, delete the old one only once the new file exists.
            // Previously the old document was deleted before the upload - and
            // not even awaited - so a failed upload left the customer with no
            // document at all and nothing to recover.
            const newDoc = await uploadDocument(file, customer.id, docType, user?.id);

            if (newDoc) {
                const supersededDocs = replacingDocId
                    ? documents.filter(d => d.id === replacingDocId)
                    : (docType ? documents.filter(d => d.doc_type === docType && d.id !== newDoc.id) : []);
                for (const oldDoc of supersededDocs) {
                    try {
                        await deleteDocument(oldDoc.id, oldDoc.storage_path);
                    } catch (delErr) {
                        // The new file is safely stored; a stale old row is a
                        // tidiness problem, not a data-loss one.
                        console.warn('New document saved, but removing the previous one failed:', delErr);
                    }
                }
            }
            if (newDoc) {
                setDocuments(prev => [
                    newDoc,
                    ...prev.filter(d => replacingDocId ? d.id !== replacingDocId : (docType ? d.doc_type !== docType : true))
                ]);
                // Pre-cache the new doc URL
                getViewUrl(newDoc.storage_path).then(url => {
                    if (url) urlCacheRef.current[newDoc.storage_path] = url;
                });
                // Automatically mark checklist field as true and persist.
                // Resolve the doc_type to its real column first - writing the
                // raw doc_type made Postgres reject the whole update whenever
                // the type was an alias or had no column.
                const flagColumn = docType ? DOC_TYPE_FLAG_COLUMN[docType] : null;
                if (flagColumn) {
                    setEditData(prev => ({ ...prev, [flagColumn]: true }));
                    lastSelfWriteRef.current = Date.now();
                    // onUpdate RESOLVES false on failure, it does not reject, so
                    // the .catch() that used to be here could never fire - the
                    // checkbox was ticked on screen and the warning was dead
                    // code. Await the result and untick on refusal.
                    const flagOk = await onUpdate(customer.id, { [flagColumn]: true });
                    if (flagOk === false) {
                        setEditData(prev => ({ ...prev, [flagColumn]: false }));
                        showAlert(
                            `The document uploaded, but its checklist tick could not be saved. Please tick "${DOC_TYPE_LABELS[docType] || docType}" manually.`,
                            { title: 'Checklist not updated', type: 'warning' }
                        );
                    }
                }
                logActivity(
                    user.id,
                    'update',
                    `${customer.customer_name}: Uploaded document (${file.name})`,
                    '',
                    customer.id
                ).catch(console.error);
                fetchLogs();
            }
            return Boolean(newDoc);
        } catch (err) {
            console.error('Document upload failed:', err);
            showAlert('Document upload failed: ' + (err.message || 'Please check your connection and try again.'), { type: 'error' });
            return false;
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleDownloadDoc = async (doc) => {
        const url = await getDownloadUrl(doc.storage_path, doc.file_name);
        if (url) {
            await downloadFileWithSaveAs(url, doc.file_name);
        }
    };

    const [downloadingAllDocuments, setDownloadingAllDocuments] = useState(false);
    const canDownloadAllDocuments = !['vendor', 'stamp'].includes(user?.userType);
    const handleDownloadAllDocuments = async () => {
        if (!canDownloadAllDocuments) return;
        if (downloadingAllDocuments) return;
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
        // Use cached URL if available (instant), otherwise fetch
        let url = urlCacheRef.current[doc.storage_path];
        if (!url) {
            url = await getViewUrl(doc.storage_path);
            if (url) urlCacheRef.current[doc.storage_path] = url;
        }
        if (url) setFilePreview({ doc, url });
    };

    const handleDeleteDoc = async (doc) => {
        // Was fire-and-forget: not awaited, no result checked. A refused delete
        // removed the row from the list and wrote a "Deleted document" audit
        // entry while the file was still there on the next refresh.
        const res = await deleteDocument(doc.id, doc.storage_path);
        if (!res?.ok) {
            showAlert(res?.error?.message || 'The document could not be deleted. It has not been removed.', { type: 'error' });
            return;
        }
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        await logActivity(
            user.id,
            'update',
            `${customer.customer_name}: Deleted document (${doc.file_name})`,
            '',
            customer.id
        );
        fetchLogs();
        return true;
    };

    // Returns true/false so the remark rows in shared.jsx can show the real
    // outcome instead of an unconditional "Saved!".
    const handleUpdateDocRemark = async (docId, newRemark) => {
        const res = await updateDocumentRemark(docId, newRemark);
        if (!res?.ok) {
            showAlert(res?.error?.message || 'The remark was not saved.', { type: 'error' });
            return false;
        }
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, remark: newRemark } : d));
        const docObj = documents.find(d => d.id === docId);
        const fileName = docObj?.file_name || 'Document';
        await logActivity(
            user.id,
            'update',
            `${customer.customer_name}: Document remark update (${fileName}) - "${newRemark}"`,
            '',
            customer.id
        );
        fetchLogs();
        return true;
    };

    const REG_CHECKLIST_FIELDS = [
        'adhaar_card_front',
        'adhaar_card_back',
        'pan_card',
        'light_bill',
        'index_2',
        'bank_details',
        'house_geo_tag_photo',
        'extra_docs',
    ];

    const isRegChecklistDirty = REG_CHECKLIST_FIELDS.some(field => {
        return !!editData[field] !== !!customer[field];
    });

    const handleSaveRegChecklist = async () => {
        const patch = {};
        const changes = [];
        REG_CHECKLIST_FIELDS.forEach(field => {
            const oldCheck = !!customer[field];
            const newCheck = !!editData[field];
            if (oldCheck !== newCheck) {
                patch[field] = newCheck;
                changes.push(`${field}: ${oldCheck ? 'Checked' : 'Unchecked'} → ${newCheck ? 'Checked' : 'Unchecked'}`);
            }
        });

        // handleSectionUpdate returns false on failure. Ignoring it wrote an
        // audit entry for a checklist change the database never accepted.
        if (await handleSectionUpdate(customer.id, patch) === false) return;
        if (changes.length > 0) {
            await logActivity(user.id, 'update', `${customer.customer_name}: Registration checklist update - ${changes.join(' | ')}`, '', customer.id);
        }
        fetchLogs();
    };

    const OPERATIONAL_CHECKLIST_FIELDS = [
        'warranty_card',
        'insurance_status',
    ];

    const isOperationalChecklistDirty = OPERATIONAL_CHECKLIST_FIELDS.some(field => {
        return !!editData[field] !== !!customer[field];
    });

    const handleSaveOperationalChecklist = async () => {
        const patch = {};
        const changes = [];
        OPERATIONAL_CHECKLIST_FIELDS.forEach(field => {
            const oldCheck = !!customer[field];
            const newCheck = !!editData[field];
            if (oldCheck !== newCheck) {
                patch[field] = newCheck;
                changes.push(`${field}: ${oldCheck ? 'Checked' : 'Unchecked'} → ${newCheck ? 'Checked' : 'Unchecked'}`);
            }
        });

        if (await handleSectionUpdate(customer.id, patch) === false) return;
        if (changes.length > 0) {
            await logActivity(user.id, 'update', `${customer.customer_name}: Operational checklist update - ${changes.join(' | ')}`, '', customer.id);
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
            // Smart merge: only update fields user hasn't locally changed
            const merged = { ...prev };
            const prevCust = prevCustomerRef.current;
            for (const key of Object.keys(customer)) {
                // If the field in prev still matches the OLD customer value
                // (i.e. user didn't touch it), accept the new server value
                const prevVal = prev[key];
                const oldCustVal = prevCust?.[key];
                // Use JSON.stringify for objects/arrays (e.g. subsidy_history)
                const isSame = typeof prevVal === 'object' && prevVal !== null
                    ? JSON.stringify(prevVal) === JSON.stringify(oldCustVal)
                    : prevVal === oldCustVal;
                if (isSame) {
                    merged[key] = customer[key];
                }
                // Otherwise keep the user's local edit (prev[key])
            }
            // Also bring in any new keys from server that weren't in prev
            for (const key of Object.keys(customer)) {
                if (!(key in merged)) {
                    merged[key] = customer[key];
                }
            }
            prevCustomerRef.current = customer;
            return merged;
        });
        fetchLogs();
    }, [customer]);






    const handleSaveStageRemark = async (stageId) => {
        const targetStage = stageId || editData.stage;
        const currentRemark = getStageRemarkFromData(editData.stages_remarks, targetStage);
        const originalRemark = getStageRemarkFromData(customer.stages_remarks, targetStage);

        if (currentRemark !== originalRemark) {
            let prevObj = {};
            if (typeof customer.stages_remarks === 'object' && customer.stages_remarks) {
                prevObj = customer.stages_remarks;
            } else if (typeof customer.stages_remarks === 'string') {
                try {
                    const parsed = JSON.parse(customer.stages_remarks);
                    if (typeof parsed === 'object' && parsed) prevObj = parsed;
                } catch { /* not valid JSON, fall through to default */ }
            }
            const updatedRemarks = {
                ...prevObj,
                [targetStage]: currentRemark
            };

            // Append the remark update to internal_remarks
            let updatedInternalRemarks = editData.internal_remarks || '';
            const formattedTime = formatDateTime(new Date());
            const appendText = `${targetStage} (${formattedTime}): ${currentRemark.trim() || 'Remark cleared'}`;
            updatedInternalRemarks = updatedInternalRemarks
                ? `${updatedInternalRemarks}\n${appendText}`
                : appendText;

            setEditData(prev => ({
                ...prev,
                stages_remarks: updatedRemarks,
                internal_remarks: updatedInternalRemarks
            }));

            if (await handleSectionUpdate(customer.id, {
                stages_remarks: updatedRemarks,
                internal_remarks: updatedInternalRemarks
            }) === false) return;

            await logActivity(
                user.id,
                'update',
                `${customer.customer_name}: Stage remark update for ${targetStage} - "${currentRemark}"`,
                '',
                customer.id
            );
            fetchLogs();
        }
    };

    const handleChange = (field, val) => {
        if (field === 'consumer_no') {
            val = String(val).replace(/[^0-9]/g, '');
        }
        if (field === 'driver_phone_number' || field === 'phone_number') {
            val = sanitizePhoneNumber(val);
        }
        setEditData(prev => {
            const next = { ...prev, [field]: val };
            setIsFormDirty(getChangedFields(next, savedDataRef.current).size > 0);
            return next;
        });
    };

    // Child tabs have their own Save buttons. Once one succeeds, merge only
    // that saved patch into the baseline and keep the popup active solely for
    // any other fields that are still genuinely unsaved.
    const handleSectionUpdate = async (id, patch) => {
        lastSelfWriteRef.current = Date.now();
        const result = await onUpdate(id, patch);
        if (result === false) return false;
        savedDataRef.current = { ...savedDataRef.current, ...patch };
        setEditData(previous => {
            const next = { ...previous, ...patch };
            setIsFormDirty(getChangedFields(next, savedDataRef.current).size > 0);
            return next;
        });
        return result;
    };

    const hasNextStage = (() => {
        const currentIdx = PRIMARY_STAGES.findIndex(s => s.id === editData.stage);
        if (currentIdx === -1) return false;
        if (editData.stage === STAGE_IDS.COMPLETED || editData.stage === STAGE_IDS.LOST_PROJECT) return false;

        let nextIdx = currentIdx + 1;
        if (nextIdx >= PRIMARY_STAGES.length) return false;

        let nextStage = PRIMARY_STAGES[nextIdx];
        if (nextStage.id === STAGE_IDS.LOAN && editData.payment_type?.trim().toLowerCase() === 'cash') {
            nextIdx++;
        }
        if (nextStage.id === STAGE_IDS.CASH && editData.payment_type?.trim().toLowerCase() === 'loan') {
            nextIdx++;
        }
        if (nextIdx < PRIMARY_STAGES.length && (PRIMARY_STAGES[nextIdx].id === STAGE_IDS.LOST_PROJECT)) {
            nextIdx++;
        }

        return nextIdx < PRIMARY_STAGES.length && PRIMARY_STAGES[nextIdx].id !== STAGE_IDS.LOST_PROJECT;
    })();

    const nextStageId = (() => {
        const currentIdx = PRIMARY_STAGES.findIndex(s => s.id === editData.stage);
        if (currentIdx === -1) return null;
        if (editData.stage === STAGE_IDS.COMPLETED || editData.stage === STAGE_IDS.LOST_PROJECT) return null;

        let nextIdx = currentIdx + 1;
        if (nextIdx >= PRIMARY_STAGES.length) return null;

        let nextStage = PRIMARY_STAGES[nextIdx];
        if (nextStage.id === STAGE_IDS.LOAN && editData.payment_type?.trim().toLowerCase() === 'cash') {
            nextIdx++;
        }
        if (nextStage.id === STAGE_IDS.CASH && editData.payment_type?.trim().toLowerCase() === 'loan') {
            nextIdx++;
        }
        if (nextIdx < PRIMARY_STAGES.length && (PRIMARY_STAGES[nextIdx].id === STAGE_IDS.LOST_PROJECT)) {
            nextIdx++;
        }

        if (nextIdx < PRIMARY_STAGES.length && PRIMARY_STAGES[nextIdx].id !== STAGE_IDS.LOST_PROJECT) {
            return PRIMARY_STAGES[nextIdx].id;
        }
        return null;
    })();

    const nextStageLabel = nextStageId ? PRIMARY_STAGES.find(s => s.id === nextStageId)?.label : '';

    const getMissingStageRequirements = () => missingStageRequirements(editData.stage, editData);

    const showMissingRequirements = (issues) => {
        setValidationIssues(issues);
        setShowValidationModal(true);
    };

    const handleAdvanceStage = async (overrideNextStageId) => {
        const destStageId = overrideNextStageId || nextStageId;
        if (!destStageId) return;

        const missingRequirements = getMissingStageRequirements();
        if (missingRequirements.length > 0) {
            showMissingRequirements(missingRequirements);
            return;
        }

        setSaving(true);
        if (saveBomRef.current) {
            try {
                const wasSaved = await saveBomRef.current();
                if (wasSaved === false) {
                    setSaving(false);
                    showAlert('Failed to save the Material Integration BOM, so the stage was not advanced. Please try again.', { type: 'error' });
                    return;
                }
            } catch (err) {
                console.error('Error saving BOM during stage advance:', err);
                setSaving(false);
                showAlert('Failed to save the Material Integration BOM, so the stage was not advanced: ' + (err.message || 'Unknown error'), { type: 'error' });
                return;
            }
        }

        const oldStage = editData.stage;
        let prevObj = {};
        if (typeof editData.stages_remarks === 'object' && editData.stages_remarks) {
            prevObj = editData.stages_remarks;
        } else if (typeof editData.stages_remarks === 'string') {
            try {
                const parsed = JSON.parse(editData.stages_remarks);
                if (typeof parsed === 'object' && parsed) prevObj = parsed;
            } catch { /* not valid JSON, fall through to default */ }
        }
        const updatedRemarks = {
            ...prevObj,
            [oldStage]: ''
        };

        const updates = {
            ...editData,
            stage: destStageId,
            stages_remarks: updatedRemarks
        };

        if (updates.system_capacity_kwp !== undefined && updates.system_capacity_kwp !== null && updates.system_capacity_kwp !== '') {
            updates.system_capacity_kwp = String(parseIndianNumber(updates.system_capacity_kwp));
        }
        if (updates.module_wp !== undefined && updates.module_wp !== null && updates.module_wp !== '') {
            updates.module_wp = String(parseIndianNumber(updates.module_wp));
        }
        if (updates.no_of_modules !== undefined && updates.no_of_modules !== null && updates.no_of_modules !== '') {
            updates.no_of_modules = String(parseIndianNumber(updates.no_of_modules));
        }
        if (updates.invoice_value !== undefined && updates.invoice_value !== null && updates.invoice_value !== '') {
            updates.invoice_value = String(parseIndianNumber(updates.invoice_value));
        }
        if (updates.dc_cable !== undefined && updates.dc_cable !== null && updates.dc_cable !== '') {
            updates.dc_cable = String(parseIndianNumber(updates.dc_cable));
        }
        if (updates.ac_cable !== undefined && updates.ac_cable !== null && updates.ac_cable !== '') {
            updates.ac_cable = String(parseIndianNumber(updates.ac_cable));
        }

        if (destStageId === STAGE_IDS.LOST_PROJECT) {
            const prevHold = (typeof updates.hold_procurement === 'object' && updates.hold_procurement) ? updates.hold_procurement : {};
            updates.hold_procurement = {
                ...prevHold,
                previous_stage: (oldStage !== STAGE_IDS.LOST_PROJECT) ? oldStage : (prevHold.previous_stage || STAGE_IDS.LEADS),
                hold_date: new Date().toISOString().split('T')[0]
            };
        }

        if (destStageId === STAGE_IDS.METER_INSTALLATION) {
            // Seed the STRING the tab and the validator both read. This used to
            // write { status, no_date, yes_date }; no code ever read no_date or
            // yes_date, and the object broke every reader.
            updates.meter_installation = normalizeMeterInstallation(updates.meter_installation) || 'No';
        }

        if (destStageId === STAGE_IDS.DISCOM_INSPECTION) {
            if (!updates.discom_inspection) {
                updates.discom_inspection = 'No';
            }
        }

        if (updates.subsidy_history) {
            updates.subsidy_history = updates.subsidy_history.map(({ isNew, ...rest }) => rest);
        }
        if (updates.loan_history) {
            updates.loan_history = updates.loan_history.map(({ isNew, ...rest }) => rest);
        }

        let changeSummary = [];
        Object.keys(updates).forEach(key => {
            if (updates[key] !== customer[key] && key !== 'id' && key !== 'created_at' && key !== 'crn' && key !== 'updated_at' && key !== 'stage' && key !== 'stages_remarks' && typeof updates[key] !== 'object') {
                changeSummary.push(`${key.replace(/_/g, ' ').toUpperCase()}: ${customer[key] || 'None'} → ${updates[key] || 'None'}`);
            }
        });

        delete updates.id;
        delete updates.created_at;
        delete updates.crn;
        delete updates.updated_at;

        // Send only what actually changed, plus the stage and its remarks.
        // This used to spread the whole record (~89 columns), so advancing a
        // stage wrote every stale field over whatever a colleague had just
        // saved.
        const changedKeys = getChangedFields(updates, savedDataRef.current);
        const narrowed = {};
        changedKeys.forEach(key => { narrowed[key] = updates[key]; });
        narrowed.stage = destStageId;
        narrowed.stages_remarks = updatedRemarks;

        setEditingSection(null);
        setEditData(updates);

        // onUpdate RESOLVES with false on failure - it does not reject - so the
        // old .catch() could never fire and the modal moved the customer into
        // the new stage even when the write had failed. Await the result and
        // only advance the UI once the database has accepted it.
        lastSelfWriteRef.current = Date.now();
        try {
            const ok = await onUpdate(customer.id, narrowed);
            if (ok === false) throw new Error('The database did not accept the stage change.');

            savedDataRef.current = { ...savedDataRef.current, ...narrowed };
            setActiveTab(destStageId);

            void logActivity(
                user.id,
                'stage_change',
                `${customer.customer_name}: Stage changed`,
                `Stage: ${oldStage || 'Empty'} → ${destStageId || 'Empty'}`,
                customer.id
            );
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
    // This button used to be `onClick={() => setActiveTab(STAGE_IDS.LOST_PROJECT)}`
    // - it switched the visible tab and never wrote anything. The user filled in
    // the panel, pressed Save, and got a green confirmation while `stage` was
    // untouched, so the record never moved. No customer has ever reached Lost
    // Project through the UI.
    //
    // It also has to record WHERE the project was lost from. Without
    // hold_procurement.previous_stage, HoldProcurementTab falls back to 'LEADS'
    // (see its getHoldState), so Resume would dump a project lost at Subsidy
    // Status all the way back to Leads.
    const handleMoveToLostProject = async () => {
        const originStage = customer?.stage;
        if (!originStage) return;

        const originLabel = PRIMARY_STAGES.find(st => st.id === originStage)?.label || originStage;
        const confirmed = await showConfirm(
            `Move ${customer.customer_name || 'this customer'} to Lost Project?\n\n`
            + `Their current stage (${originLabel}) is recorded, so they can be resumed back to it later.`,
            { title: 'Move to Lost Project', confirmLabel: 'Move to Lost Project', cancelLabel: 'Cancel', type: 'warning' }
        );
        if (!confirmed) return;

        // Preserve anything already stored (a previous hold's notes) rather
        // than overwriting the column wholesale.
        let existing = {};
        const raw = editData.hold_procurement ?? customer.hold_procurement;
        if (raw) {
            try {
                existing = typeof raw === 'string' ? (JSON.parse(raw) || {}) : (raw || {});
            } catch { existing = {}; }
        }

        const payload = {
            ...existing,
            previous_stage: originStage,
            hold_date: new Date().toISOString().split('T')[0],
        };

        lastSelfWriteRef.current = Date.now();
        const ok = await onUpdate(customer.id, {
            stage: STAGE_IDS.LOST_PROJECT,
            hold_procurement: payload,
        });
        // onUpdate resolves false on failure and has already shown the error.
        if (ok === false) return;

        setEditData(prev => ({ ...prev, stage: STAGE_IDS.LOST_PROJECT, hold_procurement: payload }));

        // Re-base the conflict baseline, exactly as handleSave and
        // handleAdvanceStage do. Without this the NEXT save in the same modal
        // session sees the row as changed-on-the-server - by this very write -
        // and raises an "Edit Conflict Detected" dialog against the user
        // themselves. Postgres re-orders jsonb keys on storage, so
        // hold_procurement compares unequal and lands in the conflict list.
        savedDataRef.current = {
            ...savedDataRef.current,
            stage: STAGE_IDS.LOST_PROJECT,
            hold_procurement: payload,
        };
        loadedUpdatedAtRef.current = new Date().toISOString();

        setActiveTab(STAGE_IDS.LOST_PROJECT);

        await logActivity(
            user.id,
            'stage_change',
            `${customer.customer_name}: Stage changed`,
            `Stage: ${originStage || 'Empty'} → ${STAGE_IDS.LOST_PROJECT}`,
            customer.id
        );
        fetchLogs();
    };

    const handleSave = async (forceOverwrite = false) => {
        setSaving(true);
        if (saveBomRef.current) {
            try {
                const bomSaved = await saveBomRef.current();
                if (bomSaved === false) throw new Error('The BOM could not be saved.');
            } catch (err) {
                console.error('Error saving BOM during handleSave:', err);
                showAlert(`Your BOM was not saved. Please try again.\n\n${err.message || ''}`, { type: 'error' });
                setSaving(false);
                return false;
            }
        }
        const updates = { ...editData };

        if (updates.system_capacity_kwp !== undefined && updates.system_capacity_kwp !== null && updates.system_capacity_kwp !== '') {
            updates.system_capacity_kwp = String(parseIndianNumber(updates.system_capacity_kwp));
        }
        if (updates.module_wp !== undefined && updates.module_wp !== null && updates.module_wp !== '') {
            updates.module_wp = String(parseIndianNumber(updates.module_wp));
        }
        if (updates.no_of_modules !== undefined && updates.no_of_modules !== null && updates.no_of_modules !== '') {
            updates.no_of_modules = String(parseIndianNumber(updates.no_of_modules));
        }
        if (updates.invoice_value !== undefined && updates.invoice_value !== null && updates.invoice_value !== '') {
            updates.invoice_value = String(parseIndianNumber(updates.invoice_value));
        }
        if (updates.dc_cable !== undefined && updates.dc_cable !== null && updates.dc_cable !== '') {
            updates.dc_cable = String(parseIndianNumber(updates.dc_cable));
        }
        if (updates.ac_cable !== undefined && updates.ac_cable !== null && updates.ac_cable !== '') {
            updates.ac_cable = String(parseIndianNumber(updates.ac_cable));
        }
        if (updates.vendor_quote !== undefined && updates.vendor_quote !== null && updates.vendor_quote !== '') {
            updates.vendor_quote = String(parseIndianNumber(updates.vendor_quote));
        } else if (updates.vendor_quote === '') {
            updates.vendor_quote = null;
        }

        // Concurrency Conflict Check before writing to database
        if (!forceOverwrite && customer?.id && !String(customer.id).startsWith('demo-') && loadedUpdatedAtRef.current) {
            try {
                const { data: serverRecord, error: checkErr } = await supabase
                    .from('admin')
                    .select('*')
                    .eq('id', customer.id)
                    .single();

                if (!checkErr && serverRecord && serverRecord.updated_at) {
                    const serverTime = new Date(serverRecord.updated_at).getTime();
                    const localTime = new Date(loadedUpdatedAtRef.current).getTime();

                    // If server record was updated since we loaded it (> 1000ms threshold)
                    if (serverTime > localTime + 1000) {
                        const localChangedSet = getChangedFields(updates, savedDataRef.current);
                        const remoteChangedSet = getChangedFields(serverRecord, savedDataRef.current);

                        const localChanges = Array.from(localChangedSet);

                        const overlappingFields = localChanges.filter(
                            k => remoteChangedSet.has(k) && JSON.stringify(serverRecord[k]) !== JSON.stringify(updates[k])
                        );

                        // A conflict only exists when we and the server changed the
                        // SAME field to DIFFERENT values - that is `overlappingFields`,
                        // which was already computed above and then ignored.
                        //
                        // The old test (both sides differ from the baseline) fired
                        // whenever the baseline was stale, because BOTH sides then
                        // differ from it even when they are identical to each other.
                        // That is why the dialog listed fields whose two values were
                        // the same: STAGE "REGISTRATION" vs "REGISTRATION".
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
                }
            } catch (concurrencyErr) {
                console.warn('Concurrency check warning:', concurrencyErr);
            }
        }

        let changeSummary = [];
        Object.keys(updates).forEach(key => {
            if (updates[key] !== customer[key] && key !== 'id' && key !== 'updated_at' && typeof updates[key] !== 'object') {
                changeSummary.push(`${key.replace(/_/g, ' ').toUpperCase()}: ${customer[key] || 'None'} → ${updates[key] || 'None'}`);
            }
        });

        if (updates.subsidy_history) {
            updates.subsidy_history = updates.subsidy_history.map(({ isNew, ...rest }) => rest);
        }
        if (updates.loan_history) {
            updates.loan_history = updates.loan_history.map(({ isNew, ...rest }) => rest);
        }

        // Compare subsidy_history
        const oldSubsidy = customer.subsidy_history || [];
        const newSubsidy = updates.subsidy_history || [];
        if (JSON.stringify(oldSubsidy) !== JSON.stringify(newSubsidy)) {
            const subChanges = [];
            if (newSubsidy.length === 0 && oldSubsidy.length > 0) {
                subChanges.push("Cleared all subsidy entries");
            } else {
                const maxLen = Math.max(oldSubsidy.length, newSubsidy.length);
                for (let i = 0; i < maxLen; i++) {
                    const oldItem = oldSubsidy[i];
                    const newItem = newSubsidy[i];
                    if (!oldItem && newItem) {
                        subChanges.push(`Added Entry ${i + 1} (${newItem.status}${newItem.date ? ` on ${newItem.date}` : ''}${newItem.remark ? `: ${newItem.remark}` : ''})`);
                    } else if (oldItem && !newItem) {
                        subChanges.push(`Removed Entry ${i + 1} (${oldItem.status})`);
                    } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
                        const diffs = [];
                        if (oldItem.status !== newItem.status) {
                            diffs.push(`status: "${oldItem.status}" → "${newItem.status}"`);
                        }
                        if (oldItem.date !== newItem.date) {
                            diffs.push(`date: "${oldItem.date || 'None'}" → "${newItem.date || 'None'}"`);
                        }
                        if (oldItem.remark !== newItem.remark) {
                            diffs.push(`remark: "${oldItem.remark || 'None'}" → "${newItem.remark || 'None'}"`);
                        }
                        if (diffs.length > 0) {
                            subChanges.push(`Updated Entry ${i + 1} (${diffs.join(', ')})`);
                        }
                    }
                }
            }
            if (subChanges.length > 0) {
                changeSummary.push(`SUBSIDY STATUS: ${subChanges.join(' | ')}`);
            }
        }

        // Compare loan_history
        const oldLoan = customer.loan_history || [];
        const newLoan = updates.loan_history || [];
        if (JSON.stringify(oldLoan) !== JSON.stringify(newLoan)) {
            const loanChanges = [];
            if (newLoan.length === 0 && oldLoan.length > 0) {
                loanChanges.push("Cleared all loan entries");
            } else {
                const maxLen = Math.max(oldLoan.length, newLoan.length);
                for (let i = 0; i < maxLen; i++) {
                    const oldItem = oldLoan[i];
                    const newItem = newLoan[i];
                    if (!oldItem && newItem) {
                        loanChanges.push(`Added Entry ${i + 1} (${newItem.status}${newItem.date ? ` on ${newItem.date}` : ''}${newItem.remark ? `: ${newItem.remark}` : ''})`);
                    } else if (oldItem && !newItem) {
                        loanChanges.push(`Removed Entry ${i + 1} (${oldItem.status})`);
                    } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
                        const diffs = [];
                        if (oldItem.status !== newItem.status) {
                            diffs.push(`status: "${oldItem.status}" → "${newItem.status}"`);
                        }
                        if (oldItem.date !== newItem.date) {
                            diffs.push(`date: "${oldItem.date || 'None'}" → "${newItem.date || 'None'}"`);
                        }
                        if (oldItem.remark !== newItem.remark) {
                            diffs.push(`remark: "${oldItem.remark || 'None'}" → "${newItem.remark || 'None'}"`);
                        }
                        if (diffs.length > 0) {
                            loanChanges.push(`Updated Entry ${i + 1} (${diffs.join(', ')})`);
                        }
                    }
                }
            }
            if (loanChanges.length > 0) {
                changeSummary.push(`LOAN STATUS: ${loanChanges.join(' | ')}`);
            }
        }

        // We do not run safeParse here because regular save should allow partial/invalid data to be saved as drafts.
        // Validation only happens strictly when advancing stages.

        const stageChanged = editData.stage !== customer.stage;
        delete updates.id; delete updates.created_at; delete updates.crn; delete updates.updated_at;
        
        try {
            // Send only the fields this editor actually changed. Sending the whole
            // record meant two people on one customer silently overwrote each
            // other: the realtime sync stops as soon as your form is dirty, so
            // your copy goes stale, and saving wrote every stale field back over
            // a colleague's change. Narrowing the payload means edits to
            // different fields no longer collide.
            const changedKeys = getChangedFields(updates, savedDataRef.current);
            const narrowedUpdates = {};
            changedKeys.forEach(key => { narrowedUpdates[key] = updates[key]; });
            // `stage` is set by the advance flow rather than by editing a field,
            // so carry it whenever it differs from what we loaded.
            if (updates.stage !== undefined && updates.stage !== savedDataRef.current?.stage) {
                narrowedUpdates.stage = updates.stage;
            }

            // Nothing actually changed - there is nothing to send. Writing an
            // empty object makes PostgREST reject the request, which surfaced as
            // "The database did not accept the changes" on a save where the user
            // had changed nothing (or only fields that are not real columns).
            if (Object.keys(narrowedUpdates).length === 0) {
                setEditingSection(null);
                setIsFormDirty(false);
                setSaving(false);
                return true;
            }

            lastSelfWriteRef.current = Date.now();
            const promises = [onUpdate(customer.id, narrowedUpdates)];
            if (changeSummary.length > 0) promises.push(logActivity(user.id, 'update', `${customer.customer_name}: ${changeSummary.join(' | ')}`, '', customer.id));
            const [updateResult] = await Promise.all(promises);
            if (updateResult === false) throw new Error('The database did not accept the changes.');

            // Admins can override a customer's stage and then use the regular
            // Save button. That route previously persisted the stage but never
            // wrote a stage_change entry because `stage` is intentionally
            // excluded from the generic field summary above.
            if (stageChanged) {
                await logActivity(
                    user.id,
                    'stage_change',
                    `${customer.customer_name}: Stage changed by admin override`,
                    `Stage: ${customer.stage || 'Empty'} → ${editData.stage || 'Empty'}`,
                    customer.id
                );
            }

            // Re-read what the server actually stored, and use ITS updated_at as
            // the new baseline. Two separate bugs made the conflict dialog fire
            // on a single editor's own second save:
            //
            //  1. The baseline was the CLIENT clock (new Date()), while the DB
            //     trigger sets updated_at from server now(). Any clock skew over
            //     1s made the next save look like somebody else's edit.
            //  2. savedDataRef was patched with what we SENT, but handleUpdateCustomer
            //     coerces numeric strings ('5' -> 5), so the stored row genuinely
            //     differed from our baseline and every numeric field showed up as a
            //     "remote change".
            const { data: savedRow } = await supabase
                .from('admin')
                .select('*')
                .eq('id', customer.id)
                .maybeSingle();

            if (savedRow) {
                savedDataRef.current = { ...savedRow };
                loadedUpdatedAtRef.current = savedRow.updated_at || new Date().toISOString();
            } else {
                savedDataRef.current = { ...savedDataRef.current, ...narrowedUpdates };
                loadedUpdatedAtRef.current = new Date().toISOString();
            }
            setRemoteUpdateAlert(false);
            setConcurrentConflict(null);
            setEditingSection(null);
            setIsFormDirty(false);
            if (stageChanged) setActiveTab(editData.stage);
            // The customer update is already confirmed. Refreshing the activity
            // list does not need to delay Save & Close.
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

    const handleMergeAndSaveConflict = async () => {
        if (!concurrentConflict?.serverData) return;
        const serverRecord = concurrentConflict.serverData;
        savedDataRef.current = { ...serverRecord };
        setEditData(prev => ({ ...serverRecord, ...prev }));
        loadedUpdatedAtRef.current = serverRecord.updated_at;
        setConcurrentConflict(null);
        setTimeout(() => handleSave(true), 50);
    };

    const handleDiscardAndReloadConflict = () => {
        if (!concurrentConflict?.serverData) return;
        const serverRecord = concurrentConflict.serverData;
        savedDataRef.current = { ...serverRecord };
        setEditData({ ...serverRecord });
        loadedUpdatedAtRef.current = serverRecord.updated_at;
        setIsFormDirty(false);
        setRemoteUpdateAlert(false);
        setConcurrentConflict(null);
        showAlert('Reloaded latest data from server. Your unsaved edits were discarded.', { type: 'info' });
    };

    const handleAddNote = async () => {
        if (!followUpText.trim()) return;
        const updatedNotes = [...(editData.follow_ups || []), { text: followUpText, author: user.name, date: new Date().toISOString() }];
        // Returning early on failure matters most here: this used to clear
        // followUpText regardless, so a refused save destroyed the note the
        // user had just typed.
        if (await handleSectionUpdate(customer.id, { follow_ups: updatedNotes }) === false) return;
        await logActivity(user.id, 'note', `Note Added: ${followUpText}`, '', customer.id);
        setEditData(prev => ({ ...prev, follow_ups: updatedNotes }));
        setFollowUpText('');
        fetchLogs();
    };

    const handleSoftDelete = async () => {
        const deletedAt = new Date().toISOString();
        await logActivity(user.id, 'delete', `Soft-deleted: ${customer.customer_name}`, '', customer.id);
        await onDelete(customer.id, deletedAt);   // pass timestamp for soft-delete
        onClose();
    };


    const SectionHeader = ({ title, id, icon: Icon }) => (
        <div className="flex items-center justify-between mb-3 border-b border-stone-100 pb-1.5 mt-4">
            <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Icon size={12} /> {title}
            </h3>
            {isEditable && (
                <button onClick={() => {
                    const isOpening = editingSection !== id;
                    setEditingSection(isOpening ? id : null);
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

    const tabProps = {
        activeTab, customer: savedDataRef.current, editData, setEditData: handleEditDataChange, handleChange,
        isEditable, editingSection, setEditingSection, channel_partners, subAgents, isAdmin, 
        isOffice, meta, user, isRegChecklistDirty, handleSaveRegChecklist, 
        isOperationalChecklistDirty, handleSaveOperationalChecklist, documents, 
        uploading, 
        onFileUpload: handleFileUpload, 
        onUpload: handleFileUpload,
        onFileDelete: handleDeleteDoc, 
        onDelete: handleDeleteDoc,
        onDeleteDocument: handleDeleteDoc,
        onFilePreview: handlePreviewDoc, 
        onPreview: handlePreviewDoc,
        onViewDocument: handlePreviewDoc,
        onDownloadDocument: handleDownloadDoc,
        onFileDownload: handleDownloadDoc,
        onDownload: handleDownloadDoc,
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

    return (
        <div data-demo-editor="customer" className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-none sm:rounded-[28px] shadow-2xl w-full max-w-5xl h-[100dvh] sm:h-[94vh] overflow-hidden flex flex-col border border-stone-100">

                {/* Realtime Remote Conflict Alert Banner - see SHOW_REMOTE_UPDATE_ALERT */}
                {SHOW_REMOTE_UPDATE_ALERT && remoteUpdateAlert && (
                    <div className="bg-amber-500 text-white px-6 py-2.5 text-xs font-semibold flex items-center justify-between shadow-inner shrink-0 animate-fadeIn">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0" />
                            <span>A colleague just saved changes to this customer in another session.</span>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                const { data } = await supabase.from('admin').select('*').eq('id', customer.id).single();
                                if (data) {
                                    const localChangedSet = getChangedFields(editData, savedDataRef.current);
                                    const remoteChangedSet = getChangedFields(data, savedDataRef.current);
                                    const localChanges = Array.from(localChangedSet);
                                    // Same rule as the save path: only fields we and the
                                    // server both changed, to DIFFERENT values, are a
                                    // real conflict. Everything else can just sync.
                                    const overlappingFields = localChanges.filter(
                                        k => remoteChangedSet.has(k) && JSON.stringify(data[k]) !== JSON.stringify(editData[k])
                                    );
                                    if (overlappingFields.length === 0) {
                                        savedDataRef.current = { ...data };
                                        loadedUpdatedAtRef.current = data.updated_at || loadedUpdatedAtRef.current;
                                        setRemoteUpdateAlert(false);
                                        return;
                                    }
                                    setConcurrentConflict({
                                        serverData: data,
                                        localUpdates: editData,
                                        localChanges: overlappingFields,
                                        remoteChanges: overlappingFields,
                                        overlappingFields,
                                        serverUpdatedAt: data.updated_at
                                    });
                                }
                            }}
                            className="px-3 py-1 bg-black/20 hover:bg-black/30 text-white font-bold rounded-lg transition-colors cursor-pointer ml-3"
                        >
                            Review Differences
                        </button>
                    </div>
                )}

                {/* Header */}
                <div className="bg-stone-900 px-4 sm:px-6 py-3 sm:py-5 flex justify-between items-center flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-xl font-bold text-white">{customer.customer_name}</h2>
                            {(customer.phone_number || editData.phone_number) && getTelephoneHref(customer.phone_number || editData.phone_number) && (
                                <a
                                    href={getTelephoneHref(customer.phone_number || editData.phone_number)}
                                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/60 hover:border-emerald-500 px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer group"
                                    title={`Click to call ${customer.phone_number || editData.phone_number}`}
                                >
                                    <Phone size={12} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                                    <span>{customer.phone_number || editData.phone_number}</span>
                                </a>
                            )}
                            {isCompleted && (
                                <span className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${isFrozen ? 'bg-stone-700 text-stone-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {isFrozen ? <><Lock size={9} /> Frozen</> : <><Unlock size={9} /> Unlocked</>}
                                </span>
                            )}
                            {(customer.google_drive_link || editData.google_drive_link) && (
                                <a
                                    href={customer.google_drive_link || editData.google_drive_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-blue-300 bg-blue-950/70 hover:bg-blue-900/80 border border-blue-700/60 hover:border-blue-500 px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer group"
                                    title={`Open Google Drive: ${customer.google_drive_link || editData.google_drive_link}`}
                                >
                                    <HardDrive size={12} className="text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span>Google Drive</span>
                                    <ExternalLink size={10} className="text-blue-400 opacity-70" />
                                </a>
                            )}
                            {(customer.location_link || editData.location_link) && (
                                <a
                                    href={customer.location_link || editData.location_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-700/60 hover:border-emerald-500 px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer group"
                                    title={`Open Location Link: ${customer.location_link || editData.location_link}`}
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
                                    <span>Created: {new Date(customer.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                </p>
                            )}
                            {customer.updated_at && customer.updated_at !== customer.created_at && (
                                <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1.5">
                                    <Clock size={11} className="text-amber-400 flex-shrink-0" />
                                    <span>Updated: {new Date(customer.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                </p>
                            )}
                            {customer.completed_at && (
                                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                                    <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />
                                    <span>Completed: {new Date(customer.completed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {/* Mode Toggle for Document Checklist vs File Storage */}
                        <div className="hidden sm:inline-flex rounded-xl bg-white/10 p-1 border border-white/10 mr-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setChecklistMode('checklist');
                                    setDocChecklistMode('checklist');
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    docChecklistMode === 'checklist'
                                        ? 'bg-amber-500 text-stone-900 shadow-sm'
                                        : 'text-stone-300 hover:text-white'
                                }`}
                                title="Simple Checklist Mode: 1-click verify items directly without needing file attachments"
                            >
                                <CheckSquare size={13} />
                                <span>Checklist</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setChecklistMode('files');
                                    setDocChecklistMode('files');
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    docChecklistMode === 'files'
                                        ? 'bg-amber-500 text-stone-900 shadow-sm'
                                        : 'text-stone-300 hover:text-white'
                                }`}
                                title="File Storage Mode: Upload client documents, photos, and demo attachments"
                            >
                                <FolderOpen size={13} />
                                <span>Documents</span>
                            </button>
                        </div>

                        {/* Admin unlock/lock toggle for completed cards */}
                        {isCompleted && isAdmin && (
                            <button onClick={() => { setAdminUnlocked(prev => !prev); setEditingSection(null); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${adminUnlocked ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/30' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                                {adminUnlocked ? <><Lock size={12} /> Re-lock</> : <><Unlock size={12} /> Unlock to Edit</>}
                            </button>
                        )}
                        {isAdmin && <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-white/30 hover:text-red-400"><Trash2 size={18} /></button>}
                        <button onClick={async () => {
                            if (isFormDirty) {
                                const shouldSave = await showConfirm('You have unsaved changes. Save them before closing?', { title: 'Unsaved changes', confirmLabel: 'Save & Close', cancelLabel: 'Keep Editing', type: 'warning' });
                                if (!shouldSave) return;
                                const saved = await handleSave();
                                if (!saved) return;
                            }
                            onClose();
                        }} className="p-2 text-white/30 hover:text-white"><X size={24} /></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="relative bg-stone-900 border-t border-white/5 flex-shrink-0">
                    <div className="flex gap-6 overflow-x-auto scrollbar-none whitespace-nowrap px-4 sm:px-6 scroll-smooth">
                        {[
                            ...PRIMARY_STAGES.filter(s => {
                                if (s.id === STAGE_IDS.LOAN && editData.payment_type?.trim().toLowerCase() === 'cash') return false;
                                if (s.id === STAGE_IDS.CASH && editData.payment_type?.trim().toLowerCase() === 'loan') return false;
                                if (s.id === STAGE_IDS.COMPLETED || s.id === STAGE_IDS.LOST_PROJECT) return false;
                                return true;
                            }).map(s => ({ id: s.id, label: s.label, icon: s.icon })),
                            { id: 'DOCUMENTS', label: 'Documents', icon: FolderOpen },
                            { id: 'history', label: 'Notes & History', icon: History },
                        ].map(tab => (
                            <button key={tab.id} onClick={async () => {
                                if (tab.id !== activeTab && isFormDirty) {
                                    const shouldSave = await showConfirm('You have unsaved changes. Save them before continuing?', { title: 'Unsaved changes', confirmLabel: 'Save & Continue', cancelLabel: 'Keep Editing', type: 'warning' });
                                    if (!shouldSave) return;
                                    const saved = await handleSave();
                                    if (!saved) return;
                                }
                                setActiveTab(tab.id); setEditingSection(null);
                            }}
                                className={`flex items-center gap-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 flex-shrink-0 ${activeTab === tab.id ? 'text-amber-400 border-amber-400' : 'text-stone-500 border-transparent hover:text-stone-300'}`}>
                                <tab.icon size={12} /> {tab.label}
                            </button>
                        ))}
                    </div>
                    {/* Subtle right gradient fade indicating more tabs are scrollable */}
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
                                <p className="text-[10px] text-amber-700 font-medium">Channel Partner Office and Channel Partner Manager accounts have view-only access to Material Integration and Material Delivery.</p>
                            </div>
                        </div>
                    )}

                    {activeTab !== 'history' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            {/* Primary Stage Info */}
                            <div className={`p-4 rounded-2xl border shadow-sm ${isCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-stone-100'} flex flex-col justify-between`}>
                                <div>
                                    <label className="text-[9px] text-stone-400 font-bold uppercase mb-2 block">Primary Stage</label>
                                    <div className="flex items-center gap-3 min-h-[38px]">
                                        <div className="text-xs text-stone-850 font-bold px-3 py-1.5 bg-stone-50 border border-stone-100 rounded-xl flex items-center gap-1.5">
                                            {PRIMARY_STAGES.find(s => s.id === editData.stage)?.label || editData.stage}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Stage Remark */}
                            <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm flex flex-col justify-between">
                                <div>
                                    <label className="text-[9px] text-stone-400 font-bold uppercase mb-2 block">Stage Remark (Current Stage)</label>
                                    {!canAddRemark ? (
                                        <div className="text-xs text-stone-500 font-medium italic min-h-[38px] bg-stone-50 p-2 rounded-lg">
                                            {(typeof editData.stages_remarks === 'object' && editData.stages_remarks ? editData.stages_remarks[editData.stage] : '') || 'No remarks for this stage.'}
                                        </div>
                                    ) : (
                                        (() => {
                                            const curRemark = getStageRemarkFromData(editData.stages_remarks, editData.stage);
                                            const origRemark = getStageRemarkFromData(customer.stages_remarks, customer.stage);
                                            const isRemarkDirty = (curRemark || '').trim() !== (origRemark || '').trim();

                                            return (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Add remark for current stage..."
                                                        value={curRemark}
                                                        onChange={e => {
                                                            const newVal = e.target.value;
                                                            setEditData(prev => {
                                                                const prevObj = typeof prev.stages_remarks === 'object' && prev.stages_remarks ? prev.stages_remarks : {};
                                                                return {
                                                                    ...prev,
                                                                    stages_remarks: {
                                                                        ...prevObj,
                                                                        [prev.stage]: newVal
                                                                    }
                                                                };
                                                            });
                                                        }}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveStageRemark()}
                                                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-300"
                                                    />
                                                    <button
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
                                        })()
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {stageRequirements[activeTab] && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 mb-4 text-xs text-teal-900">
                        <strong>Demo essentials: </strong>{stageRequirements[activeTab].map(([,label])=>label).join(' · ')}. Other fields and all photos are optional.
                    </div>}
                    <CustomerModalTabsRouter {...tabProps} />

                    {/* ── DOCUMENTS ── */}
                    {activeTab === "DOCUMENTS" && (
                        <CustomerDocumentsTab
                            documents={documents}
                            isEditable={isEditable}
                            canDelete={canDeleteDocs}
                            docSearchQuery={docSearchQuery}
                            setDocSearchQuery={setDocSearchQuery}
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
                    )}

                    {/* ── NOTES & HISTORY ── */}
                    {activeTab === 'history' && (
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
                    )}

                    {isEditable && activeTab !== STAGE_IDS.LOST_PROJECT && activeTab !== 'DOCUMENTS' && activeTab !== 'history' && customer.stage !== STAGE_IDS.COMPLETED && (
                        <div className="mt-8 pt-4 border-t border-stone-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/70 p-3.5 rounded-2xl border border-stone-200/60">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg flex-shrink-0">
                                    <PauseCircle size={16} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-stone-700">Pause or stop this project?</p>
                                    <p className="text-[11px] text-stone-500 font-medium">Paused projects go to Lost Project. Their previous stage is saved so they can resume later.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleMoveToLostProject}
                                className="px-3.5 py-2 bg-white hover:bg-stone-100 text-stone-700 rounded-xl text-xs font-bold border border-stone-200 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                            >
                                Pause / Move to Lost Project
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer bar - 50/50 split buttons at customer card */}
                {isEditable && activeTab !== STAGE_IDS.LOST_PROJECT && (
                    <div className="p-4 border-t border-stone-100 bg-white flex-shrink-0 flex gap-3">
                        <button
                            /* () => handleSave() - NOT onClick={handleSave}. React
                               passes the click event as the first argument, which
                               made `forceOverwrite` a truthy SyntheticEvent and
                               skipped the entire concurrency check below it, so
                               the conflict dialog could never open from this
                               button and a colleague's edit was silently
                               overwritten with a green "Saved". */
                            onClick={() => handleSave()}
                            disabled={saving}
                            className={`flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs cursor-pointer shadow-sm disabled:opacity-50 ${
                                isFormDirty
                                    ? 'bg-stone-900 text-white hover:bg-stone-800'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                        >
                            {saving ? (
                                'Saving...'
                            ) : isFormDirty ? (
                                <>
                                    <Save size={14} />
                                    <span>Save</span>
                                </>
                            ) : (
                                <>
                                    <Check size={14} className="text-white" />
                                    <span>Saved</span>
                                </>
                            )}
                        </button>

                        {/* Restored: removed in rd48, leaving hasNextStage / nextStageId /
                            nextStageLabel / handleAdvanceStage all in place but unreachable,
                            so no role could advance a customer from the modal. */}
                        {hasNextStage && activeTab === customer.stage && (
                            <button
                                onClick={() => {
                                    if (nextStageId === STAGE_IDS.COMPLETED) {
                                        setShowCompletedConfirm(true);
                                    } else {
                                        handleAdvanceStage();
                                    }
                                }}
                                disabled={saving}
                                className="flex-1 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Saving & Moving...' : `Save & Move to ${nextStageLabel}`}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Soft-delete confirm */}
            {showValidationModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm" onClick={() => setShowValidationModal(false)}>
                    <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200" onClick={event => event.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="requirements-title">
                        <div className="bg-orange-500 px-6 py-5 text-stone-900">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-2xl bg-white/20 p-2.5"><AlertTriangle size={21} /></div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-50">SolarFlow checklist</p>
                                        <h3 id="requirements-title" className="mt-0.5 text-lg font-black">A few details need attention</h3>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setShowValidationModal(false)} className="rounded-lg p-1 text-white/90 hover:bg-white/15 hover:text-white" aria-label="Close requirements popup"><X size={19} /></button>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-sm font-medium leading-relaxed text-stone-600">Complete the required items below before moving this customer to <span className="font-bold text-stone-800">{nextStageLabel}</span>.</p>
                            <ul className="mt-4 space-y-2.5">
                                {validationIssues.map((issue, idx) => {
                                    const displayMsg = typeof issue === 'string'
                                        ? issue
                                        : (issue?.text ? (issue?.label ? `${issue.label}: ${issue.text}` : issue.text) : JSON.stringify(issue));
                                    return (
                                        <li key={idx} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">
                                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white">!</span>
                                            <span>{displayMsg}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="mt-5 flex gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowValidationModal(false)} 
                                    className="flex-1 rounded-xl bg-stone-100 hover:bg-stone-200 px-4 py-3 text-xs font-bold text-stone-700 transition-colors cursor-pointer"
                                >
                                    Review
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {/* Soft-delete confirm */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-100 rounded-full"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                            <h3 className="font-bold text-stone-800">Move to Trash?</h3>
                        </div>
                        <p className="text-sm text-stone-600 mb-5">
                            <strong>{customer.customer_name}</strong> will be moved to Trash. You can recover it later from the Trash view.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium">Cancel</button>
                            <button onClick={handleSoftDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                                <Trash2 className="w-4 h-4" /> Move to Trash
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move-to-Completed lock confirm */}
            {showCompletedConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-amber-100 rounded-full"><Lock className="w-5 h-5 text-amber-600" /></div>
                            <h3 className="font-bold text-stone-800">Mark as Completed?</h3>
                        </div>
                        <p className="text-sm text-stone-600 mb-5">
                            Moving <strong>{customer.customer_name}</strong> to Completed will lock this record. Only an admin will be able to unlock it for further edits. Do you want to proceed?
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowCompletedConfirm(false)} className="flex-1 py-2.5 border border-stone-300 text-stone-700 rounded-xl text-sm font-medium">Cancel</button>
                            <button
                                onClick={() => {
                                    setShowCompletedConfirm(false);
                                    handleAdvanceStage();
                                }}
                                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Lock className="w-4 h-4" /> Proceed & Lock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PM Surya Ghar Agreement Popup Modal */}
            {showAgreementPopup && (
                <AgreementPreview
                    data={agreementData}
                    onChange={setAgreementData}
                    onClose={() => { setShowAgreementPopup(false); setAgreementAutoAdd(false); }}
                    existingDocument={documents.some(doc => doc?.doc_type === 'discom_agreement')}
                    autoAdd={agreementAutoAdd}
                    onAddToDocuments={async (file) => {
                        const replacing = documents.some(doc => doc?.doc_type === 'discom_agreement');
                        const uploaded = await handleFileUpload({ target: { files: [file], value: '' } }, 'discom_agreement');
                        if (uploaded) {
                            setShowAgreementPopup(false);
                            setAgreementAutoAdd(false);
                            showAlert(
                                replacing
                                    ? 'The DISCOM agreement was regenerated and replaced in Documents.'
                                    : 'The DISCOM agreement was generated and added to Documents.',
                                { title: 'Document saved', type: 'success' }
                            );
                        }
                    }}
                />
            )}

            {/* File Preview Modal */}
            {filePreview.doc && (
                <FilePreviewModal
                    file={filePreview.doc}
                    fileUrl={filePreview.url}
                    onClose={() => setFilePreview({ doc: null, url: null })}
                    onDownload={() => handleDownloadDoc(filePreview.doc)}
                    onUpdateRemark={handleUpdateDocRemark}
                />
            )}

            {/* Concurrency Conflict Resolution Modal */}
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
