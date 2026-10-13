// Dev-only harness for iterating on the BOM print document without logging in.
// Served at /bom-preview.html in `npm run dev`. Not referenced by the app and
// not part of the production build - safe to delete.

import { createRoot } from 'react-dom/client';
import BomPrintView from '../components/BomPrintView';
import { ROOF_BOM_TEMPLATE } from '../constants';
import '../index.css';

const customer = {
    customer_name: 'Demo Customer One',
    phone_number: '0000000000',
    email_address: 'customer.one@example.invalid',
    consumer_no: 'DEMO-CONSUMER-001',
    folder_no: 'SF-DEMO-001',
    villages: 'Demo Village',
    sub_divisions: 'Demo District',
    channel_partner: 'Demo Aurora Solar One',
    sub_channel_partner: 'Demo Dealer One',
    module_brand: 'SolarFlow',
    module_wp: '545',
    no_of_modules: '12',
    system_capacity_kwp: '6540',
    roof_shed: 'Roof',
    dc_cable: '76',
    ac_cable: '45',
    structure_front_leg_height: '5',
    structure_rear_leg_height: '4',
    invoice_value: '385000',
    inverter_make: 'DemoGrid MIN 6000TL-X',
    inverter_serial_no: 'DEMO-INVERTER-001',
    panel_serial_no: JSON.stringify(
        Array.from({ length: 12 }, (_, i) => `DEMO-PANEL-${String(4410 + i).padStart(5, '0')}`)
    ),
};

const bom = {
    bom_type: 'ROOF',
    paper_prepared_by: 'Demo Preparer',
    paper_prepared_date: '2026-08-14',
    material_loaded_by: 'Demo Loader',
    material_loaded_date: '2026-08-18',
};

// Same shape the shared loader produces: template merged with saved quantities.
const bomItems = ROOF_BOM_TEMPLATE.map((item, idx) => ({
    ...item,
    sr_no: idx + 1,
    quantity: item.quantity || (idx % 3 === 0 ? String((idx % 7) + 1) : ''),
    note: idx === 4 ? 'Coil opened at site' : '',
}));

createRoot(document.getElementById('root')).render(
    <div className="bg-stone-200 py-6 min-h-screen">
        {/* A4 at 96dpi so the preview matches the printed sheet. */}
        <div className="mx-auto bg-white text-stone-900 print-document" style={{ width: '794px', padding: '40px' }}>
            <BomPrintView customer={customer} bom={bom} bomItems={bomItems} activeType="ROOF" />
        </div>
    </div>
);
