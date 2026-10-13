// ─── BomPrintModal.jsx ──────────────────────────────────────────────────────
// Shared "Print / Export PDF" preview for the Material Integration BOM.
// Extracted from MaterialIntegrationTab so the admin modal and the Agent
// Portal render the exact same document, print portal and page rules -
// previously the print CSS only existed inside VendorPortal, so the portal
// div was appended without the rules that isolate it from the rest of the app.
// ────────────────────────────────────────────────────────────────────────────

import { useRef } from 'react';
import { Printer } from 'lucide-react';
import BomPrintView from './BomPrintView';

export default function BomPrintModal({ customer, bom, bomItems = [], activeType, onClose }) {
    const printableBomRef = useRef(null);

    const handlePrint = () => {
        const documentBody = printableBomRef.current;
        if (!documentBody) return;

        const cleanName = String(customer?.customer_name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanRef = String(customer?.folder_no || customer?.consumer_no || 'Site').replace(/[^a-zA-Z0-9_-]/g, '_');
        const docTitle = `BOM_Material_Integration_${cleanName}_${cleanRef}`;
        const prevDocTitle = document.title;

        // Remove any old print portal
        const existing = document.getElementById('native-print-portal');
        if (existing) existing.remove();

        // Create top-level print portal directly on document.body
        const printPortal = document.createElement('div');
        printPortal.id = 'native-print-portal';
        printPortal.innerHTML = documentBody.innerHTML;
        document.body.appendChild(printPortal);

        document.body.classList.add('is-printing-document');
        document.title = docTitle;

        const cleanup = () => {
            document.body.classList.remove('is-printing-document');
            document.title = prevDocTitle;
            if (document.body.contains(printPortal)) {
                document.body.removeChild(printPortal);
            }
            window.removeEventListener('afterprint', cleanup);
        };

        window.addEventListener('afterprint', cleanup);

        setTimeout(() => {
            window.print();
            setTimeout(cleanup, 2000);
        }, 100);
    };

    return (
        <div className="fixed inset-0 z-[999] bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header bar */}
                <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between no-print">
                    <div className="flex items-center gap-2">
                        <Printer size={18} className="text-amber-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider">Print Preview - Material Integration &amp; BOM</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                            <Printer size={14} /> Print Document
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-stone-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Printable Document Body */}
                <div ref={printableBomRef} className="flex-1 overflow-y-auto p-8 bg-white text-stone-900 print-document" id="printable-bom">
                    <BomPrintView customer={customer} bom={bom} bomItems={bomItems} activeType={activeType} />
                </div>
            </div>

            {/* Print rules for the native print portal. Kept with the modal so the
                document prints identically wherever the modal is mounted. */}
            <style>{`
                @media print {
                    body.is-printing-document > *:not(#native-print-portal) {
                        display: none !important;
                    }
                    body.is-printing-document #native-print-portal {
                        display: block !important;
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 15px !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        visibility: visible !important;
                    }
                    /* No blanket font-size override here: the document sets its
                       own type scale, and forcing everything to 8.5pt/10pt
                       flattened the header and section titles on paper. */
                    body.is-printing-document #native-print-portal * {
                        visibility: visible !important;
                    }
                    /* Page 2 must start on a new sheet. The markup also carries
                       break-before-page, but the portal is cloned innerHTML so
                       this states it explicitly rather than relying on it. */
                    body.is-printing-document #native-print-portal .print-page-2 {
                        break-before: page !important;
                        page-break-before: always !important;
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                        border-top: 0 !important;
                    }
                    body.is-printing-document #native-print-portal .print-page-1,
                    body.is-printing-document #native-print-portal .print-page-2 {
                        break-inside: auto;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
