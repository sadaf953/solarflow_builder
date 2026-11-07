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
