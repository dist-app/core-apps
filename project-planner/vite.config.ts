import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      '/auth/': {
        target: 'http://localhost:8000/',
      },
      '/-/': {
        target: 'http://localhost:8000/',
      },
      '/websocket': {
        target: 'ws://localhost:8000/',
        ws: true,
      },
    },middlewareMode: true,
  },
  clearScreen: false,
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(modName) {
          if (modName.includes('react')) return 'react';
          if (modName.includes('opentelemetry')) return 'opentelemetry';
        },
      },
    },
  },
})
