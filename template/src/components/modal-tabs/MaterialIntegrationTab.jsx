import { useState, useEffect, useRef } from 'react';
import { ClipboardList, Printer, ShoppingBag, User, Clock, Edit3, X, Layers, Zap, Copy, Check, ClipboardPaste, Plus, Trash2, ScanLine } from 'lucide-react';
import { supabase } from '../../supabase';
import { EditableDetailItem } from './shared';
import { dropdownOptions, isOn } from '../../config/index.js';
import { DROPDOWN_CATALOG } from '../../config/catalog/dropdowns.js';
import { lazyWithRetry, LazyBoundary } from '../../lib/lazy.js';
import { Badge, Field, FieldList, FieldRenderer, Input, SectionCard, Select } from '../../ui/index.js';
import { useGlobalPopup } from '../GlobalPopup';
import { MAX_MODULE_SERIALS, persistScannedSerial, readModuleSerials } from '../../serials/record';

const BomPrintModal = lazyWithRetry(() => import('../BomPrintModal'));
const SerialScanner = lazyWithRetry(() => import('../SerialScanner'));
// Templates and loading live in utils/bom.js; it carries the 70 KB reference
// file, so it is only fetched when the BOM is shown.
const loadBomModule = () => import('../../utils/bom.js');

const bomOn = isOn('bomMaker');
const stockOn = isOn('inventory');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER_REFERENCE = [
    { key: 'roof_shed', label: 'Roof / Shed' },
    { key: 'dc_cable', label: 'DC Cable (Meters)' },
    { key: 'ac_cable', label: 'AC Cable (Meters)' },
    { key: 'structure_front_leg_height', label: 'Structure Front Leg Height (ft)' },
    { key: 'structure_rear_leg_height', label: 'Structure Rear Leg Height (ft)' },
    { key: 'invoice_value', label: 'Invoice Value (₹)', type: 'money' },
];
const ORDER_NOTES = { key: 'material_order_notes', label: 'Notes / Special Instructions (Optional)', type: 'textarea' };

const CUSTOMER_REFERENCE = [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'phone_number', label: 'Phone Number', type: 'phone' },
    { key: 'email_address', label: 'Email Address', alt: 'email' },
    { key: 'consumer_no', label: 'Consumer No' },
    { key: 'folder_no', label: 'Folder No' },
    { key: 'registration_no', label: 'Feasibility No', alt: 'feasibility_no' },
    { key: 'villages', label: 'Villages' },
    { key: 'sub_divisions', label: 'Sub Division' },
    ...(isOn('channelPartners') || isOn('cpos') ? [{ key: 'channel_partner', label: 'Channel Partner Name' }] : []),
    ...(isOn('dealers') ? [{ key: 'sub_channel_partner', label: 'Dealer Name' }] : []),
    { key: 'module_brand', label: 'Module Brand' },
    { key: 'module_wp', label: 'Module Wp' },
    { key: 'no_of_modules', label: 'No of Modules' },
    { key: 'system_capacity_kwp', label: 'System Capacity (kWp)' },
];

const MILESTONE_FIELDS = [
    { key: 'paper_prepared_by', label: 'Paper Prepared By' },
    { key: 'paper_prepared_date', label: 'Paper Prepared Date', type: 'date' },
    { key: 'material_loaded_by', label: 'Material Loaded By' },
    { key: 'material_loaded_date', label: 'Material Loaded Date', type: 'date' },
];

const parsePanelSerials = raw => {
    const serials = readModuleSerials(raw);
    return serials.length ? serials : [''];
};

// The last edited BOM per customer, read back by loadBomForCustomer when the
// database has none. Best effort: storage may be full or blocked.
const cacheBomDocument = document => {
    try {
        localStorage.setItem(`solarflow_bom_${document.bom.admin_id}`, JSON.stringify(document));
    } catch { /* ignore */ }
};

function EditToggle({ id, label, editingSection, setEditingSection }) {
    const open = editingSection === id;
    return (
        <button
            type="button"
            aria-pressed={open}
            aria-label={open ? `Stop editing ${label}` : `Edit ${label}`}
            onClick={() => {
                setEditingSection?.(open ? null : id);
                if (!open) setTimeout(() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-amber-600"
        >
            {open ? <X size={16} aria-hidden="true" /> : <Edit3 size={15} aria-hidden="true" />}
        </button>
    );
}

export default function MaterialIntegrationTab({
    customer,
    editData,
    setEditData,
    handleChange,
    isEditable,
    user,
    meta,
    logActivity,
    editingSection,
    setEditingSection,
    onUpdate,
    saveBomRef,
    onDirty
}) {
    const { showAlert } = useGlobalPopup();
    // The BOM is fetched after the first paint, so these fields rendered as "–"
    // for a moment before the real values arrived - which read as data loss.
    const [loadingBom, setLoadingBom] = useState(bomOn);
    // True when the BOM could not be read. The tab then shows the blank
    // template, and saving would replace the real bom_items with template
    // defaults - so saveBOM refuses while this is set.
    const bomLoadFailedRef = useRef(false);
    // Until the BOM has loaded nothing in it can have been edited, so a save skips it.
    const bomReadyRef = useRef(false);
    const [bom, setBom] = useState(null);
    const [bomItems, setBomItems] = useState([]);
    const [paperPreparedBy, setPaperPreparedBy] = useState('');
    const [paperPreparedDate, setPaperPreparedDate] = useState('');
    const [materialLoadedBy, setMaterialLoadedBy] = useState('');
    const [materialLoadedDate, setMaterialLoadedDate] = useState('');

    const [panelSerials, setPanelSerials] = useState(() => parsePanelSerials(customer?.panel_serial_no || editData?.panel_serial_no));
    const [syncedSerials, setSyncedSerials] = useState(customer?.panel_serial_no);
    const [showBulkPaste, setShowBulkPaste] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [copiedIdx, setCopiedIdx] = useState(null);
    const [copiedAll, setCopiedAll] = useState(false);
    const [scannerTarget, setScannerTarget] = useState(null);
    const scanSavePendingRef = useRef(false);
    const [showPrintModal, setShowPrintModal] = useState(() => bomOn && Boolean(customer?._autoPrintBom));

    const inverterMakeOptions = dropdownOptions('inverter_make', meta);
    const integrationByOptions = dropdownOptions('integration_by', meta);
    const noStaffHint = integrationByOptions.length === 0
        ? `No staff in the list yet. Add names to "${DROPDOWN_CATALOG.integration_by.label}" on the Operations page.`
        : undefined;

    // A save elsewhere (or a scan) changed the stored serials: show them.
    if (customer?.panel_serial_no !== syncedSerials) {
        setSyncedSerials(customer?.panel_serial_no);
        setPanelSerials(parsePanelSerials(customer?.panel_serial_no || editData?.panel_serial_no));
    }

    useEffect(() => {
        if (bomOn && customer?._autoPrintBom) setShowPrintModal(true);
    }, [customer?._autoPrintBom]);

    const setSerials = next => {
        setPanelSerials(next);
        const filtered = next.filter(Boolean);
        setEditData(prev => ({ ...prev, panel_serial_no: filtered.length > 0 ? filtered.join('\n') : '' }));
    };

    const handlePanelSerialChange = (idx, val) => {
        onDirty?.();
        const next = [...panelSerials];
        next[idx] = val;
        setSerials(next);
    };

    const addPanelSerial = (count = 1) => {
        onDirty?.();
        if (panelSerials.length >= MAX_MODULE_SERIALS) return;
        const toAdd = Math.min(count, MAX_MODULE_SERIALS - panelSerials.length);
        setPanelSerials(prev => [...prev, ...Array(toAdd).fill('')]);
    };

    const removePanelSerial = (idx) => {
        onDirty?.();
        const next = panelSerials.filter((_, i) => i !== idx);
        setSerials(next.length > 0 ? next : ['']);
    };

    const handleBulkPasteApply = () => {
        onDirty?.();
        const lines = bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        if (lines.length === 0) return;
        const combined = [...panelSerials.filter(Boolean), ...lines].slice(0, MAX_MODULE_SERIALS);
        setSerials(combined);
        setBulkText('');
        setShowBulkPaste(false);
    };

    const copySingleSerial = (text, idx) => {
        if (!text) return;
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
    };

    const copyAllSerials = () => {
        const text = panelSerials.filter(Boolean).join('\n');
        if (!text) return;
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
    };

    const handleScannedSerial = async (target, scannedValue) => {
        if (!isEditable || !customer?.id) throw new Error('This customer card is read-only.');
        if (scanSavePendingRef.current) throw new Error('Please wait for the previous serial to finish saving.');
        scanSavePendingRef.current = true;
        try {
            const currentValue = target === 'module'
                ? panelSerials.filter(Boolean).join('\n')
                : (editData?.inverter_serial_no ?? customer?.inverter_serial_no ?? '');
            const result = await persistScannedSerial(target, currentValue, scannedValue,
                (field, value) => onUpdate(customer.id, { [field]: value }));
            if (result.status === 'saved') {
                if (target === 'module') setPanelSerials(parsePanelSerials(result.value));
                if (logActivity && user?.id) {
                    void Promise.resolve(logActivity(user.id, 'update',
                        `${customer.customer_name}: Scanned ${target} serial ${result.serial}`, '', customer.id))
                        .catch(error => console.warn('Serial saved, but activity logging failed:', error));
                }
            }
            return result;
        } finally {
            scanSavePendingRef.current = false;
        }
    };

    const filledCount = panelSerials.filter(Boolean).length;

    // Roof vs Shed comes from the Material Order specification.
    const activeType = (editData?.roof_shed || customer?.roof_shed || '').toUpperCase().includes('SHED') ? 'SHED' : 'ROOF';

    const recordRef = useRef(null);
    recordRef.current = { ...customer, ...editData };

    useEffect(() => {
        if (!bomOn || !customer?.id) return undefined;
        let active = true;
        setLoadingBom(true);
        bomLoadFailedRef.current = false;
        bomReadyRef.current = false;
        (async () => {
            try {
                const { loadBomForCustomer } = await loadBomModule();
                const { bom: bomData, items, loadError } = await loadBomForCustomer(recordRef.current, activeType);
                if (!active) return;
                bomLoadFailedRef.current = !!loadError;
                if (loadError) {
                    showAlert(
                        'The Bill of Materials could not be loaded, so a blank template is shown. Do NOT save over it - your existing BOM is still in the database. Please reload and try again.',
                        { title: 'BOM not loaded', type: 'error' }
                    );
                }
                setPaperPreparedBy(bomData?.paper_prepared_by || '');
                setPaperPreparedDate(bomData?.paper_prepared_date || '');
                setMaterialLoadedBy(bomData?.material_loaded_by || '');
                setMaterialLoadedDate(bomData?.material_loaded_date || '');
                setBom(bomData);
                setBomItems(items);
                bomReadyRef.current = true;
            } catch (err) {
                console.error('loadBOM exception:', err);
                // Nothing was read, so nothing on screen may be saved over the real BOM.
                if (active) bomLoadFailedRef.current = true;
            } finally {
                if (active) setLoadingBom(false);
            }
        })();
        return () => { active = false; };
    }, [customer?.id, activeType, showAlert]);

    const latestStateRef = useRef({});
    latestStateRef.current = {
        bom,
        bomItems,
        paperPreparedBy,
        paperPreparedDate,
        materialLoadedBy,
        materialLoadedDate,
        activeType,
        customer
    };

    const bomDocument = (bomId, adminId, items, state = latestStateRef.current) => ({
        bom: {
            id: bomId,
            admin_id: adminId,
            bom_type: state.activeType,
            paper_prepared_by: state.paperPreparedBy,
            paper_prepared_date: state.paperPreparedDate,
            material_loaded_by: state.materialLoadedBy,
            material_loaded_date: state.materialLoadedDate,
        },
        items,
    });

    const handleItemFieldChange = (index, field, value) => {
        onDirty?.();
        const next = bomItems.map((item, i) => (i === index ? { ...item, [field]: value, ...(field === 'quantity' ? { stock_quantity: null } : {}) } : item));
        setBomItems(next);
        cacheBomDocument(bomDocument(bom?.id || null, customer.id, next));
    };

    // Save BOM and milestones together. CustomerDetailModal calls this through
    // saveBomRef on every save while the tab is mounted.
    const saveBOM = async () => {
        const state = latestStateRef.current;
        const targetCust = state.customer || customer;
        if (!targetCust?.id) return true;

        // The BOM on screen is a blank template because the read failed, not
        // because this customer has no BOM. Saving it would delete the real
        // bom_items and insert template defaults - and CustomerDetailModal
        // calls this on EVERY save while the tab is mounted, so editing any
        // unrelated field was enough to wipe it. Refuse instead.
        if (bomLoadFailedRef.current) {
            throw new Error(
                'The Bill of Materials could not be loaded, so it was not saved over. '
                + 'Close and reopen this customer, then try again.'
            );
        }
        if (!bomReadyRef.current) return true;

        let hadWriteError = false;

        try {
            const currentType = state.activeType || activeType;
            const prepBy = state.paperPreparedBy || null;
            const prepDate = state.paperPreparedDate || null;
            const loadBy = state.materialLoadedBy || null;
            const loadDate = state.materialLoadedDate || null;
            // A localStorage fallback can hold an id that is not a real row;
            // updating by it would match nothing and silently save nothing.
            const rawBomId = state.bom?.id;
            let currentBomId = UUID_RE.test(String(rawBomId || '')) ? rawBomId : null;
            if (rawBomId && !currentBomId) {
                console.warn('Ignoring non-UUID bom id from local cache:', rawBomId);
            }
            const items = state.bomItems || [];

            // 1. Find the existing bom row. Never insert because a read failed:
            // two rows for one customer make the BOM unreadable.
            if (!currentBomId) {
                const { data: existingRows, error: existingErr } = await supabase
                    .from('bom')
                    .select('id')
                    .eq('admin_id', targetCust.id)
                    .eq('bom_type', currentType)
                    .order('created_at', { ascending: true });

                if (existingErr) throw existingErr;
                if (existingRows && existingRows.length > 0) {
                    currentBomId = existingRows[0].id;
                }
            }

            // 2. Update or insert the parent bom row.
            if (currentBomId) {
                const { data: updatedRows, error: updateErr } = await supabase
                    .from('bom')
                    .update({
                        bom_type: currentType,
                        paper_prepared_by: prepBy,
                        paper_prepared_date: prepDate,
                        material_loaded_by: loadBy,
                        material_loaded_date: loadDate
                    })
                    .eq('id', currentBomId)
                    .select('id');

                if (updateErr) {
                    console.error('Supabase bom update error:', updateErr);
                    hadWriteError = true;
                } else if (updatedRows && updatedRows.length > 0) {
                    setBom(prev => ({
                        ...(prev || {}),
                        id: currentBomId,
                        bom_type: currentType,
                        paper_prepared_by: prepBy,
                        paper_prepared_date: prepDate,
                        material_loaded_by: loadBy,
                        material_loaded_date: loadDate,
                    }));
                } else {
                    // Matched nothing: the id we held does not exist. Create a
                    // row rather than reporting a save that never happened.
                    console.warn('bom update matched no rows for id', currentBomId, '- creating a new row instead.');
                    currentBomId = null;
                }
            }

            // Not an `else`: the update above can null currentBomId.
            if (!currentBomId) {
                const { data: created, error: createErr } = await supabase
                    .from('bom')
                    .insert({
                        admin_id: targetCust.id,
                        bom_type: currentType,
                        paper_prepared_by: prepBy,
                        paper_prepared_date: prepDate,
                        material_loaded_by: loadBy,
                        material_loaded_date: loadDate
                    })
                    .select()
                    .single();

                if (created?.id) {
                    currentBomId = created.id;
                    setBom(created);
                } else if (createErr) {
                    console.warn('Supabase bom create error:', createErr);
                    hadWriteError = true;
                }
            }

            // 3. Replace bom_items. There is no transaction, so snapshot first,
            // abort if the delete does not remove exactly the snapshot (an
            // RLS-refused delete returns no error), and restore the snapshot if
            // the insert fails. A failed save leaves the BOM as it was.
            if (currentBomId) {
                const { data: previousItems, error: snapshotErr } = await supabase
                    .from('bom_items')
                    .select('*')
                    .eq('bom_id', currentBomId);

                if (snapshotErr) {
                    console.error('Could not snapshot bom_items; refusing to overwrite:', snapshotErr);
                    throw new Error('Could not read the existing BOM lines, so they were not overwritten. Please retry.');
                }

                const expectedDeletes = Array.isArray(previousItems) ? previousItems.length : 0;
                const { data: deletedRows, error: delErr } = await supabase
                    .from('bom_items')
                    .delete()
                    .eq('bom_id', currentBomId)
                    .select('id');

                if (delErr) {
                    console.error('bom_items delete error:', delErr);
                    throw new Error('The existing BOM lines could not be replaced. Nothing was changed.');
                }
                if ((deletedRows?.length || 0) !== expectedDeletes) {
                    console.error('bom_items delete removed', deletedRows?.length, 'of', expectedDeletes);
                    throw new Error(
                        'The existing BOM lines could not be replaced, so the new ones were not added - '
                        + 'this avoids leaving the BOM with duplicate rows. Nothing was changed.'
                    );
                }

                const validItems = items.filter(item => item.product_name && item.product_name.trim() !== '');

                if (validItems.length > 0) {
                    const rowsToInsert = validItems.map((item, index) => ({
                        bom_id: currentBomId,
                        sr_no: index + 1,
                        uom: item.uom || null,
                        stock_quantity: item.stock_quantity === '' || item.stock_quantity == null ? null : Number(item.stock_quantity),
                        product_name: item.product_name,
                        quantity: item.quantity !== undefined && item.quantity !== null ? String(item.quantity) : '',
                        integration_by: item.integration_by || null,
                        note: item.note || null
                    }));

                    const { error: insertErr } = await supabase
                        .from('bom_items')
                        .insert(rowsToInsert);

                    if (insertErr) {
                        console.error('bom_items insert error, restoring previous lines:', insertErr);
                        hadWriteError = true;
                        if (previousItems && previousItems.length > 0) {
                            const { error: restoreErr } = await supabase
                                .from('bom_items')
                                .insert(previousItems);
                            if (restoreErr) {
                                console.error('CRITICAL: could not restore bom_items after a failed save:', restoreErr);
                                throw new Error(
                                    'The BOM could not be saved and the previous lines could not be restored. '
                                    + 'Do not close this window - copy your BOM before reloading.'
                                );
                            }
                        }
                        throw new Error('The BOM lines were not saved. Your previous BOM has been restored.');
                    }
                }
            }

            // Keep the inline document in step with the saved rows and reviewed stock quantities.
            const savedDocument = {
                bom: { id: currentBomId, admin_id: targetCust.id, bom_type: currentType,
                    paper_prepared_by: prepBy, paper_prepared_date: prepDate, material_loaded_by: loadBy, material_loaded_date: loadDate },
                items,
            };
            const { data: savedProjects, error: documentError } = await supabase.from('admin').update({ bom_data: savedDocument }).eq('id', targetCust.id).select('id');
            if (documentError || !savedProjects?.length) throw documentError || new Error('Could not save the BOM document.');
            setEditData(previous => ({ ...previous, bom_data: savedDocument }));

            // 4. Local backup, with null rather than a made-up id when no row exists.
            cacheBomDocument(bomDocument(currentBomId || null, targetCust.id, items, state));

            if (logActivity && user?.id) {
                await logActivity(
                    user.id,
                    'update',
                    `Saved BOM and milestones for ${targetCust.customer_name}`,
                    '',
                    targetCust.id
                );
            }

            return !hadWriteError;

        } catch (err) {
            console.error('saveBOM exception:', err);
            return false;
        }
    };

    useEffect(() => {
        if (!bomOn || !saveBomRef) return undefined;
        saveBomRef.current = saveBOM;
        return () => { saveBomRef.current = null; };
    });

    const isEditingMilestones = editingSection === 'procurement_milestones';
    const isEditingBom = editingSection === 'bom_items';
    const milestones = {
        paper_prepared_by: paperPreparedBy,
        paper_prepared_date: paperPreparedDate,
        material_loaded_by: materialLoadedBy,
        material_loaded_date: materialLoadedDate,
    };
    const setMilestone = { paper_prepared_by: setPaperPreparedBy, paper_prepared_date: setPaperPreparedDate, material_loaded_by: setMaterialLoadedBy, material_loaded_date: setMaterialLoadedDate };

    return (
        <div className="space-y-3.5 animate-in fade-in duration-300">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-stone-100 pb-2">
                <div>
                    <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">{bomOn ? 'Material Integration & BOM' : 'Material Integration'}</h4>
                    <p className="text-[11px] text-stone-500 font-medium">
                        {bomOn
                            ? 'Reference quantities from your BOM exports. Confirm measurements for this project; compound specifications stay unchanged.'
                            : 'Record the inverter and the panel serial numbers for this installation.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {isEditable && (
                        <button type="button" onClick={() => setScannerTarget('module')} className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 min-h-11 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer">
                            <ScanLine size={17} aria-hidden="true" /> Scan serials
                        </button>
                    )}
                    {bomOn && (
                        <>
                            <Badge tone="yellow" className="uppercase tracking-wider">{activeType} BOM</Badge>
                            {bom && <Badge tone="green" className="uppercase tracking-wider">Saved</Badge>}
                            <button
                                type="button"
                                onClick={() => setShowPrintModal(true)}
                                className="bg-stone-900 hover:bg-stone-800 text-white px-3 min-h-11 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                <Printer size={13} aria-hidden="true" /> Print / Export PDF
                            </button>
                        </>
                    )}
                </div>
            </div>

            {bomOn && (
                <>
                    <SectionCard id="section-mat_order_ref" title="Material Order Specifications (Reference)" icon={ShoppingBag} actions={<Badge>View only</Badge>}>
                        <FieldList
                            fields={ORDER_REFERENCE}
                            record={editData}
                            getValue={(record, field) => record?.[field.key] || customer?.[field.key]}
                            className="md:grid-cols-3"
                        />
                        <FieldRenderer field={ORDER_NOTES} value={editData?.material_order_notes || customer?.material_order_notes} readOnly />
                    </SectionCard>

                    <SectionCard id="section-lead_details" title="Customer & Site Reference" icon={User} actions={<Badge>View only</Badge>}>
                        <FieldList
                            fields={CUSTOMER_REFERENCE}
                            record={customer}
                            getValue={(record, field) => record?.[field.key] || record?.[field.alt] || editData?.[field.key] || editData?.[field.alt]}
                            className="md:grid-cols-3"
                        />
                    </SectionCard>
                </>
            )}

            <SectionCard
                id="section-inverter_equip_details"
                title="Inverter & Equipment Details"
                icon={Zap}
                actions={isEditable && <EditToggle id="inverter_equip_details" label="inverter details" editingSection={editingSection} setEditingSection={setEditingSection} />}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <EditableDetailItem
                        label="INVERTER MAKE *"
                        field="inverter_make"
                        value={editData?.inverter_make || customer?.inverter_make}
                        options={inverterMakeOptions}
                        category="inverter_make"
                        onChange={handleChange}
                        isEditing={editingSection === 'inverter_equip_details'}
                    />
                    <EditableDetailItem
                        label="INVERTER SERIAL NO. *"
                        field="inverter_serial_no"
                        value={editData?.inverter_serial_no || customer?.inverter_serial_no}
                        onChange={handleChange}
                        isEditing={editingSection === 'inverter_equip_details'}
                    />
                </div>
            </SectionCard>

            <SectionCard
                id="section-panel_serials"
                title="Panel Serial Numbers"
                icon={Layers}
                actions={<Badge>{filledCount} {filledCount === 1 ? 'Panel' : 'Panels'}</Badge>}
            >
                {(isEditable || filledCount > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {isEditable && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkPaste(prev => !prev)}
                                    aria-expanded={showBulkPaste}
                                    className="flex min-h-11 items-center gap-1 text-[11px] font-bold px-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition cursor-pointer"
                                >
                                    <ClipboardPaste size={13} aria-hidden="true" />
                                    {showBulkPaste ? 'Hide Paste' : 'Bulk Paste'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addPanelSerial(1)}
                                    disabled={panelSerials.length >= MAX_MODULE_SERIALS}
                                    className="flex min-h-11 items-center gap-1 text-[11px] font-bold px-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
                                >
                                    <Plus size={13} aria-hidden="true" /> Add 1
                                </button>
                                {[5, 10].map(count => (
                                    <button
                                        key={count}
                                        type="button"
                                        onClick={() => addPanelSerial(count)}
                                        disabled={panelSerials.length > MAX_MODULE_SERIALS - count}
                                        className="min-h-11 text-[11px] font-bold px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/60 transition disabled:opacity-50 cursor-pointer"
                                        aria-label={`Add ${count} serial rows`}
                                    >
                                        +{count}
                                    </button>
                                ))}
                            </>
                        )}

                        {filledCount > 0 && (
                            <button
                                type="button"
                                onClick={copyAllSerials}
                                className="flex min-h-11 items-center gap-1.5 text-[11px] font-bold px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 transition cursor-pointer"
                            >
                                {copiedAll ? (
                                    <>
                                        <Check size={13} className="text-emerald-600" aria-hidden="true" />
                                        <span className="text-emerald-600 font-bold">Copied All!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={13} aria-hidden="true" />
                                        <span>Copy All ({filledCount})</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {isEditable && showBulkPaste && (
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2 animate-in fade-in duration-200">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                            <label htmlFor="bulk-panel-serials" className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                                Quick Paste (one per line or comma separated)
                            </label>
                            <span className="text-[10px] text-stone-500">Supports Excel / WhatsApp lists</span>
                        </div>
                        <textarea
                            id="bulk-panel-serials"
                            rows={4}
                            value={bulkText}
                            onChange={(e) => setBulkText(e.target.value)}
                            placeholder={'Paste panel serial numbers here...\ne.g.\nSN100234\nSN100235\nSN100236'}
                            className="w-full bg-white border border-amber-200 rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-stone-400"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setBulkText(''); setShowBulkPaste(false); }}
                                className="min-h-11 px-3 text-[11px] font-semibold text-stone-600 hover:text-stone-800 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkPasteApply}
                                className="min-h-11 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition cursor-pointer"
                            >
                                Apply Numbers
                            </button>
                        </div>
                    </div>
                )}

                {isEditable ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                            {panelSerials.map((serial, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center bg-stone-50/80 hover:bg-stone-50 border border-stone-200/80 rounded-xl p-1.5 focus-within:border-amber-400 focus-within:bg-white transition"
                                >
                                    <span className="w-6 text-center text-xs font-bold text-stone-600 bg-stone-200/60 rounded-md py-1 mr-1.5 flex-shrink-0" aria-hidden="true">
                                        {idx + 1}
                                    </span>
                                    <input
                                        type="text"
                                        value={serial}
                                        onChange={(e) => handlePanelSerialChange(idx, e.target.value)}
                                        aria-label={`Panel serial ${idx + 1}`}
                                        className="flex-1 min-h-9 bg-transparent text-xs font-mono font-semibold text-stone-800 focus:outline-none placeholder:text-stone-300 min-w-0"
                                        placeholder={`Serial ${idx + 1}`}
                                    />
                                    {serial && (
                                        <button
                                            type="button"
                                            onClick={() => copySingleSerial(serial, idx)}
                                            className="p-2 text-stone-400 hover:text-stone-700 rounded transition cursor-pointer"
                                            aria-label={`Copy serial ${idx + 1}`}
                                        >
                                            {copiedIdx === idx ? <Check size={12} className="text-emerald-600" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                                        </button>
                                    )}
                                    {panelSerials.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removePanelSerial(idx)}
                                            className="text-stone-400 hover:text-red-500 p-2 rounded transition flex-shrink-0 cursor-pointer"
                                            aria-label={`Delete serial ${idx + 1}`}
                                        >
                                            <Trash2 size={13} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[10px] text-stone-500 font-medium">
                            <span>Showing {panelSerials.length} rows ({filledCount} filled)</span>
                            <button
                                type="button"
                                onClick={() => addPanelSerial(1)}
                                disabled={panelSerials.length >= MAX_MODULE_SERIALS}
                                className="min-h-11 px-1 text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                                <Plus size={12} aria-hidden="true" /> Add row
                            </button>
                        </div>
                    </div>
                ) : filledCount === 0 ? (
                    <div className="text-center py-6 border border-dashed border-stone-200 rounded-xl bg-stone-50/50">
                        <p className="text-xs text-stone-500 italic">No panel serial numbers entered yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[460px] overflow-y-auto pr-1">
                        {panelSerials.filter(Boolean).map((serial, idx) => (
                            <button
                                type="button"
                                key={idx}
                                onClick={() => copySingleSerial(serial, idx)}
                                className="group flex items-center justify-between bg-stone-50 hover:bg-amber-50/60 border border-stone-200/70 hover:border-amber-300/80 rounded-xl px-2.5 py-1.5 transition cursor-pointer text-left"
                                aria-label={`Copy serial ${idx + 1}: ${serial}`}
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-bold text-stone-500 group-hover:text-amber-700 bg-stone-200/50 group-hover:bg-amber-100/60 w-6 text-center py-0.5 rounded">
                                        {idx + 1}
                                    </span>
                                    <span className="text-xs font-mono font-bold text-stone-700 group-hover:text-stone-900 truncate">
                                        {serial}
                                    </span>
                                </span>
                                <span className="text-stone-300 group-hover:text-amber-600 transition flex-shrink-0 ml-1" aria-hidden="true">
                                    {copiedIdx === idx ? <Check size={12} className="text-emerald-600" /> : <Copy size={11} className="opacity-0 group-hover:opacity-100 transition" />}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </SectionCard>

            {bomOn && (
                <>
                    <SectionCard
                        id="section-procurement_milestones"
                        title="Procurement & Loading Milestones"
                        icon={Clock}
                        actions={isEditable && <EditToggle id="procurement_milestones" label="milestones" editingSection={editingSection} setEditingSection={setEditingSection} />}
                    >
                        {isEditingMilestones ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                {MILESTONE_FIELDS.map(field => (
                                    <Field key={field.key} label={field.label} htmlFor={`milestone-${field.key}`} hint={field.type === 'date' ? undefined : noStaffHint}>
                                        {field.type === 'date' ? (
                                            <Input
                                                id={`milestone-${field.key}`}
                                                type="date"
                                                value={milestones[field.key]}
                                                onChange={e => { setMilestone[field.key](e.target.value); onDirty?.(); }}
                                                disabled={!isEditable}
                                            />
                                        ) : (
                                            <Select
                                                id={`milestone-${field.key}`}
                                                options={integrationByOptions}
                                                placeholder="Select user…"
                                                value={milestones[field.key]}
                                                onChange={e => { setMilestone[field.key](e.target.value); onDirty?.(); }}
                                                disabled={!isEditable}
                                                aria-describedby={noStaffHint ? `milestone-${field.key}-hint` : undefined}
                                            />
                                        )}
                                    </Field>
                                ))}
                            </div>
                        ) : loadingBom ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2" role="status" aria-label="Loading milestones">
                                {MILESTONE_FIELDS.map(field => <div key={field.key} className="h-14 rounded-xl bg-stone-100 animate-pulse" />)}
                            </div>
                        ) : (
                            <FieldList fields={MILESTONE_FIELDS} record={milestones} className="md:grid-cols-4" />
                        )}
                    </SectionCard>

                    <SectionCard
                        id="section-bom_items"
                        title={`Bill of Materials (${activeType})`}
                        icon={ClipboardList}
                        actions={isEditable && <EditToggle id="bom_items" label="the bill of materials" editingSection={editingSection} setEditingSection={setEditingSection} />}
                    >
                        <div className="overflow-x-auto border border-stone-200 rounded-xl bg-white shadow-xs">
                            <table className="min-w-full divide-y divide-stone-200 text-xs">
                                <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider font-bold text-[9px]">
                                    <tr>
                                        <th scope="col" className="px-3 py-2 text-left w-10">#</th>
                                        <th scope="col" className="px-3 py-2 text-left">Product Name</th>
                                        <th scope="col" className="px-3 py-2 text-left w-24">Qty</th>
                                        <th scope="col" className="px-3 py-2 text-left w-20">UOM</th>
                                        <th scope="col" className="px-3 py-2 text-left w-44">Integration By</th>
                                        <th scope="col" className="px-3 py-2 text-left">Note</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-200 bg-white font-medium text-stone-700">
                                    {bomItems.map((item, idx) => (
                                        <tr key={item.id || `${item.product_name}-${idx}`} className="hover:bg-stone-50/40">
                                            <td className="px-3 py-2 text-stone-500 font-bold">{idx + 1}</td>
                                            <td className="px-3 py-2 font-semibold text-stone-800">{item.product_name || '–'}</td>
                                            {isEditingBom ? (
                                                <>
                                                    <td className="px-3 py-2">
                                                        <Input
                                                            aria-label={`Quantity for ${item.product_name}`}
                                                            value={item.quantity || ''}
                                                            onChange={(e) => handleItemFieldChange(idx, 'quantity', e.target.value)}
                                                            className="w-24 px-2 py-1.5 text-xs font-semibold"
                                                            placeholder="Qty..."
                                                        />
                                                        {stockOn && (
                                                            <label className="block text-[9px] text-emerald-700 mt-1">Stock quantity
                                                                <Input
                                                                    type="number" min="0" step="0.001"
                                                                    value={item.stock_quantity ?? ''}
                                                                    onChange={e => handleItemFieldChange(idx, 'stock_quantity', e.target.value === '' ? null : Number(e.target.value))}
                                                                    placeholder="Number"
                                                                    className="w-24 px-2 py-1.5 text-xs"
                                                                />
                                                            </label>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-stone-500 font-semibold">{item.uom || ''}</td>
                                                    <td className="px-3 py-2">
                                                        <Select
                                                            aria-label={`Integration by for ${item.product_name}`}
                                                            options={integrationByOptions}
                                                            placeholder="Select user…"
                                                            value={item.integration_by}
                                                            onChange={(e) => handleItemFieldChange(idx, 'integration_by', e.target.value)}
                                                            className="px-2 py-1.5 text-xs"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Input
                                                            aria-label={`Note for ${item.product_name}`}
                                                            value={item.note || ''}
                                                            onChange={(e) => handleItemFieldChange(idx, 'note', e.target.value)}
                                                            placeholder="Notes..."
                                                            className="px-2 py-1.5 text-xs"
                                                        />
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-3 py-2 text-stone-700 font-semibold">{item.quantity || '–'}</td>
                                                    <td className="px-3 py-2 text-stone-500 font-semibold">{item.uom || '–'}</td>
                                                    <td className="px-3 py-2">
                                                        {item.integration_by ? (
                                                            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 font-bold rounded-lg text-[10px] border border-amber-200/60">
                                                                {item.integration_by}
                                                            </span>
                                                        ) : (
                                                            <span className="text-stone-400 italic text-[11px]">–</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-stone-600">{item.note || '–'}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}

            <LazyBoundary>
                {scannerTarget && (
                    <SerialScanner
                        customerName={customer?.customer_name || 'Customer'}
                        initialTarget={scannerTarget}
                        moduleCount={filledCount}
                        expectedModules={Number(editData?.no_of_modules ?? customer?.no_of_modules) || 0}
                        inverterSerial={editData?.inverter_serial_no ?? customer?.inverter_serial_no ?? ''}
                        onScan={handleScannedSerial}
                        onClose={() => setScannerTarget(null)}
                    />
                )}
                {bomOn && showPrintModal && (
                    <BomPrintModal
                        customer={{ ...customer, ...editData }}
                        /* The milestones live in their own state and `bom` is only
                           refreshed on load/insert, so overlay the live values to
                           make the printout match the screen. */
                        bom={{ ...(bom || {}), ...milestones }}
                        bomItems={bomItems}
                        activeType={activeType}
                        onClose={() => setShowPrintModal(false)}
                    />
                )}
            </LazyBoundary>
        </div>
    );
}
