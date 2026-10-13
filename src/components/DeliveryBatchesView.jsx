import {containDialogFocus} from '../utils/dialogFocus';
import {loadDeliveryBatches} from '../delivery/load';
import {updateDeliveryStatus,saveDeliveryBatch,deleteDeliveryBatch,removeDeliveryProject} from '../delivery/status';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Truck, Plus, Search, Filter, Calendar, User, Phone, MapPin, 
    Zap, Layers, Printer, Edit3, Trash2, CheckCircle2, AlertCircle, 
    ChevronDown, ChevronUp, Package, X, Check, ArrowRight, ArrowUp, ArrowDown, FileText, Clock, ExternalLink
} from 'lucide-react';
import { supabase } from '../supabase';
import { PRIMARY_STAGES, DELIVERY_PICKER_COLUMNS } from '../constants';
import { toIndianCommas, logActivity, formatInputValue, parseIndianNumber, runWrite, getTelephoneHref } from '../utils';
import { useGlobalPopup } from './GlobalPopup';
import {filterDeliveryProjects,projectAssignedElsewhere} from '../delivery/projectPicker';

const normalizeMaterial = value => {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized === '16sq mm la cabel') return '16sq mm la cable';
    if (normalized === 'condute pipe') return 'conduite pipe';
    return normalized;
};

const normalizeMaterialUnit = value => {
    const normalized = String(value || '').trim();
    return ['no.', 'no', 'nos.', 'nos'].includes(normalized.toLowerCase()) ? 'Nos' : (normalized || 'Nos');
};

const materialDisplayName = value => {
    const key = normalizeMaterial(value);
    if (key === '16sq mm la cable') return '16sq MM LA Cable';
    if (key === 'conduite pipe') return 'Conduite Pipe';
    return value;
};

const readBomItems = (project, relationalItems = {}) => {
    if (!project?.bom_data) return relationalItems[project?.id] || [];
    try {
        const document = typeof project.bom_data === 'string' ? JSON.parse(project.bom_data) : project.bom_data;
        const items = Array.isArray(document) ? document : document?.items;
        const inlineItems = Array.isArray(items)
            ? items.filter(item => String(item?.product_name || '').trim())
            : [];
        return inlineItems.length ? inlineItems : (relationalItems[project?.id] || []);
    } catch {
        return relationalItems[project?.id] || [];
    }
};

const materialQuantity = item => item?.stock_quantity ?? item?.quantity ?? '';

// Saved reference BOMs occasionally contain simple expressions such as 12*4 or 3+1.
// Evaluate only positive numbers joined by + or *; leave every other value un-totalled.
const quantityAsNumber = value => {
    const source = String(value ?? '').replace(/\s+/g, '');
    if (!/^\d+(?:\.\d+)?(?:[+*]\d+(?:\.\d+)?)*$/.test(source)) return null;
    const total = source.split('+').reduce((sum, term) => (
        sum + term.split('*').reduce((product, factor) => product * Number(factor), 1)
    ), 0);
    return Number.isFinite(total) ? total : null;
};

const formatMaterialQuantity = value => {
    const number = Number(value);
    return Number.isFinite(number)
        ? number.toLocaleString('en-IN', { maximumFractionDigits: 3 })
        : String(value || '–');
};

const orderedBatchProjects = (batch, customers) => {
    const byId = new Map(customers.map(project => [project.id, project]));
    return (batch?.project_ids || []).map(id => byId.get(id)).filter(Boolean);
};

const batchMaterialManifest = (batch, customers, relationalItems = {}) => {
    const projects = orderedBatchProjects(batch, customers).map(project => ({
        project,
        items: readBomItems(project, relationalItems).map(item => ({
            ...item,
            delivery_quantity: materialQuantity(item)
        })).filter(item => String(item.delivery_quantity ?? '').trim() !== '')
    }));
    const totals = new Map();
    projects.forEach(({items}) => items.forEach(item => {
        const numeric = quantityAsNumber(item.delivery_quantity);
        if (numeric === null) return;
        const uom = normalizeMaterialUnit(item.uom);
        const key = `${normalizeMaterial(item.product_name)}|${normalizeMaterial(uom)}`;
        const current = totals.get(key) || { product_name: materialDisplayName(item.product_name), uom, quantity: 0 };
        current.quantity += numeric;
        totals.set(key, current);
    }));
    return {
        projects,
        totals: [...totals.values()].sort((a, b) => a.product_name.localeCompare(b.product_name))
    };
};

const batchMaterialMatrix = manifest => {
    const customerColumns = manifest.projects.map(({ project }) => project);
    const rows = new Map();

    manifest.projects.forEach(({ items }, customerIndex) => {
        items.forEach(item => {
            const quantity = quantityAsNumber(item.delivery_quantity);
            if (quantity === null) return;
            const uom = normalizeMaterialUnit(item.uom);
            const key = `${normalizeMaterial(item.product_name)}|${normalizeMaterial(uom)}`;
            const row = rows.get(key) || {
                product_name: materialDisplayName(item.product_name),
                uom,
                total: 0,
                customerQuantities: Array(customerColumns.length).fill(0)
            };
            row.total += quantity;
            row.customerQuantities[customerIndex] += quantity;
            rows.set(key, row);
        });
    });

    return {
        customers: customerColumns,
        rows: [...rows.values()].sort((a, b) => a.product_name.localeCompare(b.product_name))
    };
};

function MaterialDeliverySheet({ batch, matrix, loading, error }) {
    const customerWidth = matrix.customers.length ? `${48 / matrix.customers.length}%` : '16%';
    return <div id="printable-material-summary" className="mx-auto max-w-[297mm] bg-white text-stone-950 print-document" style={{ fontFamily: "'Roboto', Arial, sans-serif" }}>
        {loading && <p role="status" className="m-4 border border-amber-300 bg-amber-50 p-3 text-sm font-bold no-print">Loading each customer's saved BOM quantities…</p>}
        {error && <p role="alert" className="m-4 border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800 no-print">{error}</p>}
        {!loading && !error && <section className="material-summary-page p-5 sm:p-7">
            <header className="border-b-2 border-stone-900 pb-2 mb-3">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-black uppercase tracking-wide">SolarFlow Demo Energy</h1>
                        <p className="text-xs font-bold">Gate pass · Loading list · Delivery order</p>
                    </div>
                    <strong className="text-sm text-right">{batch.batch_no}</strong>
                </div>
            </header>
            <div className="material-summary-details grid grid-cols-3 gap-x-4 gap-y-1 text-xs border border-stone-400 p-2 mb-3">
                <div><strong>Vehicle:</strong> {batch.vehicle_number || '–'}</div>
                <div><strong>Dispatch:</strong> {batch.dispatch_date || '–'}</div>
                <div><strong>Driver:</strong> {batch.driver_name || '–'}</div>
                <div><strong>Driver phone:</strong> {batch.driver_phone || '–'}</div>
                <div><strong>Stops:</strong> {matrix.customers.length}</div>
                <div><strong>Vendor:</strong> {batch.vendor || '–'}</div>
            </div>
            <h2 className="text-xs font-black uppercase tracking-wide mb-1">Delivery order</h2>
            <ol className="material-summary-stops grid grid-cols-3 gap-1.5 mb-3">
                {matrix.customers.map((customer, index) => <li key={customer.id} className="border border-stone-300 px-2 py-1 text-xs leading-tight">
                    <strong>{index + 1}. {customer.customer_name || 'Unnamed customer'}</strong> · {customer.phone_number || 'No phone'}
                    <div className="text-stone-600">{[customer.villages, customer.sub_divisions].filter(Boolean).join(', ') || 'Address not recorded'}{customer.system_capacity_kwp ? ` · ${customer.system_capacity_kwp} kWp` : ''}</div>
                </li>)}
            </ol>
            {batch.notes && <p className="text-xs border-l-2 border-stone-500 pl-2 mb-2"><strong>Gate / route instructions:</strong> {batch.notes}</p>}
            <h2 className="text-xs font-black uppercase tracking-wide mb-1">Combined materials to load</h2>
            {matrix.rows.length ? <table className="material-summary-table w-full table-fixed border-collapse text-[13px] leading-snug">
                <colgroup><col style={{width:'30%'}}/><col style={{width:'13%'}}/><col style={{width:'9%'}}/>{matrix.customers.map(customer => <col key={customer.id} style={{width:customerWidth}}/>)}</colgroup>
                <thead><tr className="bg-stone-100">
                    <th className="border border-stone-400 p-1.5 text-left">Material / item</th>
                    <th className="border border-stone-400 p-1.5 text-right">Total to load</th>
                    <th className="border border-stone-400 p-1.5 text-left">Unit</th>
                    {matrix.customers.map((customer, index) => <th key={customer.id} className="material-customer-heading border border-stone-400 p-1.5 text-center"><span className="block text-[11px] font-medium">Customer {index + 1}</span><strong className="block leading-tight break-words">{customer.customer_name || 'Unnamed customer'}</strong></th>)}
                </tr></thead>
                <tbody>{matrix.rows.map((row, index) => <tr key={`${row.product_name}-${row.uom}`} className={index%2?'bg-stone-50':'bg-white'}>
                    <td className="border border-stone-300 px-1.5 py-1 font-semibold">{row.product_name}</td>
                    <td className="border border-stone-300 px-1.5 py-1 text-right font-black">{formatMaterialQuantity(row.total)}</td>
                    <td className="border border-stone-300 px-1.5 py-1">{row.uom}</td>
                    {row.customerQuantities.map((quantity, stop) => <td key={matrix.customers[stop]?.id || stop} className="border border-stone-300 px-1.5 py-1 text-center font-semibold">{quantity ? formatMaterialQuantity(quantity) : '–'}</td>)}
                </tr>)}</tbody>
            </table> : <p className="border border-stone-300 p-3 text-sm font-semibold">No saved BOM quantities are available for this batch.</p>}
            <div className="material-summary-signatures mt-6 grid grid-cols-3 gap-5 text-center text-xs font-bold">
                <div className="border-t border-stone-500 pt-1 mt-8">Warehouse / Gate</div>
                <div className="border-t border-stone-500 pt-1 mt-8">Driver / Transporter</div>
                <div className="border-t border-stone-500 pt-1 mt-8">Received at final stop</div>
            </div>
        </section>}
    </div>;
}

export default function DeliveryBatchesView({ 
    currentUser, 
    customers: propCustomers = [], 
    onRefreshCustomers,
    onOpenCustomerModal
}) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const loadRequest = useRef(0);
    const batchLoadPending = useRef(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [appliedMonthFilter, setAppliedMonthFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'IN_TRANSIT', 'DELIVERED'
    const [expandedBatchId, setExpandedBatchId] = useState(null);
    const [allCustomers, setAllCustomers] = useState([]);
    const [projectsLoading,setProjectsLoading]=useState(false);
    const [projectsError,setProjectsError]=useState('');
    // Drivers directory (Operations -> Manage Drivers). Picking a name here
    // fills in that driver's phone and vehicle automatically.
    const [drivers, setDrivers] = useState([]);
    const [localStatusOverrides, setLocalStatusOverrides] = useState({});

    // Customers for the batch picker and the manifest.
    // Queries only required columns via DELIVERY_PICKER_COLUMNS to cut network payload.
    const fetchAllCustomers = async () => {
        setProjectsLoading(true);setProjectsError('');
        try {
            const pageAll = async (buildQuery) => {
                const pageSize = 1000;
                let from = 0;
                const rows = [];
                while (true) {
                    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
                    if (error) {
                        throw error;
                    }
                    if (!data || data.length === 0) break;
                    rows.push(...data);
                    if (data.length < pageSize) break;
                    from += pageSize;
                }
                return rows;
            };

            const all = await pageAll(() => supabase.from('admin').select('*').is('deleted_at', null).order('id'));
            setAllCustomers(all);
        } catch (e) {
            console.error('Error fetching customers in DeliveryBatchesView:', e);
            setProjectsError(e.message || 'Could not load projects. Please retry.');
        } finally {setProjectsLoading(false);}
    };

    const fetchDrivers = async () => {
        try {
            const { data, error } = await supabase.from('drivers').select('*').order('name');
            if (error) throw error;
            setDrivers(data || []);
        } catch (e) {
            console.error('Error fetching drivers in DeliveryBatchesView:', e);
            setDrivers([]);
        }
    };

    useEffect(() => {
        fetchAllCustomers();
        fetchDrivers();
    }, []);

    // Wrap onRefreshCustomers to also update local customers list
    const customers = allCustomers.length > 0 ? allCustomers : propCustomers;
    
    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingBatch, setEditingBatch] = useState(null);
    const [printingBatch, setPrintingBatch] = useState(null);
    const [materialSheetBatch, setMaterialSheetBatch] = useState(null);
    const [printBomItems, setPrintBomItems] = useState({});
    const [printMaterialsLoading, setPrintMaterialsLoading] = useState(false);
    const [printMaterialsError, setPrintMaterialsError] = useState('');
    const printableRef = useRef(null);

    // Form state for Create / Edit Batch
    const [batchForm, setBatchForm] = useState({
        batch_no: '',
        dispatch_date: new Date().toISOString().split('T')[0],
        driver_name: '',
        driver_phone: '',
        vehicle_number: '',
        vendor: '',
        notes: '',
        status: 'IN_TRANSIT',
        selectedProjectIds: []
    });

    const [projectSearchQuery, setProjectSearchQuery] = useState('');
    const [projectStageFilter, setProjectStageFilter] = useState('MATERIAL DELIVERY');
    const [saving, setSaving] = useState(false);
    const batchDialogRef = useRef(null);
    const batchTriggerRef = useRef(null);
    useEffect(() => {
        if (!showCreateModal) return;
        const dialog = batchDialogRef.current;
        const previousFocus = batchTriggerRef.current || document.activeElement;
        dialog.showModal();
        dialog.querySelector('input')?.focus();
        return () => { dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
    }, [showCreateModal]);

    const [vendorsList, setVendorsList] = useState([]);

    // Fetch vendors for dropdown
    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const { data } = await supabase.from('vendors').select('name').order('name');
                setVendorsList(Array.from(new Set((data || []).map(v => v.name).filter(Boolean))));
            } catch (e) {
                console.error('Error fetching vendors in batches view:', e);
                setVendorsList([]);
            }
        };
        fetchVendors();
    }, []);

    // Load current batch data from the database; never silently substitute cached records.
    useEffect(() => {
        if (projectStageFilter === 'ALL') fetchAllCustomers(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectStageFilter]);

    const fetchBatches = async () => {
        if (batchLoadPending.current) return;
        batchLoadPending.current = true;
        const requestId = ++loadRequest.current;
        setLoading(true);
        setLoadError('');
        try {
            const data = await loadDeliveryBatches(supabase);
            if (requestId === loadRequest.current) setBatches(data);
        } catch (error) {
            console.error('Failed to load delivery batches:', error);
            if (requestId === loadRequest.current) setLoadError(error.message || 'The request failed.');
        } finally {
            batchLoadPending.current = false;
            if (requestId === loadRequest.current) setLoading(false);
        }
    };

    const handleRefresh = async () => {
        await Promise.all([fetchBatches(), fetchAllCustomers()]);
        setLocalStatusOverrides({});
        if (onRefreshCustomers) onRefreshCustomers();
    };

    useEffect(() => {
        fetchBatches();

        const channel = supabase.channel('delivery_batches_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_batches' }, payload => {
                if (payload.eventType === 'INSERT' && payload.new) {
                    setBatches(prev => {
                        if (prev.some(b => b.id === payload.new.id)) return prev;
                        return [payload.new, ...prev];
                    });
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    setBatches(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
                } else if (payload.eventType === 'DELETE' && payload.old?.id) {
                    setBatches(prev => prev.filter(b => b.id !== payload.old.id));
                }
            })
            .subscribe();

        const onFocus = () => {
            if (document.visibilityState === 'visible') {
                fetchBatches();
                fetchAllCustomers();
            }
        };
        document.addEventListener('visibilitychange', onFocus);
        window.addEventListener('focus', onFocus);

        return () => {
            supabase.removeChannel(channel);
            document.removeEventListener('visibilitychange', onFocus);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    // Open Create Modal
    const handleOpenCreateModal = () => {
        if (loading || loadError) return;
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const today = new Date().toISOString().split('T')[0];
        setBatchForm({
            batch_no: `BATCH-${today.replace(/-/g, '').slice(2)}-${randNum}`,
            dispatch_date: today,
            driver_name: '',
            driver_phone: '',
            vehicle_number: '',
            rent_amount: '',
            car_rent_paid: '',
            notes: '',
            status: 'IN_TRANSIT',
            selectedProjectIds: []
        });
        setEditingBatch(null);
        fetchAllCustomers();
        setProjectStageFilter('MATERIAL DELIVERY');
        setProjectSearchQuery('');
        setShowCreateModal(true);
    };

    // Open Edit Modal
    const handleOpenEditModal = (batch) => {
        setBatchForm({
            id: batch.id,
            batch_no: batch.batch_no || '',
            dispatch_date: batch.dispatch_date || new Date().toISOString().split('T')[0],
            driver_name: batch.driver_name || '',
            driver_phone: batch.driver_phone || '',
            vehicle_number: batch.vehicle_number || '',
            rent_amount: batch.rent_amount || '',
            car_rent_paid: batch.car_rent_paid || '',
            notes: batch.notes || '',
            status: batch.status || 'IN_TRANSIT',
            selectedProjectIds: batch.project_ids || []
        });
        setEditingBatch(batch);
        setProjectStageFilter('MATERIAL DELIVERY');
        setProjectSearchQuery('');
        fetchAllCustomers();
        setShowCreateModal(true);
    };

    // Protect against accidental refresh while batch form modal is open
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (showCreateModal && batchForm.selectedProjectIds.length > 0) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [showCreateModal, batchForm.selectedProjectIds.length]);

    // Toggle Project Selection in Creation Modal
    const toggleProjectSelection = (projectId) => {
        setBatchForm(prev => {
            const exists = prev.selectedProjectIds.includes(projectId);
            const next = exists 
                ? prev.selectedProjectIds.filter(id => id !== projectId)
                : [...prev.selectedProjectIds, projectId];
            return { ...prev, selectedProjectIds: next };
        });
    };

    // Save Batch & Bulk Update Selected Projects in Supabase
    const handleSaveBatch = async (e) => {
        if (e) e.preventDefault();
        if (batchForm.selectedProjectIds.length === 0) {
            showAlert('Please select at least 1 project to include in this delivery batch.');
            return;
        }
        // Phone and vehicle are read-only and derived from the picked driver,
        // so a blank here means that driver's record is incomplete.
        if (!String(batchForm.driver_name || '').trim()) {
            showAlert('Please select a driver for this batch.');
            return;
        }
        if (!String(batchForm.driver_phone || '').trim() || !String(batchForm.vehicle_number || '').trim()) {
            showAlert(`Driver "${batchForm.driver_name}" is missing a phone number or vehicle number. Add them in Operations → Drivers first.`);
            return;
        }

        setSaving(true);
        try {
            // delivery_batches.id is a real `uuid` column - a plain
            // "BATCH-<timestamp>" string fails every write with a
            // Postgres 22P02 error (confirmed live), silently swallowed
            // by saveBatchesState's best-effort catch, so the batch
            // looked saved locally but never actually persisted.
            const batchId = editingBatch ? editingBatch.id : crypto.randomUUID();
            const displayBatchNo = batchForm.batch_no || `BATCH-${Date.now()}`;
            // project_ids is a real `uuid[]` column - any non-UUID id in
            // this list (e.g. a leftover synthetic/demo id) would cause
            // the exact same "operator does not exist: uuid = text" error
            // as the batch id bug above, just for the array column
            // instead of the primary key. Filter defensively.
            const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validProjectIds = batchForm.selectedProjectIds.filter(id => uuidRe.test(String(id)));
            if (validProjectIds.length !== batchForm.selectedProjectIds.length) {
                console.warn('Dropped non-UUID project id(s) before saving delivery batch:', batchForm.selectedProjectIds.filter(id => !uuidRe.test(String(id))));
            }
            const batchPayload = {
                id: batchId,
                batch_no: displayBatchNo,
                dispatch_date: batchForm.dispatch_date,
                driver_name: batchForm.driver_name,
                driver_phone: batchForm.driver_phone ? Number(String(batchForm.driver_phone).replace(/\D/g, '')) || null : null,
                vehicle_number: batchForm.vehicle_number,
                rent_amount: batchForm.rent_amount || '',
                car_rent_paid: batchForm.car_rent_paid || 'No',
                car_rent_paid_by: editingBatch?.car_rent_paid_by || null,
                car_rent_paid_at: editingBatch?.car_rent_paid_at || null,
                vendor: batchForm.vendor,
                notes: batchForm.notes,
                status: batchForm.status,
                project_ids: validProjectIds,
                created_at: editingBatch?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            let updatedBatches;
            if (editingBatch) {
                updatedBatches = batches.map(b => b.id === editingBatch.id ? batchPayload : b);
            } else {
                updatedBatches = [batchPayload, ...batches];
            }

            const removedProjectIds = editingBatch
                ? (editingBatch.project_ids || []).filter(id => !validProjectIds.includes(id))
                : [];

            await saveDeliveryBatch(supabase, batchPayload, validProjectIds, removedProjectIds);
            setBatches(updatedBatches);

            await handleRefresh();
            setShowCreateModal(false);
        } catch (err) {
            console.error('Error saving delivery batch:', err);
            showAlert('Failed to save batch: ' + err.message, { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // The database removes the batch and its project links in one transaction.
    const handleDeleteBatch = async (batchId) => {
        if (saving) return;
        const batch = batches.find(item => item.id === batchId);
        if (!batch) return;
        if (!await showConfirm('Remove this batch and release its projects? Customer records will be kept.', {
            title: 'Disband delivery batch?', confirmLabel: 'Disband batch', cancelLabel: 'Keep batch', type: 'warning'
        })) return;
        setSaving(true);
        try {
            await deleteDeliveryBatch(supabase, batch.id, batch.project_ids || []);
            const updated = batches.filter(item => item.id !== batchId);
            setBatches(updated);
            await handleRefresh();
        } catch (error) {
            showAlert('Could not disband batch: ' + error.message, {type: 'error'});
        } finally { setSaving(false); }
    };

    // Filter projects for the creation selector
    
    const checkMonthMatch = (dateStr, monthFilterStr) => {
        if (!monthFilterStr) return true;
        if (!dateStr) return false;
        
        // monthFilterStr is "YYYY-MM"
        // Try simple startsWith first
        if (dateStr.startsWith(monthFilterStr)) return true;
        
        // Try parsing the date
        try {
            // Handle DD-MM-YYYY manually if present
            let parsedDate = new Date(dateStr);
            if (isNaN(parsedDate.getTime()) && typeof dateStr === 'string' && dateStr.includes('-')) {
                const parts = dateStr.split('-');
                if (parts[0].length === 2 && parts[2].length === 4) {
                    parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }
            if (isNaN(parsedDate.getTime())) return false;
            
            const y = parsedDate.getFullYear();
            const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}` === monthFilterStr;
        } catch {
            return false;
        }
    };

    const eligibleProjects = useMemo(() => filterDeliveryProjects(customers,{
        selectedIds:batchForm.selectedProjectIds,stage:projectStageFilter,query:projectSearchQuery
    }),[customers,batchForm.selectedProjectIds,projectStageFilter,projectSearchQuery]);

    // Filter Batches by search & status
    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
            const q = searchQuery.toLowerCase();
            const matchesQuery = !searchQuery ||
                (b.batch_no || '').toLowerCase().includes(q) ||
                (b.driver_name || '').toLowerCase().includes(q) ||
                (b.vehicle_number || '').toLowerCase().includes(q);
            const matchesMonth = checkMonthMatch(b.dispatch_date, appliedMonthFilter);
            return matchesStatus && matchesQuery && matchesMonth;
        });
    }, [batches, searchQuery, statusFilter, appliedMonthFilter]);

    // Top Aggregate Metrics
    const metrics = useMemo(() => {
        const totalBatches = batches.length;
        const inTransit = batches.filter(b => b.status === 'IN_TRANSIT').length;
        const totalProjectIds = new Set(batches.flatMap(b => b.project_ids || []));
        const batchedCustomers = customers.filter(c => totalProjectIds.has(c.id));
        const totalKwp = batchedCustomers.reduce((acc, c) => acc + (parseFloat(c.system_capacity_kwp) || 0), 0);
        return {
            totalBatches,
            inTransit,
            totalProjects: totalProjectIds.size,
            totalKwp: totalKwp.toFixed(1)
        };
    }, [batches, customers]);

    // Print Handler
    const handlePrintBatch = () => {
        if (!printingBatch) return;

        const cleanBatch = String(printingBatch?.batch_no || printingBatch?.id || 'Batch').replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanVehicle = String(printingBatch?.vehicle_number || 'Vehicle').replace(/[^a-zA-Z0-9_-]/g, '_');
        const docTitle = `Master_Delivery_Gate_Pass_${cleanBatch}_${cleanVehicle}`;
        const prevDocTitle = document.title;

        try {
            document.title = docTitle;
            window.print();
        } catch (err) {
            console.error('Print execution error:', err);
        } finally {
            setTimeout(() => {
                document.title = prevDocTitle;
            }, 1000);
        }
    };

    const handlePrintMaterialSheet = () => {
        if (!materialSheetBatch || printMaterialsLoading || printMaterialsError) return;
        const source = document.getElementById('printable-material-summary');
        if (!source) return;
        const cleanBatch = String(materialSheetBatch.batch_no || materialSheetBatch.id || 'Batch').replace(/[^a-zA-Z0-9_-]/g, '_');
        const previousTitle = document.title;
        const printCopy = source.cloneNode(true);
        printCopy.id = 'material-summary-print-copy';
        document.body.appendChild(printCopy);
        const printStyle = document.createElement('style');
        printStyle.textContent = `
            @page { size: A4 landscape; margin: 9mm; }
            @media screen { #material-summary-print-copy { display: none !important; } }
            @media print {
                body > *:not(#material-summary-print-copy) { display: none !important; }
                html, body { width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
                #material-summary-print-copy.print-document {
                    display: block !important; visibility: visible !important;
                    position: static !important; inset: auto !important;
                    width: 100% !important; max-width: none !important;
                    height: auto !important; max-height: none !important;
                    margin: 0 !important; padding: 0 !important;
                    overflow: visible !important; background: #fff !important;
                    font-family: 'Roboto', Arial, sans-serif !important;
                }
                #material-summary-print-copy * { visibility: visible !important; }
                #material-summary-print-copy .material-summary-page { padding: 0 !important; margin: 0 !important; }
                #material-summary-print-copy .material-summary-table { table-layout: fixed !important; width: 100% !important; font-size: 12px !important; line-height: 1.2 !important; }
                #material-summary-print-copy .material-summary-table th,
                #material-summary-print-copy .material-summary-table td { padding: 3px 5px !important; border: 1px solid #777 !important; overflow-wrap: anywhere; }
                #material-summary-print-copy .material-summary-table th { background: #eee !important; color: #111 !important; }
                #material-summary-print-copy .material-summary-table thead { display: table-header-group; }
                #material-summary-print-copy .material-customer-heading span,
                #material-summary-print-copy .material-customer-heading strong { display: block; white-space: normal; }
                #material-summary-print-copy .material-customer-heading strong { line-height: 1.15; margin-top: 2px; }
                #material-summary-print-copy .material-summary-table tr,
                #material-summary-print-copy .material-summary-stops li,
                #material-summary-print-copy .material-summary-signatures { break-inside: avoid; page-break-inside: avoid; }
            }
        `;
        document.body.appendChild(printStyle);
        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            window.removeEventListener('afterprint', cleanup);
            printCopy.remove();
            printStyle.remove();
            document.title = previousTitle;
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        document.title = `Delivery_Material_Sheet_${cleanBatch}`;
        try {
            window.print();
        } catch (error) {
            console.error('Print execution error:', error);
            cleanup();
            showAlert('The print dialog could not be opened.', { type: 'error' });
        }
        setTimeout(cleanup, 120000);
    };

    const handleOpenMaterialSheet = async batch => {
        setPrintingBatch(null);
        setMaterialSheetBatch(batch);
        setPrintBomItems({});
        setPrintMaterialsError('');
        setPrintMaterialsLoading(true);
        try {
            const projects = orderedBatchProjects(batch, customers);
            const projectIds = projects.map(project => project.id);
            if (!projectIds.length) return;

            const { data: bomRows, error: bomError } = await supabase
                .from('bom')
                .select('*')
                .in('admin_id', projectIds)
                .order('created_at', { ascending: false });
            if (bomError) throw bomError;

            const selectedBomByProject = new Map();
            projects.forEach(project => {
                const wantedType = String(project.roof_shed || '').toUpperCase().includes('SHED') ? 'SHED' : 'ROOF';
                const matching = (bomRows || []).find(row => row.admin_id === project.id && row.bom_type === wantedType)
                    || (bomRows || []).find(row => row.admin_id === project.id);
                if (matching) selectedBomByProject.set(project.id, matching);
            });

            const bomIds = [...selectedBomByProject.values()].map(row => row.id);
            if (!bomIds.length) return;
            const { data: bomItems, error: itemError } = await supabase
                .from('bom_items')
                .select('*')
                .in('bom_id', bomIds)
                .order('sr_no', { ascending: true });
            if (itemError) throw itemError;

            const itemsByBom = new Map();
            (bomItems || []).forEach(item => {
                const list = itemsByBom.get(item.bom_id) || [];
                list.push(item);
                itemsByBom.set(item.bom_id, list);
            });
            setPrintBomItems(Object.fromEntries(
                [...selectedBomByProject.entries()].map(([projectId, bom]) => [projectId, itemsByBom.get(bom.id) || []])
            ));
        } catch (error) {
            console.error('Could not load delivery material breakdown:', error);
            setPrintMaterialsError('Material quantities could not be loaded. Refresh and try again.');
        } finally {
            setPrintMaterialsLoading(false);
        }
    };

    const handleReorderProject = async (batch, projectId, direction) => {
        if (saving || batch.status === 'DELIVERED') return;
        const currentIds = [...(batch.project_ids || [])];
        const currentIndex = currentIds.indexOf(projectId);
        const nextIndex = currentIndex + direction;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentIds.length) return;
        [currentIds[currentIndex], currentIds[nextIndex]] = [currentIds[nextIndex], currentIds[currentIndex]];

        const previousBatch = batch;
        const reorderedBatch = { ...batch, project_ids: currentIds, updated_at: new Date().toISOString() };
        setSaving(true);
        setBatches(previous => previous.map(item => item.id === batch.id ? reorderedBatch : item));
        try {
            await saveDeliveryBatch(supabase, reorderedBatch, currentIds, []);
            await logActivity(
                currentUser?.id || 'admin',
                'dispatch',
                `Delivery Batch ${batch.batch_no || batch.id}: Stop order updated`,
                `${currentIds.length} delivery stops`
            );
        } catch (error) {
            setBatches(previous => previous.map(item => item.id === batch.id ? previousBatch : item));
            showAlert('Could not update the delivery order: ' + (error.message || 'Unknown error'), { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header & Quick Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-md shadow-amber-500/20">
                            <Truck size={22} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-stone-900 uppercase tracking-wide">
                                Material Delivery Batches
                            </h1>
                            <p className="text-xs text-stone-500 font-medium mt-0.5">
                                Club multiple customer projects into unified dispatch trips & print combined master gate passes.
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={event => { batchTriggerRef.current = event.currentTarget; handleOpenCreateModal(); }}
                    disabled={loading || loadError || saving}
                    className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-stone-900/10 cursor-pointer self-start sm:self-auto"
                >
                    <Plus size={16} /> Create Delivery Batch
                </button>
            </div>

            {/* 4 Metric Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Total Batches</span>
                    <p className="text-2xl font-black text-stone-900">{loading || loadError ? '—' : metrics.totalBatches}</p>
                    <span className="text-[11px] text-stone-500 font-medium">Recorded dispatch trips</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">In Transit</span>
                    <p className="text-2xl font-black text-amber-600">{loading || loadError ? '—' : metrics.inTransit}</p>
                    <span className="text-[11px] text-stone-500 font-medium">Active truck runs</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Clubbed Sites</span>
                    <p className="text-2xl font-black text-stone-900">{loading || loadError ? '—' : metrics.totalProjects}</p>
                    <span className="text-[11px] text-stone-500 font-medium">Projects in delivery</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Batched Capacity</span>
                    <p className="text-2xl font-black text-stone-900">{loading || loadError ? '—' : metrics.totalKwp} <span className="text-xs font-bold text-stone-400">kWp</span></p>
                    <span className="text-[11px] text-stone-500 font-medium">Total solar payload</span>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-2xs">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-2.5 text-stone-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search batch #, driver, vehicle..."
                        aria-label="Search delivery batches" value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-stone-800 placeholder-stone-400 outline-none focus:bg-white focus:border-amber-400 transition"
                    />
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                    {/* Month Filter Moved to Right Side */}
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1">Dispatch Month</span>
                        <input
                            type="month"
                            aria-label="Dispatch Month" value={monthFilter}
                            onChange={(e) => setMonthFilter(e.target.value)}
                            className="bg-stone-50 border border-stone-200 rounded-xl px-2 py-1.5 text-xs font-medium text-stone-800 outline-none focus:bg-white focus:border-amber-400 transition"
                        />
                        <button 
                            type="button" 
                            onClick={() => setAppliedMonthFilter(monthFilter)} 
                            className="bg-stone-800 hover:bg-stone-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition"
                        >
                            Apply
                        </button>
                        {appliedMonthFilter && (
                            <button 
                                type="button" 
                                onClick={() => { setMonthFilter(''); setAppliedMonthFilter(''); }} 
                                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="h-6 w-px bg-stone-200 hidden sm:block"></div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {['ALL', 'IN_TRANSIT', 'DELIVERED'].map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setStatusFilter(status)}
                                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                    statusFilter === status
                                        ? 'bg-stone-900 text-white shadow-xs'
                                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                                }`}
                            >
                                {status === 'ALL' ? 'All Batches' : status === 'IN_TRANSIT' ? 'In Transit' : 'Delivered'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Batch Cards List */}
            {loading ? (
                <div className="py-16 text-center text-stone-400">
                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold">Loading delivery batches...</p>
                </div>
            ) : loadError ? (
                <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-stone-800 space-y-3">
                    <h3 className="font-bold">Delivery batches couldn’t be loaded</h3>
                    <p className="text-sm">{loadError} Your saved records haven’t been changed. Try again before editing or dispatching a batch.</p>
                    <button type="button" onClick={handleRefresh} className="rounded-xl bg-stone-900 text-white px-4 py-3 text-sm font-bold">Retry loading batches</button>
                </div>
            ) : filteredBatches.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center text-stone-400 space-y-3">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto">
                        <Truck size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-stone-800">No delivery batches found</h3>
                    <p className="text-xs text-stone-500 max-w-sm mx-auto">
                        Club 2 or more projects sharing the same truck trip into a unified delivery batch.
                    </p>
                    <button
                        onClick={handleOpenCreateModal}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                        <Plus size={14} /> Create First Batch
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredBatches.map((batch) => {
                        const isExpanded = expandedBatchId === batch.id;
                        const linkedProjects = orderedBatchProjects(batch, customers);
                        const batchKwp = linkedProjects.reduce((sum, p) => sum + (parseFloat(p.system_capacity_kwp) || 0), 0);
                        const totalModules = linkedProjects.reduce((sum, p) => sum + (parseInt(p.no_of_modules) || 0), 0);
                        const isAllDelivered = batch.status === 'DELIVERED' || (linkedProjects.length > 0 && linkedProjects.every(p => (localStatusOverrides[p.id] || p.delivery_status) === 'DELIVERED'));

                        return (
                            <div 
                                key={batch.id} 
                                className="bg-white rounded-3xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all overflow-hidden"
                            >
                                {/* Card Header / Top Bar */}
                                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <span className="text-xs font-black text-stone-950 uppercase tracking-wider bg-stone-100 px-2.5 py-1 rounded-lg">
                                                {batch.batch_no || batch.id}
                                            </span>
                                            <select
                                                value={batch.status || 'IN_TRANSIT'}
                                                disabled={saving}
                                                aria-label={`Delivery status for ${batch.batch_no}`}
                                                onChange={async (e) => {
                                                    if (saving) return;
                                                    setSaving(true);
                                                    const newStatus = e.target.value;
                                                    const previousBatch = batch;
                                                    const updatedBatches = batches.map(b => b.id === batch.id ? { ...b, status: newStatus } : b);
                                                    setBatches(updatedBatches);
                                                    try {
                                                        const projectIds = linkedProjects.map(p => p.id);
                                                        await updateDeliveryStatus(supabase, batch.id, newStatus, projectIds);

                                                        await logActivity(currentUser?.id || "admin", "dispatch", `Delivery Batch ${batch.batch_no || batch.id}: Status changed to ${newStatus}`, `Driver: ${batch.driver_name || 'N/A'} | Vehicle: ${batch.vehicle_no || 'N/A'}`);
                                                        await handleRefresh();
                                                    } catch (err) {
                                                        setBatches(prev => prev.map(b => b.id === batch.id ? previousBatch : b));
                                                        showAlert("Failed to update batch status: " + (err.message || "Unknown error"), { type: 'error' });
                                                    } finally { setSaving(false); }
                                                }}
                                                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full outline-none cursor-pointer appearance-none ${
                                                    batch.status === 'DELIVERED' 
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                }`}
                                            >
                                                <option value="IN_TRANSIT">In Transit</option>
                                                <option value="DELIVERED">Delivered</option>
                                            </select>
                                            <span className="text-xs text-stone-400 font-medium">
                                                 Dispatched: <strong className="text-stone-700">{batch.dispatch_date || '–'}</strong>
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-stone-600">
                                            {batch.vehicle_number && (
                                                 <span className="flex items-center gap-1 font-semibold text-stone-900 bg-stone-50 px-2 py-0.5 rounded-md border border-stone-200/60">
                                                     <Truck size={12} className="text-amber-500" /> {batch.vehicle_number}
                                                 </span>
                                            )}
                                            {batch.driver_name && (
                                                 <span className="flex items-center gap-1">
                                                     <User size={12} className="text-stone-400" /> {batch.driver_name}
                                                     {batch.driver_phone && getTelephoneHref(batch.driver_phone) ? (
                                                         <a
                                                             href={getTelephoneHref(batch.driver_phone)}
                                                             onClick={e => e.stopPropagation()}
                                                             className="text-emerald-600 hover:underline inline-flex items-center gap-0.5 ml-1 font-semibold"
                                                             title={`Call driver ${batch.driver_phone}`}
                                                         >
                                                             <Phone size={10} className="text-emerald-500" />
                                                             ({batch.driver_phone})
                                                         </a>
                                                     ) : batch.driver_phone ? (
                                                         <span className="text-stone-500 ml-1">({batch.driver_phone})</span>
                                                     ) : null}
                                                 </span>
                                            )}
                                            {batch.vendor && (
                                                 <span className="flex items-center gap-1 font-medium text-stone-500">
                                                     <Package size={12} className="text-stone-400" /> Vendor: <strong className="text-stone-700">{batch.vendor}</strong>
                                                 </span>
                                            )}
                                            <span className="h-3 w-px bg-stone-300 mx-1"></span>
                                            <div className="flex items-center gap-1.5 font-medium text-stone-500">
                                                 <span className="text-[10px] uppercase font-bold text-stone-400">Car Rent Paid:</span>
                                                 <select
                                                     aria-label={`Car rent paid for ${batch.batch_no}`} value={batch.car_rent_paid || 'No'}
                                                     onChange={async (e) => {
                                                         const val = e.target.value;
                                                         const userIdentifier = currentUser?.name || currentUser?.email || "Admin";
                                                         const timestamp = new Date().toISOString();
                                                         const previousBatch = batch;

                                                         const updates = { 
                                                             car_rent_paid: val,
                                                             car_rent_paid_by: val === "Yes" ? userIdentifier : null,
                                                             car_rent_paid_at: val === "Yes" ? timestamp : null
                                                         };
                                                         
                                                         const updatedBatches = batches.map(b => b.id === batch.id ? { ...b, ...updates } : b);
                                                         setBatches(updatedBatches);
                                                         
                                                         try {
                                                             const rentRes = await runWrite(
                                                                 supabase.from("delivery_batches").update(updates).eq("id", batch.id).select('id'),
                                                                 { action: 'Car Rent Paid change' }
                                                             );
                                                             if (!rentRes.ok) throw rentRes.error;
                                                         } catch (err) {
                                                             setBatches(prev => prev.map(b => b.id === batch.id ? previousBatch : b));
                                                             showAlert("Failed to save Car Rent Paid status: " + (err.message || "Unknown error"), { type: 'error' });
                                                         }
                                                     }}
                                                     className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded cursor-pointer outline-none shadow-xs ${batch.car_rent_paid === 'Yes' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
                                                 >
                                                     <option value="No">No</option>
                                                     <option value="Yes">Yes</option>
                                                 </select>
                                             </div>
                                             {batch.car_rent_paid === 'Yes' && batch.car_rent_paid_by && (
                                                 <span className="text-[9px] text-stone-400 italic">
                                                     (Paid by {batch.car_rent_paid_by} on {batch.car_rent_paid_at ? new Date(batch.car_rent_paid_at).toLocaleDateString('en-IN') : 'Unknown'})
                                                 </span>
                                             )}
                                         </div>
                                     </div>

                                     {/* Action Buttons */}
                                     <div className="flex items-center gap-2 self-start md:self-auto flex-shrink-0">
                                         <button
                                             type="button"
                                             onClick={() => { setMaterialSheetBatch(null); setPrintingBatch(batch); }}
                                             className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                             title="Print Combined Delivery Challan / Gate Pass"
                                         >
                                             <Printer size={13} /> Print Gate Pass
                                         </button>

                                         <button
                                             type="button"
                                             onClick={() => handleOpenMaterialSheet(batch)}
                                             className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                             title="Print the material quantity summary for every customer"
                                         >
                                             <FileText size={13} /> Material Summary
                                         </button>

                                         <button
                                             type="button"
                                             onClick={event => { batchTriggerRef.current = event.currentTarget; handleOpenEditModal(batch); }}
                                             className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                                             title="Edit Batch Logistics"
                                         >
                                             <Edit3 size={15} />
                                         </button>

                                         <button
                                             type="button"
                                             disabled={saving}
                                             onClick={() => handleDeleteBatch(batch.id)}
                                             className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                                             title="Disband Batch"
                                         >
                                             <Trash2 size={15} />
                                         </button>

                                         <button
                                             type="button"
                                             aria-label={`${isExpanded ? "Hide" : "Show"} projects for ${batch.batch_no}`} aria-expanded={isExpanded} onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                                             className="ml-1 p-1.5 text-stone-400 hover:text-stone-700 rounded-xl hover:bg-stone-100 transition cursor-pointer"
                                         >
                                             {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                         </button>
                                     </div>
                                 </div>

                                 {/* Clubbed Manifest Summary Bar */}
                                 <div className="bg-stone-50/70 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-stone-100">
                                     <div className="flex items-center gap-4 text-stone-600 font-medium">
                                         <span>Clubbed Sites: <strong className="text-stone-900">{linkedProjects.length} Projects</strong></span>
                                         <span>Total Capacity: <strong className="text-stone-900">{batchKwp.toFixed(1)} kWp</strong></span>
                                         <span>Total Modules: <strong className="text-stone-900">{totalModules} Panels</strong></span>
                                     </div>

                                     <div className="flex items-center gap-3">
                                         <button
                                             type="button"
                                             disabled={saving || isAllDelivered}
                                             onClick={async () => {
                                                 if (saving) return;
                                                 setSaving(true);
                                                 const previousBatch = batch;
                                                 const previousOverrides = { ...localStatusOverrides };
                                                 const newOverrides = { ...localStatusOverrides };
                                                 linkedProjects.forEach(p => newOverrides[p.id] = "DELIVERED");
                                                 setLocalStatusOverrides(newOverrides);

                                                 const updatedBatches = batches.map(b => b.id === batch.id ? { ...b, status: "DELIVERED" } : b);
                                                 setBatches(updatedBatches);
                                                 
                                                 try {
                                                     const projectIds = linkedProjects.map(p => p.id);
                                                     await updateDeliveryStatus(supabase, batch.id, 'DELIVERED', projectIds);

                                                     await logActivity(currentUser?.id || "admin", "dispatch", `Delivery Batch ${batch.batch_no || batch.id}: Marked as DELIVERED (${projectIds.length} projects)`, `Projects: ${projectIds.length} items`);
                                                     await handleRefresh();
                                                 } catch (err) {
                                                     setBatches(prev => prev.map(b => b.id === batch.id ? previousBatch : b));
                                                     setLocalStatusOverrides(previousOverrides);
                                                     showAlert("Failed to mark batch delivered: " + (err.message || "Unknown error"), { type: 'error' });
                                                 } finally { setSaving(false); }
                                             }}
                                             className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition shadow-xs border ${
                                                 isAllDelivered 
                                                     ? 'bg-emerald-100 text-emerald-800 border-emerald-200 cursor-default opacity-80' 
                                                     : 'bg-stone-100 hover:bg-emerald-50 text-stone-600 hover:text-emerald-700 border-stone-200 hover:border-emerald-200 cursor-pointer'
                                             }`}
                                         >
                                             {isAllDelivered ? '✓ All Delivered' : 'Mark All Delivered'}
                                         </button>
                                         <button
                                             type="button"
                                             aria-expanded={isExpanded} onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                                             className="text-amber-700 hover:text-amber-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                         >
                                         {isExpanded ? 'Hide project details' : `View ${linkedProjects.length} drop-off locations`}
                                         {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                     </button>
                                     </div>
                                 </div>

                                 {/* Expandable Project Drop-Off Table */}
                                 {isExpanded && (
                                     <div className="p-5 overflow-x-auto animate-in fade-in duration-200">
                                         <table className="min-w-full text-xs divide-y divide-stone-100">
                                             <thead>
                                                 <tr className="text-[9px] font-black uppercase tracking-wider text-stone-400 text-left">
                                                     <th className="pb-2 w-8">#</th>
                                                     <th className="pb-2">Customer & Contact</th>
                                                     <th className="pb-2">Village / Sub-Division</th>
                                                     
                                                     <th className="pb-2">Current Stage</th>
                                                     <th className="pb-2">Location Status</th>
                                                     <th className="pb-2 text-right">Stop order & action</th>
                                                 </tr>
                                             </thead>
                                             <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                                                 {linkedProjects.map((proj, idx) => (
                                                     <tr key={proj.id} className="hover:bg-stone-50/60 transition-colors">
                                                         <td className="py-2.5 font-bold text-stone-400">{idx + 1}</td>
                                                         <td className="py-2.5">
                                                             <p className="font-bold text-stone-900">{proj.customer_name}</p>
                                                             {getTelephoneHref(proj.phone_number) ? (
                                                                 <a
                                                                     href={getTelephoneHref(proj.phone_number)}
                                                                     onClick={e => e.stopPropagation()}
                                                                     className="text-[10px] text-emerald-600 hover:underline font-bold inline-flex items-center gap-1"
                                                                     title={`Call ${proj.phone_number}`}
                                                                 >
                                                                     <Phone size={10} className="text-emerald-500" />
                                                                     {proj.phone_number}
                                                                 </a>
                                                             ) : (
                                                                 <p className="text-[10px] text-stone-500">{proj.phone_number || '–'}</p>
                                                             )}
                                                         </td>
                                                         <td className="py-2.5">
                                                             <p className="font-semibold text-stone-800">{proj.villages || '–'}</p>
                                                             <p className="text-[10px] text-stone-400">{proj.sub_divisions || ''}</p>
                                                         </td>
                                                         
                                                         <td className="py-2.5">
                                                             <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200">
                                                                 {PRIMARY_STAGES.find(s => s.id === proj.stage)?.label || proj.stage}
                                                             </span>
                                                         </td>
                                                         <td className="py-2.5">
                                                            {(() => {
                                                                const currentProjStatus = localStatusOverrides[proj.id] || (
                                                                    proj.delivery_status === "DELIVERED" || batch.status === "DELIVERED"
                                                                        ? "DELIVERED"
                                                                        : "IN_TRANSIT"
                                                                );
                                                                return (
                                                                    <select
                                                                        disabled={saving}
                                                                        aria-label={`Delivery status for ${proj.customer_name}`}
                                                                        value={currentProjStatus}
                                                                        onChange={async (e) => {
                                                                            if (saving) return;
                                                                            const newStat = e.target.value;
                                                                            if (newStat === currentProjStatus) return;
                                                                            if (newStat === "PENDING") {
                                                                                const isLast = (batch.project_ids || []).length === 1;
                                                                                const confirmMsg = isLast
                                                                                    ? "This is the last project in this batch. Returning it to Pending will disband the empty batch. Continue?"
                                                                                    : `Remove ${proj.customer_name || "this project"} from this batch and return to Pending?`;
                                                                                const ok = await showConfirm(confirmMsg, {
                                                                                    title: isLast ? "Disband empty batch?" : "Remove from batch?",
                                                                                    confirmLabel: isLast ? "Remove and disband" : "Remove to Pending",
                                                                                    cancelLabel: "Keep batch",
                                                                                    type: "warning"
                                                                                });
                                                                                if (!ok) return;
                                                                            }
                                                                            setSaving(true);
                                                                            setLocalStatusOverrides(prev => ({ ...prev, [proj.id]: newStat }));
                                                                            try {
                                                                                if (newStat === "PENDING") {
                                                                                    await removeDeliveryProject(supabase, batch, proj.id);
                                                                                } else {
                                                                                    const todayStr = new Date().toISOString().split("T")[0];
                                                                                    const statusRes = await runWrite(
                                                                                        supabase.from("admin").update({
                                                                                            delivery_status: newStat,
                                                                                            material_delivery_date: proj.material_delivery_date || batch.dispatch_date || todayStr,
                                                                                        }).eq("id", proj.id).eq("delivery_batch_id", batch.batch_no).select("id"),
                                                                                        { action: "delivery status change" }
                                                                                    );
                                                                                    if (!statusRes.ok) throw statusRes.error;
                                                                                }
                                                                                await handleRefresh();
                                                                            } catch (err) {
                                                                                setLocalStatusOverrides(prev => ({ ...prev, [proj.id]: currentProjStatus }));
                                                                                showAlert("Failed to update delivery status: " + (err.message || "Unknown error"), { type: "error" });
                                                                            } finally { setSaving(false); }
                                                                        }}
                                                                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md outline-none cursor-pointer ${
                                                                            currentProjStatus === "DELIVERED"
                                                                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                                                                : currentProjStatus === "IN_TRANSIT"
                                                                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                                                                    : "bg-stone-100 text-stone-600 border border-stone-300"
                                                                        }`}
                                                                    >
                                                                        <option value="IN_TRANSIT">In Transit</option>
                                                                        <option value="DELIVERED">Delivered</option>
                                                                        <option value="PENDING">Pending (Remove)</option>
                                                                    </select>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="py-2.5 text-right">
                                                            <span className="inline-flex mr-2 rounded-lg border border-stone-200 overflow-hidden align-middle">
                                                                <button
                                                                    type="button"
                                                                    disabled={saving || idx === 0 || batch.status === 'DELIVERED'}
                                                                    onClick={() => handleReorderProject(batch, proj.id, -1)}
                                                                    aria-label={`Move ${proj.customer_name} one stop earlier`}
                                                                    title="Move one stop earlier"
                                                                    className="p-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                >
                                                                    <ArrowUp size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={saving || idx === linkedProjects.length - 1 || batch.status === 'DELIVERED'}
                                                                    onClick={() => handleReorderProject(batch, proj.id, 1)}
                                                                    aria-label={`Move ${proj.customer_name} one stop later`}
                                                                    title="Move one stop later"
                                                                    className="p-1.5 text-stone-600 hover:bg-stone-100 border-l border-stone-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                >
                                                                    <ArrowDown size={12} />
                                                                </button>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => onOpenCustomerModal && onOpenCustomerModal(proj)}
                                                                className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[10px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                                                            >
                                                                Open Site <ExternalLink size={10} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal 1: Create / Edit Delivery Batch Modal */}
            {showCreateModal && (
                <dialog onKeyDown={containDialogFocus} ref={batchDialogRef} aria-labelledby="batch-dialog-title" aria-describedby="batch-dialog-help" onCancel={event => { event.preventDefault(); if (!saving) setShowCreateModal(false); }} className="delivery-editor-dialog">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Truck className="w-5 h-5 text-amber-400" />
                                <div>
                                    <h3 id="batch-dialog-title" className="text-sm font-black uppercase tracking-wider">
                                        {editingBatch ? 'Edit Delivery Batch' : 'Create Material Delivery Batch'}
                                    </h3>
                                    <p id="batch-dialog-help" className="text-[10px] text-stone-300 font-medium">
                                        Group 2–10 projects into a single vehicle dispatch run.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                aria-label="Close delivery batch" disabled={saving} onClick={() => setShowCreateModal(false)}
                                className="text-stone-300 hover:text-white p-1 rounded-lg transition"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSaveBatch} className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Section A: Transit & Vehicle Information */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 border-b border-stone-100 pb-1.5 flex items-center gap-1.5">
                                    <Truck size={14} className="text-amber-500" /> 1. Vehicle & Transit Logistics
                                </h4>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                            Batch Number / Trip Title <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            aria-label="Batch Number / Trip Title" value={batchForm.batch_no}
                                            onChange={e => setBatchForm(p => ({ ...p, batch_no: e.target.value }))}
                                            placeholder="e.g. BATCH-24AUG-001"
                                            className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 outline-none focus:border-amber-400"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                            Dispatch / Delivery Date <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            aria-label="Dispatch / Delivery Date" value={batchForm.dispatch_date}
                                            onChange={e => setBatchForm(p => ({ ...p, dispatch_date: e.target.value }))}
                                            className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 outline-none focus:border-amber-400"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                            Driver Name <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            required
                                            aria-label="Driver Name" value={batchForm.driver_name}
                                            onChange={e => {
                                                const picked = drivers.find(d => d.name === e.target.value);
                                                setBatchForm(p => ({
                                                    ...p,
                                                    driver_name: e.target.value,
                                                    driver_phone: picked ? String(picked.phone || '').replace(/\D/g, '') : '',
                                                    vehicle_number: picked ? (picked.vehicle_number || '') : '',
                                                }));
                                            }}
                                            className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 outline-none focus:border-amber-400 cursor-pointer"
                                        >
                                            <option value="">Select a driver...</option>
                                            {drivers.map(d => (
                                                <option key={d.id} value={d.name}>{d.name}</option>
                                            ))}
                                        </select>
                                        {drivers.length === 0 && (
                                            <p className="text-[9px] text-amber-700 font-semibold mt-1">
                                                No drivers registered yet - add them in Operations → Drivers.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                            Driver Phone Number
                                        </label>
                                        <input
                                            type="tel"
                                            readOnly
                                            aria-label="Driver Phone Number" value={batchForm.driver_phone}
                                            placeholder="Fills in from the selected driver"
                                            className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-600 outline-none cursor-not-allowed"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                            Vehicle / Truck Registration Number
                                        </label>
                                        <input
                                            type="text"
                                            readOnly
                                            aria-label="Vehicle / Truck Registration Number" value={batchForm.vehicle_number}
                                            placeholder="Fills in from the selected driver"
                                            className="w-full bg-stone-100 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-600 outline-none cursor-not-allowed"
                                        />
                                        <p className="text-[9px] text-stone-600 font-medium mt-1">
                                            Phone and vehicle come from the driver's record. To change them, edit the driver in Operations → Drivers.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                            Rent Amount <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 text-xs font-bold">₹</span>
                                            <input
                                                type="text"
                                                aria-label="Rent Amount" value={formatInputValue(batchForm.rent_amount)}
                                                onChange={e => setBatchForm(p => ({ ...p, rent_amount: parseIndianNumber(e.target.value) }))}
                                                placeholder="0"
                                                className="w-full bg-white border border-stone-200 rounded-xl pl-6 pr-3 py-2 text-xs font-bold text-stone-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                                            />
                                        </div>
                                    </div>
                                    
                                </div>
                            </div>

                            {/* Section B: Project Selector Checklist */}
                            <div className="space-y-3 pt-2 border-t border-stone-100">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2">
                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                                            <Layers size={14} className="text-amber-500" /> 2. Select Projects to Club on this Truck
                                        </h4>
                                        <p className="text-[10px] text-stone-600">
                                            Selected: <strong className="text-stone-900">{batchForm.selectedProjectIds.length} {batchForm.selectedProjectIds.length === 1 ? 'Project' : 'Projects'}</strong>
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                        <input
                                            type="text"
                                            placeholder="Filter projects..."
                                            aria-label="Filter projects" value={projectSearchQuery}
                                            onChange={e => setProjectSearchQuery(e.target.value)}
                                            className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:bg-white focus:border-amber-400 w-44 max-w-full"
                                        />
                                        
                                        <select
                                            aria-label="Project stage" value={projectStageFilter}
                                            onChange={e => setProjectStageFilter(e.target.value)}
                                            className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs font-bold text-stone-700 outline-none max-w-full"
                                        >
                                            <option value="MATERIAL DELIVERY">Material Delivery (Current Stage)</option>
                                            <option value="MATERIAL INTEGRATION">Material Integration</option>
                                            <option value="MATERIAL ORDER">Material Order</option>
                                            <option value="ALL">All Stages</option>
                                        </select>
                                    </div>
                                </div>

                                <p className="text-xs text-stone-500">Selected projects stay visible across stage filters. Projects on another truck show their batch number; remove them from that batch before reassigning.</p>
                                {projectsLoading && <p role="status" className="text-xs text-stone-500">Loading projects…</p>}
                                {projectsError && <p role="alert" className="text-xs text-red-600">{projectsError} <button type="button" onClick={fetchAllCustomers}>Retry</button></p>}
                                {!projectsLoading && !projectsError && eligibleProjects.length===0 && <p className="text-sm text-stone-500 p-3">No projects match this stage and search. Try All Stages or clear the search.</p>}
                                {/* Project Checklist Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto p-1 bg-stone-50/60 rounded-2xl border border-stone-200/70">
                                    {eligibleProjects.map(proj => {
                                        const isSelected = batchForm.selectedProjectIds.includes(proj.id);
                                        const assignedElsewhere=projectAssignedElsewhere(proj,editingBatch);
                                        return (
                                            <div
                                                key={proj.id}
                                                onClick={() => {if(!assignedElsewhere || isSelected)toggleProjectSelection(proj.id);}}
                                                className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-2.5 ${
                                                    isSelected
                                                        ? 'bg-amber-50 border-amber-400 shadow-xs'
                                                        : 'bg-white border-stone-200/80 hover:border-stone-300'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    disabled={assignedElsewhere && !isSelected}
                                                    aria-label={`Select ${proj.customer_name}`}
                                                    className="mt-0.5 accent-amber-500 w-4 h-4 rounded"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-stone-900 truncate">{proj.customer_name}</p>
                                                    {assignedElsewhere && <p className="text-[10px] font-semibold text-amber-700">Assigned to {proj.delivery_batch_id}</p>}
                                                    <p className="text-[10px] text-stone-500 truncate">{proj.villages || 'No village'} · {proj.phone_number}</p>
                                                    <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-stone-100">
                                                        <span className="font-bold text-amber-800">{proj.system_capacity_kwp || '–'} kWp</span>
                                                        <span className="text-stone-600 font-semibold">{proj.stage}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Section C: Optional Notes */}
                            <div>
                                <label className="text-[9px] font-bold text-stone-600 uppercase tracking-wider block mb-1">
                                    Transit Notes / Gate Instructions (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    aria-label="Transit Notes / Gate Instructions (optional)" value={batchForm.notes}
                                    onChange={e => setBatchForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Add any special transport notes, security gate passes, or route instructions..."
                                    className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs text-stone-800 outline-none focus:border-amber-400"
                                />
                            </div>

                            {/* Footer Buttons */}
                            <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition shadow-md shadow-stone-900/10 cursor-pointer disabled:opacity-50"
                                >
                                    {saving ? 'Saving & Dispatching...' : editingBatch ? 'Update Batch' : 'Save & Assign Batch'}
                                </button>
                            </div>
                        </form>
                    </div>
                </dialog>
            )}

            {/* Modal 2: Master Gate Pass & Delivery Challan Printable Sheet */}
            {printingBatch && (
                <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden print-container gate-pass-print">
                        {/* Print Header */}
                        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between no-print">
                            <div className="flex items-center gap-2">
                                <Printer size={18} className="text-amber-400" />
                                <h3 className="text-sm font-black uppercase tracking-wider">
                                    Master Gate Pass Preview - {printingBatch.batch_no}
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handlePrintBatch}
                                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-md"
                                >
                                    <Printer size={14} /> Print Document
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPrintingBatch(null)}
                                    className="text-stone-400 hover:text-white p-1 rounded-lg transition"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Printable Body */}
                        <div ref={printableRef} className="flex-1 overflow-y-auto p-8 bg-white text-stone-900 print-document" id="printable-master-batch">
                            {/* Company Header */}
                            <div className="border-b-2 border-stone-900 pb-4 mb-5 text-center">
                                <h1 className="text-xl font-black uppercase tracking-wider text-stone-950">SolarFlow Demo Energy</h1>
                                <p className="text-xs font-semibold text-stone-600 mt-0.5">Master Delivery Batch & Security Gate Pass Manifest</p>
                                <div className="inline-block mt-2 px-3 py-1 bg-stone-100 border border-stone-300 rounded text-[11px] font-black uppercase tracking-widest text-stone-800">
                                    BATCH DISPATCH MANIFEST - {printingBatch.batch_no}
                                </div>
                            </div>

                            {/* Section 1: Vehicle & Transit Information */}
                            <div className="mb-5">
                                <h3 className="text-xs font-black uppercase tracking-wider text-stone-900 border-b border-stone-400 pb-1 mb-2">
                                    1. Vehicle & Transit Logistics
                                </h3>
                                <table className="w-full text-xs border border-stone-300">
                                    <tbody>
                                        <tr className="border-b border-stone-200">
                                            <td className="w-1/4 p-2 bg-stone-50 font-bold text-stone-600">Vehicle / Truck No:</td>
                                            <td className="w-1/4 p-2 font-bold text-stone-900">{printingBatch.vehicle_number || '–'}</td>
                                            <td className="w-1/4 p-2 bg-stone-50 font-bold text-stone-600">Dispatch Date:</td>
                                            <td className="w-1/4 p-2 font-bold text-stone-900">{printingBatch.dispatch_date || '–'}</td>
                                        </tr>
                                        <tr className="border-b border-stone-200">
                                            <td className="p-2 bg-stone-50 font-bold text-stone-600">Driver Name:</td>
                                            <td className="p-2 font-bold text-stone-900">{printingBatch.driver_name || '–'}</td>
                                            <td className="p-2 bg-stone-50 font-bold text-stone-600">Driver Phone:</td>
                                            <td className="p-2 font-bold text-stone-900">{printingBatch.driver_phone || '–'}</td>
                                        </tr>
                                        <tr>
                                            <td className="p-2 bg-stone-50 font-bold text-stone-600">Rent Amount:</td>
                                            <td className="p-2 font-bold text-stone-900">{printingBatch.rent_amount ? `₹ ${toIndianCommas(printingBatch.rent_amount)}` : '–'}</td>
                                            <td className="p-2 bg-stone-50 font-bold text-stone-600">Total Sites:</td>
                                            <td className="p-2 font-bold text-stone-900">{(printingBatch.project_ids || []).length} Drop-off Locations</td>
                                        </tr>
                                        <tr>
                                            <td className="p-2 bg-stone-50 font-bold text-stone-600">Car Rent Paid:</td>
                                            <td className="p-2 font-bold text-stone-900" colSpan={3}>{printingBatch.car_rent_paid || '–'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Section 2: Multi-Stop Drop-Off Manifest Table */}
                            <div className="mb-6">
                                <h3 className="text-xs font-black uppercase tracking-wider text-stone-900 border-b border-stone-400 pb-1 mb-2">
                                    2. Multi-Stop Customer Drop-off Schedule & Recipient Signatures
                                </h3>
                                <table className="w-full text-xs border border-stone-300">
                                    <thead>
                                        <tr className="bg-stone-100 border-b border-stone-300 text-left font-black text-[10px] uppercase">
                                            <th className="p-2 border-r border-stone-300 w-8">Stop</th>
                                            <th className="p-2 border-r border-stone-300">Customer & Contact</th>
                                            <th className="p-2 border-r border-stone-300">Village / Address</th>
                                            <th className="p-2 border-r border-stone-300">System Specs</th>
                                            <th className="p-2 border-r border-stone-300">Inverter Serial</th>
                                            <th className="p-2 w-32">Recipient Sign</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-stone-300 font-medium text-stone-800">
                                        {customers.filter(c => (printingBatch.project_ids || []).includes(c.id)).map((proj, idx) => (
                                            <tr key={proj.id} className="border-b border-stone-200">
                                                <td className="p-2 font-bold text-center border-r border-stone-300">{idx + 1}</td>
                                                <td className="p-2 border-r border-stone-300">
                                                    <strong className="text-stone-900">{proj.customer_name}</strong>
                                                    <div className="text-[10px] text-stone-600">{proj.phone_number || '–'}</div>
                                                </td>
                                                <td className="p-2 border-r border-stone-300">
                                                    <div>{proj.villages || '–'}</div>
                                                    <div className="text-[10px] text-stone-500">{proj.sub_divisions || ''}</div>
                                                </td>
                                                <td className="p-2 border-r border-stone-300">
                                                    <strong>{proj.system_capacity_kwp ? `${proj.system_capacity_kwp} kWp` : '–'}</strong>
                                                    <div className="text-[10px] text-stone-600">{proj.no_of_modules ? `${proj.no_of_modules} Panels` : ''}</div>
                                                </td>
                                                <td className="p-2 border-r border-stone-300 font-mono text-[10px]">
                                                    {proj.inverter_serial_no || '–'}
                                                </td>
                                                <td className="p-2 text-stone-300 text-center italic text-[10px]">
                                                    _________________
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Section 3: Signatures & Gate Pass Clearance */}
                            <div className="mt-8 pt-4 border-t-2 border-stone-800 grid grid-cols-3 gap-6 text-center text-xs">
                                <div>
                                    <div className="h-10 border-b border-stone-400 mb-1"></div>
                                    <p className="font-bold text-stone-900">Warehouse Dispatcher</p>
                                    <p className="text-[10px] text-stone-500">Sign & Stamp</p>
                                </div>
                                <div>
                                    <div className="h-10 border-b border-stone-400 mb-1"></div>
                                    <p className="font-bold text-stone-900">Driver / Transporter</p>
                                    <p className="text-[10px] text-stone-500">{printingBatch.driver_name || 'Driver Signature'}</p>
                                </div>
                                <div>
                                    <div className="h-10 border-b border-stone-400 mb-1"></div>
                                    <p className="font-bold text-stone-900">Security Gate Clearance</p>
                                    <p className="text-[10px] text-stone-500">Out-Time & Sign</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Landscape gate pass and combined material loading sheet */}
            {materialSheetBatch && (() => {
                const manifest = batchMaterialManifest(materialSheetBatch, customers, printBomItems);
                const matrix = batchMaterialMatrix(manifest);
                return <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-2 overflow-y-auto material-summary-overlay">
                    <div className="bg-stone-100 rounded-2xl shadow-2xl w-full max-w-[1200px] max-h-[calc(100vh-1rem)] flex flex-col overflow-hidden material-summary-print">
                        <div className="px-4 py-3 bg-stone-900 text-white flex flex-wrap items-center justify-between gap-2 no-print">
                            <div className="flex items-center gap-2"><FileText size={18} className="text-amber-400"/><h3 className="text-sm font-black uppercase tracking-wider">Delivery sheet preview - {materialSheetBatch.batch_no}</h3></div>
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={handlePrintMaterialSheet} disabled={printMaterialsLoading || Boolean(printMaterialsError) || matrix.rows.length === 0} className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><Printer size={14}/>{printMaterialsLoading ? 'Loading Materials…' : 'Print delivery sheet'}</button>
                                <button type="button" aria-label="Close material summary" onClick={() => { setMaterialSheetBatch(null); setPrintBomItems({}); setPrintMaterialsError(''); }} className="text-stone-400 hover:text-white p-1 rounded-lg transition"><X size={18}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-2 sm:p-4 bg-stone-100">
                            <MaterialDeliverySheet batch={materialSheetBatch} matrix={matrix} loading={printMaterialsLoading} error={printMaterialsError}/>
                        </div>
                    </div>
                </div>;
            })()}

            {/* Print Specific CSS */}
            <style>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    body * {
                        visibility: hidden !important;
                    }
                    .print-container, .print-container * {
                        visibility: visible !important;
                    }
                    .print-container {
                        position: fixed !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        z-index: 9999999 !important;
                        overflow: visible !important;
                        max-height: none !important;
                    }
                    .print-document, .print-document * {
                        visibility: visible !important;
                    }
                    .print-document {
                        position: absolute !important;
                        inset: 0 auto auto 0 !important;
                        width: 100% !important;
                        max-height: none !important;
                        overflow: visible !important;
                        padding: 0 !important;
                    }
                    tr {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                    thead {
                        display: table-header-group;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
