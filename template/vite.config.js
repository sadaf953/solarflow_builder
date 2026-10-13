import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import clientConfig from './src/config/client.config.js'

const root = fileURLToPath(new URL('.', import.meta.url))

// The Content-Security-Policy allows exactly one backend: the Supabase project
// named in .env. A client build therefore cannot talk to any other project.
function contentSecurityPolicy(supabaseUrl, dev) {
  let origin = ''
  try { origin = new URL(supabaseUrl).origin } catch { /* not configured yet */ }
  const socket = origin.replace(/^http/, 'ws')
  return [
    "default-src 'self'",
    `connect-src 'self' ${origin} ${socket}${dev ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' ${origin} data: blob:`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ').replace(/\s+;/g, ';')
}

const escapeHtml = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

export default defineConfig(({ command, mode }) => {
  const envDir = process.env.SF_ENV_DIR ? fileURLToPath(new URL(process.env.SF_ENV_DIR, `file://${process.cwd()}/`)) : root
  const env = loadEnv(mode, envDir, 'VITE_')
  const appName = clientConfig.branding?.appName || 'SolarFlow'
  return {
    root,
    envDir,
    plugins: [
      react(),
      {
        name: 'client-html',
        transformIndexHtml: html => html
          .replace('%SF_CSP%', escapeHtml(contentSecurityPolicy(env.VITE_SUPABASE_URL, command === 'serve')))
          .replaceAll('%SF_APP_NAME%', escapeHtml(appName))
          .replaceAll('%SF_COMPANY%', escapeHtml(clientConfig.branding?.companyName || appName)),
      },
    ],
    server: { host: '127.0.0.1', port: 5186, strictPort: true },
    preview: { host: '127.0.0.1', port: 4186, strictPort: true },
    base: './',
    build: { outDir: 'dist', emptyOutDir: true },
  }
})
