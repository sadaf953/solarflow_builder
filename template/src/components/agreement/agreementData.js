// What the PM Surya Ghar model agreement is filled with. The second party
// (the installer company) is always this client, from BRANDING; the first
// party comes from the customer record.

import { BRANDING } from '../../config/index.js';
import { formatDate, todayIST } from '../../lib/format.js';

// Printed where a value is missing, so a blank agreement can be filled by hand.
export const BLANK = '__________________';

const includesText = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());

export const AGREEMENT_COMPANY = Object.freeze({
    name: BRANDING.companyName || BLANK,
    // The state is added when the address does not already name it.
    address: [BRANDING.address, BRANDING.state && !includesText(BRANDING.address || '', BRANDING.state) ? BRANDING.state : '']
        .filter(Boolean).join(', ') || BLANK,
});

/** The saved execution date ('YYYY-MM-DD'), or today in IST. */
export function agreementDate(record) {
    const remarks = record?.stages_remarks;
    return (remarks && typeof remarks === 'object' && remarks.discom_agreement_date) || todayIST();
}

/** Agreement page data for a customer record. `extra` adds signatures, stamps etc. */
export function agreementData(record, extra = {}) {
    return {
        executionDate: formatDate(agreementDate(record), 'dmy'),
        consumerName: record?.customer_name || '',
        consumerNo: record?.consumer_no || '',
        village: record?.villages || '',
        taluka: record?.sub_divisions || '',
        district: record?.district || '',
        paymentTerms: 'Mutually Agreed Terms of Payment',
        highlightColor: '#fef08a',
        showHighlights: true,
        ...extra,
    };
}
