import { z } from 'zod';

// Configure Zod in jitless mode to prevent new Function() probe from triggering CSP eval warnings
z.config({ jitless: true });

const emptyToUndefined = (schema) => z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() === '') return undefined;
    return val;
}, schema);

const cleanPhone = (val) => {
    if (!val) return val;
    let s = String(val).replace(/[^0-9]/g, '');
    if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
    if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
    return s;
};

// NOTE: .passthrough() is essential. Zod objects strip undeclared keys, and this
// schema declares 12 of the 67 fields the lead form sends - so every other field
// (sub_channel_partner, stage, roof_shed, folder_no, installation_status, …) was
// being silently deleted between validation and the database insert.
export const leadSchema = z.object({
    customer_name: z.string({
        error: "Customer Name is required",
    })
    .min(2, "Customer Name must be at least 2 characters")
    .max(100, "Customer Name cannot exceed 100 characters")
    .trim(),
    
    phone_number: z.preprocess(
        cleanPhone,
        z.string({
            error: "Phone Number is required",
        })
        .regex(/^[0-9]{10}$/, "Phone Number must be exactly 10 digits")
    ),
    
    // Marked * in the form, so it is enforced here too.
    email_address: z.string({ error: "Email Address is required" })
        .trim()
        .min(1, "Email Address is required")
        .pipe(z.email("Invalid email format")),
    
    consumer_no: z.string({
        error: "Consumer Number is required",
    })
    .min(3, "Consumer/EB Number must be at least 3 characters")
    .max(30, "Consumer/EB Number cannot exceed 30 characters")
    .trim(),

    villages: z.string({
        error: "Villages / Address is required",
    })
    .min(2, "Address must be at least 2 characters")
    .trim(),

    full_address: z.string().trim().optional().or(z.literal('')),
    pincode: z.string().trim().refine(value => value === '' || /^\d{6}$/.test(value), {
        message: 'Pincode must contain exactly 6 digits'
    }).optional(),

    channel_partner: z.string({
        error: "Channel Partner Name is required",
    })
    .min(1, "Channel Partner Name is required")
    .trim(),

    module_brand: z.string({
        error: "Module Brand is required",
    })
    .min(1, "Module Brand is required")
    .trim(),

    module_wp: z.string({
        error: "Module Wp is required",
    })
    .min(1, "Module Wp is required"),

    no_of_modules: z.string({
        error: "No of Modules is required",
    })
    .min(1, "No of Modules is required"),

    system_capacity_kwp: z.string({
        error: "System Capacity is required",
    })
    .min(1, "System Capacity is required"),

    sub_divisions: z.string({
        error: "Tehsil / Sub Division is required",
    })
    .min(1, "Tehsil / Sub Division is required")
    .trim(),

    district: z.string({
        error: "District is required",
    })
    .min(1, "District is required")
    .trim(),

    // Was: `if (!val) return 'Cash'` - an empty Payment Type was silently
    // rewritten to Cash before the enum saw it, so a lead could be submitted
    // with none chosen. Empty now stays empty and fails the enum.
    payment_type: z.preprocess(
        (val) => {
            if (val === null || val === undefined || String(val).trim() === '') return undefined;
            const s = String(val).trim().toUpperCase();
            return s === 'LOAN' ? 'Loan' : 'Cash';
        },
        z.enum(['Cash', 'Loan'], {
            error: () => "Payment Type is required - choose Cash or Loan"
        })
    ),
}).passthrough();

export const customerSchema = leadSchema.partial();

// This isolated demo collects only name and phone initially. Optional fields
// remain in the payload; valid supplied email/pincode still get checked.
export const demoLeadSchema = leadSchema.partial().extend({
 customer_name: z.string().trim().min(2,'Customer Name must be at least 2 characters').max(100),
 phone_number: leadSchema.shape.phone_number,
 ...Object.fromEntries(['consumer_no','villages','channel_partner','module_brand','module_wp','no_of_modules','system_capacity_kwp','sub_divisions','district'].map(key=>[key,z.string().trim().optional().or(z.literal(''))])),
 email_address: z.string().trim().email('Invalid email format').optional().or(z.literal('')),
 payment_type: z.preprocess(v=>v == null || String(v).trim()==='' ? undefined : v,leadSchema.shape.payment_type.optional()),
}).passthrough();
