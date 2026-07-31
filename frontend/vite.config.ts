import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  // Settings prints the version, and the release flow bumps package.json. Reading
  // it here keeps one number in one place.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // ADR-009 says leave this unset, and it is right about why: the PWA
        // icons come from `manifest.icons` via `includeManifestIcons`, not from
        // here, so a "safety" pattern naming png/svg/ico protects nothing and
        // sweeps every image in the tree into the first install. This is the
        // one thing it does not cover — woff2 is absent from workbox-build's
        // default `**/*.{js,wasm,css,html}` (`InjectManifestOptions.json`;
        // vite-plugin-pwa supplies no default of its own), so without naming it
        // the vendored faces build and serve but never precache, and an offline
        // open falls back to a system face while everything still renders.
        //
        // So: the default, plus woff2, and nothing else. `wasm` is carried
        // through unused rather than dropped — narrowing the default is a
        // separate decision from widening it. Measured, per ADR-009's rule that
        // a successful build proves nothing here:
        //
        //   unset (default)                    10 entries,  707.26 KiB
        //   default + woff2       (this line)  20 entries,  953.85 KiB
        //   …,ico,png,svg,woff2                32 entries, 2443.82 KiB
        //
        // The third line is the one to remember: png/svg/ico cost 1.5 MB of
        // icons and mascot on first install, and buy nothing.
        globPatterns: ['**/*.{js,wasm,css,html,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
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
    // Stylesheets are inert in tests by default, so a rule can be deleted and
    // every test still passes. One rule cannot afford that: the close sheet's
    // dashed paper slot is a small affordance, and a border thinner than the
    // visual-regression budget can vanish without costing enough pixels to
    // fail a screenshot. Its test reads the computed style instead, which
    // needs the real file applied to the document.
    //
    // Named one file at a time on purpose. Turning this on everywhere would
    // let jsdom compute visibility from stylesheets across the whole suite,
    // which can flip any existing visibility assertion — a suite-wide change
    // bought for a single border.
    css: {
      include: [
        /CloseTripSheet\.css$/,
        /AdjustItemSheet\.css$/,
        /PriceHistoryBlock\.css$/,
      ],
    },
    // Reset every mock's implementation between tests, not just its recorded
    // calls. `vi.clearAllMocks()` — which most files call in `beforeEach` — only
    // does the latter, so a test that parks a mock on a promise that never
    // settles poisons every later test in the file that expects it to resolve.
    // That cost an afternoon during #171 and left a workaround comment behind.
    //
    // Note this changes what a mock returns when nothing stubs it: `vi.fn()`
    // reverts to returning `undefined`. An implementation passed as a
    // constructor argument — `vi.fn(async () => 'token')` — is part of the
    // baseline and survives; one attached afterwards — `vi.fn().mockResolvedValue(…)`
    // — is state and is cleared. The module-scope helpers in the test suite were
    // converted to the first form in this commit for exactly that reason.
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
