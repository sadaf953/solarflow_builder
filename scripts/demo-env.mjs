// The only cloud project explicitly supplied for this demo.
export const DEMO_PROJECT_REF = 'qduonewmquwayrnwyzvc';
export const DEMO_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;
export function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const pos = line.indexOf('=');
    if (pos < 1) throw new Error('Invalid environment assignment');
    return [line.slice(0,pos).trim(),line.slice(pos+1).trim().replace(/^(['"])(.*)\1$/, '$2')];
  }));
}
export function validateDemoEnv(env) {
  for (const [key,value] of Object.entries(env)) {
    if (!value) continue;
    if (!['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'].includes(key)) throw new Error(`Unapproved environment parameter: ${key}`);
  }
  if (!env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_ANON_KEY) return;
  if (env.VITE_SUPABASE_URL !== DEMO_URL) throw new Error('Only the explicitly configured new demo project is allowed');
  const key = env.VITE_SUPABASE_ANON_KEY || '';
  if (key.startsWith('sb_publishable_')) return;
  let claims;
  try { claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()); } catch { throw new Error('Expected a Supabase public anon/publishable key'); }
  if (claims.role !== 'anon' || claims.ref !== DEMO_PROJECT_REF) throw new Error('Key must be an anon key for the new demo project; secret/service-role keys are forbidden');
}
