import { useDemoTourNavigation } from '../demo/tour';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { logActivity, uploadDocument, getCustomerDocuments, getDownloadUrl, getViewUrl, deleteDocument, toIndianCommas, updateDocumentRemark, normalizeInstallationStatus, updateAdminRecord, downloadFileWithSaveAs } from '../utils';
import { 
    User, Phone, Mail, MapPin, Zap, Building2, CheckCircle2, ChevronRight, LogOut, Loader2, AlertCircle, AlertTriangle,
    Hash, Folder, Tag, ChevronLeft, Search, ClipboardList, Banknote, Calendar, ClipboardCheck,
    Camera, Paperclip, Eye, Upload, Image as ImageIcon, X,
    Printer, ShoppingBag, Layers, Ruler, IndianRupee, Package, FileText, Truck, Check, Wrench, RefreshCw, Save, Terminal
} from 'lucide-react';
import { FilePreviewModal } from './modal-tabs/shared';
import { ROOF_BOM_TEMPLATE, SHED_BOM_TEMPLATE, STAGE_IDS, PRIMARY_STAGES, INSTALLATION_TAGS, VENDOR_LIST_COLUMNS, isFinalTagValue } from '../constants';
import { isReturnedDocument } from './modal-tabs/shared';
import { useGlobalPopup } from './GlobalPopup';
import BrandMark from './BrandMark';
import VendorCalendarView from './VendorCalendarView';

const parsePanelSerials = (raw) => {
    if (!raw) return [''];
    if (Array.isArray(raw)) return raw.length > 0 ? raw : [''];
    if (typeof raw !== 'string') raw = String(raw);
    
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length > 0 ? parsed : [''];
    } catch { /* not valid JSON, fall through to default */ }

    if (raw.includes('\n')) {
        return raw.split('\n').map(s => String(s).trim()).filter(Boolean);
    }
    if (raw.includes(',')) {
        return raw.split(',').map(s => String(s).trim()).filter(Boolean);
    }
    return [raw.trim()];
};

export default function VendorPortal({ user, onLogout, onOpenDevSwitcher, demoControls }) {
    useDemoTourNavigation(async ({view,action},isCurrent) => {
        if (!['DELIVERY','INSTALLATION','GEO'].includes(view)) return;
        setView('list'); setSelectedCust(null); setActiveTab(view);
        if(action === 'customer'){
            const {data,error}=await supabase.from('admin').select('*').is('deleted_at',null).eq('stage',TAB_STAGE_MAP[view]).ilike('vendor',user.name).order('created_at').limit(1);
            if(!isCurrent())return;
            if(error)showAlert(error.message,{type:'error'});
            else if(data?.[0])await handleSelectCustomer(data[0],isCurrent);
        }
    },user.userType);

    const { showAlert, showConfirm, showImageCropper } = useGlobalPopup();
    const [view, setView] = useState('list'); // 'list', 'details'
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshingAssignments, setRefreshingAssignments] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    // Material Integration and Material Delivery are intentionally hidden from vendors.
    const [activeTab, setActiveTab] = useState('DELIVERY'); // 'DELIVERY', 'INSTALLATION', 'GEO'
    const [selectedCust, setSelectedCust] = useState(null);
    const TAB_STAGE_MAP = useMemo(() => ({ MATERIAL: STAGE_IDS.MATERIAL_INTEGRATION, DELIVERY: STAGE_IDS.MATERIAL_DELIVERY, INSTALLATION: STAGE_IDS.INSTALLATION_STATUS, GEO: STAGE_IDS.GEO_TAG_PHOTO }), []);

    const vendorIsFutureTab = useMemo(() => {
        const currentStageIdx = PRIMARY_STAGES.findIndex(s => s.id === selectedCust?.stage);
        const tabStageIdx = PRIMARY_STAGES.findIndex(s => s.id === TAB_STAGE_MAP[activeTab]);
        return currentStageIdx !== -1 && tabStageIdx !== -1 && tabStageIdx > currentStageIdx;
    }, [selectedCust?.stage, activeTab, TAB_STAGE_MAP]);

    // The mirror of vendorIsFutureTab: the customer has already moved PAST this
    // tab. Without this the screen looked broken - an "Installed" record sitting
    // at Discom Submission still rendered a live-looking "Save & Move to Geo Tag
    // Photo" button, greyed out by canEditInstallation with nothing saying why.
    // The vendor's work here is finished; there is nothing to move.
    const vendorIsPastTab = useMemo(() => {
        const currentStageIdx = PRIMARY_STAGES.findIndex(s => s.id === selectedCust?.stage);
        const tabStageIdx = PRIMARY_STAGES.findIndex(s => s.id === TAB_STAGE_MAP[activeTab]);
        return currentStageIdx !== -1 && tabStageIdx !== -1 && tabStageIdx < currentStageIdx;
    }, [selectedCust?.stage, activeTab, TAB_STAGE_MAP]);

    const currentStageLabel = useMemo(
        () => PRIMARY_STAGES.find(s => s.id === selectedCust?.stage)?.label || selectedCust?.stage || '',
        [selectedCust?.stage]
    );
    
    // Edit Form State (for selected customer)
    const [geoTagStatus, setGeoTagStatus] = useState('Pending');
    const [geoTagImage, setGeoTagImage] = useState(false);
    const [installationStatus, setInstallationStatus] = useState('Pending');
    const [installationDate, setInstallationDate] = useState('');
    const [vendorNote, setVendorNote] = useState('');
    
    // Material Delivery State
    const [inverterSerialNo, setInverterSerialNo] = useState('');
    const [invoiceNo, setInvoiceNo] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [panelSerials, setPanelSerials] = useState(['']);
    
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [stageMoveError, setStageMoveError] = useState('');

    // Document attachments state
    const [documents, setDocuments] = useState([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [previewDoc, setPreviewDoc] = useState(null);
    const fileInputRef = useRef(null);
    // Set when replacing a photo that Admin/Office sent back.
    const replacingPhotoRef = useRef(null);

    // BOM Print Modal for Vendor (Read-Only)
    const [showBomModal, setShowBomModal] = useState(false);
    const [targetBomCust, setTargetBomCust] = useState(null);
    const [bomData, setBomData] = useState(null);
    const [bomItems, setBomItems] = useState([]);
    const [loadingBom, setLoadingBom] = useState(false);
    const vendorBomPrintRef = useRef(null);

    // Give Up Project Modal state
    const [showGiveUpModal, setShowGiveUpModal] = useState(false);
    const [giveUpReason, setGiveUpReason] = useState('');
    const [givingUp, setGivingUp] = useState(false);


    // Fetch BOM for Print (Read-Only)
    const handleOpenBomModal = async (cust) => {
        const target = cust || selectedCust;
        if (!target?.id) return;
        setTargetBomCust(target);
        setShowBomModal(true);
        setLoadingBom(true);
        try {
            const { data: bom, error: bomErr } = await supabase
                .from('bom')
                .select('*')
                .eq('admin_id', target.id)
                .maybeSingle();

            // A failed query used to leave `bom` null, which fell through to the
            // "no BOM yet" branch below and showed a blank template - identical
            // to a customer who genuinely has no BOM. The vendor had no way to
            // tell a load failure from an empty materials list.
            if (bomErr) throw bomErr;

            if (bom) {
                setBomData(bom);
                const { data: items, error: itemsErr } = await supabase
                    .from('bom_items')
                    .select('*')
                    .eq('bom_id', bom.id)
                    .order('sr_no', { ascending: true });
                if (itemsErr) throw itemsErr;
                setBomItems(items || []);
            } else {
                const template = (target.roof_shed || '').toLowerCase().includes('shed') ? SHED_BOM_TEMPLATE : ROOF_BOM_TEMPLATE;
                setBomData({
                    bom_type: target.roof_shed || 'Roof',
                    paper_prepared_by: '',
                    material_loaded_by: ''
                });
                setBomItems(template.map((t, idx) => ({
                    sr_no: idx + 1,
                    product_name: t.product_name,
                    make: t.default_make || 'Standard',
                    uom: t.uom || 'Nos',
                    integration_by: t.default_integration || 'Vendor',
                    note: ''
                })));
            }
        } catch (e) {
            console.error('Error fetching BOM for vendor:', e);
            showAlert(
                'The Bill of Materials could not be loaded, so a blank template is being shown. Do not treat this as the final materials list - please retry or contact the office.',
                { title: 'BOM not loaded', type: 'error' }
            );
            const template = (target.roof_shed || '').toLowerCase().includes('shed') ? SHED_BOM_TEMPLATE : ROOF_BOM_TEMPLATE;
            setBomData({ bom_type: target.roof_shed || 'Roof' });
            setBomItems(template.map((t, idx) => ({
                sr_no: idx + 1,
                product_name: t.product_name,
                make: t.default_make || 'Standard',
                uom: t.uom || 'Nos',
                integration_by: t.default_integration || 'Vendor',
                note: ''
            })));
        } finally {
            setLoadingBom(false);
        }
    };

    // Keep the read-only Material Integration reference card current without
    // forcing the vendor to open the print preview first.
    useEffect(() => {
        if (activeTab !== 'MATERIAL' || !selectedCust?.id) return;
        let cancelled = false;

        supabase
            .from('bom')
            .select('*')
            .eq('admin_id', selectedCust.id)
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled) setBomData(data || null);
            });

        return () => { cancelled = true; };
    }, [activeTab, selectedCust?.id]);

    const handlePrintVendorBom = () => {
        const documentBody = vendorBomPrintRef.current;
        if (!documentBody) return;

        const cleanName = String(targetBomCust?.customer_name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanRef = String(targetBomCust?.folder_no || targetBomCust?.consumer_no || 'Site').replace(/[^a-zA-Z0-9_-]/g, '_');
        const docTitle = `BOM_Vendor_Dispatch_${cleanName}_${cleanRef}`;
        const prevDocTitle = document.title;

        // Remove any old print portal
        const existing = document.getElementById('native-print-portal');
        if (existing) existing.remove();

        const printPortal = document.createElement('div');
        printPortal.id = 'native-print-portal';
        printPortal.innerHTML = documentBody.innerHTML;
        document.body.appendChild(printPortal);

        document.body.classList.add('is-printing-document');
        document.title = docTitle;

        const cleanup = () => {
            document.body.classList.remove('is-printing-document');
            document.title = prevDocTitle;
            if (document.body.contains(printPortal)) {
                document.body.removeChild(printPortal);
            }
            window.removeEventListener('afterprint', cleanup);
        };

        window.addEventListener('afterprint', cleanup);

        setTimeout(() => {
            window.print();
            setTimeout(cleanup, 2000);
        }, 100);
    };

    const registeredVendorNamesRef = useRef([]);

    // Fetch customer leads strictly assigned to this vendor
    const userIdentifiers = useMemo(() => {
        return [
            user?.channel_partner,
            user?.name,
            user?.title,
            user?.email,
            (user?.email || '').toLowerCase().includes('deeproot') ? 'deeproot' : null,
            (user?.email || '').toLowerCase().includes('deeproot') ? 'test vendor' : null,
            (user?.name || '').toLowerCase().includes('vendor 1') || (user?.name || '').toLowerCase().includes('demo vendor') ? 'vendor 1' : null,
            (user?.name || '').toLowerCase().includes('vendor 1') || (user?.name || '').toLowerCase().includes('demo vendor') ? 'demo vendor 1' : null,
            (user?.name || '').toLowerCase().includes('vendor 1') || (user?.name || '').toLowerCase().includes('demo vendor') ? 'demo vendor' : null
        ].filter(Boolean).map(s => String(s).trim().toLowerCase());
    }, [user?.channel_partner, user?.name, user?.title, user?.email]);

    // Ownership must mean exactly what the RLS policy means:
    //   lower(trim(admin.vendor)) = lower(trim(get_my_name()))
    //
    // This used to match on substrings in BOTH directions, plus hardcoded demo
    // special-cases ('deeproot', 'test vendor'/'solar tech'), plus a catch-all:
    //   (target.includes('vendor') && custVendor.length > 0)
    // Because userIdentifiers includes the account's EMAIL, any vendor signed in
    // as something like vendor@company.com matched EVERY record that had any
    // vendor assigned - other vendors' jobs included. Writes to those records
    // were then refused by RLS with 0 rows and no error, so they also looked
    // saved and were not.
    const isRecordAssignedToVendor = useCallback((record) => {
        const custVendor = (record?.vendor || '').trim().toLowerCase();
        if (!custVendor) return false;

        const allTargets = [
            ...userIdentifiers,
            ...(registeredVendorNamesRef.current || [])
        ].filter(Boolean);

        return allTargets.some(id => custVendor === String(id).trim().toLowerCase());
    }, [userIdentifiers]);

    const fetchCustomers = useCallback(async ({ silent = false } = {}) => {
        if (silent) setRefreshingAssignments(true);
        else setLoading(true);

        try {
            const userEmail = (user?.email || '').trim().toLowerCase();
            const userName = (user?.name || '').trim();

            // Step 1: Get vendor names linked to this user from vendors table
            const { data: vRows } = await supabase
                .from('vendors')
                .select('name, email');

            const allVendorRows = vRows || [];
            const matchedVendorNames = allVendorRows
                .filter(v => {
                    const vEmail = (v.email || '').trim().toLowerCase();
                    const vName = (v.name || '').trim().toLowerCase();
                    return vEmail === userEmail || vName === userName.toLowerCase();
                })
                .map(v => (v.name || '').trim())
                .filter(Boolean);

            // Use profile name as fallback if not found in vendors table
            let searchNames = matchedVendorNames.length > 0 ? matchedVendorNames : (userName ? [userName] : []);
            
            // Expand aliases so Vendor 1 can access all assigned customer projects
            const expanded = new Set(searchNames);
            searchNames.forEach(n => {
                const lower = n.toLowerCase();
                if (lower.includes('vendor 1') || lower.includes('demo vendor 1') || lower === 'demo vendor' || lower === 'vendor1') {
                    expanded.add('Vendor 1');
                    expanded.add('Demo Vendor 1');
                    expanded.add('Demo Vendor');
                    expanded.add('vendor 1');
                } else if (lower.includes('vendor 2') || lower.includes('demo vendor 2')) {
                    expanded.add('Vendor 2');
                    expanded.add('Demo Vendor 2');
                } else if (lower.includes('vendor 3') || lower.includes('demo vendor 3')) {
                    expanded.add('Vendor 3');
                    expanded.add('Demo Vendor 3');
                }
            });
            searchNames = Array.from(expanded);

            if (searchNames.length === 0) {
                setCustomers([]);
                return;
            }

            // Step 2: Query admin table DIRECTLY using .in() for exact matches
            // We use .in() instead of .or() because it's much more reliable in Supabase
            let data = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                const { data: page, error } = await supabase
                    .from('admin')
                    .select(VENDOR_LIST_COLUMNS)
                    .in('vendor', searchNames)
                    .order('created_at', { ascending: false })
                    .range(from, from + pageSize - 1);
                if (error) throw error;
                if (!page || page.length === 0) break;
                data = data.concat(page);
                if (page.length < pageSize) break;
                from += pageSize;
            }
            
            // Client-side filtering to see if deleted_at or Give Up was hiding it
            const activeData = (data || []).filter(r => 
                r.deleted_at === null && r.installation_status !== 'Giveup'
            );

            console.log('[VendorPortal] Searching names:', searchNames, '| Total found:', (data || []).length, '| Active found:', activeData.length);
            if ((data || []).length > 0 && activeData.length === 0) {
                console.warn('[VendorPortal] WARNING: Records were found but ALL are either deleted or marked as Give Up!', data);
            }

            setCustomers(activeData);


        } catch (err) {
            console.error('Error fetching vendor customers:', err);
            setCustomers([]);
        } finally {
            if (silent) setRefreshingAssignments(false);
            else setLoading(false);
        }
    }, [user?.email, user?.name]);

    useEffect(() => {
        if (!user?.name && !user?.email) {
            setLoading(false);
            return;
        }

        fetchCustomers();

        const channel = supabase.channel(`vendor_customers_${user.id || 'vendor'}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin' }, payload => {
                const record = payload.new;
                const isVisibleToVendor = record && !record.deleted_at &&
                    isRecordAssignedToVendor(record) &&
                    // Tag id is 'Giveup' (no space) - "Give Up" never matched, so
                    // given-up records kept arriving through realtime.
                    normalizeInstallationStatus(record.installation_status) !== 'Give Up';

                setCustomers(previous => {
                    if (payload.eventType === 'DELETE' || !isVisibleToVendor) {
                        return previous.filter(customer => customer.id !== (record?.id || payload.old?.id));
                    }
                    const exists = previous.some(customer => customer.id === record.id);
                    if (payload.eventType === 'INSERT' && !exists) return [record, ...previous];
                    return previous.map(customer => customer.id === record.id ? record : customer);
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, user?.name, user?.email, fetchCustomers, isRecordAssignedToVendor]);

    // Realtime is the primary update path. This lightweight fallback keeps
    // assignments current when a mobile browser temporarily drops that connection.
    useEffect(() => {
        if (!user?.name && !user?.email) return;

        const refreshAssignments = () => fetchCustomers({ silent: true });
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshAssignments();
        };

        // Realtime handles normal updates. A two-minute fallback avoids every open
        // vendor tab downloading its full assignment list four times per minute.
        const refreshInterval = window.setInterval(refreshAssignments, 120000);
        window.addEventListener('focus', refreshAssignments);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(refreshInterval);
            window.removeEventListener('focus', refreshAssignments);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user?.name, user?.email, fetchCustomers]);

    // Sync selectedCust state with fresh database values when updates occur
    useEffect(() => {
        if (selectedCust) {
            const fresh = customers.find(c => c.id === selectedCust.id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedCust)) {
                setSelectedCust(fresh);
            }
        }
    }, [customers]);

    // Handle selecting a customer card
    // Seeds every editable field from the stored record. Used when opening a
    // customer and when discarding unsaved changes.
    const hydrateFieldsFrom = (cust) => {
        if (!cust) return;
        setInverterSerialNo(cust.inverter_serial_no || '');
        setInvoiceNo(cust.invoice_no || '');
        setDriverName(cust.driver_name || '');
        setDriverPhone(cust.driver_phone_number || '');
        setPanelSerials(parsePanelSerials(cust.panel_serial_no));

        setGeoTagStatus(cust.geo_tag_status || 'Pending');
        setGeoTagImage(!!cust.geo_tag_image);

        setInstallationStatus(cust.installation_status || 'Pending');
        setInstallationDate(cust.installation_date || '');
        setVendorNote(cust.vendor_note || '');
    };

    const handleSelectCustomer = async (cust, isCurrent = () => true) => {
        setStageMoveError('');
        // Keep list loading light, then fetch the complete record only for the
        // assignment the vendor actually opens.
        const { data: fullCustomer, error: fullCustomerError } = await supabase
            .from('admin')
            .select('*')
            .eq('id', cust.id)
            .single();
        if (fullCustomerError) {
            console.error('Error loading vendor customer details:', fullCustomerError);
            showAlert('Could not load this assignment. Please refresh and try again.', 'Load Failed');
            return;
        }
        if(!isCurrent())return;
        const openedCustomer = fullCustomer || cust;
        setSelectedCust(openedCustomer);
        
        // Match active tab to the vendor-facing customer stage.
        if (openedCustomer.stage === STAGE_IDS.MATERIAL_DELIVERY) {
            setActiveTab('DELIVERY');
        } else if (openedCustomer.stage === STAGE_IDS.GEO_TAG_PHOTO) {
            setActiveTab('GEO');
        } else if (openedCustomer.stage === STAGE_IDS.INSTALLATION_STATUS) {
            setActiveTab('INSTALLATION');
        }

        hydrateFieldsFrom(openedCustomer);

        setView('details');
        setSaveSuccess(false);

        // Fetch customer documents
        try {
            const docs = await getCustomerDocuments(cust.id);
            setDocuments(docs || []);
        } catch (err) {
            console.error('Failed to fetch documents for customer:', err);
            setDocuments([]);
        }
    };

    // Upload geo tag photo handler
    const handlePhotoUpload = async (e) => {
        const rawFile = e.target.files?.[0];
        if (!rawFile || !selectedCust) return;
        e.target.value = '';

        let file = rawFile;
        if (showImageCropper) {
            file = await showImageCropper(rawFile, { title: 'Crop & Adjust Geo-Tag Photo' });
            if (!file) return; // User cancelled upload
        }

        setUploadingPhoto(true);
        try {
            // Upload FIRST. Deleting the previous photo before the upload meant
            // a vendor on a flaky mobile connection lost the original with
            // nothing to fall back on.
            const newDoc = await uploadDocument(file, selectedCust.id, 'geo_tag_image', user?.id);

            if (newDoc) {
                const existingGeo = (documents || []).filter(d =>
                    (d.doc_type === 'geo_tag_image' || d.doc_type === 'geo_tag') && d.id !== newDoc.id);
                for (const oldDoc of existingGeo) {
                    try {
                        await deleteDocument(oldDoc);
                    } catch (delErr) {
                        console.warn('New geo tag photo saved, but removing the old one failed:', delErr);
                    }
                }
            }
            if (newDoc) {
                setDocuments(prev => [
                    newDoc,
                    ...(prev || []).filter(d => d.doc_type !== 'geo_tag_image' && d.doc_type !== 'geo_tag')
                ]);
                setGeoTagImage(true);
                
                const nextGeoStatus = geoTagStatus === 'Pending' ? 'Proceed' : geoTagStatus;
                // Unchecked before: the photo uploaded but the flag/status did
                // not save. Keep the checklist flag synchronized with the upload for
                // Discom Submission - so the vendor was stuck with no reason given.
                const { ok: geoOk, error: geoErr } = await updateAdminRecord(selectedCust.id, {
                    geo_tag_image: true,
                    geo_tag_status: nextGeoStatus
                });
                if (!geoOk) throw geoErr;

                if (geoTagStatus === 'Pending') {
                    setGeoTagStatus('Proceed');
                }
                
                if (user?.id) {
                    void logActivity(
                        user.id,
                        'update',
                        `Vendor ${user.name || ''} uploaded Geo Tag Photo (${file.name})`,
                        '',
                        selectedCust.id
                    );
                }
            }
        } catch (err) {
            console.error('Error uploading geo photo:', err);
            showAlert('Failed to upload photo: ' + (err.message || err), {
                title: 'Upload Error',
                type: 'error'
            });
        } finally {
            const replaced = replacingPhotoRef.current;
            replacingPhotoRef.current = null;
            if (replaced) await handlePhotoDelete(replaced);
            setUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUpdateDocRemark = async (docId, newRemark) => {
        // The try/catch here was decorative - updateDocumentRemark never threw,
        // it logged and returned undefined, so a refused write showed "Saved!".
        const res = await updateDocumentRemark(docId, newRemark);
        if (!res?.ok) {
            showAlert(res?.error?.message || 'The remark was not saved.', { type: 'error' });
            return false;
        }
        setDocuments(prev => (prev || []).map(d => d.id === docId ? { ...d, remark: newRemark } : d));
        return true;
    };

    // Removes the returned photo once its replacement has uploaded.
    const handlePhotoDelete = async (doc) => {
        try {
            await deleteDocument(doc);
            const remaining = (documents || []).filter(d => d.id !== doc.id);
            setDocuments(remaining);
            const hasOtherGeo = remaining.some(d => d.doc_type === 'geo_tag_image' || d.doc_type === 'geo_tag');
            if (!hasOtherGeo) {
                setGeoTagImage(false);
                const { ok: clearOk, error: clearGeoErr } = await updateAdminRecord(selectedCust.id, { geo_tag_image: false });
                if (!clearOk) throw clearGeoErr;
            }
        } catch (err) {
            console.error('Error deleting photo:', err);
            showAlert(err.message || 'Could not delete the selected photo.', {
                title: 'Delete Failed',
                type: 'error'
            });
        }
    };

    // Preview photo handler
    const handlePhotoPreview = async (doc) => {
        try {
            const url = await getViewUrl(doc.storage_path);
            if (url) {
                setPreviewDoc({ doc, url });
            }
        } catch (err) {
            console.error('Error loading preview:', err);
        }
    };

    const canMoveToGeoTag = normalizeInstallationStatus(installationStatus) === 'Yes';

    const isInstallationDirty = Boolean(
        String(installationStatus || 'Pending').trim() !== String(selectedCust?.installation_status || 'Pending').trim() ||
        String(installationDate || '').trim() !== String(selectedCust?.installation_date || '').trim() ||
        String(vendorNote || '').trim() !== String(selectedCust?.vendor_note || '').trim()
    );

    const isDeliveryDirty = Boolean(
        String(inverterSerialNo || '').trim() !== String(selectedCust?.inverter_serial_no || '').trim() ||
        String(invoiceNo || '').trim() !== String(selectedCust?.invoice_no || '').trim() ||
        String(driverName || '').trim() !== String(selectedCust?.driver_name || '').trim() ||
        String(driverPhone || '').trim() !== String(selectedCust?.driver_phone_number || '').trim() ||
        JSON.stringify(panelSerials.filter(Boolean)) !== JSON.stringify(parsePanelSerials(selectedCust?.panel_serial_no).filter(Boolean))
    );

    const isGeoTagDirty = Boolean(
        String(geoTagStatus || 'Pending').trim() !== String(selectedCust?.geo_tag_status || 'Pending').trim()
    );

    // Save changes to Supabase and optionally progress stage
    const handleSaveChanges = async (nextStage = null) => {
        setStageMoveError('');
        const currentStage = String(selectedCust?.stage || '').toUpperCase().trim();
        const canEditCurrentTab =
            (activeTab === 'INSTALLATION' && currentStage === STAGE_IDS.INSTALLATION_STATUS) ||
            (activeTab === 'GEO' && currentStage === STAGE_IDS.GEO_TAG_PHOTO);

        if (!canEditCurrentTab) {
            const message = 'This stage is view-only until the office moves the customer to it.';
            setStageMoveError(message);
            showAlert(message, {
                title: 'Stage Not Available Yet',
                type: 'warning'
            });
            return false;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const effectiveInstallDate = installationDate || (normalizeInstallationStatus(installationStatus) === 'Yes' ? todayStr : null);

        // Build the audit detail from values that genuinely changed. Besides
        // making the log useful, this prevents the already-saved button from
        // creating a misleading "updated" entry for a no-op save.
        const auditChanges = [];
        const addAuditChange = (label, before, after) => {
            const oldValue = String(before ?? '').trim();
            const newValue = String(after ?? '').trim();
            if (oldValue !== newValue) {
                auditChanges.push(`${label}: ${oldValue || 'Empty'} → ${newValue || 'Empty'}`);
            }
        };
        if (activeTab === 'INSTALLATION') {
            addAuditChange('Installation Status', selectedCust?.installation_status, installationStatus);
            addAuditChange('Installation Date', selectedCust?.installation_date, effectiveInstallDate);
            addAuditChange('Vendor Note', selectedCust?.vendor_note, vendorNote);
        } else if (activeTab === 'GEO') {
            addAuditChange('Geo Tag Status', selectedCust?.geo_tag_status, geoTagStatus);
        }
        if (nextStage) addAuditChange('Stage', selectedCust?.stage, nextStage);

        if (auditChanges.length === 0) {
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            return true;
        }

        // Comprehensive Logical Validation when advancing from Installation to Geo Tag
        if (nextStage === STAGE_IDS.GEO_TAG_PHOTO) {
            const missingItems = [];
            if (normalizeInstallationStatus(installationStatus) !== 'Yes') {
                missingItems.push('Physical Installation Status must be marked "Yes".');
            }
            if (!effectiveInstallDate) {
                missingItems.push('Installation Date must be selected.');
            }

            if (missingItems.length > 0) {
                const message = `To move forward to Geo Tag Photo, please complete:\n• ${missingItems.join('\n• ')}`;
                setStageMoveError(message);
                showAlert(message, {
                    title: 'Installation Incomplete',
                    type: 'warning'
                });
                return false;
            }
        }

        // Comprehensive Logical Validation when advancing from Geo Tag to Discom Submission
        if (nextStage === STAGE_IDS.DISCOM_SUBMISSION) {
            const missingItems = [];
            if (geoTagStatus !== 'Proceed') {
                missingItems.push('Geo Tag Photo Status must be set to "Proceed".');
            }

            if (missingItems.length > 0) {
                const message = `To move forward to Discom Submission, please complete:\n• ${missingItems.join('\n• ')}`;
                setStageMoveError(message);
                showAlert(message, {
                    title: 'Geo Tag Report Incomplete',
                    type: 'warning'
                });
                return false;
            }
        }

        setSaving(true);
        setSaveSuccess(false);
        try {
            const updatePayload = activeTab === 'INSTALLATION'
                ? {
                    installation_status: installationStatus,
                    installation_date: effectiveInstallDate,
                    vendor_note: vendorNote || null,
                }
                : {
                    geo_tag_status: geoTagStatus,
                    geo_tag_image: geoTagImage,
                };

            if (nextStage) {
                updatePayload.stage = nextStage;
            }

            // Routed through the shared helper so this portal gets the same
            // protections as the main app: unknown columns stripped, '' turned
            // into null for numeric/date columns, and a 0-rows result treated
            // as a failure instead of a silent success.
            const { ok, error } = await updateAdminRecord(selectedCust.id, updatePayload);
            if (!ok) throw error;

            let logMsg = `Vendor ${user.name} updated ${
                activeTab === 'DELIVERY' 
                    ? 'Material Delivery Details' 
                    : activeTab === 'INSTALLATION'
                        ? 'Installation Status'
                        : 'Geo Tag Report'
            }`;
            if (nextStage) {
                logMsg += ` and advanced stage to ${nextStage}`;
            }

            if (user?.id) {
                void logActivity(
                    user.id,
                    'update',
                    `${selectedCust.customer_name}: ${logMsg}`,
                    auditChanges.join(' · '),
                    selectedCust.id
                );
            }
            
            setSaveSuccess(true);
            setStageMoveError('');
            setCustomers(prev => prev.map(customer => customer.id === selectedCust.id ? { ...customer, ...updatePayload } : customer));
            
            setSelectedCust(prev => ({
                ...prev,
                ...updatePayload,
                stage: nextStage || prev.stage
            }));

            if (nextStage === STAGE_IDS.INSTALLATION_STATUS) {
                setActiveTab('INSTALLATION');
                setTimeout(() => setSaveSuccess(false), 3000);
            } else if (nextStage === STAGE_IDS.GEO_TAG_PHOTO) {
                setActiveTab('GEO');
                setTimeout(() => setSaveSuccess(false), 3000);
            } else if (nextStage === STAGE_IDS.DISCOM_SUBMISSION) {
                setTimeout(() => {
                    setView('list');
                }, 1200);
            } else {
                setTimeout(() => setSaveSuccess(false), 3000);
            }
            return true;
        } catch (err) {
            console.error('Failed to save details:', err);
            const technicalMessage = err?.message || String(err || 'Unknown database error');
            const message = `The stage was not moved. ${technicalMessage}`;
            setStageMoveError(message);
            showAlert(message, {
                title: 'Database Error',
                type: 'error'
            });
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Give Up Project handler
    const handleConfirmGiveUp = async () => {
        if (!selectedCust?.id) return;
        if (String(selectedCust.stage || '').toUpperCase().trim() !== STAGE_IDS.INSTALLATION_STATUS) {
            showAlert('This project can only be given up during the Installation stage.', {
                title: 'Action Not Available',
                type: 'warning'
            });
            return;
        }
        setGivingUp(true);
        try {
            const { ok, error } = await updateAdminRecord(selectedCust.id, {
                installation_status: 'Giveup',
                vendor_note: giveUpReason || null
            });
            if (!ok) throw error;

            if (user?.id) {
                void logActivity(
                    user.id,
                    'update',
                    `Vendor ${user.name} gave up installation for ${selectedCust.customer_name}${giveUpReason ? `: "${giveUpReason}"` : ''}`,
                    '',
                    selectedCust.id
                );
            }

            setShowGiveUpModal(false);
            setGiveUpReason('');
            setCustomers(prev => prev.filter(customer => customer.id !== selectedCust.id));
            setView('list');
        } catch (err) {
            console.error('Error giving up project:', err);
            showAlert(`Failed to record give up: ${err.message || err}`, {
                title: 'Submission Error',
                type: 'error'
            });
        } finally {
            setGivingUp(false);
        }
    };



    // Helper to normalize stages
    const normalizeStage = (st) => String(st || '').toUpperCase().trim();
    const selectedStage = normalizeStage(selectedCust?.stage);
    const canEditInstallation = selectedStage === STAGE_IDS.INSTALLATION_STATUS;
    const canEditGeoTag = selectedStage === STAGE_IDS.GEO_TAG_PHOTO;

    // Stats calculations
    // Material Delivery only. This used to be a catch-all - "anything that is not
    // Installation or Geo Tag" - so a record already at Discom Submission was
    // counted and listed here, and the tab read 4 when the vendor had 3 delivery
    // jobs. Opening one of those showed a finished job with dead buttons.
    //
    // A record whose stage is past Geo Tag is no longer the vendor's work, so it
    // is no longer listed. It stays reachable by search, which deliberately
    // ignores the tab filter.
    const materialDeliveryCount = customers.filter(
        c => normalizeStage(c.stage) === STAGE_IDS.MATERIAL_DELIVERY
    ).length;
    const installationCount = customers.filter(c => normalizeStage(c.stage) === STAGE_IDS.INSTALLATION_STATUS).length;
    const geoTagCount = customers.filter(c => normalizeStage(c.stage) === STAGE_IDS.GEO_TAG_PHOTO).length;

    // Payout records for this vendor (projects with installation or completed)
    const vendorPayouts = useMemo(() => {
        return (customers || []).map((c, idx) => {
            const baseDate = c.registration_date || (c.created_at ? c.created_at.split('T')[0] : '2026-03-01');
            let delDate = c.material_delivery_date;
            if (!delDate) {
                const d = new Date(baseDate);
                d.setDate(d.getDate() + 7 + (idx % 5));
                delDate = d.toISOString().split('T')[0];
            }
            let instDate = c.installation_date;
            if (!instDate && delDate) {
                const d = new Date(delDate);
                d.setDate(d.getDate() + 5 + (idx % 4));
                instDate = d.toISOString().split('T')[0];
            }
            const cap = Number(c.system_capacity_kwp) || 3.5;
            const quote = (c.vendor_quote !== undefined && c.vendor_quote !== null && Number(c.vendor_quote) > 0)
                ? Number(c.vendor_quote)
                : Math.round(cap * 2200);

            const isHistorical = baseDate.startsWith('2025') || (baseDate.startsWith('2026') && Number(baseDate.split('-')[1]) < 7);
            const status = c.vendor_payment_status || (isHistorical && idx % 3 !== 0 ? 'Paid' : 'Pending');

            // 1st of month M+1
            const targetDateStr = instDate || delDate || baseDate;
            const parts = targetDateStr.split('-');
            const yr = parseInt(parts[0], 10);
            const mo = parseInt(parts[1], 10) - 1;
            const payoutDate = new Date(yr, mo + 1, 1);
            const dueDateStr = payoutDate.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

            return {
                ...c,
                material_delivery_date: delDate,
                installation_date: instDate,
                vendor_quote: quote,
                vendor_payment_status: status,
                payoutDueDate: dueDateStr,
                payoutSortKey: payoutDate.getTime()
            };
        }).sort((a, b) => b.payoutSortKey - a.payoutSortKey);
    }, [customers]);

    const payoutsCount = vendorPayouts.length;

    // Filtered lists: search across all fields safely and across all stages if a query is typed
    const filteredCustomers = customers.filter(c => {
        const q = (searchQuery || '').trim().toLowerCase();
        
        const matchesSearch = !q || (
            String(c.customer_name || '').toLowerCase().includes(q) ||
            String(c.phone_number || '').toLowerCase().includes(q) ||
            String(c.consumer_no || '').toLowerCase().includes(q) ||
            String(c.folder_no || '').toLowerCase().includes(q) ||
            String(c.villages || '').toLowerCase().includes(q) ||
            String(c.inverter_serial_no || '').toLowerCase().includes(q) ||
            String(c.sub_channel_partner || '').toLowerCase().includes(q)
        );

        // If user is searching, return matches across all vendor stages!
        if (q) {
            return matchesSearch;
        }

        // When not searching, filter by active tab stage
        const s = normalizeStage(c.stage);
        if (activeTab === 'DELIVERY') {
            return s === STAGE_IDS.MATERIAL_DELIVERY;
        } else if (activeTab === 'INSTALLATION') {
            return s === STAGE_IDS.INSTALLATION_STATUS;
        } else {
            return s === STAGE_IDS.GEO_TAG_PHOTO;
        }
    });

    // Geo tag documents for current selected customer
    const geoDocs = documents.filter(d => d.doc_type === 'geo_tag_image' || d.doc_type === 'geo_tag');

    const saveBeforeVendorExit = async (confirmLabel) => {
        const hasChanges =
            (activeTab === 'INSTALLATION' && canEditInstallation && isInstallationDirty) ||
            (activeTab === 'GEO' && canEditGeoTag && isGeoTagDirty);
        if (!hasChanges) return true;
        const shouldSave = await showConfirm('You have unsaved changes. Save them before leaving?', {
            title: 'Unsaved changes',
            confirmLabel: 'Save & Leave',
            cancelLabel: 'Keep Editing',
            type: 'success'
        });
        if (!shouldSave) return false;
        return handleSaveChanges(null);
    };

    return (
        <div className="min-h-screen bg-[#FCFBFA] text-stone-850 font-sans flex flex-col pb-8">
            {/* Top Header */}
            <header className="bg-white border-b border-stone-100 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-sm">
                <BrandMark label="Vendor Portal" />
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <span className="text-xs font-bold text-stone-800 block truncate max-w-[150px]">{user.name}</span>
                        {user.email && <span className="text-[10px] text-stone-400 font-medium block truncate max-w-[150px]">{user.email}</span>}
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchCustomers({ silent: true })}
                        disabled={refreshingAssignments}
                        className="p-2 text-stone-400 hover:text-amber-600 transition-colors rounded-xl hover:bg-amber-50 disabled:opacity-50"
                        title="Refresh assignments"
                        aria-label="Refresh assignments"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshingAssignments ? 'animate-spin' : ''}`} />
                    </button>
                    {import.meta.env.DEV && onOpenDevSwitcher && (
                        <button
                            type="button"
                            onClick={onOpenDevSwitcher}
                            className="p-2 text-amber-600 hover:text-amber-700 transition-colors rounded-xl hover:bg-amber-50"
                            title="Open development role switcher"
                            aria-label="Open development role switcher"
                        >
                            <Terminal className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={async () => { if (await saveBeforeVendorExit('Save & Logout')) onLogout(); }}
                        className="p-2 text-stone-400 hover:text-red-500 transition-colors rounded-xl hover:bg-stone-50"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            <div className="demo-portal-controls">{demoControls}</div>
            </header>

            {view === 'list' ? (
                <main className={`flex-1 p-4 mx-auto w-full space-y-4 animate-in fade-in duration-300 ${activeTab === 'PAYOUTS' ? 'max-w-4xl' : 'max-w-md'}`}>
                    {/* Welcome banner */}
                    <div className="bg-stone-900 text-white p-5 rounded-[24px] shadow-lg relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-[0.07]">
                            <BrandMark variant="white" size="lg" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[9px] uppercase tracking-widest text-amber-400 font-bold">Allotted Vendor</p>
                            {user.email && (
                                <span className="text-[10px] text-amber-200/90 font-mono bg-white/10 px-2 py-0.5 rounded-md border border-white/10">{user.email}</span>
                            )}
                        </div>
                        <h2 className="text-lg font-bold mt-1">{user.name}</h2>
                        <p className="text-[11px] text-stone-300 mt-2 font-medium">Manage assigned installation updates, payouts, and site geo tagging.</p>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 -mx-1 px-1 snap-x scroll-smooth no-scrollbar">
                        <div
                            className={`min-w-[82px] sm:min-w-[96px] flex-1 snap-start p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer ${activeTab === 'DELIVERY' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-100 shadow-sm'}`}
                            onClick={() => setActiveTab('DELIVERY')}
                        >
                            <p className={`text-[8px] font-bold uppercase tracking-wider ${activeTab === 'DELIVERY' ? 'text-amber-100' : 'text-stone-400'}`}>Delivery</p>
                            <p className={`text-base sm:text-lg font-black mt-0.5 ${activeTab === 'DELIVERY' ? 'text-white' : 'text-stone-850'}`}>{materialDeliveryCount}</p>
                        </div>
                        <div
                            className={`min-w-[82px] sm:min-w-[96px] flex-1 snap-start p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer ${activeTab === 'INSTALLATION' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-100 shadow-sm'}`}
                            onClick={() => setActiveTab('INSTALLATION')}
                        >
                            <p className={`text-[8px] font-bold uppercase tracking-wider ${activeTab === 'INSTALLATION' ? 'text-amber-100' : 'text-stone-400'}`}>Installation</p>
                            <p className={`text-base sm:text-lg font-black mt-0.5 ${activeTab === 'INSTALLATION' ? 'text-white' : 'text-stone-850'}`}>{installationCount}</p>
                        </div>
                        <div 
                            className={`min-w-[82px] sm:min-w-[96px] flex-1 snap-start p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer ${activeTab === 'GEO' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-100 shadow-sm'}`} 
                            onClick={() => setActiveTab('GEO')}
                        >
                            <p className={`text-[8px] font-bold uppercase tracking-wider ${activeTab === 'GEO' ? 'text-amber-100' : 'text-stone-400'}`}>Geo Tag</p>
                            <p className={`text-base sm:text-lg font-black mt-0.5 ${activeTab === 'GEO' ? 'text-white' : 'text-stone-850'}`}>{geoTagCount}</p>
                        </div>
                        <div 
                            className={`min-w-[82px] sm:min-w-[96px] flex-1 snap-start p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer ${activeTab === 'PAYOUTS' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-100 shadow-sm'}`} 
                            onClick={() => setActiveTab('PAYOUTS')}
                        >
                            <p className={`text-[8px] font-bold uppercase tracking-wider ${activeTab === 'PAYOUTS' ? 'text-amber-100' : 'text-stone-400'}`}>Payouts</p>
                            <p className={`text-base sm:text-lg font-black mt-0.5 ${activeTab === 'PAYOUTS' ? 'text-white' : 'text-stone-850'}`}>{payoutsCount}</p>
                        </div>
                        <div 
                            className={`min-w-[82px] sm:min-w-[96px] flex-1 snap-start p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer ${activeTab === 'AVAILABILITY' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-100 shadow-sm'}`} 
                            onClick={() => setActiveTab('AVAILABILITY')}
                        >
                            <p className={`text-[8px] font-bold uppercase tracking-wider ${activeTab === 'AVAILABILITY' ? 'text-amber-100' : 'text-stone-400'}`}>Schedule</p>
                            <p className={`text-xs sm:text-sm font-black mt-1 flex items-center gap-1 ${activeTab === 'AVAILABILITY' ? 'text-white' : 'text-stone-850'}`}>
                                <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 inline" /> Calendar
                            </p>
                        </div>
                    </div>

                    {/* Search across all stages */}
                    {activeTab !== 'AVAILABILITY' && activeTab !== 'PAYOUTS' && (
                        <div className="pt-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-stone-400 w-4.5 h-4.5" />
                                <input
                                    type="text"
                                    placeholder="Search by name, phone, consumer no, serial..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-8 py-2.5 bg-white border border-stone-200 rounded-xl text-xs w-full focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium shadow-xs"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 p-0.5 rounded-full cursor-pointer"
                                        title="Clear search"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            {searchQuery.trim() && (
                                <div className="flex items-center justify-between text-[10px] text-stone-500 px-1 pt-1.5">
                                    <span>Searching across all stages ({filteredCustomers.length} result{filteredCustomers.length === 1 ? '' : 's'})</span>
                                    <button 
                                        onClick={() => setSearchQuery('')} 
                                        className="text-amber-600 font-bold hover:underline cursor-pointer"
                                    >
                                        Reset
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Customers List, Calendar, or Payouts Ledger */}
                    {activeTab === 'AVAILABILITY' ? (
                        <VendorCalendarView vendorName={user.name} currentUser={user} />
                    ) : activeTab === 'PAYOUTS' ? (
                        <div className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-stone-850 flex items-center gap-1.5">
                                        <IndianRupee className="w-4 h-4 text-amber-500" />
                                        Installation Payouts & Commission
                                    </h3>
                                    <p className="text-[11px] text-stone-400 font-medium">Standard ₹2,200/kWp installation fee calculated on completion</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-stone-700 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-lg">
                                        Total: <span className="text-amber-600">₹{toIndianCommas(vendorPayouts.reduce((sum, r) => sum + (Number(r.vendor_quote) || 0), 0))}</span>
                                    </span>
                                </div>
                            </div>

                            {vendorPayouts.length === 0 ? (
                                <div className="py-12 text-center text-stone-400">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                                    <p className="text-xs font-bold">No installation payout records found.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[650px]">
                                        <thead>
                                            <tr className="border-b border-stone-100 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                                <th className="pb-2">Customer & Site</th>
                                                <th className="pb-2">Capacity</th>
                                                <th className="pb-2">Delivery Date</th>
                                                <th className="pb-2">Install Date</th>
                                                <th className="pb-2">Payout Due Date</th>
                                                <th className="pb-2">Commission (₹)</th>
                                                <th className="pb-2 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-stone-50 text-xs">
                                            {vendorPayouts.map(r => (
                                                <tr key={r.id} className="hover:bg-amber-50/40 transition-colors">
                                                    <td className="py-2.5 pr-3">
                                                        <div className="font-bold text-stone-850">{r.customer_name || 'Unnamed Client'}</div>
                                                        <div className="text-[10px] text-stone-400">{r.villages || r.phone_number || '—'}</div>
                                                    </td>
                                                    <td className="py-2.5 pr-3 font-semibold text-stone-700">
                                                        {r.system_capacity_kwp ? `${r.system_capacity_kwp} kWp` : '3.5 kWp'}
                                                    </td>
                                                    <td className="py-2.5 pr-3 text-stone-600 text-[11px]">
                                                        {r.material_delivery_date || 'Pending'}
                                                    </td>
                                                    <td className="py-2.5 pr-3 text-stone-600 text-[11px]">
                                                        {r.installation_date || 'Pending'}
                                                    </td>
                                                    <td className="py-2.5 pr-3 font-medium text-stone-700 text-[11px]">
                                                        {r.payoutDueDate}
                                                    </td>
                                                    <td className="py-2.5 pr-3 font-bold text-stone-900">
                                                        ₹{toIndianCommas(r.vendor_quote || 0)}
                                                    </td>
                                                    <td className="py-2.5 text-right">
                                                        <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                                                            r.vendor_payment_status === 'Paid'
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {r.vendor_payment_status || 'Pending'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2.5 pt-1">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-stone-400">
                                <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-2" />
                                <p className="text-xs font-semibold">Loading assignments...</p>
                            </div>
                        ) : filteredCustomers.length > 0 ? (
                            filteredCustomers.map(cust => {
                                // ─── One card shape for every stage ───────────────
                                // Each stage previously had its own hand-built card:
                                // different metadata layout (stacked chips vs inline
                                // bullets), a chevron on two of the three, and a
                                // status badge on only one. Same list, three designs.
                                //
                                // The skeleton below is now identical everywhere -
                                // name, stage badge, village, chips, footer - and
                                // only the CONTENT of the chips and footer varies,
                                // because the useful fields genuinely differ by stage.
                                const isIntegration  = cust.stage === STAGE_IDS.MATERIAL_INTEGRATION;
                                const isDelivery     = cust.stage === STAGE_IDS.MATERIAL_DELIVERY;
                                const isInstallation = cust.stage === STAGE_IDS.INSTALLATION_STATUS;

                                let badgeLabel, badgeClass, chips;

                                if (isIntegration) {
                                    badgeLabel = cust.system_capacity_kwp ? `${cust.system_capacity_kwp} kWp` : 'BOM Ready';
                                    badgeClass = 'bg-amber-100 text-amber-800';
                                    chips = [
                                        cust.consumer_no && ['Consumer', cust.consumer_no],
                                        cust.folder_no   && ['Folder', cust.folder_no],
                                        cust.roof_shed   && ['Type', cust.roof_shed],
                                    ];
                                } else if (isDelivery) {
                                    const panels = parsePanelSerials(cust.panel_serial_no).filter(Boolean);
                                    badgeLabel = 'Delivery Stage';
                                    badgeClass = 'bg-blue-100 text-blue-800';
                                    chips = [
                                        cust.consumer_no         && ['Cons', cust.consumer_no],
                                        cust.inverter_serial_no  && ['Inv', cust.inverter_serial_no],
                                        ['Panels', `${panels.length} serials`],
                                    ];
                                } else {
                                    const statusValue = isInstallation
                                        ? (cust.installation_status || 'Pending')
                                        : (cust.geo_tag_status || 'Pending');
                                    const isComplete = isInstallation
                                        ? normalizeInstallationStatus(statusValue) === 'Yes'
                                        : statusValue === 'Proceed';
                                    badgeLabel = `${isInstallation ? 'Installation' : 'Geo'}: ${statusValue}`;
                                    badgeClass = isComplete
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800';
                                    chips = [
                                        cust.consumer_no  && ['Cons', cust.consumer_no],
                                        cust.phone_number && ['Ph', cust.phone_number],
                                    ];
                                }

                                chips = chips.filter(Boolean);

                                return (
                                    <div
                                        key={cust.id}
                                        onClick={() => handleSelectCustomer(cust)}
                                        className="bg-white p-3.5 rounded-2xl border border-stone-150 shadow-sm hover:border-amber-400 hover:shadow-md transition-all space-y-2.5 cursor-pointer active:scale-[0.99] group"
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {/* Fallback matters: 18 rows from the 23 Aug
                                                        import have no customer_name, and rendered
                                                        as a nameless card with no way to tell what
                                                        it was. */}
                                                    <h4 className={`text-xs font-bold truncate group-hover:text-amber-600 transition-colors ${
                                                        cust.customer_name ? 'text-stone-900' : 'text-stone-400 italic'
                                                    }`}>
                                                        {cust.customer_name || 'Unnamed record'}
                                                    </h4>
                                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md whitespace-nowrap ${badgeClass}`}>
                                                        {badgeLabel}
                                                    </span>
                                                    {searchQuery.trim() && (
                                                        <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-900 text-white whitespace-nowrap">
                                                            {cust.stage}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-stone-400 font-medium truncate">{cust.villages || 'Address not specified'}</p>
                                                {chips.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 text-[9px] text-stone-500 pt-0.5">
                                                        {chips.map(([label, value]) => (
                                                            <span key={label}>{label}: <b>{value}</b></span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <ChevronRight className="w-4.5 h-4.5 text-stone-300 group-hover:text-stone-700 transition-colors flex-shrink-0" />
                                        </div>

                                        {isIntegration && (
                                            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                                                <span className="text-[9px] font-bold text-stone-400 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                    Open BOM details or print
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenBomModal(cust);
                                                    }}
                                                    className="text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-200 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                                >
                                                    <Printer size={11} /> Print BOM
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="bg-white p-8 rounded-2xl border border-stone-100 text-center text-stone-400 shadow-sm">
                                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                                <p className="text-xs font-bold">No assigned installations found in this stage.</p>
                            </div>
                        )}
                    </div>
                    )}
                </main>
            ) : (
                /* Customer Details & Editing View */
                <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 animate-in slide-in-from-right duration-300">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={async () => {
                                const hasChanges =
                                    (activeTab === 'INSTALLATION' && canEditInstallation && isInstallationDirty) ||
                                    (activeTab === 'GEO' && canEditGeoTag && isGeoTagDirty);
                                if (hasChanges) {
                                    const shouldSave = await showConfirm('You have unsaved changes. Save them before going back?', { title: 'Unsaved changes', confirmLabel: 'Save & Back', cancelLabel: 'Keep Editing', type: 'success' });
                                    if (!shouldSave || !(await handleSaveChanges(null))) return;
                                }
                                setView('list');
                            }}
                            className="flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors py-1 cursor-pointer"
                        >
                            <ChevronLeft className="w-4.5 h-4.5" /> Back to Dashboard
                        </button>
                        {canEditInstallation && (
                            <button
                                type="button"
                                onClick={() => setShowGiveUpModal(true)}
                                className="text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                                <AlertTriangle size={12} className="text-rose-600" /> Give Up Project
                            </button>
                        )}
                    </div>

                    <div className="bg-white p-5 rounded-[24px] border border-stone-150 shadow-sm space-y-4">
                        <div className="border-b border-stone-100 pb-3">
                            <h2 className="text-base font-bold text-stone-850">{selectedCust.customer_name}</h2>
                            <p className="text-[10px] text-stone-400 font-semibold mt-1">Consumer No: {selectedCust.consumer_no || '–'}</p>
                        </div>

                        {/* Stage Tabs inside Customer View */}
                        <div className="flex gap-1 overflow-x-auto p-1 bg-stone-100/80 rounded-xl border border-stone-200/60 snap-x">
                            {[
                                { id: 'DELIVERY', label: 'Delivery', icon: Truck },
                                { id: 'INSTALLATION', label: 'Installation', icon: Wrench },
                                { id: 'GEO', label: 'Geo Tag', icon: Camera },
                            ].map(tab => {
                                const Icon = tab.icon;
                                const isCurrent = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={async () => {
                                            const hasChanges =
                                                (activeTab === 'INSTALLATION' && canEditInstallation && isInstallationDirty) ||
                                                (activeTab === 'GEO' && canEditGeoTag && isGeoTagDirty);
                                            if (tab.id !== activeTab && hasChanges) {
                                                const shouldSave = await showConfirm('You have unsaved changes. Save them before continuing?', { title: 'Unsaved changes', confirmLabel: 'Save & Continue', cancelLabel: 'Keep Editing', type: 'success' });
                                                if (!shouldSave || !(await handleSaveChanges(null))) return;
                                            }
                                            setActiveTab(tab.id);
                                        }}
                                        className={`min-w-[82px] flex-1 snap-start py-1.5 px-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                            isCurrent
                                                ? 'bg-amber-500 text-white shadow-xs'
                                                : 'text-stone-500 hover:text-stone-800'
                                        }`}
                                    >
                                        <Icon size={11} />
                                        <span className="hidden sm:inline">{tab.label}</span>
                                        <span className="sm:hidden">{tab.id === 'DELIVERY' ? 'Delivery' : tab.id === 'GEO' ? 'Geo' : 'Install'}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {stageMoveError && (
                            <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-800">
                                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold">Could not move to the next stage</p>
                                    <p className="mt-1 whitespace-pre-line break-words text-[11px] font-medium">{stageMoveError}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStageMoveError('')}
                                    className="rounded-lg p-1 text-rose-500 hover:bg-rose-100 hover:text-rose-800"
                                    aria-label="Dismiss stage error"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {/* Editable Form Card */}
                        <div className="space-y-4">
                            {vendorIsFutureTab && (
                                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 text-center">
                                    <p className="text-xs font-bold text-amber-800">
                                        You can view this step, but editing is locked. Complete {currentStageLabel} and use its “Save & Move” button to unlock it.
                                    </p>
                                </div>
                            )}
                            {vendorIsPastTab && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                                    <p className="text-xs font-bold text-emerald-800">
                                        Your work on this stage is complete.
                                    </p>
                                    <p className="text-[10px] font-medium text-emerald-700 mt-0.5">
                                        This customer has already moved on to {currentStageLabel}, so these details are read-only.
                                    </p>
                                </div>
                            )}
                            <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest border-b border-stone-100 pb-1.5">
                                {activeTab === 'DELIVERY' 
                                    ? 'Material Delivery Details' 
                                    : activeTab === 'INSTALLATION' 
                                        ? 'Installation Status & Details' 
                                        : activeTab === 'MATERIAL'
                                            ? 'Material Integration & BOM'
                                            : 'Geo Tag Photo Report'}
                            </h3>

                            {/* ─── Active Tab: MATERIAL INTEGRATION & BOM ─── */}
                            {activeTab === 'MATERIAL' && (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-amber-200/80 bg-orange-50 p-4 shadow-xs">
                                        <div className="flex items-start justify-between gap-3 border-b border-amber-200/70 pb-3">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">BOM Details</p>
                                                <p className="mt-0.5 text-[10px] font-medium text-stone-500">View the full material checklist, specifications, and signatures.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenBomModal(selectedCust)}
                                                className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-amber-600 cursor-pointer flex items-center gap-1.5"
                                            >
                                                <Printer size={12} /> View & Print
                                            </button>
                                        </div>
                                        <div className="space-y-4 pt-3">
                                            <div>
                                                <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-stone-400">Material Order Specifications <span className="ml-1 font-semibold normal-case tracking-normal">(View Only)</span></p>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                                    {[
                                                        ['Roof / Shed', selectedCust.roof_shed], ['DC Cable (Meters)', selectedCust.dc_cable], ['AC Cable (Meters)', selectedCust.ac_cable], ['Structure Front Leg Height (ft)', selectedCust.structure_front_leg_height], ['Structure Rear Leg Height (ft)', selectedCust.structure_rear_leg_height], ['Invoice Value (₹)', selectedCust.invoice_value ? `₹${toIndianCommas(selectedCust.invoice_value)}` : '–'], ['Notes / Special Instructions', selectedCust.material_order_notes],
                                                    ].map(([label, value]) => <div key={label}><p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p><p className="font-semibold text-stone-900">{value || '–'}</p></div>)}
                                                </div>
                                            </div>
                                            <div className="border-t border-amber-200/70 pt-3">
                                                <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-stone-400">Customer & Site Reference <span className="ml-1 font-semibold normal-case tracking-normal">(View Only)</span></p>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                                    {[
                                                        ['Customer Name', selectedCust.customer_name], ['Phone Number', selectedCust.phone_number], ['Email Address', selectedCust.email], ['Consumer No', selectedCust.consumer_no], ['Villages', selectedCust.villages], ['Sub Division', selectedCust.sub_divisions], ['Channel Partner Name', selectedCust.channel_partner], ['Dealer Name', selectedCust.sub_channel_partner], ['Module Brand', selectedCust.module_brand], ['Module WP', selectedCust.module_wp], ['No of Modules', selectedCust.no_of_modules], ['System Capacity (kWp)', selectedCust.system_capacity_kwp ? toIndianCommas(selectedCust.system_capacity_kwp) : '–'],
                                                    ].map(([label, value]) => <div key={label}><p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p><p className="font-semibold text-stone-900 break-words">{value || '–'}</p></div>)}
                                                </div>
                                            </div>
                                            <div className="border-t border-amber-200/70 pt-3">
                                                <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-stone-400">Procurement & Loading Milestones <span className="ml-1 font-semibold normal-case tracking-normal">(View Only)</span></p>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                                    {[
                                                        ['Paper Prepared By', bomData?.paper_prepared_by], ['Paper Prepared Date', bomData?.paper_prepared_date], ['Material Loaded By', bomData?.material_loaded_by], ['Material Loaded Date', bomData?.material_loaded_date],
                                                    ].map(([label, value]) => <div key={label}><p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p><p className="font-semibold text-stone-900">{value || '–'}</p></div>)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Material Delivery is supplied by the office/logistics team.
                                Vendors can inspect every delivery field and copy serials, and proceed to installation. */}
                            {activeTab === 'DELIVERY' && (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] text-blue-800 font-medium flex items-center justify-between gap-2">
                                        <span>Material Delivery information is supplied by the dispatch team.</span>
                                        {selectedCust?.stage === STAGE_IDS.MATERIAL_DELIVERY && (
                                            <span className="px-2 py-0.5 bg-amber-500 text-white rounded-md text-[9px] font-bold uppercase tracking-wider">Awaiting Acknowledgment</span>
                                        )}
                                    </div>
                                    <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white px-4">
                                        {[
                                            ['Invoice No *', selectedCust.invoice_no],
                                            ['Delivery Date *', selectedCust.material_delivery_date],
                                            ['Vehicle / Truck No', selectedCust.vehicle_number],
                                            ['Driver Name *', selectedCust.driver_name],
                                            ['Driver Phone Number *', selectedCust.driver_phone_number],
                                        ].map(([label, value]) => (
                                            <div key={label} className="flex items-start justify-between gap-4 py-3 text-xs">
                                                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wide">{label}</p>
                                                <p className="max-w-[58%] text-right font-semibold text-stone-800 break-words">{value || '–'}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {saveSuccess && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-[10px] font-bold flex items-center gap-1.5 animate-in fade-in duration-200">
                                            <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
                                            <span>Stage updated successfully!</span>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center text-[10px] font-semibold text-stone-500">
                                        View only. The office will move this customer to Installation when delivery is complete.
                                    </div>
                                </div>
                            )}
                            
                            {/* ─── Active Tab: GEO TAG PHOTO ─── */}
                            {activeTab === 'GEO' && (
                                <div className="space-y-4">
                                    {/* Status selector */}
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                                            Geo Tag Photo Status
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'Proceed', label: 'Proceed', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' },
                                                { id: 'Pending', label: 'Pending', activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10', dotClass: 'bg-white' }
                                            ].map(tag => {
                                                const isSelected = geoTagStatus === tag.id;
                                                return (
                                                    <button
                                                        key={tag.id}
                                                        type="button"
                                                        disabled={!canEditGeoTag}
                                                        onClick={() => setGeoTagStatus(tag.id)}
                                                        className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                                                            isSelected
                                                                ? tag.activeClass
                                                                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                                        }`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? tag.dotClass : 'bg-stone-300'}`} />
                                                        {tag.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Photo Upload Card */}
                                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-150/80 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Camera className="w-4 h-4 text-amber-500" />
                                                <div>
                                                    <p className="text-[10px] font-bold text-stone-700 uppercase tracking-wide">Geo Tag Photograph</p>
                                                    <p className="text-[9px] text-stone-400 font-medium">Upload site photo with geo-coordinates.</p>
                                                </div>
                                            </div>

                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handlePhotoUpload}
                                                className="hidden"
                                            />

                                            <button
                                                type="button"
                                                disabled={uploadingPhoto || !canEditGeoTag}
                                                onClick={() => fileInputRef.current?.click()}
                                                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-amber-500/10 cursor-pointer disabled:opacity-50"
                                            >
                                                {uploadingPhoto ? (
                                                    <><Loader2 size={11} className="animate-spin" /> Uploading...</>
                                                ) : (
                                                    <><Camera size={11} /> Attach / Upload Photo</>
                                                )}
                                            </button>
                                        </div>

                                        {/* Attached Photos List */}
                                        {geoDocs.length > 0 ? (
                                            <div className="space-y-2 pt-1">
                                                {geoDocs.map(doc => (
                                                    <div key={doc.id} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-stone-200 shadow-xs">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <ImageIcon size={14} className="text-amber-500 flex-shrink-0" />
                                                            <span className="text-xs font-semibold text-stone-700 truncate">{doc.file_name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePhotoPreview(doc)}
                                                                className="text-stone-500 hover:text-stone-800 p-1 rounded-lg hover:bg-stone-100 transition cursor-pointer"
                                                                title="View full photo"
                                                            >
                                                                <Eye size={13} />
                                                            </button>
                                                            {/* An uploaded photo is locked. Admin or Office must send it
                                                                back before it can be replaced; there is no delete. */}
                                                            {isReturnedDocument(doc) ? (
                                                                <>
                                                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Returned</span>
                                                                    <button
                                                                        type="button"
                                                                        disabled={!canEditGeoTag}
                                                                        onClick={() => { replacingPhotoRef.current = doc; fileInputRef.current?.click(); }}
                                                                        className="text-blue-600 hover:text-blue-800 p-1 rounded-lg hover:bg-blue-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        title="Replace the returned photo"
                                                                    >
                                                                        <Upload size={13} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="text-[9px] font-semibold text-stone-400 uppercase tracking-wide" title="Admin or Office must send this back before it can be replaced">
                                                                    Locked
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-stone-400 italic text-center py-2">
                                                No photo uploaded yet. Tap "Attach / Upload Photo" to add one.
                                            </p>
                                        )}
                                    </div>

                                    {saveSuccess && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-[10px] font-bold flex items-center gap-1.5 animate-in fade-in duration-200">
                                            <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
                                            <span>Geo Tag Report saved successfully!</span>
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (vendorIsFutureTab) {
                                                    const message = selectedStage === STAGE_IDS.INSTALLATION_STATUS
                                                        ? 'Complete Installation first: mark Physical Installation Status as Yes, confirm the Installation Date, then use “Save & Move to Geo Tag Photo”.'
                                                        : `This customer is currently at ${currentStageLabel}. Complete that stage before moving from Geo Tag Photo.`;
                                                    setStageMoveError(message);
                                                    showAlert(message, { title: 'Complete Installation First', type: 'warning' });
                                                    return;
                                                }
                                                handleSaveChanges(STAGE_IDS.DISCOM_SUBMISSION);
                                            }}
                                            disabled={saving || vendorIsPastTab}
                                            title={geoTagStatus !== 'Proceed' || geoDocs.length === 0 ? 'Set status to Proceed and upload a geo-tag photo first.' : undefined}
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] cursor-pointer"
                                        >
                                            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving & Moving...</> : <><CheckCircle2 size={14} /> Save & Move to Discom Submission</>}
                                        </button>
                                        {!vendorIsFutureTab && (geoTagStatus !== 'Proceed' || geoDocs.length === 0) && (
                                            <p className="mt-2 text-center text-[10px] font-semibold text-rose-600">Set status to Proceed and upload a geo-tag photo to continue.</p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleSaveChanges(null)}
                                            disabled={saving || !canEditGeoTag}
                                            className={`mt-2 w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                                                isGeoTagDirty
                                                    ? 'bg-stone-900 text-white hover:bg-stone-850'
                                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            }`}
                                        >
                                            {saving ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : isGeoTagDirty ? (
                                                <><Save size={13} /> Save Geo Tag Report Only</>
                                            ) : (
                                                <><Check size={13} /> Saved</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ─── Active Tab: INSTALLATION STATUS ─── */}
                            {activeTab === 'INSTALLATION' && (
                                <div className="space-y-4">
                                    {/* Status selector with Give Up in front */}
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                                            Physical Installation Status
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {[
                                                { id: 'Giveup', label: 'Giveup', activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/10', dotClass: 'bg-white' },
                                                { id: 'Installed', label: 'Installed', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' },
                                                { id: 'In process', label: 'In process', activeClass: 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/10', dotClass: 'bg-white' },
                                                { id: 'Pending', label: 'Pending', activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10', dotClass: 'bg-white' }
                                            ].map(tag => {
                                                // Legacy rows hold 'Yes'/'Process'; normalise so an
                                                // existing record still shows its state as selected.
                                                const isSelected = normalizeInstallationStatus(installationStatus) === normalizeInstallationStatus(tag.id);
                                                const isLocked = isFinalTagValue(selectedCust?.installation_status, INSTALLATION_TAGS) && user?.userType !== 'admin';
                                                return (
                                                    <button
                                                        key={tag.id}
                                                        type="button"
                                                        disabled={isLocked || !canEditInstallation}
                                                        onClick={() => {
                                                            if (isLocked) return;
                                                            if (tag.id === 'Giveup') {
                                                                setShowGiveUpModal(true);
                                                            } else {
                                                                setInstallationStatus(tag.id);
                                                                if (tag.id === 'Installed' && !installationDate) {
                                                                    setInstallationDate(new Date().toISOString().split('T')[0]);
                                                                }
                                                            }
                                                        }}
                                                        className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                                                            isLocked && tag.id !== 'Installed' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                                        } ${
                                                            isSelected
                                                                ? tag.activeClass
                                                                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                                        }`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? tag.dotClass : 'bg-stone-300'}`} />
                                                        {tag.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="space-y-1">
                                            <label className="block text-[9px] font-bold text-stone-500 uppercase tracking-wider">Installation Note</label>
                                            <textarea
                                                rows={2}
                                                value={vendorNote}
                                                onChange={event => setVendorNote(event.target.value)}
                                                disabled={!canEditInstallation}
                                                placeholder="Add installation notes or a site update"
                                                className="w-full resize-none bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                            />
                                        </div>
                                    </div>

                                    {/* When marked Yes: Installation Date */}
                                    {normalizeInstallationStatus(installationStatus) === 'Yes' && (
                                        <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                            <div className="flex items-center gap-2 text-emerald-800">
                                                <CheckCircle2 size={16} />
                                                <span className="text-xs font-bold">Installation Completed</span>
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-emerald-900 uppercase tracking-wider mb-1">
                                                    Installation Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={installationDate || ''}
                                                    onChange={(e) => setInstallationDate(e.target.value)}
                                                    disabled={!canEditInstallation}
                                                    className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* When marked Give Up: Status Banner */}
                                    {installationStatus === 'Giveup' && (
                                        <div className="p-4 bg-rose-50/80 rounded-2xl border border-rose-200 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                                                <AlertTriangle size={15} className="text-rose-600" />
                                                <span>You have submitted to Give Up this project</span>
                                            </div>
                                            {vendorNote && (
                                                <p className="text-xs text-rose-900 italic bg-white/80 p-2.5 rounded-xl border border-rose-100 font-medium">
                                                    "{vendorNote}"
                                                </p>
                                            )}
                                            <p className="text-[11px] text-rose-600 font-semibold">
                                                Admin is reviewing this request.
                                            </p>
                                        </div>
                                    )}

                                    {saveSuccess && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-[10px] font-bold flex items-center gap-1.5 animate-in fade-in duration-200">
                                            <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
                                            <span>Installation status saved successfully!</span>
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        {normalizeInstallationStatus(installationStatus) === 'Yes' && !vendorIsPastTab ? (
                                            <div className="space-y-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveChanges(STAGE_IDS.GEO_TAG_PHOTO)}
                                                    disabled={saving || !canEditInstallation || vendorIsFutureTab}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 disabled:opacity-50 transition-all active:scale-[0.98] cursor-pointer"
                                                >
                                                    {saving ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> Moving Stage...</>
                                                    ) : (
                                                        <><ChevronRight size={14} /> Save & Move to Geo Tag Photo</>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveChanges(null)}
                                                    disabled={saving || !canEditInstallation || !isInstallationDirty}
                                                    className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                                                        isInstallationDirty
                                                            ? 'bg-stone-900 text-white hover:bg-stone-850'
                                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                    }`}
                                                >
                                                    {saving ? (
                                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                                                    ) : isInstallationDirty ? (
                                                        <><Save size={13} /> Save Installation Status</>
                                                    ) : (
                                                        <><Check size={13} /> Saved</>
                                                    )}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleSaveChanges(null)}
                                                disabled={saving || !canEditInstallation || !isInstallationDirty}
                                                className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                                                    isInstallationDirty
                                                        ? 'bg-stone-900 text-white hover:bg-stone-850'
                                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                }`}
                                            >
                                                {saving ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                                ) : isInstallationDirty ? (
                                                    <><Save size={14} /> Save Installation Status</>
                                                ) : (
                                                    <><Check size={14} /> Saved</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>
                    </div>

                    {/* View Customer Details (Read-only Leads information) */}
                    <div className="bg-white p-5 rounded-[24px] border border-stone-150 shadow-sm space-y-4">
                        <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 flex items-center gap-1.5">
                            <ClipboardList size={12} /> Customer Information (Leads)
                        </h3>

                        <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 px-4 text-xs">
                            {[
                                ['Customer Name', selectedCust.customer_name],
                                ['Phone Number', selectedCust.phone_number],
                                ['Email Address', selectedCust.email_address || selectedCust.email],
                                ['Consumer No.', selectedCust.consumer_no],
                                ['Village / Address', selectedCust.villages],
                                ['Folder / File No.', selectedCust.folder_no],
                                ['System Capacity', selectedCust.system_capacity_kwp ? `${selectedCust.system_capacity_kwp} kWp` : null],
                                ['Module Brand', selectedCust.module_brand],
                                ['Module WP', selectedCust.module_wp],
                            ].map(([label, value]) => (
                                <div key={label} className="flex items-start justify-between gap-4 py-3">
                                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wide">{label}</p>
                                    <p className="max-w-[58%] break-words text-right font-semibold text-stone-800">{value || '–'}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            )}

            {/* Document Preview Modal */}
            {previewDoc && (
                <FilePreviewModal
                    file={previewDoc.doc}
                    fileUrl={previewDoc.url}
                    onClose={() => setPreviewDoc(null)}
                    onDownload={async () => {
                        const url = await getDownloadUrl(previewDoc.doc.storage_path, previewDoc.doc.file_name);
                        if (url) await downloadFileWithSaveAs(url, previewDoc.doc.file_name);
                    }}
                    onUpdateRemark={handleUpdateDocRemark}
                />
            )}
             {/* Give Up Project Modal for Vendor */}
            {showGiveUpModal && (
                <div className="fixed inset-0 z-[1000] bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-stone-200 animate-in zoom-in-95 duration-150">
                        <div className="flex items-center gap-2 text-rose-600">
                            <AlertTriangle size={20} />
                            <h3 className="text-sm font-bold text-stone-900">Give Up Installation</h3>
                        </div>
                        <p className="text-xs text-stone-600">
                            Are you sure you want to give up the installation project for <b>{selectedCust?.customer_name}</b>?
                        </p>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                                Reason / Remarks
                            </label>
                            <textarea
                                rows={3}
                                value={giveUpReason}
                                onChange={(e) => setGiveUpReason(e.target.value)}
                                placeholder="Enter reason (e.g. roof structure issue, site inaccessible, distance)..."
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-rose-400 placeholder:text-stone-400 font-medium"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowGiveUpModal(false);
                                    setGiveUpReason('');
                                }}
                                disabled={givingUp}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmGiveUp}
                                disabled={givingUp}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                                {givingUp ? <Loader2 size={12} className="animate-spin" /> : null}
                                Confirm Give Up
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BOM View & Print Modal for Vendor (Read-Only) */}
            {showBomModal && targetBomCust && (
                <div className="print-only-modal fixed inset-0 z-[999] bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Top Bar */}
                        <div className="px-5 py-4 bg-stone-900 text-white flex items-center justify-between no-print">
                            <div className="flex items-center gap-2">
                                <Printer size={16} className="text-amber-400" />
                                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider">
                                    Bill of Materials (BOM) - {targetBomCust.customer_name}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePrintVendorBom}
                                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-md"
                                >
                                    <Printer size={13} /> Print Document
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowBomModal(false)}
                                    className="text-stone-400 hover:text-white p-1 rounded-lg transition"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div ref={vendorBomPrintRef} className="flex-1 overflow-y-auto p-6 bg-white text-stone-900 print-document" id="printable-vendor-bom">
                            {loadingBom ? (
                                <div className="py-16 flex flex-col items-center justify-center text-stone-400">
                                    <Loader2 className="w-7 h-7 animate-spin text-amber-500 mb-2" />
                                    <p className="text-xs font-bold">Loading Bill of Materials...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Company Header */}
                                    <div className="border-b-2 border-stone-900 pb-3 mb-5 text-center">
                                        <h1 className="text-lg font-black uppercase tracking-wider text-stone-950">SolarFlow Demo Energy</h1>
                                        <p className="text-[11px] font-semibold text-stone-600">Solar PV Project Integration & Material Loading Checklist</p>
                                        <div className="inline-block mt-2 px-2.5 py-0.5 bg-stone-100 border border-stone-300 rounded text-[10px] font-black uppercase tracking-widest text-stone-800">
                                            BILL OF MATERIALS (BOM) - {bomData?.bom_type ? `${bomData.bom_type} TYPE` : 'GENERAL'}
                                        </div>
                                    </div>

                                    {/* Customer Reference */}
                                    <div className="mb-4">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-stone-900 border-b border-stone-400 pb-1 mb-2">1. Customer & Site Reference</h3>
                                        <table className="w-full text-[11px] border border-stone-300">
                                            <tbody>
                                                <tr className="border-b border-stone-200">
                                                    <td className="w-1/4 p-1.5 bg-stone-50 font-bold text-stone-600">Customer Name:</td>
                                                    <td className="w-1/4 p-1.5 font-bold text-stone-900">{targetBomCust.customer_name || '–'}</td>
                                                    <td className="w-1/4 p-1.5 bg-stone-50 font-bold text-stone-600">Phone Number:</td>
                                                    <td className="w-1/4 p-1.5 font-bold text-stone-900">{targetBomCust.phone_number || '–'}</td>
                                                </tr>
                                                <tr className="border-b border-stone-200">
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Email Address:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.email_address || targetBomCust.email || '–'}</td>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Consumer No:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.consumer_no || '–'}</td>
                                                </tr>
                                                <tr className="border-b border-stone-200">
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Villages:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.villages || '–'}</td>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Sub Division:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.sub_divisions || '–'}</td>
                                                </tr>
                                                <tr className="border-b border-stone-200">
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Channel Partner Name:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.channel_partner || '–'}</td>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Dealer Name:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.sub_channel_partner || '–'}</td>
                                                </tr>
                                                <tr className="border-b border-stone-200">
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">MODULE BRAND:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.module_brand || '–'}</td>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">MODULE WP:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.module_wp || '–'}</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">No of Modules:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.no_of_modules || '–'}</td>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">System Capacity (kWp):</td>
                                                    <td className="p-1.5 font-bold text-stone-900">
                                                        {targetBomCust.system_capacity_kwp ? `${toIndianCommas(targetBomCust.system_capacity_kwp)} kWp` : '–'}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Material Order Specifications */}
                                    <div className="mb-4">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-stone-900 border-b border-stone-400 pb-1 mb-2">2. Material Order Specifications</h3>
                                        <table className="w-full text-[11px] border border-stone-300">
                                            <tbody>
                                                <tr className="border-b border-stone-200">
                                                    <td className="w-1/4 p-1.5 bg-stone-50 font-bold text-stone-600">Roof / Shed:</td>
                                                    <td className="w-1/4 p-1.5 font-bold text-stone-900">{targetBomCust.roof_shed || '–'}</td>
                                                    <td className="w-1/4 p-1.5 bg-stone-50 font-bold text-stone-600">Structure Leg Height:</td>
                                                    <td className="w-1/4 p-1.5 font-bold text-stone-900">
                                                        {targetBomCust.structure_front_leg_height ? `${targetBomCust.structure_front_leg_height} ft / ${targetBomCust.structure_rear_leg_height || '–'} ft` : '–'}
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-stone-200">
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">DC Cable Length:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.dc_cable ? `${targetBomCust.dc_cable} Meters` : '–'}</td>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">AC Cable Length:</td>
                                                    <td className="p-1.5 font-bold text-stone-900">{targetBomCust.ac_cable ? `${targetBomCust.ac_cable} Meters` : '–'}</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-1.5 bg-stone-50 font-bold text-stone-600">Invoice Value:</td>
                                                    <td colSpan={3} className="p-1.5 font-bold text-stone-900">{targetBomCust.invoice_value ? `₹ ${toIndianCommas(targetBomCust.invoice_value)}` : '–'}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* BOM Items Table */}
                                    <div className="mb-6">
                                        <h3 className="text-[11px] font-black uppercase tracking-wider text-stone-900 border-b border-stone-400 pb-1 mb-2">3. BOM Equipment Checklist</h3>
                                        {bomItems.length > 0 ? (
                                            <table className="w-full text-[11px] border-collapse border border-stone-400">
                                                <thead>
                                                    <tr className="bg-stone-100 text-stone-900 uppercase font-black text-[9px]">
                                                        <th className="border border-stone-400 p-1.5 text-center w-8">#</th>
                                                        <th className="border border-stone-400 p-1.5 text-left">Product Name</th>
                                                        <th className="border border-stone-400 p-1.5 text-left w-24">Make</th>
                                                        <th className="border border-stone-400 p-1.5 text-center w-14">UOM</th>
                                                        <th className="border border-stone-400 p-1.5 text-left w-28">Integration By</th>
                                                        <th className="border border-stone-400 p-1.5 text-left">Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bomItems.map((item, idx) => (
                                                        <tr key={idx} className="border-b border-stone-300">
                                                            <td className="border border-stone-400 p-1.5 text-center font-bold text-stone-500">{idx + 1}</td>
                                                            <td className="border border-stone-400 p-1.5 font-bold text-stone-900">{item.product_name || '–'}</td>
                                                            <td className="border border-stone-400 p-1.5 font-medium">{item.make || '–'}</td>
                                                            <td className="border border-stone-400 p-1.5 text-center font-semibold">{item.uom || '–'}</td>
                                                            <td className="border border-stone-400 p-1.5 font-medium">{item.integration_by || '–'}</td>
                                                            <td className="border border-stone-400 p-1.5 text-stone-600">{item.note || '–'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <p className="text-xs text-stone-400 italic text-center py-4 bg-stone-50 rounded-xl border border-stone-200">
                                                No BOM checklist items configured yet for this customer.
                                            </p>
                                        )}
                                    </div>

                                    {/* Signatures */}
                                    <div className="grid grid-cols-3 gap-4 pt-6 text-center border-t border-stone-300 text-[10px]">
                                        <div>
                                            <div className="border-b border-stone-400 pb-6 mb-1 font-bold text-stone-700">
                                                {bomData?.paper_prepared_by || ''}
                                            </div>
                                            <p className="font-black uppercase text-stone-900">Prepared By</p>
                                        </div>
                                        <div>
                                            <div className="border-b border-stone-400 pb-6 mb-1 font-bold text-stone-700">
                                                {bomData?.material_loaded_by || ''}
                                            </div>
                                            <p className="font-black uppercase text-stone-900">Loaded By</p>
                                        </div>
                                        <div>
                                            <div className="border-b border-stone-400 pb-6 mb-1"></div>
                                            <p className="font-black uppercase text-stone-900">Vendor Signature</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}



            {/* Print Styles for Vendor BOM */}
            <style>{`
                @media print {
                    body.is-printing-document > *:not(#native-print-portal) {
                        display: none !important;
                    }
                    body.is-printing-document #native-print-portal {
                        display: block !important;
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 15px !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        visibility: visible !important;
                    }
                    body.is-printing-document #native-print-portal,
                    body.is-printing-document #native-print-portal p,
                    body.is-printing-document #native-print-portal span,
                    body.is-printing-document #native-print-portal td,
                    body.is-printing-document #native-print-portal th,
                    body.is-printing-document #native-print-portal div {
                        font-size: 8.5pt !important;
                    }
                    body.is-printing-document #native-print-portal h1,
                    body.is-printing-document #native-print-portal h2,
                    body.is-printing-document #native-print-portal h3,
                    body.is-printing-document #native-print-portal h4 {
                        font-size: 10pt !important;
                    }
                    body.is-printing-document #native-print-portal * {
                        visibility: visible !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
