// Cloudflare DNS for the agency domain (only when CLOUDFLARE_API_TOKEN and
// CLOUDFLARE_ZONE_ID are set). API v4:
// https://developers.cloudflare.com/api/resources/dns/subresources/records/
// Responses are {success, errors, messages, result}.
import { ApiError } from './http.js';

export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

export function cloudflareApi({ request, token, zoneId }) {
    const call = async (method, path, options = {}) => {
        const res = await request({
            service: 'Cloudflare', method, url: `${CLOUDFLARE_API}/zones/${encodeURIComponent(zoneId)}${path}`,
            headers: { Authorization: `Bearer ${token}` }, ...options,
        });
        if (res.data?.success === false) {
            const said = (res.data.errors || []).map(e => e.message).join('; ');
            throw new ApiError(`Cloudflare refused to ${options.what} (${said || 'no details'}).`, { service: 'Cloudflare', status: res.status, data: res.data });
        }
        return res.data?.result;
    };
    return {
        zone: () => call('GET', '', { what: 'read the DNS zone' }),
        // name.exact filters server-side; the caller still compares names.
        records: name => call('GET', `/dns_records?${new URLSearchParams({ 'name.exact': name, per_page: '100' })}`, { what: `list DNS records for ${name}` }),
        // ttl 1 = automatic. Not proxied: Netlify issues the certificate itself.
        createCname: (name, target) => call('POST', '/dns_records', {
            what: `add the CNAME ${name}`, idempotent: false,
            json: { type: 'CNAME', name, content: target, ttl: 1, proxied: false, comment: 'SolarFlow client app (Netlify)' },
        }),
        updateCname: (id, name, target) => call('PATCH', `/dns_records/${encodeURIComponent(id)}`, {
            what: `update the CNAME ${name}`, json: { type: 'CNAME', name, content: target, ttl: 1, proxied: false },
        }),
    };
}
