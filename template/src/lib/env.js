// Checks on the Supabase project address and browser key. Pure, so the app,
// the builder and scripts/check-env.mjs share one copy.

/** Claims of a legacy JWT key, or null when the value is not a JWT. */
export function jwtClaims(key) {
    try {
        return JSON.parse(atob(String(key).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return null;
    }
}

/** The project ref from the key, else from a *.supabase.co address, else the host. */
export function projectRef(url, key) {
    const host = new URL(url).hostname;
    return jwtClaims(key)?.ref || (host.endsWith('.supabase.co') ? host.split('.')[0] : host);
}

/**
 * What is wrong with a Supabase URL + browser key pair, as a sentence with the
 * fix, or null when the pair is usable. A secret key is always refused.
 */
export function supabaseEnvProblem(url, key) {
    url = String(url || '').trim();
    key = String(key || '').trim();
    if (!url) return 'VITE_SUPABASE_URL is missing. Copy the Project URL from Supabase → Project Settings → API.';
    let host;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return `VITE_SUPABASE_URL must start with https:// (it is "${url}").`;
        if (parsed.pathname !== '/' || parsed.search || parsed.hash) return `VITE_SUPABASE_URL must be just the project address, like https://abcd.supabase.co (it is "${url}").`;
        host = parsed.hostname;
    } catch {
        return `VITE_SUPABASE_URL is not a valid web address (it is "${url}"). It looks like https://abcd.supabase.co.`;
    }
    if (!key) return 'VITE_SUPABASE_ANON_KEY is missing. Copy the anon / publishable key from Supabase → Project Settings → API Keys.';
    const secret = 'VITE_SUPABASE_ANON_KEY holds a SECRET key. Anyone who opens the app could read it and bypass every permission. Use the anon / publishable key instead, and rotate the secret key in Supabase if this one was ever shared.';
    if (key.startsWith('sb_secret_')) return secret;
    if (key.startsWith('sb_publishable_')) return null;
    const claims = jwtClaims(key);
    if (!claims) return 'VITE_SUPABASE_ANON_KEY is not a Supabase key. Copy the anon / publishable key from Supabase → Project Settings → API Keys.';
    if (claims.role === 'service_role') return secret;
    if (claims.role !== 'anon') return `VITE_SUPABASE_ANON_KEY has role "${claims.role}". Use the anon / publishable key.`;
    const urlRef = host.endsWith('.supabase.co') ? host.split('.')[0] : null;
    if (urlRef && claims.ref && claims.ref !== urlRef) return `VITE_SUPABASE_ANON_KEY belongs to project "${claims.ref}", but VITE_SUPABASE_URL points at "${urlRef}". Copy both from the same project.`;
    return null;
}
