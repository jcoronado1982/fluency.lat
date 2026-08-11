import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendProxy = {
  '/api': {
    target: 'http://localhost:8081',
    changeOrigin: true,
  },
  '/card_images': {
    target: 'http://localhost:8081',
    changeOrigin: true,
  },
  '/card_audio': {
    target: 'http://localhost:8081',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true
    },
    proxy: backendProxy,
  },
  preview: {
    host: 'localhost',
    port: 4173,
    strictPort: true,
    proxy: backendProxy,
    headers: {
      // Recomendación de Google Identity Services para pruebas HTTP en localhost.
      'Referrer-Policy': 'no-referrer-when-downgrade',
    },
  },
})
