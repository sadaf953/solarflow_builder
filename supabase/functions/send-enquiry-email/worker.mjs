export const ENQUIRY_RECIPIENT = 'enquiry@deeprootsystems.in';

export function emailMessage(job, senderEmail, senderName = 'Deep Root Systems') {
    const data = job.snapshot;
    const name = String(data.name || 'Prospective client').replace(/[\r\n]/g, ' ').slice(0, 200);
    return {
        sender: {email:senderEmail, name:senderName},
        to: [{email:ENQUIRY_RECIPIENT}],
        subject: `${job.kind === 'details' ? 'Completed' : 'New'} SolarFlow enquiry — ${name}`,
        textContent: [
            `Enquiry reference: ${job.enquiry_id}`, `Name: ${data.name || 'Not provided'}`,
            `Phone: ${data.mobile_number}`, `Interested in: ${data.selected_interest || 'Not specified'}`,
            job.kind === 'details' && data.company_name && `Company: ${data.company_name}`,
            job.kind === 'details' && data.notes && `Form answers:\n${data.notes}`
        ].filter(Boolean).join('\n'),
        headers: {idempotencyKey:job.id}
    };
}

function validToken(provided, expected) {
    if (!expected || !provided || provided.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    return difference === 0;
}

// Injectable storage/provider adapters let the delivery behaviour be tested
// without sending real mail or reading contact details from the live database.
export function createEmailWorker({token, apiKey, senderEmail, senderName, storage, fetchImpl = fetch}) {
    return async request => {
        if (request.method !== 'POST') return Response.json({error:'Method not allowed'}, {status:405});
        if (!validToken(request.headers.get('x-enquiry-worker-token'), token)) return Response.json({error:'Unauthorized'}, {status:401});
        if (!apiKey || !senderEmail) return Response.json({error:'Email sender is not configured'}, {status:503});
        let sent = 0, failed = 0;
        try {
            for (let i = 0; i < 10; i++) {
                const job = await storage.claim();
                if (!job) break;
                try {
                    const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
                        method:'POST', headers:{'api-key':apiKey, 'Content-Type':'application/json'},
                        body:JSON.stringify(emailMessage(job, senderEmail, senderName)),
                        signal:AbortSignal.timeout(10000)
                    });
                    const result = await response.json().catch(() => ({}));
                    // Brevo confirms a previous request with this same key by
                    // returning duplicate_parameter. Treat it as acknowledged.
                    if ((!response.ok || !result.messageId) && result.code !== 'duplicate_parameter') {
                        const detail = String(result.message || result.code || 'No delivery acknowledgement')
                            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[sender address]')
                            .replace(/(?:xkeysib-[\w-]+|[\w-]{32,})/g, '[redacted]')
                            .replace(/[\r\n]/g, ' ').slice(0, 200);
                        await storage.retry(job.id, `provider_http_${response.status}: ${detail}`);
                        failed++; continue;
                    }
                    await storage.sent(job.id, result.messageId || 'idempotency_acknowledged');
                    sent++;
                } catch {
                    await storage.retry(job.id, 'delivery_not_confirmed');
                    failed++;
                }
            }
            return Response.json({sent, failed}, {status:failed ? 502 : 200});
        } catch {
            return Response.json({error:'Email processing was not confirmed'}, {status:503});
        }
    };
}
