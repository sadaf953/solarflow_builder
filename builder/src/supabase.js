import { createClient } from '@supabase/supabase-js';

// The builder's own Supabase project (repo-root .env.local). Only the anon /
// publishable key belongs here; a secret key is refused.
const env = import.meta.env || {};
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();

function keyRole(value) {
    if (value.startsWith('sb_publishable_')) return 'anon';
    if (value.startsWith('sb_secret_')) return 'service_role';
    try {
        return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || null;
    } catch {
        return null;
    }
}

function problem() {
    if (!url || !key) return 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set in .env.local.';
    try {
        if (new URL(url).protocol !== 'https:') return 'VITE_SUPABASE_URL must start with https://.';
    } catch {
        return 'VITE_SUPABASE_URL is not a valid web address.';
    }
    const role = keyRole(key);
    if (role === 'service_role') return 'VITE_SUPABASE_ANON_KEY holds a secret key. Use the anon / publishable key.';
    if (role !== 'anon') return 'VITE_SUPABASE_ANON_KEY is not an anon / publishable key.';
    return null;
}

export const backendProblem = problem();
export const isBackendConfigured = !backendProblem;

export const supabase = isBackendConfigured
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sf-builder-auth' },
    })
    : null;
