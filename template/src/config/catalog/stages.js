// The built-in pipeline stages.
//
// A stage id is stored in admin.stage, stages_remarks keys, history entries
// and the activity log, so ids never change. A client may rename a stage
// (label), move it between groups, reorder it, drop it when `removable`, and
// add custom stages of their own. LEADS always stays first; COMPLETED and
// LOST PROJECT always stay last.
//
// requiresFeature   the stage exists only while that feature is on
// hideWhenPaymentType  skipped for a customer whose payment_type matches
// requirements      [column, label, rule] that must hold before leaving the
//                   stage. rule names are resolved in config/resolve.js.

export const STAGE_GROUP_DEFAULTS = [
    { id: 'enquiry', label: 'Enquiry & finance' },
    { id: 'materials', label: 'Materials & installation' },
    { id: 'approvals', label: 'Approvals & subsidy' },
    { id: 'closed', label: 'Closed projects' },
];

export const BUILTIN_STAGES = [
    {
        id: 'LEADS', label: 'Leads', icon: 'Users', group: 'enquiry', pin: 'first',
        guidance: 'New enquiries start here. Open a customer card to review contact details and follow-up notes, or choose Add Lead.',
        requirements: [['customer_name', 'Customer Name'], ['phone_number', 'Phone Number']],
    },
    {
        id: 'REGISTRATION', label: 'Registration', icon: 'ClipboardList', group: 'enquiry', removable: true,
        guidance: 'Review the customer’s registration details and application progress.',
        requirements: [['registration_date', 'Registration Date'], ['payment_type', 'Payment Type', 'paymentType']],
    },
    {
        id: 'LOAN', label: 'Loan', icon: 'IndianRupee', group: 'enquiry', removable: true,
        requiresFeature: 'loanTracking', hideWhenPaymentType: ['cash'],
        guidance: 'Follow the customer’s loan application and payment progress.',
        requirements: [['jansamarth_application_no', 'Jansamarth Application No']],
    },
    {
        id: 'CASH', label: 'Cash', icon: 'Banknote', group: 'enquiry', removable: true,
        requiresFeature: 'cashPayments', hideWhenPaymentType: ['loan'],
        guidance: 'Track payments for customers funding their system without a loan.',
        requirements: [['payment_type', 'Payment Type']],
    },
    {
        id: 'MATERIAL ORDER', label: 'Material Order', icon: 'ShoppingBag', group: 'materials', removable: true,
        guidance: 'Review the roof or shed requirements and order details before preparing materials.',
        requirements: [['roof_shed', 'Roof / Shed'], ['invoice_value', 'Invoice Value', 'positive']],
    },
    {
        id: 'MATERIAL INTEGRATION', label: 'Material Integration', icon: 'Package', group: 'materials', removable: true,
        guidance: 'Prepare the bill of materials (BOM): the equipment and quantities needed for this installation.',
        requirements: [['inverter_make', 'Inverter Make'], ['inverter_serial_no', 'Inverter Serial Number']],
    },
    {
        id: 'MATERIAL DELIVERY', label: 'Material Delivery', icon: 'Truck', group: 'materials', removable: true,
        guidance: 'Check which materials are ready for dispatch and which have reached the customer’s site.',
        requirements: [['vendor', 'Vendor Allotment'], ['material_delivery_date', 'Delivery Date']],
    },
    {
        id: 'INSTALLATION STATUS', label: 'Installation Status', icon: 'Wrench', group: 'materials', removable: true,
        guidance: 'Follow installation progress and review the assigned team’s updates.',
        requirements: [['installation_status', 'Installation Status must be Installed', 'yes']],
    },
    {
        id: 'GEO TAG PHOTO', label: 'Geo Tag Photo', icon: 'Camera', group: 'materials', removable: true,
        guidance: 'Review site photos that include location information.',
        requirements: [['geo_tag_status', 'Geo Tag Status must be Proceed', 'proceed']],
    },
    {
        id: 'DISCOM SUBMISSION', label: 'Discom Submission', icon: 'Send', group: 'approvals', removable: true,
        guidance: 'Track documents submitted to the electricity distribution company (DISCOM).',
        requirements: [['discom_submission', 'Submitted By and Date', 'discomSubmitted']],
    },
    {
        id: 'METER INSTALLATION', label: 'Meter Installation', icon: 'Gauge', group: 'approvals', removable: true,
        guidance: 'Follow the electricity meter installation and record its details.',
        requirements: [['meter_installation', 'Meter Installation must be Yes', 'yes'], ['installation_date', 'Installation Date']],
    },
    {
        id: 'DISCOM INSPECTION', label: 'Discom Inspection', icon: 'ClipboardCheck', group: 'approvals', removable: true,
        guidance: 'Track the electricity company’s inspection and approval.',
        requirements: [['discom_inspection', 'Discom Inspection must be Yes', 'yes']],
    },
    {
        id: 'SUBSIDY STATUS', label: 'Subsidy Status', icon: 'Tag', group: 'approvals', removable: true,
        requiresFeature: 'subsidyTracking',
        guidance: 'Follow the subsidy application through to payment.',
        requirements: [['subsidy_tag', 'Subsidy Tag']],
    },
    {
        id: 'FINAL REVIEW', label: 'Final Review', icon: 'ClipboardCheck', group: 'approvals', removable: true,
        guidance: 'Review the project’s details and outstanding work before marking it complete.',
        requirements: [['customer_name', 'Customer Name']],
    },
    {
        id: 'COMPLETED', label: 'Completed', icon: 'CheckCircle2', group: 'closed', pin: 'last', terminal: true,
        guidance: 'Browse completed projects and their saved history.',
        requirements: [],
    },
    {
        id: 'LOST PROJECT', label: 'Lost Project', icon: 'PauseCircle', group: 'closed', pin: 'last', terminal: true, parking: true,
        guidance: 'Review projects that did not go ahead and the recorded reasons.',
        requirements: [],
    },
];

export const BUILTIN_STAGE_IDS = Object.freeze(BUILTIN_STAGES.map(stage => stage.id));

// Every built-in id keyed by its constant name: STAGE_IDS.MATERIAL_DELIVERY.
// Always complete, even when the client switched a stage off, so a query for
// a stage that is not in use simply finds nothing.
export const STAGE_IDS = Object.freeze(Object.fromEntries(BUILTIN_STAGES.map(stage => [stage.id.replace(/ /g, '_'), stage.id])));

// Ids the customer modal already uses for non-stage tabs, plus old stage ids
// still accepted on existing records. A custom stage may not use any of them.
export const RESERVED_STAGE_IDS = Object.freeze([
    ...BUILTIN_STAGE_IDS, 'DOCUMENTS', 'HISTORY', 'CUSTOMER_CARD', 'CUSTOMER CARD',
    'MATERIAL INSTALLATION', 'COMMISSIONING', 'HOLD PROCUREMENT',
]);

export const CUSTOM_STAGE_ID = /^[A-Z][A-Z0-9 ]{1,39}$/;

// Lucide icon names a custom stage may use (mapped to components in config/icons.js).
export const STAGE_ICON_NAMES = Object.freeze([
    'Users', 'ClipboardList', 'IndianRupee', 'Banknote', 'ShoppingBag', 'Package', 'Truck', 'Wrench', 'Camera',
    'Send', 'Gauge', 'ClipboardCheck', 'Tag', 'CheckCircle2', 'PauseCircle', 'FileText', 'Home', 'Phone',
    'Calendar', 'Zap', 'Sun', 'Hammer', 'Ruler', 'ShieldCheck', 'Star', 'Flag',
]);
