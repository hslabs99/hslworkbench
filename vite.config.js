import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiPlugin } from './server/devApiPlugin.js'

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  server: {
    /** Listen on all interfaces; helps if localhost/IPv6 refuses to connect */
    host: true,
    open: true,
    port: 5173,
  },
})
