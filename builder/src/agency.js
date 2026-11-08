// The agency's own go-live details, from the repo-root .env.local:
//   VITE_AGENCY_DOMAIN  free client addresses are <slug>.<this domain>
//   VITE_AGENCY_EMAIL   the agency's Supabase login, which clients invite to their organization
// Either may be missing (tests, Node, a builder not set up yet); the pages
// then use plain words instead.

import { isEmailAddress, isHostname, normalizeHostname } from './catalog/goLive.js';

export function agencyFrom(env = {}) {
    const domain = normalizeHostname(typeof env.VITE_AGENCY_DOMAIN === 'string' ? env.VITE_AGENCY_DOMAIN : '');
    const email = typeof env.VITE_AGENCY_EMAIL === 'string' ? env.VITE_AGENCY_EMAIL.trim().toLowerCase() : '';
    return { domain: isHostname(domain) ? domain : '', email: isEmailAddress(email) ? email : '' };
}

export const agency = agencyFrom(import.meta.env || {});

// The email clients invite, or how to get it.
export const inviteEmailText = (info = agency) => info.email || 'our team email (ask us on WhatsApp)';
