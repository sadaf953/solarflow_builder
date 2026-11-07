// The one HTTP client every provisioning call goes through: Supabase, Netlify,
// Cloudflare and the client's own project. `fetch` and `sleep` are injected so
// tests run against fakes and never wait.
//
// - Timeouts on every request.
// - 429 is always retried (the request was refused before it ran); network
//   errors and 5xx only for requests marked idempotent, so a create that
//   failed half-way is never sent twice. A timeout is never retried: the
//   request may still be running on the other side.
// - Errors say which service refused what, and what to do next.
// - Nothing that could hold a token is ever printed: headers are redacted and
//   every message passes through `redact`, which knows the secret values of
//   this run.

const RETRY_STATUS = new Set([500, 502, 503, 504]);
const SECRET_HEADERS = /^(authorization|apikey|x-auth-key|cookie)$/i;

export class ApiError extends Error {
    constructor(message, { service, status = 0, data = null, code } = {}) {
        super(message);
        this.name = 'ApiError';
        this.service = service;
        this.status = status;
        this.data = data;
        if (code) this.code = code;
    }
}

export function redactHeaders(headers = {}) {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, SECRET_HEADERS.test(key) ? '[redacted]' : value]));
}

// What a service said, as one short line.
export function errorText(data, text = '') {
    const pick = [
        data?.message, data?.msg, data?.error_description, data?.error?.message,
        typeof data?.error === 'string' ? data.error : null,
        Array.isArray(data?.errors) ? data.errors.map(e => e?.message || (typeof e === 'string' ? e : '')).filter(Boolean).join('; ') : null,
        data?.errors && !Array.isArray(data.errors) && typeof data.errors === 'object' ? JSON.stringify(data.errors) : null,
    ].find(value => typeof value === 'string' && value.trim());
    return String(pick || text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

const TOKEN_HINTS = {
    Supabase: 'SUPABASE_ACCESS_TOKEN was refused. Create a new token at https://supabase.com/dashboard/account/tokens and put it in .env.provision.',
    Netlify: 'NETLIFY_AUTH_TOKEN was refused. Create a new personal access token in Netlify (User settings → Applications) and put it in .env.provision.',
    Cloudflare: 'CLOUDFLARE_API_TOKEN was refused. It needs Zone → DNS → Edit for CLOUDFLARE_ZONE_ID.',
};

function defaultHint(service, status) {
    if (status === 401) return TOKEN_HINTS[service] || 'The key was refused.';
    if (status === 403) return 'The account is not allowed to do this. Check its role in the organization or team.';
    if (status === 404) return 'It was not found. Check the name or id, or whether it was deleted.';
    if (status === 429) return 'Too many requests. Wait a minute and run the same command again; finished steps are skipped.';
    if (status >= 500) return `${service} had a problem on its side. Run the same command again in a few minutes; finished steps are skipped.`;
    return '';
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * request({service, method, url, headers, json, body, what, hint, allow,
 *          idempotent, retry, timeoutMs}) -> {status, data, text, headers}
 * `allow` lists statuses returned instead of thrown (e.g. 404 for lookups).
 */
export function createHttp({ fetch = globalThis.fetch, sleep = wait, retries = 4, timeoutMs = 60_000, redact = text => text, debug = null } = {}) {
    return async function request({
        service, method = 'GET', url, headers = {}, json, body, what, hint, allow = [],
        idempotent = ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'].includes(method), retry = true, timeoutMs: limit = timeoutMs,
    }) {
        const sendHeaders = { ...headers };
        let sendBody = body;
        if (json !== undefined) {
            sendHeaders['Content-Type'] = 'application/json';
            sendBody = JSON.stringify(json);
        }
        const label = what || `${method} ${new URL(url).pathname}`;
        for (let attempt = 0; ; attempt += 1) {
            debug?.(`→ ${method} ${url} ${JSON.stringify(redactHeaders(sendHeaders))}`);
            let response;
            try {
                response = await fetch(url, { method, headers: sendHeaders, body: sendBody, signal: AbortSignal.timeout(limit) });
            } catch (error) {
                // Our own timeout is not retried: the request reached the
                // service and may still be running there (a long SQL file
                // runs for minutes), so sending it again would run it twice
                // at the same time. Real network errors are retried.
                const timedOut = error?.name === 'TimeoutError';
                if (retry && idempotent && !timedOut && attempt < retries) {
                    await sleep(backoff(attempt));
                    continue;
                }
                const message = timedOut
                    ? `${service} did not answer within ${Math.round(limit / 1000)} s to ${label}. It may still be running there: check in the dashboard whether it finished before you run the same command again.`
                    : `Could not reach ${service} to ${label} (${error?.message || 'network error'}). Check the internet connection and run the same command again.`;
                throw new ApiError(redact(message), { service, code: timedOut ? 'timeout' : 'network' });
            }
            const text = await response.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
            debug?.(`← ${response.status} ${method} ${url}`);
            const retryable = response.status === 429 || (idempotent && RETRY_STATUS.has(response.status));
            if (retry && retryable && attempt < retries) {
                await sleep(retryAfter(response.headers?.get?.('retry-after')) ?? backoff(attempt));
                continue;
            }
            if (response.ok || allow.includes(response.status)) {
                return { status: response.status, data, text, headers: response.headers };
            }
            const said = errorText(data, text);
            const advice = typeof hint === 'function' ? hint(response.status, said) : hint;
            const message = `${service} refused to ${label} (HTTP ${response.status}${said ? `: ${said}` : ''}). ${advice || defaultHint(service, response.status)}`;
            throw new ApiError(redact(message.trim()), { service, status: response.status, data });
        }
    };
}

const backoff = attempt => 1000 * 2 ** attempt;

function retryAfter(value) {
    if (value == null || value === '') return null;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 60) * 1000 : null;
}

// Legacy keys are JWTs and go in both headers; publishable and secret keys
// go only in `apikey` (https://supabase.com/docs/guides/api/api-keys).
export function keyHeaders(key) {
    return /^eyJ/.test(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}
