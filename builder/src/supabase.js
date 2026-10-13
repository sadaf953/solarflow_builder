import { createClient } from '@supabase/supabase-js';
import { supabaseEnvProblem } from '../../template/src/lib/env.js';

// The builder's own Supabase project (repo-root .env.local). Only the anon /
// publishable key belongs here; a secret key is refused.
const env = import.meta.env || {};
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();

export const backendProblem = supabaseEnvProblem(url, key);
export const isBackendConfigured = !backendProblem;

export const supabase = isBackendConfigured
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sf-builder-auth' },
    })
    : null;
