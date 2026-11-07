// Go-live details: the client app's web address, the client's Supabase
// organization (where their project is created) and the sender of its emails
// (the client's own Brevo account).
//
// The client fills them in on the setup form (submission.goLive). The admin
// can correct any of them on the client page (settings.goLive, same keys,
// only the ones they set). scripts/provision.mjs and the admin page both use
// resolveGoLive(), so they agree on the address and sender.
//
// Pure: no browser or Node APIs.

export const DOMAIN_MODES = Object.freeze(['ours', 'own']);

export const GO_LIVE_LIMITS = Object.freeze({ domain: 253, org: 64, senderName: 60, email: 254 });

// The Brevo SMTP relay every client account uses. The login and key differ
// per client and are never stored by the builder.
export const BREVO_SMTP = Object.freeze({ host: 'smtp-relay.brevo.com', port: 587 });

export function emptyGoLive() {
    return {
        domainMode: 'ours',      // 'ours': <slug>.<agency domain>; 'own': ownDomain
        ownDomain: '',           // e.g. crm.acme.in
        supabaseOrg: '',         // slug of the client's Supabase organization
        supabaseInvited: false,  // the client says they invited the agency to it
        senderEmail: '',         // a sender verified in the client's Brevo account
        senderName: '',          // the From name; the company name when empty
        brevoReady: false,       // the client says the sender is verified
    };
}

export const GO_LIVE_KEYS = Object.freeze(Object.keys(emptyGoLive()));

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => (typeof value === 'string' ? value.trim() : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const isEmailAddress = value => EMAIL.test(text(value)) && text(value).length <= GO_LIVE_LIMITS.email;

// The From name goes into an email header, so it stays short and free of
// line breaks, quotes and angle brackets.
const isSafeSenderName = value => text(value).length <= GO_LIVE_LIMITS.senderName && !/[\p{Cc}"<>]/u.test(value);

// "https://CRM.Acme.in/login" -> "crm.acme.in". Anything that is not a
// plain host name stays as typed, so isHostname() can reject it.
export function normalizeHostname(value) {
    const typed = text(value);
    const host = typed.toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
    return host.includes(':') ? typed : host;
}

// A DNS name with at least two labels and a letters-only top-level label.
export function isHostname(value) {
    const host = text(value);
    if (!host || host.length > GO_LIVE_LIMITS.domain || host !== host.toLowerCase()) return false;
    const labels = host.split('.');
    return labels.length >= 2 && labels.every(label => LABEL.test(label)) && /^[a-z]{2,63}$/.test(labels.at(-1));
}

// Supabase organization slugs are lowercase letters, digits and dashes.
export const isOrgSlug = value => /^[a-z0-9][a-z0-9-]{1,63}$/.test(text(value));

// The organization slug from what a client may paste: the slug itself or a
// dashboard address such as https://supabase.com/dashboard/org/<slug>/team.
export function normalizeOrgSlug(value) {
    const typed = text(value);
    const fromUrl = typed.match(/supabase\.com\/dashboard\/org\/([a-z0-9-]+)/i);
    return (fromUrl ? fromUrl[1] : typed).toLowerCase();
}

/** The stored goLive value with every key present and typed. */
export function normalizeGoLive(raw) {
    const base = emptyGoLive();
    if (!isObject(raw)) return base;
    const value = { ...base };
    for (const key of GO_LIVE_KEYS) {
        if (typeof base[key] === 'boolean') value[key] = raw[key] === true;
        else if (typeof raw[key] === 'string') value[key] = raw[key];
    }
    if (!DOMAIN_MODES.includes(value.domainMode)) value.domainMode = base.domainMode;
    return value;
}

/**
 * Problems in what the client typed, keyed by field (for the setup form).
 * Only malformed values count: an empty one is sorted out with the client on
 * a call, and resolveGoLive() keeps it from the admin until then.
 */
export function goLiveErrors(raw) {
    const value = normalizeGoLive(raw);
    const errors = {};
    if (value.domainMode === 'own' && text(value.ownDomain) && !isHostname(normalizeHostname(value.ownDomain))) {
        errors.ownDomain = 'Enter an address like crm.yourcompany.in, without https://.';
    }
    if (text(value.supabaseOrg) && !isOrgSlug(normalizeOrgSlug(value.supabaseOrg))) {
        errors.supabaseOrg = 'Paste the organization link from Supabase, or the short name after /org/ in it.';
    }
    if (text(value.senderEmail) && !isEmailAddress(value.senderEmail)) errors.senderEmail = 'Enter a valid email address.';
    if (!isSafeSenderName(value.senderName)) {
        errors.senderName = `Use up to ${GO_LIVE_LIMITS.senderName} characters, without quotes or < >.`;
    }
    return errors;
}

// Admin values win where the admin set them: text when not blank, booleans
// when present.
function mergeGoLive(client, admin) {
    const merged = normalizeGoLive(client);
    if (!isObject(admin)) return merged;
    for (const key of GO_LIVE_KEYS) {
        if (typeof merged[key] === 'boolean') { if (typeof admin[key] === 'boolean') merged[key] = admin[key]; }
        else if (text(admin[key]) && (key !== 'domainMode' || DOMAIN_MODES.includes(admin[key]))) merged[key] = admin[key];
    }
    return merged;
}

/**
 * Where and how one client goes live.
 * `slug` and `companyName` come from the client config; `agencyDomain` is
 * the agency's domain for free addresses (VITE_AGENCY_DOMAIN in the builder,
 * AGENCY_DOMAIN for scripts/provision.mjs).
 * Returns the merged values plus hostname, siteUrl, the sender to use, and
 * `problems` (provisioning cannot start) / `warnings` (it can, but check).
 */
export function resolveGoLive({ submission, settings, slug, companyName, agencyDomain } = {}) {
    const value = mergeGoLive(submission?.goLive, settings?.goLive);
    const problems = [];
    const warnings = [];
    const agency = normalizeHostname(agencyDomain);

    let hostname = '';
    if (value.domainMode === 'own') {
        hostname = normalizeHostname(value.ownDomain);
        if (!isHostname(hostname)) {
            problems.push(hostname ? `“${hostname}” is not a web address like crm.acme.in.` : 'The client chose their own web address but did not give one.');
            hostname = '';
        }
    } else if (!isHostname(agency)) {
        problems.push('The agency domain for free addresses is not set (VITE_AGENCY_DOMAIN in the builder, AGENCY_DOMAIN for provisioning).');
    } else if (!LABEL.test(text(slug))) {
        problems.push(`The folder name “${text(slug)}” cannot be used as a web address. Change the slug.`);
    } else {
        hostname = `${text(slug)}.${agency}`;
    }

    const supabaseOrg = normalizeOrgSlug(value.supabaseOrg);
    if (!supabaseOrg) problems.push('The client’s Supabase organization is not known yet.');
    else if (!isOrgSlug(supabaseOrg)) problems.push(`“${supabaseOrg}” is not a Supabase organization slug.`);
    else if (!value.supabaseInvited) warnings.push('The client has not confirmed that they invited the agency to their Supabase organization.');

    const senderEmail = text(value.senderEmail).toLowerCase();
    const senderName = text(value.senderName) || text(companyName);
    if (!senderEmail) warnings.push('No email sender yet: password emails will use Supabase’s test mailer, which only reaches members of the client’s Supabase organization.');
    else if (!isEmailAddress(senderEmail)) problems.push(`The sender “${senderEmail}” is not a valid email address.`);
    else if (!value.brevoReady) warnings.push(`The client has not confirmed that ${senderEmail} is verified in their Brevo account. Brevo refuses mail from unverified senders.`);
    // The admin's override (or the company name it falls back to) skips the
    // setup form's check, so the same rule is applied here. Without a sender
    // email no From header is set, so the name does not matter yet.
    if (senderEmail && !isSafeSenderName(senderName)) {
        problems.push(`The sender name must be up to ${GO_LIVE_LIMITS.senderName} characters, without quotes, < > or line breaks. Set a shorter one on the client page.`);
    }

    return {
        ...value,
        hostname,
        siteUrl: hostname ? `https://${hostname}` : '',
        supabaseOrg,
        senderEmail,
        senderName,
        problems,
        warnings,
    };
}
