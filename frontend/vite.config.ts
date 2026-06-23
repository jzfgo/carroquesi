import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.VITE_BACKEND_URL ||
  'http://localhost:8000'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      workbox: {
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: new RegExp(`^${escapeRegex(BACKEND_URL)}/`),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'CarroQueSí',
        short_name: 'Carroquesí',
        description: 'Lista de compra colaborativa',
        theme_color: '#1a3fa0',
        background_color: '#eef1f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'monochrome.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'monochrome',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    fakeTimers: {
      shouldAdvanceTime: true,
    },
  },
})
