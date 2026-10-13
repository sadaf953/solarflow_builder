import { INITIAL_QUOTATION } from './template/data/initialData.js';

export const QUOTATION_ROLES = ['agent', 'agent2', 'admin', 'sales'];
export const STEPS = ['Customer', 'System', 'Pricing', 'Notes & review'];
export const canUseQuotations = user => QUOTATION_ROLES.includes(user?.userType);
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
const clone = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const date = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Deferred lead integration: retained for when Add to Leads is activated.
export const leadMapping = {
    customer_name: 'customer_name', customer_phone: 'phone_number', customer_email: 'email_address',
    full_address: 'full_address', village: 'villages', taluka: 'sub_divisions', district: 'district',
    pincode: 'pincode', capacity_kw: 'system_capacity_kwp', solar_panel_make: 'module_brand',
    solar_panel_qty: 'no_of_modules', panel_wattage: 'module_wp',
};
export function newForm(user = {}) {
    const today = new Date();
    const until = new Date(today); until.setDate(until.getDate() + 15);
    return {
        customer_name: '', customer_phone: '', customer_email: '', full_address: '', village: '', taluka: '', district: '', pincode: '',
        quotation_date: date(today), valid_until: date(until), owner_name_snapshot: user.name || '', owner_phone_snapshot: user.phone || '',
        capacity_kw: '', project_type: 'Residential', solar_panel_make: '', solar_panel_qty: '', panel_wattage: '',
        inverter_option: '', inverter_brand: '', geb_geda_charge: 'Including', source_lead_id: null,
        options: INITIAL_QUOTATION.page2.brandOptions.map(b => ({ brandName: b.brandName, baseValue: '', discount: 0, subsidy: 0 })),
        custom_notes: [],
    };
}
export function toLead(form) {
    return Object.fromEntries(Object.entries(leadMapping).map(([field, target]) => [target, form[field] ?? '']));
}
export function calculate(options) {
    return options.map(option => {
        const baseValue = round(option.baseValue), discount = round(option.discount), subsidy = round(option.subsidy);
        const netPayableAmount = round(baseValue - discount);
        return { brandName: option.brandName, baseValue, discount, subsidy, netPayableAmount, netPriceAfterSubsidy: round(netPayableAmount - subsidy) };
    });
}
export function validate(form) {
    const errors = [];
    const required = (key, title, step) => { if (!String(form[key] ?? '').trim()) errors.push(`${STEPS[step]}: ${title} is required`); };
    [['customer_name','Customer name'],['quotation_date','Quotation date'],['owner_name_snapshot','Salesperson name']].forEach(([key,title]) => required(key,title,0));
    // This isolated demo also accepts non-dialable synthetic numbers 0000000000–0000009999.
    const validPhone = value => /^(?:(?:91)?[6-9]\d{9}|0{6}\d{4})$/.test(String(value || '').replace(/[\s()+-]/g,''));
    if (!validPhone(form.customer_phone)) errors.push('Customer: Enter a valid Indian mobile number');
    // Salesperson phone is profile-derived and optional. Keep it on the document
    // when available, but never block saving, previewing, or issuing a quotation.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.quotation_date) || !Number.isFinite(Date.parse(form.quotation_date))) errors.push('Customer: Enter a valid quotation date');
    if (form.valid_until && form.valid_until < form.quotation_date) errors.push('Customer: Valid-until date cannot precede quotation date');
    if (form.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email)) errors.push('Customer: Enter a valid email');
    if (!(Number(form.capacity_kw) > 0)) errors.push('System: Capacity must be greater than zero');
    if (!(Number(form.solar_panel_qty) > 0 && Number.isInteger(Number(form.solar_panel_qty)))) errors.push('System: Panel quantity must be a positive whole number');
    if (!(Number(form.panel_wattage) > 0) || !Number.isFinite(Number(form.panel_wattage))) errors.push('System: Module Wp must be greater than zero');
    [['solar_panel_make','Panel make'],['inverter_brand','Inverter brand / make']].forEach(([key,title]) => required(key,title,1));
    if (!['Residential','Commercial'].includes(form.project_type)) errors.push('System: Select a project type');
    if (!['Including','Excluding'].includes(form.geb_geda_charge)) errors.push('System: Select GEB/GEDA charges');
    if (form.options?.length !== 3) errors.push('Pricing: Exactly three options are required');
    (form.options || []).forEach((option, i) => {
        const prefix = `Pricing: Option ${i + 1}`;
        if (!option.brandName?.trim()) errors.push(`${prefix} brand is required`);
        if (!(Number(option.baseValue) > 0) || !Number.isFinite(Number(option.baseValue))) errors.push(`${prefix} base value must be greater than zero`);
        for (const key of ['discount','subsidy']) if (option[key] === '' || !Number.isFinite(Number(option[key])) || Number(option[key]) < 0) errors.push(`${prefix} ${key} must be non-negative`);
        if (Number(option.discount) > Number(option.baseValue)) errors.push(`${prefix} discount exceeds base value`);
        if (Number(option.subsidy) > Number(option.baseValue) - Number(option.discount)) errors.push(`${prefix} subsidy exceeds net payable`);
        if (Number(option.baseValue) > 999999999999.99) errors.push(`${prefix} amount is too large`);
    });
    if ((form.custom_notes || []).length > 5 || (form.custom_notes || []).some(n => n.length > 250)) errors.push('Notes & review: Use at most five notes of 250 characters each');
    return errors;
}
export function freshTemplate() { return clone(INITIAL_QUOTATION); }
export function fromRow(row, user) {
    if (row.schema_version !== 1) throw new Error('This quotation uses a newer format. Update the CRM before editing it.');
    return { ...newForm(user), ...Object.fromEntries(Object.keys(newForm(user)).filter(k => row[k] != null).map(k => [k,row[k]])), ...row.quotation_data?.form };
}
export function payload(form, template) {
    const columns = Object.keys(newForm()).filter(k => !['options','custom_notes'].includes(k));
    const values = Object.fromEntries(columns.map(k => [k, form[k] === '' ? null : form[k]]));
    ['capacity_kw','solar_panel_qty','panel_wattage'].forEach(k => { values[k] = Number(form[k]) > 0 ? Number(form[k]) : null; });
    const options = calculate(form.options);
    const prices = options.filter(b => b.baseValue > 0 && b.netPayableAmount >= 0 && Number.isFinite(b.netPayableAmount)).map(b => b.netPayableAmount);
    return { ...values, starting_price: prices.length ? Math.min(...prices) : null, schema_version: 1,
        quotation_data: { schema_version: 1, template_version: 1, template: clone(template), form: { ...clone(form), options } } };
}
export function documentFor(row) {
    const form = fromRow(row);
    const data = clone(row.quotation_data?.template || INITIAL_QUOTATION);
    data.page1 = { ...data.page1, customerName: form.customer_name || '', customerPhone: form.customer_phone || '',
        quotationNo: row.quotation_no ? `Quote-${row.quotation_no}` : 'Quote-DRAFT', date: form.quotation_date ? form.quotation_date.split('-').reverse().join('-') : '',
        capacityKw: form.capacity_kw ? `${form.capacity_kw} kWp` : '', yoursTrulyName: form.owner_name_snapshot || '', yoursTrulyPhone: form.owner_phone_snapshot || '',
        address: [form.full_address, form.village, form.taluka, form.district, form.pincode].filter(Boolean).join(', '),
        email: form.customer_email || '', validUntil: form.valid_until || '' };
    data.page2 = { ...data.page2, solarPanelMake: form.solar_panel_make || '', solarPanelQty: form.solar_panel_qty || '',
        inverterOption: form.inverter_option || '', inverterBrand: form.inverter_brand || '', gebGedaCharge: form.geb_geda_charge || 'Including',
        projectType: form.project_type || 'Residential', projectSize: form.capacity_kw ? `${form.capacity_kw} kWp` : '', brandOptions: calculate(form.options || []),
        notes: [...data.page2.notes, ...(form.custom_notes || []).filter(n => n && n.trim())] };
    if (form.valid_until) data.page3.termsAndConditions = data.page3.termsAndConditions.map(t => t.sr === 10 ? { ...t, remarks: `Valid until ${form.valid_until.split('-').reverse().join('-')}` } : t);
    return data;
}
export const pdfName = row => `Quotation_${row.quotation_no}_${row.customer_name.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80)}.pdf`;
