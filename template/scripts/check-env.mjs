// Runs before `npm run dev` and `npm run build`. The app needs the Supabase
// project URL and its public (anon / publishable) key in .env - never a
// secret key, because everything in .env that starts with VITE_ ends up in
// the browser.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { supabaseEnvProblem } from '../src/lib/env.js';

const mode = process.argv[2] || 'production';
const envDir = process.env.SF_ENV_DIR ? resolve(process.env.SF_ENV_DIR) : resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = loadEnv(mode, envDir, 'VITE_');
const problem = supabaseEnvProblem(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

if (problem) {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].filter(name => existsSync(resolve(envDir, name)));
  console.error([
    '',
    'Supabase is not set up for this app yet.',
    `  ✗ ${problem}`,
    '',
    files.length ? `Fix it in ${files.join(', ')} (folder: ${envDir}).` : `There is no .env file in ${envDir}. Create one named .env containing:`,
    '',
    '  VITE_SUPABASE_URL=https://your-project.supabase.co',
    '  VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key',
    '',
    'Both values are in Supabase → Project Settings → API. Then run the command again.',
    '',
  ].join('\n'));
  process.exit(1);
}
console.log(`✓ Supabase project: ${new URL(env.VITE_SUPABASE_URL.trim()).host}`);
