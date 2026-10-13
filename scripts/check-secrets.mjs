// Fails when a secret could ship: anything under template/, builder/ or
// scripts/ (dist folders included) is either packed into a client zip or
// served to the browser.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOTS = ['template', 'builder', 'scripts', 'dist'];
const SKIP_DIRS = new Set(['node_modules', '.git']);
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm)$/i;

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role;
  } catch {
    return null;
  }
}

// [kind, line] for every secret in a text.
export function findSecrets(text) {
  const found = [];
  const lineOf = index => text.slice(0, index).split('\n').length;
  for (const m of text.matchAll(/eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]+/g)) {
    if (jwtRole(m[0]) === 'service_role') found.push(['service_role JWT', lineOf(m.index)]);
  }
  for (const m of text.matchAll(/sb_secret_[\w-]{10,}/g)) found.push(['Supabase secret key', lineOf(m.index)]);
  // A connection string with an inline password; [PASSWORD]-style placeholders are fine.
  for (const m of text.matchAll(/postgres(?:ql)?:\/\/[^\s:@/'"`]+:([^\s@'"`]+)@/gi)) {
    if (!/^[[<{$]/.test(m[1])) found.push(['postgres URL with password', lineOf(m.index)]);
  }
  for (const m of text.matchAll(/\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_\w{22,})\b/g)) found.push(['GitHub token', lineOf(m.index)]);
  return found;
}

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* files(path); }
    else if (entry.isFile() && !BINARY.test(entry.name)) yield path;
  }
}

export function scan(repoRoot) {
  const hits = [];
  for (const root of ROOTS.map(name => join(repoRoot, name)).filter(existsSync)) {
    for (const path of files(root)) {
      if (statSync(path).size > 20 * 1024 * 1024) continue;
      for (const [kind, line] of findSecrets(readFileSync(path, 'utf8'))) hits.push(`${relative(repoRoot, path)}:${line}  ${kind}`);
    }
  }
  return hits;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const hits = scan(fileURLToPath(new URL('..', import.meta.url)));
  if (hits.length) {
    console.error(`Secrets found - remove them (and rotate any real key) before packing or deploying:\n  ${hits.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✓ No secrets in ${ROOTS.join(', ')}.`);
}
