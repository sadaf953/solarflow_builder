// Links in the invite and password-reset emails that provisioning sets up
// (scripts/provision/emails.js): ?token_hash=…&type=invite|recovery. The app
// verifies them itself, so unlike the default PKCE ?code= links they work in
// any browser, and an invited admin needs no password to open one.
// Pure, so it can be tested without a browser.

export const EMAIL_LINK_TYPES = Object.freeze(['invite', 'recovery']);
export const EMAIL_LINK_PARAMS = Object.freeze(['token_hash', 'type']);

/** {tokenHash, type} from an address, or null when it is not such a link. */
export function readEmailLink(href) {
    let params;
    try { params = new URL(href).searchParams; } catch { return null; }
    const tokenHash = (params.get('token_hash') || '').trim();
    const type = params.get('type') || '';
    return tokenHash && EMAIL_LINK_TYPES.includes(type) ? { tokenHash, type } : null;
}

/** What to tell the user when verifying the link failed. */
export function emailLinkProblem(type, error) {
    if (error?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(error?.message || '')) {
        return 'Could not reach the server to open that email link. Check your internet connection and open the link again.';
    }
    const what = type === 'invite' ? 'invitation link' : 'password reset link';
    return `That ${what} has expired or was already used. Choose "Forgot password?" below to get a new one.`;
}

// ── A password still to choose ───────────────────────────────────────────
// Opening an invitation signs the new user in, but they have no password
// until they save one in the welcome dialog. The link's token is removed
// from the address once it is used, so a reload would lose the dialog. A
// flag in sessionStorage, holding the user's id, brings it back. These take
// the storage as an argument (null when the browser blocks it) and never
// throw, since storage can be unavailable in private windows.

export const PASSWORD_PENDING_KEY = 'solarflow_password_pending';

/** Remember that this user opened an invitation and has no password yet. */
export function markPasswordPending(storage, userId) {
    if (!userId) return;
    try { storage?.setItem(PASSWORD_PENDING_KEY, userId); } catch { /* storage may be unavailable */ }
}

/** True when this user still has to choose a password. */
export function isPasswordPending(storage, userId) {
    if (!userId) return false;
    try { return storage?.getItem(PASSWORD_PENDING_KEY) === userId; } catch { return false; }
}

/** Forget the flag: the password was saved, or the user signed out. */
export function clearPasswordPending(storage) {
    try { storage?.removeItem(PASSWORD_PENDING_KEY); } catch { /* storage may be unavailable */ }
}

/** sessionStorage, or null when the browser does not allow it. */
export function sessionStore() {
    try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

/** True when updating the password failed because the sign-in has ended. */
export function isSessionGone(error) {
    if (!error) return false;
    if (error.name === 'AuthSessionMissingError') return true;
    if (['session_not_found', 'session_expired', 'bad_jwt', 'refresh_token_not_found'].includes(error.code)) return true;
    return /session missing|session.*(expired|not found)|jwt expired|token is expired/i.test(error.message || '');
}
