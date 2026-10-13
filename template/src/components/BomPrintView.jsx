// ─── BomPrintView.jsx ───────────────────────────────────────────────────────
// Two-page BOM / Material Loading Checklist, matching the document the earlier
// print produced: both pages carry the company header, the type box, the page
// pill and the footer page number. Page 1 is the site/equipment reference,
// page 2 is the equipment checklist keyed to the BOM template columns
// (product_name / quantity / uom / integration_by / note).
// ────────────────────────────────────────────────────────────────────────────

import React from 'react';

// Indian grouping that keeps the decimal part intact - capacity is a kWp value
// like 32.94, and the previous substring approach turned that into "32,.94".
const toIndianCommas = (val) => {
    const n = Number(String(val).replace(/,/g, ''));
    if (isNaN(n) || val === '' || val == null) return '';
    const [intPart, decPart] = n.toString().split('.');
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + lastThree;
    return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
};

// Serials are stored as a JSON string, a newline list or a comma list.
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

const dash = (value) => {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text === '' ? '–' : text;
};

const PageHeader = ({ label, page }) => (
    <div className="mb-4">
        <div className="text-center">
            <h1 className="text-xl font-black uppercase tracking-wider text-stone-950">SolarFlow Demo Energy</h1>
            <p className="text-[11px] font-semibold text-stone-600 mt-0.5">Solar PV Project Integration &amp; Material Loading Checklist</p>
        </div>
        <div className="flex items-center justify-between mt-3">
            <div className="px-3 py-1 border border-stone-400 rounded text-[11px] font-black uppercase tracking-widest text-stone-800">
                {label}
            </div>
            <div className="px-2.5 py-1 bg-stone-900 text-white font-black text-[10px] rounded uppercase tracking-wider">
                Page {page} of 2
            </div>
        </div>
    </div>
);

const PageFooter = ({ page }) => (
    <div className="mt-6 border-t border-stone-300 pt-3 flex justify-between text-[9px] text-stone-400 font-semibold">
        <div>SolarFlow Demo Energy</div>
        <div>BOM Page {page} of 2</div>
    </div>
);

const SectionTitle = ({ children, right }) => (
    <h3 className="text-[11px] font-black uppercase tracking-wider text-stone-900 border-b border-stone-400 pb-1 mb-1.5 flex items-center justify-between">
        <span>{children}</span>
        {right && <span className="text-[9px] font-bold text-stone-600 tracking-widest">{right}</span>}
    </h3>
);

// Label / value pair inside the reference tables.
const Cell = ({ label, value, wide }) => (
    <>
        <td className="w-[22%] px-2 py-1 border border-stone-300 text-[10px] font-semibold text-stone-600 align-middle">{label}</td>
        <td className={`${wide ? '' : 'w-[28%]'} px-2 py-1 border border-stone-300 text-[10px] font-bold text-stone-900 align-middle`} colSpan={wide ? 3 : 1}>
            {value}
        </td>
    </>
);

export default function BomPrintView({ customer, bom, bomItems, activeType }) {
    const panelSerials = parsePanelSerials(customer?.panel_serial_no);
    const type = activeType || bom?.bom_type || 'ROOF';
    const legHeight = (customer?.structure_front_leg_height || customer?.structure_rear_leg_height)
        ? `Front: ${dash(customer?.structure_front_leg_height)} ft / Rear: ${dash(customer?.structure_rear_leg_height)} ft`
        : '–';

    return (
        <div className="w-full">
            {/* ================= PAGE 1 ================= */}
            <div className="print-page-1 flex flex-col justify-between min-h-[1000px]">
                <div>
                    <PageHeader label={`Bill of Materials (BOM) - ${type} Type`} page={1} />

                    <div className="mb-4">
                        <SectionTitle>1. Customer &amp; Site Reference</SectionTitle>
                        <table className="w-full border-collapse">
                            <tbody>
                                <tr>
                                    <Cell label="Customer Name:" value={dash(customer?.customer_name)} />
                                    <Cell label="Phone Number:" value={dash(customer?.phone_number)} />
                                </tr>
                                <tr>
                                    <Cell label="Email Address:" value={dash(customer?.email_address || customer?.email)} />
                                    <Cell label="Consumer No:" value={dash(customer?.consumer_no)} />
                                </tr>
                                <tr>
                                    <Cell label="Villages:" value={dash(customer?.villages)} />
                                    <Cell label="Sub Division:" value={dash(customer?.sub_divisions)} />
                                </tr>
                                <tr>
                                    <Cell label="Channel Partner Name:" value={dash(customer?.channel_partner)} />
                                    <Cell label="Dealer Name:" value={dash(customer?.sub_channel_partner)} />
                                </tr>
                                <tr>
                                    <Cell label="MODULE BRAND:" value={dash(customer?.module_brand)} />
                                    <Cell label="MODULE WP:" value={dash(customer?.module_wp)} />
                                </tr>
                                <tr>
                                    <Cell label="No of Modules:" value={dash(customer?.no_of_modules)} />
                                    <Cell
                                        label="System Capacity (kWp):"
                                        value={customer?.system_capacity_kwp ? `${toIndianCommas(customer.system_capacity_kwp)} kWp` : '–'}
                                    />
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-4">
                        <SectionTitle>2. Material Order Specifications</SectionTitle>
                        <table className="w-full border-collapse">
                            <tbody>
                                <tr>
                                    <Cell label="Roof / Shed:" value={dash(customer?.roof_shed)} />
                                    <Cell label="Structure Leg Height:" value={legHeight} />
                                </tr>
                                <tr>
                                    <Cell label="DC Cable Length:" value={customer?.dc_cable ? `${customer.dc_cable} Meters` : '–'} />
                                    <Cell label="AC Cable Length:" value={customer?.ac_cable ? `${customer.ac_cable} Meters` : '–'} />
                                </tr>
                                <tr>
                                    <Cell
                                        label="Estimated Invoice Value:"
                                        value={customer?.invoice_value ? `₹ ${toIndianCommas(customer.invoice_value)}` : '–'}
                                        wide
                                    />
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-4">
                        <SectionTitle>3. Procurement &amp; Loading Milestones</SectionTitle>
                        <table className="w-full border-collapse">
                            <tbody>
                                <tr>
                                    <Cell label="Paper Prepared By:" value={dash(bom?.paper_prepared_by)} />
                                    <Cell label="Paper Prepared Date:" value={dash(bom?.paper_prepared_date)} />
                                </tr>
                                <tr>
                                    <Cell label="Material Loaded By:" value={dash(bom?.material_loaded_by)} />
                                    <Cell label="Material Loaded Date:" value={dash(bom?.material_loaded_date)} />
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-4">
                        <SectionTitle>4. Inverter &amp; Equipment Specification</SectionTitle>
                        <table className="w-full border-collapse">
                            <tbody>
                                <tr>
                                    <Cell label="Inverter Make:" value={dash(customer?.inverter_make)} />
                                    <Cell label="Inverter Serial No:" value={dash(customer?.inverter_serial_no)} />
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-4">
                        <SectionTitle right={`Total: ${panelSerials.length} Panels`}>5. Solar Panel Serial Numbers</SectionTitle>
                        {panelSerials.length > 0 ? (
                            <div className="grid grid-cols-3 gap-1.5">
                                {panelSerials.map((serial, idx) => (
                                    <div key={idx} className="border border-stone-300 px-1.5 py-1 rounded flex items-center gap-2">
                                        <span className="text-[9px] font-bold text-stone-500 w-4 text-center">{idx + 1}.</span>
                                        <span className="font-mono text-[10px] font-bold text-stone-900">{serial}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-[10px] text-stone-400 italic py-1">No panel serial numbers recorded.</p>
                        )}
                    </div>
                </div>

                <PageFooter page={1} />
            </div>

            {/* ================= PAGE 2 ================= */}
            <div className="print-page-2 flex flex-col justify-between min-h-[1000px] break-before-page mt-10 pt-10 border-t-2 border-dashed border-stone-300 print:mt-0 print:pt-0 print:border-t-0">
                <div>
                    <PageHeader label={`Bill of Materials (BOM) - ${type} Type (Equipment Checklist)`} page={2} />

                    {/* Carry the identifying details onto page 2 so a detached
                        sheet is still traceable to the customer. */}
                    <div className="border border-stone-300 rounded px-3 py-1.5 mb-4 flex items-center justify-between text-[10px] text-stone-700">
                        <span>Customer: <b className="text-stone-900">{dash(customer?.customer_name)}</b></span>
                        <span>Consumer No: <b className="text-stone-900">{dash(customer?.consumer_no)}</b></span>
                        <span>Capacity: <b className="text-stone-900">{customer?.system_capacity_kwp ? `${customer.system_capacity_kwp} kWp` : '–'}</b></span>
                    </div>

                    <SectionTitle>{`6. BOM Equipment Checklist (${type})`}</SectionTitle>
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-stone-100">
                                <th className="w-8 px-1 py-1 border border-stone-300 text-center text-[10px] font-black text-stone-700">#</th>
                                <th className="px-2 py-1 border border-stone-300 text-left text-[10px] font-black text-stone-700">Product Name</th>
                                <th className="w-14 px-1 py-1 border border-stone-300 text-center text-[10px] font-black text-stone-700">Qty</th>
                                <th className="w-16 px-1 py-1 border border-stone-300 text-center text-[10px] font-black text-stone-700">UOM</th>
                                <th className="w-32 px-2 py-1 border border-stone-300 text-left text-[10px] font-black text-stone-700">Integration By</th>
                                <th className="w-40 px-2 py-1 border border-stone-300 text-left text-[10px] font-black text-stone-700">Note / Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(bomItems && bomItems.length > 0) ? bomItems.map((item, idx) => (
                                <tr key={item.id || idx}>
                                    <td className="px-1 py-[1px] border border-stone-300 text-center text-[10px] leading-tight font-bold text-stone-600">{item.sr_no ?? idx + 1}</td>
                                    <td className="px-2 py-[1px] border border-stone-300 text-[10px] leading-tight font-semibold text-stone-900">{dash(item.product_name || item.description)}</td>
                                    <td className="px-1 py-[1px] border border-stone-300 text-center text-[10px] leading-tight font-bold text-stone-900">{dash(item.quantity ?? item.quantity_required)}</td>
                                    <td className="px-1 py-[1px] border border-stone-300 text-center text-[10px] leading-tight text-stone-700 whitespace-nowrap">{dash(item.uom)}</td>
                                    <td className="px-2 py-[1px] border border-stone-300 text-[10px] leading-tight text-stone-700">{dash(item.integration_by)}</td>
                                    <td className="px-2 py-[1px] border border-stone-300 text-[10px] leading-tight text-stone-700">{dash(item.note || item.remarks)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-2 py-6 border border-stone-300 text-center text-[10px] text-stone-400 font-semibold italic">
                                        No BOM checklist items recorded yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* The names were recorded but never printed - only the labels
                        and a blank line appeared, so whoever received the sheet
                        could not tell who prepared or loaded it. */}
                    <div className="grid grid-cols-3 gap-8 mt-6">
                        {[
                            ['Prepared By', bom?.paper_prepared_by, bom?.paper_prepared_date],
                            ['Loaded By', bom?.material_loaded_by, bom?.material_loaded_date],
                            ['Authorized / Received By', null, null],
                        ].map(([label, name, date]) => (
                            <div key={label} className="text-center">
                                <div className="border-t border-stone-400 pt-1.5">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-800">{label}</span>
                                    <p className="text-[11px] font-bold text-stone-900 mt-0.5 min-h-[14px]">{dash(name)}</p>
                                    {date && (
                                        <p className="text-[9px] font-semibold text-stone-500">{date}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <PageFooter page={2} />
            </div>
        </div>
    );
}
