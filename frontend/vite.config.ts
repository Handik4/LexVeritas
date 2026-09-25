import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The dashboard imports ../deployments/studio-next.json so the deployed
  // address has a single source of truth.
  server: { fs: { allow: ['..'] } },
})
