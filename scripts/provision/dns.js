// Checks that a client's web address points at its Netlify site
// (https://docs.netlify.com/domains-https/custom-domains/configure-external-dns/).
import { Resolver } from 'node:dns/promises';

// Netlify's load balancer, for a bare domain whose DNS host has no ALIAS.
export const NETLIFY_APEX_IP = '75.2.60.5';
export const NETLIFY_APEX_ALIAS = 'apex-loadbalancer.netlify.com';

// Second-level zones under .in and similar where acme.co.in is still a bare domain.
const SHARED_SECOND_LEVEL = /\.(co|net|org|firm|gen|ind|ac|edu|res|gov|com)\.[a-z]{2}$/;
export const isApex = hostname => hostname.split('.').length === 2 || (hostname.split('.').length === 3 && SHARED_SECOND_LEVEL.test(hostname));

/** The record the client (or the agency) adds at their DNS host. */
export function dnsRecordFor(hostname, netlifyHost) {
    if (isApex(hostname)) {
        return { type: 'A', name: hostname, value: NETLIFY_APEX_IP, alias: NETLIFY_APEX_ALIAS, apex: true };
    }
    return { type: 'CNAME', name: hostname, value: netlifyHost, apex: false };
}

export function describeRecord(record) {
    const host = record.name.split('.')[0];
    const lines = [`${record.type}  ${record.name}  →  ${record.value}`];
    if (record.apex) lines.push(`(or, if the DNS host supports ALIAS / ANAME records: ALIAS ${record.name} → ${record.alias})`);
    else lines.push(`At most DNS hosts the "Name" / "Host" field is just "${host}".`);
    return lines;
}

// Public resolvers, so a stale answer cached on this computer does not hide
// a record that was just added.
export function publicResolver() {
    const resolver = new Resolver({ timeout: 5000, tries: 2 });
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    return resolver;
}

const tryResolve = async promise => {
    try { return await promise; } catch { return []; }
};
const same = (a, b) => a.replace(/\.$/, '').toLowerCase() === b.replace(/\.$/, '').toLowerCase();

/** {ok, answer}: whether `hostname` points at the Netlify site already. */
export async function checkDns({ hostname, netlifyHost, resolver }) {
    const cnames = await tryResolve(resolver.resolveCname(hostname));
    if (cnames.some(name => same(name, netlifyHost) || same(name, NETLIFY_APEX_ALIAS))) return { ok: true, answer: `CNAME ${cnames[0]}` };
    const addresses = await tryResolve(resolver.resolve4(hostname));
    if (!addresses.length) return { ok: false, answer: cnames.length ? `CNAME ${cnames.join(', ')}` : 'no record yet' };
    if (addresses.includes(NETLIFY_APEX_IP)) return { ok: true, answer: `A ${NETLIFY_APEX_IP}` };
    // Netlify DNS answers with the site's own addresses rather than a CNAME.
    const netlify = await tryResolve(resolver.resolve4(netlifyHost));
    if (addresses.some(address => netlify.includes(address))) return { ok: true, answer: `A ${addresses.join(', ')}` };
    return { ok: false, answer: `${cnames.length ? `CNAME ${cnames.join(', ')}, ` : ''}A ${addresses.join(', ')} (not Netlify)` };
}

/**
 * Whether https://<hostname>/ answers with a valid certificate: any HTTP
 * response counts, a thrown error (no DNS, the certificate is not issued
 * yet, so Netlify's default one does not match) does not. This is what the
 * owner's browser will see, so it decides when emails may link there.
 */
export async function probeHttps({ fetch, hostname, timeoutMs = 10_000 }) {
    try {
        const response = await fetch(`https://${hostname}/`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        return { ok: true, status: response.status };
    } catch (error) {
        return { ok: false, reason: error?.cause?.code || (error?.name === 'TimeoutError' ? 'no answer' : error?.message) || 'no answer' };
    }
}
