import express from 'npm:express'
import { createServer as createViteServer } from 'npm:vite'
import react from 'npm:@vitejs/plugin-react'

async function createServer() {
  const app = express()

  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    // don't include Vite's default HTML handling middlewares
    appType: 'custom',

    plugins: [react()],
    clearScreen: false,
    build: {
      assetsDir: 'scripts',
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
  });
  // Use vite's connect instance as middleware
  app.use(vite.middlewares)

  app.use('*', async (req, res) => {
    // Since `appType` is `'custom'`, should serve response here.
    // Note: if `appType` is `'spa'` or `'mpa'`, Vite includes middlewares
    // to handle HTML requests and 404s so user middlewares should be added
    // before Vite's middlewares to take effect instead
  })
}

await createServer();
