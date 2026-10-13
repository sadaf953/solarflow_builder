import { useDemoTourNavigation } from '../demo/tour';
import { DATA_EXPORTS_ENABLED } from '../demo/config';
// ─── Dashboard.jsx ────────────────────────────────────────────────────────────
// Main admin layout: sidebar + header + view router.
// Features:
//   • Trash sidebar item + soft-delete/recover/hard-delete
//   • Global search across ALL stages (name, phone, consumer no) with results overlay
//   • Stage counts exclude deleted records
//   • Sales/Operations roles share the same shell, but see SalesView's card UI
//     for the "stages" view and lose Activity Log / User Management / Trash
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { supabase } from '../supabase';
import { logActivity, uploadDocument, parseIndianNumber, lazyWithRetry, sanitizeAdminUpdate, runWrite } from '../utils';
import { PRIMARY_STAGES, STAGE_IDS, CUSTOMER_CARD_COLUMNS, getCustomerCardColumns, ADMIN_NUMERIC_COLUMNS } from '../constants';
import DashboardView from './DashboardView';
import CustomerCard from './CustomerCard';

// Secondary views and modals with auto-retry on new deployments
const SubsidyView = lazyWithRetry(() => import('./SubsidyView'));
const LoanView = lazyWithRetry(() => import('./LoanView'));
const InstallationView = lazyWithRetry(() => import('./InstallationView'));
const CustomerDetailModal = lazyWithRetry(() => import('./CustomerDetailModal'));
const AddLeadModal = lazyWithRetry(() => import('./AddLeadModal'));
const ActivityLogView = lazyWithRetry(() => import('./ActivityLogView'));
const UserManagementView = lazyWithRetry(() => import('./UserManagementView'));
const TrashView = lazyWithRetry(() => import('./TrashView'));
const ChannelPartnerManagementView = lazyWithRetry(() => import('./ChannelPartnerManagementView'));
const InstallationPaymentsView = lazyWithRetry(() => import('./InstallationPaymentsView'));
const InventoryView = lazyWithRetry(() => import('../inventory/InventoryView'));
const DeliveryBatchesView = lazyWithRetry(() => import('./DeliveryBatchesView'));
const VendorCalendarView = lazyWithRetry(() => import('./VendorCalendarView'));
const AttendanceView = lazyWithRetry(() => import('./AttendanceView'));
const ToolboxView = lazyWithRetry(() => import('./ToolboxView'));
const DataExportView = lazyWithRetry(() => import('./DataExportView'));
import { useGlobalPopup } from './GlobalPopup';
import BrandMark from './BrandMark';
const QuotationModule = lazyWithRetry(() => import('../quotations/QuotationModule'));
const openQuotations = () => { window.location.hash = '/quotations'; };
import { quotationRepository } from '../quotations/client';
import { summarizeSolarEquipment } from '../dashboard/solarStats';

const ViewLoader = () => <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin" /></div>;

const SOLAR_EQUIPMENT_COLUMNS = 'id,module_brand,no_of_modules,inverter_make,system_capacity_kwp,stage';
const SOLAR_EQUIPMENT_PAGE_SIZE = 1000;

async function fetchSolarEquipmentStats(table, channelPartner, dealer) {
    const rows = [];
    let from = 0;
    while (true) {
        let query = supabase
            .from(table)
            .select(SOLAR_EQUIPMENT_COLUMNS)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(from, from + SOLAR_EQUIPMENT_PAGE_SIZE - 1);
        if (channelPartner) query = query.eq('channel_partner', channelPartner);
        if (dealer) query = query.eq('sub_channel_partner', dealer);
        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < SOLAR_EQUIPMENT_PAGE_SIZE) break;
        from += SOLAR_EQUIPMENT_PAGE_SIZE;
    }
    return summarizeSolarEquipment(rows);
}

const indiaDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function fetchTodaySummary(table, channelPartner, dealer, includeDeliveries) {
    const today = indiaDate();
    const scope = query => {
        if (channelPartner) query = query.eq('channel_partner', channelPartner);
        if (dealer) query = query.eq('sub_channel_partner', dealer);
        return query;
    };
    const count = async query => {
        const { count: value, error } = await query;
        if (error) throw error;
        return value || 0;
    };

    const [registeredToday, installedToday, installedLive] = await Promise.all([
        count(scope(supabase.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('registration_date', today))),
        count(scope(supabase.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('installation_date', today).in('installation_status', ['Installed', 'Yes']))),
        count(scope(supabase.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null).not('stage', 'in', '("COMPLETED","LOST PROJECT")').in('installation_status', ['Installed', 'Yes']))),
    ]);

    let deliveriesDueToday = 0;
    let deliveryProjectsToday = 0;
    if (includeDeliveries) {
        const { data: batches, error } = await supabase
            .from('delivery_batches')
            .select('id,project_ids')
            .eq('dispatch_date', today)
            .neq('status', 'DELIVERED');
        if (error) throw error;
        const projectIds = [...new Set((batches || []).flatMap(batch => batch.project_ids || []))];
        if (channelPartner || dealer) {
            if (projectIds.length) {
                const { data: scopedProjects, error: projectsError } = await scope(
                    supabase.from(table).select('id').is('deleted_at', null).in('id', projectIds)
                );
                if (projectsError) throw projectsError;
                const visibleIds = new Set((scopedProjects || []).map(row => row.id));
                deliveryProjectsToday = visibleIds.size;
                deliveriesDueToday = (batches || []).filter(batch => (batch.project_ids || []).some(id => visibleIds.has(id))).length;
            }
        } else {
            deliveriesDueToday = (batches || []).length;
            deliveryProjectsToday = projectIds.length;
        }
    }

    return { date: today, registeredToday, installedToday, installedLive, deliveriesDueToday, deliveryProjectsToday, canViewDeliveries: includeDeliveries };
}

const MONTH_OPTIONS = [
    ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
    ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
    ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December']
];

const getMonthBounds = (monthValue, timestamp = false) => {
    if (!/^\d{4}-\d{2}$/.test(monthValue || '')) return null;
    const [year, month] = monthValue.split('-').map(Number);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const next = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return timestamp
        ? { start: `${monthValue}-01T00:00:00+05:30`, end: `${next}T00:00:00+05:30` }
        : { start: `${monthValue}-01`, end: next };
};

import {
    LayoutDashboard, Activity, UserCog, Menu, X, ChevronDown,
    Search, Plus, Download, LogOut, Trash2, Users, Tag, IndianRupee, Wrench, CreditCard, Terminal, Truck, Calendar, UserCheck, Calculator, Package
} from 'lucide-react';

// ── NavBtn ────────────────────────────────────────────────────────────────────
const NavBtn = ({ view, stage, icon: Icon, label, count, redBadge, currentView, selectedStage, setCurrentView, setSelectedStage, setSidebarOpen }) => {
    const isActive = view === 'stages'
        ? (currentView === 'stages' && selectedStage === stage)
        : currentView === view;
    return (
        <button
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
                if (view === 'stages') { setCurrentView('stages'); setSelectedStage(stage); }
                else setCurrentView(view);
                if (setSidebarOpen) setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold mb-0.5 transition-colors cursor-pointer ${isActive ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
        >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate">{label}</span>
            {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center font-bold ${isActive ? 'bg-white/20 text-white' : redBadge ? 'bg-red-100 text-red-500' : 'bg-stone-100 text-stone-500'}`}>
                    {count}
                </span>
            )}
        </button>
    );
};

const STAGE_GUIDANCE = {
    LEADS: 'New enquiries start here. Open a customer card to review contact details and follow-up notes, or choose Add Lead.',
    REGISTRATION: 'Review the customer’s registration details and application progress.',
    LOAN: 'Follow the customer’s loan application and payment progress.',
    CASH: 'Track payments for customers funding their system without a loan.',
    'MATERIAL ORDER': 'Review the roof or shed requirements and order details before preparing materials.',
    'MATERIAL INTEGRATION': 'Prepare the bill of materials (BOM): the equipment and quantities needed for this installation.',
    'MATERIAL DELIVERY': 'Check which materials are ready for dispatch and which have reached the customer’s site.',
    'INSTALLATION STATUS': 'Follow installation progress and review the assigned team’s updates.',
    'GEO TAG PHOTO': 'Review site photos that include location information.',
    'DISCOM SUBMISSION': 'Track documents submitted to the electricity distribution company (DISCOM).',
    'METER INSTALLATION': 'Follow the electricity meter installation and record its details.',
    'DISCOM INSPECTION': 'Track the electricity company’s inspection and approval.',
    'SUBSIDY STATUS': 'Follow the subsidy application through to payment.',
    'FINAL REVIEW': 'Review the project’s details and outstanding work before marking it complete.',
    COMPLETED: 'Browse completed projects and their saved history.',
    'LOST PROJECT': 'Review projects that did not go ahead and the recorded reasons.',
};

const STAGE_GROUPS = [
    { label: 'Enquiry & finance', stages: ['LEADS', 'REGISTRATION', 'LOAN', 'CASH'] },
    { label: 'Materials & installation', stages: ['MATERIAL ORDER', 'MATERIAL INTEGRATION', 'MATERIAL DELIVERY', 'INSTALLATION STATUS', 'GEO TAG PHOTO'] },
    { label: 'Approvals & subsidy', stages: ['DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW'] },
    { label: 'Closed projects', stages: ['COMPLETED', 'LOST PROJECT'] },
];

function SidebarGroup({ label, activeKey, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen || !!activeKey);
    useEffect(() => { if (activeKey) setOpen(true); }, [activeKey]);
    const id = `nav-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    return <div className="pt-2">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg text-xs font-semibold text-left hover:bg-stone-100 ${activeKey ? 'text-[#ff8a00]' : 'text-stone-600'}`}>
            <span>{label}{!open && activeKey && <span className="ml-2 text-[#ff8a00]">•</span>}</span>
            <ChevronDown aria-hidden="true" className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <div id={id} hidden={!open} className="ml-2 pl-1 border-l border-stone-200">{children}</div>
    </div>;
}

export default function Dashboard({ user, onLogout, onOpenDevSwitcher, demoControls, onStartDemoTour }) {
    const [userMgmtAction, setUserMgmtAction] = useState(null);
    useDemoTourNavigation(async ({view,stage,action},isCurrent) => {
        if (!['dashboard','stages','quotations','inventory','delivery_batches','installation_payments','loan_tags','subsidy','activity','users','channel_partner_mgmt'].includes(view)) return;
        setSelectedCustomer(null); setShowAddLead(false); setSidebarOpen(false); setCurrentView(view);
        if (stage) setSelectedStage(stage);
        if (view === 'quotations') openQuotations();
        if (action === 'addLead') setShowAddLead(true);
        if (action === 'createUser') setUserMgmtAction('createUser');
        else setUserMgmtAction(null);
        if ((action === 'customer' || action === 'printBom') && stage) {
            let {data,error}=await supabase.from(isChannelPartnerOffice ? 'cpo_leads' : 'admin').select('*').is('deleted_at',null).eq('stage',stage).order('created_at').limit(1);
            if (!data?.length && action === 'printBom') {
                const fallback = await supabase.from(isChannelPartnerOffice ? 'cpo_leads' : 'admin').select('*').is('deleted_at',null).order('created_at').limit(1);
                data = fallback.data;
            }
            if(!isCurrent())return;
            if(error)showAlert(error.message,{type:'error'});
            else if(data?.[0])setSelectedCustomer(action === 'printBom' ? { ...data[0], _autoPrintBom: true } : data[0]);
        }
    },user.userType);

    const { showAlert } = useGlobalPopup();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Remember current view across page reloads
    const [currentView, setCurrentView] = useState(() => {
        if (typeof window !== 'undefined') {
            if (window.location.hash.startsWith('#/quotations')) return 'quotations';
            const saved = window.sessionStorage.getItem('solarflow_current_view');
            if (saved && !['quotations', 'pricing'].includes(saved)) return saved;
        }
        return 'dashboard';
    });

    // Remember selected stage across page reloads
    const [selectedStage, setSelectedStage] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = window.sessionStorage.getItem('solarflow_selected_stage');
            if (saved) return saved;
        }
        return STAGE_IDS.LEADS;
    });

    const [stageSearch, setStageSearch] = useState('');    // per-stage search
    const [channelPartnerFilterInput, setChannelPartnerFilterInput] = useState('');  // typed channel partner name (not yet applied)
    const [channelPartnerFilter, setChannelPartnerFilter] = useState('');    // applied channel partner filter
    const [dealerFilter, setDealerFilter] = useState('');
    const [dealerOptions, setDealerOptions] = useState([]);
    const [leadMonthFilter, setLeadMonthFilter] = useState('');
    const [registrationMonthFilter, setRegistrationMonthFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('all');
    const [showChannelPartnerDrop, setShowChannelPartnerDrop] = useState(false);
    const channelPartnerFilterRef = useRef(null);
    const sidebarRef = useRef(null);
    const [globalSearch, setGlobalSearch] = useState('');    // global search
    const [globalResults, setGlobalResults] = useState([]);
    const [showGlobalDrop, setShowGlobalDrop] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const navigationDialogRef = useRef(null);
    useEffect(() => {
        if (!sidebarOpen || window.matchMedia('(min-width: 768px)').matches) return;
        const panel = navigationDialogRef.current;
        const previousFocus = document.activeElement;
        const main = panel.parentElement.querySelector('main');
        main?.setAttribute('inert', '');
        const controls = () => [...panel.querySelectorAll('button, a[href], [tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
        controls()[0]?.focus();
        const onKeyDown = event => {
            if (event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false); }
            if (event.key !== 'Tab') return;
            const items = controls(), first = items[0], last = items.at(-1);
            if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        const onResize = () => { if (window.matchMedia('(min-width: 768px)').matches) setSidebarOpen(false); };
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onResize);
            main?.removeAttribute('inert');
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [sidebarOpen]);

    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddLead, setShowAddLead] = useState(false);
    const globalSearchRef = useRef(null);
    const [meta, setMeta] = useState({});

    // Synchronize navigation state to sessionStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem('solarflow_current_view', currentView);
            if (currentView !== 'quotations' && window.location.hash.startsWith('#/quotations')) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }, [currentView]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem('solarflow_selected_stage', selectedStage);
        }
    }, [selectedStage]);

    // Restore selected customer modal if page is reloaded
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (selectedCustomer?.id) {
                window.sessionStorage.setItem('solarflow_selected_customer_id', selectedCustomer.id);
            } else {
                window.sessionStorage.removeItem('solarflow_selected_customer_id');
            }
        }
    }, [selectedCustomer]);

    // On initial mount, restore previously opened customer modal if any
    useEffect(() => {
        const restoreOpenedCustomer = async () => {
            if (typeof window === 'undefined') return;
            const savedCustId = window.sessionStorage.getItem('solarflow_selected_customer_id');
            if (!savedCustId) return;

            try {
                const { data } = await supabase
                    .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                    .select('*')
                    .eq('id', savedCustId)
                    .single();
                if (data) {
                    setSelectedCustomer(data);
                }
            } catch { /* best-effort restore, ignore failure */ }
        };
        restoreOpenedCustomer();
    }, []);

    const PAGE_SIZE = 50;
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [metrics, setMetrics] = useState(() => {
        try {
            if (typeof window === 'undefined') return null;
            const cached = window.sessionStorage.getItem('solarflow_cached_metrics') || window.localStorage.getItem('solarflow_cached_metrics');
            return cached ? JSON.parse(cached) : null;
        } catch { return null; }
    });
    const [trashCount, setTrashCount] = useState(0);
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office' || user?.userType === 'office2';
    // Delivery Batches is a head-office function: Admin and Office only. Neither
    // the CPO nor the CP Manager (office2) under it gets access.
    const canSeeDeliveryBatches = user?.userType === 'admin' || user?.userType === 'sales';
    const partnerName = (user?.channel_partner || user?.name || ' ').trim();
    const [scopeError,setScopeError]=useState('');
    const effectivePartnerFilter = isChannelPartnerOffice ? partnerName : channelPartnerFilter.trim();

    useEffect(() => {
        let cancelled = false;
        setDealerFilter('');
        if (!effectivePartnerFilter) {
            setDealerOptions([]);
            return () => { cancelled = true; };
        }
        const loadDealers = async () => {
            const { data, error } = await supabase
                .from('demo_profiles')
                .select('name')
                .eq('user_type', 'agent2')
                .eq(isChannelPartnerOffice ? 'parent_profile_id' : 'channel_partner', isChannelPartnerOffice ? (user.cpo_profile_id || user.demo_profile_id) : effectivePartnerFilter)
                .eq('status', 'active')
                .order('name');
            if (!cancelled) {
                if (error) console.error('Dealer filter load failed:', error);
                setDealerOptions([...(new Set((data || []).map(row => row.name).filter(Boolean)))]);
            }
        };
        loadDealers();
        return () => { cancelled = true; };
    }, [effectivePartnerFilter]);

    // ── Data fetching ──────────────────────────────────────────────────────────
    // `skipMeta` lets the realtime path refresh only the numbers. The metadata
    // table is nearly static (dropdown lists), but it was refetched on EVERY
    // realtime event - so one person saving a customer meant 30 connected
    // clients each running 3 queries. Metadata is now fetched on mount and when
    // the branch filter changes, not on every write anywhere in the system.
    const fetchMetricsAndMeta = async (skipMeta = false) => {
        const targetPartner = isChannelPartnerOffice ? null : (channelPartnerFilter?.trim() || null);
        const solarEquipmentPromise = fetchSolarEquipmentStats(
            isChannelPartnerOffice ? 'cpo_leads' : 'admin',
            targetPartner,
            dealerFilter?.trim() || null
        ).catch(error => {
            console.warn('Solar equipment summary unavailable:', error.message);
            return null;
        });
        const todaySummaryPromise = fetchTodaySummary(
            isChannelPartnerOffice ? 'cpo_leads' : 'admin',
            targetPartner,
            dealerFilter?.trim() || null,
            canSeeDeliveryBatches
        ).catch(error => {
            console.warn('Today summary unavailable:', error.message);
            return null;
        });
        
        if (!skipMeta) {
            supabase.from('metadata').select('category, label').then(metaRes => {
                if (!metaRes.error && metaRes.data) {
                    const grouped = {};
                    metaRes.data.forEach(({ category, label }) => {
                        if (!grouped[category]) grouped[category] = [];
                        grouped[category].push(label);
                    });
                    setMeta(grouped);
                }
            }).catch(() => {});
        }

        supabase.from(isChannelPartnerOffice ? 'cpo_leads' : 'admin').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null).then(trashRes => {
            if (!trashRes.error && typeof trashRes.count === 'number') {
                setTrashCount(trashRes.count);
            }
        }).catch(() => {});

        if (canSeeDeliveryBatches) {
            supabase.from('delivery_batches').select('id', { count: 'exact', head: true }).neq('status', 'DELIVERED').then(batchesRes => {
                if (!batchesRes.error && typeof batchesRes.count === 'number') {
                    setMetrics(prev => prev ? { ...prev, deliveryBatchesCount: batchesRes.count } : prev);
                }
            }).catch(() => {});
        }

        let metricsRes = await supabase.rpc(isChannelPartnerOffice ? 'get_cpo_dashboard_metrics' : 'get_dashboard_metrics_scoped', {
            ...(!isChannelPartnerOffice ? {p_channel_partner:targetPartner} : {}),
            p_dealer: dealerFilter?.trim() || null
        });

        // Deployment-safe fallback: the UI may be published before the additive
        // dealer-aware RPC migration is run. Keep the existing counts visible
        // instead of replacing the entire sidebar with zeroes. Once the new RPC
        // exists, dealer-filtered metrics are used automatically.
        if (metricsRes.error && !isChannelPartnerOffice) {
            console.warn('Scoped metrics unavailable; using existing dashboard metrics:', metricsRes.error.message);
            metricsRes = await supabase.rpc('get_dashboard_metrics', {
                p_channel_partner: targetPartner
            });
        }

        setScopeError(isChannelPartnerOffice && metricsRes.error ? 'CPO ownership setup is required. Run 09_cpo_lead_scope.sql, then switch role again.' : '');
        let finalMetrics = {
            totalProjects: 0, completedCount: 0, liveProjects: 0, loanCount: 0, cashCount: 0, stageCounts: {}, deliveryBatchesCount: 0,
            installationTagCount: 0, subsidyTagCount: 0, loanTagCount: 0
        };

        if (!metricsRes.error && metricsRes.data) {
            const [solarEquipment, todaySummary] = await Promise.all([solarEquipmentPromise, todaySummaryPromise]);
            finalMetrics = { 
                ...finalMetrics,
                ...metricsRes.data,
                solarEquipment,
                todaySummary,
                loanTagCount: metricsRes.data.loanTagCount ?? metricsRes.data.loanCount ?? 0
            };
            setMetrics(prev => ({
                ...finalMetrics,
                deliveryBatchesCount: prev?.deliveryBatchesCount ?? finalMetrics.deliveryBatchesCount
            }));
            try {
                window.sessionStorage.setItem('solarflow_cached_metrics', JSON.stringify(finalMetrics));
                window.localStorage.setItem('solarflow_cached_metrics', JSON.stringify(finalMetrics));
            } catch { /* cached metrics are optional */ }
        } else {
            console.error('Metrics fetch error:', metricsRes.error);
        }
    };


    const fetchStageCustomers = async (stage = selectedStage, pageNum = 0) => {
        setLoading(true);
        const normalizedStage = (stage || STAGE_IDS.LEADS).toUpperCase();
        let query = supabase
            .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
            // Was select('*') - ~90 columns for 50 cards that render 10 fields.
            // CUSTOMER_CARD_COLUMNS already existed for this and was imported
            // but never used. The detail modal fetches the full row on open, so
            // nothing downstream loses data.
            .select(getCustomerCardColumns(isChannelPartnerOffice))
            // .eq not .ilike: normalizedStage is already uppercased above, and
            // all 3,828 stage values in the table are clean uppercase - so this
            // matches exactly the same rows. ILIKE cannot use an index and
            // forced a case-folding comparison over every row on each switch.
            .eq('stage', normalizedStage)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
            .range(pageNum * 50, (pageNum + 1) * 50 - 1);
            
        if (!isChannelPartnerOffice && channelPartnerFilter && channelPartnerFilter.trim()) {
            query = query.ilike('channel_partner', `%${channelPartnerFilter.trim()}%`);
        }

        if (dealerFilter) {
            query = query.ilike('sub_channel_partner', dealerFilter);
        }

        if (yearFilter !== 'all') {
            const isLeadStage = normalizedStage === STAGE_IDS.LEADS;
            if (isLeadStage) {
                query = query.gte('created_at', `${yearFilter}-01-01T00:00:00Z`).lt('created_at', `${Number(yearFilter) + 1}-01-01T00:00:00Z`);
            } else {
                query = query.gte('registration_date', `${yearFilter}-01-01`).lte('registration_date', `${yearFilter}-12-31`);
            }
        }

        const selectedStageMonth = normalizedStage === STAGE_IDS.LEADS
            ? leadMonthFilter
            : normalizedStage === STAGE_IDS.REGISTRATION
                ? registrationMonthFilter
                : '';
        if (selectedStageMonth) {
            const isLeadStage = normalizedStage === STAGE_IDS.LEADS;
            const now = new Date();
            const selectedMonth = selectedStageMonth === 'this-month'
                ? String(now.getMonth() + 1).padStart(2, '0')
                : selectedStageMonth;
            const yearVal = yearFilter !== 'all' ? yearFilter : now.getFullYear();
            const monthValue = `${yearVal}-${selectedMonth}`;
            const bounds = getMonthBounds(monthValue, isLeadStage);
            if (bounds) {
                const field = isLeadStage ? 'created_at' : 'registration_date';
                query = query.gte(field, bounds.start).lt(field, bounds.end);
            }
        }

        const { data, error } = await query;
        if (!error && data) {
            if (pageNum === 0) {
                setCustomers(data);
            } else {
                setCustomers(prev => {
                    // Prevent duplicate keys
                    const existingIds = new Set(prev.map(c => c.id));
                    const uniqueNew = data.filter(c => !existingIds.has(c.id));
                    return [...prev, ...uniqueNew];
                });
            }
            setHasMore(data.length === 50);
        } else {
            console.error("Error fetching stage customers:", error);
            if (pageNum === 0) setCustomers([]);
        }
        setLoading(false);
    };

    const loadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchStageCustomers(selectedStage, nextPage);
    };

    useEffect(() => {
        setPage(0);
        fetchMetricsAndMeta();
    }, [channelPartnerFilter, dealerFilter, leadMonthFilter, registrationMonthFilter, yearFilter, isChannelPartnerOffice, partnerName]);

    useEffect(() => {
        if (currentView === 'stages') {
            setPage(0);
            fetchStageCustomers(selectedStage, 0);
        }
    }, [currentView, selectedStage, channelPartnerFilter, dealerFilter, leadMonthFilter, registrationMonthFilter, yearFilter, isChannelPartnerOffice, partnerName]);

    // Refresh when the operator returns to the tab. This is what actually keeps
    // the grid current for most people - they switch away, come back, and see
    // fresh data - and it costs nothing while the tab is in the background,
    // unlike a live subscription that fires for every write in the system.
    // Throttled so rapid tab switching cannot hammer the database.
    const lastFocusFetch = useRef(0);
    useEffect(() => {
        const onFocus = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastFocusFetch.current < 10000) return;
            lastFocusFetch.current = Date.now();
            if (currentView === 'stages') {
                fetchStageCustomers(selectedStage, 0);
            }
            fetchMetricsAndMeta(true);
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [currentView, selectedStage, channelPartnerFilter, dealerFilter, leadMonthFilter, registrationMonthFilter, yearFilter, isChannelPartnerOffice, partnerName]);

    useEffect(() => {
        const channel = supabase.channel('admin_changes')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'admin'
            }, async (payload) => {
                if(isChannelPartnerOffice && payload.new?.id){
                    const {data:visible,error:scopeFailure}=await supabase.from('cpo_leads').select('id').eq('id',payload.new.id).maybeSingle();
                    if(scopeFailure || !visible){setCustomers(previous=>previous.filter(c=>c.id!==payload.new.id));scheduleMetricsRefresh();return;}
                }
                // Coalesced: this used to run a full-table aggregate RPC (plus two
                // more queries) on EVERY row change, for EVERY connected client.
                // One person saving a customer meant 30 clients x 3 queries. A
                // burst of edits now collapses into a single refresh.
                scheduleMetricsRefresh(); 
                
                // Realtime delivered every row change to every client and this
                // handler tested only `stage`. A CPO or Manager sitting on a
                // stage could therefore receive - and open - another branch's
                // customer. Every other portal re-tests ownership on the payload
                // (AgentPortal, VendorPortal, StampPortal); this one did not.
                const isVisibleToMe = (row) => {
                    if (!row) return false;
                    if (row.deleted_at) return false;
                    if (dealerFilter && String(row.sub_channel_partner || '').trim().toLowerCase()
                        !== String(dealerFilter).trim().toLowerCase()) return false;
                    if (user?.userType === 'admin' || user?.userType === 'sales') {
                        if (!channelPartnerFilter) return true;
                        return String(row.channel_partner || '').trim().toLowerCase()
                            === String(channelPartnerFilter).trim().toLowerCase();
                    }
                    if (isChannelPartnerOffice) {
                        return true; // Ownership was checked through cpo_leads above.
                    }
                    return false;
                };

                if (payload.eventType === 'INSERT') {
                    if (payload.new.stage === selectedStage && isVisibleToMe(payload.new)) {
                        setCustomers(prev => {
                            if (prev.some(c => c.id === payload.new.id)) return prev;
                            return [payload.new, ...prev];
                        });
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const isInStage = payload.new.stage === selectedStage && isVisibleToMe(payload.new);
                    setCustomers(prev => {
                        const exists = prev.some(c => c.id === payload.new.id);
                        if (exists && isInStage) {
                            return prev.map(c => c.id === payload.new.id ? payload.new : c);
                        } else if (exists && !isInStage) {
                            return prev.filter(c => c.id !== payload.new.id);
                        } else if (!exists && isInStage) {
                            return [payload.new, ...prev];
                        }
                        return prev;
                    });
                } else if (payload.eventType === 'DELETE') {
                    setCustomers(prev => prev.filter(c => c.id !== (payload.old?.id || payload.new?.id)));
                }
            })
            .subscribe();

        return () => {
            if (metricsRefreshTimer.current) clearTimeout(metricsRefreshTimer.current);
            supabase.removeChannel(channel);
        };
        // user identity is stable for a session, but it is now read inside the
        // handler (isVisibleToMe), so it belongs in the deps rather than being
        // captured in a stale closure.
    }, [selectedStage, user?.userType, isChannelPartnerOffice, partnerName, channelPartnerFilter, dealerFilter]);

    // Sync selectedCustomer state with fresh database values when updates occur
    useEffect(() => {
        if (selectedCustomer) {
            const fresh = customers.find(c => c.id === selectedCustomer.id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedCustomer)) {
                setSelectedCustomer(fresh);
            }
        }
    }, [customers]);

    // Close global search / poc dropdowns when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (globalSearchRef.current && !globalSearchRef.current.contains(e.target)) {
                setShowGlobalDrop(false);
            }
            if (channelPartnerFilterRef.current && !channelPartnerFilterRef.current.contains(e.target)) {
                setShowChannelPartnerDrop(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);


    // ── Global search: Server-side search across ALL non-deleted stages ─────
    useEffect(() => {
        const q = (globalSearch || '').trim();
        if (!q) { 
            setGlobalResults([]); 
            setShowGlobalDrop(false); 
            return; 
        }

        const fetchSearch = async () => {
            let query = supabase
                .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                .select('id, customer_name, phone_number, consumer_no, stage')
                // Was missing, unlike every other view. Trashed records were
                // returned by global search and opened FULLY EDITABLE, since
                // isFrozen keys off stage only, never deleted_at.
                .is('deleted_at', null)
                
;
                
            let orString = `customer_name.ilike.%${q}%`;
            if (!isNaN(q) && q.length > 0) {
                // If the user types a number, search it exactly in the numeric columns
                orString += `,phone_number.eq.${q},consumer_no.eq.${q}`;
            }
            query = query.or(orString);
                query = query.limit(8);
                
            if (!isChannelPartnerOffice && channelPartnerFilter) {
                query = query.ilike('channel_partner', `%${channelPartnerFilter.trim()}%`);
            }
            if (dealerFilter) query = query.ilike('sub_channel_partner', dealerFilter);

            const { data, error } = await query;
            if (error) console.error("Search error:", error);
            setGlobalResults(data || []);
            setShowGlobalDrop((data || []).length > 0);
        };

        const timer = setTimeout(fetchSearch, 300); // 300ms debounce
        return () => clearTimeout(timer);
    }, [globalSearch, channelPartnerFilter, dealerFilter, isChannelPartnerOffice, partnerName]);

    const handleGlobalSelect = (customer) => {
        // Navigate to the customer's stage so context is clear
        setCurrentView('stages');
        setSelectedStage(customer.stage || 'Leads');
        setStageSearch('');
        // Open the detail modal
        setSelectedCustomer(customer);
        setGlobalSearch('');
        setShowGlobalDrop(false);
    };

    // ── CRUD ──────────────────────────────────────────────────────────────────
    const syncMetadata = async (data) => {
        try {
            if (data.channel_partner) {
                const partner = data.channel_partner.trim();
                if (partner) {
                    const { data: existing } = await supabase
                        .from('metadata')
                        .select('id, label')
                        .eq('category', 'channel_partner');
                    const normalizedPartner = partner.toLocaleLowerCase();
                    const alreadyListed = (existing || []).some(row =>
                        String(row?.label || '').trim().toLocaleLowerCase() === normalizedPartner
                    );
                    if (!alreadyListed) {
                        // Non-blocking: the lead itself is already saved; this only
                        // seeds the dropdown for next time.
                        const { error: metaErr } = await supabase
                            .from('metadata')
                            .insert({ category: 'channel_partner', label: partner });
                        if (metaErr) console.warn('Could not add "%s" to the channel_partner list:', partner, metaErr.message);
                    }
                }
            }
            if (data.module_brand) {
                const brand = data.module_brand.trim();
                if (brand) {
                    const { data: existing } = await supabase
                        .from('metadata')
                        .select('id')
                        .eq('category', 'module_brand')
                        .eq('label', brand);
                    if (!existing || existing.length === 0) {
                        // Non-blocking: the lead itself is already saved; this only
                        // seeds the dropdown for next time.
                        const { error: metaErr } = await supabase
                            .from('metadata')
                            .insert({ category: 'module_brand', label: brand });
                        if (metaErr) console.warn('Could not add "%s" to the module_brand list:', brand, metaErr.message);
                    }
                }
            }
        } catch (e) {
            console.error('Metadata sync background error:', e);
        }
    };

    const handleUpdateCustomer = async (id, updates) => {
        // Whitelist against the real schema. This replaced a hand-maintained
        // list of deletes, which is what let `file_status` slip through and
        // fail every save on the record (PostgREST rejects the WHOLE update
        // when one key is not a column).
        const cleanUpdates = sanitizeAdminUpdate(updates);

        // These ARE real columns, but must never be written from the client.
        delete cleanUpdates.id;
        delete cleanUpdates.created_at;
        delete cleanUpdates.updated_at;
        
        // Clean numeric fields
        // Date columns reject '' exactly as numeric columns do. AgentPortal has
        // had this guard since forever; this path never got it, so clearing any
        // date (Registration Date, Delivery Date, Installation Date...) made
        // Postgres reject the WHOLE update and every other edit in that save
        // was lost with "Your changes were not saved".
        Object.keys(cleanUpdates).forEach(key => {
            if ((key === 'date' || key.endsWith('_date')) && cleanUpdates[key] === '') {
                cleanUpdates[key] = null;
            }
        });

        for (const field of ADMIN_NUMERIC_COLUMNS) {
            if (cleanUpdates[field] !== undefined) {
                if (cleanUpdates[field] === '' || cleanUpdates[field] === null) {
                    cleanUpdates[field] = null;
                } else {
                    // parseIndianNumber returns '' for unparseable input, NOT NaN,
                    // so isNaN() was always false and '' reached the numeric column.
                    const parsed = parseIndianNumber(cleanUpdates[field]);
                    cleanUpdates[field] = (parsed === '' || Number.isNaN(parsed)) ? null : parsed;
                }
            }
        }

        // Clean history arrays if present
        if (Array.isArray(cleanUpdates.loan_history)) {
            cleanUpdates.loan_history = cleanUpdates.loan_history.map(({ isNew, ...item }) => item);
        }
        if (Array.isArray(cleanUpdates.subsidy_history)) {
            cleanUpdates.subsidy_history = cleanUpdates.subsidy_history.map(({ isNew, ...item }) => item);
        }

        // 1. Optimistic UI Update (instant feedback)
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...cleanUpdates } : c));
        if (selectedCustomer?.id === id) {
            setSelectedCustomer(prev => ({ ...prev, ...cleanUpdates }));
        }


        // Every key was stripped (nothing changed, or nothing was a real column).
        // update({}) is rejected by PostgREST, which the caller then reported as
        // "The database did not accept the changes".
        if (Object.keys(cleanUpdates).length === 0) {
            console.warn('handleUpdateCustomer: nothing to write after sanitising; skipping the update.');
            return true;
        }

        // 2. Background Database Save
        try {
            // .select('id') so we can tell "saved" from "matched no rows".
            // An RLS-filtered UPDATE returns error: null with 0 rows changed, so
            // "no error" was NOT proof of a save - the user saw success and the
            // data was never written.
            const { data: changed, error } = await supabase
                .from('admin').update(cleanUpdates).eq('id', id).select('id');

            if (!error && changed && changed.length > 0) {
                syncMetadata(cleanUpdates);
                return true;
            } else if (!error) {
                // Check if the rejection was due to an expired/invalid auth session
                const { data: authData, error: authErr } = await supabase.auth.getUser();
                if (authErr || !authData?.user) {
                    console.error('Update refused because session expired.');
                    showAlert('Your session has expired. Please log in again to continue.', { type: 'error' });
                    onLogout?.();
                    return false;
                }

                console.error('Update matched no rows for id', id, '- refused by RLS, or the record no longer exists.');
                showAlert(
                    'Your changes were not saved: the database did not accept the update. '
                    + 'This usually means your account does not have permission to edit this record, '
                    + 'or it has been deleted. Please refresh and check before editing again.',
                    { type: 'error' }
                );
                const previousCustomer = customers.find(c => c.id === id);
                if (previousCustomer) {
                    setCustomers(prev => prev.map(c => c.id === id ? previousCustomer : c));
                    if (selectedCustomer?.id === id) setSelectedCustomer(previousCustomer);
                }
                return false;
            } else {
                console.error('Error updating customer in DB:', error);
                // Check if the error is an auth/JWT expiration error
                if (error.code === 'PGRST301' || error.message?.toLowerCase().includes('jwt') || error.message?.toLowerCase().includes('token') || error.message?.toLowerCase().includes('auth')) {
                    showAlert('Your session has expired. Please log in again.', { type: 'error' });
                    onLogout?.();
                    return false;
                }
                showAlert('Database Save Error: ' + (error.message || 'Unknown database error'), { type: 'error' });
                
                // Rollback on failure
                const previousCustomer = customers.find(c => c.id === id);
                if (previousCustomer) {
                    setCustomers(prev => prev.map(c => c.id === id ? previousCustomer : c));
                    if (selectedCustomer?.id === id) setSelectedCustomer(previousCustomer);
                }
                return false;
            }
        } catch (err) {
            console.error('Exception updating customer:', err);
            showAlert('Database Connection Error: ' + err.message, { type: 'error' });
            return false;
        }
    };

    // Soft-delete: sets deleted_at, never removes from DB
    const handleSoftDelete = async (id, deletedAt) => {
        const ts = deletedAt || new Date().toISOString();
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, deleted_at: ts } : c));
        setSelectedCustomer(null);

        // Checked for zero rows, not just for an error: an RLS-refused UPDATE
        // returns error: null having changed nothing, so the row vanished from
        // the list optimistically and came back on the next refresh.
        const res = await runWrite(
            supabase.from('admin').update({ deleted_at: ts }).eq('id', id).select('id'),
            { action: 'move to Trash' }
        );
        if (!res.ok) {
            setCustomers(prev => prev.map(c => c.id === id ? { ...c, deleted_at: null } : c));
            showAlert('The customer was not moved to Trash: ' + res.error.message, { type: 'error' });
        } else {
            setTrashCount(c => c + 1);
        }
    };

    // Recover from trash
    const handleRecover = async (id) => {
        const res = await runWrite(
            supabase.from('admin').update({ deleted_at: null }).eq('id', id).select('id'),
            { action: 'recovery' }
        );
        if (!res.ok) {
            showAlert('The customer could not be recovered: ' + res.error.message, { type: 'error' });
            return;
        }
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, deleted_at: null } : c));
        setTrashCount(c => Math.max(0, c - 1));
        logActivity(
            user.id,
            'update',
            `Recovered customer from trash`,
            '',
            id
        );
    };

    // Hard-delete: permanent, admin only
    const handleHardDelete = async (id) => {
        const c = customers.find(x => x.id === id);

        // The delete runs FIRST and its row count is checked. This used to write
        // "Permanently deleted" to the activity log before attempting the
        // delete, and the delete itself was unchecked - so a refused delete left
        // the record live in the database with an audit entry swearing it was
        // gone, and the card removed from the list.
        const res = await runWrite(
            supabase.from('admin').delete().eq('id', id).select('id'),
            { action: 'permanent deletion' }
        );
        if (!res.ok) {
            showAlert('The customer was NOT permanently deleted: ' + res.error.message, { type: 'error' });
            return;
        }
        setTrashCount(c => Math.max(0, c - 1));

        // customer_id must be NULL here. activity_log has an FK to admin.id
        // (fk_activity_log_customer, verified 2026-09-01), and the row is now
        // gone - passing the id makes the insert fail, and logActivity swallows
        // its own errors, so the deletion would be recorded NOWHERE. The id and
        // name go in the message instead, so the audit trail survives.
        await logActivity(
            user.id,
            'delete',
            `Permanently deleted: ${c?.customer_name || 'unnamed customer'} (id ${id})`,
            '',
            null
        );
        setCustomers(prev => prev.filter(c => c.id !== id));
    };

    const handleMoveStage = async (id, newStage) => {
        const customer = customers.find(c => c.id === id);
        if (!customer) return;
        const oldStage = customer.stage;

        // The customer-card stage picker wrote the new stage straight to the
        // database with no checks, so a lead could be pushed to Registration
        // with a blank Phone Number. The modal's "Move to next stage" button
        // has always enforced this list (getMissingStageRequirements in
        // CustomerDetailModal); this is the same list on the card path.
        // Backward moves and Lost Project stay unblocked.
        const movingForwardFromLeads =
            oldStage === STAGE_IDS.LEADS &&
            newStage !== STAGE_IDS.LEADS &&
            newStage !== STAGE_IDS.LOST_PROJECT;

        if (movingForwardFromLeads) {
            const missing = [];
            const need = (condition, label) => { if (!condition) missing.push(label); };
            need(customer.customer_name?.trim(), 'Customer Name');
            need(customer.phone_number?.toString().trim(), 'Phone Number');
            need(customer.consumer_no?.toString().trim(), 'Consumer Number');
            need(customer.villages?.trim(), 'Village / Address');
            need(customer.channel_partner?.trim(), 'Channel Partner Name');
            need(customer.module_brand?.trim(), 'Module Brand');
            need(customer.module_wp?.toString().trim(), 'Module WP');
            need(customer.no_of_modules?.toString().trim(), 'Number of Modules');
            need(customer.system_capacity_kwp, 'System Capacity');
            need(customer.sub_divisions?.trim(), 'Sub Division');
            need(customer.district?.trim(), 'District');
            need(customer.payment_type?.trim(), 'Payment Type');

            if (missing.length > 0) {
                showAlert(
                    `This lead is not ready to move to ${newStage}. Please complete:\n\n• ${missing.join('\n• ')}\n\nOpen the customer to fill these in.`,
                    { title: 'Lead details incomplete', type: 'warning' }
                );
                return;
            }
        }

        // Extract old remark before clearing it from the JSON mapping
        const oldRemark = (typeof customer.stages_remarks === 'object' && customer.stages_remarks ? customer.stages_remarks[oldStage] : '') || '';

        const prevObj = typeof customer.stages_remarks === 'object' && customer.stages_remarks ? customer.stages_remarks : {};
        const optimisticUpdates = {
            stage: newStage,
            stages_remarks: { ...prevObj, [oldStage]: '' }
        };

        // 1. Optimistic Update (UI)
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...optimisticUpdates } : c));
        if (selectedCustomer?.id === id) setSelectedCustomer(prev => ({ ...prev, ...optimisticUpdates }));


        // 2. Call Atomic RPC to append remarks safely on the server
        const { data: updatedRecord, error } = await supabase.rpc('move_stage', {
            p_customer_id: id,
            p_new_stage: newStage,
            p_old_stage: oldStage,
            p_remark: oldRemark
        });

        if (error) {
            console.error('Error moving stage:', error);
            showAlert('Error moving stage: ' + error.message, { type: 'error' });
            // Rollback on failure by reloading this stage
            fetchStageCustomers(selectedStage, page);
            return;
        }

        // Apply server returned state which includes exact formatted timestamp
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updatedRecord } : c));
        if (selectedCustomer?.id === id) setSelectedCustomer(prev => ({ ...prev, ...updatedRecord }));

        // Update the JSON column to clear the old remark (since RPC only did stage & internal_remarks)
        // Non-blocking: the stage move already succeeded via the RPC above, so a
        // failure here only leaves the previous stage's remark behind. Warn
        // rather than throw, but do not let it fail invisibly.
        const followUp = { stages_remarks: optimisticUpdates.stages_remarks };

        // Moving to Lost Project must record WHERE it was lost from. The RPC
        // writes only `stage` and `internal_remarks`, so a record dragged here
        // from the card arrived with no hold_procurement at all - and
        // HoldProcurementTab then falls back to 'LEADS', so Resume offered to
        // send a project lost at Subsidy Status back to Leads.
        if (newStage === STAGE_IDS.LOST_PROJECT) {
            let existing = {};
            const raw = customer.hold_procurement;
            if (raw) {
                try {
                    existing = typeof raw === 'string' ? (JSON.parse(raw) || {}) : (raw || {});
                } catch { existing = {}; }
            }
            followUp.hold_procurement = {
                ...existing,
                previous_stage: oldStage,
                hold_date: new Date().toISOString().split('T')[0],
            };
        }

        const followUpRes = await runWrite(
            supabase.from('admin').update(followUp).eq('id', id).select('id'),
            { action: 'follow-up write' }
        );
        if (followUpRes.ok) {
            // The follow-up columns have to reach local state as well. Writing
            // them only to Postgres left an open modal reading a stale/null
            // hold_procurement, so HoldProcurementTab still fell back to LEADS -
            // the exact bug this block exists to prevent. Realtime does not
            // cover it: the update handler drops the row from `customers`
            // because it is no longer in the selected stage, and never touches
            // selectedCustomer.
            setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...followUp } : c));
            if (selectedCustomer?.id === id) setSelectedCustomer(prev => ({ ...prev, ...followUp }));
        } else {
            if (followUp.hold_procurement) {
                // This one is not cosmetic: without hold_procurement the Resume
                // button defaults to LEADS and would send the project back to
                // the wrong stage. Say so rather than warning to the console.
                showAlert(
                    `The customer was moved to Lost Project, but the origin stage (${oldStage}) could not be recorded. `
                    + 'Open the Lost Project tab and set "Origin Stage" manually, or Resume will send them back to Leads.',
                    { type: 'error' }
                );
            } else {
                console.warn('Stage moved, but clearing the old stage remark failed:', followUpRes.error.message);
            }
        }

        await logActivity(
            user.id,
            'stage_change',
            `${customer.customer_name}: Stage changed`,
            `Stage: ${oldStage || 'Empty'} → ${newStage || 'Empty'}`,
            id
        );
    };

    // Collapses a burst of realtime events into one metrics refresh.
    const metricsRefreshTimer = useRef(null);
    const lastMetricsAt = useRef(0);
    const scheduleMetricsRefresh = () => {
        if (metricsRefreshTimer.current) return; // already queued - do not reset the timer
        // Under load this fired for every write from every client. The window is
        // wider now, it does NOT restart on each event (so a steady stream of
        // edits still refreshes on a fixed cadence rather than never), and it
        // skips the metadata query entirely.
        const sinceLast = Date.now() - lastMetricsAt.current;
        const wait = Math.max(8000, 15000 - sinceLast);
        metricsRefreshTimer.current = setTimeout(() => {
            metricsRefreshTimer.current = null;
            lastMetricsAt.current = Date.now();
            fetchMetricsAndMeta(true);
        }, wait);
    };

    const handleAddLead = async (data, attachedFiles = [], quotation = null) => {
        const leadData = {
            ...data,
            lead_creator_profile_id: data.lead_creator_profile_id || user?.demo_profile_id || user?.id || null,
            application_done_by: user?.name || 'Admin',
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


        // Conversion preserves the quotation and inserts one linked lead.
        const { data: newCustomer, error } = quotation
            ? await quotationRepository.insertConversionLead(quotation, insertData, user)
            : await supabase.from('admin').insert(insertData).select().single();
        if (error) {
            console.error("Error adding lead to Supabase:", error);
            showAlert(`Failed to add lead: ${error.message} (Code: ${error.code})`, { type: 'error' });
            throw error;
        } else {
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
                    showAlert(
                        `The lead was saved, but ${failedUploads.length} document(s) did NOT upload: `
                        + failedUploads.join(', ')
                        + '. Open the customer and attach them again.',
                        { type: 'error' }
                    );
                }
            }

            setCustomers(prev => prev.some(c => c.id === newCustomer.id) ? prev : [newCustomer, ...prev]);
            setShowAddLead(false);
            syncMetadata(insertData);

            void logActivity(user.id, 'create', `Added new lead: ${data.customer_name}`, `Done by: ${user.name}`, newCustomer.id);
            return newCustomer;
        }
    };

    // ── Derived data (active = non-deleted only) ───────────────────────────────
    const { active, trashed } = useMemo(() => {
        const nextActive = [];
        const nextTrashed = [];
        customers.forEach(customer => (customer?.deleted_at ? nextTrashed : nextActive).push(customer));
        return { active: nextActive, trashed: nextTrashed };
    }, [customers]);
    const isAuthorized = (c) => {
        if (user?.userType === 'admin' || user?.userType === 'sales') return true;
        if (isChannelPartnerOffice) return true; // Rows arrive through the ownership-scoped view.
        if (user?.userType === 'agent') {
            const myPartner = partnerName.toLowerCase();
            return (c?.channel_partner || '').trim().toLowerCase() === myPartner;
        }
        return false;
    };

    // Distinct Channel Partner names from metadata table for dropdowns and top filter suggestions
    const uniqueChannelPartners = [...(meta['channel_partner'] || []).reduce((byName, rawLabel) => {
        const label = String(rawLabel || '').trim();
        const key = label.toLocaleLowerCase();
        if (!key) return byName;
        const current = byName.get(key);
        const labelIsUppercase = label === label.toLocaleUpperCase();
        const currentIsUppercase = current === String(current || '').toLocaleUpperCase();
        if (!current || (labelIsUppercase && !currentIsUppercase)) byName.set(key, label);
        return byName;
    }, new Map()).values()].sort((a, b) => a.localeCompare(b));
    const channelPartnerSuggestions = channelPartnerFilterInput.trim()
        ? uniqueChannelPartners.filter(p => (p || '').toLowerCase().includes(channelPartnerFilterInput.trim().toLowerCase()))
        : uniqueChannelPartners;

    const matchesChannelPartnerFilter = (c) => {
        if (isChannelPartnerOffice) {
            return true; // CPO rows are already ownership-scoped.
        }
        return !channelPartnerFilter || (c?.channel_partner || '').toLowerCase() === channelPartnerFilter.toLowerCase();
    };

    // Everything downstream - stage counts, the stages grid, dashboard stats
    // is built from this one channel partner-scoped list
    // Sidebar counts now come straight from the server metrics to avoid downloading all records
    const subsidyTagCount = metrics?.subsidyTagCount || 0;
    const loanTagCount = metrics?.loanTagCount || 0;
    const deliveryBatchesCount = metrics?.deliveryBatchesCount || 0;
    const installationTagCount = metrics?.installationTagCount || 0;
    const stageCounts = useMemo(() => {
        const raw = metrics?.stageCounts || {};
        const normalized = { ...raw };
        // The HOLD PROCUREMENT aliases are gone: the metrics function returns
        // the 'LOST PROJECT' literal and no row in `admin` carries the old
        // value. Keeping them was actively harmful - a row still stored as
        // HOLD PROCUREMENT was COUNTED here but never LISTED, because
        // fetchStageCustomers does a plain .eq('stage', ...) with no aliasing.
        if (!normalized[STAGE_IDS.LOST_PROJECT]) {
            normalized[STAGE_IDS.LOST_PROJECT] = normalized['Lost Project'] || 0;
        }
        return normalized;
    }, [metrics?.stageCounts]);

    // Per-stage filtered cards (server already filtered by stage and channel partner)
    // We apply local search bar filter here and guarantee newest/most recent order
    const filtered = useMemo(() => {
        const list = customers.filter(c => {
            if (c.deleted_at) return false;
            const q = (stageSearch || '').toLowerCase();
            return !stageSearch ||
                String(c?.customer_name || '').toLowerCase().includes(q) ||
                String(c?.phone_number || '').includes(stageSearch) ||
                String(c?.consumer_no || '').toLowerCase().includes(q) ||
                String(c?.folder_no || '').toLowerCase().includes(q);
        });
        return list.sort((a, b) => {
            const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
            const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
            return timeB - timeA;
        });
    }, [customers, stageSearch]);

    // ── Nav button helper ─────────────────────────────────────────────────────
    
    const isSystemView = [
        'attendance',
        'channel_partner_mgmt',
        'vendor_availability',
        'installation_payments',
        'activity',
        'users',
        'trash'
    ].includes(currentView);

    const headerTitle =
        currentView === 'toolbox' ? 'Solar Toolbox' :
        currentView === 'inventory' ? 'Inventory' :
        currentView === 'dashboard' ? 'Business Dashboard'
            : currentView === 'quotations' ? 'Quotation Maker'
            : currentView === 'delivery_batches' ? 'Material Delivery Batches'
            : currentView === 'subsidy' ? 'Subsidy tracking'
                : currentView === 'loan_tags' ? 'Loan tracking'
                : currentView === 'installation_tags' ? 'Installation tracking'
                : currentView === 'attendance' ? 'Staff Attendance & Leave'
                : currentView === 'exports' ? 'Data Exports'
                : currentView === 'channel_partner_mgmt' ? 'Operations'
                    : currentView === 'installation_payments' ? 'Installation Payments'
                    : currentView === 'vendor_availability' ? 'Vendor Availability & Schedule'
                    : currentView === 'activity' ? 'Activity Log'
                        : currentView === 'users' ? 'User Management'
                            : currentView === 'trash' ? 'Trash'
                            : PRIMARY_STAGES.find(s => s.id === selectedStage)?.label || selectedStage;

    return (
        <div className="min-h-screen bg-[#FCFBFA] flex">
            {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

            {/* ── Sidebar ── */}
            <aside ref={navigationDialogRef} role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen || undefined} aria-label="Main navigation" className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-stone-100 flex flex-col h-screen max-h-screen overflow-hidden transform transition-transform duration-300 ${sidebarOpen ? 'flex' : 'hidden'} md:flex`}>
                <div className="p-5 border-b border-stone-100 flex justify-between items-center shrink-0">
                    <BrandMark size="md" />
                    <button aria-label="Close navigation" className="md:hidden text-stone-400" onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></button>
                </div>

                <div 
                    ref={sidebarRef} 
                    className="flex-1 overflow-y-auto p-3 space-y-0.5"
                    style={{ minHeight: 0, maxHeight: 'calc(100vh - 150px)', WebkitOverflowScrolling: 'touch' }}
                >
                    <NavBtn view="dashboard" icon={LayoutDashboard} label="Dashboard" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                    {['admin', 'sales'].includes(user.userType) && <button onClick={() => { openQuotations(); setCurrentView('quotations'); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold mb-0.5 transition-colors cursor-pointer ${currentView === 'quotations' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}><Tag className="w-4 h-4 flex-shrink-0" /> Quotation Maker</button>}
                    <button
                        onClick={() => { setCurrentView('toolbox'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold mb-1 transition-all cursor-pointer ${
                            currentView === 'toolbox'
                                ? 'bg-[#ff8a00] text-stone-950 font-bold shadow-sm'
                                : 'text-stone-800 bg-[#fff8ed] hover:bg-[#fff0d9] border border-[#ffdcad]'
                        }`}
                    >
                        <Calculator className={`w-4 h-4 flex-shrink-0 ${currentView === 'toolbox' ? 'text-stone-950' : 'text-[#ff8a00]'}`} />
                        <span className="flex-1 text-left font-bold">Solar Toolbox</span>
                        <span className="text-[10px] bg-[#fff0d9] text-stone-800 px-1.5 py-0.5 rounded-md font-bold">8 Tools</span>
                    </button>

                    {/* Tracking & logistics directly after Quotation Maker & Toolbox */}
                    <SidebarGroup label="Tracking & logistics" defaultOpen={false} activeKey={['delivery_batches', 'inventory', 'subsidy', 'loan_tags', 'installation_tags'].includes(currentView) ? currentView : null}>
                        {canSeeDeliveryBatches && (
                            <NavBtn view="delivery_batches" icon={Truck} label="Delivery Batches" count={deliveryBatchesCount} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        )}
                        {['admin', 'sales'].includes(user.userType) && (
                            <NavBtn view="inventory" icon={Package} label="Inventory" currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        )}
                        <NavBtn view="subsidy" icon={Tag} label="Subsidy tracking" count={subsidyTagCount} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        <NavBtn view="loan_tags" icon={IndianRupee} label="Loan tracking" count={loanTagCount} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        <NavBtn view="installation_tags" icon={Wrench} label="Installation tracking" count={installationTagCount} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                    </SidebarGroup>

                    <p className="px-3 pt-4 pb-1 text-[10px] uppercase font-bold text-stone-500 tracking-widest">Project workflow</p>
                    {STAGE_GROUPS.map(group => <SidebarGroup key={group.label} label={group.label} defaultOpen={false}
                        activeKey={currentView === 'stages' && group.stages.includes(selectedStage) ? selectedStage : null}>
                        {PRIMARY_STAGES.filter(stage => group.stages.includes(stage.id)).map(s => (
                            <NavBtn key={s.id} view="stages" stage={s.id} icon={s.icon} label={s.label} count={stageCounts[s.id] || 0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        ))}
                    </SidebarGroup>)}

                    {/* Systems - sensitive & only visible to admin */}
                    {user.userType === 'admin' && (
                        <div className="pt-2">
                            <p className="px-3 pt-3 pb-1 text-[10px] uppercase font-bold text-stone-500 tracking-widest">Systems</p>
                            <SidebarGroup label="Team & administration" defaultOpen={false} activeKey={['attendance', 'channel_partner_mgmt', 'vendor_availability', 'installation_payments'].includes(currentView) ? currentView : null}>
                                <NavBtn view="attendance" icon={UserCheck} label="Staff Attendance & Leave" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                                <NavBtn view="channel_partner_mgmt" icon={Users} label="Operations" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                                <NavBtn view="vendor_availability" icon={Calendar} label="Vendor Availability" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                                <NavBtn view="installation_payments" icon={CreditCard} label="Installation Payments" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                            </SidebarGroup>
                            <NavBtn view="activity" icon={Activity} label="Activity Log" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                            <NavBtn view="users" icon={UserCog} label="User Management" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                            {DATA_EXPORTS_ENABLED && <NavBtn view="exports" icon={Download} label="Data Exports" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />}
                            <NavBtn view="trash" icon={Trash2} label="Trash" count={trashCount} redBadge currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        </div>
                    )}

                    {/* Non-admin staff self-service */}
                    {user.userType !== 'admin' && (
                        <div className="pt-2">
                            <p className="px-3 pt-3 pb-1 text-[10px] uppercase font-bold text-stone-500 tracking-widest">Self Service</p>
                            <NavBtn view="attendance" icon={UserCheck} label="Attendance & Leave" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        </div>
                    )}

                    {/* Partner Office - main CPO account only */}
                    {user.userType === 'channel_partner_office' && (
                        <>
                            <div className="text-[9px] uppercase font-bold text-stone-300 px-3 pt-5 pb-2 tracking-widest">Partner Office</div>
                            <NavBtn view="users" icon={UserCog} label="User Management" count={0} currentView={currentView} selectedStage={selectedStage} setCurrentView={setCurrentView} setSelectedStage={setSelectedStage} setSidebarOpen={setSidebarOpen} />
                        </>
                    )}
                </div>

                {/* User + Logout */}
                <div className="p-3 border-t border-stone-100 shrink-0 bg-white">
                    <div className="flex items-center gap-3 px-3 py-2 mb-1">
                        <div className="w-8 h-8 bg-stone-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {user.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'A'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-stone-700 truncate">{user.name}</p>
                            <p className="text-[9px] text-stone-400">{user.role}</p>
                        </div>
                    </div>
                    {import.meta.env.DEV && onOpenDevSwitcher && (
                        <button onClick={onOpenDevSwitcher}
                            className="w-full flex items-center gap-2 px-3 py-2 text-stone-800 bg-[#fff8ed] hover:bg-[#fff0d9] rounded-xl text-xs font-bold transition-colors mb-1.5 cursor-pointer border border-[#ffdcad]">
                            <Terminal className="w-4 h-4 text-[#ff8a00]" /> Backdoor Terminal & Roles
                        </button>
                    )}
                    <button onClick={onLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer">
                        <LogOut className="w-4 h-4" /> Logout
                    </button>
                </div>
            </aside>

            {/* ── Main ── */}
            <main className="demo-dashboard-main flex-1 min-w-0 md:ml-64 flex flex-col min-h-screen">
                {/* Header */}
                <header className="demo-dashboard-header bg-white/90 backdrop-blur-md border-b border-stone-100 px-4 lg:px-6 sticky top-0 z-30">
                    <div className="demo-dashboard-title flex items-center gap-3">
                        <button aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="md:hidden text-stone-500"><Menu className="w-6 h-6" /></button>
                        <h2 className="font-bold text-stone-800">{headerTitle}</h2>

                        {isChannelPartnerOffice ? (
                            <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-sm border border-amber-200">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                Partner: {partnerName}
                            </span>
                        ) : channelPartnerFilter ? (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Channel Partner: {channelPartnerFilter}</span>
                        ) : null}
                        {dealerFilter && (
                            <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full font-bold">Dealer: {dealerFilter}</span>
                        )}
                    </div>

                    {!isSystemView && (
                        <div className="demo-dashboard-tools">
                            {/* ── Global search (always visible) ── */}
                            <div className="relative" ref={globalSearchRef}>
                                <Search className="absolute left-3 top-2.5 text-stone-400 w-4 h-4" />
                                <input type="text" readOnly onFocus={(e) => { e.target.removeAttribute('readonly'); if (globalResults.length > 0) setShowGlobalDrop(true); }} aria-label="Search all stages" name="crm_dash_global_search_unique" autoComplete="off" autoCorrect="off" spellCheck="false" placeholder={isChannelPartnerOffice ? `Search ${partnerName} leads...` : "Search all stages..."} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}
                                    className="pl-9 pr-4 py-2 bg-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 w-40 lg:w-60"
                                />
                                {/* Results dropdown */}
                                {showGlobalDrop && (
                                    <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-2xl shadow-xl border border-stone-100 py-1 z-50 overflow-hidden">
                                        {globalResults.map(c => (
                                            <button key={c.id} onClick={() => handleGlobalSelect(c)}
                                                 className="w-full px-4 py-2.5 text-left hover:bg-amber-50 transition-colors group">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-semibold text-stone-800 group-hover:text-amber-700">{c.customer_name || 'Unnamed'}</p>
                                                </div>
                                                <p className="text-[10px] text-stone-400 mt-0.5">
                                                    {PRIMARY_STAGES.find(s => s.id === c.stage)?.label || c.stage} · {c.phone_number || 'No phone'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Per-stage search (only in stages view) */}
                            {currentView === 'stages' && (
                                <div className="relative demo-stage-filter">
                                    <Search className="absolute left-3 top-2.5 text-stone-400 w-4 h-4" />
                                    <input type="text" readOnly onFocus={(e) => e.target.removeAttribute('readonly')}  aria-label="Filter this stage" name="crm_dash_stage_search_unique" autoComplete="off" autoCorrect="off" spellCheck="false" placeholder="Filter this stage..." value={stageSearch} onChange={e => setStageSearch(e.target.value)}
                                        className="pl-9 pr-4 py-2 bg-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 w-40" />
                                </div>
                            )}

                            {/* Year Dropdown */}
                            {currentView === 'stages' && (
                                <select
                                    value={yearFilter}
                                    onChange={e => { setYearFilter(e.target.value); setPage(0); }}
                                    aria-label="Filter by year"
                                    className="px-3 py-2 bg-stone-100 rounded-xl text-sm font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                                >
                                    <option value="all">All Years</option>
                                    <option value="2026">This Year (2026)</option>
                                    <option value="2025">Last Year (2025)</option>
                                </select>
                            )}

                            {/* Month Filter Dropdown (Leads / Registration) */}
                            {currentView === 'stages' && (selectedStage === STAGE_IDS.LEADS || selectedStage === STAGE_IDS.REGISTRATION) && (
                                <select
                                    value={selectedStage === STAGE_IDS.LEADS ? leadMonthFilter : registrationMonthFilter}
                                    onChange={event => {
                                        if (selectedStage === STAGE_IDS.LEADS) setLeadMonthFilter(event.target.value);
                                        else setRegistrationMonthFilter(event.target.value);
                                        setPage(0);
                                    }}
                                    aria-label={selectedStage === STAGE_IDS.LEADS ? 'Filter leads by month' : 'Filter registrations by month'}
                                    className="px-3 py-2 bg-stone-100 rounded-xl text-sm font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                                >
                                    <option value="">All Months</option>
                                    <option value="this-month">This month</option>
                                    <option value="last-month">Last month</option>
                                    {MONTH_OPTIONS.map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            )}

                            {/* Channel Partner filter - applies everywhere for Admin/Office */}
                            {!isChannelPartnerOffice && (
                                <div className="relative demo-partner-filter flex items-center gap-1.5" ref={channelPartnerFilterRef}>
                                    <input
                                        type="text"
                                        aria-label="Filter by channel partner" placeholder="Channel Partner..."
                                        value={channelPartnerFilterInput}
                                        onChange={e => { setChannelPartnerFilterInput(e.target.value); setShowChannelPartnerDrop(true); }}
                                        onFocus={() => setShowChannelPartnerDrop(true)}
                                        onKeyDown={e => e.key === 'Enter' && (setChannelPartnerFilter(channelPartnerFilterInput.trim()), setShowChannelPartnerDrop(false))}
                                        className="px-3 py-2 bg-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 w-32"
                                    />
                                    <button
                                        onClick={() => {
                                            setChannelPartnerFilter(channelPartnerFilterInput.trim());
                                            setShowChannelPartnerDrop(false);
                                        }}
                                        className="px-3 py-2 rounded-xl text-xs font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors">
                                        Apply
                                    </button>
                                    {(channelPartnerFilter || channelPartnerFilterInput) && (
                                        <button
                                            onClick={() => {
                                                setChannelPartnerFilter('');
                                                setChannelPartnerFilterInput('');
                                                setShowChannelPartnerDrop(false);
                                            }}
                                            className="px-3 py-2 rounded-xl text-xs font-medium bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors">
                                            Clear
                                        </button>
                                    )}
                                    {showChannelPartnerDrop && channelPartnerSuggestions.length > 0 && (
                                        <div className="absolute top-full mt-1 left-0 w-48 bg-white rounded-xl shadow-xl border border-stone-100 py-1 z-50 max-h-48 overflow-y-auto">
                                            {channelPartnerSuggestions.map(name => (
                                                <button key={name}
                                                    onClick={() => { setChannelPartnerFilterInput(name); setShowChannelPartnerDrop(false); }}
                                                    className="w-full px-3 py-2 text-left text-xs hover:bg-stone-50 text-stone-700 transition-colors">
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Dealer is a global child-scope filter, just like Channel Partner. */}
                            {effectivePartnerFilter && (
                                <select
                                    value={dealerFilter}
                                    onChange={event => setDealerFilter(event.target.value)}
                                    aria-label={`Dealer under ${effectivePartnerFilter}`}
                                    title={`Dealer under ${effectivePartnerFilter}`}
                                    className="px-3 py-2 bg-stone-100 rounded-xl text-sm font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-300 w-36"
                                >
                                    <option value="">{isChannelPartnerOffice ? "My office + dealers" : "All dealers"}</option>
                                    {dealerOptions.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            )}

                            {DATA_EXPORTS_ENABLED && user?.userType === 'admin' && (
                                <button 
                                    onClick={() => setCurrentView('exports')}
                                    className="flex items-center gap-1.5 border border-stone-200 text-stone-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50 cursor-pointer"
                                    aria-label="Open data exports" title="Open data exports"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline text-xs">Export</span>
                                </button>
                            )}
                            {(user?.userType === 'admin' || user?.userType === 'sales' || user?.userType === 'agent' || isChannelPartnerOffice) && (
                                <button aria-label="Add Lead" onClick={() => setShowAddLead(true)}
                                    className="flex items-center gap-1.5 bg-stone-900 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors">
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline text-xs">Add Lead</span>
                                </button>
                            )}
                        </div>
                    )}
                <div className="demo-portal-controls">{demoControls}</div>
            </header>

                {/* View router */}
                <div className="flex-1 p-4 lg:p-6">
                    {currentView === 'stages' && STAGE_GUIDANCE[selectedStage] && <section aria-label="Stage guidance" className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 leading-relaxed">
                        <p>{STAGE_GUIDANCE[selectedStage]}</p>
                        {selectedStage !== 'LEADS' && <p className="mt-1 text-xs text-stone-500">Open a customer card to see the details for this stage.</p>}
                    </section>}
                    <Suspense fallback={<ViewLoader />}>
                    {currentView === 'inventory' && ['admin','sales'].includes(user.userType) && <InventoryView currentUser={user} />}
                    {currentView === 'dashboard' && user.userType === 'admin' && onStartDemoTour && <section className="demo-start-here" aria-labelledby="demo-start-heading"><div><span className="demo-start-eyebrow">START HERE</span><h2 id="demo-start-heading">See how a solar project comes together</h2><p>Explore quotations, a sample customer, materials, installation and subsidy in six short steps.</p></div><div className="demo-start-buttons"><button type="button" onClick={()=>onStartDemoTour('quick')}>Start the 6-step tour</button><button type="button" onClick={()=>onStartDemoTour('quick',2)}>Open a sample customer</button><button type="button" onClick={()=>onStartDemoTour('full')}>Full walkthrough</button></div></section>}
                    {currentView === 'dashboard' && <DashboardView metrics={metrics} loading={loading} scoped={isChannelPartnerOffice} />}
                    {currentView === 'delivery_batches' && canSeeDeliveryBatches && (
                        <DeliveryBatchesView 
                             currentUser={user} 
                            onRefreshCustomers={fetchMetricsAndMeta} 
                            onOpenCustomerModal={setSelectedCustomer} 
                        />
                    )}
                    {scopeError && <p role="alert" className="m-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{scopeError}</p>}
                    {currentView === 'subsidy' && <SubsidyView onSelectCustomer={setSelectedCustomer} isChannelPartnerOffice={isChannelPartnerOffice} partnerName={partnerName} channelPartnerFilter={channelPartnerFilter} dealerFilter={dealerFilter} />}
                    {currentView === 'loan_tags' && <LoanView onSelectCustomer={setSelectedCustomer} isChannelPartnerOffice={isChannelPartnerOffice} partnerName={partnerName} channelPartnerFilter={channelPartnerFilter} dealerFilter={dealerFilter} />}
                    {currentView === 'installation_tags' && <InstallationView onSelectCustomer={setSelectedCustomer} isChannelPartnerOffice={isChannelPartnerOffice} partnerName={partnerName} channelPartnerFilter={channelPartnerFilter} dealerFilter={dealerFilter} />}
                    {currentView === 'quotations' && (
                        <Suspense fallback={<ViewLoader />}>
                            <QuotationModule embedded user={user} meta={meta} channelPartners={uniqueChannelPartners} onCreateLead={handleAddLead} onViewLead={handleGlobalSelect} onClose={() => setCurrentView('dashboard')} />
                        </Suspense>
                    )}

                    {currentView === 'toolbox' && (
                        <Suspense fallback={<ViewLoader />}>
                            <ToolboxView currentUser={user} />
                        </Suspense>
                    )}

                    {currentView === 'attendance' && <AttendanceView currentUser={user} />}
                    {currentView === 'channel_partner_mgmt' && user.userType === 'admin' && <ChannelPartnerManagementView currentUser={user} />}
                    {currentView === 'vendor_availability' && user.userType === 'admin' && <VendorCalendarView isAdmin={true} currentUser={user} />}
                    {currentView === 'installation_payments' && user.userType === 'admin' && <InstallationPaymentsView onSelectCustomer={setSelectedCustomer} currentUser={user} />}
                    {currentView === 'activity' && user.userType === 'admin' && <ActivityLogView />}
                    {currentView === 'users' && (user.userType === 'admin' || user.userType === 'channel_partner_office') && (
                        <UserManagementView currentUser={user} initialShowCreate={userMgmtAction === 'createUser'} />
                    )}
                    {DATA_EXPORTS_ENABLED && currentView === 'exports' && user.userType === 'admin' && (
                        <DataExportView
                            isChannelPartnerOffice={isChannelPartnerOffice}
                            channelPartnerFilter={channelPartnerFilter}
                            dealerFilter={dealerFilter}
                            showAlert={showAlert}
                        />
                    )}

                    {/* Trash view - admin only */}
                    {currentView === 'trash' && user.userType === 'admin' && (
                        <TrashView
                            onRecover={handleRecover}
                            onHardDelete={handleHardDelete}
                            isAdmin={user.userType === 'admin'}
                            onCountChange={setTrashCount}
                        />
                    )}


                    {/* Stage grid - identical for every role */}
                    {currentView === 'stages' && (
                        (loading && page === 0) ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="w-8 h-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : filtered.length > 0 ? (
                            <div className="space-y-4">
                                <div className="demo-customer-grid">
                                    {filtered.map(c => (
                                        <CustomerCard key={c.id} customer={c} onSelect={setSelectedCustomer} onMoveStage={handleMoveStage} currentUser={user} />
                                    ))}
                                </div>
                                {hasMore && (
                                    <div className="flex justify-center pt-4 pb-8">
                                        <button 
                                            onClick={loadMore} 
                                            disabled={loading}
                                            className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-semibold shadow-md transition-colors disabled:opacity-70 disabled:cursor-wait">
                                            {loading ? 'Loading...' : 'Load More Leads'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                                <Users className="w-12 h-12 mb-3 text-stone-200" />
                                <p className="font-medium text-stone-500">{(stageSearch || channelPartnerFilter || dealerFilter || (selectedStage === STAGE_IDS.LEADS ? leadMonthFilter : selectedStage === STAGE_IDS.REGISTRATION ? registrationMonthFilter : '')) ? 'No matching results in this stage' : 'No customers in this stage'}</p>
                                <p className="text-sm mt-1">{dealerFilter ? `No records for dealer "${dealerFilter}" here` : (selectedStage === STAGE_IDS.LEADS ? leadMonthFilter : selectedStage === STAGE_IDS.REGISTRATION ? registrationMonthFilter : '') ? 'No records were added in the selected month' : channelPartnerFilter ? `No leads with Channel Partner "${channelPartnerFilter}" here` : stageSearch ? 'Try the global search bar to find across all stages' : 'Move customers here or add a new lead'}</p>
                            </div>
                        )
                    )}
                    </Suspense>
                </div>
            </main>

            {/* Modals */}
            {selectedCustomer && (
                <Suspense fallback={<ViewLoader />}>
                <CustomerDetailModal
                    key={`${selectedCustomer.id}:${currentView}:${selectedStage}`}
                    customer={selectedCustomer}
                    onClose={() => setSelectedCustomer(null)}
                    onUpdate={handleUpdateCustomer}
                    onDelete={handleSoftDelete}
                    user={user}
                    meta={meta}
                    channel_partners={uniqueChannelPartners}
                    defaultTab={currentView === 'subsidy' ? STAGE_IDS.SUBSIDY_STATUS : currentView === 'loan_tags' ? STAGE_IDS.LOAN : currentView === 'installation_tags' ? STAGE_IDS.INSTALLATION_STATUS : currentView === 'stages' ? selectedStage : undefined}
                />
                </Suspense>
            )}
            {showAddLead && <Suspense fallback={<ViewLoader />}><AddLeadModal isOpen={showAddLead} onClose={() => setShowAddLead(false)} onSave={handleAddLead} meta={meta} channel_partners={uniqueChannelPartners} user={user} /></Suspense>}
        </div>
    );
}
