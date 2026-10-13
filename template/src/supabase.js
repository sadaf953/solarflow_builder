import { createClient } from '@supabase/supabase-js';
import { projectRef, supabaseEnvProblem } from './lib/env.js';

export { supabaseEnvProblem };

const env = import.meta.env || {};
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();

// A secret key is refused here: no client is ever created with it, and App
// shows this message instead of the login screen.
export const supabaseSetupProblem = supabaseEnvProblem(url, key);
export const isSupabaseConfigured = !supabaseSetupProblem;

// Until configured, modules still get a client object, but it points at an
// address that never resolves and App never renders anything that uses it.
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: `sf-${projectRef(url, key)}-auth`,
      },
    })
  : createClient('https://unconfigured.invalid', 'unconfigured', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

export default supabase;
