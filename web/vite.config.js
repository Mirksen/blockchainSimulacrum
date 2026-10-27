import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_')
  if (env.VITE_POSTHOG_PROJECT_TOKEN && !/^phc_[A-Za-z0-9]+$/.test(env.VITE_POSTHOG_PROJECT_TOKEN)) {
    throw new Error('VITE_POSTHOG_PROJECT_TOKEN must be a public phc_ ingestion token, never a personal or project secret key')
  }
  return {
  plugins: [
    react(),
    nodePolyfills({
      // Enable Buffer polyfill for elliptic.js
      include: ['buffer'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  }
})
