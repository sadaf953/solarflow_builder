import { ClipboardList, Eye, Download, Phone } from 'lucide-react';
import { STAGE_IDS } from '../constants';
import { getTelephoneHref } from '../utils';

const STAGE_FIELDS = {
    [STAGE_IDS.LEADS]: [
        ['Customer Name', 'customer_name'], ['Phone Number', 'phone_number'], ['Email', 'email_address'],
        ['Consumer No', 'consumer_no'], ['Village / Address', 'villages'], ['Sub Division', 'sub_divisions'],
        ['Channel Partner', 'channel_partner'], ['Dealer', 'sub_channel_partner'],
        ['Module Brand', 'module_brand'], ['Module WP', 'module_wp'], ['No. of Modules', 'no_of_modules'],
        ['System Capacity', 'system_capacity_kwp'], ['Payment Type', 'payment_type'],
    ],
    [STAGE_IDS.REGISTRATION]: [
        ['Registration Date', 'registration_date'], ['Registration By', 'registration_by'],
        ['Registration / Feasibility No.', 'registration_no', 'feasibility_no'], ['File No.', 'folder_no'],
        ['Application Acknowledgment', 'application_acknowledgment'], ['Feasibility Document', 'feasibilty_document'],
        ['Subsidy Token Photo', 'subsidy_token_photo'],
    ],
    [STAGE_IDS.LOAN]: [
        ['Jansamarth Application No.', 'jansamarth_application_no'], ['Loan Status', 'loan_tag'],
        ['Vendor Feasibility', 'vendor_feasibility'], ['Site Feasibility', 'site_feasibility'],
        ['Digital Certificate', 'digital_certificate'], ['Loan Timeline', 'loan_history'],
    ],
    [STAGE_IDS.CASH]: [
        ['Total Amount', 'cash_details.total_amount'], ['Payments', 'cash_details.payments'],
        ['Total Received', 'cash_details.total_received'], ['Balance Remaining', 'cash_details.balance_remaining'],
    ],
    [STAGE_IDS.MATERIAL_ORDER]: [
        ['Roof / Shed', 'roof_shed'], ['DC Cable', 'dc_cable'], ['AC Cable', 'ac_cable'],
        ['Front Leg Height', 'structure_front_leg_height'], ['Rear Leg Height', 'structure_rear_leg_height'],
        ['Invoice Value', 'invoice_value'], ['Notes / Instructions', 'material_order_notes'],
    ],
    [STAGE_IDS.MATERIAL_INTEGRATION]: [
        ['Inverter Make', 'inverter_make'], ['Inverter Serial No.', 'inverter_serial_no'],
        ['Panel Serial Numbers', 'panel_serial_no'], ['Integration By', 'integration_by'],
    ],
    [STAGE_IDS.MATERIAL_DELIVERY]: [
        ['Vendor', 'vendor'], ['Invoice No.', 'invoice_no'], ['Delivery Date', 'material_delivery_date'],
        ['Vehicle / Truck No.', 'vehicle_number', 'delivery_vehicle_no'], ['Driver Name', 'driver_name'],
        ['Driver Phone Number', 'driver_phone_number'], ['Delivery Status', 'delivery_status'],
    ],
    [STAGE_IDS.INSTALLATION_STATUS]: [
        ['Installation Status', 'installation_status'], ['Installation Date', 'installation_date'],
        // Vendor Quote and Vendor Paid Date are deliberately NOT here: the
        // commission is admin-only (MaterialDeliveryTab gates it on
        // user?.userType === 'admin'), and this component renders inside the
        // Dealer / Channel Partner portal.
        ['Assigned Vendor', 'vendor'], ['Vendor Note / Give-up Reason', 'vendor_note'],
        ['Give-up Approved', 'vendor_give_up_approved'],
        ['Installation Note', 'installation_note'], ['Material Delivery Date', 'material_delivery_date'],
    ],
    [STAGE_IDS.GEO_TAG_PHOTO]: [
        ['Geo Tag Status', 'geo_tag_status'], ['Geo Tag Image', 'geo_tag_image'],
    ],
    [STAGE_IDS.DISCOM_SUBMISSION]: [
        ['Submitted By', 'discom_submission.submitted_by'], ['Submission Date', 'discom_submission.date'],
        ['First Party', 'discom_submission.first_party'], ['Second Party', 'discom_submission.second_party'],
        ['Purchased Party', 'discom_submission.purchased_party'], ['Stamp Value', 'discom_submission.stamp_value'],
        ['Stamp Description', 'discom_submission.stamp_description'], ['Sent to Stamp Maker', 'discom_submission.sent_to_stamp_maker'],
        ['Stamp Sent', 'discom_submission.stamp_sent'], ['Stamp Remark', 'discom_submission.stamp_remark'],
        ['Send-back Remark', 'discom_submission.stamp_sendback_remark'], ['Agreement Execution Date', 'stages_remarks.discom_agreement_date'],
    ],
    [STAGE_IDS.METER_INSTALLATION]: [
        ['Meter Installation', 'meter_installation'], ['Meter Installation Date', 'installation_date'],
        ['Meter Installation Photo', 'meter_installation_photo'],
    ],
    [STAGE_IDS.DISCOM_INSPECTION]: [['Discom Inspection', 'discom_inspection']],
    [STAGE_IDS.SUBSIDY_STATUS]: [
        ['Subsidy Status', 'subsidy_tag'], ['Subsidy Amount', 'subsidy_amount'], ['Subsidy Timeline', 'subsidy_history'],
    ],
    [STAGE_IDS.FINAL_REVIEW]: [
        ['Warranty Card', 'warranty_card'], ['Insurance Status', 'insurance_status'],
    ],
    [STAGE_IDS.LOST_PROJECT]: [
        ['Status', 'hold_procurement.hold_status', 'hold_procurement'],
        ['Previous Stage', 'hold_procurement.previous_stage'],
        ['Hold / Lost Date', 'hold_procurement.hold_date'],
        ['Comment', 'hold_procurement.comment'],
        ['Last Updated', 'hold_procurement.updated_at'],
    ],
};

const readPath = (record, path) => path.split('.').reduce((value, key) => value?.[key], record);

// Panel serials are stored as a JSON string, a newline list or a comma list
// depending on where they were entered. Normalize so the row reads as a list.
const parsePanelSerials = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(value => String(value || '').trim()).filter(Boolean);
    const rawText = String(raw);
    try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) return parsed.map(value => String(value || '').trim()).filter(Boolean);
    } catch { /* not JSON */ }
    return rawText.split(/[\n,]/).map(value => value.trim()).filter(Boolean);
};

const displayValue = (value) => {
    if (value === null || value === undefined || value === '') return '–';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (!value.length) return '–';
        return value.map((item, index) => typeof item === 'object'
            ? `${item.status || item.payment_type || `Entry ${index + 1}`}${item.amount ? ` - ₹${item.amount}` : ''}${item.date ? ` (${item.date})` : ''}${item.remark ? ` - ${item.remark}` : ''}`
            : String(item)).join('\n');
    }
    if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replace(/_/g, ' ')}: ${displayValue(item)}`).join('\n');
    return String(value);
};

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

export default function AgentStageDetails({ stage, customer, bom, bomItems = [], documents = [], onPreview, onDownload }) {
    const fields = STAGE_FIELDS[stage] || [];
    if (!fields.length) return null;

    // hold_procurement is a text column the app writes objects into.
    customer = { ...customer, hold_procurement: parseMaybeJson(customer?.hold_procurement) };

    const rows = fields.map(([label, ...paths]) => {
        const pathMatch = paths.find(path => readPath(customer, path) !== null && readPath(customer, path) !== undefined && readPath(customer, path) !== '');
        let value = pathMatch ? readPath(customer, pathMatch) : null;
        if (pathMatch === 'panel_serial_no') value = parsePanelSerials(value);
        
        // Find matching documents by field name (path)
        const relatedDocs = documents.filter(d => paths.includes(d.doc_type));

        return [label, displayValue(value), relatedDocs];
    });

    if (stage === STAGE_IDS.MATERIAL_INTEGRATION) {
        rows.push(['BOM Type', displayValue(bom?.bom_type), []]);
        rows.push(['Paper Prepared By / Date', displayValue([bom?.paper_prepared_by, bom?.paper_prepared_date].filter(Boolean).join(' - ')), []]);
        rows.push(['Material Loaded By / Date', displayValue([bom?.material_loaded_by, bom?.material_loaded_date].filter(Boolean).join(' - ')), []]);
        rows.push(['BOM Items', bomItems.length ? `${bomItems.length} item${bomItems.length === 1 ? '' : 's'}` : '–', []]);
    }

    return (
        <section className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <h5 className="text-[9px] font-black text-stone-500 uppercase tracking-widest border-b border-stone-150 pb-2 mb-1 flex items-center gap-1.5">
                <ClipboardList size={12} className="text-amber-600" /> Complete Stage Details
            </h5>
            <div className="divide-y divide-stone-100 text-xs">
                {rows.map(([label, value, relatedDocs]) => (
                    <div key={label} className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1.2fr)] gap-3 py-2 items-center">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide leading-tight">{label}</span>
                        <div className="flex flex-col items-end gap-1.5">
                            {label.toLowerCase().includes('phone') && getTelephoneHref(value) ? (
                                <a
                                    href={getTelephoneHref(value)}
                                    className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                                    title={`Click to call ${value}`}
                                >
                                    <Phone size={11} className="text-emerald-500 flex-shrink-0" />
                                    <span>{value}</span>
                                </a>
                            ) : (
                                <span className="font-semibold text-stone-900 whitespace-pre-line break-words text-right">{value}</span>
                            )}
                            {relatedDocs && relatedDocs.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap justify-end">
                                    {relatedDocs.map(doc => (
                                        <div key={doc.id} className="flex gap-1">
                                            {onPreview && (
                                                <button type="button" onClick={() => onPreview(doc)} className="bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded text-[9px] font-bold uppercase flex items-center gap-1 transition-colors">
                                                    <Eye size={10} /> View Document
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
