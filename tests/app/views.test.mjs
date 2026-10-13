import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_REGISTRY, VIEW_FEATURE } from '../../template/src/config/catalog/features.js';
import { BUILTIN_STAGE_IDS } from '../../template/src/config/catalog/stages.js';
import {
    DASHBOARD_ROLES, VIEWS, canOpenView, restoreStage, restoreView, saveStage, saveView, viewFor, viewLabel, viewsInGroup,
} from '../../template/src/app/views.js';
import { configWith, importTemplate } from '../dashboard/fixtures/templateModules.mjs';

// The shipped template config turns every available feature on.

const ALWAYS_ON = ['dashboard'];
const GROUPS = ['main', 'tracking', 'team', 'admin'];
const ids = views => views.map(view => view.id);
const as = userType => ({ id: `${userType}-1`, name: 'Test Login', userType });
const ADMIN = as('admin');
const openTo = (user, module = { VIEWS, canOpenView }) => module.VIEWS.filter(view => module.canOpenView(view.id, user)).map(view => view.id);

// views.js reads window.location.hash and window.sessionStorage, as in the browser.
// `view` and `stage` are saved first; `blocked` then makes storage throw, as
// it does in some private windows.
function useBrowser({ hash = '', view, stage, blocked = false } = {}) {
    const store = new Map();
    let locked = false;
    const guard = () => { if (locked) throw new DOMException('The operation is insecure.', 'SecurityError'); };
    globalThis.window = {
        location: { hash },
        sessionStorage: {
            getItem: key => { guard(); return store.has(key) ? store.get(key) : null; },
            setItem: (key, value) => { guard(); store.set(key, String(value)); },
        },
    };
    if (view !== undefined) saveView(view);
    if (stage !== undefined) saveStage(stage);
    locked = blocked;
    return store;
}
test.afterEach(() => { delete globalThis.window; });

const shippedPipeline = configWith().pipeline;
const withoutStages = (...removed) => configWith({
    pipeline: { ...shippedPipeline, stages: shippedPipeline.stages.filter(stage => !removed.includes(stage.id)) },
});

test('every view is owned by a feature, or is always on', () => {
    assert.equal(new Set(ids(VIEWS)).size, VIEWS.length, 'view ids are unique');
    for (const view of VIEWS) {
        assert.ok(VIEW_FEATURE[view.id] || ALWAYS_ON.includes(view.id), `${view.id} has no owning feature`);
    }
    for (const id of ALWAYS_ON) assert.equal(VIEW_FEATURE[id], undefined, `${id} must not be switchable`);
});

test('every view a live feature owns is registered, and no other', () => {
    for (const [viewId, featureId] of Object.entries(VIEW_FEATURE)) {
        const live = ['core', 'available'].includes(FEATURE_REGISTRY[featureId].status);
        assert.equal(ids(VIEWS).includes(viewId), live, `${viewId} (${featureId}, ${FEATURE_REGISTRY[featureId].status})`);
    }
});

test('the removed Solar toolbox leaves no trace', async () => {
    assert.ok(!ids(VIEWS).includes('toolbox'));
    assert.ok(VIEWS.every(view => !/toolbox/i.test(`${view.id} ${view.title} ${viewLabel(view, ADMIN)}`)));
    assert.equal(viewFor('toolbox', ADMIN), null);

    // A config cannot switch a removed feature back on.
    const forced = await importTemplate('app/views.js', { config: configWith({ features: { toolbox: true } }) });
    assert.equal(forced.canOpenView('toolbox', ADMIN), false);
    assert.deepEqual(ids(forced.VIEWS), ids(VIEWS));

    useBrowser({ view: 'toolbox' });
    assert.equal(restoreView(ADMIN), 'dashboard');
});

test('every view has what the sidebar, header and router need', () => {
    const ctx = {
        user: ADMIN, metrics: { deliveryBatchesCount: 2, subsidyTagCount: 3, loanTagCount: 4, installationTagCount: 5 },
        trashCount: 6, isChannelPartnerOffice: false, channelPartnerFilter: 'Sun Power', dealerFilter: '',
    };
    for (const view of VIEWS) {
        assert.ok(view.title && typeof view.title === 'string', view.id);
        assert.ok(GROUPS.includes(view.group), `${view.id} group ${view.group}`);
        assert.ok(view.icon, `${view.id} icon`);
        assert.ok(view.load, `${view.id} load`);
        assert.ok(Array.isArray(view.roles) && view.roles.length, `${view.id} roles`);
        assert.ok(view.roles.every(role => DASHBOARD_ROLES.includes(role)), `${view.id} opens only to Dashboard logins`);
        assert.equal(typeof view.props, 'function', `${view.id} props`);
        assert.equal(typeof view.props(ctx), 'object', `${view.id} props(ctx)`);
        if (view.count) assert.equal(typeof view.count(ctx), 'number', `${view.id} count`);
        if (view.detailTab) assert.ok(BUILTIN_STAGE_IDS.includes(view.detailTab), `${view.id} detailTab ${view.detailTab}`);
        if (view.hash) assert.equal(typeof view.onEnter, 'function', `${view.id} onEnter`);
    }
    assert.ok(Object.isFrozen(VIEWS) && Object.isFrozen(DASHBOARD_ROLES));
    assert.deepEqual([...DASHBOARD_ROLES], ['admin', 'sales', 'channel_partner_office', 'office2']);
});

test('each login type sees only the views open to it', () => {
    assert.deepEqual(openTo(ADMIN), ids(VIEWS));
    assert.deepEqual(openTo(as('sales')), [
        'dashboard', 'quotations', 'calendar', 'delivery_batches', 'inventory', 'subsidy', 'loan_tags', 'installation_tags', 'attendance',
    ]);
    assert.deepEqual(openTo(as('channel_partner_office')), [
        'dashboard', 'calendar', 'subsidy', 'loan_tags', 'installation_tags', 'attendance', 'users',
    ]);
    assert.deepEqual(openTo(as('office2')), [
        'dashboard', 'calendar', 'subsidy', 'loan_tags', 'installation_tags', 'attendance',
    ]);
    for (const userType of ['agent', 'agent2', 'vendor', 'stamp', 'Admin', '', undefined]) {
        assert.deepEqual(openTo(as(userType)), [], String(userType));
    }
    assert.deepEqual(openTo(null), []);
    assert.deepEqual(openTo(undefined), []);
});

test('only admins open the admin tools', () => {
    for (const id of ['channel_partner_mgmt', 'installation_payments', 'activity', 'exports', 'trash']) {
        assert.equal(canOpenView(id, ADMIN), true, id);
        for (const userType of ['sales', 'channel_partner_office', 'office2']) assert.equal(canOpenView(id, as(userType)), false, `${id} for ${userType}`);
    }
    assert.equal(canOpenView('users', as('channel_partner_office')), true);
    assert.equal(canOpenView('users', as('sales')), false);
    assert.equal(canOpenView('users', as('office2')), false);
});

test('permissions are decided by userType alone', () => {
    // The profile's display role and raw user_type column do not grant anything.
    assert.equal(canOpenView('activity', { userType: 'sales', role: 'Admin', user_type: 'admin' }), false);
    assert.equal(canOpenView('activity', { role: 'admin', user_type: 'admin' }), false);
    assert.equal(canOpenView('dashboard', { user_type: 'admin' }), false);
    assert.equal(canOpenView('activity', { userType: 'admin', role: 'Sales' }), true);
});

test('viewFor returns the view only when it is on and open to the login', () => {
    assert.equal(viewFor('calendar', ADMIN), VIEWS.find(view => view.id === 'calendar'));
    assert.equal(viewFor('activity', as('sales')), null);
    for (const id of ['stages', 'vendor_availability', 'Dashboard', '', null, undefined]) assert.equal(viewFor(id, ADMIN), null, String(id));
});

test('the sidebar groups keep the registry order', () => {
    assert.deepEqual(ids(viewsInGroup('main', ADMIN)), ['dashboard', 'quotations', 'calendar']);
    assert.deepEqual(ids(viewsInGroup('tracking', ADMIN)), ['delivery_batches', 'inventory', 'subsidy', 'loan_tags', 'installation_tags']);
    assert.deepEqual(ids(viewsInGroup('team', ADMIN)), ['attendance', 'channel_partner_mgmt', 'installation_payments']);
    assert.deepEqual(ids(viewsInGroup('admin', ADMIN)), ['activity', 'users', 'exports', 'trash']);
    assert.deepEqual(GROUPS.flatMap(group => ids(viewsInGroup(group, ADMIN))).sort(), ids(VIEWS).sort());

    assert.deepEqual(ids(viewsInGroup('admin', as('channel_partner_office'))), ['users']);
    assert.deepEqual(ids(viewsInGroup('admin', as('office2'))), []);
    assert.deepEqual(ids(viewsInGroup('team', as('sales'))), ['attendance']);
    assert.deepEqual(ids(viewsInGroup('toolbox', ADMIN)), []);
});

test('view labels fall back to the title and can depend on the login', () => {
    const view = id => VIEWS.find(item => item.id === id);
    assert.equal(viewLabel(view('dashboard'), ADMIN), 'Dashboard');
    assert.equal(viewLabel(view('delivery_batches'), ADMIN), 'Delivery Batches');
    assert.equal(viewLabel(view('calendar'), ADMIN), 'Calendar');
    assert.equal(viewLabel(view('attendance'), ADMIN), 'Staff Attendance & Leave');
    assert.equal(viewLabel(view('attendance'), as('sales')), 'Attendance & Leave');
    assert.equal(viewLabel(view('attendance'), undefined), 'Attendance & Leave');
});

test('a switched-off feature hides its view everywhere', async () => {
    const switchable = Object.entries(VIEW_FEATURE).filter(([, featureId]) => FEATURE_REGISTRY[featureId].status === 'available');
    assert.ok(switchable.length >= 10);
    for (const [viewId, featureId] of switchable) {
        const off = await importTemplate('app/views.js', { config: configWith({ features: { [featureId]: false } }) });
        const view = off.VIEWS.find(item => item.id === viewId);
        assert.equal(off.viewFor(viewId, ADMIN), null, `${viewId} with ${featureId} off`);
        assert.equal(off.canOpenView(viewId, ADMIN), false, `${viewId} with ${featureId} off`);
        assert.ok(!ids(off.viewsInGroup(view.group, ADMIN)).includes(viewId), `${viewId} still in the sidebar`);
        assert.ok(openTo(ADMIN, off).includes('dashboard'));
    }
});

test('core views cannot be switched off by a config', async () => {
    const config = configWith({ features: { staffManagement: false, operationsPage: false, activityLog: false, trash: false } });
    const views = await importTemplate('app/views.js', { config });
    for (const id of ['users', 'channel_partner_mgmt', 'activity', 'trash', 'dashboard']) assert.equal(views.canOpenView(id, ADMIN), true, id);
});

test('views follow the features and stages they depend on', async () => {
    const noBom = await importTemplate('app/views.js', { config: configWith({ features: { bomMaker: false } }) });
    assert.equal(noBom.canOpenView('delivery_batches', ADMIN), false);
    assert.equal(noBom.canOpenView('inventory', ADMIN), false);

    const noStages = await importTemplate('app/views.js', { config: withoutStages('INSTALLATION STATUS', 'SUBSIDY STATUS') });
    assert.equal(noStages.canOpenView('installation_tags', ADMIN), false);
    assert.equal(noStages.canOpenView('subsidy', ADMIN), false);
    assert.equal(noStages.canOpenView('loan_tags', ADMIN), true);

    const minimal = Object.fromEntries(Object.entries(FEATURE_REGISTRY).filter(([, feature]) => feature.status === 'available').map(([id]) => [id, false]));
    const bare = await importTemplate('app/views.js', { config: configWith({ features: minimal }) });
    assert.deepEqual(openTo(ADMIN, bare), ['dashboard', 'channel_partner_mgmt', 'activity', 'users', 'trash']);
    assert.deepEqual(openTo(as('sales'), bare), ['dashboard']);
});

test('restoreView reopens the saved view when it is still allowed', () => {
    useBrowser();
    assert.equal(restoreView(ADMIN), 'dashboard');

    useBrowser({ view: 'calendar' });
    assert.equal(restoreView(as('office2')), 'calendar');

    useBrowser({ view: 'activity' });
    assert.equal(restoreView(ADMIN), 'activity');
    assert.equal(restoreView(as('sales')), 'dashboard');

    useBrowser({ view: 'stages' });
    assert.equal(restoreView(as('office2')), 'stages');
});

test('restoreView falls back to the dashboard for unknown, removed or switched-off views', async () => {
    for (const saved of ['vendor_availability', 'toolbox', 'Dashboard', '', 'undefined']) {
        useBrowser({ view: saved });
        assert.equal(restoreView(ADMIN), 'dashboard', JSON.stringify(saved));
    }

    const noCalendar = await importTemplate('app/views.js', { config: configWith({ features: { calendar: false } }) });
    useBrowser({ view: 'calendar' });
    assert.equal(noCalendar.restoreView(ADMIN), 'dashboard');

    useBrowser({ view: 'calendar', blocked: true });
    assert.equal(restoreView(ADMIN), 'dashboard');
});

test('the quotation maker reopens only from its own address', async () => {
    useBrowser({ view: 'quotations' });
    assert.equal(restoreView(ADMIN), 'dashboard');

    useBrowser({ hash: '#/quotations', view: 'calendar' });
    assert.equal(restoreView(ADMIN), 'quotations');
    assert.equal(restoreView(as('sales')), 'quotations');
    // Partner offices cannot open it, so they get their saved view instead.
    assert.equal(restoreView(as('channel_partner_office')), 'calendar');

    useBrowser({ hash: '#/quotations/new', blocked: true });
    assert.equal(restoreView(as('sales')), 'quotations');

    const noQuotes = await importTemplate('app/views.js', { config: configWith({ features: { quotationMaker: false } }) });
    useBrowser({ hash: '#/quotations' });
    assert.equal(noQuotes.restoreView(ADMIN), 'dashboard');
});

test('opening the quotation maker sets its address', () => {
    useBrowser();
    VIEWS.find(view => view.id === 'quotations').onEnter();
    assert.equal(globalThis.window.location.hash, '/quotations');
});

test('restoreStage reopens the saved stage only while it is in the pipeline', async () => {
    useBrowser();
    assert.equal(restoreStage(), 'LEADS');

    useBrowser({ stage: 'MATERIAL ORDER' });
    assert.equal(restoreStage(), 'MATERIAL ORDER');

    for (const saved of ['HOLD PROCUREMENT', 'material order', '']) {
        useBrowser({ stage: saved });
        assert.equal(restoreStage(), 'LEADS', JSON.stringify(saved));
    }

    const noLoan = await importTemplate('app/views.js', { config: configWith({ features: { loanTracking: false } }) });
    useBrowser({ stage: 'LOAN' });
    assert.equal(noLoan.restoreStage(), 'LEADS');
    assert.equal(restoreStage(), 'LOAN');

    useBrowser({ stage: 'MATERIAL ORDER', blocked: true });
    assert.equal(restoreStage(), 'LEADS');
});

test('saved view and stage round-trip, and are cleared with the other solarflow_ keys on sign-out', () => {
    const store = useBrowser();
    saveView('calendar');
    saveStage('MATERIAL DELIVERY');
    assert.equal(restoreView(ADMIN), 'calendar');
    assert.equal(restoreStage(), 'MATERIAL DELIVERY');
    // App.jsx clears every sessionStorage key starting with solarflow_ on sign-out.
    assert.equal(store.size, 2);
    assert.ok([...store.keys()].every(key => key.startsWith('solarflow_')));

    useBrowser({ blocked: true });
    assert.doesNotThrow(() => { saveView('calendar'); saveStage('LEADS'); });
});

test('view props come from the Dashboard context', () => {
    const view = id => VIEWS.find(item => item.id === id);
    const ctx = { user: as('sales'), onSelectCustomer: () => {}, isChannelPartnerOffice: true, partnerName: 'Sun Power', channelPartnerFilter: '', dealerFilter: 'Ravi', trashCount: 3 };
    assert.deepEqual(view('subsidy').props(ctx), {
        kind: 'subsidy', onSelectCustomer: ctx.onSelectCustomer, isChannelPartnerOffice: true,
        partnerName: 'Sun Power', channelPartnerFilter: '', dealerFilter: 'Ravi',
    });
    assert.equal(view('loan_tags').props(ctx).kind, 'loan');
    assert.equal(view('installation_tags').props(ctx).kind, 'installation');
    assert.equal(view('trash').props(ctx).isAdmin, false);
    assert.equal(view('trash').props({ ...ctx, user: { userType: 'admin', role: 'Sales' } }).isAdmin, true);
    assert.equal(view('trash').props({ ...ctx, user: { role: 'admin' } }).isAdmin, false);
    assert.equal(view('trash').count(ctx), 3);
    assert.deepEqual(view('calendar').props(ctx), { currentUser: ctx.user });
});
