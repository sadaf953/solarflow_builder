import { useRef } from 'react';
import { Printer } from 'lucide-react';
import { BRANDING } from '../../config/index.js';
import { formatDate, formatKwp } from '../../lib/format.js';
import { Modal } from '../../ui/index.js';

const show = value => (value == null || String(value).trim() === '' ? '–' : value);
const fileSafe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

// Copies the note into a portal on <body> and hides everything else while
// the print dialog is open, so only the note is printed.
function printNote(element, title) {
    if (!element) return;
    document.getElementById('native-print-portal')?.remove();
    const portal = document.createElement('div');
    portal.id = 'native-print-portal';
    portal.innerHTML = element.innerHTML;
    document.body.appendChild(portal);
    document.body.classList.add('is-printing-document');
    const previousTitle = document.title;
    document.title = title;

    const cleanup = () => {
        document.body.classList.remove('is-printing-document');
        document.title = previousTitle;
        portal.remove();
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2000);
    }, 100);
}

function Row({ cells }) {
    return (
        <tr>
            {cells.map(([label, value]) => [
                <td key={`${label}-label`} className="w-1/4 border border-stone-200 bg-stone-50 px-2 py-1.5 font-bold text-stone-600">{label}</td>,
                <td key={`${label}-value`} className="w-1/4 border border-stone-200 px-2 py-1.5 font-bold text-stone-900">{show(value)}</td>,
            ])}
        </tr>
    );
}

/** Printable delivery note (challan) for one customer. `record` is the customer with unsaved edits applied. */
export default function DeliveryNoteModal({ record, user, onClose }) {
    const noteRef = useRef(null);
    const companyLine = [BRANDING.address, BRANDING.phone && `Phone ${BRANDING.phone}`, BRANDING.gstin && `GSTIN ${BRANDING.gstin}`]
        .filter(Boolean).join(' · ');
    const title = `Delivery_Note_${fileSafe(record.customer_name || 'Customer')}_${fileSafe(record.invoice_no || record.folder_no || record.consumer_no || 'Challan')}`;

    return (
        <Modal
            open
            onClose={onClose}
            title="Delivery note"
            size="xl"
            footer={(
                <>
                    <button type="button" onClick={onClose} className="sf-btn-secondary min-h-11">Close</button>
                    <button type="button" onClick={() => printNote(noteRef.current, title)} className="sf-btn-primary min-h-11">
                        <Printer size={14} aria-hidden="true" /> Print
                    </button>
                </>
            )}
        >
            <div ref={noteRef} className="space-y-4 text-xs text-stone-900">
                <div className="text-center">
                    <h1 className="text-base font-black uppercase tracking-wider text-stone-950">{BRANDING.companyName}</h1>
                    {companyLine && <p className="text-[11px] text-stone-600">{companyLine}</p>}
                    <p className="mt-1 text-[11px] font-semibold text-stone-600">Material delivery note</p>
                    <p className="mt-1 font-bold">{record.invoice_no ? `Invoice no. ${record.invoice_no}` : 'Project dispatch'}</p>
                </div>

                <div className="section-block overflow-x-auto">
                    <h3 className="mb-1 font-bold">1. Customer and site</h3>
                    <table className="w-full border-collapse">
                        <tbody>
                            <Row cells={[['Customer name', record.customer_name], ['Phone', record.phone_number]]} />
                            <Row cells={[['Village / address', record.villages], ['Consumer no.', record.consumer_no]]} />
                            <Row cells={[['System size', record.system_capacity_kwp ? formatKwp(record.system_capacity_kwp) : ''], ['Channel partner', record.channel_partner]]} />
                        </tbody>
                    </table>
                </div>

                <div className="section-block overflow-x-auto">
                    <h3 className="mb-1 font-bold">2. Delivery</h3>
                    <table className="w-full border-collapse">
                        <tbody>
                            <Row cells={[['Vendor', record.vendor], ['Invoice no.', record.invoice_no]]} />
                            <Row cells={[['Delivery date', formatDate(record.material_delivery_date, 'dmy')], ['Vehicle / truck no.', record.vehicle_number]]} />
                            <Row cells={[['Driver name', record.driver_name], ['Driver phone', record.driver_phone_number]]} />
                        </tbody>
                    </table>
                </div>

                <div className="sig-grid grid grid-cols-3 gap-5 pt-8 text-center">
                    {[['Dispatched by', user?.name], ['Driver signature', record.driver_name], ['Received by (customer / site)', record.customer_name]].map(([label, name]) => (
                        <div key={label}>
                            <div className="sig-line flex h-9 items-end justify-center border-b border-stone-500 text-[10px] font-bold">{name || ''}</div>
                            <p className="mt-1 text-[10px] font-black uppercase">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 10mm; }
                    *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body.is-printing-document > *:not(#native-print-portal) { display: none !important; }
                    body.is-printing-document { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; height: auto !important; }
                    #native-print-portal { display: block !important; max-width: 180mm !important; margin: 0 auto !important; font-size: 11px !important; line-height: 1.4 !important; color: #000 !important; }
                    #native-print-portal .section-block { margin-bottom: 14px !important; }
                    #native-print-portal table { width: 100% !important; border-collapse: collapse !important; border: 1px solid #a8a29e !important; }
                    #native-print-portal td { border: 1px solid #d6d3d1 !important; padding: 5px 8px !important; vertical-align: middle !important; }
                    #native-print-portal .sig-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 20px !important; text-align: center !important; padding-top: 30px !important; }
                    #native-print-portal .sig-line { border-bottom: 1px solid #78716c !important; height: 35px !important; display: flex !important; align-items: flex-end !important; justify-content: center !important; }
                }
            `}</style>
        </Modal>
    );
}
