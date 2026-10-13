import postgres from 'npm:postgres@3.4.7';
import { createEmailWorker } from './worker.mjs';

// All connection and provider credentials stay in the Edge Function runtime.
// This endpoint authenticates the database's private worker token, not a user
// JWT, and accepts no recipient or arbitrary email content from its caller.
const connection = Deno.env.get('SUPABASE_DB_URL');
const sql = connection ? postgres(connection, {prepare:false, max:1, idle_timeout:20, connect_timeout:10}) : null;
const storage = {
    async claim() {
        if (!sql) throw new Error('Database connection is not configured');
        const jobs = await sql`
            update enquiry_private.email_outbox set attempts = attempts + 1,
                next_attempt_at = now() + interval '2 minutes'
            where id = (
                select id from enquiry_private.email_outbox
                where status = 'pending' and next_attempt_at <= now()
                order by created_at for update skip locked limit 1
            ) returning id, enquiry_id, kind, snapshot`;
        return jobs[0] || null;
    },
    async sent(id: string, providerId: string) {
        if (!sql) throw new Error('Database connection is not configured');
        await sql`update enquiry_private.email_outbox set status = 'sent', sent_at = now(),
            provider_id = ${providerId}, last_error = null where id = ${id}::uuid`;
    },
    async retry(id: string, error: string) {
        if (!sql) throw new Error('Database connection is not configured');
        await sql`update enquiry_private.email_outbox set last_error = ${error},
            status = case when attempts >= 10 then 'failed' else 'pending' end,
            next_attempt_at = now() + least(60, power(2, least(attempts, 6))) * interval '1 minute'
            where id = ${id}::uuid`;
    }
};
Deno.serve(createEmailWorker({
    token:Deno.env.get('ENQUIRY_WORKER_TOKEN'), apiKey:Deno.env.get('BREVO_API_KEY'),
    senderEmail:Deno.env.get('BREVO_SENDER_EMAIL'), senderName:Deno.env.get('BREVO_SENDER_NAME') || 'Deep Root Systems',
    storage
}));
