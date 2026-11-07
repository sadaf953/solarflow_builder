// SQL that provisioning runs through the Management API's query endpoint, on
// top of the client's backend/setup.sql. Kept out of setup.sql on purpose:
// pg_cron and pg_net exist only on Supabase, and a client who sets up the
// project by hand does not need the job.

export const KEEPALIVE_JOB = 'solarflow-keepalive';
// Once a day (03:00 UTC, 08:30 in India). Free projects pause after 7 days
// without activity, so a missed day or two does no harm.
export const KEEPALIVE_SCHEDULE = '0 3 * * *';

const REF = /^[a-z]{20}$/;
const PUBLIC_KEY = /^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export const sqlText = value => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Enables pg_cron and pg_net as the Supabase docs say
 * (guides/cron/install, guides/database/extensions/pg_net) and schedules one
 * daily POST to /rest/v1/rpc/keepalive with the public key. Unschedule then
 * schedule, so a re-run leaves exactly one job with the current key.
 */
export function keepaliveSql({ ref, publicKey }) {
    if (!REF.test(ref)) throw new Error(`“${ref}” is not a Supabase project ref.`);
    if (!PUBLIC_KEY.test(publicKey || '')) throw new Error('The keep-alive job needs the project’s publishable (or legacy anon) key.');
    // The ref and key are checked above, so the job text below has no quotes to escape.
    const call = [
        'select net.http_post(',
        `  url := 'https://${ref}.supabase.co/rest/v1/rpc/keepalive',`,
        `  headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', '${publicKey}'),`,
        "  body := '{}'::jsonb,",
        '  timeout_milliseconds := 10000',
        ')',
    ].join('\n');
    return [
        '-- SolarFlow keep-alive (provisioning only; not part of setup.sql).',
        'create extension if not exists pg_cron with schema pg_catalog;',
        'grant usage on schema cron to postgres;',
        'grant all privileges on all tables in schema cron to postgres;',
        'create extension if not exists pg_net with schema extensions;',
        `select cron.unschedule(jobid) from cron.job where jobname = ${sqlText(KEEPALIVE_JOB)};`,
        `select cron.schedule(${sqlText(KEEPALIVE_JOB)}, ${sqlText(KEEPALIVE_SCHEDULE)}, $job$`,
        call,
        '$job$) as jobid;',
        '',
    ].join('\n');
}

/** The keep-alive job and its latest run, for scripts/keepalive.mjs. */
export const lastKeepaliveRunSql = () => `select j.jobid, j.schedule, j.active, r.status, r.start_time, r.end_time, r.return_message
from cron.job j
left join lateral (
  select d.status, d.start_time, d.end_time, d.return_message from cron.job_run_details d
  where d.jobid = j.jobid order by d.start_time desc limit 1
) r on true
where j.jobname = ${sqlText(KEEPALIVE_JOB)};`;

const EMAIL = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The owner's auth user, if any. */
export function ownerLookupSql(email) {
    if (!EMAIL.test(email)) throw new Error(`“${email}” is not an email address.`);
    return `select id, email, invited_at, email_confirmed_at, last_sign_in_at from auth.users where lower(email) = lower(${sqlText(email)}) limit 1;`;
}

/** The profile the bootstrap trigger made for a user. */
export function profileSql(userId) {
    if (!UUID.test(userId)) throw new Error(`“${userId}” is not a user id.`);
    return `select user_type, status from public.profiles where id = ${sqlText(userId)};`;
}
