// src/constants.js
//
// Stages and status tags vary per client: they come from src/config
// (client.config.js) and are re-exported here so existing imports keep working.

import {
    PRIMARY_STAGES, STAGE_IDS, SUBSIDY_TAGS, LOAN_TAGS, INSTALLATION_TAGS, HOLD_STATUS_TAGS,
    isRoleEnabled,
} from './config/index.js';

export { PRIMARY_STAGES, STAGE_IDS, SUBSIDY_TAGS, LOAN_TAGS, INSTALLATION_TAGS, HOLD_STATUS_TAGS };

export const SUBSIDY_TAG_COLORS = {
    'Received':   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
    'Inprocess':  { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-400' },
    'In Process': { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-400' },
    'Redeemed':   { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-400' },
    'Returned':   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    'Approved':   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-400' },
    'Rejected':   { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-400' },
};

export const LOAN_TAG_COLORS = {
    'Inprocess':                   { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-400' },
    'Reject':                      { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-400' },
    'Total Loan Payment Received': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
    'Processed':   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-400' },
    'In Progress': { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-400' },
    '1st Payment': { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-400' },
    '2nd Payment': { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-400' },
    'Sanctioned':  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
    'Returned':    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    'Rejected':    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-400' },
    'All Clear':   { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};


export const APP_ROLES = [
    { id: 'admin', label: 'Admin', user_type: 'admin', role: 'Admin' },
    { id: 'office', label: 'Office', user_type: 'sales', role: 'Office' },
    { id: 'channel_partner_office', label: 'Channel Partner Office', user_type: 'channel_partner_office', role: 'Channel Partner Office' },
    { id: 'office2', label: 'Manager', user_type: 'office2', role: 'Channel Partner Manager' },
    { id: 'agent2', label: 'Dealer', user_type: 'agent2', role: 'Channel Partner' },
    { id: 'channel_partner', label: 'Channel Partners', user_type: 'agent', role: 'Channel Partners' },
    { id: 'vendor', label: 'Vendors', user_type: 'vendor', role: 'Vendors' },
];

// Login types switched on for this client (see config/catalog/features.js).
export const enabledRoles = () => APP_ROLES.filter(role => isRoleEnabled(role.user_type));


// ════════════════════════════════════════════════════════════
// INSTALLATION STATUS TAGS
// ════════════════════════════════════════════════════════════
export const INSTALLATION_TAG_COLORS = {
    'Giveup':     { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-400' },
    'In process': { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-400' },
    'Installed':  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
    'Yes':     { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Process': { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500' },
    'Pending': { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    'Give Up': { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' }
};

// ════════════════════════════════════════════════════════════
// DOCUMENT TYPE LABELS
// ════════════════════════════════════════════════════════════
export const DOC_TYPE_LABELS = {
    application_acknowledgment: 'Application Acknowledgment',
    vendor_feasibility: 'Vendor Feasibility',
    site_feasibility: 'Site Feasibility',
    adhaar_card_front: 'Aadhaar Card (Front)',
    adhaar_card_back: 'Aadhaar Card (Back)',
    pan_card: 'PAN Card',
    light_bill: 'Electricity / Light Bill',
    index_2: 'Index-2 / Name Match Copy',
    bank_details: 'Bank Passbook / Cheque',
    house_geo_tag_photo: 'House Photo with Geo Tag',
    extra_docs: 'Extra Documents',
    geo_tag_image: 'Site / Geo Tag Photo',
    sfdc_photo: 'SFDC Photo',
    file_status: 'File Status Doc',
    dcr_certificate: 'DCR Certificate',
    pcr_certificate: 'PCR Certificate',
    plant_commissioning_report: 'Plant Commissioning Report',
    signature_pic: 'Customer Signature',
    signature: 'Customer Signature',
    firstPartySignature: 'Customer Signature',
    customer_signature: 'Customer Signature',
    stamp: 'Vendor Stamp',
    stamp_pic: 'Vendor Stamp',
    vendor_stamp: 'Vendor Stamp',
    secondPartyStamp: 'Vendor Stamp',
    pm_surya_ghar_stamp: 'Discom Submission (Stamped)',
    surya_gpa_stamp: 'PM Surya GPA Stamp',
    gpa_stamp: 'PM Surya GPA Stamp',
    meter_installation_photo: 'Meter Installation Photo',
    meter_photo: 'Meter Installation Photo',
    insurance_status: 'Insurance Document',
    feasibilty_document: 'Feasibility Document',
    feasibility_document: 'Feasibility Document',
    subsidy_token_photo: 'Subsidy Token Photo',
    digital_certificate: 'Digital Certificate',
    discom_agreement: 'PM Surya Ghar Model Agreement'
};

// Which doc_type actually corresponds to a real boolean column on `admin`.
//
// Uploading a document auto-ticks the matching checklist flag. That write used
// to use the doc_type itself as the column name, so any doc_type that is only
// an alias (signature, stamp_pic, meter_photo...) or has no column at all
// (file_status - the column was dropped) made Postgres reject the whole
// update with "Could not find the '<x>' column of 'admin' in the schema
// cache". A doc_type absent from this map simply does not set a flag.
export const DOC_TYPE_FLAG_COLUMN = {
    application_acknowledgment: 'application_acknowledgment',
    vendor_feasibility:         'vendor_feasibility',
    site_feasibility:           'site_feasibility',
    adhaar_card_front:          'adhaar_card_front',
    adhaar_card_back:           'adhaar_card_back',
    pan_card:                   'pan_card',
    light_bill:                 'light_bill',
    index_2:                    'index_2',
    bank_details:               'bank_details',
    house_geo_tag_photo:        'house_geo_tag_photo',
    extra_docs:                 'extra_docs',
    geo_tag_image:              'geo_tag_image',
    sfdc_photo:                 'sfdc_photo',
    dcr_certificate:            'dcr_certificate',
    pcr_certificate:            'pcr_certificate',
    plant_commissioning_report: 'plant_commissioning_report',
    digital_certificate:        'digital_certificate',
    subsidy_token_photo:        'subsidy_token_photo',
    insurance_status:           'insurance_status',
    pm_surya_ghar_stamp:        'pm_surya_ghar_stamp',
    discom_agreement:           'discom_agreement',
    // Aliases -> the one real column they belong to
    signature_pic:              'signature_pic',
    signature:                  'signature_pic',
    firstPartySignature:        'signature_pic',
    customer_signature:         'signature_pic',
    stamp:                      'stamp',
    stamp_pic:                  'stamp',
    vendor_stamp:               'stamp',
    secondPartyStamp:           'stamp',
    meter_installation_photo:   'meter_installation_photo',
    meter_photo:                'meter_installation_photo',
    // The real column carries the original spelling of "feasibilty"
    feasibilty_document:        'feasibilty_document',
    feasibility_document:       'feasibilty_document',
    // Intentionally unmapped: file_status, surya_gpa_stamp, gpa_stamp.
    // NOTE on file_status: a column of that name exists again, but it is TEXT,
    // not boolean. This map sets its target to `true` on upload, so mapping
    // file_status here would write a boolean into a text column and fail the
    // whole update. Leave it out.
};

// ════════════════════════════════════════════════════════════
// ACTIVITY LOG & ACTION COLORS
// ════════════════════════════════════════════════════════════
export const ACTION_COLORS = {
    create:       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Created' },
    update:       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500',    label: 'Updated' },
    delete:       { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500',    label: 'Deleted' },
    recall:       { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Recalled' },
    upload:       { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500',  label: 'Uploaded' },
    download:     { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500',  label: 'Downloaded' },
    login:        { bg: 'bg-stone-50',   text: 'text-stone-700',   border: 'border-stone-200',   dot: 'bg-stone-500',   label: 'Logged In' },
    attendance:   { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500',    label: 'Attendance' },
    operations:   { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: 'bg-cyan-500',    label: 'Operations' },
    vendor:       { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500',  label: 'Vendor' },
    payment:      { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-600', label: 'Payment' },
    dispatch:     { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300',   dot: 'bg-amber-600',   label: 'Dispatch' },
    stage_change: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500',  label: 'Stage' },
};

// ════════════════════════════════════════════════════════════
// CHECKLIST FIELDS
// ════════════════════════════════════════════════════════════
export const REG_CHECKLIST_FIELDS = [
    { field: 'adhaar_card_front', label: 'Adhaar Card (Front)' },
    { field: 'adhaar_card_back', label: 'Adhaar Card (Back)' },
    { field: 'pan_card', label: 'PAN Card' },
    { field: 'index_2', label: 'Index-2' },
    { field: 'light_bill', label: 'Light Bill' },
    { field: 'bank_details', label: 'Bank Details' },
    { field: 'house_geo_tag_photo', label: 'House Photo with Geo Tag' },
    { field: 'extra_docs', label: 'Extra Docs' },
];

// Every column of public.admin in backend/schema.sql. Used by
// sanitizeAdminUpdate() to strip keys that are not real columns before a write.
//
// WHY: several save paths write { ...editData }, i.e. the whole customer row.
// PostgREST rejects the ENTIRE update with 42703 if even one key is not a
// column, so a single stale key made every save in the Dealer Portal fail
// ("Could not find the 'file_status' column of 'admin' in the schema cache").
//
// KEEP THIS IN SYNC. If you add a column to `admin`, add it here too, or
// writes to it are dropped (a console warning is logged when that happens).
export const ADMIN_COLUMNS = new Set([
    'ac_cable',
    'custom_fields',
    'adhaar_card_back',
    'adhaar_card_front',
    'application_acknowledgment',
    'application_done_by',
    'bank_branch',
    'bank_details',
    'bank_name',
    'bom_data',
    'bom_stock_issued_at',
    'cash_details',
    'channel_partner',
    'completed_at',
    'consumer_no',
    'created_at',
    'customer_name',
    'dc_cable',
    'dcr_certificate',
    'deleted_at',
    'delivery_batch_id',
    'delivery_status',
    'digital_certificate',
    'discom_inspection',
    'discom_submission',
    'driver_name',
    'driver_phone_number',
    'email_address',
    'extra_docs',
    'feasibility_no',
    'feasibilty_document',
    'folder_no',
    'full_address',
    'follow_ups',
    'geo_tag_image',
    'geo_tag_status',
    'google_drive_link',
    'hold_procurement',
    'house_geo_tag_photo',
    'id',
    'index_2',
    'installation_date',
    'installation_note',
    'installation_status',
    'insurance_status',
    'internal_remarks',
    'inverter_make',
    'inverter_serial_no',
    'invoice_no',
    'invoice_value',
    'jansamarth_application_no',
    'lead_creator_profile_id',
    'light_bill',
    'loan_history',
    'loan_by',
    'loan_registration_date',
    'loan_tag',
    'location_link',
    'material_delivery_date',
    'material_order_notes',
    'meter_installation',
    'meter_installation_photo',
    'module_brand',
    'module_wp',
    'no_of_modules',
    'pan_card',
    'pcr_certificate',
    'panel',
    'panel_serial_no',
    'payment_type',
    'plant_commissioning_report',
    'phone_number',
    'pincode',
    'pm_surya_ghar_stamp',
    'registration_by',
    'registration_date',
    'registration_no',
    'roof_shed',
    'sfdc_photo',
    // Free-text siblings of the sfdc_photo / warranty_card checkboxes, plus
    // file_status which has no checkbox at all. These MUST be listed here - a
    // column missing from ADMIN_COLUMNS is stripped by sanitizeAdminUpdate, so
    // the field would save "successfully" and write nothing.
    'sfdc_photo_text',
    'warranty_card_text',
    'file_status',
    'signature_pic',
    'site_feasibility',
    'stage',
    'stages_remarks',
    'stamp',
    'structure_front_leg_height',
    'structure_rear_leg_height',
    'sub_channel_partner',
    'sub_divisions',
    'district',
    'subsidy_history',
    'subsidy_tag',
    'subsidy_token_photo',
    'system_capacity_kwp',
    'updated_at',
    'vehicle_number',
    'vendor',
    'vendor_feasibility',
    'vendor_give_up_approved',
    'vendor_note',
    'vendor_paid_by',
    'vendor_paid_date',
    'vendor_payment_status',
    'vendor_quote',
    'villages',
    'warranty_card'
]);

// Numeric columns of public.admin. Postgres rejects '' in these
// ("invalid input syntax for type numeric"), so writes turn '' into null.
// Phone numbers and folder numbers are text and keep their leading 0 / +.
export const ADMIN_NUMERIC_COLUMNS = [
    'ac_cable',
    'dc_cable',
    'invoice_value',
    'module_wp',
    'no_of_modules',
    'structure_front_leg_height',
    'structure_rear_leg_height',
    'system_capacity_kwp',
    'vendor_quote',
];

// Optimized Column Selectors for List Views (prevents downloading 67+ full columns)
// Verified against the live `admin` schema on 2026-08-29. Every name here must
// be a real column - PostgREST rejects the WHOLE query with 42703 otherwise,
// which is how these views once went completely empty. Six phantom columns
// (crn, remarks, vendor_status, location_link, google_docs, bank_name) were
// removed from this list.
// Also covers the fields handleMoveStage validates before letting a lead leave
// the Leads stage (villages, module_brand, sub_divisions) - narrowing the grid
// query without these would make that check see undefined and falsely block.
export const CUSTOMER_CARD_COLUMNS = 'id, customer_name, phone_number, email_address, consumer_no, folder_no, stage, channel_partner, sub_channel_partner, payment_type, loan_tag, subsidy_tag, installation_status, system_capacity_kwp, module_brand, module_wp, no_of_modules, villages, full_address, pincode, sub_divisions, district, registration_date, invoice_value, vendor_quote, created_at, updated_at, deleted_at, delivery_batch_id, delivery_status, stages_remarks, vendor, geo_tag_status, google_drive_link, location_link';

// cpo_leads is `select * from admin`, so both sources share one column list.
export const getCustomerCardColumns = () => CUSTOMER_CARD_COLUMNS;


// Vendor list cards and stage counters do not need the full admin record. The
// complete record is fetched only when a vendor opens one assignment.
export const VENDOR_LIST_COLUMNS = 'id, customer_name, phone_number, email_address, consumer_no, folder_no, stage, vendor, deleted_at, installation_status, geo_tag_status, villages, sub_divisions, district, system_capacity_kwp, module_brand, module_wp, no_of_modules, material_delivery_date, installation_date, vendor_quote, vendor_payment_status, vendor_paid_date, created_at, updated_at';


// A tag value is "final" when it is the terminal state of its set. Reaching it
// locks the field for everyone except Admin. Driven by the isFinal flag on the
// tag definitions above, so changing which value locks is a one-word edit.
export const isFinalTagValue = (value, tags = []) => {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return false;
    return tags.some(t => t.isFinal && String(t.id).trim().toLowerCase() === v);
};
