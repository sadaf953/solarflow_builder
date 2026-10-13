import {missingStageRequirements} from '../demo/stageRequirements';
import { useDemoTourNavigation } from '../demo/tour';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { AgreementPreview } from './agreement/AgreementPreview';
import {
    User, Phone, Mail, MapPin, Zap, Building2, Home,
    CheckCircle2, ChevronRight, LogOut, Loader2, AlertCircle, AlertTriangle,
    Users, CreditCard, Hash, Folder, Tag, ChevronLeft, Plus, Search, 
    ChevronDown, ChevronUp, ClipboardList, Banknote, ShieldAlert, Paperclip, Eye, Download, X,
    ShoppingBag, Ruler, IndianRupee, Layers, Save, ClipboardCheck, Upload,
    Package, PauseCircle, Truck, Wrench, Camera, Send, Printer, FileText, FolderOpen, Terminal, Calculator
} from 'lucide-react';
import ToolboxView from './ToolboxView';
import { logActivity, toIndianCommas, formatInputValue, parseIndianNumber, uploadDocument, getCustomerDocuments, getDownloadUrl, getViewUrl, updateDocumentRemark, sanitizeAdminUpdate, normalizeMeterInstallation, downloadFileWithSaveAs, downloadDocumentsAsPdf } from '../utils';
import { DEFAULT_LEAD_FORM } from '../models';
import { PRIMARY_STAGES, STAGE_IDS, ADMIN_NUMERIC_COLUMNS } from '../constants';
import AddLeadModal from './AddLeadModal';
import QuotationModule, { openQuotations } from '../quotations/QuotationModule';
import { quotationRepository } from '../quotations/client';
import { FilePreviewModal, CheckboxRemarkItem } from './modal-tabs/shared';
import { useGlobalPopup } from './GlobalPopup';
import BrandMark from './BrandMark';
import LeadsTab from './modal-tabs/LeadsTab';
import RegistrationTab from './modal-tabs/RegistrationTab';
import LoanTab from './modal-tabs/LoanTab';
import CashTab from './modal-tabs/CashTab';
import MaterialOrderTab from './modal-tabs/MaterialOrderTab';
import HoldProcurementTab from './modal-tabs/HoldProcurementTab';
import MaterialDeliveryTab from './modal-tabs/MaterialDeliveryTab';
import InstallationStatusTab from './modal-tabs/InstallationStatusTab';
import GeoTagPhotoTab from './modal-tabs/GeoTagPhotoTab';
import DiscomSubmissionTab from './modal-tabs/DiscomSubmissionTab';
import MeterInstallationTab from './modal-tabs/MeterInstallationTab';
import DiscomInspectionTab from './modal-tabs/DiscomInspectionTab';
import SubsidyStatusTab from './modal-tabs/SubsidyStatusTab';
import FinalReviewTab from './modal-tabs/FinalReviewTab';
import AgentStageDetails from './AgentStageDetails';
import BomPrintModal from './BomPrintModal';
import { loadBomForCustomer, getBomTypeForCustomer } from '../utils/bom';

const parsePanelSerials = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(value => String(value || '').trim()).filter(Boolean);
    }
    const rawText = String(raw);
    try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
            return parsed.map(value => String(value || '').trim()).filter(Boolean);
        }
    } catch { /* not JSON */ }
    if (rawText.includes('\n')) {
        return rawText.split('\n').map(s => s.trim()).filter(Boolean);
    }
    const parts = rawText.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [rawText.trim()];
};

// Read-only parameter/value row used by the Material Integration cards, in the
// same label-left / value-right shape the other agent stage panels use.
function DetailRow({ label, value, children }) {
    return (
        <div className="flex items-start justify-between gap-3 py-2">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide leading-tight">{label}</span>
            <div className="font-semibold text-stone-900 text-right break-words min-w-0">
                {children ?? (value === null || value === undefined || value === '' ? '–' : value)}
            </div>
        </div>
    );
}

export default function AgentPortal({ user, onLogout, onOpenDevSwitcher, demoControls }) {
    useDemoTourNavigation(async ({view,stage,action},isCurrent) => {
        if (!['menu','workdesk','quotations'].includes(view)) return;
        setSelectedCust(null); setShowAddLead(false); setView(view); if (stage) setActiveWorkdeskTab(stage);
        if (view === 'quotations') openQuotations();
        if (action === 'addLead') setShowAddLead(true);
        if(action === 'customer'){
            let query=supabase.from('admin').select('*').is('deleted_at',null).eq('stage',stage);
            query=user.userType==='agent2' ? query.ilike('sub_channel_partner',user.name).ilike('channel_partner',user.channel_partner || '') : query.ilike('channel_partner',user.name);
            const {data,error}=await query.order('created_at').limit(1);
            if(!isCurrent())return;
            if(error)showAlert(error.message,{type:'error'});
            else if(data?.[0])handleSelectCustomerForStage(data[0],stage);
        }
        if(action === 'printBom'){
            let query=supabase.from('admin').select('*').is('deleted_at',null).eq('stage',stage || STAGE_IDS.MATERIAL_INTEGRATION);
            query=user.userType==='agent2' ? query.ilike('sub_channel_partner',user.name).ilike('channel_partner',user.channel_partner || '') : query.ilike('channel_partner',user.name);
            let {data,error}=await query.order('created_at').limit(1);
            if (!data?.length) {
                let fb = supabase.from('admin').select('*').is('deleted_at',null);
                fb = user.userType==='agent2' ? fb.ilike('sub_channel_partner',user.name).ilike('channel_partner',user.channel_partner || '') : fb.ilike('channel_partner',user.name);
                const res = await fb.order('created_at').limit(1);
                data = res.data;
            }
            if(!isCurrent())return;
            if(error)showAlert(error.message,{type:'error'});
            else if(data?.[0]){
                handleSelectCustomerForStage(data[0], STAGE_IDS.MATERIAL_INTEGRATION);
                setShowBomPrint(true);
            }
        }
    },user.userType);

    const { showAlert, showConfirm, showImageCropper } = useGlobalPopup();
    const [view, setView] = useState(() => typeof window !== 'undefined' && window.location.hash.startsWith('#/quotations') ? 'quotations' : 'menu');
    const [activeWorkdeskTab, setActiveWorkdeskTab] = useState(STAGE_IDS.LEADS);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddLead, setShowAddLead] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [homeSearchQuery, setHomeSearchQuery] = useState('');
    
    // Customer details view
    const [selectedCust, setSelectedCust] = useState(null);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [custDocs, setCustDocs] = useState([]);
    const [downloadingAllDocs, setDownloadingAllDocs] = useState(false);
    const [integrationBom, setIntegrationBom] = useState(null);
    const [integrationBomItems, setIntegrationBomItems] = useState([]);
    const [showBomPrint, setShowBomPrint] = useState(false);
    const [showAgreementPopup, setShowAgreementPopup] = useState(false);
    const [agreementData, setAgreementData] = useState({});
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [showStageSidebar, setShowStageSidebar] = useState(false);
    // The customer record retains its real CRM stage. This controls the stage
    // panel currently being viewed in the customer workdesk.
    const [activeCustomerStage, setActiveCustomerStage] = useState(null);
    const [activeDealerTab, setActiveDealerTab] = useState('ORDER'); // 'ORDER', 'METER', 'INSPECTION', 'PROFILE'
    const [editingSection, setEditingSection] = useState(null);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [uploadDocType, setUploadDocType] = useState('adhaar_card_front');
    const fileInputRef = useRef(null);
    const [validationIssues, setValidationIssues] = useState([]);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [validationNextStage, setValidationNextStage] = useState('');
    const [customAlert, setCustomAlert] = useState(null);

    useEffect(() => {
        if (view !== 'quotations' && window.location.hash.startsWith('#/quotations')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }, [view]);

    const handleChange = (field, val) => {
        setEditData(prev => ({ ...prev, [field]: val }));
    };

    const getStageRemarks = (value) => {
        if (value && typeof value === 'object') return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch { /* not valid JSON, fall through to default */ }
        }
        return {};
    };

    const handleSaveStageRemark = async () => {
        if (!selectedCust) return;
        const remarks = getStageRemarks(editData.stages_remarks);
        await handleUpdateCustomer(selectedCust.id, { stages_remarks: remarks });
    };

    // Metadata
    const [meta, setMeta] = useState({});

    // Scope follows the role that was selected for the account, nothing else.
    // This used to also infer Agent 2 from "channel_partner !== name", which
    // silently mis-scoped every Channel Partner working under a branch (their
    // branch name is not their own name) into sub-agent filtering.
    const isAgent2 = user?.userType === 'agent2';

    // Agent 2 only ever sees their own sub-agent records, so fall back to their
    // account name rather than showing a dash.
    const subChannelPartnerOf = (record) => (record?.sub_channel_partner || (isAgent2 ? user?.name : '') || '–');

    // Load agent's customers & metadata
    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const scopeValue = user?.name || '';
            if (!String(scopeValue).trim()) {
                setCustomers([]);
                setLoading(false);
                return;
            }
            const buildQuery = () => {
                let q = supabase.from('admin').select('*').is('deleted_at', null).order('updated_at', { ascending: false }).order('created_at', { ascending: false });
                const myName = (user?.name || '').trim();
                const userId = user?.demo_profile_id || user?.id;

                if (isAgent2) {
                    // Dealer: match by permanent profile ID first, or name + registered branch
                    const myBranch = (user?.channel_partner || '').trim();
                    if (userId) {
                        q = q.or(`lead_creator_profile_id.eq.${userId},and(sub_channel_partner.ilike.${myName},channel_partner.ilike.${myBranch})`);
                    } else {
                        q = q.ilike('sub_channel_partner', myName)
                            .ilike('channel_partner', myBranch);
                    }
                } else {
                    // Independent Channel Partner: match by profile ID or channel_partner name
                    if (userId) {
                        q = q.or(`lead_creator_profile_id.eq.${userId},channel_partner.ilike.${myName}`);
                    } else {
                        q = q.ilike('channel_partner', myName);
                    }
                }
                return q;
            };

            let data = [];
            let from = 0;
            const pageSize = 1000;
            let fetchError = null;
            while (true) {
                const { data: page, error } = await buildQuery().range(from, from + pageSize - 1);
                if (error) { fetchError = error; break; }
                if (!page || page.length === 0) break;
                data = data.concat(page);
                if (page.length < pageSize) break;
                from += pageSize;
            }

            if (!fetchError) {
                setCustomers(data);
            } else {
                console.error('Error fetching customers:', fetchError);
            }
        } catch (err) {
            console.error('Error fetching customers:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user?.name) return;

        fetchCustomers();

        const myName = (user.name || '').trim().toLowerCase();
        const partnerName = (user.channel_partner || user.name || '').trim().toLowerCase();
        const channel = supabase.channel(`agent_customers_${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin' }, payload => {
                const record = payload.new;
                const custCp = (record?.channel_partner || '').trim().toLowerCase();
                const custSubCp = (record?.sub_channel_partner || '').trim().toLowerCase();

                const belongsToAgent = record && !record.deleted_at && (
                    isAgent2
                        ? (custSubCp === myName && custCp === partnerName)
                        : custCp === myName
                );

                setCustomers(previous => {
                    if (payload.eventType === 'DELETE' || !belongsToAgent) {
                        return previous.filter(customer => customer.id !== (record?.id || payload.old?.id));
                    }
                    const exists = previous.some(customer => customer.id === record.id);
                    if (payload.eventType === 'INSERT' && !exists) return [record, ...previous];
                    return previous.map(customer => customer.id === record.id ? record : customer);
                });
            })
            .subscribe();

        const onFocus = () => {
            if (document.visibilityState === 'visible') {
                fetchCustomers();
            }
        };
        document.addEventListener('visibilitychange', onFocus);
        window.addEventListener('focus', onFocus);

        return () => {
            supabase.removeChannel(channel);
            document.removeEventListener('visibilitychange', onFocus);
            window.removeEventListener('focus', onFocus);
        };
    }, [user, isAgent2]);

    useEffect(() => {
        const fetchMetadata = async () => {
            const { data, error } = await supabase
                .from('metadata')
                .select('category, label');
            if (!error && data) {
                const grouped = {};
                data.forEach(({ category, label }) => {
                    if (!grouped[category]) grouped[category] = [];
                    grouped[category].push(label);
                });
                setMeta(grouped);
            }
        };
        fetchMetadata();
    }, [user?.id, user?.name, user?.channel_partner, isAgent2]);

    // Sync selectedCust state with fresh database values when updates occur
    useEffect(() => {
        if (selectedCust) {
            const fresh = customers.find(c => c.id === selectedCust.id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedCust)) {
                setSelectedCust(fresh);
            }
        }
    }, [customers]);

    // Load documents and sync customer data when a customer profile is opened
    useEffect(() => {
        if (selectedCust?.id) {
            setLoadingDocs(true);
            getCustomerDocuments(selectedCust.id)
                .then(docs => setCustDocs(docs || []))
                .finally(() => setLoadingDocs(false));

            setEditData({ ...selectedCust });
            setActiveCustomerStage(selectedCust.stage === STAGE_IDS.COMPLETED ? STAGE_IDS.LEADS : selectedCust.stage);

            if (selectedCust.stage === STAGE_IDS.MATERIAL_ORDER) {
                setActiveDealerTab('ORDER');
            } else if (selectedCust.stage === STAGE_IDS.METER_INSTALLATION) {
                setActiveDealerTab('METER');
            } else if (selectedCust.stage === STAGE_IDS.DISCOM_INSPECTION) {
                setActiveDealerTab('INSPECTION');
            } else {
                setActiveDealerTab('LEAD_INFO');
            }
        } else {
            setCustDocs([]);
            setEditData({});
            setActiveCustomerStage(null);
        }
    }, [selectedCust?.id]);

    // Material Integration is view-only for Channel Partners. Load its BOM
    // milestones so the same operational information is visible as in Vendor Portal.
    useEffect(() => {
        const stageBeingViewed = activeCustomerStage || selectedCust?.stage;
        if (!selectedCust?.id || stageBeingViewed !== STAGE_IDS.MATERIAL_INTEGRATION) {
            setIntegrationBom(null);
            setIntegrationBomItems([]);
            return;
        }

        const loadIntegrationBom = async () => {
            const merged = { ...selectedCust, ...editData };
            const { bom, items } = await loadBomForCustomer(merged, getBomTypeForCustomer(merged));
            setIntegrationBom(bom);
            setIntegrationBomItems(items);
        };
        loadIntegrationBom();
    }, [selectedCust?.id, selectedCust?.stage, selectedCust?.roof_shed, activeCustomerStage]);

    // Roof vs Shed is derived from the Material Order spec, exactly as the
    // admin Material Integration tab derives it, so both print the same BOM.
    // Unsaved edits win over the stored record, matching the admin tab.
    const stageData = { ...selectedCust, ...editData };
    const integrationBomType = getBomTypeForCustomer(stageData);
    const miPanelSerials = parsePanelSerials(stageData.panel_serial_no);

    // Loan payments live as entries inside loan_history, keyed by status -
    // the same structure the admin Loan tab reads.
    const loanPaymentFor = (status) => (Array.isArray(stageData.loan_history) ? stageData.loan_history : [])
        .find(entry => entry.status === status) || {};

    const handleUpdateCustomer = async (id, updates) => {
        setSaving(true);
        // Strip anything that is not a real `admin` column first. PostgREST
        // rejects the entire update if one key is unknown, so without this a
        // single stale field fails the whole save instead of just itself.
        const cleanUpdates = sanitizeAdminUpdate(updates);
        // PostgreSQL date columns accept a date or NULL, never an empty string.
        Object.keys(cleanUpdates).forEach(key => {
            if ((key === 'date' || key.endsWith('_date')) && cleanUpdates[key] === '') {
                cleanUpdates[key] = null;
            }
        });
        // Numeric columns reject '' the same way date columns do. Clearing a
        // phone number or folder number here used to fail the entire save.
        ADMIN_NUMERIC_COLUMNS.forEach(field => {
            if (cleanUpdates[field] === '' || cleanUpdates[field] === null) {
                cleanUpdates[field] = null;
            } else if (cleanUpdates[field] !== undefined) {
                // parseIndianNumber returns '' for unparseable input, not NaN.
                const parsed = parseIndianNumber(cleanUpdates[field]);
                cleanUpdates[field] = (parsed === '' || Number.isNaN(parsed)) ? null : parsed;
            }
        });
        try {
            const { data: savedRow, error } = await supabase
                .from('admin')
                .update(cleanUpdates)
                .eq('id', id)
                .select('id')
                .maybeSingle();

            if (error) throw error;
            if (!savedRow?.id) throw new Error('No customer row was updated. Please sign in with a real Agent account and try again.');

            setSelectedCust(prev => ({ ...prev, ...cleanUpdates }));
            setEditData(prev => ({ ...prev, ...cleanUpdates }));
            // The server has already confirmed the update. Keep the local list
            // in sync instead of downloading every lead again after each edit.
            setCustomers(prev => prev.map(customer => customer.id === id ? { ...customer, ...cleanUpdates } : customer));
            return true;
        } catch (err) {
            console.error('Update failed:', err);
            console.error('Update error details:', {
                code: err?.code,
                message: err?.message,
                details: err?.details,
                hint: err?.hint,
                fields: Object.keys(cleanUpdates),
            });
            setCustomAlert({
                title: 'Update Failed',
                message: [err?.message, err?.details, err?.hint].filter(Boolean).join('\n') || 'Could not save changes to the database.',
                type: 'error'
            });
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Submit new lead from AddLeadModal
    const handleSubmitLead = async (formData, attachedFiles = [], quotation = null) => {
        const parentCp = user.channel_partner || user.name;
        const subCp = user.name;

        const leadData = {
            ...formData,
            channel_partner: parentCp,
            sub_channel_partner: subCp,
            application_done_by: user.name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Clean up or format numeric values safely
        if (leadData.system_capacity_kwp !== undefined && leadData.system_capacity_kwp !== null && leadData.system_capacity_kwp !== '') {
            leadData.system_capacity_kwp = parseIndianNumber(leadData.system_capacity_kwp);
        }
        if (leadData.module_wp !== undefined && leadData.module_wp !== null && leadData.module_wp !== '') {
            leadData.module_wp = parseIndianNumber(leadData.module_wp);
        }
        if (leadData.no_of_modules !== undefined && leadData.no_of_modules !== null && leadData.no_of_modules !== '') {
            leadData.no_of_modules = parseIndianNumber(leadData.no_of_modules);
        }

        // Map empty strings to null to avoid database numeric/type syntax errors
        const insertData = {};
        Object.keys(leadData).forEach(key => {
            if (leadData[key] === '') {
                insertData[key] = null;
            } else {
                insertData[key] = leadData[key];
            }
        });

        // Ensure created_at and updated_at are never null
        const nowIso = new Date().toISOString();
        if (!insertData.created_at) insertData.created_at = nowIso;
        if (!insertData.updated_at) insertData.updated_at = nowIso;

        // The quotation branch is retained for the deferred Add to Leads feature.
        const { data: newCustomer, error } = quotation
            ? await quotationRepository.insertConversionLead(quotation, insertData, user)
            : await supabase.from('admin').insert(insertData).select().single();

        if (error) {
            console.error('Submit error:', error);
            throw error;
        }

            // Collect the failures instead of swallowing them. The lead is
        // already created and must not be rolled back, but the user has to
        // be told WHICH documents did not store - otherwise their only copy
        // is the file picker in a modal that is about to close.
        if (attachedFiles && attachedFiles.length > 0) {
            const failedUploads = [];
            await Promise.all(attachedFiles.map(async item => {
            if (item.file) {
                try {
                    await uploadDocument(item.file, newCustomer.id, item.doc_type, user?.id);
                } catch (uploadErr) {
                    console.error('Failed to upload file for new lead:', uploadErr);
                    failedUploads.push(item.file.name || item.doc_type || 'a document');
                }
            }
            }));
            if (failedUploads.length > 0) {
            setCustomAlert({
                title: 'Some documents did not upload',
                message:
                    `The lead was saved, but ${failedUploads.length} document(s) did NOT upload: `
                    + failedUploads.join(', ')
                    + '. Open the customer and attach them again.',
                type: 'error'
            });
            }
        }

        setCustomers(prev => prev.some(customer => customer.id === newCustomer.id) ? prev : [newCustomer, ...prev]);
        setShowAddLead(false);

        void logActivity(
            user.id,
            'create',
            `Added new lead: ${formData.customer_name}`,
            `Done by Agent: ${user.name}`,
            newCustomer.id
        );

        return newCustomer;
    };

    // The workdesk search is intentionally stage-scoped. The home search below
    // is the directory-wide search across every customer visible through RLS.
    const filteredCustomers = (customers || []).filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return (
            String(c?.customer_name || '').toLowerCase().includes(q) ||
            String(c?.phone_number || '').toLowerCase().includes(q) ||
            String(c?.consumer_no || '').toLowerCase().includes(q)
        );
    });

    const homeSearchResults = homeSearchQuery.trim()
        ? (customers || []).filter(c => {
            const q = homeSearchQuery.trim().toLowerCase();
            return (
                String(c?.customer_name || '').toLowerCase().includes(q) ||
                String(c?.phone_number || '').toLowerCase().includes(q) ||
                String(c?.consumer_no || '').toLowerCase().includes(q)
            );
        })
        : [];

    const getTelephoneHref = (phone) => {
        const normalized = String(phone || '').replace(/[^\d+]/g, '');
        return normalized && /\d/.test(normalized) ? `tel:${normalized}` : null;
    };

    const renderPhoneLink = (phone, className = 'font-semibold text-stone-900') => {
        const href = getTelephoneHref(phone);
        if (!href) return <span className={className}>{phone || '–'}</span>;
        return (
            <a
                href={href}
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                title={`Click to call ${phone}`}
            >
                <Phone size={11} className="text-emerald-500 shrink-0" />
                <span>{phone}</span>
            </a>
        );
    };

    // Group by stage
    const getCustomersByStage = (stageId) => {
        return filteredCustomers.filter(c => c.stage === stageId);
    };

    const handlePreviewFile = async (doc) => {
        if (!doc?.storage_path) {
            showAlert('This document has no stored file to preview.', { title: 'Preview Unavailable', type: 'error' });
            return;
        }
        try {
            const url = await getViewUrl(doc.storage_path);
            if (!url) throw new Error('Could not generate a secure link for this document. Please try again.');
            setPreviewDoc({ doc, url });
        } catch (err) {
            console.error('Preview failed:', err);
            showAlert(err.message || 'Could not open this document.', { title: 'Preview Failed', type: 'error' });
        }
    };

    // These five columns are BOOLEAN checklist flags, not storage paths. The
    // real file lives in `documents` under one of several doc_type aliases.
    //
    // The JSX used to do href={getViewUrl(selectedCust.stamp)} - two bugs at
    // once: it passed a boolean to a function that calls .startsWith on it
    // (TypeError), and getViewUrl is async, so href received a Promise rather
    // than a URL. The icon rendered on 3,278 records and went nowhere.
    const FLAG_DOC_TYPES = {
        vendor_feasibility: ['vendor_feasibility'],
        site_feasibility:   ['site_feasibility'],
        dcr_certificate:    ['dcr_certificate', 'dcr'],
        signature_pic:      ['signature_pic', 'signature', 'firstPartySignature', 'customer_signature'],
        stamp:              ['stamp', 'stamp_pic', 'vendor_stamp', 'secondPartyStamp'],
    };

    const findFlagDoc = (flag) => {
        const types = FLAG_DOC_TYPES[flag] || [];
        return (custDocs || []).find(d => types.includes(d.doc_type));
    };

    // Renders a working download button only when the file is actually there.
    const FlagDownload = ({ flag }) => {
        const doc = findFlagDoc(flag);
        if (!doc) return null;
        return (
            <button
                type="button"
                onClick={() => handleDownloadDoc(doc)}
                className="text-blue-500 hover:text-blue-700 p-1 cursor-pointer"
                title={`Download ${doc.file_name}`}
            >
                <Download size={14} />
            </button>
        );
    };

    const handleDownloadDoc = async (doc) => {
        if (!doc?.storage_path) {
            showAlert('This document has no stored file to download.', { title: 'Download Unavailable', type: 'error' });
            return;
        }
        const url = await getDownloadUrl(doc.storage_path, doc.file_name);
        if (!url) {
            showAlert('Could not generate a download link for this document.', { title: 'Download Failed', type: 'error' });
            return;
        }
        await downloadFileWithSaveAs(url, doc.file_name);
    };

    const handleDownloadAllDocs = async () => {
        if (!['agent', 'agent2'].includes(user?.userType)) return;
        if (downloadingAllDocs) return;
        setDownloadingAllDocs(true);
        try {
            const result = await downloadDocumentsAsPdf(custDocs, selectedCust?.customer_name);
            if (result.failed.length > 0) {
                showAlert(`${result.downloaded} document(s) downloaded; ${result.failed.length} could not be included.`, { type: 'warning' });
            }
        } catch (error) {
            showAlert(error?.message || 'The documents could not be downloaded.', { title: 'Download Failed', type: 'error' });
        } finally {
            setDownloadingAllDocs(false);
        }
    };

    const handleUploadDocForCustomer = async (e, docType) => {
        // Enforce document edit permissions
        if (![STAGE_IDS.LEADS, STAGE_IDS.REGISTRATION].includes(activeCustomerStage) && 
            !([STAGE_IDS.METER_INSTALLATION].includes(activeCustomerStage) && docType.includes('meter')) &&
            !([STAGE_IDS.DISCOM_SUBMISSION, STAGE_IDS.DISCOM_INSPECTION].includes(activeCustomerStage) && (docType.includes('signature') || docType.includes('stamp') || docType.includes('dcr')))) {
            setCustomAlert({ title: 'Permission Denied', message: 'You can only upload lead documents during the Leads and Registration stages.', type: 'error' });
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const rawFile = e.target.files?.[0];
        if (!rawFile || !selectedCust?.id) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: 'Crop & Adjust Customer Document' });
            if (!file) return; // User cancelled upload
        }

        setUploadingDoc(true);
        try {
            await uploadDocument(file, selectedCust.id, docType || uploadDocType, user?.id);
            const updatedDocs = await getCustomerDocuments(selectedCust.id);
            setCustDocs(updatedDocs || []);
        } catch (err) {
            console.error('Upload failed:', err);
            setCustomAlert({
                title: 'Upload Failed',
                message: err.message || 'Failed to upload the document.',
                type: 'error'
            });
        } finally {
            setUploadingDoc(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteDoc = async (doc) => {
        const wasReturned = String(doc?.remark || '').trim().toUpperCase().startsWith('[RETURNED]');
        if (!wasReturned) {
            setCustomAlert({
                title: 'Permission Denied',
                message: 'This document is locked. Admin or Office must send it back before it can be replaced.',
                type: 'warning'
            });
            return false;
        }
        try {
            const { deleteDocument } = await import('../utils');
            const res = await deleteDocument(doc.id, doc.storage_path);
            if (!res?.ok) {
                setCustomAlert({ title: 'Replacement Failed', message: res?.error?.message || 'The old document could not be removed.', type: 'error' });
                return false;
            }
            setCustDocs(prev => prev.filter(item => item.id !== doc.id));
            return true;
        } catch (err) {
            setCustomAlert({ title: 'Replacement Failed', message: err.message || 'Could not replace the returned document.', type: 'error' });
            return false;
        }
    };

    const handleUpdateDocRemark = async (docId, newRemark) => {
        const res = await updateDocumentRemark(docId, newRemark);
        if (!res?.ok) {
            setCustomAlert({ title: 'Remark not saved', message: res?.error?.message || 'The remark was not saved.', type: 'error' });
            return false;
        }
        setCustDocs(prev => prev.map(d => d.id === docId ? { ...d, remark: newRemark } : d));
        return true;
    };

    // State moved to top

    const handleSelectCustomerForStage = (cust, stageTab) => {
        setEditData({});
        setActiveCustomerStage(stageTab === STAGE_IDS.COMPLETED ? STAGE_IDS.LEADS : stageTab);
        setSelectedCust(cust);
    };

    // Filter customers for workdesk
    const getWorkdeskCustomers = (stageTab) => {
        return filteredCustomers.filter(c => c.stage === stageTab);
    };

    const leadsCount = customers.filter(c => c.stage === STAGE_IDS.LEADS).length;
    const registrationCount = customers.filter(c => c.stage === STAGE_IDS.REGISTRATION).length;
    const materialOrderCount = customers.filter(c => c.stage === STAGE_IDS.MATERIAL_ORDER).length;
    const materialIntegrationCount = customers.filter(c => c.stage === STAGE_IDS.MATERIAL_INTEGRATION).length;
    const materialDeliveryCount = customers.filter(c => c.stage === STAGE_IDS.MATERIAL_DELIVERY).length;
    const meterPendingCount = customers.filter(c => c.stage === STAGE_IDS.METER_INSTALLATION).length;
    const inspPendingCount = customers.filter(c => c.stage === STAGE_IDS.DISCOM_INSPECTION).length;
    const operationalQueueCount = materialOrderCount + meterPendingCount + inspPendingCount;
    const inProgressCount = materialIntegrationCount + materialDeliveryCount + meterPendingCount + inspPendingCount;
    const priorityWorkdeskTab = meterPendingCount > 0
        ? 'METER_INSTALLATION'
        : inspPendingCount > 0
            ? 'DISCOM_INSPECTION'
            : materialOrderCount > 0
                ? 'MATERIAL_ORDER'
                : STAGE_IDS.LEADS;
    const displayedStage = activeCustomerStage || selectedCust?.stage;
    const customerStageNavigation = PRIMARY_STAGES;
    const currentStageIdx = PRIMARY_STAGES.findIndex(s => s.id === selectedCust?.stage);
    const displayedStageIdx = PRIMARY_STAGES.findIndex(s => s.id === displayedStage);
    const isFutureStage = currentStageIdx !== -1 && displayedStageIdx !== -1 && displayedStageIdx > currentStageIdx;

    const renderStatusBadge = (val, defaultVal = 'Pending') => {
        const status = val || defaultVal;
        const sLower = String(status).toLowerCase();
        const isYesOrDone = ['yes', 'completed', 'sanctioned', 'approved', 'received', 'redeemed', 'delivered', 'integrated', 'submitted'].includes(sLower);
        const isNoOrRejected = ['no', 'rejected', 'returned'].includes(sLower);

        let colorClasses = 'bg-amber-50 text-amber-800 border-amber-200';
        if (isYesOrDone) {
            colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        } else if (isNoOrRejected) {
            colorClasses = 'bg-rose-50 text-rose-800 border-rose-200';
        }

        return (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${colorClasses}`}>
                {status}
            </span>
        );
    };

    const isMaterialOrderDirty = () => {
        if (!selectedCust) return false;
        const currentData = {
            roof_shed: selectedCust.roof_shed || '',
            dc_cable: selectedCust.dc_cable || '',
            ac_cable: selectedCust.ac_cable || '',
            structure_front_leg_height: selectedCust.structure_front_leg_height || '',
            structure_rear_leg_height: selectedCust.structure_rear_leg_height || '',
            invoice_value: selectedCust.invoice_value || '',
            material_order_notes: selectedCust.material_order_notes || ''
        };
        const editingData = {
            roof_shed: editData.roof_shed ?? currentData.roof_shed,
            dc_cable: editData.dc_cable ?? currentData.dc_cable,
            ac_cable: editData.ac_cable ?? currentData.ac_cable,
            structure_front_leg_height: editData.structure_front_leg_height ?? currentData.structure_front_leg_height,
            structure_rear_leg_height: editData.structure_rear_leg_height ?? currentData.structure_rear_leg_height,
            invoice_value: editData.invoice_value ?? currentData.invoice_value,
            material_order_notes: editData.material_order_notes ?? currentData.material_order_notes
        };
        return Object.keys(editingData).some(k => String(editingData[k]) !== String(currentData[k]));
    };

    // Agent-portal stage moves were invisible in the activity log: the only
    // logActivity call in this file was at lead creation, so a customer could
    // travel Material Order -> Material Integration -> Meter Installation ->
    // Discom Inspection -> Subsidy Status leaving no trace of who moved them.
    const logStageMove = async (fromStage, toStage) => {
        if (!selectedCust || fromStage === toStage) return;
        await logActivity(
            user.id,
            'stage_change',
            `${selectedCust.customer_name}: STAGE: ${fromStage} → ${toStage}`,
            `Done by ${user.name}`,
            selectedCust.id
        );
    };

    const handleSaveMaterialOrder = async (advance = false) => {
        if (!selectedCust) return false;

        const updates = {
            roof_shed: editData.roof_shed ?? selectedCust.roof_shed,
            dc_cable: editData.dc_cable ?? selectedCust.dc_cable,
            ac_cable: editData.ac_cable ?? selectedCust.ac_cable,
            structure_front_leg_height: editData.structure_front_leg_height ?? selectedCust.structure_front_leg_height,
            structure_rear_leg_height: editData.structure_rear_leg_height ?? selectedCust.structure_rear_leg_height,
            invoice_value: editData.invoice_value ?? selectedCust.invoice_value,
            material_order_notes: editData.material_order_notes ?? selectedCust.material_order_notes,
        };

        if (advance) {
            const issues = missingStageRequirements('MATERIAL ORDER', updates);

            if (issues.length) {
                setValidationIssues(issues);
                setValidationNextStage('Material Integration');
                setShowValidationModal(true);
                return false;
            }
            updates.stage = STAGE_IDS.MATERIAL_INTEGRATION;
        }

        const didSave = await handleUpdateCustomer(selectedCust.id, {
            ...updates,
            dc_cable: parseIndianNumber(updates.dc_cable),
            ac_cable: parseIndianNumber(updates.ac_cable),
            invoice_value: parseIndianNumber(updates.invoice_value),
        });
        
        if (didSave && advance) {
            await logStageMove(selectedCust.stage, STAGE_IDS.MATERIAL_INTEGRATION);
            setActiveCustomerStage(STAGE_IDS.MATERIAL_INTEGRATION);
        }
        // MUST return: saveBeforeAgentExit gates Save & Logout / Save & Close on
        // this value. Returning undefined meant a Dealer with unsaved Material
        // Order edits clicked Logout, confirmed Save, the save SUCCEEDED - and
        // they were not logged out. The button looked dead.
        return didSave;
    };


    const getMeterInstallationUpdates = () => {
        const meterPhotoUploaded = custDocs.some(doc =>
            doc.doc_type === 'meter_installation_photo' || doc.doc_type === 'meter_photo'
        );
        return {
            meter_installation: editData.meter_installation ?? selectedCust?.meter_installation ?? '',
            installation_date: editData.installation_date ?? selectedCust?.installation_date ?? '',
            meter_installation_photo: meterPhotoUploaded,
        };
    };

    const handleSaveMeterInstallation = async (moveToNextStage = false) => {
        if (!selectedCust) return false;
        const updates = getMeterInstallationUpdates();

        if (moveToNextStage) {
            const issues = [];
            const requireField = (condition, label) => { if (!condition) issues.push(label); };
            requireField(normalizeMeterInstallation(updates.meter_installation) === 'Yes', 'Meter Installation must be Yes');
            requireField(updates.installation_date, 'Meter Installation Date');
            requireField(updates.meter_installation_photo, 'Meter Installation Photo');
            if (issues.length) {
                setValidationIssues(issues);
                setValidationNextStage('Discom Inspection');
                setShowValidationModal(true);
                return false;
            }
            updates.stage = STAGE_IDS.DISCOM_INSPECTION;
        }

        const didSave = await handleUpdateCustomer(selectedCust.id, updates);
        if (didSave && moveToNextStage) {
            await logStageMove(selectedCust.stage, STAGE_IDS.DISCOM_INSPECTION);
            setActiveCustomerStage(STAGE_IDS.DISCOM_INSPECTION);
        }
        return didSave;
    };

    const handleSaveDiscomInspection = async (moveToNextStage = false) => {
        if (!selectedCust) return false;
        const updates = {
            discom_inspection: editData.discom_inspection ?? selectedCust.discom_inspection ?? '',
        };

        if (moveToNextStage) {
            if (updates.discom_inspection !== 'Yes') {
                setValidationIssues(['Discom Inspection must be Yes']);
                setValidationNextStage('Subsidy Status');
                setShowValidationModal(true);
                return false;
            }
            updates.stage = STAGE_IDS.SUBSIDY_STATUS;
        }

        const didSave = await handleUpdateCustomer(selectedCust.id, updates);
        if (didSave && moveToNextStage) {
            await logStageMove(selectedCust.stage, STAGE_IDS.SUBSIDY_STATUS);
            // This is the last Stage Operations task, so return to its filtered list.
            setSelectedCust(null);
            setActiveCustomerStage(null);
            setActiveWorkdeskTab('DISCOM_INSPECTION');
        }
        return didSave;
    };

    const isMeterInstallationDirty = () => {
        if (!selectedCust) return false;
        const updates = getMeterInstallationUpdates();
        return updates.meter_installation !== (selectedCust.meter_installation || '') ||
            updates.installation_date !== (selectedCust.installation_date || '') ||
            Boolean(editData.meter_installation_photo) !== Boolean(selectedCust.meter_installation_photo);
    };

    const isDiscomInspectionDirty = () => selectedCust &&
        (editData.discom_inspection ?? selectedCust.discom_inspection ?? '') !== (selectedCust.discom_inspection || '');

    const handleGenerateAgreementPreview = async () => {
        if (!selectedCust) return;
        const sigDoc = custDocs.find(d =>
            d.doc_type === 'signature_pic' ||
            d.doc_type === 'signature' ||
            d.doc_type === 'firstPartySignature' ||
            d.doc_type === 'customer_signature'
        );
        const stampDoc = custDocs.find(d =>
            d.doc_type === 'stamp' ||
            d.doc_type === 'stamp_pic' ||
            d.doc_type === 'vendor_stamp' ||
            d.doc_type === 'secondPartyStamp'
        );
        const gpaStampDoc = custDocs.find(d =>
            d.doc_type === 'pm_surya_ghar_stamp' ||
            d.doc_type === 'surya_ghar_stamp' ||
            d.doc_type === 'ghar_stamp'
        );

        const sigUrl = sigDoc ? await getViewUrl(sigDoc.storage_path) : '';
        const stampUrl = stampDoc ? await getViewUrl(stampDoc.storage_path) : '';
        const gpaStampUrl = gpaStampDoc ? await getViewUrl(gpaStampDoc.storage_path) : '';

        const rawDate = editData?.stages_remarks?.discom_agreement_date || new Date().toISOString().split('T')[0];
        const [y, m, d] = rawDate.split('-');
        const formattedDate = (y && m && d) ? `${d}-${m}-${y}` : rawDate;

        setAgreementData({
            executionDate: formattedDate,
            consumerName: selectedCust.customer_name || '',
            consumerNo: selectedCust.consumer_no || '',
            village: selectedCust.villages || '',
            taluka: selectedCust.sub_divisions || '',
            district: selectedCust.district || '',
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
        setShowAgreementPopup(true);
    };

    const saveBeforeAgentExit = async (confirmLabel) => {
        const meterDirty = displayedStage === STAGE_IDS.METER_INSTALLATION && isMeterInstallationDirty();
        const inspectionDirty = displayedStage === STAGE_IDS.DISCOM_INSPECTION && isDiscomInspectionDirty();
        const materialOrderDirty = displayedStage === STAGE_IDS.MATERIAL_ORDER && isMaterialOrderDirty();
        if (!meterDirty && !inspectionDirty && !materialOrderDirty) return true;
        const shouldSave = await showConfirm('You have unsaved changes on this stage. Save them before leaving?', {
            title: 'Unsaved changes',
            confirmLabel,
            cancelLabel: 'Keep Editing',
            type: 'success'
        });
        if (!shouldSave) return false;
        // Previously this fell through to the Discom Inspection save whenever
        // Material Order was the dirty stage, saving the wrong thing.
        if (meterDirty) return handleSaveMeterInstallation(false);
        if (inspectionDirty) return handleSaveDiscomInspection(false);
        return handleSaveMaterialOrder(false);
    };


    return (
        <>
            {view === 'menu' && (
                <div className="min-h-screen bg-[#FCFBFA] text-stone-850 font-sans flex flex-col pb-8">
                    <header className="bg-white border-b border-stone-100 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-sm">
                <BrandMark label={isAgent2 ? 'Dealer Portal' : 'Channel Partner Portal'} />
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-stone-600 truncate max-w-[120px]">{user.name}</span>
                    <button
                        onClick={async () => { if (await saveBeforeAgentExit('Save & Logout')) onLogout(); }}
                        className="p-2 text-stone-400 hover:text-red-500 transition-colors rounded-xl hover:bg-stone-50 cursor-pointer"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            <div className="demo-portal-controls">{demoControls}</div>
            </header>
                    {/* Menu View (Clean Action Cards) */}
            
                <main className="flex-1 w-full max-w-md mx-auto p-4 space-y-4 animate-in fade-in duration-300">
                    <section className="relative overflow-hidden rounded-[28px] bg-stone-950 px-5 py-6 text-white shadow-xl shadow-stone-900/10">
                        <div className="absolute -right-10 -top-12 h-52 w-52 rounded-full bg-amber-400/20 blur-2xl" />
                        <div className="absolute -bottom-16 right-24 h-40 w-40 rounded-full border-[18px] border-amber-400/10" />
                        <div className="relative space-y-5">
                            <div className="max-w-xl">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">
                                    {isAgent2 ? 'Dealer workspace' : 'Channel Partner workspace'}
                                </p>
                                <h2 className="mt-2 text-2xl font-black tracking-tight">Good to see you, {user.name}.</h2>
                                <p className="mt-2 max-w-lg text-sm font-medium leading-relaxed text-stone-300">
                                    {isAgent2 
                                        ? 'A focused view of your field leads, partner pipeline, and customer work that needs attention today.'
                                        : 'A focused view of your pipeline, pending hand-offs, and the customer work that needs attention today.'
                                    }
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setActiveWorkdeskTab(priorityWorkdeskTab); setView('workdesk'); }}
                                    className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-xs font-black text-stone-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 active:scale-[0.98] cursor-pointer"
                                >
                                    <Layers size={15} /> Open work queue <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddLead(true)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white/15 hover:bg-white/25 px-3.5 py-3 text-xs font-bold text-white transition active:scale-[0.98] cursor-pointer border border-white/20"
                                >
                                    <Plus size={15} /> Add customer
                                </button>
                            </div>
                        </div>
                    </section>

                    <button type="button" onClick={() => { openQuotations(); setView('quotations'); }} className="w-full flex items-center gap-3 rounded-2xl bg-blue-950 text-white p-5 text-left shadow-sm"><FileText size={24} /><span className="flex-1"><strong className="block text-base">Quotation Maker</strong><span className="text-xs text-blue-200">Create, share and follow up on solar quotations</span></span><ChevronRight size={18} /></button>
                    <button type="button" onClick={() => setView('toolbox')} className="w-full flex items-center gap-3 rounded-2xl bg-amber-500 text-stone-950 p-5 text-left shadow-sm mt-3"><Calculator size={24} /><span className="flex-1"><strong className="block text-base font-bold">Solar Toolbox</strong><span className="text-xs text-amber-950/80">EMI &amp; GST calculators, solar savings, payment receipts &amp; warranty cards</span></span><ChevronRight size={18} /></button>

                    <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                        <div className="mb-3">
                            <p className="text-xs font-black text-stone-900">Find any customer</p>
                            <p className="mt-0.5 text-[10px] font-medium text-stone-400">Search every customer visible to you, across all stages.</p>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                                type="search"
                                placeholder="Search name, phone or consumer no..."
                                value={homeSearchQuery}
                                onChange={(event) => setHomeSearchQuery(event.target.value)}
                                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-9 pr-9 text-xs font-semibold text-stone-800 placeholder-stone-400 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                            />
                            {homeSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setHomeSearchQuery('')}
                                    aria-label="Clear customer search"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {homeSearchQuery.trim() && (
                            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                                {homeSearchResults.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-stone-200 px-3 py-5 text-center text-[11px] font-semibold text-stone-400">
                                        No matching customers found.
                                    </div>
                                ) : homeSearchResults.map(cust => (
                                    <button
                                        type="button"
                                        key={cust.id}
                                        onClick={() => handleSelectCustomerForStage(cust, cust.stage)}
                                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/40"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-black text-stone-900">{cust.customer_name || 'Unnamed Customer'}</span>
                                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-stone-400">
                                                {[cust.phone_number, cust.consumer_no].filter(Boolean).join(' · ') || 'No phone or consumer number'}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            <span className="max-w-[92px] truncate rounded-full bg-stone-100 px-2 py-1 text-[9px] font-black uppercase text-stone-500">
                                                {PRIMARY_STAGES.find(stage => stage.id === cust.stage)?.label || cust.stage || 'Unknown stage'}
                                            </span>
                                            <ChevronRight size={14} className="text-stone-400" />
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Total customers', value: customers.length, icon: Users, tone: 'bg-stone-100 text-stone-700' },
                            { label: 'Material Orders', value: getCustomersByStage(STAGE_IDS.MATERIAL_ORDER).length, icon: ShoppingBag, tone: 'bg-amber-50 text-amber-700' },
                            { label: 'Discom Subs', value: getCustomersByStage(STAGE_IDS.DISCOM_SUBMISSION).length, icon: Send, tone: 'bg-blue-50 text-blue-700' },
                            { label: 'Meter Installs', value: getCustomersByStage(STAGE_IDS.METER_INSTALLATION).length, icon: Zap, tone: 'bg-emerald-50 text-emerald-700' },
                        ].map(({ label, value, icon: Icon, tone }) => (
                            <div key={label} className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon size={15} /></div>
                                <p className="mt-3 text-2xl font-black tracking-tight text-stone-900">{value}</p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
                            </div>
                        ))}
                    </section>

                    <section className="space-y-3">
                        <div className="grid gap-3">
                            <button onClick={() => setShowAddLead(true)} className="group flex items-center justify-between rounded-2xl bg-amber-500 p-4 text-left text-white shadow-md shadow-amber-500/20 transition hover:bg-amber-600 active:scale-[0.99] cursor-pointer">
                                <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><Plus size={18} /></span><span><span className="block text-xs font-black">Add customer</span><span className="mt-0.5 block text-[10px] font-medium text-amber-100">Create a new lead</span></span></div>
                                <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                            </button>
                            <button onClick={() => { setActiveWorkdeskTab(STAGE_IDS.LEADS); setView('workdesk'); }} className="group flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-stone-300 hover:shadow-md active:scale-[0.99] cursor-pointer">
                                <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-700"><Search size={17} /></span><span><span className="block text-xs font-black text-stone-900">Customer directory</span><span className="mt-0.5 block text-[10px] font-medium text-stone-400">Search and track all leads</span></span></div>
                                <ChevronRight size={16} className="text-stone-400 transition-transform group-hover:translate-x-0.5" />
                            </button>
                        </div>
                    </section>
                </main>

                </div>
            )}
            
            {view === 'workdesk' && (
                <div className="flex h-screen bg-stone-100 justify-center text-stone-850 font-sans overflow-hidden"><div className="w-full max-w-md bg-[#FCFBFA] h-full shadow-2xl relative flex flex-col">
            
            {/* MOBILE DRAWER */}
            {isSidebarOpen && (
                <div className="fixed inset-0 z-[100] flex">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
                    <aside className="relative w-[280px] h-full bg-slate-900 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300 z-10">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
                            {/* Dark surface - the white wordmark variant */}
                            <BrandMark variant="white" />
                            <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="p-3 border-b border-slate-800 shrink-0">
                            <button onClick={() => setView('menu')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer group shadow-sm">
                                <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-md shadow-amber-500/20">
                                    <Home size={14} />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-[11px] font-bold">Home Page</span>
                                    <span className="text-[9px] text-slate-400 font-medium">Return to dashboard</span>
                                </div>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            <div className="mb-2 px-1 pt-2">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Pipeline Stages</span>
                            </div>
                            {PRIMARY_STAGES.map(stage => {
                                const count = getCustomersByStage(stage.id).length;
                                const StageIcon = stage.icon || Folder;
                                const isActive = activeWorkdeskTab === stage.id;
                                return (
                                    <button
                                        key={stage.id}
                                        onClick={() => { setActiveWorkdeskTab(stage.id); setIsSidebarOpen(false); }}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer ${
                                            isActive 
                                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' 
                                            : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <StageIcon size={16} />
                                            <span className="text-[11px] font-bold tracking-wide">{stage.label}</span>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                            isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                </div>
            )}


            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-stone-50/50 relative">
                {/* HEADER */}
                <header className="bg-white border-b border-stone-200 px-4 md:px-6 py-3 md:py-4 shrink-0 flex items-center justify-between shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[10px] uppercase tracking-wide font-black shadow-sm active:scale-95 transition-transform">
                            <Layers size={14} /> Stages
                        </button>
                        <div>
                            <h2 className="text-sm md:text-lg font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
                                {PRIMARY_STAGES.find(s => s.id === activeWorkdeskTab)?.label || activeWorkdeskTab}
                            </h2>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:gap-4">
                        <div className="hidden">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search by name, phone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border border-stone-200 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 rounded-full cursor-pointer">
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-1 md:gap-2">
                            {import.meta.env.DEV && onOpenDevSwitcher && (
                                <button
                                    type="button"
                                    onClick={onOpenDevSwitcher}
                                    className="p-1.5 md:p-2 text-amber-600 hover:text-amber-700 rounded-xl hover:bg-amber-50 transition-colors"
                                    title="Open development role switcher"
                                    aria-label="Open development role switcher"
                                >
                                    <Terminal size={16} />
                                </button>
                            )}
                            <button onClick={async () => { if (await saveBeforeAgentExit('Save & Logout')) onLogout(); }} className="p-1.5 md:p-2 text-stone-400 hover:text-red-500 rounded-xl hover:bg-stone-100 transition-colors" title="Logout">
                                <LogOut size={16} />
                            </button>
                            <button
                                onClick={() => setShowAddLead(true)}
                                className="hidden sm:flex shrink-0 px-3 md:px-4 py-1.5 md:py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold items-center gap-2 shadow-md transition-all cursor-pointer active:scale-[0.98]"
                            >
                                <Plus size={14} /> Add Lead
                            </button>
                        </div>
                    </div>
                <div className="demo-portal-controls">{demoControls}</div>
            </header>

                
                {/* Stage search stays visible at every viewport width. The portal
                    can be displayed in a phone-like shell on a wider laptop,
                    where breakpoint-only mobile controls would otherwise vanish. */}
                <div className="px-4 py-3 bg-white border-b border-stone-150 shrink-0 shadow-sm z-10">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search customers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-stone-50 focus:bg-white border border-stone-200 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1">
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* CUSTOMER LIST */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                        </div>
                    ) : getWorkdeskCustomers(activeWorkdeskTab).length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center text-stone-400 bg-white border border-dashed border-stone-200 rounded-3xl p-6 md:p-8 mt-4 max-w-sm md:max-w-lg mx-auto">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-stone-50 rounded-2xl flex items-center justify-center mb-3 md:mb-4">
                                <Users className="w-6 h-6 md:w-8 md:h-8 text-stone-300" />
                            </div>
                            <p className="text-xs md:text-sm font-bold text-stone-600">No customers</p>
                            <p className="text-[10px] md:text-[11px] text-stone-400 mt-1">
                                {searchQuery ? 'No matches found.' : 'No customers in this stage.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 auto-rows-max">
                            {getWorkdeskCustomers(activeWorkdeskTab).map((cust) => (
                                <div
                                    key={cust.id}
                                    onClick={() => handleSelectCustomerForStage(cust, activeWorkdeskTab)}
                                    className="bg-white p-4 md:p-5 rounded-2xl border border-stone-200/80 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.99] flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex justify-between items-start gap-2 mb-3">
                                            <h4 className="text-sm font-black text-stone-900 group-hover:text-blue-600 transition-colors leading-snug">
                                                {cust.customer_name}
                                            </h4>
                                            <div className="flex items-center gap-1.5">
                                                {getTelephoneHref(cust.phone_number) && (
                                                    <a
                                                        href={getTelephoneHref(cust.phone_number)}
                                                        onClick={event => event.stopPropagation()}
                                                        aria-label={`Call ${cust.customer_name}`}
                                                        title={`Call ${cust.phone_number}`}
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                                                    >
                                                        <Phone size={14} />
                                                    </a>
                                                )}
                                                <button type="button" aria-label={`Open ${cust.customer_name}`} className="shrink-0 w-7 h-7 bg-stone-50 group-hover:bg-emerald-600 group-hover:text-white text-stone-400 rounded-lg transition-all flex items-center justify-center shadow-2xs border border-stone-100 group-hover:border-emerald-600">
                                                    <ChevronRight size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-1.5 md:space-y-2 text-[11px] md:text-xs text-stone-600">
                                            <div className="flex items-center gap-2">
                                                {renderPhoneLink(cust.phone_number)}
                                            </div>
                                            {cust.villages && (
                                                <div className="flex items-start gap-2">
                                                    <MapPin size={11} className="text-stone-400 shrink-0 mt-0.5" />
                                                    <span className="font-medium text-stone-500 line-clamp-1">{cust.villages}</span>
                                                </div>
                                            )}
                                            {cust.consumer_no && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="font-bold text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded text-[10px]">
                                                        #{cust.consumer_no}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="mt-3 md:mt-4 pt-3 border-t border-stone-100 flex flex-wrap gap-1.5 items-center justify-between text-[10px] md:text-[11px]">
                                        {cust.system_capacity_kwp && (
                                            <div className="flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                                <Zap size={10} />
                                                {cust.system_capacity_kwp} kWp
                                            </div>
                                        )}
                                        {cust.payment_type && (
                                            <span className="font-bold text-stone-500 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded uppercase">
                                                {cust.payment_type}
                                            </span>
                                        )}
                                        {cust.discom_inspection === 'Yes' && activeWorkdeskTab === 'DISCOM_INSPECTION' && (
                                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Inspected</span>
                                        )}
                                        {cust.meter_installation === 'Yes' && activeWorkdeskTab === 'METER_INSTALLATION' && (
                                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Installed</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* MOBILE FLOATING ACTION BUTTON */}
                <button
                    onClick={() => setShowAddLead(true)}
                    className="sm:hidden fixed bottom-6 right-4 z-40 bg-emerald-600 text-white w-12 h-12 rounded-full shadow-lg shadow-emerald-500/40 flex items-center justify-center active:scale-95 transition-transform"
                >
                    <Plus size={22} />
                </button>
            </main>
            </div></div>
            )}

            {view === 'quotations' && <QuotationModule demoControls={demoControls} embedded user={user} meta={meta} onCreateLead={handleSubmitLead} onViewLead={lead => handleSelectCustomerForStage(lead, lead.stage || STAGE_IDS.LEADS)} onClose={() => setView('menu')} />}
            {view === 'toolbox' && (
                <div className="min-h-screen bg-[#FCFBFA]">
                    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur px-4 py-3">
                        <div className="mx-auto flex max-w-7xl items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setView('menu')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                            >
                                <ChevronLeft size={16} /> Back to Portal
                            </button>
                            <div className="text-xs font-bold text-stone-900">Solar Toolbox</div>
                        </div>
                    </header>
                    <ToolboxView currentUser={user} />
                </div>
            )}

            {/* Unified Add Lead Modal */}
            {showAddLead && (
                <AddLeadModal
                    isOpen={showAddLead}
                    onClose={() => setShowAddLead(false)}
                    onSave={handleSubmitLead}
                    meta={meta}
                    channel_partners={[]}
                    user={user}
                />
            )}

            {/* Customer Details & Dealer Actions Modal */}
            {selectedCust && (
                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="w-full sm:max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-5 duration-300">
                        {/* Detail Header - Name, Phone Number & Consumer No on Top */}
                        <div className="shrink-0 px-5 py-5 border-b border-stone-150 bg-stone-50/90 flex justify-between items-start">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-black uppercase text-amber-600 tracking-widest bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                                        {isAgent2 ? 'Dealer Workdesk' : 'Channel Partner Workdesk'}
                                    </span>
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-white tracking-wider">
                                        {PRIMARY_STAGES.find(s => s.id === selectedCust.stage)?.label || selectedCust.stage}
                                    </span>
                                </div>
                                <h3 className="text-base font-black text-stone-900 uppercase leading-tight pt-0.5">
                                    {selectedCust.customer_name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600 font-semibold pt-0.5">
                                    <span className="flex items-center gap-1">
                                        {renderPhoneLink(selectedCust.phone_number, 'text-stone-600 font-semibold')}
                                    </span>
                                    {selectedCust.consumer_no && (
                                        <>
                                            <span className="text-stone-300">•</span>
                                            <span className="bg-stone-200/70 text-stone-800 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                                #{selectedCust.consumer_no}
                                            </span>
                                        </>
                                    )}
                                    {selectedCust.villages && (
                                        <>
                                            <span className="text-stone-300">•</span>
                                            <span className="flex items-center gap-1 text-stone-500 font-medium truncate max-w-[150px]">
                                                <MapPin size={11} className="text-stone-400" /> {selectedCust.villages}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3">
                                {getTelephoneHref(selectedCust.phone_number) && (
                                    <a
                                        href={getTelephoneHref(selectedCust.phone_number)}
                                        aria-label={`Call ${selectedCust.customer_name}`}
                                        title={`Call ${selectedCust.phone_number}`}
                                        className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-emerald-700"
                                    >
                                        <Phone size={14} /> Call
                                    </a>
                                )}
                                <button
                                    onClick={async () => { if (await saveBeforeAgentExit('Save & Close')) setSelectedCust(null); }}
                                    className="w-8 h-8 rounded-full bg-stone-200/70 hover:bg-stone-300 flex items-center justify-center text-stone-600 hover:text-stone-900 transition-colors font-bold text-xs cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Swipeable stage tabs for this customer */}
                        <div className="customer-stage-tabs shrink-0 border-b border-stone-150 bg-white px-4 py-3.5 overflow-x-auto">
                            <div className="flex min-w-max gap-2">
                                {customerStageNavigation.filter(stage => {
                                    const pType = (selectedCust?.payment_type || '').trim().toLowerCase();
                                    if (stage.id === STAGE_IDS.LOAN && pType === 'cash') return false;
                                    if (stage.id === STAGE_IDS.CASH && pType === 'loan') return false;
                                    if (stage.id === STAGE_IDS.COMPLETED || stage.id === STAGE_IDS.LOST_PROJECT) return false;
                                    return true;
                                }).concat([
                                    { id: 'DOCUMENTS', label: 'Documents', icon: FolderOpen }
                                ]).map(stage => {
                                    const StageIcon = stage.icon;
                                    const isActive = displayedStage === stage.id;
                                    return (
                                        <button
                                            key={stage.id}
                                            type="button"
                                            onClick={async () => {
                                                if (stage.id !== displayedStage) {
                                                    const leavingDirtySection =
                                                        (displayedStage === STAGE_IDS.METER_INSTALLATION && isMeterInstallationDirty()) ||
                                                        (displayedStage === STAGE_IDS.DISCOM_INSPECTION && isDiscomInspectionDirty()) ||
                                                        (displayedStage === STAGE_IDS.MATERIAL_ORDER && isMaterialOrderDirty());
                                                    if (leavingDirtySection) {
                                                        const shouldSave = await showConfirm('You have unsaved changes on this stage. Save them before continuing?', {
                                                            title: 'Unsaved changes',
                                                            confirmLabel: 'Save & Continue',
                                                            cancelLabel: 'Keep Editing',
                                                            type: 'success'
                                                        });
                                                        if (!shouldSave) return;
                                                        let didSave = false;
                                                        if (displayedStage === STAGE_IDS.METER_INSTALLATION) didSave = await handleSaveMeterInstallation(false);
                                                        else if (displayedStage === STAGE_IDS.DISCOM_INSPECTION) didSave = await handleSaveDiscomInspection(false);
                                                        else if (displayedStage === STAGE_IDS.MATERIAL_ORDER) didSave = await handleSaveMaterialOrder(false);
                                                        if (!didSave) return;
                                                    }
                                                }
                                                setActiveCustomerStage(stage.id);
                                            }}
                                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition cursor-pointer ${
                                                isActive
                                                    ? 'border-amber-500 bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                                                    : 'border-stone-200 bg-stone-50 text-stone-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
                                            }`}
                                        >
                                            <StageIcon size={13} />
                                            {stage.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Detail Body */}
                        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6 pb-10 space-y-4">
                            {isFutureStage && (
                                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 text-center">
                                    <p className="text-xs font-bold text-amber-800">This client has not reached this stage yet. You can save progress here, but you won't be able to advance to the next stage until they do.</p>
                                </div>
                            )}
                            <div className="space-y-4">
                            {![
                                STAGE_IDS.LEADS,
                                STAGE_IDS.MATERIAL_ORDER,
                                STAGE_IDS.MATERIAL_INTEGRATION,
                                STAGE_IDS.METER_INSTALLATION,
                                STAGE_IDS.DISCOM_INSPECTION,
                                STAGE_IDS.COMPLETED,
                                'CUSTOMER_CARD',
                                'DOCUMENTS',
                            ].includes(displayedStage) && (
                                <AgentStageDetails
                                    stage={displayedStage}
                                    customer={{ ...selectedCust, ...editData }}
                                    bom={integrationBom}
                                    bomItems={integrationBomItems}
                                    documents={custDocs}
                                    onPreview={handlePreviewFile}
                                    onDownload={handleDownloadDoc}
                                />
                            )}

                            {displayedStage === STAGE_IDS.DISCOM_SUBMISSION && (
                                <div className="pt-2">
                                    <button
                                        type="button"
                                        onClick={handleGenerateAgreementPreview}
                                        className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <FileText size={14} /> Preview PM Surya Ghar Agreement
                                    </button>
                                </div>
                            )}
                            {/* Every assigned stage has one shared hand-off remark. This is
                                separate from individual document remarks, which remain on
                                each uploaded document. */}
                            {/* ─── STAGE SECTION (Render active stage component in phone format) ─── */}
                            {displayedStage === 'CUSTOMER_CARD' && (
                                <div className="space-y-4">
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <User size={11} /> Customer Profile
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Customer Name</span><span className="font-semibold text-stone-900">{selectedCust.customer_name || '–'}</span></div>
                                            <div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Phone Number</span>{renderPhoneLink(selectedCust.phone_number)}</div>
                                            <div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Email</span><span className="font-semibold text-stone-900">{selectedCust.email || selectedCust.email_address || '–'}</span></div>
                                            <div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Consumer No</span><span className="font-semibold text-stone-900">{selectedCust.consumer_no || '–'}</span></div>
                                            <div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Location</span><span className="font-semibold text-stone-900">{selectedCust.villages || '–'} {selectedCust.sub_divisions ? `(${selectedCust.sub_divisions})` : ''}</span></div>
                                            {!isAgent2 && (<div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Channel Partner</span><span className="font-semibold text-stone-900">{selectedCust.channel_partner || '–'}</span></div>)}
                                            <div className="flex items-center justify-between py-2"><span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">System Capacity</span><span className="font-semibold text-stone-900">{selectedCust.system_capacity_kwp ? `${selectedCust.system_capacity_kwp} kWp` : '–'}</span></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === 'DOCUMENTS' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3 px-1">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <FolderOpen size={11} /> Uploaded Documents ({custDocs?.length || 0})
                                        </h5>
                                        {['agent', 'agent2'].includes(user?.userType) && custDocs?.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleDownloadAllDocs}
                                                disabled={downloadingAllDocs}
                                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-amber-600 disabled:opacity-60"
                                            >
                                                {downloadingAllDocs ? 'Preparing PDF...' : 'Download All PDF'}
                                            </button>
                                        )}
                                    </div>
                                    {(!custDocs || custDocs.length === 0) ? (
                                        <div className="p-8 text-center bg-stone-50 border border-dashed border-stone-200 rounded-xl">
                                            <p className="text-xs font-bold text-stone-500">No documents found</p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-2">
                                            {custDocs.map(doc => (
                                                <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-stone-200 rounded-xl shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                                                            <FileText size={14} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-stone-800 truncate">{doc.file_name || doc.doc_type}</p>
                                                            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mt-0.5">{doc.doc_type.replace(/_/g, ' ')}</p>
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 flex gap-2 w-full sm:w-auto">
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePreviewFile(doc)}
                                                            className="flex-1 sm:flex-none bg-stone-100 hover:bg-blue-50 text-stone-600 hover:text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                                                        >
                                                            <Eye size={12} /> View
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadDoc(doc)}
                                                            className="flex-1 sm:flex-none bg-stone-900 hover:bg-stone-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5"
                                                        >
                                                            <Download size={12} /> Download
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {displayedStage === STAGE_IDS.LEADS && (
                                <div className="space-y-4">
                                    {/* Lead Information Card (Line by Line Non-Editable) */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <User size={11} /> Lead Information
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Customer Name</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.customer_name || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Phone Number</span>
                                                {renderPhoneLink(selectedCust.phone_number)}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Email Address</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.email || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Consumer No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.consumer_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Villages</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.villages || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Sub Division</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.sub_divisions || '–'}</span>
                                            </div>
                                            {!isAgent2 && (
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Channel Partner</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.channel_partner || '–'}</span>
                                            </div>
                                            )}
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Dealer</span>
                                                <span className="font-semibold text-stone-900">{subChannelPartnerOf(selectedCust)}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Module Brand</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.module_brand || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Module WP</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.module_wp || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">No of Modules</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.no_of_modules || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">System Capacity</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.system_capacity_kwp ? `${selectedCust.system_capacity_kwp} kWp` : '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Payment Type</span>
                                                <span className="font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded text-[10px] uppercase">
                                                    {selectedCust.payment_type || '–'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Track Leads is intentionally limited to the saved lead form data. */}
                                    {(
                                    <div className="bg-white p-4 rounded-2xl border border-stone-150 shadow-2xs space-y-3">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Paperclip size={11} className="text-amber-500" /> Attached Documents & Uploads
                                        </h5>
                                        <div className="flex flex-col gap-2">
                                            {(selectedCust?.payment_type || editData?.payment_type || '')?.trim().toLowerCase() !== 'cash' && (
                                                <>
                                                    <CheckboxRemarkItem
                                                        label="Aadhar Card Front"
                                                        field="adhaar_card_front"
                                                        value={editData.adhaar_card_front}
                                                        onChange={handleChange}
                                                        isEditing={true}
                                                        documents={custDocs}
                                                        onUpload={handleUploadDocForCustomer}
                                                        onDelete={handleDeleteDoc}
                                                        onPreview={handlePreviewFile}
                                                        onUpdateRemark={handleUpdateDocRemark}
                                                    />
                                                    <CheckboxRemarkItem
                                                        label="Aadhar Card Back"
                                                        field="adhaar_card_back"
                                                        value={editData.adhaar_card_back}
                                                        onChange={handleChange}
                                                        isEditing={true}
                                                        documents={custDocs}
                                                        onUpload={handleUploadDocForCustomer}
                                                        onDelete={handleDeleteDoc}
                                                        onPreview={handlePreviewFile}
                                                        onUpdateRemark={handleUpdateDocRemark}
                                                    />
                                                    <CheckboxRemarkItem
                                                        label="PAN Card"
                                                        field="pan_card"
                                                        value={editData.pan_card}
                                                        onChange={handleChange}
                                                        isEditing={true}
                                                        documents={custDocs}
                                                        onUpload={handleUploadDocForCustomer}
                                                        onDelete={handleDeleteDoc}
                                                        onPreview={handlePreviewFile}
                                                        onUpdateRemark={handleUpdateDocRemark}
                                                    />
                                                    <CheckboxRemarkItem
                                                        label="Vera Pavti / Aakarni"
                                                        field="index_2"
                                                        value={editData.index_2}
                                                        onChange={handleChange}
                                                        isEditing={true}
                                                        documents={custDocs}
                                                        onUpload={handleUploadDocForCustomer}
                                                        onDelete={handleDeleteDoc}
                                                        onPreview={handlePreviewFile}
                                                        onUpdateRemark={handleUpdateDocRemark}
                                                    />
                                                    <CheckboxRemarkItem
                                                        label="House Geo Tag Photo"
                                                        field="house_geo_tag_photo"
                                                        value={editData.house_geo_tag_photo}
                                                        onChange={handleChange}
                                                        isEditing={true}
                                                        documents={custDocs}
                                                        onUpload={handleUploadDocForCustomer}
                                                        onDelete={handleDeleteDoc}
                                                        onPreview={handlePreviewFile}
                                                        onUpdateRemark={handleUpdateDocRemark}
                                                    />
                                                </>
                                            )}
                                            <CheckboxRemarkItem
                                                label="Light Bill"
                                                field="light_bill"
                                                value={editData.light_bill}
                                                onChange={handleChange}
                                                isEditing={true}
                                                documents={custDocs}
                                                onUpload={handleUploadDocForCustomer}
                                                onDelete={handleDeleteDoc}
                                                onPreview={handlePreviewFile}
                                                onUpdateRemark={handleUpdateDocRemark}
                                            />
                                            <CheckboxRemarkItem
                                                label="Bank Details"
                                                field="bank_details"
                                                value={editData.bank_details}
                                                onChange={handleChange}
                                                isEditing={true}
                                                documents={custDocs}
                                                onUpload={handleUploadDocForCustomer}
                                                onDelete={handleDeleteDoc}
                                                onPreview={handlePreviewFile}
                                                onUpdateRemark={handleUpdateDocRemark}
                                            />
                                            <CheckboxRemarkItem
                                                label="Extra Documents"
                                                field="extra_docs"
                                                value={editData.extra_docs}
                                                onChange={handleChange}
                                                isEditing={true}
                                                documents={custDocs}
                                                onUpload={handleUploadDocForCustomer}
                                                onDelete={handleDeleteDoc}
                                                onPreview={handlePreviewFile}
                                                onUpdateRemark={handleUpdateDocRemark}
                                            />
                                        </div>
                                    </div>
                                    )}
                                </div>
                            )}

                            {displayedStage === '__REMOVED_REGISTRATION_SUMMARY__' && (
                                <div className="space-y-4">
                                    {/* Registration Details Card (Line by Line Non-Editable) */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <ClipboardList size={11} /> Registration Details
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Registration Date</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.registration_date || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Registration By</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.registration_by || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Feasibility No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.registration_no || selectedCust.feasibility_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">File No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.folder_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Feasibility Document</span>
                                                {renderStatusBadge(selectedCust.feasibilty_document ? 'Completed' : 'Pending', 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Subsidy Token Photo</span>
                                                {renderStatusBadge(selectedCust.subsidy_token_photo ? 'Completed' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Registration documents are view/download only for agents. */}
                                    <div className="bg-white p-4 rounded-2xl border border-stone-150 shadow-2xs space-y-3">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Paperclip size={11} className="text-amber-500" /> Registration Documents
                                        </h5>
                                        <div className="flex flex-col gap-2">
                                            <CheckboxRemarkItem
                                                label="Feasibility Document"
                                                field="feasibilty_document"
                                                value={editData.feasibilty_document}
                                                onChange={handleChange}
                                                isEditing={false}
                                                documents={custDocs}
                                                onUpload={handleUploadDocForCustomer}
                                                onDelete={handleDeleteDoc}
                                                onPreview={handlePreviewFile}
                                                onUpdateRemark={handleUpdateDocRemark}
                                            />
                                            <CheckboxRemarkItem
                                                label="Subsidy Token Photo"
                                                field="subsidy_token_photo"
                                                value={editData.subsidy_token_photo}
                                                onChange={handleChange}
                                                isEditing={false}
                                                documents={custDocs}
                                                onUpload={handleUploadDocForCustomer}
                                                onDelete={handleDeleteDoc}
                                                onPreview={handlePreviewFile}
                                                onUpdateRemark={handleUpdateDocRemark}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === '__REMOVED_LOAN_SUMMARY__' && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Banknote size={11} /> Loan Information
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Payment Type Selection</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.payment_type || 'Loan'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Loan Tag Tracking</span>
                                            {renderStatusBadge(selectedCust.loan_tag, 'Pending')}
                                        </div>
                                        {selectedCust.loan_history && selectedCust.loan_history.length > 0 ? (
                                            <div className="pt-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-1.5">Loan Status Timeline</span>
                                                <div className="space-y-1.5 pl-2 border-l-2 border-amber-300">
                                                    {selectedCust.loan_history.map((h, i) => (
                                                        <div key={i} className="flex items-center justify-between text-[11px]">
                                                            <span className="font-bold text-amber-900">{h.status} {h.remark ? `(${h.remark})` : ''}</span>
                                                            <span className="text-stone-400 text-[10px]">{h.date}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Loan Status Timeline</span>
                                                <span className="text-stone-400 italic">No loan history recorded</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {displayedStage === STAGE_IDS.LOAN && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <div className="border-b border-stone-150 pb-2 mb-1 flex items-center justify-between gap-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Banknote size={11} /> Loan Payments
                                        </h5>
                                        <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wide flex items-center gap-0.5">
                                            <Eye size={9} /> View
                                        </span>
                                    </div>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        {['Down Payment', '1st Payment', '2nd Payment'].map(label => {
                                            const entry = loanPaymentFor(label);
                                            const amount = parseIndianNumber(entry.amount) || 0;
                                            return (
                                                <DetailRow key={label} label={label}>
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className="text-sm font-bold text-stone-800">
                                                            {amount > 0 ? `₹${toIndianCommas(amount)}` : '–'}
                                                        </span>
                                                        <span className="text-[10px] font-medium text-stone-400">
                                                            Date: <span className="font-semibold text-stone-600">{entry.date || '–'}</span>
                                                        </span>
                                                        {entry.remark && (
                                                            <span className="text-[10px] italic text-stone-500">{entry.remark}</span>
                                                        )}
                                                    </div>
                                                </DetailRow>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {displayedStage === '__REMOVED_CASH_SUMMARY__' && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Banknote size={11} /> Cash Tracking
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Payment Type Selection</span>
                                            <span className="font-semibold text-stone-900 uppercase">{selectedCust.payment_type || 'Cash'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Total Amount</span>
                                            <span className="font-semibold text-stone-900">
                                                {selectedCust.cash_details?.total_amount ? `₹${toIndianCommas(selectedCust.cash_details.total_amount)}` : '–'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">1st Payment</span>
                                            <span className="font-semibold text-stone-900">
                                                {selectedCust.cash_details?.payments?.[0]?.amount ? `₹${toIndianCommas(selectedCust.cash_details.payments[0].amount)}${selectedCust.cash_details.payments[0].date ? ` (${selectedCust.cash_details.payments[0].date})` : ''}` : '–'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">2nd Payment</span>
                                            <span className="font-semibold text-stone-900">
                                                {selectedCust.cash_details?.payments?.[1]?.amount ? `₹${toIndianCommas(selectedCust.cash_details.payments[1].amount)}${selectedCust.cash_details.payments[1].date ? ` (${selectedCust.cash_details.payments[1].date})` : ''}` : '–'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">3rd Payment</span>
                                            <span className="font-semibold text-stone-900">
                                                {selectedCust.cash_details?.payments?.[2]?.amount ? `₹${toIndianCommas(selectedCust.cash_details.payments[2].amount)}${selectedCust.cash_details.payments[2].date ? ` (${selectedCust.cash_details.payments[2].date})` : ''}` : '–'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === STAGE_IDS.MATERIAL_ORDER && (
                                <div className="flex flex-col gap-4">
                                    {/* Non-Editable Leads Details Card */}
                                    <div className="order-2 bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <User size={11} /> Customer & Site Reference
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Customer Name</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.customer_name || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Phone Number</span>
                                                {renderPhoneLink(selectedCust.phone_number)}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Email Address</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.email_address || selectedCust.email || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Consumer No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.consumer_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Villages / Address</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.villages || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Sub Division</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.sub_divisions || '–'}</span>
                                            </div>
                                            {!isAgent2 && (
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Channel Partner</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.channel_partner || '–'}</span>
                                            </div>
                                            )}
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Dealer</span>
                                                <span className="font-semibold text-stone-900">{subChannelPartnerOf(selectedCust)}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Module Brand</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.module_brand || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Module Wp</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.module_wp || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">No of Modules</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.no_of_modules || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">System Capacity</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.system_capacity_kwp ? `${selectedCust.system_capacity_kwp} kWp` : '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Payment Type</span>
                                                <span className="font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded text-[10px] uppercase">
                                                    {selectedCust.payment_type || '–'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Material Order Form Card */}
                                    <div className="order-1 bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-3">
                                        <div className="border-b border-stone-150 pb-2 mb-1">
                                            <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <Package size={11} /> Material Order Details
                                            </h5>
                                        </div>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Roof / Shed</span>
                                                <select
                                                    value={editData.roof_shed || selectedCust.roof_shed || ''}
                                                    onChange={e => setEditData(prev => ({ ...prev, roof_shed: e.target.value }))}
                                                    className="bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                >
                                                    <option value="">Select Roof / Shed</option>
                                                    <option value="Roof">Roof</option>
                                                    <option value="Shed">Shed</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">DC Cable (Mtrs)</span>
                                                <input
                                                    type="number"
                                                    onKeyDown={e => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                                    value={editData.dc_cable ?? selectedCust.dc_cable ?? ''}
                                                    onChange={e => setEditData(prev => ({ ...prev, dc_cable: e.target.value }))}
                                                    placeholder="Meters"
                                                    className="w-28 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">AC Cable (Mtrs)</span>
                                                <input
                                                    type="number"
                                                    onKeyDown={e => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                                    value={editData.ac_cable ?? selectedCust.ac_cable ?? ''}
                                                    onChange={e => setEditData(prev => ({ ...prev, ac_cable: e.target.value }))}
                                                    placeholder="Meters"
                                                    className="w-28 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Front Leg Height (ft)</span>
                                                <input
                                                    type="number"
                                                    onKeyDown={e => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                                    value={editData.structure_front_leg_height ?? selectedCust.structure_front_leg_height ?? ''}
                                                    onChange={e => setEditData(prev => ({ ...prev, structure_front_leg_height: e.target.value }))}
                                                    placeholder="ft"
                                                    className="w-28 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Rear Leg Height (ft)</span>
                                                <input
                                                    type="number"
                                                    onKeyDown={e => ['e', 'E', '-', '+'].includes(e.key) && e.preventDefault()}
                                                    value={editData.structure_rear_leg_height ?? selectedCust.structure_rear_leg_height ?? ''}
                                                    onChange={e => setEditData(prev => ({ ...prev, structure_rear_leg_height: e.target.value }))}
                                                    placeholder="ft"
                                                    className="w-28 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Invoice Value</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={formatInputValue(editData.invoice_value ?? selectedCust.invoice_value ?? '')}
                                                    onChange={e => setEditData(prev => ({ ...prev, invoice_value: formatInputValue(e.target.value) }))}
                                                    placeholder="₹ Amount"
                                                    className="w-32 bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 text-right focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5 py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Notes / Instructions</span>
                                                <textarea
                                                    rows={5}
                                                    value={editData.material_order_notes ?? selectedCust.material_order_notes ?? ''}
                                                    onChange={e => setEditData(prev => ({ ...prev, material_order_notes: e.target.value }))}
                                                    placeholder="Optional notes"
                                                    className="min-h-[120px] w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm leading-6 font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                                />
                                            </div>
                                        </div>
                                        <div className={`grid gap-2 pt-2 border-t border-stone-200/60 ${selectedCust.stage === STAGE_IDS.MATERIAL_ORDER ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                            <button
                                                onClick={() => handleSaveMaterialOrder(false)}
                                                disabled={saving || !isMaterialOrderDirty()}
                                                className={`py-2.5 px-3 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 ${saving ? 'opacity-50 cursor-not-allowed' : (isMaterialOrderDirty() ? 'bg-stone-200 hover:bg-stone-300 text-stone-700 cursor-pointer' : 'bg-emerald-600 text-white cursor-default')}
                                                `}
                                            >
                                                <Save size={14} /> {saving ? 'Saving...' : (isMaterialOrderDirty() ? 'Save' : 'Saved')}
                                            </button>
                                            {selectedCust.stage === STAGE_IDS.MATERIAL_ORDER && (
                                                <button
                                                    onClick={() => handleSaveMaterialOrder(true)}
                                                    disabled={saving}
                                                    className="bg-amber-500 hover:bg-amber-600 text-white py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <CheckCircle2 size={14} /> {saving ? 'Saving...' : 'Save & Move'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}


                            {/* Material Integration is view-only for agents. Same sections
                                as the admin Material Integration tab - Material Order
                                reference, Inverter & Equipment, Procurement & Loading
                                Milestones, BOM - rendered as read-only parameter/value
                                rows in the portal's own style. */}
                            {displayedStage === STAGE_IDS.MATERIAL_INTEGRATION && (
                                <div className="space-y-4">
                                    {/* Print action sits at the top of the stage. */}
                                    <div className="flex items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-stone-200 shadow-sm">
                                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                            {integrationBomType} BOM
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setShowBomPrint(true)}
                                            className="bg-stone-900 hover:bg-stone-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                            <Printer size={13} /> Print / Export PDF
                                        </button>
                                    </div>

                                    {/* Inverter & Equipment Details */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Zap size={11} /> Inverter &amp; Equipment Details
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <DetailRow label="Inverter Make" value={stageData.inverter_make} />
                                            <DetailRow label="Inverter Serial No." value={stageData.inverter_serial_no} />
                                            <DetailRow label="Integration By" value={stageData.integration_by} />
                                            <DetailRow label="Panel Serial Numbers">
                                                <span className="text-[9px] font-bold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded uppercase">
                                                    Total: {miPanelSerials.length} Panel{miPanelSerials.length === 1 ? '' : 's'}
                                                </span>
                                            </DetailRow>
                                        </div>
                                        {miPanelSerials.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                                                {miPanelSerials.map((serial, idx) => (
                                                    <div key={idx} className="border border-stone-200 bg-white px-1.5 py-1 rounded-lg flex items-center gap-1.5 min-w-0">
                                                        <span className="text-[9px] font-bold text-stone-400 w-4 text-center flex-shrink-0">{idx + 1}.</span>
                                                        <span className="font-mono text-[10px] font-bold text-stone-900 truncate">{serial}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-stone-400 italic pt-1">No panel serial numbers recorded.</p>
                                        )}
                                    </div>

                                    {/* Procurement & Loading Milestones */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <ClipboardCheck size={11} /> Procurement &amp; Loading Milestones
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <DetailRow label="Paper Prepared By" value={integrationBom?.paper_prepared_by} />
                                            <DetailRow label="Paper Prepared Date" value={integrationBom?.paper_prepared_date} />
                                            <DetailRow label="Material Loaded By" value={integrationBom?.material_loaded_by} />
                                            <DetailRow label="Material Loaded Date" value={integrationBom?.material_loaded_date} />
                                        </div>
                                    </div>

                                    {/* Bill of Materials */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Layers size={11} /> Bill of Materials
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            {integrationBomItems.length === 0 ? (
                                                <p className="py-3 text-center text-[11px] font-semibold text-stone-400">
                                                    No BOM checklist items configured yet for this customer.
                                                </p>
                                            ) : integrationBomItems.map((item, idx) => (
                                                <DetailRow
                                                    key={item.id || `${item.product_name}-${idx}`}
                                                    label={`${item.sr_no ?? idx + 1}. ${item.product_name || item.description || '–'}`}
                                                >
                                                    <span className="whitespace-nowrap">
                                                        {String(item.quantity ?? '').trim() === ''
                                                            ? '–'
                                                            : `${item.quantity}${item.uom ? ` ${item.uom}` : ''}`}
                                                    </span>
                                                </DetailRow>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}



                            {(displayedStage === STAGE_IDS.LOST_PROJECT) && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <PauseCircle size={11} /> Lost Project Details
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Lost Project Status</span>
                                            {renderStatusBadge(selectedCust.hold_procurement, 'Pending')}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === '__REMOVED_DELIVERY_SUMMARY__' && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Truck size={11} /> Material Delivery Details
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Vendor Allotment</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.vendor || '–'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">INVERTER SERIAL NO.</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.inverter_serial_no || '–'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">INVOICE NO</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.invoice_no || '–'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">DRIVER NAME</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.driver_name || '–'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">DRIVER PHONE NUMBER</span>
                                            {renderPhoneLink(selectedCust.driver_phone_number)}
                                        </div>
                                        {selectedCust.panel_serial_no && (
                                            <div className="py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-1">Panel Serial Numbers</span>
                                                <p className="font-semibold text-stone-900 whitespace-pre-line text-[11px] bg-white p-2 rounded-xl border border-stone-200">{selectedCust.panel_serial_no}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {(displayedStage === STAGE_IDS.INSTALLATION_STATUS || displayedStage === 'MATERIAL INSTALLATION') && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Wrench size={11} /> Installation Details
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">SFDC Photo</span>
                                            {renderStatusBadge(selectedCust.sfdc_photo ? 'Yes' : 'Pending', 'Pending')}
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installation Status</span>
                                            {renderStatusBadge(selectedCust.installation_status, 'Pending')}
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installation Date</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.installation_date || '–'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installed By (Allotted Vendor)</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.vendor || 'No vendor allotted'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === '__REMOVED_GEO_SUMMARY__' && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Camera size={11} /> Geo Tag Photo Details
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Geo Tag Photo</span>
                                            {renderStatusBadge(selectedCust.geo_tag_status, 'Pending')}
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Geo Tag Image Uploaded</span>
                                            {renderStatusBadge(selectedCust.geo_tag_image ? 'Yes' : 'Pending', 'Pending')}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === '__REMOVED_DISCOM_SUMMARY__' && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Send size={11} /> Discom Submission Details
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Vendor Feasibility</span>
                                            <div className="flex items-center gap-2">
                                                <FlagDownload flag="vendor_feasibility" />
                                                {renderStatusBadge(selectedCust.vendor_feasibility ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Site Feasibility</span>
                                            <div className="flex items-center gap-2">
                                                <FlagDownload flag="site_feasibility" />
                                                {renderStatusBadge(selectedCust.site_feasibility ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">DCR Certificate</span>
                                            <div className="flex items-center gap-2">
                                                <FlagDownload flag="dcr_certificate" />
                                                {renderStatusBadge(selectedCust.dcr_certificate ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Signature Photo</span>
                                            <div className="flex items-center gap-2">
                                                <FlagDownload flag="signature_pic" />
                                                {renderStatusBadge(selectedCust.signature_pic ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Stamp</span>
                                            <div className="flex items-center gap-2">
                                                <FlagDownload flag="stamp" />
                                                {renderStatusBadge(selectedCust.stamp ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">File Submitted By</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.discom_submission?.submitted_by || '–'}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Submission Date</span>
                                            <span className="font-semibold text-stone-900">{selectedCust.discom_submission?.date || '–'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === STAGE_IDS.METER_INSTALLATION && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-3">
                                    <div className="border-b border-stone-150 pb-2 mb-1">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Zap size={11} /> Meter Installation Details
                                        </h5>
                                    </div>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Meter Installation <span className="text-red-500">*</span></span>
                                            <div className="flex items-center gap-1.5">
                                                {['Yes', 'No'].map(val => (
                                                    <button
                                                        key={val}
                                                        type="button"
                                                        onClick={() => setEditData(prev => ({ ...prev, meter_installation: val }))}
                                                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
                                                            (editData.meter_installation || selectedCust.meter_installation) === val
                                                                ? (val === 'Yes' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600')
                                                                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                                                        }`}
                                                    >
                                                        {val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installation Date <span className="text-red-500">*</span></span>
                                            <input
                                                type="date"
                                                value={editData.installation_date ?? selectedCust.installation_date ?? ''}
                                                onChange={e => setEditData(prev => ({ ...prev, installation_date: e.target.value }))}
                                                className="bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-2">
                                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wide mb-1">Meter Installation Photo <span className="text-red-500">*</span></p>
                                        <CheckboxRemarkItem
                                            label="Meter Installation Photo"
                                            field="meter_installation_photo"
                                            value={editData.meter_installation_photo}
                                            onChange={handleChange}
                                            isEditing={true}
                                            documents={custDocs}
                                            onUpload={handleUploadDocForCustomer}
                                            onDelete={handleDeleteDoc}
                                            onPreview={handlePreviewFile}
                                            onUpdateRemark={handleUpdateDocRemark}
                                        />
                                    </div>
                                    <div className={`grid gap-2 pt-2 border-t border-stone-200/60 ${selectedCust.stage === STAGE_IDS.METER_INSTALLATION ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        <button
                                            onClick={() => handleSaveMeterInstallation(false)}
                                            disabled={saving || !isMeterInstallationDirty()}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 ${saving ? 'opacity-50 cursor-not-allowed' : (isMeterInstallationDirty() ? 'bg-stone-200 hover:bg-stone-300 text-stone-700 cursor-pointer' : 'bg-emerald-600 text-white cursor-default')}
                                            `}
                                        >
                                            <Save size={14} /> {saving ? 'Saving...' : (isMeterInstallationDirty() ? 'Save' : 'Saved')}
                                        </button>
                                        {selectedCust.stage === STAGE_IDS.METER_INSTALLATION && (
                                            <button
                                                onClick={() => handleSaveMeterInstallation(true)}
                                                disabled={saving}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <CheckCircle2 size={14} /> {saving ? 'Saving...' : 'Save & Move'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {displayedStage === STAGE_IDS.DISCOM_INSPECTION && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-3">
                                    <div className="border-b border-stone-150 pb-2 mb-1">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <ClipboardCheck size={11} /> Discom Inspection Details
                                        </h5>
                                    </div>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Discom Inspection <span className="text-red-500">*</span></span>
                                            <div className="flex items-center gap-1.5">
                                                {['Yes', 'No'].map(val => (
                                                    <button
                                                        key={val}
                                                        type="button"
                                                        onClick={() => setEditData(prev => ({ ...prev, discom_inspection: val }))}
                                                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
                                                            (editData.discom_inspection || selectedCust.discom_inspection) === val
                                                                ? (val === 'Yes' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600')
                                                                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                                                        }`}
                                                    >
                                                        {val}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`grid gap-2 pt-2 border-t border-stone-200/60 ${selectedCust.stage === STAGE_IDS.DISCOM_INSPECTION ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        <button
                                            onClick={() => handleSaveDiscomInspection(false)}
                                            disabled={saving || !isDiscomInspectionDirty()}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 ${saving ? 'opacity-50 cursor-not-allowed' : (isDiscomInspectionDirty() ? 'bg-stone-200 hover:bg-stone-300 text-stone-700 cursor-pointer' : 'bg-emerald-600 text-white cursor-default')}
                                            `}
                                        >
                                            <Save size={14} /> {saving ? 'Saving...' : (isDiscomInspectionDirty() ? 'Save' : 'Saved')}
                                        </button>
                                        {selectedCust.stage === STAGE_IDS.DISCOM_INSPECTION && (
                                            <button
                                                onClick={() => handleSaveDiscomInspection(true)}
                                                disabled={saving}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <CheckCircle2 size={14} /> {saving ? 'Saving...' : 'Save & Move'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {displayedStage === '__REMOVED_SUBSIDY_SUMMARY__' && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <Tag size={11} /> Subsidy Status Details
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Subsidy Tag</span>
                                            {renderStatusBadge(selectedCust.subsidy_tag, 'Pending')}
                                        </div>
                                        {selectedCust.subsidy_history && selectedCust.subsidy_history.length > 0 ? (
                                            <div className="pt-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide block mb-1.5">Subsidy Status Timeline</span>
                                                <div className="space-y-1.5 pl-2 border-l-2 border-amber-300">
                                                    {selectedCust.subsidy_history.map((h, i) => (
                                                        <div key={i} className="flex items-center justify-between text-[11px]">
                                                            <span className="font-bold text-amber-900">{h.status} {h.remark ? `(${h.remark})` : ''}</span>
                                                            <span className="text-stone-400 text-[10px]">{h.date}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Subsidy Status Timeline</span>
                                                <span className="text-stone-400 italic">No subsidy history recorded</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {(displayedStage === STAGE_IDS.FINAL_REVIEW || displayedStage === 'COMMISSIONING') && (
                                <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                    <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                        <ClipboardCheck size={11} /> Operational Checklist Milestones
                                    </h5>
                                    <div className="divide-y divide-stone-200/50 text-xs">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Warranty Card</span>
                                            {renderStatusBadge(selectedCust.warranty_card ? 'Yes' : 'Pending', 'Pending')}
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Insurance Status</span>
                                            {renderStatusBadge(selectedCust.insurance_status ? 'Yes' : 'Pending', 'Pending')}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {displayedStage === STAGE_IDS.COMPLETED && (
                                <div className="space-y-4">
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                        <h4 className="text-sm font-black text-emerald-800 uppercase tracking-wide">Project Completed & Commissioned</h4>
                                        <p className="text-xs text-emerald-700 font-semibold mt-0.5">Below is the complete project lifecycle record (read-only).</p>
                                    </div>

                                    {/* 1. Customer Info Card */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <User size={11} /> 1. Customer Info
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Customer Name</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.customer_name || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Phone Number</span>
                                                {renderPhoneLink(selectedCust.phone_number)}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Email Address</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.email || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Consumer No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.consumer_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Villages</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.villages || '–'}</span>
                                            </div>
                                            {!isAgent2 && (
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Channel Partner Name</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.channel_partner || '–'}</span>
                                            </div>
                                            )}
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Dealer Name</span>
                                                <span className="font-semibold text-stone-900">{subChannelPartnerOf(selectedCust)}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">System Capacity (kWp)</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.system_capacity_kwp ? `${selectedCust.system_capacity_kwp} kWp` : '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">MODULE BRAND</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.module_brand || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">MODULE WP</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.module_wp || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Sub Division</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.sub_divisions || '–'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Registration Details Card */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <ClipboardList size={11} /> 2. Registration Details
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Registration date</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.registration_date || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Registration By</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.registration_by || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Feasibility No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.registration_no || selectedCust.feasibility_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">File No</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.folder_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Feasibility Document</span>
                                                {renderStatusBadge(selectedCust.feasibilty_document ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Subsidy Token Photo</span>
                                                {renderStatusBadge(selectedCust.subsidy_token_photo ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Payment & Financial Details Card */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Banknote size={11} /> 3. Payment & Financial Tracking
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Payment Type Selection</span>
                                                <span className="font-semibold text-stone-900 uppercase">{selectedCust.payment_type || '–'}</span>
                                            </div>
                                            {selectedCust.payment_type?.trim().toLowerCase() === 'loan' ? (
                                                <div className="flex items-center justify-between py-2">
                                                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Loan Tag Tracking</span>
                                                    {renderStatusBadge(selectedCust.loan_tag, 'Pending')}
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between py-2">
                                                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Total Amount</span>
                                                    <span className="font-semibold text-stone-900">
                                                        {selectedCust.cash_details?.total_amount ? `₹${toIndianCommas(selectedCust.cash_details.total_amount)}` : '–'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 4. Material Order & Delivery Card */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Truck size={11} /> 4. Material Order & Delivery Details
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Vendor Allotment</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.vendor || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">INVERTER SERIAL NO.</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.inverter_serial_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">INVOICE NO</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.invoice_no || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">DRIVER NAME</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.driver_name || '–'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 5. Installation & Geo Tag Card */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <Wrench size={11} /> 5. Installation & Geo Tag
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installation Status</span>
                                                {renderStatusBadge(selectedCust.installation_status, 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installation Date</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.installation_date || '–'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Installed By (Allotted Vendor)</span>
                                                <span className="font-semibold text-stone-900">{selectedCust.vendor || 'No vendor allotted'}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Geo Tag Photo</span>
                                                {renderStatusBadge(selectedCust.geo_tag_status, 'Pending')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 6. Utility & Commissioning Card */}
                                    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-150/70 space-y-2">
                                        <h5 className="text-[9px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                                            <ClipboardCheck size={11} /> 6. Utility & Commissioning
                                        </h5>
                                        <div className="divide-y divide-stone-200/50 text-xs">
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Meter Installation</span>
                                                {renderStatusBadge(selectedCust.meter_installation, 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Discom Inspection</span>
                                                {renderStatusBadge(selectedCust.discom_inspection, 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Subsidy Tag</span>
                                                {renderStatusBadge(selectedCust.subsidy_tag, 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Warranty Card</span>
                                                {renderStatusBadge(selectedCust.warranty_card ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Insurance Status</span>
                                                {renderStatusBadge(selectedCust.insurance_status ? 'Yes' : 'Pending', 'Pending')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Soft-Validation / Requirements popup */}
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
                            <p className="text-sm font-medium leading-relaxed text-stone-600">Complete the required items below before moving this customer to <span className="font-bold text-stone-800">{validationNextStage}</span>.</p>
                            <ul className="mt-4 space-y-2.5 max-h-48 overflow-y-auto">
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
                            {/* "Move Anyway" removed 2026-09-01. It let a Dealer advance with
                                every required field blank - including the cable lengths and
                                structure heights the BOM is generated from - while an Admin
                                hitting the identical popup had no bypass at all. Dealers
                                advance once the conditions are met. */}
                            <div className="mt-5">
                                <button
                                    type="button"
                                    onClick={() => setShowValidationModal(false)}
                                    className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 px-4 py-3 text-xs font-bold text-white transition-colors cursor-pointer"
                                >
                                    Back to fill these in
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {showAgreementPopup && (
                <AgreementPreview
                    data={agreementData}
                    onChange={setAgreementData}
                    onClose={() => setShowAgreementPopup(false)}
                />
            )}

            {showBomPrint && selectedCust && (
                <BomPrintModal
                    customer={{ ...selectedCust, ...editData }}
                    bom={integrationBom}
                    bomItems={integrationBomItems}
                    activeType={integrationBomType}
                    onClose={() => setShowBomPrint(false)}
                />
            )}

            {/* Document preview - opened by the "View Document" buttons in the
                stage details panel and the Documents tab. */}
            {previewDoc?.doc && (
                <FilePreviewModal
                    file={previewDoc.doc}
                    fileUrl={previewDoc.url}
                    onClose={() => setPreviewDoc(null)}
                    onDownload={() => handleDownloadDoc(previewDoc.doc)}
                    onUpdateRemark={handleUpdateDocRemark}
                />
            )}
        </>
    );
}
