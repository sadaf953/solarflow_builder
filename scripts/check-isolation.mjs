import { parseEnv, validateDemoEnv } from './demo-env.mjs';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const failures = [];
for (const name of readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name))) {
  try { validateDemoEnv(parseEnv(readFileSync(name,'utf8'))); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
// The demo is intentionally published at one approved hostname on GitHub
// Pages. The CNAME file must live in public/ so that each `gh-pages -d dist`
// force-push carries it into the published branch; without it, every deploy
// drops the custom domain and the site 404s. A CNAME naming any OTHER host
// is still an unapproved binding and still fails the check.
const approvedDomain = 'solarflow.deeprootsystems.in';
for (const path of ['public/CNAME', 'dist/CNAME']) {
  if (!existsSync(path)) continue;
  const host = readFileSync(path, 'utf8').trim();
  if (host !== approvedDomain) failures.push(`Unapproved custom domain in ${path}: ${host}`);
}
for (const path of ['.vercel/project.json', '.netlify/state.json', '.mcp.json']) {
  if (existsSync(path)) failures.push(`Unexpected external project binding: ${path}`);
}
const approvedSupabaseRef = 'qduonewmquwayrnwyzvc';
if (existsSync('supabase/.temp/linked-project.json')) {
  try {
    const data = JSON.parse(readFileSync('supabase/.temp/linked-project.json', 'utf8'));
    if (data.ref !== approvedSupabaseRef) failures.push(`Unexpected linked Supabase project: ${data.ref}`);
  } catch { failures.push('Invalid linked Supabase project file'); }
}
if (existsSync('supabase/.temp/project-ref')) {
  const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  if (ref !== approvedSupabaseRef) failures.push(`Unexpected linked Supabase project-ref: ${ref}`);
}
function scan(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) { failures.push(`Review symlink: ${path}`); continue; }
    if (entry.isDirectory()) { scan(path); continue; }
    if (!/\.(?:js|jsx|ts|tsx|json|html|yml|yaml|toml|sql|mjs)$/.test(path)) continue;
    const text = readFileSync(path, 'utf8')
      .replaceAll('https://qduonewmquwayrnwyzvc.supabase.co','[APPROVED_DEMO]')
      .replaceAll('"sb_secret_"', '"[APPROVED_PREFIX]"')
      .replaceAll("'sb_secret_'", "'[APPROVED_PREFIX]'");
    if (/https?:\/\/[\w.-]+\.supabase\.(?:co|com)|postgres(?:ql)?:\/\/|github_pat_|ghp_[A-Za-z0-9]{20,}|sb_secret_/i.test(text)) failures.push(`Remote backend or credential found: ${path}`);
  }
}
for (const dir of ['src', 'public', 'dist']) scan(dir);
if (existsSync('.github/workflows') && readdirSync('.github/workflows').some(n => /\.ya?ml$/.test(n))) failures.push('GitHub automation is not allowed in this demo');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
try {
  const remotes = execFileSync('git', ['remote'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  if (remotes.some(name => name !== 'origin')) failures.push('Unexpected Git remote');
  const config = execFileSync('git', ['config', '--local', '--list'], { encoding: 'utf8' });
  const approvedPattern = /^remote\.origin\.(?:push)?url=https:\/\/(?:[^@]+@)?github\.com\/sadaf953\/Solarflow(?:\.git)?$/;
  for (const line of config.split('\n')) {
    if (/https?:\/\/|git@|pushurl=/.test(line) && !approvedPattern.test(line)) failures.push('Unapproved remote target in local Git configuration');
  }
} catch {
  if (!process.env.CI && !process.env.CF_PAGES) {
    failures.push('Cannot verify local Git configuration');
  }
}
if (failures.length) {
  console.error('Demo isolation check failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Demo isolation checks passed: only the approved new project public configuration is permitted; no deployment automation; Git may point only to the new Solarflow repository.');
