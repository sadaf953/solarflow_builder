// Netlify API (https://api.netlify.com/api/v1, OpenAPI at
// https://open-api.netlify.com/swagger.json; guide at
// https://docs.netlify.com/api/get-started/).

export const NETLIFY_API = 'https://api.netlify.com/api/v1';

export function netlifyApi({ request, token, accountSlug }) {
    const call = (method, path, { headers, ...options } = {}) => request({
        service: 'Netlify', method, url: `${NETLIFY_API}${path}`,
        headers: { Authorization: `Bearer ${token}`, ...headers }, ...options,
    });
    const data = async promise => (await promise).data;
    const team = accountSlug ? `/${encodeURIComponent(accountSlug)}` : '';

    return {
        // getCurrentUser
        user: () => data(call('GET', '/user', { what: 'read the Netlify user' })),
        // listAccountsForUser: teams, each with a slug.
        accounts: () => data(call('GET', '/accounts', { what: 'list Netlify teams' })),
        // getSite: null when deleted.
        site: async id => {
            const res = await call('GET', `/sites/${encodeURIComponent(id)}`, { what: 'read the site', allow: [404] });
            return res.status === 404 ? null : res.data;
        },
        // listSites / listSitesForAccount. `name` is a search, so callers
        // compare names themselves.
        findSites: async name => {
            const query = new URLSearchParams({ name, per_page: '100', ...(accountSlug ? {} : { filter: 'all' }) });
            return data(call('GET', `${team || ''}/sites?${query}`, { what: 'search Netlify sites' }));
        },
        // createSite / createSiteInTeam. 422 = the name is taken (names are
        // global across Netlify) or the custom domain belongs to another site.
        createSite: ({ name, customDomain }) => call('POST', `${team}/sites`, {
            what: `create the site ${name}`, json: { name, custom_domain: customDomain }, idempotent: false, allow: [422],
        }),
        // updateSite
        updateSite: (id, body) => data(call('PATCH', `/sites/${encodeURIComponent(id)}`, {
            what: 'update the site', json: body,
            hint: status => (status === 422 ? 'Another Netlify site may already use this address. Remove it there, then run the same command again.' : ''),
        })),
        // createSiteDeploy with a zip body ("Deploy with a ZIP file").
        deployZip: (id, bytes) => data(call('POST', `/sites/${encodeURIComponent(id)}/deploys`, {
            what: 'upload the app', headers: { 'Content-Type': 'application/zip' }, body: bytes, idempotent: true, timeoutMs: 300_000,
        })),
        // getDeploy: {id, state: ... | ready | error, error_message}
        deploy: id => data(call('GET', `/deploys/${encodeURIComponent(id)}`, { what: 'check the deploy' })),
        // provisionSiteTLSCertificate without a certificate = Let's Encrypt.
        // 422 while the DNS does not point at Netlify yet. Whether it worked
        // is checked by connecting to the site (dns.js probeHttps).
        provisionTls: id => call('POST', `/sites/${encodeURIComponent(id)}/ssl`, { what: 'request the HTTPS certificate', allow: [400, 404, 422], idempotent: true }),
        // getDnsZones / getDnsRecords: only zones hosted on Netlify DNS.
        dnsZones: () => data(call('GET', `/dns_zones${accountSlug ? `?account_slug=${encodeURIComponent(accountSlug)}` : ''}`, { what: 'list Netlify DNS zones' })),
        dnsRecords: zoneId => data(call('GET', `/dns_zones/${encodeURIComponent(zoneId)}/dns_records`, { what: 'list Netlify DNS records' })),
    };
}

// Netlify site names are one DNS label: up to 63 lowercase letters, digits, dashes.
export function siteNameFor(slug) {
    const suffix = '-solarflow';
    return `${slug.slice(0, 63 - suffix.length).replace(/-+$/, '')}${suffix}`;
}

export const isNameTaken = res => res.status === 422 && /unique|taken|already|exists/i.test(JSON.stringify(res.data || {}))
    && !/custom.?domain/i.test(JSON.stringify(res.data || {}));
