import { ClipboardList, Eye, Phone } from 'lucide-react';
import { STAGE_IDS, isOn, customFieldsForStage, readPath } from '../config/index.js';
import { FieldList } from '../ui/index.js';
import { formatDate, formatINR } from '../lib/format.js';
import { readModuleSerials } from '../serials/record.js';
import { getTelephoneHref } from '../utils';

// A read-only row: the first non-empty path wins. `when` hides the row while
// the feature it belongs to is off.
const row = (label, paths, { type, when } = {}) => ({ label, paths: [].concat(paths), type, when });
const partnersOn = () => isOn('channelPartners') || isOn('cpos');
const dealersOn = () => isOn('dealers');
const installerLoginsOn = () => isOn('vendorLogin');
const stampLoginOn = () => isOn('stampLogin');
const warrantyOn = () => isOn('warrantyTracking');
const subsidyOn = () => isOn('subsidyTracking');

const LEAD_ROWS = [
    row('Customer Name', 'customer_name'), row('Phone Number', 'phone_number', { type: 'phone' }), row('Email', 'email_address'),
    row('Consumer No', 'consumer_no'), row('Village / Address', 'villages'), row('Sub Division', 'sub_divisions'),
    row('Partner', 'channel_partner', { when: partnersOn }), row('Dealer', 'sub_channel_partner', { when: dealersOn }),
    row('Module Brand', 'module_brand'), row('Module WP', 'module_wp'), row('No. of Modules', 'no_of_modules'),
    row('System Capacity', 'system_capacity_kwp', { type: 'kwp' }), row('Payment Type', 'payment_type'),
];

const STAGE_FIELDS = {
    [STAGE_IDS.LEADS]: LEAD_ROWS,
    [STAGE_IDS.REGISTRATION]: [
        row('Registration Date', 'registration_date'), row('Registration By', 'registration_by'),
        row('Registration / Feasibility No.', ['registration_no', 'feasibility_no']), row('File No.', 'folder_no'),
        row('Application Acknowledgment', 'application_acknowledgment'), row('Feasibility Document', 'feasibilty_document'),
        row('Subsidy Token Photo', 'subsidy_token_photo', { when: subsidyOn }),
    ],
    [STAGE_IDS.LOAN]: [
        row('Jansamarth Application No.', 'jansamarth_application_no'), row('Loan Status', 'loan_tag'),
        row('Vendor Feasibility', 'vendor_feasibility'), row('Site Feasibility', 'site_feasibility'),
        row('Digital Certificate', 'digital_certificate'), row('Loan Timeline', 'loan_history'),
    ],
    [STAGE_IDS.CASH]: [
        row('Total Amount', 'cash_details.total_amount', { type: 'money' }), row('Payments', 'cash_details.payments'),
        row('Total Received', 'cash_details.total_received', { type: 'money' }),
        row('Balance Remaining', 'cash_details.balance_remaining', { type: 'money' }),
    ],
    [STAGE_IDS.MATERIAL_ORDER]: [
        row('Roof / Shed', 'roof_shed'), row('DC Cable', 'dc_cable'), row('AC Cable', 'ac_cable'),
        row('Front Leg Height', 'structure_front_leg_height'), row('Rear Leg Height', 'structure_rear_leg_height'),
        row('Invoice Value', 'invoice_value', { type: 'money' }), row('Notes / Instructions', 'material_order_notes'),
    ],
    [STAGE_IDS.MATERIAL_INTEGRATION]: [
        row('Inverter Make', 'inverter_make'), row('Inverter Serial No.', 'inverter_serial_no'),
        row('Panel Serial Numbers', 'panel_serial_no', { type: 'serials' }), row('Integration By', 'integration_by'),
    ],
    [STAGE_IDS.MATERIAL_DELIVERY]: [
        row('Vendor', 'vendor'), row('Invoice No.', 'invoice_no'), row('Delivery Date', 'material_delivery_date'),
        row('Vehicle / Truck No.', ['vehicle_number', 'delivery_vehicle_no']), row('Driver Name', 'driver_name'),
        row('Driver Phone Number', 'driver_phone_number', { type: 'phone' }), row('Delivery Status', 'delivery_status'),
    ],
    [STAGE_IDS.INSTALLATION_STATUS]: [
        // The installer's quote and payment are admin-only, so they are not listed here.
        row('Installation Status', 'installation_status'), row('Installation Date', 'installation_date'),
        row('Assigned Vendor', 'vendor'),
        row('Installer Note / Give-up Reason', 'vendor_note', { when: installerLoginsOn }),
        row('Give-up Approved', 'vendor_give_up_approved', { when: installerLoginsOn }),
        row('Installation Note', 'installation_note'), row('Material Delivery Date', 'material_delivery_date'),
    ],
    [STAGE_IDS.GEO_TAG_PHOTO]: [
        row('Geo Tag Status', 'geo_tag_status'), row('Geo Tag Image', 'geo_tag_image'),
    ],
    [STAGE_IDS.DISCOM_SUBMISSION]: [
        row('Submitted By', 'discom_submission.submitted_by'), row('Submission Date', 'discom_submission.date'),
        row('First Party', 'discom_submission.first_party'), row('Second Party', 'discom_submission.second_party'),
        row('Purchased Party', 'discom_submission.purchased_party'), row('Stamp Value', 'discom_submission.stamp_value'),
        row('Stamp Description', 'discom_submission.stamp_description'),
        row('Sent to Stamp Maker', 'discom_submission.sent_to_stamp_maker', { when: stampLoginOn }),
        row('Stamp Sent', 'discom_submission.stamp_sent', { when: stampLoginOn }),
        row('Stamp Remark', 'discom_submission.stamp_remark', { when: stampLoginOn }),
        row('Send-back Remark', 'discom_submission.stamp_sendback_remark', { when: stampLoginOn }),
        row('Agreement Execution Date', 'stages_remarks.discom_agreement_date'),
    ],
    [STAGE_IDS.METER_INSTALLATION]: [
        row('Meter Installation', 'meter_installation'), row('Meter Installation Date', 'installation_date'),
        row('Meter Installation Photo', 'meter_installation_photo'),
    ],
    [STAGE_IDS.DISCOM_INSPECTION]: [row('Discom Inspection', 'discom_inspection')],
    [STAGE_IDS.SUBSIDY_STATUS]: [
        row('Subsidy Status', 'subsidy_tag'), row('Subsidy Amount', 'subsidy_amount', { type: 'money' }),
        row('Subsidy Timeline', 'subsidy_history'),
    ],
    [STAGE_IDS.FINAL_REVIEW]: [
        row('Warranty Card', 'warranty_card', { when: warrantyOn }), row('Insurance Status', 'insurance_status'),
    ],
    [STAGE_IDS.LOST_PROJECT]: [
        row('Status', ['hold_procurement.hold_status', 'hold_procurement']),
        row('Previous Stage', 'hold_procurement.previous_stage'),
        row('Hold / Lost Date', 'hold_procurement.hold_date'),
        row('Comment', 'hold_procurement.comment'),
        row('Last Updated', 'hold_procurement.updated_at'),
    ],
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const isBlank = value => value === null || value === undefined || value === '';

// Dates are shown in India time, whatever the device timezone.
const displayScalar = (value) => {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    const text = String(value);
    if (DATE_ONLY.test(text)) return formatDate(text, 'short');
    if (TIMESTAMP.test(text)) return formatDate(text, 'datetime');
    return text;
};

const displayValue = (value, type) => {
    if (isBlank(value)) return '–';
    if (type === 'money') return formatINR(value, { zero: '₹0' });
    if (type === 'kwp') return `${value} kWp`;
    if (Array.isArray(value)) {
        if (!value.length) return '–';
        return value.map((item, index) => (item && typeof item === 'object'
            ? `${item.status || item.payment_type || `Entry ${index + 1}`}${item.amount ? ` - ${formatINR(item.amount)}` : ''}${item.date ? ` (${displayScalar(item.date)})` : ''}${item.remark ? ` - ${item.remark}` : ''}`
            : displayScalar(item))).join('\n');
    }
    if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replace(/_/g, ' ')}: ${displayValue(item)}`).join('\n');
    return displayScalar(value);
};

// hold_procurement is a text column the app writes objects into.
const parseMaybeJson = (value) => {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) return value;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : value;
    } catch {
        return value;
    }
};

/** The client's extra fields for a stage, read-only. Renders nothing when the stage has none. */
export function StageCustomFields({ stage, customer, title = 'More details', types }) {
    const fields = customFieldsForStage(stage).filter(field => !types || types.includes(field.type));
    if (!fields.length) return null;
    return (
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h5 className="mb-1 flex items-center gap-1.5 border-b border-stone-100 pb-2 text-[10px] font-black uppercase tracking-widest text-stone-500">
                <ClipboardList size={12} className="text-amber-600" aria-hidden="true" /> {title}
            </h5>
            <FieldList fields={fields} record={customer?.custom_fields || {}} variant="rows" className="text-xs" />
        </section>
    );
}

/**
 * Read-only details of one stage for the partner portal: the built-in rows
 * for that stage (rows of switched-off features left out) followed by the
 * client's extra fields. Custom stages show only their extra fields.
 * `omit` drops rows by column, e.g. ['channel_partner'] for dealers.
 */
export default function AgentStageDetails({ stage, customer, documents = [], onPreview, title = 'Stage details', omit = [] }) {
    const rows = (STAGE_FIELDS[stage] || []).filter(item => (!item.when || item.when()) && !item.paths.some(path => omit.includes(path)));
    const extraFields = customFieldsForStage(stage);
    if (!rows.length && !extraFields.length) return null;

    const record = { ...customer, hold_procurement: parseMaybeJson(customer?.hold_procurement) };
    const lines = rows.map(item => {
        const path = item.paths.find(candidate => !isBlank(readPath(record, candidate)));
        let value = path ? readPath(record, path) : null;
        if (item.type === 'serials') value = readModuleSerials(value);
        const relatedDocs = onPreview ? documents.filter(doc => item.paths.includes(doc.doc_type)) : [];
        return { ...item, value, text: displayValue(value, item.type), relatedDocs };
    });

    return (
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h5 className="mb-1 flex items-center gap-1.5 border-b border-stone-100 pb-2 text-[10px] font-black uppercase tracking-widest text-stone-500">
                <ClipboardList size={12} className="text-amber-600" aria-hidden="true" /> {title}
            </h5>
            {lines.length > 0 && (
                <dl className="divide-y divide-stone-100 text-xs">
                    {lines.map(line => {
                        const phoneHref = line.type === 'phone' ? getTelephoneHref(line.value) : null;
                        return (
                            <div key={line.label} className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.2fr)] items-center gap-3 py-2">
                                <dt className="text-[10px] font-bold uppercase leading-tight tracking-wide text-stone-500">{line.label}</dt>
                                <dd className="flex flex-col items-end gap-1.5">
                                    {phoneHref ? (
                                        <a href={phoneHref} className="flex min-h-11 items-center gap-1 font-bold text-emerald-700 hover:underline">
                                            <Phone size={11} aria-hidden="true" /> <span>{line.text}</span>
                                        </a>
                                    ) : (
                                        <span className="whitespace-pre-line break-words text-right font-semibold text-stone-900">{line.text}</span>
                                    )}
                                    {line.relatedDocs.length > 0 && (
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            {line.relatedDocs.map(doc => (
                                                <button key={doc.id} type="button" onClick={() => onPreview(doc)}
                                                    className="flex min-h-11 items-center gap-1 rounded-lg bg-stone-100 px-3 text-[10px] font-bold uppercase text-stone-700 hover:bg-stone-200">
                                                    <Eye size={11} aria-hidden="true" /> View document
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            )}
            {extraFields.length > 0 && (
                <FieldList fields={extraFields} record={customer?.custom_fields || {}} variant="rows"
                    className={`text-xs ${lines.length ? 'border-t border-stone-100' : ''}`} />
            )}
        </section>
    );
}
