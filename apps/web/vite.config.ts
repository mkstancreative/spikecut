import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  // Self-signed HTTPS locally: Meta only accepts https:// OAuth redirect URIs, even for localhost.
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
