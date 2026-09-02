import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiPlugin } from './server/devApiPlugin.js'

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  // Dev /api includes mailing file upload (Firebase Storage) and public file GET.
  server: {
    /** Listen on all interfaces; helps if localhost/IPv6 refuses to connect */
    host: true,
    open: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('/@tiptap/')) {
            return 'editor'
          }
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase'
          if (id.includes('@azure/msal')) return 'msal'
        },
      },
    },
  },
})
