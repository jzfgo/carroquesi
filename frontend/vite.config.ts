import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import pkg from './package.json'

// Read at build time so the two deployments install as distinct PWAs.
const environmentLabel = process.env.VITE_ENVIRONMENT_LABEL

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        // The workbox default ({js,css,html}) plus woff2 only: the
        // self-hosted fonts must render offline. Anything broader
        // triples the precache — diff the manifest before changing.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // The pdf.js chunk loads on demand when a PDF receipt is opened.
        // Offline receipt viewing is not promised, so keep it out of the
        // precache rather than grow every install by its weight.
        globIgnores: ['**/pdfjs-*.js'],
      },
      manifest: {
        name: environmentLabel
          ? `CarroQueSí (${environmentLabel})`
          : 'CarroQueSí',
        short_name: environmentLabel ? `CQS ${environmentLabel}` : 'Carroquesí',
        description: 'Lista de compra colaborativa',
        // The manifest is its own document and does not inherit the page's
        // lang. Left unset, the plugin fills in "en" over Spanish strings.
        lang: 'es',
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
  build: {
    rollupOptions: {
      output: {
        // One named chunk so the precache globIgnores above can address it.
        advancedChunks: {
          groups: [{ name: 'pdfjs', test: /node_modules\/pdfjs-dist\// }],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
    mockReset: true,
    include: ['src/**/*.test.{ts,tsx}'],
    fakeTimers: {
      shouldAdvanceTime: true,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.test.{ts,tsx}',
        '**/*.config.{ts,js}',
        'src/vitest.setup.ts',
        'eslint.config.js',
      ],
    },
  },
})
