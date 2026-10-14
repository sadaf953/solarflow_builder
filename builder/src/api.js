// Every call the builder makes to its backend (builder/backend/builder.sql).
// Each function throws an Error with a friendly message and a `code`;
// saveDraft and submitSetup throw code 'conflict' when another tab saved first.

import { supabase, isBackendConfigured, backendProblem } from './supabase.js';

export { isBackendConfigured };

const MESSAGES = {
    conflict: 'These answers were changed in another tab or on another device. Reload the page to see the latest version.',
    locked: 'This link is locked for 15 minutes after too many wrong attempts. Try again later.',
    rate_limited: 'Too many requests in a short time. Wait a minute and try again.',
    submit_limited: 'This form was sent many times in the last hour. Wait a while, then send it again.',
    too_large: 'This setup is too large to save. Remove some list items or fields and try again.',
    invalid_payload: 'The answers could not be saved. Reload the page and try again.',
    invalid_link: 'This setup link does not work any more. Ask the SolarFlow team for a new link.',
    nothing_to_submit: 'Answer the questions before you submit.',
    not_admin: 'This account is not a SolarFlow builder admin.',
    not_found: 'This client was not found.',
    invalid_status: 'That status is not allowed.',
    invalid_input: 'Check the details and try again.',
    network: 'Could not reach the server. Check your internet connection and try again.',
    backend_missing: 'The builder database is not set up yet. Run builder/backend/builder.sql in the builder Supabase project.',
    not_configured: `The builder is not connected to its backend: ${backendProblem}`,
};

function apiError(code, detail) {
    const error = new Error((code === 'invalid_input' && detail) || MESSAGES[code] || detail || 'Something went wrong. Try again.');
    error.code = code;
    return error;
}

function toError(error) {
    const message = String(error?.message || '');
    if (MESSAGES[message]) return apiError(message, error.details);
    if (error?.code === 'PGRST202' || /could not find the function/i.test(message)) return apiError('backend_missing');
    if (/fetch|network|load failed/i.test(message)) return apiError('network');
    if (error?.code === '42501' || /permission denied/i.test(message)) return apiError('not_admin');
    if (/JWT|session/i.test(message)) return apiError('session', 'Your session has ended. Sign in again.');
    return apiError('unknown', message || undefined);
}

async function rpc(name, params) {
    if (!isBackendConfigured) throw apiError('not_configured');
    let result;
    try {
        result = await supabase.rpc(name, params);
    } catch (error) {
        throw toError(error);
    }
    if (result.error) throw toError(result.error);
    return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validLink = (inviteId, token) => UUID.test(String(inviteId || '')) && /^[A-Za-z0-9_-]{20,200}$/.test(String(token || ''));

// ── Client (setup link) ─────────────────────────────────────────────────

// {company, contact, payload, version, status, submitted_at}, or null when
// the link is wrong, expired or archived.
export async function openInvite(inviteId, token) {
    if (!validLink(inviteId, token)) return null;
    return rpc('setup_open', { p_invite: inviteId, p_token: token });
}

// Saves the whole payload; returns the new version.
export async function saveDraft(inviteId, token, payload, baseVersion) {
    if (!validLink(inviteId, token)) throw apiError('invalid_link');
    const version = await rpc('setup_save', { p_invite: inviteId, p_token: token, p_payload: payload, p_base_version: baseVersion });
    if (version == null) throw apiError('invalid_link');
    return version;
}

// Sends the saved draft, which must still be `version` (the one this page
// last saved or loaded). Returns the submitted_at timestamp (ISO string).
export async function submitSetup(inviteId, token, version) {
    if (!validLink(inviteId, token)) throw apiError('invalid_link');
    const submittedAt = await rpc('setup_submit', { p_invite: inviteId, p_token: token, p_version: version });
    if (submittedAt == null) throw apiError('invalid_link');
    return submittedAt;
}

// '<origin><pathname>#/s/<id>/<token>' for the current site.
export function setupLink(inviteId, token) {
    const { origin, pathname } = globalThis.location || { origin: '', pathname: '/' };
    return `${origin}${pathname}#/s/${encodeURIComponent(inviteId)}/${encodeURIComponent(token)}`;
}

// ── Admin ───────────────────────────────────────────────────────────────

export async function adminCreateInvite({ company, contact = {} } = {}) {
    const { id, token } = await rpc('setup_admin_create_invite', { p_company: String(company || '').trim(), p_contact: contact });
    return { id, token, link: setupLink(id, token) };
}

// [{id, company, contact, status, created_at, updated_at, submitted_at, version, expires_at}], newest activity first.
export async function adminList() {
    return (await rpc('setup_admin_list')) || [];
}

// {invite, draft, submissions: [newest first], events}
export async function adminGet(inviteId) {
    return rpc('setup_admin_get', { p_invite: inviteId });
}

export async function adminResetToken(inviteId) {
    const { token } = await rpc('setup_admin_reset_token', { p_invite: inviteId });
    return { token, link: setupLink(inviteId, token) };
}

// 'archived' or 'open' (reopen). Returns the new status.
export async function adminSetStatus(inviteId, status) {
    return rpc('setup_admin_set_status', { p_invite: inviteId, p_status: status });
}

export async function adminMarkDownloaded(inviteId) {
    await rpc('setup_admin_mark_downloaded', { p_invite: inviteId });
}

// {adminOverrides, slug, ownerEmail, branding, workflow}, or null before the first save.
export async function adminGetSettings(inviteId) {
    return rpc('setup_admin_get_settings', { p_invite: inviteId });
}

export async function adminSaveSettings(inviteId, settings) {
    await rpc('setup_admin_save_settings', { p_invite: inviteId, p_settings: settings });
}

// ── Auth (admins only) ──────────────────────────────────────────────────

export async function signIn(email, password) {
    if (!isBackendConfigured) throw apiError('not_configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email: String(email || '').trim(), password });
    if (error) {
        if (/invalid login credentials/i.test(error.message)) throw apiError('invalid_login', 'Wrong email or password.');
        if (/email not confirmed/i.test(error.message)) throw apiError('invalid_login', 'This email address is not confirmed yet.');
        throw toError(error);
    }
    return data.session;
}

export async function signOut() {
    if (!isBackendConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw toError(error);
}

export async function getSession() {
    if (!isBackendConfigured) return null;
    const { data } = await supabase.auth.getSession();
    return data.session || null;
}

// callback(session, event) on every sign-in, sign-out and token refresh.
export function onAuthChange(callback) {
    if (!isBackendConfigured) return () => {};
    const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
    return () => data.subscription.unsubscribe();
}
