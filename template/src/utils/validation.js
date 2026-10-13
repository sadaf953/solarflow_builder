// Checks a new lead before it is saved.
//
// Only a name and a phone number are needed to create a lead; anything else
// that is filled in must be valid. Fields the form sends that are not checked
// here are passed through unchanged. `safeParse` / `parse` follow the shape the
// form used with zod: { success, data, error: { issues: [{ path, message }] } }.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPTIONAL_TEXT = [
    'consumer_no', 'villages', 'channel_partner', 'module_brand', 'module_wp',
    'no_of_modules', 'system_capacity_kwp', 'sub_divisions', 'district', 'full_address',
];

const isBlank = value => value == null || String(value).trim() === '';

// Indian mobile number as 10 digits; drops a leading 0 or 91 from pasted numbers.
const cleanPhone = value => {
    let digits = String(value).replace(/[^0-9]/g, '');
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    return digits;
};

function checkLead(input) {
    const data = { ...(input || {}) };
    const issues = [];
    const fail = (key, message) => issues.push({ path: [key], message });

    if (typeof data.customer_name !== 'string') {
        fail('customer_name', 'Customer Name is required');
    } else {
        data.customer_name = data.customer_name.trim();
        if (data.customer_name.length < 2) fail('customer_name', 'Customer Name must be at least 2 characters');
        else if (data.customer_name.length > 100) fail('customer_name', 'Customer Name cannot exceed 100 characters');
    }

    if (isBlank(data.phone_number)) {
        fail('phone_number', 'Phone Number is required');
    } else {
        data.phone_number = cleanPhone(data.phone_number);
        if (!/^[0-9]{10}$/.test(data.phone_number)) fail('phone_number', 'Phone Number must be exactly 10 digits');
    }

    for (const key of OPTIONAL_TEXT) {
        if (typeof data[key] === 'string') data[key] = data[key].trim();
    }

    if (typeof data.email_address === 'string') {
        data.email_address = data.email_address.trim();
        if (data.email_address && !EMAIL.test(data.email_address)) fail('email_address', 'Invalid email format');
    }

    if (typeof data.pincode === 'string') {
        data.pincode = data.pincode.trim();
        if (data.pincode && !/^\d{6}$/.test(data.pincode)) fail('pincode', 'Pincode must contain exactly 6 digits');
    }

    // Stored as 'Cash' or 'Loan'; left out when nothing was chosen.
    if (isBlank(data.payment_type)) delete data.payment_type;
    else data.payment_type = String(data.payment_type).trim().toUpperCase() === 'LOAN' ? 'Loan' : 'Cash';

    return { data, issues };
}

export const leadSchema = {
    safeParse(input) {
        const { data, issues } = checkLead(input);
        return issues.length ? { success: false, error: { issues } } : { success: true, data };
    },
    parse(input) {
        const result = this.safeParse(input);
        if (!result.success) {
            const error = new Error(result.error.issues.map(issue => issue.message).join('\n'));
            error.issues = result.error.issues;
            throw error;
        }
        return result.data;
    },
};

/** @deprecated Use leadSchema. */
export const demoLeadSchema = leadSchema;
