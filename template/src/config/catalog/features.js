// Every SolarFlow feature, in one place.
//
// The client setup form, the runtime feature switches and the generated
// client.config.js all read this list. A client's config may only turn
// features on or off; it can never add one that is not listed here.
//
// status
//   core       always on, never asked (the app does not work without it)
//   available  switched per client
//   removed    switched off for every client for now; never shown or asked
//   not_built  promised in old sales copy but never built; never shown
//
// dependsOn     every listed feature must be on
// dependsOnAny  at least one listed feature must be on
// requiresStages pipeline stage ids that must stay in the client's pipeline
// grantsRole    the login type (profiles.user_type) that exists only while on
// views         Dashboard view ids this feature owns (see config/views.js)

export const FEATURE_GROUPS = [
    { id: 'sales', label: 'Sales & partners' },
    { id: 'money', label: 'Payments & subsidy' },
    { id: 'materials', label: 'Material & delivery' },
    { id: 'installation', label: 'Installation' },
    { id: 'team', label: 'Team & records' },
    { id: 'system', label: 'Always included' },
];

export const FEATURE_REGISTRY = {
    // ── Always included ────────────────────────────────────────────────
    pipeline: {
        label: 'Customer pipeline',
        description: 'Every customer moves through your stages, from first enquiry to completed installation.',
        group: 'system', status: 'core', default: true,
    },
    staffManagement: {
        label: 'Staff logins',
        description: 'Create logins for your office team and choose what each person can see.',
        group: 'system', status: 'core', default: true, views: ['users'],
    },
    operationsPage: {
        label: 'Dropdown lists & directories',
        description: 'Manage module brands, inverter makes, staff names and other lists used in the forms.',
        group: 'system', status: 'core', default: true, views: ['channel_partner_mgmt'],
    },
    activityLog: {
        label: 'Activity log',
        description: 'See who changed what, and when.',
        group: 'system', status: 'core', default: true, views: ['activity'],
    },
    trash: {
        label: 'Trash',
        description: 'Deleted customers can be restored by an admin.',
        group: 'system', status: 'core', default: true, views: ['trash'],
    },

    // ── Sales & partners ───────────────────────────────────────────────
    quotationMaker: {
        label: 'Quotation maker',
        description: 'Make a 3-option solar quotation in minutes and turn it into a lead.',
        group: 'sales', status: 'available', default: true, views: ['quotations'],
    },
    channelPartners: {
        label: 'Partner / agent logins',
        description: 'Agents or partners who bring you customers get a phone login to add leads and follow their customers.',
        group: 'sales', status: 'available', default: false, grantsRole: 'agent',
    },
    cpos: {
        label: 'Partner offices (CPOs)',
        description: 'Partner companies that sell under your brand from their own office get a login that shows only their customers.',
        group: 'sales', status: 'available', default: false, grantsRole: 'channel_partner_office',
    },
    branches: {
        label: 'Partner office managers',
        description: 'Each partner office can add a manager login that sees that office’s customers.',
        group: 'sales', status: 'available', default: false, grantsRole: 'office2', dependsOn: ['cpos'],
    },
    dealers: {
        label: 'Dealer logins',
        description: 'Dealers working under a partner get their own login and only see their own customers.',
        group: 'sales', status: 'available', default: false, grantsRole: 'agent2', dependsOnAny: ['channelPartners', 'cpos'],
    },
    dealerFiltering: {
        label: 'Filter by dealer',
        description: 'Filter dashboards, lists and exports by dealer.',
        group: 'sales', status: 'core', default: true, dependsOn: ['dealers'],
    },

    // ── Payments & subsidy ─────────────────────────────────────────────
    loanTracking: {
        label: 'Loan tracking',
        description: 'Follow each solar loan from application to final payment, with a loan status page.',
        group: 'money', status: 'available', default: true, requiresStages: ['LOAN'], views: ['loan_tags'],
    },
    cashPayments: {
        label: 'Cash payment tracking',
        description: 'Record each payment from customers who pay without a loan.',
        group: 'money', status: 'available', default: true, requiresStages: ['CASH'],
    },
    subsidyTracking: {
        label: 'Subsidy tracking',
        description: 'Follow the PM Surya Ghar subsidy for each customer until it is received.',
        group: 'money', status: 'available', default: true, requiresStages: ['SUBSIDY STATUS'], views: ['subsidy'],
    },

    // ── Material & delivery ────────────────────────────────────────────
    bomMaker: {
        label: 'BOM maker',
        description: 'Prepare and print the bill of materials for each installation, with panel and inverter serial numbers.',
        group: 'materials', status: 'available', default: true, requiresStages: ['MATERIAL INTEGRATION'],
    },
    deliveryBatches: {
        label: 'Truck deliveries & challans',
        description: 'Group customers into truck loads, print loading sheets and delivery challans, and track each truck.',
        group: 'materials', status: 'available', default: false, dependsOn: ['bomMaker'], views: ['delivery_batches'],
    },
    inventory: {
        label: 'Godown stock (inventory)',
        description: 'Keep stock of panels, inverters and material. Stock goes down automatically when a delivery is marked Delivered.',
        group: 'materials', status: 'available', default: false, dependsOn: ['bomMaker'], views: ['inventory'],
    },
    documentUploads: {
        label: 'Document uploads',
        description: 'Upload Aadhaar, light bill, photos and other customer documents into SolarFlow.',
        group: 'materials', status: 'available', default: true,
    },
    checklists: {
        label: 'Document checklists',
        description: 'Tick off each customer document as received, without uploading the file.',
        group: 'materials', status: 'available', default: true,
    },

    // ── Installation ───────────────────────────────────────────────────
    installationView: {
        label: 'Installation tracking page',
        description: 'One page listing every installation by status: pending, in progress or installed.',
        group: 'installation', status: 'available', default: true, requiresStages: ['INSTALLATION STATUS'], views: ['installation_tags'],
    },
    vendorLogin: {
        label: 'Installer (vendor) logins',
        description: 'Outside installation teams get a phone login to see their jobs, update installation status and upload site photos.',
        group: 'installation', status: 'available', default: false, grantsRole: 'vendor',
        requiresStages: ['MATERIAL DELIVERY', 'INSTALLATION STATUS', 'GEO TAG PHOTO'],
    },
    vendorCommission: {
        label: 'Installer payout page',
        description: 'Installers see how much they will be paid for each job, and what is already paid.',
        group: 'installation', status: 'available', default: false, dependsOn: ['vendorLogin'],
    },
    installationCommission: {
        label: 'Installation payments page',
        description: 'Your team records and tracks what is owed and paid to installers for each installation.',
        group: 'installation', status: 'available', default: false, views: ['installation_payments'],
    },

    // ── Team & records ─────────────────────────────────────────────────
    calendar: {
        label: 'Shared calendar',
        description: 'One calendar everyone can add to: site visits, meetings, follow-ups and days off.',
        group: 'team', status: 'available', default: true, views: ['calendar'],
    },
    attendance: {
        label: 'Staff attendance & leave',
        description: 'Staff mark attendance and request leave; admins approve.',
        group: 'team', status: 'available', default: false, views: ['attendance'],
    },
    teamChat: {
        label: 'Team chat',
        description: 'A simple chat inside SolarFlow for the whole team.',
        group: 'team', status: 'available', default: false,
    },
    dataExports: {
        label: 'Excel / CSV downloads',
        description: 'Download customer, stock and attendance lists as spreadsheets.',
        group: 'team', status: 'available', default: true, views: ['exports'],
    },

    // ── Off for every client for now ───────────────────────────────────
    toolbox: {
        label: 'Solar toolbox', description: 'Calculators and receipt makers. Hidden until tools are offered.',
        group: 'team', status: 'removed', default: false, views: ['toolbox'],
    },
    stampLogin: {
        label: 'Stamp staff login', description: 'Removed for now.',
        group: 'team', status: 'removed', default: false, grantsRole: 'stamp',
    },
    warrantyTracking: {
        label: 'Warranty tracking', description: 'Removed for now.',
        group: 'installation', status: 'removed', default: false,
    },
    misUpload: {
        label: 'MIS upload auto updater', description: 'Never built.',
        group: 'team', status: 'not_built', default: false,
    },
    cpCommission: {
        label: 'Channel partner commission view', description: 'Never built.',
        group: 'sales', status: 'not_built', default: false,
    },
    technicianLogin: {
        label: 'Technician login', description: 'Never built.',
        group: 'installation', status: 'not_built', default: false,
    },
};

export const FEATURE_IDS = Object.freeze(Object.keys(FEATURE_REGISTRY));

// The portal each login type opens is owned by one feature. Roles not listed
// here (admin, sales) always exist.
export const ROLE_FEATURE = Object.freeze(Object.fromEntries(
    Object.entries(FEATURE_REGISTRY).filter(([, f]) => f.grantsRole).map(([id, f]) => [f.grantsRole, id]),
));

// Dashboard view id -> owning feature. Views not listed are always available.
export const VIEW_FEATURE = Object.freeze(Object.fromEntries(
    Object.entries(FEATURE_REGISTRY).flatMap(([id, f]) => (f.views || []).map(view => [view, id])),
));

export const isSelectable = id => FEATURE_REGISTRY[id]?.status === 'available';
