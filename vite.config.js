import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A dedicated origin keeps original-project browser sessions and caches separate.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  preview: { host: '127.0.0.1', port: 4186, strictPort: true },
  base: './',
  define: { __BUILD_ID__: JSON.stringify('dev') },
})
