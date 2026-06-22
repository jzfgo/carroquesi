import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      resizeOptions: { fit: 'contain' },
      padding: 0,
    },
    maskable: { sizes: [] },
    apple: { sizes: [] },
  },
  images: ['public/transparent.png'],
})
