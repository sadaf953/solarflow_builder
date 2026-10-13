// Dropdown lists a client can set up.
//
// storage 'metadata': rows in public.metadata (category = id). The setup SQL
//   seeds them, and admins keep editing them on the Operations page.
// storage 'config': status tags whose ids the code compares against. Ids are
//   stored on customer records, so only labels may change, and `lockedIds`
//   can never be removed. `extendable` lists also accept new tags.

export const DROPDOWN_CATALOG = {
    module_brand: {
        label: 'Solar panel brands', storage: 'metadata', usedIn: 'Leads, quotations and the BOM',
        help: 'The panel brands you install.',
        defaults: ['ADANI', 'WAAREE', 'TATA', 'GOLDI', 'APS'],
    },
    module_wp: {
        label: 'Panel wattage (Wp)', storage: 'metadata', usedIn: 'Leads and system size',
        help: 'Panel sizes you sell, in watts. Numbers only.', numeric: true,
        defaults: ['540', '545', '550', '575', '580', '585', '590', '600', '610', '620'],
    },
    inverter_make: {
        label: 'Inverter brands', storage: 'metadata', usedIn: 'Material Integration and the BOM',
        help: 'The inverter makes you install.',
        defaults: ['Goodwe', 'UTL', 'Solax', 'Solaryaan'],
    },
    registration_by: {
        label: 'Registration staff', storage: 'metadata', usedIn: 'Registration, Loan and DISCOM submission',
        help: 'Names of the people who file registrations and DISCOM papers.',
        defaults: [],
    },
    integration_by: {
        label: 'Store / material staff', storage: 'metadata', usedIn: 'BOM preparation and loading',
        help: 'Names of the people who prepare and load material.',
        defaults: [],
    },
    payment_method_modes: {
        label: 'Ways customers pay', storage: 'metadata', usedIn: 'Cash payments',
        help: 'How customers pay you directly.',
        defaults: ['Cash', 'Online / UPI', 'Cheque', 'DD'],
    },

    loan_tags: {
        label: 'Loan statuses', storage: 'config', extendable: true, usedIn: 'Loan stage and loan tracking',
        help: 'Steps a solar loan goes through.',
        lockedIds: ['1st Payment', '2nd Payment', 'Total Loan Payment Received'],
        defaults: [
            { id: 'Inprocess', label: 'In process' },
            { id: 'Sanctioned', label: 'Sanctioned' },
            { id: 'Returned', label: 'Returned' },
            { id: 'Reject', label: 'Rejected' },
            { id: '1st Payment', label: '1st Payment' },
            { id: '2nd Payment', label: '2nd Payment' },
            { id: 'Total Loan Payment Received', label: 'Total Received', isFinal: true },
        ],
    },
    subsidy_tags: {
        label: 'Subsidy statuses', storage: 'config', extendable: true, usedIn: 'Subsidy stage and subsidy tracking',
        help: 'Steps the PM Surya Ghar subsidy goes through. The last one means the money is received.',
        lockedIds: ['Received'],
        defaults: [
            { id: 'Inprocess', label: 'In process' },
            { id: 'Redeemed', label: 'Redeemed' },
            { id: 'Returned', label: 'Returned' },
            { id: 'Approved', label: 'Approved' },
            { id: 'Received', label: 'Received', isFinal: true },
        ],
    },
    installation_tags: {
        label: 'Installation statuses', storage: 'config', extendable: false, usedIn: 'Installation stage and installer logins',
        help: 'You can rename these, but not add or remove them.',
        lockedIds: ['Giveup', 'In process', 'Pending', 'Installed'],
        defaults: [
            { id: 'Pending', label: 'Pending' },
            { id: 'In process', label: 'In process' },
            { id: 'Installed', label: 'Installed', isFinal: true },
            { id: 'Giveup', label: 'Given up' },
        ],
    },
    hold_status_tags: {
        label: 'Lost project outcomes', storage: 'config', extendable: true, usedIn: 'Lost Project stage',
        help: 'What happened to a project that stopped.',
        lockedIds: [],
        defaults: [
            { id: 'Project Win', label: 'Project Win' },
            { id: 'Project Lost', label: 'Project Lost' },
            { id: 'Project Return Win', label: 'Project Return Win' },
        ],
    },
};

export const METADATA_CATEGORIES = Object.freeze(
    Object.entries(DROPDOWN_CATALOG).filter(([, d]) => d.storage === 'metadata').map(([id]) => id),
);
export const TAG_LISTS = Object.freeze(
    Object.entries(DROPDOWN_CATALOG).filter(([, d]) => d.storage === 'config').map(([id]) => id),
);

// Field types a client may use for their own extra fields.
export const CUSTOM_FIELD_TYPES = {
    text: 'Short text',
    textarea: 'Long text',
    number: 'Number',
    money: 'Amount (₹)',
    date: 'Date',
    select: 'Dropdown',
    yesno: 'Yes / No',
    phone: 'Phone number',
    file: 'File / photo upload',
};

export const CUSTOM_FIELD_KEY = /^[a-z][a-z0-9_]{1,39}$/;
