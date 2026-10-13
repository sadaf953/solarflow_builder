import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// The builder talks to exactly one backend: the Supabase project in .env.local.
function contentSecurityPolicy(supabaseUrl, dev) {
  let origin = ''
  try { origin = new URL(supabaseUrl).origin } catch { /* not configured yet */ }
  const socket = origin.replace(/^http/, 'ws')
  return [
    "default-src 'self'",
    `connect-src 'self' ${origin} ${socket}${dev ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    `script-src 'self'${dev ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ').replace(/\s+;/g, ';')
}

const escapeHtml = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

export default defineConfig(({ command, mode }) => {
  const envDir = process.env.SF_ENV_DIR ? fileURLToPath(new URL(process.env.SF_ENV_DIR, `file://${process.cwd()}/`)) : repoRoot
  const env = loadEnv(mode, envDir, 'VITE_')
  return {
    root,
    envDir,
    plugins: [
      react(),
      {
        name: 'builder-html',
        transformIndexHtml: html => html.replace('%SF_CSP%', escapeHtml(contentSecurityPolicy(env.VITE_SUPABASE_URL, command === 'serve'))),
      },
    ],
    css: { postcss: root },
    server: { host: '127.0.0.1', port: 5187, strictPort: true, fs: { allow: [repoRoot] } },
    preview: { host: '127.0.0.1', port: 4187, strictPort: true },
    base: './',
    build: { outDir: 'dist', emptyOutDir: true },
  }
})
