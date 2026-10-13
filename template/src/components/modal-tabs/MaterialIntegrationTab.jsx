import React, { useState, useEffect, useRef } from 'react';
import { ClipboardList, Save, Printer, ShoppingBag, User, Clock, AlertCircle, X, Layers, Zap, Copy, Check, ClipboardPaste, Plus, Trash2, ScanLine } from 'lucide-react';
import { supabase } from '../../supabase';
import { SectionHeader, EditableDetailItem } from './shared';
import BomPrintModal from '../BomPrintModal';
import { ROOF_BOM_TEMPLATE, SHED_BOM_TEMPLATE, COMMON_BOM_ITEMS } from '../../constants';
import bomReference from '../../inventory/reference.json' with { type: 'json' };
import { loadBomForCustomer, getBomTemplateForType } from '../../utils/bom';
import { useGlobalPopup } from '../GlobalPopup';
import SerialScanner from '../SerialScanner';
import { MAX_MODULE_SERIALS, persistScannedSerial, readModuleSerials } from '../../serials/record';

const parsePanelSerials = raw => {
    const serials = readModuleSerials(raw);
    return serials.length ? serials : [''];
};

export default function MaterialIntegrationTab({
    customer,
    editData,
    setEditData,
    handleChange,
    isEditable,
    user,
    meta = {},
    logActivity,
    editingSection,
    setEditingSection,
    onUpdate,
    handleAdvanceStage,
    saving,
    setSaving,
    saveBomRef,
    onDirty
}) {
    const { showAlert } = useGlobalPopup();
    // The BOM is fetched after the first paint, so these fields rendered as "–"
    // for a moment before the real values arrived - which read as data loss.
    const [loadingBom, setLoadingBom] = useState(true);
    // True when the BOM could not be read. The tab then shows the blank
    // template, and saving would replace the real bom_items with template
    // defaults - so saveBOM refuses while this is set.
    const bomLoadFailedRef = useRef(false);
    const [bom, setBom] = useState(null);
    const [bomItems, setBomItems] = useState([]);
    const [paperPreparedBy, setPaperPreparedBy] = useState('');
    const [paperPreparedDate, setPaperPreparedDate] = useState('');
    const [materialLoadedBy, setMaterialLoadedBy] = useState('');
    const [materialLoadedDate, setMaterialLoadedDate] = useState('');
    const [actionSaving, setActionSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    const [panelSerials, setPanelSerials] = useState(() => parsePanelSerials(customer?.panel_serial_no || editData?.panel_serial_no));
    const [showBulkPaste, setShowBulkPaste] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [copiedIdx, setCopiedIdx] = useState(null);
    const [copiedAll, setCopiedAll] = useState(false);
    const [scannerTarget, setScannerTarget] = useState(null);
    const scanSavePendingRef = useRef(false);

    const inverterMakeOptions = (meta?.['inverter_make'] && meta['inverter_make'].length > 0)
        ? meta['inverter_make']
        : bomReference.metadata.inverter_make;

    useEffect(() => {
        setPanelSerials(parsePanelSerials(customer?.panel_serial_no || editData?.panel_serial_no));
    }, [customer?.panel_serial_no]);

    const handlePanelSerialChange = (idx, val) => {
        onDirty?.();
        const next = [...panelSerials];
        next[idx] = val;
        setPanelSerials(next);
        const filtered = next.filter(Boolean);
        const serialized = filtered.length > 0 ? filtered.join('\n') : '';
        setEditData(prev => ({ ...prev, panel_serial_no: serialized }));
    };

    const addPanelSerial = (count = 1) => {
        onDirty?.();
        if (panelSerials.length >= MAX_MODULE_SERIALS) return;
        const toAdd = Math.min(count, MAX_MODULE_SERIALS - panelSerials.length);
        const newItems = Array(toAdd).fill('');
        setPanelSerials(prev => [...prev, ...newItems]);
    };

    const removePanelSerial = (idx) => {
        onDirty?.();
        const next = panelSerials.filter((_, i) => i !== idx);
        const finalVal = next.length > 0 ? next : [''];
        setPanelSerials(finalVal);
        const filtered = finalVal.filter(Boolean);
        const serialized = filtered.length > 0 ? filtered.join('\n') : '';
        setEditData(prev => ({ ...prev, panel_serial_no: serialized }));
    };

    const handleBulkPasteApply = () => {
        onDirty?.();
        if (!bulkText.trim()) return;
        const lines = bulkText
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(Boolean);
        if (lines.length > 0) {
            const existing = panelSerials.filter(Boolean);
            const combined = [...existing, ...lines].slice(0, 100);
            const finalSerials = combined.length > 0 ? combined : [''];
            setPanelSerials(finalSerials);
            setEditData(prev => ({ ...prev, panel_serial_no: finalSerials.join('\n') }));
            setBulkText('');
            setShowBulkPaste(false);
        }
    };

    const copySingleSerial = (text, idx) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
    };

    const copyAllSerials = () => {
        const text = panelSerials.filter(Boolean).join('\n');
        if (!text) return;
        navigator.clipboard.writeText(text);
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
    const originalSerialized = (parsePanelSerials(customer?.panel_serial_no) || []).filter(Boolean).join('\n');
    const currentSerialized = panelSerials.filter(Boolean).join('\n');
    const isSerialsDirty = originalSerialized !== currentSerialized;

    const [showPrintModal, setShowPrintModal] = useState(() => Boolean(customer?._autoPrintBom));

    useEffect(() => {
        if (customer?._autoPrintBom) {
            setShowPrintModal(true);
        }
    }, [customer?._autoPrintBom]);

    // Integration By dropdown options. No placeholder fallback - fabricated
    // names used to be offered when the list was empty, and anything picked
    // was saved onto a real customer (the same way "Test Vendor (Solar Tech)"
    // ended up on live records). An empty list shows an empty list.
    const integrationByOptions = meta['integration_by'] || [];

    // Automatically determine Roof vs Shed from Material Order specification
    const roofShedVal = (editData?.roof_shed || customer?.roof_shed || '').toUpperCase();
    const activeType = roofShedVal.includes('SHED') ? 'SHED' : 'ROOF';

    const getTemplateForType = getBomTemplateForType;

    const loadBOM = async () => {
        if (!customer?.id) return;
        setLoadingBom(true);
        bomLoadFailedRef.current = false;
        try {
            const { bom: bomData, items, loadError } = await loadBomForCustomer({ ...customer, ...editData }, activeType);
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
        } catch (err) {
            console.error('loadBOM exception:', err);
        } finally {
            setLoadingBom(false);
        }
    };

    useEffect(() => {
        loadBOM();
    }, [customer?.id, editData?.roof_shed, customer?.roof_shed]);

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

    const handleItemFieldChange = (index, field, value) => {
        onDirty?.();
        setBomItems(prev => {
            const next = prev.map((item, i) => (i === index ? { ...item, [field]: value, ...(field === 'quantity' ? {stock_quantity:null} : {}) } : item));
            try {
                const localData = {
                    bom: {
                        id: bom?.id || `bom-${customer.id}`,
                        admin_id: customer.id,
                        bom_type: activeType,
                        paper_prepared_by: paperPreparedBy,
                        paper_prepared_date: paperPreparedDate,
                        material_loaded_by: materialLoadedBy,
                        material_loaded_date: materialLoadedDate
                    },
                    items: next
                };
                localStorage.setItem(`solarflow_bom_${customer.id}`, JSON.stringify(localData));
            } catch { /* best-effort, ignore failure */ }
            return next;
        });
    };

    // Save BOM and Milestones together
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

        setActionSaving(true);
        let hadWriteError = false;

        try {
            const currentType = state.activeType || activeType;
            const prepBy = state.paperPreparedBy || null;
            const prepDate = state.paperPreparedDate || null;
            const loadBy = state.materialLoadedBy || null;
            const loadDate = state.materialLoadedDate || null;
            // A localStorage fallback stores a fabricated id ("bom-<uuid>"), which
            // is not a real row. Using it made .update().eq('id', ...) match ZERO
            // rows - no error, no rows changed - so the milestones silently never
            // saved, and the fake id kept coming back from localStorage.
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const rawBomId = state.bom?.id;
            let currentBomId = UUID_RE.test(String(rawBomId || '')) ? rawBomId : null;
            if (rawBomId && !currentBomId) {
                console.warn('Ignoring non-UUID bom id from local cache:', rawBomId);
            }
            const items = state.bomItems || [];

            // 1. Check if a bom record exists for this customer if we don't have an ID
            if (!currentBomId) {
                // The error was not captured here. A failed read left `existing`
                // undefined, so the code below INSERTED a second bom row for the
                // same customer - and once two rows share an admin_id the BOM can
                // never be read back, which is how Material Integration data
                // "disappeared". Never insert because a read failed.
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

            // 2. Update or Insert the parent bom record
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
                    // Keep local `bom` current - it was only ever set on load or
                    // insert, so after an update it held stale milestone values.
                    setBom(prev => ({
                        ...(prev || {}),
                        id: currentBomId,
                        bom_type: currentType,
                        paper_prepared_by: prepBy,
                        paper_prepared_date: prepDate,
                        material_loaded_by: loadBy,
                        material_loaded_date: loadDate,
                    }));
                } else if (!updatedRows || updatedRows.length === 0) {
                    // Matched nothing: the id we held does not exist. Fall back to
                    // creating a row rather than reporting a save that never happened.
                    console.warn('bom update matched no rows for id', currentBomId, '- creating a new row instead.');
                    currentBomId = null;
                }

            }

            // Not an `else`: the update above can null currentBomId when it
            // matched nothing, and that must create the row in THIS save rather
            // than silently doing nothing until the next one.
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

            // 3. Persist bom_items rows.
            //
            // This is a delete-then-insert with no transaction. Previously, if
            // the DELETE succeeded and the INSERT then failed for ANY reason
            // (a bad value, RLS, a dropped connection), the old rows were
            // already gone and the new ones never arrived - the BOM lines were
            // destroyed. The save reported "not saved", which was true, but the
            // data had already been deleted.
            //
            // Now: snapshot first, abort if the delete fails, and restore the
            // snapshot if the insert fails, so a failed save leaves the BOM
            // exactly as it was.
            if (currentBomId) {
                const { data: previousItems, error: snapshotErr } = await supabase
                    .from('bom_items')
                    .select('*')
                    .eq('bom_id', currentBomId);

                if (snapshotErr) {
                    console.error('Could not snapshot bom_items; refusing to overwrite:', snapshotErr);
                    throw new Error('Could not read the existing BOM lines, so they were not overwritten. Please retry.');
                }

                // The guard below only ever checked delErr - but an RLS-refused
                // DELETE removes nothing and returns error: null, so it fell
                // straight through to the insert and the BOM accumulated BOTH
                // the old and the new rows on every save. That duplication is
                // what made Material Integration data appear to change on its
                // own. `previousItems` is the rows we just read, so it tells us
                // exactly how many the delete had to remove.
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
                        // Put back exactly what was there before.
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

            // Keep the authoritative inline document in step with saved rows and reviewed stock quantities.
            const savedDocument={bom:{id:currentBomId,admin_id:targetCust.id,bom_type:currentType,
                paper_prepared_by:prepBy,paper_prepared_date:prepDate,material_loaded_by:loadBy,material_loaded_date:loadDate},items};
            const {data:savedProjects,error:documentError}=await supabase.from('admin').update({bom_data:savedDocument}).eq('id',targetCust.id).select('id');
            if(documentError || !savedProjects?.length)throw documentError || new Error('Could not save the BOM document.');
            setEditData(previous=>({...previous,bom_data:savedDocument}));

            // 4. Save to localStorage backup
            try {
                const localBomData = {
                    bom: {
                        // null, never a fabricated id - a fake id here is what made
                        // later saves target a row that does not exist.
                        id: currentBomId || null,
                        admin_id: targetCust.id,
                        bom_type: currentType,
                        paper_prepared_by: prepBy,
                        paper_prepared_date: prepDate,
                        material_loaded_by: loadBy,
                        material_loaded_date: loadDate
                    },
                    items: items
                };
                localStorage.setItem(`solarflow_bom_${targetCust.id}`, JSON.stringify(localBomData));
            } catch (e) {
                console.error('LocalStorage BOM save failed:', e);
            }

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
        } finally {
            setActionSaving(false);
        }
    };

    useEffect(() => {
        if (saveBomRef) {
            saveBomRef.current = async () => {
                return saveBOM();
            };
        }
        return () => {
            if (saveBomRef) {
                saveBomRef.current = null;
            }
        };
    });


    const isEditingMilestones = editingSection === 'procurement_milestones';
    const isEditingBom = editingSection === 'bom_items';

    return (
        <div className="space-y-3.5 animate-in fade-in duration-300">
            {/* Top Toolbar / Action Bar */}
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-stone-100 pb-2">
                <div>
                    <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Material Integration & BOM</h4>
                    <p className="text-[11px] text-stone-500 font-medium">Reference quantities from your BOM exports. Confirm measurements for this project; compound specifications stay unchanged.</p>
                </div>
                <div className="flex items-center gap-2">
                    {isEditable && <button type="button" onClick={() => setScannerTarget('module')} className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"><ScanLine size={17}/> Scan serials</button>}
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        {activeType} BOM
                    </span>
                    {bom && (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                            Saved
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowPrintModal(true)}
                        className="bg-stone-900 hover:bg-stone-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                        <Printer size={13} /> Print / Export PDF
                    </button>
                </div>
            </div>

            {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-xs text-rose-800">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />
                        <span className="font-semibold">{errorMessage}</span>
                    </div>
                    <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-700 cursor-pointer">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* 1. Material Order Specifications (View-Only Reference exactly matching Material Order tab) */}
            <section id="section-mat_order_ref">
                <div className="flex items-center justify-between mb-2 border-b border-stone-100 pb-1">
                    <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ShoppingBag size={12} className="text-amber-500" /> Material Order Specifications (Reference)
                    </h3>
                    <span className="text-[9px] font-semibold text-stone-400 uppercase">View Only</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <EditableDetailItem
                        label="Roof / Shed"
                        field="roof_shed"
                        value={editData?.roof_shed || customer?.roof_shed}
                        isEditing={false}
                    />
                    <EditableDetailItem
                        label="DC Cable (Meters)"
                        field="dc_cable"
                        value={editData?.dc_cable || customer?.dc_cable}
                        isEditing={false}
                    />
                    <EditableDetailItem
                        label="AC Cable (Meters)"
                        field="ac_cable"
                        value={editData?.ac_cable || customer?.ac_cable}
                        isEditing={false}
                    />
                    <EditableDetailItem
                        label="Structure Front Leg Height (ft)"
                        field="structure_front_leg_height"
                        value={editData?.structure_front_leg_height || customer?.structure_front_leg_height}
                        isEditing={false}
                    />
                    <EditableDetailItem
                        label="Structure Rear Leg Height (ft)"
                        field="structure_rear_leg_height"
                        value={editData?.structure_rear_leg_height || customer?.structure_rear_leg_height}
                        isEditing={false}
                    />
                    <EditableDetailItem
                        label="Invoice Value (₹)"
                        field="invoice_value"
                        value={editData?.invoice_value || customer?.invoice_value}
                        isMoney={true}
                        isEditing={false}
                    />
                    <div className="col-span-2 md:col-span-3">
                        <EditableDetailItem
                            label="Notes / Special Instructions (Optional)"
                            field="material_order_notes"
                            value={editData?.material_order_notes || customer?.material_order_notes}
                            isEditing={false}
                        />
                    </div>
                </div>
            </section>

            {/* 2. Customer & Site Reference (View-Only Reference - Exactly matching Material Order tab) */}
            <section id="section-lead_details" className="pt-1.5 border-t border-stone-100">
                <div className="flex items-center justify-between mb-2 border-b border-stone-100 pb-1">
                    <h3 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                        <User size={12} className="text-amber-500" /> Customer & Site Reference
                    </h3>
                    <span className="text-[9px] font-semibold text-stone-400 uppercase">View Only</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <EditableDetailItem label="Customer Name" field="customer_name" value={customer?.customer_name || editData?.customer_name} isEditing={false} />
                    <EditableDetailItem label="Phone Number" field="phone_number" value={customer?.phone_number || editData?.phone_number} isEditing={false} />
                    <EditableDetailItem label="Email Address" field="email" value={customer?.email_address || customer?.email || editData?.email_address || editData?.email} isEditing={false} />
                    <EditableDetailItem label="Consumer No" field="consumer_no" value={customer?.consumer_no || editData?.consumer_no} isEditing={false} />
                    <EditableDetailItem label="Folder No" field="folder_no" value={customer?.folder_no || editData?.folder_no} isEditing={false} />
                    <EditableDetailItem label="Feasibility No" field="feasibility_no" value={customer?.registration_no || customer?.feasibility_no || editData?.registration_no || editData?.feasibility_no} isEditing={false} />
                    <EditableDetailItem label="Villages" field="villages" value={customer?.villages || editData?.villages} isEditing={false} />
                    <EditableDetailItem label="Sub Division" field="sub_divisions" value={customer?.sub_divisions || editData?.sub_divisions} isEditing={false} />
                    <EditableDetailItem label="Channel Partner Name" field="channel_partner" value={customer?.channel_partner || editData?.channel_partner} isEditing={false} />
                    <EditableDetailItem label="Dealer Name" field="sub_channel_partner" value={customer?.sub_channel_partner || editData?.sub_channel_partner} isEditing={false} />
                    <EditableDetailItem label="MODULE BRAND" field="module_brand" value={customer?.module_brand || editData?.module_brand} isEditing={false} />
                    <EditableDetailItem label="MODULE WP" field="module_wp" value={customer?.module_wp || editData?.module_wp} isEditing={false} />
                    <EditableDetailItem label="No of Modules" field="no_of_modules" value={customer?.no_of_modules || editData?.no_of_modules} isEditing={false} />
                    <EditableDetailItem label="System Capacity (kWp)" field="system_capacity_kwp" value={customer?.system_capacity_kwp || editData?.system_capacity_kwp} isEditing={false} />
                </div>
            </section>

            {/* 3. Inverter & Equipment Details (Own Edit Pencil) */}
            <section id="section-inverter_equip_details" className="pt-1.5 border-t border-stone-100 space-y-3">
                <SectionHeader 
                    title="Inverter & Equipment Details" 
                    id="inverter_equip_details" 
                    icon={Zap} 
                    isEditable={isEditable} 
                    editingSection={editingSection} 
                    setEditingSection={setEditingSection} 
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <EditableDetailItem 
                        label="INVERTER MAKE *" 
                        field="inverter_make" 
                        value={editData?.inverter_make || customer?.inverter_make} 
                        options={inverterMakeOptions}
                        category="inverter_make"
                        meta={meta}
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
            </section>

            {/* 4. Dedicated Standalone Panel Serial Numbers Section */}
            <section id="section-panel_serials" className="space-y-3 pt-1.5 border-t border-stone-100">
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
                            <Layers size={14} />
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wide flex items-center gap-2">
                                Panel Serial Numbers
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-stone-100 text-stone-600 border border-stone-200">
                                    {filledCount} {filledCount === 1 ? 'Panel' : 'Panels'}
                                </span>
                            </h4>
                        </div>
                    </div>

                    {/* Action buttons on top right */}
                    <div className="flex items-center gap-1.5">
                        {isEditable && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkPaste(prev => !prev)}
                                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition cursor-pointer"
                                >
                                    <ClipboardPaste size={13} />
                                    {showBulkPaste ? 'Hide Paste' : 'Bulk Paste'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addPanelSerial(1)}
                                    disabled={panelSerials.length >= MAX_MODULE_SERIALS}
                                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
                                >
                                    <Plus size={13} /> Add 1
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addPanelSerial(5)}
                                    disabled={panelSerials.length >= MAX_MODULE_SERIALS - 4}
                                    className="text-[11px] font-bold px-2 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/60 transition disabled:opacity-50 cursor-pointer"
                                    title="Add 5 serial rows"
                                >
                                    +5
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addPanelSerial(10)}
                                    disabled={panelSerials.length >= MAX_MODULE_SERIALS - 9}
                                    className="text-[11px] font-bold px-2 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/60 transition disabled:opacity-50 cursor-pointer"
                                    title="Add 10 serial rows"
                                >
                                    +10
                                </button>
                            </>
                        )}

                        {filledCount > 0 && (
                            <button
                                type="button"
                                onClick={copyAllSerials}
                                className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 transition cursor-pointer"
                            >
                                {copiedAll ? (
                                    <>
                                        <Check size={13} className="text-emerald-600" />
                                        <span className="text-emerald-600 font-bold">Copied All!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={13} />
                                        <span>Copy All ({filledCount})</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Bulk Paste Box */}
                {isEditable && showBulkPaste && (
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                                Quick Paste (one per line, comma or space separated)
                            </label>
                            <span className="text-[10px] text-stone-500">Supports Excel / WhatsApp lists</span>
                        </div>
                        <textarea
                            rows={4}
                            value={bulkText}
                            onChange={(e) => setBulkText(e.target.value)}
                            placeholder="Paste 20+ panel serial numbers here...&#10;e.g.&#10;SN100234&#10;SN100235&#10;SN100236"
                            className="w-full bg-white border border-amber-200 rounded-lg p-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-stone-400"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setBulkText(''); setShowBulkPaste(false); }}
                                className="px-3 py-1 text-[11px] font-semibold text-stone-600 hover:text-stone-800 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkPasteApply}
                                className="px-3.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition cursor-pointer"
                            >
                                Apply Numbers
                            </button>
                        </div>
                    </div>
                )}

                {/* Content Section: Simple, clean 1, 2, 3 indexing */}
                {isEditable ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                            {panelSerials.map((serial, idx) => (
                                <div 
                                    key={idx} 
                                    className="flex items-center bg-stone-50/80 hover:bg-stone-50 border border-stone-200/80 rounded-xl p-1.5 focus-within:border-amber-400 focus-within:bg-white transition"
                                >
                                    <span className="w-6 text-center text-xs font-bold text-stone-600 bg-stone-200/60 rounded-md py-1 mr-1.5 flex-shrink-0">
                                        {idx + 1}
                                    </span>
                                    <input
                                        type="text"
                                        value={serial}
                                        onChange={(e) => handlePanelSerialChange(idx, e.target.value)}
                                        className="flex-1 bg-transparent text-xs font-mono font-semibold text-stone-800 focus:outline-none placeholder:text-stone-300 min-w-0"
                                        placeholder={`Serial ${idx + 1}`}
                                    />
                                    {serial && (
                                        <button
                                            type="button"
                                            onClick={() => copySingleSerial(serial, idx)}
                                            className="p-1 text-stone-400 hover:text-stone-700 rounded transition cursor-pointer"
                                            title="Copy Serial"
                                        >
                                            {copiedIdx === idx ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                        </button>
                                    )}
                                    {panelSerials.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removePanelSerial(idx)}
                                            className="text-stone-400 hover:text-red-500 p-1 rounded transition flex-shrink-0 cursor-pointer"
                                            title="Delete serial"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[10px] text-stone-400 font-medium">
                            <span>Showing {panelSerials.length} rows ({filledCount} filled)</span>
                            <button
                                type="button"
                                onClick={() => addPanelSerial(1)}
                                className="text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 cursor-pointer"
                            >
                                <Plus size={12} /> Add row
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        {filledCount === 0 ? (
                            <div className="text-center py-6 border border-dashed border-stone-200 rounded-xl bg-stone-50/50">
                                <p className="text-xs text-stone-400 italic">No panel serial numbers entered yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[460px] overflow-y-auto pr-1">
                                {panelSerials.filter(Boolean).map((serial, idx) => (
                                    <div 
                                        key={idx} 
                                        onClick={() => copySingleSerial(serial, idx)}
                                        className="group flex items-center justify-between bg-stone-50 hover:bg-amber-50/60 border border-stone-200/70 hover:border-amber-300/80 rounded-xl px-2.5 py-1.5 transition cursor-pointer"
                                        title="Click to copy serial"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs font-bold text-stone-500 group-hover:text-amber-700 bg-stone-200/50 group-hover:bg-amber-100/60 w-6 text-center py-0.5 rounded">
                                                {idx + 1}
                                            </span>
                                            <span className="text-xs font-mono font-bold text-stone-700 group-hover:text-stone-900 truncate">
                                                {serial}
                                            </span>
                                        </div>
                                        <div className="text-stone-300 group-hover:text-amber-600 transition flex-shrink-0 ml-1">
                                            {copiedIdx === idx ? (
                                                <Check size={12} className="text-emerald-600" />
                                            ) : (
                                                <Copy size={11} className="opacity-0 group-hover:opacity-100 transition" />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* 5. Procurement & Loading Milestones (Own Edit Pencil) */}
            <section id="section-procurement_milestones" className="pt-1.5 border-t border-stone-100">
                <SectionHeader 
                    title="Procurement & Loading Milestones" 
                    id="procurement_milestones" 
                    icon={Clock} 
                    isEditable={isEditable} 
                    editingSection={editingSection} 
                    setEditingSection={setEditingSection} 
                />

                {isEditingMilestones ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Paper Prepared By </label>
                            <select
                                value={paperPreparedBy}
                                onChange={(e) => { setPaperPreparedBy(e.target.value); onDirty?.(); }}
                                disabled={!isEditable}
                                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-400 font-semibold disabled:bg-stone-100/50 cursor-pointer disabled:cursor-not-allowed"
                            >
                                <option value="">Select User...</option>
                                {/* Keep an already-saved name selectable even if it is no
                                    longer in the Integration Staff list, otherwise opening
                                    an older record silently blanks the field. */}
                                {paperPreparedBy && !integrationByOptions.includes(paperPreparedBy) && (
                                    <option value={paperPreparedBy}>{paperPreparedBy} (not in list)</option>
                                )}
                                {integrationByOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            {integrationByOptions.length === 0 && (
                                <p className="text-[9px] text-amber-700 font-semibold mt-1">
                                    No Integration Staff registered - add them in Operations → Integration Staff.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Paper Prepared Date </label>
                            <input
                                type="date"
                                value={paperPreparedDate}
                                onChange={(e) => { setPaperPreparedDate(e.target.value); onDirty?.(); }}
                                disabled={!isEditable}
                                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-400 font-semibold disabled:bg-stone-100/50"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Material Loaded By </label>
                            <select
                                value={materialLoadedBy}
                                onChange={(e) => { setMaterialLoadedBy(e.target.value); onDirty?.(); }}
                                disabled={!isEditable}
                                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-400 font-semibold disabled:bg-stone-100/50 cursor-pointer disabled:cursor-not-allowed"
                            >
                                <option value="">Select User...</option>
                                {/* Keep an already-saved name selectable even if it is no
                                    longer in the Integration Staff list, otherwise opening
                                    an older record silently blanks the field. */}
                                {materialLoadedBy && !integrationByOptions.includes(materialLoadedBy) && (
                                    <option value={materialLoadedBy}>{materialLoadedBy} (not in list)</option>
                                )}
                                {integrationByOptions.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            {integrationByOptions.length === 0 && (
                                <p className="text-[9px] text-amber-700 font-semibold mt-1">
                                    No Integration Staff registered - add them in Operations → Integration Staff.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Material Loaded Date </label>
                            <input
                                type="date"
                                value={materialLoadedDate}
                                onChange={(e) => { setMaterialLoadedDate(e.target.value); onDirty?.(); }}
                                disabled={!isEditable}
                                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-400 font-semibold disabled:bg-stone-100/50"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-stone-50/70 p-2.5 rounded-xl border border-stone-200/60">
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Paper Prepared By </label>
                            <p className="text-xs font-bold text-stone-700">{loadingBom ? <span className="inline-block w-16 h-3 bg-stone-200 rounded animate-pulse align-middle" /> : (paperPreparedBy || "–")}</p>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Paper Prepared Date </label>
                            <p className="text-xs font-bold text-stone-700">{loadingBom ? <span className="inline-block w-16 h-3 bg-stone-200 rounded animate-pulse align-middle" /> : (paperPreparedDate || "–")}</p>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Material Loaded By </label>
                            <p className="text-xs font-bold text-stone-700">{loadingBom ? <span className="inline-block w-16 h-3 bg-stone-200 rounded animate-pulse align-middle" /> : (materialLoadedBy || "–")}</p>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Material Loaded Date </label>
                            <p className="text-xs font-bold text-stone-700">{loadingBom ? <span className="inline-block w-16 h-3 bg-stone-200 rounded animate-pulse align-middle" /> : (materialLoadedDate || "–")}</p>
                        </div>
                    </div>
                )}
            </section>

            {/* 4. Bill of Materials (BOM) Items (Own Edit Pencil) */}
            <section id="section-bom_items" className="pt-1.5 border-t border-stone-100">
                <SectionHeader 
                    title={`Bill of Materials (${activeType})`} 
                    id="bom_items" 
                    icon={ClipboardList} 
                    isEditable={isEditable} 
                    editingSection={editingSection} 
                    setEditingSection={setEditingSection} 
                />

                {isEditingBom ? (
                    <div className="overflow-x-auto border border-stone-200 rounded-xl bg-white shadow-xs">
                        <table className="min-w-full divide-y divide-stone-200 text-xs">
                            <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider font-bold text-[9px]">
                                <tr>
                                    <th className="px-3 py-2 text-left w-10">#</th>
                                    <th className="px-3 py-2 text-left">Product Name</th>
                                    <th className="px-3 py-2 text-left w-24">Qty</th>
                                    <th className="px-3 py-2 text-left w-20">UOM</th>
                                    <th className="px-3 py-2 text-left w-44">Integration By</th>
                                    <th className="px-3 py-2 text-left">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-200 bg-white font-medium text-stone-700">
                                {bomItems.map((item, idx) => (
                                    <tr
                                        key={item.id || `${item.product_name}-${idx}`}
                                        className="hover:bg-stone-50/40"
                                    >
                                        <td className="px-3 py-2 text-stone-400 font-bold">
                                            {idx + 1}
                                        </td>

                                        <td className="px-3 py-2 font-semibold text-stone-800">
                                            {item.product_name || ''}
                                        </td>

                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={item.quantity || ''}
                                                onChange={(e) =>
                                                    handleItemFieldChange(
                                                        idx,
                                                        'quantity',
                                                        e.target.value
                                                    )
                                                }
                                                className="w-20 bg-white border border-stone-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-300 font-semibold text-stone-800"
                                                placeholder="Qty..."
                                            />
                                            <label className="block text-[9px] text-emerald-700 mt-1">Stock quantity
                                                <input type="number" min="0" step="0.001" value={item.stock_quantity ?? ''}
                                                    onChange={e=>handleItemFieldChange(idx,'stock_quantity',e.target.value===''?null:Number(e.target.value))}
                                                    placeholder="Use numeric Qty" className="w-24 border border-emerald-200 rounded px-2 py-1" />
                                            </label>
                                        </td>

                                        <td className="px-3 py-2 text-stone-500 font-semibold">
                                            {item.uom || ''}
                                        </td>

                                        <td className="px-3 py-2">
                                            <select
                                                value={item.integration_by || ''}
                                                onChange={(e) =>
                                                    handleItemFieldChange(
                                                        idx,
                                                        'integration_by',
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-300 font-medium text-stone-800"
                                            >
                                                <option value="">
                                                    Select User...
                                                </option>

                                                {integrationByOptions.map((opt) => (
                                                    <option key={opt} value={opt}>
                                                        {opt}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>

                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={item.note || ''}
                                                onChange={(e) =>
                                                    handleItemFieldChange(
                                                        idx,
                                                        'note',
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-300"
                                                placeholder="Notes..."
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-stone-200/80 rounded-xl">
                        <table className="min-w-full divide-y divide-stone-200 text-xs">
                            <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider font-bold text-[9px]">
                                <tr>
                                    <th className="px-3 py-2 text-left w-12">#</th>
                                    <th className="px-3 py-2 text-left">Product Name</th>
                                    <th className="px-3 py-2 text-left w-24">Qty</th>
                                    <th className="px-3 py-2 text-left w-20">UOM</th>
                                    <th className="px-3 py-2 text-left w-44">Integration By</th>
                                    <th className="px-3 py-2 text-left">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-150 bg-white text-stone-700">
                                {bomItems.map((item, idx) => (
                                    <tr
                                        key={item.id || `${item.product_name}-${idx}`}
                                        className="hover:bg-stone-50/50"
                                    >
                                        <td className="px-3 py-2 text-stone-400 font-bold">
                                            {idx + 1}
                                        </td>

                                        <td className="px-3 py-2 font-semibold text-stone-800">
                                            {item.product_name || '–'}
                                        </td>

                                        <td className="px-3 py-2 text-stone-700 font-semibold">
                                            {item.quantity || '–'}
                                        </td>

                                        <td className="px-3 py-2 text-stone-500 font-semibold">
                                            {item.uom || '–'}
                                        </td>

                                        <td className="px-3 py-2">
                                            {item.integration_by ? (
                                                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 font-bold rounded-lg text-[10px] border border-amber-200/60">
                                                    {item.integration_by}
                                                </span>
                                            ) : (
                                                <span className="text-stone-400 italic text-[11px]">
                                                    –
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-3 py-2 text-stone-600">
                                            {item.note || '–'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Dedicated Print & PDF Modal */}
            {scannerTarget && <SerialScanner
                customerName={customer?.customer_name || 'Customer'}
                initialTarget={scannerTarget}
                moduleCount={filledCount}
                expectedModules={Number(editData?.no_of_modules ?? customer?.no_of_modules) || 0}
                inverterSerial={editData?.inverter_serial_no ?? customer?.inverter_serial_no ?? ''}
                onScan={handleScannedSerial}
                onClose={() => setScannerTarget(null)}
            />}
            {showPrintModal && (
                <BomPrintModal
                    customer={{ ...customer, ...editData }}
                    /* The four milestones live in their own state, and `bom` is
                       only refreshed on load/insert - never after an update. So
                       printing showed stale or blank values for Paper Prepared
                       By / Material Loaded By and their dates. Overlay the live
                       values so the printout matches what is on screen. */
                    bom={{
                        ...(bom || {}),
                        paper_prepared_by: paperPreparedBy,
                        paper_prepared_date: paperPreparedDate,
                        material_loaded_by: materialLoadedBy,
                        material_loaded_date: materialLoadedDate,
                    }}
                    bomItems={bomItems}
                    activeType={activeType}
                    onClose={() => setShowPrintModal(false)}
                />
            )}
        </div>
    );
}
