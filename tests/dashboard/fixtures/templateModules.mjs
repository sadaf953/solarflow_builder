// Loads template modules in node the way a client build would see them.
//
// importTemplate(path, { config }) imports template/src/<path> with its own
// copy of every template module it reaches (a ?sf-variant= query is carried
// down the import graph), so each call can run against a different
// client.config.js without touching the shipped one. It also resolves the
// extensionless relative imports Vite allows ('../supabase'), and swaps
// template/src/supabase.js for whatever client useFakeSupabase() set.

import { registerHooks } from 'node:module';
import shippedConfig from '../../../template/src/config/client.config.js';

const TEMPLATE_SRC = new URL('../../../template/src/', import.meta.url).href;
const CLIENT_CONFIG = `${TEMPLATE_SRC}config/client.config.js`;
const SUPABASE = `${TEMPLATE_SRC}supabase.js`;
const PARAM = 'sf-variant';

const variants = new Map();
let currentClient = null;

const variantOf = url => (url?.startsWith('file:') ? new URL(url).searchParams.get(PARAM) : null);
const withVariant = (url, id) => {
    const next = new URL(url);
    next.searchParams.set(PARAM, id);
    return next.href;
};
const withoutQuery = url => url.split('?')[0];

registerHooks({
    resolve(specifier, context, nextResolve) {
        const id = variantOf(context.parentURL);
        if (!id) return nextResolve(specifier, context);
        let result;
        try {
            result = nextResolve(specifier, context);
        } catch (error) {
            if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
            result = nextResolve(`${specifier}.js`, context);
        }
        return result.url.startsWith(TEMPLATE_SRC) ? { ...result, url: withVariant(result.url, id) } : result;
    },
    load(url, context, nextLoad) {
        const id = variantOf(url);
        if (id && withoutQuery(url) === CLIENT_CONFIG) {
            return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(variants.get(id))};` };
        }
        if (id && withoutQuery(url) === SUPABASE) {
            return {
                format: 'module',
                shortCircuit: true,
                source: `import { fakeSupabase } from ${JSON.stringify(import.meta.url)};
export const supabase = new Proxy({}, { get: (_, key) => fakeSupabase()[key] });`,
            };
        }
        return nextLoad(url, context);
    },
});

let count = 0;

/** template/src/<path>, loaded against `config` (default: the shipped template config). */
export function importTemplate(path, { config = shippedConfig } = {}) {
    const id = `v${++count}`;
    variants.set(id, config);
    return import(withVariant(new URL(path, TEMPLATE_SRC).href, id));
}

/** The shipped template config with some features switched. */
export function configWith({ features = {}, ...rest } = {}) {
    const config = structuredClone(shippedConfig);
    return { ...config, ...rest, features: { ...config.features, ...features } };
}

export function useFakeSupabase(client) {
    currentClient = client;
}

export function fakeSupabase() {
    if (!currentClient) throw new Error('No fake Supabase client set: call useFakeSupabase() first.');
    return currentClient;
}

const CALLS = Symbol('calls');

// A chainable stand-in for a Supabase query. Every method call returns a new
// builder with the call appended; awaiting one records the chain in `reads`
// and resolves to respond(calls).
export function fakeClient(respond = () => ({ data: [], error: null })) {
    const reads = [];
    const query = calls => new Proxy({}, {
        get(_, name) {
            if (name === CALLS) return calls;
            if (name === 'then') {
                return (resolve, reject) => {
                    reads.push(calls);
                    return Promise.resolve().then(() => respond(calls)).then(resolve, reject);
                };
            }
            if (typeof name === 'symbol') return undefined;
            return (...args) => query([...calls, [name, ...args]]);
        },
    });
    return { reads, query, from: table => query([['from', table]]) };
}

/** The calls made on a fakeClient builder, e.g. [['from','admin'], ['eq','stage','LEADS']]. */
export const callsOf = builder => builder[CALLS];

/** The first call named `name` in a chain, without its name. */
export const argsOf = (calls, name) => calls.find(([called]) => called === name)?.slice(1);
