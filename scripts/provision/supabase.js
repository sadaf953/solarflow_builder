// Supabase Management API (https://api.supabase.com/v1, OpenAPI at
// https://api.supabase.com/api/v1-json) and the few Auth / REST calls made
// on the client's own project. Each method is one documented endpoint; the
// doc page is https://supabase.com/docs/reference/api/<operation id>.
import { keyHeaders } from './http.js';

export const SUPABASE_API = 'https://api.supabase.com';
export const projectUrl = ref => `https://${ref}.supabase.co`;

// Every edge-function or secrets change needs Administrator; Developer can
// still run SQL, read keys and update functions (platform/access-control).
const ROLE_HINT = 'Check that the agency\'s Supabase account is Owner or Administrator in the client\'s organization (Organization settings → Team).';

export function supabaseApi({ request, token }) {
    const call = (method, path, { headers, ...options } = {}) => request({
        service: 'Supabase', method, url: `${SUPABASE_API}${path}`,
        headers: { Authorization: `Bearer ${token}`, ...headers }, ...options,
    });
    const data = async promise => (await promise).data;

    return {
        // v1-get-profile: {gotrue_id, primary_email, username}
        profile: () => data(call('GET', '/v1/profile', { what: 'read the agency profile' })),
        // v1-list-all-organizations: [{id, slug, name}]
        organizations: () => data(call('GET', '/v1/organizations', { what: 'list organizations' })),
        // v1-get-an-organization: {id, name, plan, ...}
        organization: slug => data(call('GET', `/v1/organizations/${enc(slug)}`, { what: `read organization ${slug}` })),
        // v1-list-organization-members: [{user_id, user_name, email, role_name, ...}]
        members: async slug => {
            const res = await call('GET', `/v1/organizations/${enc(slug)}/members`, { what: `list the members of ${slug}`, allow: [403] });
            return res.status === 403 ? null : res.data;
        },
        // v1-get-all-projects-for-organization: {projects: [{ref, name, status, is_branch, region}], pagination}
        orgProjects: async (slug, search) => {
            const projects = [];
            for (let offset = 0; ; offset += 100) {
                const query = new URLSearchParams({ limit: '100', offset: String(offset), ...(search ? { search } : {}) });
                const page = await data(call('GET', `/v1/organizations/${enc(slug)}/projects?${query}`, { what: `list the projects of ${slug}` }));
                projects.push(...(page?.projects || []));
                if (!page?.pagination || projects.length >= page.pagination.count || !page.projects?.length) return projects;
            }
        },
        // v1-get-project: {ref, name, organization_slug, region, status, ...}; null when gone.
        project: async ref => {
            const res = await call('GET', `/v1/projects/${ref}`, { what: `read project ${ref}`, allow: [404] });
            return res.status === 404 ? null : res.data;
        },
        // v1-create-a-project. organization_id and region are deprecated in
        // favour of organization_slug and region_selection {type, code}.
        // Not idempotent: a retry after a half-finished create could make a
        // second project, so callers look the project up again instead.
        createProject: ({ name, organizationSlug, region, dbPass }) => data(call('POST', '/v1/projects', {
            what: `create the project ${name}`,
            idempotent: false,
            timeoutMs: 120_000,
            json: { name, organization_slug: organizationSlug, db_pass: dbPass, region_selection: { type: 'specific', code: region } },
        })),
        // v1-get-services-health: [{name, healthy, status: COMING_UP | ACTIVE_HEALTHY | UNHEALTHY}]
        // [] when the API refuses the request (400/404/422, e.g. it stops
        // accepting this services list): nothing to wait for, so the wait step
        // goes by the project status alone instead of failing on every run.
        // null on a 5xx: a hiccup, so the wait step asks again.
        health: async ref => {
            const res = await call('GET', `/v1/projects/${ref}/health?services=db,auth,rest`, {
                what: 'check the project health', retry: false, allow: [400, 404, 422, 500, 502, 503, 504, 544],
            });
            if (res.status === 200 && Array.isArray(res.data)) return res.data;
            return res.status < 500 ? [] : null;
        },
        // v1-run-a-query (beta): {query} -> rows of the last statement.
        // Idempotent here: only setup SQL that is safe to re-run goes through it.
        // Retried after a network error or 5xx, never after our own timeout
        // (see http.js): the SQL may still be running on the database.
        query: (ref, sql, what = 'run SQL') => data(call('POST', `/v1/projects/${ref}/database/query`, {
            what, json: { query: sql }, idempotent: true, timeoutMs: 300_000,
            hint: (status, said) => (status === 400 || status === 422 ? `The database said: ${said || 'no details'}.` : ''),
        })),
        // v1-get-project-api-keys: [{name, type: legacy | publishable | secret, api_key}].
        // reveal=true is needed for secret keys only.
        apiKeys: (ref, { reveal = false } = {}) => data(call('GET', `/v1/projects/${ref}/api-keys${reveal ? '?reveal=true' : ''}`, { what: 'read the project API keys' })),
        // v1-get-auth-service-config / v1-update-auth-service-config
        authConfig: ref => data(call('GET', `/v1/projects/${ref}/config/auth`, { what: 'read the Auth settings' })),
        updateAuthConfig: (ref, body) => call('PATCH', `/v1/projects/${ref}/config/auth`, {
            what: 'update the Auth settings', json: body, allow: [403],
            hint: (status, said) => (status === 400 || status === 422 ? `Supabase said: ${said || 'no details'}.` : ROLE_HINT),
        }),
        // v1-get-a-function: null when not deployed yet.
        getFunction: async (ref, slug) => {
            const res = await call('GET', `/v1/projects/${ref}/functions/${enc(slug)}`, { what: `read the ${slug} function`, allow: [404] });
            return res.status === 404 ? null : res.data;
        },
        // v1-deploy-a-function: multipart `metadata` (JSON text) + one `file`
        // part per source file, named by its path (as the Supabase CLI sends it).
        deployFunction: (ref, slug, { metadata, files }) => {
            const form = new FormData();
            form.append('metadata', JSON.stringify(metadata));
            for (const [name, content] of Object.entries(files)) form.append('file', new Blob([content], { type: 'application/typescript' }), name);
            return data(call('POST', `/v1/projects/${ref}/functions/deploy?slug=${enc(slug)}`, {
                what: `deploy the ${slug} function`, body: form, idempotent: true, timeoutMs: 180_000, hint: status => (status === 403 ? ROLE_HINT : ''),
            }));
        },
        // v1-bulk-create-secrets: [{name, value}] (creates or replaces).
        setSecrets: (ref, secrets) => call('POST', `/v1/projects/${ref}/secrets`, {
            what: 'set the function secrets', json: secrets, idempotent: true, allow: [403],
        }),
    };
}

// Auth and REST on https://<ref>.supabase.co, with a project key.
export function projectApi({ request, ref }) {
    const base = projectUrl(ref);
    return {
        // GoTrue POST /invite (admin): needs the secret / service_role key.
        invite: (serviceKey, email, data) => request({
            service: 'Supabase Auth', method: 'POST', url: `${base}/auth/v1/invite`, headers: keyHeaders(serviceKey),
            json: { email, ...(data ? { data } : {}) }, idempotent: false, what: `invite ${email}`,
        }),
        // GoTrue POST /recover: sends the password-reset email.
        recover: (publicKey, email) => request({
            service: 'Supabase Auth', method: 'POST', url: `${base}/auth/v1/recover`, headers: keyHeaders(publicKey),
            json: { email }, idempotent: false, what: `send a password email to ${email}`,
        }),
        // PostgREST RPC as anon.
        rpc: (publicKey, name, { allow = [] } = {}) => request({
            service: 'Supabase', method: 'POST', url: `${base}/rest/v1/rpc/${name}`, headers: keyHeaders(publicKey),
            json: {}, idempotent: true, what: `call ${name}()`, allow, retry: false, timeoutMs: 30_000,
        }),
    };
}

const enc = value => encodeURIComponent(value);

/** The browser key: publishable first (legacy keys go away by the end of 2026), else legacy anon. */
export function pickPublicKey(keys = []) {
    const publishable = keys.find(k => k?.type === 'publishable' && /^sb_publishable_[\w-]+$/.test(k.api_key || ''));
    const anon = keys.find(k => k?.name === 'anon' && /^eyJ/.test(k.api_key || ''));
    return (publishable || anon)?.api_key || null;
}

/** The server key: secret first, else legacy service_role. Never written anywhere. A masked key (not revealed) does not count. */
export function pickServiceKey(keys = []) {
    const secret = keys.find(k => k?.type === 'secret' && /^sb_secret_[\w-]+$/.test(k.api_key || ''));
    const legacy = keys.find(k => k?.name === 'service_role' && /^eyJ/.test(k.api_key || ''));
    return (secret || legacy)?.api_key || null;
}

// Supabase's error when an Owner/Administrator of the organization has used
// up their free projects. The exact text is not documented, so match loosely.
export const isFreeProjectLimit = error => error?.service === 'Supabase' && [400, 402, 403, 422].includes(error.status)
    && /free project|project limit|maximum (number|limit)|limits? (for|on) the number/i.test(error.message);
