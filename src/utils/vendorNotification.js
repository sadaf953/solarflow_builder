import { supabase } from '../supabase';

/**
 * Sends a vendor notification email through the Supabase Edge Function.
 *
 * @param {Object} params
 * @param {string} params.customerId
 * @param {Object} params.customer
 * @param {string} params.vendorName
 * @param {string} params.vendorEmail
 * @returns {Promise<{success: true, method: 'edge_function', recipient: string, message: string}>}
 */
export async function sendVendorLeadNotification({
    customerId,
    customer,
    vendorName
}) {
    const cust = customer || {};
    const targetVendor = (vendorName || cust.vendor || '').trim();
    if (!targetVendor) {
        throw new Error('No vendor is allotted to this customer, so no notification can be sent.');
    }
    let recipient = ''; // no fallback

    // Lookup real vendor email from database
    try {
        if (targetVendor) {
            const { data: vendorData } = await supabase
                .from('vendors')
                .select('email')
                .ilike('name', targetVendor.trim())
                .maybeSingle();
                
            if (vendorData && vendorData.email) {
                recipient = vendorData.email;
            }
        }
    } catch (err) {
        console.warn('[VendorNotification] Failed to lookup vendor email:', err);
    }

    if (!recipient) {
        throw new Error(`No email address is saved for vendor "${targetVendor}".`);
    }

    // Material Delivery email must be sent by the server-side Edge Function.
    try {
        const { data, error } = await supabase.functions.invoke('send-lead-to-vendor', {
            body: {
                customer_id: customerId,
                vendor_name: targetVendor,
                vendor_email: recipient
            }
        });

        if (error) {
            let detail = error.message || 'Edge Function request failed';
            try {
                const payload = await error.context?.json();
                detail = payload?.error || payload?.details || detail;
            } catch {
                // Keep the original Supabase error message.
            }
            if (/failed to send a request|failed to fetch|functionsfetcherror/i.test(detail)) {
                const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'this website';
                detail = `The vendor email Edge Function could not be reached from ${currentOrigin}. Deploy the latest send-lead-to-vendor function so its CORS settings allow this website.`;
            }
            throw new Error(detail);
        }
        if (!data?.success) throw new Error(data?.error || 'The email service did not confirm delivery.');

        return {
            success: true,
            method: 'edge_function',
            recipient: data.sent_to || recipient,
            message: `Email sent to ${data.sent_to || recipient}`
        };
    } catch (err) {
        console.error('[VendorNotification] Edge Function failed:', err);
        throw err;
    }
}
