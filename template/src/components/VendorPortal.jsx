import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import {
    logActivity, uploadDocument, getCustomerDocuments, getDownloadUrl, getViewUrl, deleteDocument,
    updateDocumentRemark, normalizeInstallationStatus, updateAdminRecord, downloadFileWithSaveAs,
} from '../utils';
import {
    AlertTriangle, Calendar, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Eye,
    Image as ImageIcon, IndianRupee, Printer, Save, Truck, Upload, Wrench,
} from 'lucide-react';
import { FilePreviewModal, isReturnedDocument } from './modal-tabs/shared';
import { VENDOR_LIST_COLUMNS, isFinalTagValue } from '../constants';
import {
    PRIMARY_STAGES, STAGE_IDS, INSTALLATION_TAGS, isOn, isStageEnabled, stageLabel, getNextStageId,
    missingStageRequirements,
} from '../config/index.js';
import {
    Badge, EmptyState, ErrorBanner, Field, FieldList, Input, LoadingState, Modal, SearchInput, Spinner,
    SuccessBanner, TagPicker, Textarea, useRefreshOnFocus,
} from '../ui/index.js';
import { fetchAllPages } from '../lib/db.js';
import { lazyWithRetry, LazyBoundary } from '../lib/lazy.js';
import { formatDate, formatINR, formatKwp, todayIST } from '../lib/format.js';
import { readModuleSerials } from '../serials/record.js';
import { useGlobalPopup } from './GlobalPopup';
import { MobilePortalShell, PortalHero } from './portal';

// Switched-off features are never downloaded.
const CalendarView = isOn('calendar') ? lazyWithRetry(() => import('./CalendarView')) : null;
const BomPrintModal = isOn('bomMaker') ? lazyWithRetry(() => import('./BomPrintModal')) : null;
const payoutsOn = isOn('vendorCommission');

const LIST_COLUMNS = `${VENDOR_LIST_COLUMNS}, inverter_serial_no, panel_serial_no`;

// The installer's part of the pipeline, one tab per stage. Where the customer
// goes after Geo Tag Photo follows the client's configured pipeline.
const WORK_TABS = [
    { id: 'DELIVERY', stage: STAGE_IDS.MATERIAL_DELIVERY, icon: Truck },
    { id: 'INSTALLATION', stage: STAGE_IDS.INSTALLATION_STATUS, icon: Wrench },
    { id: 'GEO', stage: STAGE_IDS.GEO_TAG_PHOTO, icon: Camera },
].filter(tab => isStageEnabled(tab.stage)).map(tab => ({ ...tab, label: stageLabel(tab.stage) }));
const EDITABLE_TABS = ['INSTALLATION', 'GEO'];
const tabById = id => WORK_TABS.find(tab => tab.id === id);
const tabForStage = stage => WORK_TABS.find(tab => tab.stage === stage);

const GEO_DOC_TYPES = ['geo_tag_image', 'geo_tag'];
const GEO_OPTIONS = [
    { id: 'Proceed', label: 'Proceed', activeClass: 'bg-emerald-600 text-white border-emerald-600' },
    { id: 'Pending', label: 'Pending', activeClass: 'bg-amber-500 text-white border-amber-500' },
];
const INSTALLATION_STYLES = {
    Giveup: 'bg-rose-600 text-white border-rose-600',
    Installed: 'bg-emerald-600 text-white border-emerald-600',
    'In process': 'bg-teal-600 text-white border-teal-600',
    Pending: 'bg-amber-500 text-white border-amber-500',
};
const INSTALLATION_OPTIONS = INSTALLATION_TAGS.map(tag => ({ ...tag, activeClass: INSTALLATION_STYLES[tag.id] }));
// Older rows hold 'Yes' / 'Process'; match exactly first, then by meaning.
const installationTagId = value => (INSTALLATION_TAGS.find(tag => tag.id === value)
    || INSTALLATION_TAGS.find(tag => normalizeInstallationStatus(tag.id) === normalizeInstallationStatus(value)))?.id ?? null;

const DELIVERY_FIELDS = [
    { key: 'invoice_no', label: 'Invoice no.' },
    { key: 'material_delivery_date', label: 'Delivery date', type: 'date' },
    { key: 'vehicle_number', label: 'Vehicle / truck no.' },
    { key: 'driver_name', label: 'Driver name' },
    { key: 'driver_phone_number', label: 'Driver phone number', type: 'phone' },
];
const CUSTOMER_FIELDS = [
    { key: 'customer_name', label: 'Customer name' },
    { key: 'phone_number', label: 'Phone number', type: 'phone' },
    { key: 'email_address', label: 'Email address' },
    { key: 'consumer_no', label: 'Consumer no.' },
    { key: 'villages', label: 'Village / address' },
    { key: 'folder_no', label: 'File no.' },
    { key: 'system_capacity_kwp', label: 'System capacity (kWp)', type: 'number' },
    { key: 'module_brand', label: 'Module brand' },
    { key: 'module_wp', label: 'Module WP' },
];

// The database already returns only this installer's customers; given-up
// jobs are hidden from the lists. One rule for loading and live updates.
const belongs = record => Boolean(record) && !record.deleted_at && normalizeInstallationStatus(record.installation_status) !== 'Give Up';

const matchesSearch = (customer, query) => {
    const q = query.trim().toLowerCase();
    return !q || [customer.customer_name, customer.phone_number, customer.consumer_no, customer.folder_no,
        customer.villages, customer.inverter_serial_no, customer.sub_channel_partner]
        .some(value => String(value || '').toLowerCase().includes(q));
};

const sameText = (a, b, empty = '') => String(a ?? empty).trim() === String(b ?? empty).trim();

export default function VendorPortal({ user, onLogout, onChangePassword }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const [view, setView] = useState('list');
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState(WORK_TABS[0]?.id || 'DELIVERY');
    const [selectedCust, setSelectedCust] = useState(null);

    const [geoTagStatus, setGeoTagStatus] = useState('Pending');
    const [geoTagImage, setGeoTagImage] = useState(false);
    const [installationStatus, setInstallationStatus] = useState('Pending');
    const [installationDate, setInstallationDate] = useState('');
    const [vendorNote, setVendorNote] = useState('');

    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');
    const [stageMoveError, setStageMoveError] = useState('');

    const [documents, setDocuments] = useState([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [previewDoc, setPreviewDoc] = useState(null);
    const fileInputRef = useRef(null);

    const [bomPrint, setBomPrint] = useState(null);     // { bom, items, type }
    const [loadingBom, setLoadingBom] = useState(false);
    const [showGiveUpModal, setShowGiveUpModal] = useState(false);
    const [giveUpReason, setGiveUpReason] = useState('');
    const [givingUp, setGivingUp] = useState(false);

    const flashSuccess = (message) => {
        setSaveSuccess(message);
        setTimeout(() => setSaveSuccess(''), 3000);
    };

    const fetchCustomers = useCallback(async ({ silent = false } = {}) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        try {
            const rows = await fetchAllPages(() => supabase.from('admin').select(LIST_COLUMNS).is('deleted_at', null)
                .order('created_at', { ascending: false }).order('id'));
            setCustomers(rows.filter(belongs));
            setLoadError('');
        } catch (err) {
            console.error('Error fetching installer customers:', err);
            setLoadError(err?.message || 'Your jobs could not be loaded.');
        } finally {
            if (silent) setRefreshing(false);
            else setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user?.id) return undefined;
        fetchCustomers();
        const channel = supabase.channel(`vendor_customers_${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin' }, payload => {
                const record = payload.new;
                const id = record?.id || payload.old?.id;
                setCustomers(previous => {
                    if (payload.eventType === 'DELETE' || !belongs(record)) return previous.filter(customer => customer.id !== id);
                    if (!previous.some(customer => customer.id === record.id)) return [record, ...previous];
                    return previous.map(customer => (customer.id === record.id ? { ...customer, ...record } : customer));
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, fetchCustomers]);

    // Realtime is the main update path; this covers a phone that dropped the connection.
    useRefreshOnFocus(() => fetchCustomers({ silent: true }), { enabled: Boolean(user?.id), intervalMs: 120000 });

    useEffect(() => {
        if (!selectedCust) return;
        const fresh = customers.find(customer => customer.id === selectedCust.id);
        if (fresh && Object.keys(fresh).some(key => JSON.stringify(fresh[key]) !== JSON.stringify(selectedCust[key]))) {
            setSelectedCust(prev => ({ ...prev, ...fresh }));
        }
    }, [customers]); // eslint-disable-line react-hooks/exhaustive-deps

    const hydrateFieldsFrom = (cust) => {
        setGeoTagStatus(cust.geo_tag_status || 'Pending');
        setGeoTagImage(Boolean(cust.geo_tag_image));
        setInstallationStatus(cust.installation_status || 'Pending');
        setInstallationDate(cust.installation_date || '');
        setVendorNote(cust.vendor_note || '');
    };

    // Lists load a few columns; the full record is read when a job is opened.
    const handleSelectCustomer = async (cust) => {
        setStageMoveError('');
        const { data: fullCustomer, error } = await supabase.from('admin').select('*').eq('id', cust.id).single();
        if (error) {
            console.error('Error loading job details:', error);
            showAlert('Could not open this job. Please refresh and try again.', { title: 'Job not loaded', type: 'error' });
            return;
        }
        setSelectedCust(fullCustomer);
        const tab = tabForStage(fullCustomer.stage);
        if (tab) setActiveTab(tab.id);
        else if (!tabById(activeTab)) setActiveTab(WORK_TABS[0]?.id);
        hydrateFieldsFrom(fullCustomer);
        setView('details');
        setSaveSuccess('');
        try {
            setDocuments(await getCustomerDocuments(cust.id) || []);
        } catch (err) {
            console.error('Failed to fetch documents for customer:', err);
            setDocuments([]);
        }
    };

    const geoDocs = documents.filter(doc => GEO_DOC_TYPES.includes(doc.doc_type));

    const handlePhotoUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !selectedCust) return;
        setUploadingPhoto(true);
        try {
            // Upload first, then remove the previous photo, so a dropped
            // connection never leaves the job with no photo at all.
            const newDoc = await uploadDocument(file, selectedCust.id, 'geo_tag_image', user?.id);
            if (!newDoc) return;
            for (const oldDoc of geoDocs.filter(doc => doc.id !== newDoc.id)) {
                const res = await deleteDocument(oldDoc);
                if (!res?.ok) console.warn('New geo-tag photo saved, but the old one was not removed:', res?.error);
            }
            setDocuments(prev => [newDoc, ...prev.filter(doc => !GEO_DOC_TYPES.includes(doc.doc_type))]);
            setGeoTagImage(true);
            const nextGeoStatus = geoTagStatus === 'Pending' ? 'Proceed' : geoTagStatus;
            const { ok, error } = await updateAdminRecord(selectedCust.id, { geo_tag_image: true, geo_tag_status: nextGeoStatus });
            if (!ok) throw error;
            setGeoTagStatus(nextGeoStatus);
            setSelectedCust(prev => ({ ...prev, geo_tag_image: true, geo_tag_status: nextGeoStatus }));
            void logActivity(user.id, 'update', `${selectedCust.customer_name}: geo-tag photo uploaded by ${user.name} (${file.name})`, '', selectedCust.id);
        } catch (err) {
            console.error('Error uploading geo photo:', err);
            showAlert(`The photo was not uploaded. ${err?.message || ''}`.trim(), { title: 'Upload failed', type: 'error' });
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleUpdateDocRemark = async (docId, remark) => {
        const res = await updateDocumentRemark(docId, remark);
        if (!res?.ok) {
            showAlert(res?.error?.message || 'The remark was not saved.', { title: 'Remark not saved', type: 'error' });
            return false;
        }
        setDocuments(prev => prev.map(doc => (doc.id === docId ? { ...doc, remark } : doc)));
        return true;
    };

    const handlePhotoPreview = async (doc) => {
        try {
            const url = await getViewUrl(doc.storage_path);
            if (!url) throw new Error('Could not open a secure link for this photo.');
            setPreviewDoc({ doc, url });
        } catch (err) {
            showAlert(err?.message || 'Could not open this photo.', { title: 'Preview failed', type: 'error' });
        }
    };

    const handleOpenBom = async () => {
        if (!BomPrintModal || !selectedCust) return;
        setLoadingBom(true);
        try {
            const { loadBomForCustomer, getBomTypeForCustomer } = await import('../utils/bom');
            const type = getBomTypeForCustomer(selectedCust);
            const { bom, items, loadError: bomError } = await loadBomForCustomer(selectedCust, type);
            if (bomError) {
                showAlert('The bill of materials could not be loaded, so the standard list is shown. Do not treat it as final; refresh or contact the office.',
                    { title: 'Bill of materials not loaded', type: 'error' });
            }
            setBomPrint({ bom, items, type });
        } catch (err) {
            showAlert(err?.message || 'The bill of materials could not be opened.', { title: 'Bill of materials not loaded', type: 'error' });
        } finally {
            setLoadingBom(false);
        }
    };

    // ── Editing and stage moves ──────────────────────────────────────────
    const selectedStage = selectedCust?.stage;
    const canEditInstallation = selectedStage === STAGE_IDS.INSTALLATION_STATUS;
    const canEditGeoTag = selectedStage === STAGE_IDS.GEO_TAG_PHOTO;
    const currentTab = tabById(activeTab);
    const currentStageIdx = PRIMARY_STAGES.findIndex(stage => stage.id === selectedStage);
    const tabStageIdx = PRIMARY_STAGES.findIndex(stage => stage.id === currentTab?.stage);
    const vendorIsFutureTab = currentStageIdx !== -1 && tabStageIdx !== -1 && tabStageIdx > currentStageIdx;
    const vendorIsPastTab = currentStageIdx !== -1 && tabStageIdx !== -1 && tabStageIdx < currentStageIdx;
    const nextStageId = selectedCust && currentTab?.stage === selectedStage ? getNextStageId(selectedCust) : null;

    const isInstallationDirty = Boolean(selectedCust) && (
        !sameText(installationStatus, selectedCust.installation_status, 'Pending')
        || !sameText(installationDate, selectedCust.installation_date)
        || !sameText(vendorNote, selectedCust.vendor_note));
    const isGeoTagDirty = Boolean(selectedCust) && !sameText(geoTagStatus, selectedCust.geo_tag_status, 'Pending');
    const hasUnsavedChanges = (activeTab === 'INSTALLATION' && canEditInstallation && isInstallationDirty)
        || (activeTab === 'GEO' && canEditGeoTag && isGeoTagDirty);

    const failMove = (message, title) => {
        setStageMoveError(message);
        showAlert(message, { title, type: 'warning' });
        return false;
    };

    const handleSaveChanges = async (advance = false) => {
        setStageMoveError('');
        const canEditCurrentTab = EDITABLE_TABS.includes(activeTab) && currentTab?.stage === selectedStage;
        if (!canEditCurrentTab) return failMove('This stage is view-only until the office moves the customer to it.', 'Stage not open yet');

        const effectiveInstallDate = installationDate || (normalizeInstallationStatus(installationStatus) === 'Yes' ? todayIST() : null);
        const updatePayload = activeTab === 'INSTALLATION'
            ? { installation_status: installationStatus, installation_date: effectiveInstallDate, vendor_note: vendorNote || null }
            : { geo_tag_status: geoTagStatus, geo_tag_image: geoTagImage };

        const auditChanges = [];
        const addAuditChange = (label, before, after) => {
            if (!sameText(before, after)) auditChanges.push(`${label}: ${String(before ?? '').trim() || 'Empty'} → ${String(after ?? '').trim() || 'Empty'}`);
        };
        if (activeTab === 'INSTALLATION') {
            addAuditChange('Installation status', selectedCust.installation_status, installationStatus);
            addAuditChange('Installation date', selectedCust.installation_date, effectiveInstallDate);
            addAuditChange('Installer note', selectedCust.vendor_note, vendorNote);
        } else {
            addAuditChange('Geo-tag status', selectedCust.geo_tag_status, geoTagStatus);
        }

        let nextStage = null;
        if (advance) {
            const record = { ...selectedCust, ...updatePayload };
            nextStage = getNextStageId(record);
            if (!nextStage) return failMove('This customer has no next stage to move to.', 'Nothing to move');
            const issues = missingStageRequirements(selectedStage, record);
            if (issues.length) {
                return failMove(`To move on to ${stageLabel(nextStage)}, please complete:\n• ${issues.join('\n• ')}`, `${currentTab.label} not finished`);
            }
        }

        if (!auditChanges.length && !nextStage) {
            flashSuccess('Saved.');
            return true;
        }

        setSaving(true);
        try {
            if (auditChanges.length) {
                const { ok, error } = await updateAdminRecord(selectedCust.id, updatePayload);
                if (!ok) throw error;
                void logActivity(user.id, 'update', `${selectedCust.customer_name}: ${currentTab.label} updated by ${user.name}`, auditChanges.join(' · '), selectedCust.id);
            }
            let moved = {};
            if (nextStage) {
                const { data, error } = await supabase.rpc('move_stage', {
                    p_customer_id: selectedCust.id, p_new_stage: nextStage, p_old_stage: selectedStage, p_remark: '',
                });
                if (error) throw error;
                moved = data || { stage: nextStage };
            }
            const patch = { ...updatePayload, ...moved };
            setCustomers(prev => prev.map(customer => (customer.id === selectedCust.id ? { ...customer, ...patch } : customer)));
            setSelectedCust(prev => ({ ...prev, ...patch }));
            setInstallationDate(updatePayload.installation_date ?? installationDate);

            const nextTab = nextStage ? tabForStage(nextStage) : null;
            if (nextTab) setActiveTab(nextTab.id);
            flashSuccess(nextStage ? `Moved to ${stageLabel(nextStage)}.` : 'Saved.');
            // The customer has left the installer's stages; go back to the job list.
            if (nextStage && !nextTab) setTimeout(() => setView('list'), 1200);
            return true;
        } catch (err) {
            console.error('Failed to save details:', err);
            const message = `${nextStage ? 'The stage was not moved. ' : 'Your changes were not saved. '}${err?.message || ''}`.trim();
            setStageMoveError(message);
            showAlert(message, { title: 'Not saved', type: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmGiveUp = async () => {
        if (!selectedCust?.id) return;
        if (selectedStage !== STAGE_IDS.INSTALLATION_STATUS) {
            showAlert(`A job can only be given up during ${stageLabel(STAGE_IDS.INSTALLATION_STATUS)}.`, { title: 'Not available', type: 'warning' });
            return;
        }
        setGivingUp(true);
        try {
            const { ok, error } = await updateAdminRecord(selectedCust.id, { installation_status: 'Giveup', vendor_note: giveUpReason || null });
            if (!ok) throw error;
            void logActivity(user.id, 'update', `${selectedCust.customer_name}: installation given up by ${user.name}`, giveUpReason || '', selectedCust.id);
            setShowGiveUpModal(false);
            setGiveUpReason('');
            setCustomers(prev => prev.filter(customer => customer.id !== selectedCust.id));
            setView('list');
        } catch (err) {
            console.error('Error giving up project:', err);
            showAlert(`The job was not given up. ${err?.message || ''}`.trim(), { title: 'Not saved', type: 'error' });
        } finally {
            setGivingUp(false);
        }
    };

    // Offers to save edits first. False = stay where you are.
    const confirmLeave = async (confirmLabel) => {
        if (!hasUnsavedChanges) return true;
        const shouldSave = await showConfirm('You have unsaved changes. Save them before leaving?', {
            title: 'Unsaved changes', confirmLabel, cancelLabel: 'Keep editing', type: 'success',
        });
        return shouldSave ? handleSaveChanges(false) : false;
    };

    // ── Lists ────────────────────────────────────────────────────────────
    const countFor = tab => customers.filter(customer => customer.stage === tab.stage).length;
    const searching = Boolean(searchQuery.trim());
    const listedCustomers = customers.filter(customer => (searching
        ? matchesSearch(customer, searchQuery)
        : customer.stage === tabById(activeTab)?.stage));
    const payouts = customers
        .filter(customer => Number(customer.vendor_quote) > 0)
        .sort((a, b) => String(b.installation_date || '').localeCompare(String(a.installation_date || '')));
    const payoutTotal = payouts.reduce((sum, row) => sum + Number(row.vendor_quote), 0);
    const paidTotal = payouts.filter(row => row.vendor_payment_status === 'Paid').reduce((sum, row) => sum + Number(row.vendor_quote), 0);
    const listTabs = [
        ...WORK_TABS.map(tab => ({ id: tab.id, label: tab.label, value: countFor(tab) })),
        ...(payoutsOn ? [{ id: 'PAYOUTS', label: 'Payouts', value: payouts.length }] : []),
        ...(CalendarView ? [{ id: 'CALENDAR', label: 'Calendar', icon: Calendar }] : []),
    ];
    const wideTab = view === 'list' && (activeTab === 'PAYOUTS' || activeTab === 'CALENDAR');

    const installValue = installationTagId(installationStatus);
    const installationLocked = isFinalTagValue(selectedCust?.installation_status, INSTALLATION_TAGS);
    const moveLabel = nextStageId ? `Save & move to ${stageLabel(nextStageId)}` : '';

    return (
        <MobilePortalShell
            label="Installer Portal" user={user} showEmail
            onRefresh={() => fetchCustomers({ silent: true })} refreshing={refreshing} refreshLabel="Refresh jobs"
            onLogout={onLogout} onChangePassword={onChangePassword} onBeforeLeave={() => confirmLeave('Save & log out')}
            mainClassName={wideTab ? 'max-w-4xl' : 'max-w-md'}
        >
            {view === 'list' || !selectedCust ? (
                <>
                    <PortalHero kicker="Installer" title={user.name}>
                        Your assigned jobs: delivery details, installation updates and site geo-tag photos.
                    </PortalHero>

                    <ErrorBanner title="Jobs not loaded" onRetry={() => fetchCustomers()}>{loadError}</ErrorBanner>

                    <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1.5" role="tablist" aria-label="Job lists">
                        {listTabs.map(tab => {
                            const active = activeTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button type="button" role="tab" aria-selected={active} key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`min-h-11 min-w-[88px] flex-1 snap-start rounded-2xl border p-3 text-left transition-all ${active ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'border-stone-100 bg-white shadow-sm'}`}>
                                    <span className={`block text-[10px] font-bold uppercase tracking-wider ${active ? 'text-amber-50' : 'text-stone-500'}`}>{tab.label}</span>
                                    {Icon
                                        ? <Icon size={18} className="mt-1" aria-hidden="true" />
                                        : <span className={`mt-0.5 block text-lg font-black ${active ? 'text-white' : 'text-stone-800'}`}>{tab.value}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {activeTab === 'CALENDAR' && CalendarView ? (
                        <LazyBoundary fallback={<LoadingState label="Opening calendar…" />}>
                            <CalendarView currentUser={user} />
                        </LazyBoundary>
                    ) : activeTab === 'PAYOUTS' && payoutsOn ? (
                        <section className="space-y-4 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
                            <div className="flex flex-col justify-between gap-2 border-b border-stone-100 pb-3 sm:flex-row sm:items-center">
                                <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                                    <IndianRupee size={16} className="text-amber-600" aria-hidden="true" /> Installation payouts
                                </h3>
                                {payouts.length > 0 && (
                                    <p className="text-xs font-bold text-stone-700">
                                        Total {formatINR(payoutTotal)} · Paid {formatINR(paidTotal, { zero: '₹0' })}
                                    </p>
                                )}
                            </div>
                            {payouts.length === 0 ? (
                                <EmptyState icon={IndianRupee} title="No payouts yet">Amounts appear here once the office records your payout for a job.</EmptyState>
                            ) : (
                                <ul className="divide-y divide-stone-100">
                                    {payouts.map(row => (
                                        <li key={row.id} className="flex items-start justify-between gap-3 py-3 text-xs">
                                            <div className="min-w-0">
                                                <p className="truncate font-bold text-stone-800">{row.customer_name || 'Unnamed customer'}</p>
                                                <p className="text-[11px] text-stone-500">{[row.villages, formatKwp(row.system_capacity_kwp)].filter(value => value && value !== '–').join(' · ') || '–'}</p>
                                                <p className="text-[11px] text-stone-500">Installed: {row.installation_date ? formatDate(row.installation_date, 'short') : 'Not yet'}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="font-bold text-stone-900">{formatINR(row.vendor_quote)}</p>
                                                <Badge tone={row.vendor_payment_status === 'Paid' ? 'green' : 'yellow'} className="mt-1">{row.vendor_payment_status || 'Pending'}</Badge>
                                                {row.vendor_paid_date && <p className="mt-1 text-[11px] text-stone-500">Paid {formatDate(row.vendor_paid_date, 'short')}</p>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    ) : (
                        <>
                            <div>
                                <SearchInput value={searchQuery} onChange={setSearchQuery} delay={150} label="Search jobs" placeholder="Name, phone, consumer no., serial…" />
                                {searching && (
                                    <p className="px-1 pt-1.5 text-[11px] text-stone-500">Searching all your jobs ({listedCustomers.length} result{listedCustomers.length === 1 ? '' : 's'})</p>
                                )}
                            </div>
                            <div className="space-y-2.5">
                                {loading && customers.length === 0 ? (
                                    <LoadingState label="Loading jobs…" />
                                ) : listedCustomers.length === 0 ? (
                                    <EmptyState title={searching ? 'No matching jobs' : 'No jobs at this stage'} />
                                ) : listedCustomers.map(cust => {
                                    const isInstallation = cust.stage === STAGE_IDS.INSTALLATION_STATUS;
                                    const isGeo = cust.stage === STAGE_IDS.GEO_TAG_PHOTO;
                                    let badge = <Badge tone="blue">{stageLabel(cust.stage)}</Badge>;
                                    if (isInstallation || isGeo) {
                                        const status = isInstallation ? (cust.installation_status || 'Pending') : (cust.geo_tag_status || 'Pending');
                                        const done = isInstallation ? normalizeInstallationStatus(status) === 'Yes' : status === 'Proceed';
                                        badge = <Badge tone={done ? 'green' : 'yellow'}>{stageLabel(cust.stage)}: {isInstallation ? INSTALLATION_TAGS.find(tag => tag.id === installationTagId(status))?.label || status : status}</Badge>;
                                    }
                                    const chips = [
                                        cust.consumer_no && ['Consumer no.', cust.consumer_no],
                                        cust.stage === STAGE_IDS.MATERIAL_DELIVERY && cust.inverter_serial_no && ['Inverter', cust.inverter_serial_no],
                                        cust.stage === STAGE_IDS.MATERIAL_DELIVERY && ['Panels', `${readModuleSerials(cust.panel_serial_no).length} serials`],
                                        cust.stage !== STAGE_IDS.MATERIAL_DELIVERY && cust.phone_number && ['Phone', cust.phone_number],
                                    ].filter(Boolean);
                                    return (
                                        <button type="button" key={cust.id} onClick={() => handleSelectCustomer(cust)}
                                            className="group flex w-full items-start justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-3.5 text-left shadow-sm hover:border-amber-400">
                                            <span className="min-w-0 flex-1 space-y-1">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className={`truncate text-xs font-bold ${cust.customer_name ? 'text-stone-900' : 'italic text-stone-500'}`}>{cust.customer_name || 'Unnamed customer'}</span>
                                                    {badge}
                                                </span>
                                                <span className="block truncate text-[11px] font-medium text-stone-500">{cust.villages || 'Address not given'}</span>
                                                {chips.length > 0 && (
                                                    <span className="flex flex-wrap gap-2 pt-0.5 text-[11px] text-stone-600">
                                                        {chips.map(([label, value]) => <span key={label}>{label}: <b>{value}</b></span>)}
                                                    </span>
                                                )}
                                            </span>
                                            <ChevronRight size={18} className="shrink-0 text-stone-300 group-hover:text-stone-700" aria-hidden="true" />
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            ) : (
                <>
                    <div className="flex items-center justify-between">
                        <button type="button" onClick={async () => { if (await confirmLeave('Save & go back')) setView('list'); }}
                            className="flex min-h-11 items-center gap-1 text-xs font-bold text-stone-600 hover:text-stone-900">
                            <ChevronLeft size={18} aria-hidden="true" /> Back to jobs
                        </button>
                        {canEditInstallation && (
                            <button type="button" onClick={() => setShowGiveUpModal(true)}
                                className="flex min-h-11 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-700 hover:bg-rose-100">
                                <AlertTriangle size={12} aria-hidden="true" /> Give up job
                            </button>
                        )}
                    </div>

                    <section className="space-y-4 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
                        <div className="border-b border-stone-100 pb-3">
                            <h2 className="text-base font-bold text-stone-800">{selectedCust.customer_name || 'Unnamed customer'}</h2>
                            <p className="mt-1 text-[11px] font-semibold text-stone-500">Consumer no.: {selectedCust.consumer_no || '–'} · Now at {stageLabel(selectedStage)}</p>
                        </div>

                        <div className="flex gap-1 overflow-x-auto rounded-xl border border-stone-200/60 bg-stone-100/80 p-1" role="tablist" aria-label="Job stages">
                            {WORK_TABS.map(tab => {
                                const Icon = tab.icon;
                                const active = activeTab === tab.id;
                                return (
                                    <button type="button" role="tab" aria-selected={active} key={tab.id}
                                        onClick={async () => { if (tab.id === activeTab || await confirmLeave('Save & continue')) setActiveTab(tab.id); }}
                                        className={`flex min-h-11 min-w-[88px] flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold ${active ? 'bg-amber-500 text-white' : 'text-stone-600 hover:text-stone-900'}`}>
                                        <Icon size={12} aria-hidden="true" /> <span className="truncate">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <ErrorBanner title="Not saved">{stageMoveError && <span className="whitespace-pre-line">{stageMoveError}</span>}</ErrorBanner>
                        <SuccessBanner>{saveSuccess}</SuccessBanner>

                        {vendorIsFutureTab && (
                            <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-center text-xs font-bold text-amber-800">
                                You can view this step, but it opens for editing once {stageLabel(selectedStage)} is finished.
                            </p>
                        )}
                        {vendorIsPastTab && (
                            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-800">
                                Your work on this step is done. The customer is now at {stageLabel(selectedStage)}, so these details are read-only.
                            </p>
                        )}

                        <h3 className="border-b border-stone-100 pb-1.5 text-[11px] font-black uppercase tracking-widest text-amber-700">{currentTab?.label}</h3>

                        {activeTab === 'DELIVERY' && (
                            <div className="space-y-4">
                                <p className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] font-medium text-blue-800">
                                    Delivery details are filled in by the dispatch team. The office moves the customer on when delivery is complete.
                                </p>
                                <FieldList fields={DELIVERY_FIELDS} record={selectedCust} variant="rows" className="rounded-2xl border border-stone-200 px-4 text-xs" />
                                {BomPrintModal && (
                                    <button type="button" onClick={handleOpenBom} disabled={loadingBom} className="sf-btn-secondary min-h-11 w-full">
                                        {loadingBom ? <Spinner size={14} /> : <Printer size={14} aria-hidden="true" />} Print bill of materials
                                    </button>
                                )}
                            </div>
                        )}

                        {activeTab === 'INSTALLATION' && (
                            <div className="space-y-4">
                                <Field label="Installation status">
                                    <TagPicker label="Installation status" options={INSTALLATION_OPTIONS} value={installValue} columns={4}
                                        locked={installationLocked} disabled={!canEditInstallation}
                                        onChange={id => {
                                            if (id === 'Giveup') { setShowGiveUpModal(true); return; }
                                            setInstallationStatus(id);
                                            if (normalizeInstallationStatus(id) === 'Yes' && !installationDate) setInstallationDate(todayIST());
                                        }} />
                                </Field>
                                <Field label="Installation note" htmlFor="vendor-note">
                                    <Textarea id="vendor-note" rows={2} value={vendorNote} disabled={!canEditInstallation}
                                        onChange={event => setVendorNote(event.target.value)} placeholder="Add installation notes or a site update" />
                                </Field>
                                {normalizeInstallationStatus(installationStatus) === 'Yes' && (
                                    <Field label="Installation date" htmlFor="install-date">
                                        <Input id="install-date" type="date" value={installationDate || ''} disabled={!canEditInstallation}
                                            onChange={event => setInstallationDate(event.target.value)} />
                                    </Field>
                                )}
                                {installationStatus === 'Giveup' && (
                                    <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800">
                                        <p className="flex items-center gap-2 font-bold"><AlertTriangle size={15} aria-hidden="true" /> You asked to give up this job.</p>
                                        {vendorNote && <p className="rounded-xl border border-rose-100 bg-white/80 p-2.5 italic">“{vendorNote}”</p>}
                                        <p className="font-semibold">The office is reviewing this request.</p>
                                    </div>
                                )}
                                <div className="space-y-2 pt-2">
                                    {moveLabel && normalizeInstallationStatus(installationStatus) === 'Yes' && (
                                        <button type="button" onClick={() => handleSaveChanges(true)} disabled={saving || !canEditInstallation} className="sf-btn-success min-h-11 w-full">
                                            {saving ? <Spinner size={14} /> : <ChevronRight size={14} aria-hidden="true" />} {moveLabel}
                                        </button>
                                    )}
                                    <button type="button" onClick={() => handleSaveChanges(false)} disabled={saving || !canEditInstallation || !isInstallationDirty}
                                        className={isInstallationDirty ? 'sf-btn-primary min-h-11 w-full' : 'sf-btn-secondary min-h-11 w-full'}>
                                        {saving ? <Spinner size={14} /> : isInstallationDirty ? <Save size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                                        {isInstallationDirty ? 'Save installation status' : 'Saved'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'GEO' && (
                            <div className="space-y-4">
                                <Field label="Geo-tag photo status">
                                    <TagPicker label="Geo-tag photo status" options={GEO_OPTIONS} value={geoTagStatus} columns={2}
                                        disabled={!canEditGeoTag} onChange={setGeoTagStatus} />
                                </Field>
                                <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Camera size={16} className="text-amber-600" aria-hidden="true" />
                                            <div>
                                                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-700">Geo-tag photo</p>
                                                <p className="text-[11px] text-stone-500">A site photo showing its location.</p>
                                            </div>
                                        </div>
                                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" aria-label="Choose geo-tag photo" />
                                        <button type="button" disabled={uploadingPhoto || !canEditGeoTag} onClick={() => fileInputRef.current?.click()} className="sf-btn-primary min-h-11 px-3">
                                            {uploadingPhoto ? <><Spinner size={12} /> Uploading…</> : <><Camera size={12} aria-hidden="true" /> Upload photo</>}
                                        </button>
                                    </div>
                                    {geoDocs.length > 0 ? geoDocs.map(doc => (
                                        <div key={doc.id} className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-2.5">
                                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                                <ImageIcon size={14} className="shrink-0 text-amber-600" aria-hidden="true" />
                                                <span className="truncate text-xs font-semibold text-stone-700">{doc.file_name}</span>
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <button type="button" onClick={() => handlePhotoPreview(doc)} aria-label="View photo"
                                                    className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100"><Eye size={14} aria-hidden="true" /></button>
                                                {/* An uploaded photo is locked until the office sends it back. */}
                                                {isReturnedDocument(doc) ? (
                                                    <>
                                                        <Badge tone="red">Returned</Badge>
                                                        <button type="button" disabled={!canEditGeoTag} onClick={() => fileInputRef.current?.click()} aria-label="Replace the returned photo"
                                                            className="flex h-11 w-11 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 disabled:opacity-40"><Upload size={14} aria-hidden="true" /></button>
                                                    </>
                                                ) : <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Locked</span>}
                                            </span>
                                        </div>
                                    )) : <p className="py-2 text-center text-[11px] italic text-stone-500">No photo uploaded yet.</p>}
                                </div>
                                <div className="space-y-2 pt-2">
                                    {moveLabel && (
                                        <>
                                            <button type="button" onClick={() => handleSaveChanges(true)} disabled={saving || !canEditGeoTag} className="sf-btn-success min-h-11 w-full">
                                                {saving ? <Spinner size={14} /> : <CheckCircle2 size={14} aria-hidden="true" />} {moveLabel}
                                            </button>
                                            {(geoTagStatus !== 'Proceed' || geoDocs.length === 0) && (
                                                <p className="text-center text-[11px] font-semibold text-rose-700">Upload a geo-tag photo and set the status to Proceed to continue.</p>
                                            )}
                                        </>
                                    )}
                                    <button type="button" onClick={() => handleSaveChanges(false)} disabled={saving || !canEditGeoTag || !isGeoTagDirty}
                                        className={isGeoTagDirty ? 'sf-btn-primary min-h-11 w-full' : 'sf-btn-secondary min-h-11 w-full'}>
                                        {saving ? <Spinner size={14} /> : isGeoTagDirty ? <Save size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                                        {isGeoTagDirty ? 'Save geo-tag status' : 'Saved'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="space-y-3 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
                        <h3 className="flex items-center gap-1.5 border-b border-stone-100 pb-1.5 text-[11px] font-black uppercase tracking-widest text-stone-500">
                            <ClipboardList size={12} aria-hidden="true" /> Customer information
                        </h3>
                        <FieldList fields={CUSTOMER_FIELDS} record={selectedCust} variant="rows" className="text-xs" />
                    </section>
                </>
            )}

            {previewDoc && (
                <FilePreviewModal file={previewDoc.doc} fileUrl={previewDoc.url} onClose={() => setPreviewDoc(null)}
                    onDownload={async () => {
                        const url = await getDownloadUrl(previewDoc.doc.storage_path, previewDoc.doc.file_name);
                        if (url) await downloadFileWithSaveAs(url, previewDoc.doc.file_name);
                    }}
                    onUpdateRemark={handleUpdateDocRemark} />
            )}

            <Modal open={showGiveUpModal} onClose={() => { setShowGiveUpModal(false); setGiveUpReason(''); }} busy={givingUp} size="sm" title="Give up this job?"
                footer={(
                    <>
                        <button type="button" onClick={() => { setShowGiveUpModal(false); setGiveUpReason(''); }} disabled={givingUp} className="sf-btn-secondary min-h-11">Cancel</button>
                        <button type="button" onClick={handleConfirmGiveUp} disabled={givingUp}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                            {givingUp && <Spinner size={12} />} Give up job
                        </button>
                    </>
                )}>
                <p className="text-sm text-stone-600">The office will be told you are giving up the installation for <b>{selectedCust?.customer_name}</b>.</p>
                <Field label="Reason" htmlFor="give-up-reason" className="mt-3">
                    <Textarea id="give-up-reason" rows={3} value={giveUpReason} onChange={event => setGiveUpReason(event.target.value)}
                        placeholder="For example: roof structure issue, site not reachable, distance" />
                </Field>
            </Modal>

            {bomPrint && BomPrintModal && selectedCust && (
                <LazyBoundary>
                    <BomPrintModal customer={selectedCust} bom={bomPrint.bom} bomItems={bomPrint.items} activeType={bomPrint.type} onClose={() => setBomPrint(null)} />
                </LazyBoundary>
            )}
        </MobilePortalShell>
    );
}
