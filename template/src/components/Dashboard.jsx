// ─── Dashboard.jsx ────────────────────────────────────────────────────────────
// Shell for head office (admin, sales) and partner office (CPO, manager)
// logins: sidebar, header filters, the stage lists and the view router.
// Views, their role gates and their feature switches live in app/views.js.
// ──────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Menu, Plus, Users } from 'lucide-react';
import { supabase } from '../supabase';
import { logActivity, uploadDocument, parseIndianNumber, sanitizeAdminUpdate, normalizeAdminValues, runWrite } from '../utils';
import { STAGE_GUIDANCE, STAGE_IDS, isOn, isStageEnabled, stageLabel } from '../config/index.js';
import { getCustomerCardColumns } from '../constants';
import { customerSource } from '../lib/db.js';
import { lazyWithRetry, LazyBoundary } from '../lib/lazy.js';
import { todayIST } from '../lib/format.js';
import { EmptyState, ErrorBanner, LoadingState, LoadMoreButton, MonthSelect, SearchInput, Select, YearSelect, useRefreshOnFocus } from '../ui/index.js';
import { useGlobalPopup } from './GlobalPopup';
import CustomerCard from './CustomerCard';
import Sidebar from '../app/Sidebar';
import GlobalSearch from '../app/GlobalSearch';
import PartnerFilter from '../app/PartnerFilter';
import { DASHBOARD_ROLES, VIEWS, canOpenView, restoreStage, restoreView, saveStage, saveView, viewFor } from '../app/views.js';
import { fetchDealerNames, fetchMetadataLists, fetchSolarEquipmentStats, fetchTodaySummary, scopeCustomers, stageDateFilters } from '../dashboard/queries.js';
import { stageMoveProblem } from '../dashboard/stageMove.js';

const CustomerDetailModal = lazyWithRetry(() => import('./CustomerDetailModal'));
const AddLeadModal = lazyWithRetry(() => import('./AddLeadModal'));

const PAGE_SIZE = 50;
const MONTH_SHORTCUTS = [{ value: 'this-month', label: 'This month' }, { value: 'last-month', label: 'Last month' }];
const EMPTY_METRICS = {
    totalProjects: 0, completedCount: 0, liveProjects: 0, loanCount: 0, cashCount: 0, stageCounts: {},
    deliveryBatchesCount: 0, installationTagCount: 0, subsidyTagCount: 0, loanTagCount: 0,
};
const METRICS_KEY = 'solarflow_cached_metrics';
const CUSTOMER_KEY = 'solarflow_selected_customer_id';

const readSession = key => { try { return window.sessionStorage.getItem(key); } catch { return null; } };
const writeSession = (key, value) => {
    try {
        if (value == null) window.sessionStorage.removeItem(key);
        else window.sessionStorage.setItem(key, value);
    } catch { /* storage blocked */ }
};
const readCachedMetrics = () => { try { return JSON.parse(readSession(METRICS_KEY)) || null; } catch { return null; } };
const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// A null value removes the key, as merge_custom_fields does on the server.
function mergeCustomFields(base, values) {
    const merged = { ...(base && typeof base === 'object' ? base : {}) };
    Object.entries(values).forEach(([key, value]) => { if (value === null) delete merged[key]; else merged[key] = value; });
    return merged;
}

export default function Dashboard({ user, onLogout, onChangePassword }) {
    const { showAlert } = useGlobalPopup();
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office' || user?.userType === 'office2';
    const isCpo = isChannelPartnerOffice;
    const source = customerSource(isCpo);
    const partnerName = (user?.channel_partner || user?.name || '').trim();
    const canViewDeliveries = canOpenView('delivery_batches', user);
    const canSeeTrash = canOpenView('trash', user);
    const showPartnerFilter = !isCpo && (isOn('channelPartners') || isOn('cpos'));

    const [currentView, setCurrentView] = useState(() => restoreView(user));
    const [selectedStage, setSelectedStage] = useState(restoreStage);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [stageSearch, setStageSearch] = useState('');
    const [channelPartnerFilter, setChannelPartnerFilter] = useState('');
    const [dealerFilter, setDealerFilter] = useState('');
    const [dealerOptions, setDealerOptions] = useState([]);
    const [monthFilters, setMonthFilters] = useState({});
    const [yearFilter, setYearFilter] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddLead, setShowAddLead] = useState(false);
    const [meta, setMeta] = useState({});
    const [metrics, setMetrics] = useState(readCachedMetrics);
    const [trashCount, setTrashCount] = useState(0);
    const [metricsError, setMetricsError] = useState('');

    const view = currentView === 'stages' ? null : viewFor(currentView, user);
    const monthFilter = monthFilters[selectedStage] || '';
    const dealerParent = isCpo ? partnerName : channelPartnerFilter;
    const showDealerFilter = isOn('dealerFiltering') && Boolean(dealerParent);
    const scope = useMemo(() => ({
        channelPartner: isCpo ? '' : channelPartnerFilter.trim(),
        dealer: dealerFilter.trim(),
    }), [isCpo, channelPartnerFilter, dealerFilter]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const openView = useCallback(id => {
        const target = viewFor(id, user);
        if (!target) return;
        target.onEnter?.();
        setCurrentView(id);
    }, [user]);
    const openStage = useCallback(id => { setSelectedStage(id); setCurrentView('stages'); }, []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);
    const goHome = useCallback(() => setCurrentView('dashboard'), []);

    useEffect(() => {
        saveView(currentView);
        // Leaving a view that has its own address drops the address too.
        const linked = VIEWS.find(item => item.hash && window.location.hash.startsWith(item.hash));
        if (linked && linked.id !== currentView) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }, [currentView]);
    useEffect(() => { saveStage(selectedStage); }, [selectedStage]);

    // Reopen the customer that was open before a reload.
    useEffect(() => { writeSession(CUSTOMER_KEY, selectedCustomer?.id || null); }, [selectedCustomer?.id]);
    useEffect(() => {
        const savedId = readSession(CUSTOMER_KEY);
        if (!savedId) return;
        supabase.from(source).select('*').eq('id', savedId).is('deleted_at', null).maybeSingle()
            .then(({ data }) => { if (data) setSelectedCustomer(data); });
        // Only on first load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Filters ───────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setDealerFilter('');
        setDealerOptions([]);
        if (!isOn('dealerFiltering') || !dealerParent) return undefined;
        fetchDealerNames({ user, isCpo, channelPartner: dealerParent })
            .then(names => { if (!cancelled) setDealerOptions(names); })
            .catch(error => { if (!cancelled) console.error('Dealer filter load failed:', error); });
        return () => { cancelled = true; };
    }, [dealerParent, isCpo, user]);

    const loadMeta = useCallback(() => fetchMetadataLists().then(setMeta).catch(error => console.warn('Dropdown lists unavailable:', error.message)), []);
    useEffect(() => { loadMeta(); }, [loadMeta]);

    // Channel partner names from the dropdown list, one per name whatever its case.
    const channelPartners = useMemo(() => [...(meta.channel_partner || []).reduce((byName, rawLabel) => {
        const label = String(rawLabel || '').trim();
        const key = label.toLocaleLowerCase();
        if (!key) return byName;
        const current = byName.get(key);
        const labelIsUppercase = label === label.toLocaleUpperCase();
        const currentIsUppercase = current === String(current || '').toLocaleUpperCase();
        if (!current || (labelIsUppercase && !currentIsUppercase)) byName.set(key, label);
        return byName;
    }, new Map()).values()].sort((a, b) => a.localeCompare(b)), [meta.channel_partner]);

    // Typed names snap to the listed spelling, so counts and lists use the same value.
    const applyPartner = name => setChannelPartnerFilter(channelPartners.find(listed => sameText(listed, name)) || name);

    // ── Metrics ───────────────────────────────────────────────────────────────
    const fetchMetrics = useCallback(async () => {
        const equipment = fetchSolarEquipmentStats(isCpo, scope).catch(error => { console.warn('Solar equipment summary unavailable:', error.message); return null; });
        const today = fetchTodaySummary(isCpo, scope, canViewDeliveries).catch(error => { console.warn('Today summary unavailable:', error.message); return null; });
        const openBatches = canViewDeliveries
            ? supabase.from('delivery_batches').select('id', { count: 'exact', head: true }).neq('status', 'DELIVERED').then(({ count, error }) => (error ? 0 : count || 0))
            : Promise.resolve(0);
        if (canSeeTrash) {
            supabase.from(source).select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null)
                .then(({ count, error }) => { if (!error && typeof count === 'number') setTrashCount(count); });
        }

        const { data, error } = await supabase.rpc(
            isCpo ? 'get_cpo_dashboard_metrics' : 'get_dashboard_metrics_scoped',
            isCpo ? { p_dealer: scope.dealer || null } : { p_channel_partner: scope.channelPartner || null, p_dealer: scope.dealer || null },
        );
        setMetricsError(!error ? '' : isCpo
            ? 'Your login is not linked to a partner office yet, so no totals can be shown. Ask your administrator to check your login in User Management.'
            : 'The totals could not be loaded. Check your connection and try again.');
        if (error || !data) {
            console.error('Metrics fetch error:', error);
            return;
        }
        const [solarEquipment, todaySummary, deliveryBatchesCount] = await Promise.all([equipment, today, openBatches]);
        const next = { ...EMPTY_METRICS, ...data, solarEquipment, todaySummary, deliveryBatchesCount };
        setMetrics(next);
        writeSession(METRICS_KEY, JSON.stringify(next));
    }, [isCpo, scope, canViewDeliveries, canSeeTrash, source]);

    useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

    // A burst of realtime events collapses into one refresh on a fixed cadence.
    const fetchMetricsRef = useRef(fetchMetrics);
    useEffect(() => { fetchMetricsRef.current = fetchMetrics; });
    const metricsTimer = useRef(null);
    const lastMetricsAt = useRef(0);
    const scheduleMetricsRefresh = useCallback(() => {
        if (metricsTimer.current) return;
        const wait = Math.max(8000, 15000 - (Date.now() - lastMetricsAt.current));
        metricsTimer.current = setTimeout(() => {
            metricsTimer.current = null;
            lastMetricsAt.current = Date.now();
            fetchMetricsRef.current();
        }, wait);
    }, []);
    useEffect(() => () => clearTimeout(metricsTimer.current), []);

    // ── Stage lists ───────────────────────────────────────────────────────────
    const latestStageRequest = useRef(0);
    const fetchStageCustomers = useCallback(async (pageNum = 0) => {
        const requestId = ++latestStageRequest.current;
        setLoading(true);
        let query = scopeCustomers(supabase
            .from(source)
            .select(getCustomerCardColumns(isCpo))
            .eq('stage', selectedStage)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
            .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1), scope);
        stageDateFilters(selectedStage, { year: yearFilter, month: monthFilter }).forEach(({ field, start, end }) => {
            query = query.gte(field, start).lt(field, end);
        });

        const { data, error } = await query;
        if (requestId !== latestStageRequest.current) return;
        if (error) {
            console.error('Error fetching stage customers:', error);
            if (pageNum === 0) setCustomers([]);
        } else {
            setCustomers(prev => {
                if (pageNum === 0) return data;
                const seen = new Set(prev.map(c => c.id));
                return [...prev, ...data.filter(c => !seen.has(c.id))];
            });
            setHasMore(data.length === PAGE_SIZE);
        }
        setLoading(false);
    }, [source, isCpo, selectedStage, scope, yearFilter, monthFilter]);

    useEffect(() => {
        if (currentView !== 'stages') return;
        setPage(0);
        fetchStageCustomers(0);
    }, [currentView, fetchStageCustomers]);

    const loadMore = () => {
        const next = page + 1;
        setPage(next);
        fetchStageCustomers(next);
    };

    useRefreshOnFocus(() => {
        if (currentView === 'stages') { setPage(0); fetchStageCustomers(0); }
        fetchMetrics();
    });

    // Realtime: re-test each change against this login's scope, because the
    // payload is not filtered for us.
    useEffect(() => {
        const isVisible = row => {
            if (!row || row.deleted_at) return false;
            if (scope.dealer && !sameText(row.sub_channel_partner, scope.dealer)) return false;
            if (isCpo) return true; // Checked through cpo_leads before this runs.
            return !scope.channelPartner || sameText(row.channel_partner, scope.channelPartner);
        };
        const channel = supabase.channel('admin_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin' }, async payload => {
                if (isCpo && payload.new?.id) {
                    const { data: visible, error } = await supabase.from('cpo_leads').select('id').eq('id', payload.new.id).maybeSingle();
                    if (error || !visible) {
                        setCustomers(prev => prev.filter(c => c.id !== payload.new.id));
                        scheduleMetricsRefresh();
                        return;
                    }
                }
                scheduleMetricsRefresh();
                if (payload.eventType === 'DELETE') {
                    setCustomers(prev => prev.filter(c => c.id !== (payload.old?.id || payload.new?.id)));
                    return;
                }
                const inStage = payload.new.stage === selectedStage && isVisible(payload.new);
                setCustomers(prev => {
                    const exists = prev.some(c => c.id === payload.new.id);
                    if (exists && inStage) return prev.map(c => (c.id === payload.new.id ? payload.new : c));
                    if (exists) return prev.filter(c => c.id !== payload.new.id);
                    return inStage ? [payload.new, ...prev] : prev;
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [selectedStage, isCpo, scope, scheduleMetricsRefresh]);

    // Keep the open customer in step with list updates.
    useEffect(() => {
        if (!selectedCustomer) return;
        const fresh = customers.find(c => c.id === selectedCustomer.id);
        // List rows carry fewer columns than the open record, so only their own fields are compared.
        if (fresh && Object.keys(fresh).some(key => JSON.stringify(fresh[key]) !== JSON.stringify(selectedCustomer[key]))) {
            setSelectedCustomer(prev => (prev?.id === fresh.id ? { ...prev, ...fresh } : prev));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customers]);

    const handleGlobalSelect = useCallback(customer => {
        setSelectedStage(isStageEnabled(customer.stage) ? customer.stage : STAGE_IDS.LEADS);
        setCurrentView('stages');
        setStageSearch('');
        setSelectedCustomer(customer);
    }, []);

    // ── Writes ────────────────────────────────────────────────────────────────
    const applyLocal = (id, patch) => {
        setCustomers(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
        setSelectedCustomer(prev => (prev?.id === id ? { ...prev, ...patch } : prev));
    };

    // New channel partner and module brand names join their dropdown lists.
    const syncMetadata = async data => {
        let added = false;
        for (const category of ['channel_partner', 'module_brand']) {
            const label = String(data[category] || '').trim();
            if (!label) continue;
            const { data: rows, error } = await supabase.from('metadata').select('label').eq('category', category);
            if (error || (rows || []).some(row => sameText(row.label, label))) continue;
            const { error: insertError } = await supabase.from('metadata').insert({ category, label });
            if (insertError) console.warn(`Could not add "${label}" to the ${category} list:`, insertError.message);
            else added = true;
        }
        if (added) loadMeta();
    };

    const reportFailedUpdate = async (id, error) => {
        if (!error) {
            const { data: auth, error: authError } = await supabase.auth.getUser();
            if (authError || !auth?.user) {
                showAlert('Your session has expired. Please log in again to continue.', { type: 'error' });
                onLogout?.();
                return;
            }
            console.error('Update matched no rows for id', id);
            showAlert('Your changes were not saved: the database did not accept the update. Your account may not have permission to edit this record, or it has been deleted. Please refresh and check before editing again.', { type: 'error' });
            return;
        }
        console.error('Error updating customer:', error);
        if (error.code === 'PGRST301' || /jwt|token|auth/i.test(error.message || '')) {
            showAlert('Your session has expired. Please log in again.', { type: 'error' });
            onLogout?.();
            return;
        }
        showAlert(`Your changes were not saved: ${error.message || 'unknown database error'}`, { type: 'error' });
    };

    // Resolves false (never rejects) when nothing was saved. Extra-field values
    // arrive as { custom_fields: { key: value } } and are merged on the server.
    const handleUpdateCustomer = async (id, updates) => {
        const { custom_fields: customValues, ...columns } = updates || {};
        const clean = normalizeAdminValues(sanitizeAdminUpdate(columns));
        delete clean.id; delete clean.created_at; delete clean.updated_at;
        for (const key of ['loan_history', 'subsidy_history']) {
            if (Array.isArray(clean[key])) clean[key] = clean[key].map(({ isNew: _isNew, ...item }) => item);
        }
        const hasCustom = Boolean(customValues) && typeof customValues === 'object' && Object.keys(customValues).length > 0;
        if (!Object.keys(clean).length && !hasCustom) return true;

        const previous = (selectedCustomer?.id === id ? selectedCustomer : null) || customers.find(c => c.id === id) || {};
        const optimistic = hasCustom ? { ...clean, custom_fields: mergeCustomFields(previous.custom_fields, customValues) } : clean;
        const restore = keys => applyLocal(id, Object.fromEntries(keys.map(key => [key, previous[key] ?? null])));
        applyLocal(id, optimistic);

        try {
            if (Object.keys(clean).length) {
                const { data: changed, error } = await supabase.from('admin').update(clean).eq('id', id).select('id');
                if (error || !changed?.length) {
                    restore(Object.keys(optimistic));
                    await reportFailedUpdate(id, error);
                    return false;
                }
                syncMetadata(clean);
            }
            if (hasCustom) {
                const { data: merged, error } = await supabase.rpc('merge_custom_fields', { p_customer_id: id, p_values: customValues });
                if (error) {
                    restore(['custom_fields']);
                    await reportFailedUpdate(id, error);
                    return false;
                }
                applyLocal(id, { custom_fields: merged || {} });
            }
            return true;
        } catch (err) {
            console.error('Exception updating customer:', err);
            restore(Object.keys(optimistic));
            showAlert(`Could not reach the database: ${err.message}`, { type: 'error' });
            return false;
        }
    };

    // Soft delete: the customer moves to Trash and can be recovered.
    const handleSoftDelete = async (id, deletedAt) => {
        const ts = deletedAt || new Date().toISOString();
        applyLocal(id, { deleted_at: ts });
        setSelectedCustomer(null);
        const res = await runWrite(supabase.from('admin').update({ deleted_at: ts }).eq('id', id).select('id'), { action: 'move to Trash' });
        if (!res.ok) {
            applyLocal(id, { deleted_at: null });
            showAlert(`The customer was not moved to Trash: ${res.error.message}`, { type: 'error' });
        } else {
            setTrashCount(count => count + 1);
        }
    };

    const handleRecover = async (id, name) => {
        const res = await runWrite(supabase.from('admin').update({ deleted_at: null }).eq('id', id).select('id'), { action: 'recovery' });
        if (!res.ok) {
            showAlert(`The customer could not be recovered: ${res.error.message}`, { type: 'error' });
            return false;
        }
        applyLocal(id, { deleted_at: null });
        setTrashCount(count => Math.max(0, count - 1));
        logActivity(user.id, 'update', `Recovered ${name || 'a customer'} from Trash`, '', id);
        return true;
    };

    // Permanent delete (admin only; the database refuses anyone else).
    const handleHardDelete = async (id, name) => {
        const res = await runWrite(supabase.from('admin').delete().eq('id', id).select('id'), { action: 'permanent deletion' });
        if (!res.ok) {
            showAlert(`The customer was not permanently deleted: ${res.error.message}`, { type: 'error' });
            return false;
        }
        setTrashCount(count => Math.max(0, count - 1));
        setCustomers(prev => prev.filter(c => c.id !== id));
        // The row is gone, so the log entry cannot reference it; the id goes in the message.
        await logActivity(user.id, 'delete', `Permanently deleted: ${name || 'unnamed customer'} (id ${id})`, '', null);
        return true;
    };

    // Admin stage override from a customer card. The server checks the stage
    // is in this client's pipeline and logs the move.
    const handleMoveStage = async (id, newStage) => {
        const { data: record, error: readError } = await supabase.from(source).select('*').eq('id', id).maybeSingle();
        if (readError || !record) {
            showAlert('This customer could not be loaded. Refresh and try again.', { type: 'error' });
            return;
        }
        const oldStage = record.stage;
        if (oldStage === newStage) return;
        const problem = stageMoveProblem(record, newStage);
        if (problem) {
            showAlert(problem.message, { title: problem.title, type: 'warning' });
            return;
        }

        const remarks = record.stages_remarks && typeof record.stages_remarks === 'object' ? record.stages_remarks : {};
        applyLocal(id, { stage: newStage });
        const { data: moved, error } = await supabase.rpc('move_stage', {
            p_customer_id: id, p_new_stage: newStage, p_old_stage: oldStage, p_remark: remarks[oldStage] || '',
        });
        if (error) {
            console.error('Error moving stage:', error);
            showAlert(`The stage was not changed: ${error.message}`, { type: 'error' });
            applyLocal(id, { stage: oldStage });
            return;
        }
        if (moved) applyLocal(id, moved);
        scheduleMetricsRefresh();

        // Lost Project records where the project was lost from, so Resume can send it back.
        if (newStage === STAGE_IDS.LOST_PROJECT) {
            let existing = {};
            try {
                existing = typeof record.hold_procurement === 'string' ? (JSON.parse(record.hold_procurement) || {}) : (record.hold_procurement || {});
            } catch { existing = {}; }
            const followUp = { hold_procurement: { ...existing, previous_stage: oldStage, hold_date: todayIST() } };
            const res = await runWrite(supabase.from('admin').update(followUp).eq('id', id).select('id'), { action: 'follow-up write' });
            if (res.ok) applyLocal(id, followUp);
            else {
                showAlert(
                    `The customer was moved to ${stageLabel(STAGE_IDS.LOST_PROJECT)}, but the stage it came from (${stageLabel(oldStage)}) could not be recorded. `
                    + `Open the ${stageLabel(STAGE_IDS.LOST_PROJECT)} tab and set the origin stage, or Resume will send them back to ${stageLabel(STAGE_IDS.LEADS)}.`,
                    { type: 'error' },
                );
            }
        }
    };

    const handleAddLead = async (data, attachedFiles = [], quotation = null) => {
        const nowIso = new Date().toISOString();
        const leadData = {
            ...data,
            lead_creator_profile_id: data.lead_creator_profile_id || user?.id || null,
            application_done_by: user?.name || 'Admin',
        };
        for (const key of ['system_capacity_kwp', 'module_wp', 'no_of_modules']) {
            if (leadData[key] != null && leadData[key] !== '') leadData[key] = parseIndianNumber(leadData[key]);
        }
        // Postgres rejects '' in number and date columns.
        const insertData = Object.fromEntries(Object.entries(leadData).map(([key, value]) => [key, value === '' ? null : value]));
        insertData.created_at ||= nowIso;
        insertData.updated_at ||= nowIso;

        let result;
        if (quotation) {
            const { quotationRepository } = await import('../quotations/client');
            result = await quotationRepository.insertConversionLead(quotation, insertData, user);
        } else {
            result = await supabase.from('admin').insert(insertData).select().single();
        }
        const { data: newCustomer, error } = result;
        if (error) {
            console.error('Error adding lead:', error);
            showAlert(`The lead was not added: ${error.message}`, { type: 'error' });
            throw error;
        }

        // The lead stays saved; the user is told which documents did not upload.
        const failedUploads = [];
        await Promise.all((attachedFiles || []).filter(item => item.file).map(async item => {
            try {
                await uploadDocument(item.file, newCustomer.id, item.doc_type, user?.id);
            } catch (uploadErr) {
                console.error('Failed to upload file for new lead:', uploadErr);
                failedUploads.push(item.file.name || item.doc_type || 'a document');
            }
        }));
        if (failedUploads.length) {
            showAlert(`The lead was saved, but ${failedUploads.length} document(s) did not upload: ${failedUploads.join(', ')}. Open the customer and attach them again.`, { type: 'error' });
        }

        if (newCustomer.stage === selectedStage) setCustomers(prev => (prev.some(c => c.id === newCustomer.id) ? prev : [newCustomer, ...prev]));
        setShowAddLead(false);
        syncMetadata(insertData);
        void logActivity(user.id, 'create', `Added new lead: ${data.customer_name}`, `Done by: ${user.name}`, newCustomer.id);
        return newCustomer;
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = stageSearch.trim().toLowerCase();
        return customers
            .filter(c => !c.deleted_at && c.stage === selectedStage)
            .filter(c => !q
                || String(c.customer_name || '').toLowerCase().includes(q)
                || String(c.phone_number || '').includes(q)
                || String(c.consumer_no || '').toLowerCase().includes(q)
                || String(c.folder_no || '').toLowerCase().includes(q))
            .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    }, [customers, stageSearch, selectedStage]);

    const ctx = {
        user, metrics, meta, isChannelPartnerOffice, partnerName,
        channelPartnerFilter: scope.channelPartner, dealerFilter: scope.dealer,
        metricsFailed: Boolean(metricsError), canViewDeliveries, trashCount, setTrashCount, showAlert, channelPartners,
        onSelectCustomer: setSelectedCustomer, onCreateLead: handleAddLead, onViewLead: handleGlobalSelect,
        goHome, refreshMetrics: fetchMetrics, onRecover: handleRecover, onHardDelete: handleHardDelete,
    };

    const title = view ? view.title : stageLabel(selectedStage);
    const canAddLead = DASHBOARD_ROLES.includes(user?.userType);
    const hasMonthFilter = selectedStage === STAGE_IDS.LEADS || selectedStage === STAGE_IDS.REGISTRATION;
    const anyStageFilter = stageSearch || scope.channelPartner || scope.dealer || yearFilter || (hasMonthFilter && monthFilter);
    const View = view?.load;

    return (
        <div className="min-h-screen bg-[#FCFBFA] flex">
            <Sidebar
                user={user} ctx={ctx} currentView={currentView} selectedStage={selectedStage}
                stageCounts={metrics?.stageCounts || {}} open={sidebarOpen} onClose={closeSidebar}
                onOpenView={openView} onOpenStage={openStage} onLogout={onLogout} onChangePassword={onChangePassword}
            />

            <main className="sf-dashboard-main flex-1 min-w-0 md:ml-64 flex flex-col min-h-screen">
                <header className="sf-dashboard-header bg-white/90 backdrop-blur-md border-b border-stone-100 px-4 lg:px-6 sticky top-0 z-30">
                    <div className="sf-dashboard-title flex items-center gap-3">
                        <button type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="md:hidden flex h-11 w-11 items-center justify-center text-stone-500"><Menu className="w-6 h-6" /></button>
                        <h2 className="font-bold text-stone-800">{title}</h2>
                        {isCpo ? (
                            <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-sm border border-amber-200">
                                <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
                                Partner: {partnerName}
                            </span>
                        ) : scope.channelPartner ? (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Channel partner: {scope.channelPartner}</span>
                        ) : null}
                        {scope.dealer && <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full font-bold">Dealer: {scope.dealer}</span>}
                    </div>

                    {!view?.system && (
                        <div className="sf-dashboard-tools">
                            <GlobalSearch isCpo={isCpo} scope={scope} onSelect={handleGlobalSelect}
                                placeholder={isCpo ? `Search ${partnerName} leads…` : 'Search all stages…'} />
                            {currentView === 'stages' && (
                                <>
                                    <SearchInput className="sf-stage-filter" value={stageSearch} onChange={setStageSearch} label="Filter this stage" placeholder="Filter this stage…" />
                                    <YearSelect value={yearFilter} onChange={setYearFilter} label="Filter by year" />
                                    {hasMonthFilter && (
                                        <MonthSelect
                                            value={monthFilter} extraOptions={MONTH_SHORTCUTS}
                                            onChange={value => setMonthFilters(prev => ({ ...prev, [selectedStage]: value }))}
                                            label={selectedStage === STAGE_IDS.LEADS ? 'Filter leads by month added' : 'Filter by registration month'}
                                        />
                                    )}
                                </>
                            )}
                            {showPartnerFilter && <PartnerFilter partners={channelPartners} value={channelPartnerFilter} onApply={applyPartner} />}
                            {showDealerFilter && (
                                <Select
                                    value={dealerFilter} onChange={event => setDealerFilter(event.target.value)} options={dealerOptions}
                                    placeholder={isCpo ? 'My office + dealers' : 'All dealers'}
                                    aria-label={`Dealer under ${dealerParent}`} title={`Dealer under ${dealerParent}`} className="sm:w-44"
                                />
                            )}
                            {canOpenView('exports', user) && (
                                <button type="button" onClick={() => openView('exports')} aria-label="Open data exports" title="Open data exports"
                                    className="min-h-11 flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors cursor-pointer">
                                    <Download className="w-4 h-4" aria-hidden="true" />
                                    <span className="hidden sm:inline text-xs">Export</span>
                                </button>
                            )}
                            {canAddLead && (
                                <button type="button" aria-label="Add Lead" onClick={() => setShowAddLead(true)}
                                    className="min-h-11 flex items-center gap-1.5 bg-stone-900 text-white px-3 rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors">
                                    <Plus className="w-4 h-4" aria-hidden="true" />
                                    <span className="hidden sm:inline text-xs">Add Lead</span>
                                </button>
                            )}
                        </div>
                    )}
                </header>

                <div className="flex-1 p-4 lg:p-6">
                    <ErrorBanner className="mb-4" onRetry={isCpo ? undefined : fetchMetrics}>{metricsError}</ErrorBanner>

                    {currentView === 'stages' && (
                        <>
                            {STAGE_GUIDANCE[selectedStage] && (
                                <section aria-label="Stage guidance" className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 leading-relaxed">
                                    <p>{STAGE_GUIDANCE[selectedStage]}</p>
                                    {selectedStage !== STAGE_IDS.LEADS && <p className="mt-1 text-xs text-stone-500">Open a customer card to see the details for this stage.</p>}
                                </section>
                            )}
                            {loading && page === 0 ? <LoadingState label="Loading customers…" /> : filtered.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="sf-customer-grid">
                                        {filtered.map(c => <CustomerCard key={c.id} customer={c} onSelect={setSelectedCustomer} onMoveStage={handleMoveStage} currentUser={user} />)}
                                    </div>
                                    <LoadMoreButton onClick={loadMore} loading={loading} hasMore={hasMore} label="Load more customers" />
                                </div>
                            ) : (
                                <EmptyState icon={Users} title={anyStageFilter ? 'No matching customers in this stage' : 'No customers in this stage'}>
                                    {scope.dealer ? `No records for dealer "${scope.dealer}" here.`
                                        : hasMonthFilter && monthFilter ? 'No records in the selected month.'
                                            : scope.channelPartner ? `No customers with channel partner "${scope.channelPartner}" here.`
                                                : stageSearch ? 'Try the search box above to look across all stages.'
                                                    : 'Move customers here or add a new lead.'}
                                </EmptyState>
                            )}
                        </>
                    )}

                    {View && (
                        <LazyBoundary fallback={<LoadingState />}>
                            <View key={view.id} {...view.props(ctx)} />
                        </LazyBoundary>
                    )}
                </div>
            </main>

            {selectedCustomer && (
                <LazyBoundary fallback={null}>
                    <CustomerDetailModal
                        key={`${selectedCustomer.id}:${currentView}:${selectedStage}`}
                        customer={selectedCustomer}
                        onClose={() => setSelectedCustomer(null)}
                        onUpdate={handleUpdateCustomer}
                        onDelete={handleSoftDelete}
                        user={user}
                        meta={meta}
                        channel_partners={channelPartners}
                        defaultTab={view?.detailTab ?? (currentView === 'stages' ? selectedStage : undefined)}
                    />
                </LazyBoundary>
            )}
            {showAddLead && (
                <LazyBoundary fallback={null}>
                    <AddLeadModal isOpen onClose={() => setShowAddLead(false)} onSave={handleAddLead} meta={meta} channel_partners={channelPartners} user={user} />
                </LazyBoundary>
            )}
        </div>
    );
}
