import { createClient } from '@supabase/supabase-js';
import { DEMO_URL, isDemoPublicKey } from './demo/config.js';

export const ISOLATION_MESSAGE = 'Only the new SolarFlow demo backend is allowed. Email functions are disabled.';
export async function blockedBackendFetch() {
  return new Response(JSON.stringify({message:ISOLATION_MESSAGE,error:ISOLATION_MESSAGE}), {
    status:403,headers:{'Content-Type':'application/json'},
  });
}
class DisabledWebSocket { constructor() { throw new Error(ISOLATION_MESSAGE); } }
export function createDemoClient(url,key,fetchImpl=(...args)=>fetch(...args)) {
  if (url !== DEMO_URL || !isDemoPublicKey(key)) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the new SolarFlow project public values.');
  return createClient(url,key,{
    global:{fetch:async (input,init)=>{
      const target = new URL(typeof input==='string' ? input : input.url || String(input));
      if (target.origin !== DEMO_URL || target.pathname.startsWith('/functions/')) return blockedBackendFetch();
      return fetchImpl(input,init);
    }},
    auth:{storageKey:'solarflow-demo-cloud-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
  });
}
const env=import.meta.env || {};
export const DEMO_ISOLATED = !env.VITE_SUPABASE_URL;
export const supabase = DEMO_ISOLATED
  ? createClient('http://127.0.0.1:9','isolated-demo-no-credentials',{
      global:{fetch:blockedBackendFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{transport:DisabledWebSocket},
    })
  : createDemoClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
export default supabase;
