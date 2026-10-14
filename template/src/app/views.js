// Every Dashboard view in one list. The sidebar, the header title, the lazy
// router and session restore all read it, so a view that is switched off for
// this client, or not open to this login type, appears nowhere and its code
// is never downloaded.
//
// group     sidebar section: 'main' | 'tracking' | 'team' | 'admin'
// roles     login types (profiles.user_type) that may open it
// system    the header hides search, filters and Add Lead
// props     ctx => props for the view (ctx is built in Dashboard.jsx)
// count     ctx => number for the sidebar badge
// detailTab customer modal tab to open from this view
//
// The Solar toolbox is a removed feature, so it has no entry here at all.

import { Activity, CalendarDays, CreditCard, Download, IndianRupee, LayoutDashboard, Package, Tag, Trash2, Truck, UserCheck, UserCog, Users, Wrench } from 'lucide-react';
import { lazyWithRetry } from '../lib/lazy.js';
import { STAGE_IDS, isStageEnabled, isViewOn } from '../config/index.js';

export const DASHBOARD_ROLES = Object.freeze(['admin', 'sales', 'channel_partner_office', 'office2']);
const HEAD_OFFICE = ['admin', 'sales'];
const ADMIN_ONLY = ['admin'];

const currentUser = ctx => ({ currentUser: ctx.user });
const TagTrackingView = lazyWithRetry(() => import('../components/TagTrackingView'));
const tagView = kind => ctx => ({
    kind,
    onSelectCustomer: ctx.onSelectCustomer,
    isChannelPartnerOffice: ctx.isChannelPartnerOffice,
    partnerName: ctx.partnerName,
    channelPartnerFilter: ctx.channelPartnerFilter,
    dealerFilter: ctx.dealerFilter,
});

export const VIEWS = Object.freeze([
    {
        id: 'dashboard', title: 'Business Dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'main', roles: DASHBOARD_ROLES,
        load: lazyWithRetry(() => import('../components/DashboardView')),
        props: ctx => ({ metrics: ctx.metrics, failed: ctx.metricsFailed, scoped: ctx.isChannelPartnerOffice, canViewDeliveries: ctx.canViewDeliveries }),
    },
    {
        id: 'quotations', title: 'Quotation Maker', icon: Tag, group: 'main', roles: HEAD_OFFICE, hash: '#/quotations',
        onEnter: () => { window.location.hash = '/quotations'; },
        load: lazyWithRetry(() => import('../quotations/QuotationModule')),
        props: ctx => ({
            embedded: true, user: ctx.user, meta: ctx.meta, channelPartners: ctx.channelPartners,
            onCreateLead: ctx.onCreateLead, onViewLead: ctx.onViewLead, onClose: ctx.goHome,
        }),
    },
    {
        id: 'calendar', title: 'Calendar', icon: CalendarDays, group: 'main', roles: DASHBOARD_ROLES, system: true,
        load: lazyWithRetry(() => import('../components/CalendarView')), props: currentUser,
    },
    {
        id: 'delivery_batches', title: 'Material Delivery Batches', label: 'Delivery Batches', icon: Truck, group: 'tracking', roles: HEAD_OFFICE,
        load: lazyWithRetry(() => import('../components/DeliveryBatchesView')),
        props: ctx => ({ currentUser: ctx.user, onRefreshCustomers: ctx.refreshMetrics, onOpenCustomerModal: ctx.onSelectCustomer }),
        count: ctx => ctx.metrics?.deliveryBatchesCount,
    },
    {
        id: 'inventory', title: 'Inventory', icon: Package, group: 'tracking', roles: HEAD_OFFICE,
        load: lazyWithRetry(() => import('../inventory/InventoryView')), props: currentUser,
    },
    {
        id: 'subsidy', title: 'Subsidy tracking', icon: Tag, group: 'tracking', roles: DASHBOARD_ROLES, detailTab: STAGE_IDS.SUBSIDY_STATUS,
        load: TagTrackingView, props: tagView('subsidy'), count: ctx => ctx.metrics?.subsidyTagCount,
    },
    {
        id: 'loan_tags', title: 'Loan tracking', icon: IndianRupee, group: 'tracking', roles: DASHBOARD_ROLES, detailTab: STAGE_IDS.LOAN,
        load: TagTrackingView, props: tagView('loan'), count: ctx => ctx.metrics?.loanTagCount,
    },
    {
        id: 'installation_tags', title: 'Installation tracking', icon: Wrench, group: 'tracking', roles: DASHBOARD_ROLES, detailTab: STAGE_IDS.INSTALLATION_STATUS,
        load: TagTrackingView, props: tagView('installation'), count: ctx => ctx.metrics?.installationTagCount,
    },
    {
        id: 'attendance', title: 'Staff Attendance & Leave', label: user => (user?.userType === 'admin' ? 'Staff Attendance & Leave' : 'Attendance & Leave'),
        icon: UserCheck, group: 'team', roles: DASHBOARD_ROLES, system: true,
        load: lazyWithRetry(() => import('../components/AttendanceView')), props: currentUser,
    },
    {
        id: 'channel_partner_mgmt', title: 'Operations', icon: Users, group: 'team', roles: ADMIN_ONLY, system: true,
        load: lazyWithRetry(() => import('../components/ChannelPartnerManagementView')), props: currentUser,
    },
    {
        id: 'installation_payments', title: 'Installation Payments', icon: CreditCard, group: 'team', roles: ADMIN_ONLY, system: true,
        load: lazyWithRetry(() => import('../components/InstallationPaymentsView')),
        props: ctx => ({ currentUser: ctx.user, onSelectCustomer: ctx.onSelectCustomer }),
    },
    {
        id: 'activity', title: 'Activity Log', icon: Activity, group: 'admin', roles: ADMIN_ONLY, system: true,
        load: lazyWithRetry(() => import('../components/ActivityLogView')), props: () => ({}),
    },
    {
        id: 'users', title: 'User Management', icon: UserCog, group: 'admin', roles: ['admin', 'channel_partner_office'], system: true,
        load: lazyWithRetry(() => import('../components/UserManagementView')), props: currentUser,
    },
    {
        id: 'exports', title: 'Data Exports', icon: Download, group: 'admin', roles: ADMIN_ONLY,
        load: lazyWithRetry(() => import('../components/DataExportView')),
        props: ctx => ({
            isChannelPartnerOffice: ctx.isChannelPartnerOffice, channelPartnerFilter: ctx.channelPartnerFilter,
            dealerFilter: ctx.dealerFilter, showAlert: ctx.showAlert,
        }),
    },
    {
        id: 'trash', title: 'Trash', icon: Trash2, group: 'admin', roles: ADMIN_ONLY, system: true, redBadge: true,
        load: lazyWithRetry(() => import('../components/TrashView')),
        props: ctx => ({ onRecover: ctx.onRecover, onHardDelete: ctx.onHardDelete, isAdmin: ctx.user?.userType === 'admin', onCountChange: ctx.setTrashCount }),
        count: ctx => ctx.trashCount,
    },
]);

const VIEW_BY_ID = new Map(VIEWS.map(view => [view.id, view]));

/** The view, if this client has it switched on and this login may open it. */
export function viewFor(id, user) {
    const view = VIEW_BY_ID.get(id);
    return view && isViewOn(id) && view.roles.includes(user?.userType) ? view : null;
}

export const canOpenView = (id, user) => Boolean(viewFor(id, user));
export const viewsInGroup = (group, user) => VIEWS.filter(view => view.group === group && viewFor(view.id, user));
export const viewLabel = (view, user) => (typeof view.label === 'function' ? view.label(user) : view.label || view.title);

const VIEW_KEY = 'solarflow_current_view';
const STAGE_KEY = 'solarflow_selected_stage';
const readSession = key => { try { return window.sessionStorage.getItem(key); } catch { return null; } };
const writeSession = (key, value) => { try { window.sessionStorage.setItem(key, value); } catch { /* storage blocked */ } };

/**
 * The view to open after a reload: the quotations link, else the saved view.
 * A saved view that is switched off or not open to this login falls back to
 * the dashboard. A view with its own address (quotations) opens only from it.
 */
export function restoreView(user) {
    const fromHash = VIEWS.find(view => view.hash && window.location.hash.startsWith(view.hash));
    if (fromHash && viewFor(fromHash.id, user)) return fromHash.id;
    const saved = readSession(VIEW_KEY);
    if (saved === 'stages') return saved;
    const view = viewFor(saved, user);
    return view && !view.hash ? view.id : 'dashboard';
}

/**
 * Stage ids that still hold customers but are no longer in the pipeline (a
 * stage dropped in an upgrade), from the metrics' stageCounts, sorted.
 */
export const otherStageIds = (stageCounts = {}) => Object.entries(stageCounts || {})
    .filter(([id, count]) => id && !isStageEnabled(id) && Number(count) > 0)
    .map(([id]) => id)
    .sort();

/** The saved stage, or Leads when it is missing or no longer in the pipeline. */
export function restoreStage() {
    const saved = readSession(STAGE_KEY);
    return saved && isStageEnabled(saved) ? saved : STAGE_IDS.LEADS;
}

export const saveView = id => writeSession(VIEW_KEY, id);
export const saveStage = id => writeSession(STAGE_KEY, id);
