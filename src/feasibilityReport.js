
const A4 = [595.28, 841.89];
const VENDOR = {
    name: 'SOLARFLOW',
    address: '100 Demo Avenue, Sample City',
    epc: 'DEMO-EPC-001',
    account: 'DEMO-ACCOUNT-0001',
    ifsc: 'DEMO-IFSC'
};

const clean = value => String(value ?? '').trim();
// pdf-lib's built-in Helvetica font uses WinAnsi and throws when imported
// customer text contains Cyrillic look-alikes (for example `М` instead of
// Latin `M`) or another unsupported glyph. Normalize those characters only in
// the generated PDF; never alter the value stored on the customer record.
const CYRILLIC_LOOKALIKES = {
    А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y',
    а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', х: 'x', у: 'y'
};
const pdfSafe = value => clean(value)
    .normalize('NFKD')
    .split('')
    .map(char => {
        if (CYRILLIC_LOOKALIKES[char]) return CYRILLIC_LOOKALIKES[char];
        if (char === '–' || char === '—' || char === '−') return '-';
        if (char === '“' || char === '”') return '"';
        if (char === '‘' || char === '’') return "'";
        const code = char.charCodeAt(0);
        if (code >= 32 && code <= 126) return char;
        // Combining marks introduced by NFKD can be safely omitted. For any
        // other unsupported script, use a visible placeholder instead of
        // aborting the whole PDF download.
        if (/\p{Mark}/u.test(char)) return '';
        return '?';
    })
    .join('');
const money = value => {
    const raw = clean(value).replace(/[^0-9.]/g, '');
    return raw ? `Rs. ${Number(raw).toLocaleString('en-IN')}` : '';
};

export function mapFeasibilityReport(customer) {
    const history = Array.isArray(customer.loan_history) ? customer.loan_history : [];
    const quote = history.find(item => item.status === 'Total Quotation') || history.find(item => item.status === 'Quotation');
    return {
        consumerName: clean(customer.customer_name),
        consumerNo: clean(customer.consumer_no),
        feasibilityNo: clean(customer.registration_no || customer.feasibility_no),
        janSamarthNo: clean(customer.jansamarth_application_no),
        address: clean(customer.full_address),
        district: clean(customer.district),
        state: 'GUJARAT',
        pincode: clean(customer.pincode),
        capacity: clean(customer.system_capacity_kwp),
        projectCost: money(quote?.amount),
        signatureDate: new Date().toLocaleDateString('en-GB')
    };
}

export function getMissingFeasibilityFields(data) {
    const checks = [
        ['Consumer Name', 'Leads', data.consumerName],
        ['Consumer No', 'Leads', data.consumerNo],
        ['Full Address', 'Leads', data.address],
        ['District', 'Leads', data.district],
        ['Pincode', 'Leads', data.pincode],
        ['System Capacity', 'Leads', data.capacity],
        ['PM Surya Ghar Portal / Feasibility No', 'Registration', data.feasibilityNo],
        ['Jan Samarth Application No', 'Loan', data.janSamarthNo],
        ['Total Quotation Amount', 'Loan', data.projectCost]
    ];
    return checks.filter(([, , value]) => !value).map(([field, tab]) => ({ field, tab }));
}

export const shouldSaveGeneratedSiteFeasibility = documents =>
    !(documents || []).some(doc => doc?.doc_type === 'site_feasibility');

const wrap = (text, font, size, width) => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else { if (line) lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    return lines.length ? lines : ['____________________________'];
};

async function embedImage(pdf, source) {
    if (!source) return null;
    const bytes = new Uint8Array(await (await fetch(source)).arrayBuffer());
    try { return await pdf.embedPng(bytes); } catch { return await pdf.embedJpg(bytes); }
}

export async function createFeasibilityPdf(data, { stampUrl = null, highlightMapped = false } = {}) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const black = rgb(0.08, 0.08, 0.08);
    const stamp = await embedImage(pdf, stampUrl).catch(() => null);
    const addStamp = page => {
        if (!stamp) return;
        const ratio = stamp.width / stamp.height;
        // Client requested the stamp/sign to be 100% larger and 30pt higher.
        page.drawImage(stamp, { x: 350, y: 103, width: 184, height: 184 / ratio, opacity: 0.92 });
    };
    const footer = (page, number) => {
        page.drawText(`Page ${number} of 3`, { x: 500, y: 28, size: 9, font: regular, color: rgb(.4, .4, .4) });
        addStamp(page);
    };
    const field = (page, label, value, y, highlight = false) => {
        page.drawText(label, { x: 56, y, size: 10, font: regular, color: black });
        const x = 56 + regular.widthOfTextAtSize(label, 10) + 4;
        const shown = pdfSafe(value) || '________________________';
        if (highlightMapped && highlight) {
            page.drawRectangle({
                x: x - 2,
                y: y - 3,
                width: Math.min(470 - x, Math.max(72, bold.widthOfTextAtSize(shown, 10) + 6)),
                height: 15,
                color: rgb(1, 0.94, 0.55),
                opacity: 0.72
            });
        }
        page.drawText(shown, { x, y, size: 10, font: bold, color: black, maxWidth: 470 - x });
    };

    const p1 = pdf.addPage(A4);
    const title1 = 'Residential Roof Top Solar Installation Vendor';
    const title2 = 'Feasibility Report Format';
    p1.drawText(title1, { x: 122, y: 795, size: 14, font: bold });
    p1.drawLine({ start: { x: 122, y: 792 }, end: { x: 122 + bold.widthOfTextAtSize(title1, 14), y: 792 }, thickness: 1 });
    p1.drawText(title2, { x: 207, y: 774, size: 13, font: bold });
    p1.drawLine({ start: { x: 207, y: 771 }, end: { x: 207 + bold.widthOfTextAtSize(title2, 13), y: 771 }, thickness: 1 });
    const rows = [
        ['1. Name of the Consumer:', data.consumerName, true], ['2. Discom Consumer ID:', data.consumerNo, true],
        ['3. Discom ID:', '', false], ['4. PM Surya Ghar Portal ID:', data.feasibilityNo, true],
        ['5. Jan Samarth ID:', data.janSamarthNo, true], ['6. Address for Installation:', data.address, true],
        ['7. District of Installation:', data.district, true], ['8. State of Installation:', data.state, true],
        ['9. Pin Code of Installation:', data.pincode, true], ['10. OEM Name:', '', false],
        ['11. Channel Partner, if any:', '', false], ['12. EPC Contractor Address:', VENDOR.address, false],
        ['13. EPC:', VENDOR.epc, false]
    ];
    let y = 742;
    rows.forEach(([label, value, mapped]) => { field(p1, label, value, y, mapped); y -= 25; });
    p1.drawText('14. EPC Contractor Bank Details:', { x: 56, y, size: 10, font: regular }); y -= 23;
    p1.drawText('A/c No :-', { x: 72, y, size: 10, font: regular });
    p1.drawRectangle({ x: 126, y: y - 6, width: 135, height: 20, borderWidth: 1, borderColor: black });
    p1.drawText(VENDOR.account, { x: 137, y, size: 10, font: bold });
    p1.drawText('IFSC CODE :-', { x: 274, y, size: 10, font: regular });
    p1.drawRectangle({ x: 351, y: y - 6, width: 128, height: 20, borderWidth: 1, borderColor: black });
    p1.drawText(VENDOR.ifsc, { x: 362, y, size: 10, font: bold }); y -= 25;
    field(p1, '14. RTS Capacity in KW Applied:', data.capacity, y, true); y -= 25;
    field(p1, '15. Actual RTS Capacity to be installed:', data.capacity, y, true); y -= 25;
    field(p1, '16. Is the vendor registered in MNRE Portal:', 'Yes / No', y); y -= 18;
    p1.drawText('(Note: Only vendors registered in MNRE portal will be allowed)', { x: 74, y, size: 9, font: bold }); y -= 27;
    p1.drawText('17. Feasibility Report Status:', { x: 56, y, size: 10, font: regular }); y -= 24;
    p1.drawRectangle({ x: 86, y: y - 4, width: 14, height: 14, borderWidth: 1, borderColor: black });
    p1.drawLine({ start: { x: 89, y: y + 2 }, end: { x: 92, y: y - 1 }, thickness: 1.5 });
    p1.drawLine({ start: { x: 92, y: y - 1 }, end: { x: 97, y: y + 7 }, thickness: 1.5 });
    p1.drawText('Feasible', { x: 106, y, size: 10, font: regular });
    p1.drawRectangle({ x: 192, y: y - 4, width: 14, height: 14, borderWidth: 1, borderColor: black });
    p1.drawText('Not Feasible', { x: 212, y, size: 10, font: regular }); y -= 27;
    field(p1, '18. Project Cost (All inclusive):', data.projectCost, y, true); y -= 25;
    p1.drawText('19. Site Layout - Images (2-4 Images to be uploaded):', { x: 56, y, size: 10, font: regular });
    p1.drawText('Authorised Signatory of the vendor with Stamp', { x: 315, y: 82, size: 9, font: bold });
    footer(p1, 1);

    const p2 = pdf.addPage(A4);
    p2.drawRectangle({ x: 56, y: 760, width: 483, height: 34, borderWidth: 1, borderColor: black });
    p2.drawText(`Name of the Vendor: ${VENDOR.name}`, { x: 66, y: 773, size: 11, font: bold });
    const paragraphs = [
        '(a) Disbursement of Loan and payment of Margin up to installation of SRT [Capacity - up to 3 KW]. 70% of total project cost including loan and borrower margin.',
        '(b) Disbursement of Loans and payment of Margin up to installation of SRT [Capacity - more than 3 KW and up to 10 KW].',
        '2. I understand that installation of the SRT is the sole responsibility of the Vendor and the Bank is not liable for delayed, faulty or non-installation.',
        '3. I understand that interest starts from loan disbursement and repayment remains due irrespective of installation.'
    ];
    y = 728;
    paragraphs.forEach(text => { const lines = wrap(text, regular, 10, 480); lines.forEach(line => { p2.drawText(line, { x: 56, y, size: 10, font: regular }); y -= 14; }); y -= 12; });
    field(p2, 'Signature Date:', data.signatureDate, y, true); y -= 40;
    p2.drawText('Name of the Borrower:', { x: 56, y, size: 10, font: regular });
    p2.drawRectangle({ x: 210, y: y - 22, width: 300, height: 42, borderWidth: 1, borderColor: black });
    if (highlightMapped) p2.drawRectangle({ x: 216, y: y - 10, width: 286, height: 22, color: rgb(1, .94, .55), opacity: .72 });
    p2.drawText(pdfSafe(data.consumerName) || '________________________', { x: 220, y: y - 4, size: 11, font: bold }); y -= 58;
    p2.drawText('Address:', { x: 56, y, size: 10, font: regular });
    p2.drawRectangle({ x: 208, y: y - 65, width: 302, height: 72, borderWidth: 1, borderColor: black });
    const address = `${data.address}, ${data.district}, ${data.state} - ${data.pincode}`;
    if (highlightMapped) p2.drawRectangle({ x: 214, y: y - 59, width: 288, height: 60, color: rgb(1, .94, .55), opacity: .72 });
    wrap(address, bold, 11, 282).forEach((line, index) => p2.drawText(line, { x: 218, y: y - 18 - index * 15, size: 11, font: bold }));
    footer(p2, 2);

    const p3 = pdf.addPage(A4);
    p3.drawText('Site Photos:', { x: 56, y: 790, size: 15, font: bold });
    p3.drawLine({ start: { x: 56, y: 787 }, end: { x: 56 + bold.widthOfTextAtSize('Site Photos:', 15), y: 787 }, thickness: 1 });
    p3.drawText(`EPC Code: ${VENDOR.epc}`, { x: 56, y: 105, size: 9, font: regular });
    p3.drawText('Authorised Signatory of the vendor with Stamp', { x: 315, y: 82, size: 9, font: bold });
    footer(p3, 3);
    return new Blob([await pdf.save()], { type: 'application/pdf' });
}
