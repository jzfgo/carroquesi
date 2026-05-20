import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      resizeOptions: { background: '#EEF1F5', fit: 'contain' },
      padding: 0.1,
    },
    maskable: {
      sizes: [512],
      resizeOptions: { background: '#EEF1F5', fit: 'contain' },
      padding: 0.1,
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: '#EEF1F5', fit: 'contain' },
      padding: 0.1,
    },
  },
  images: ['public/favicon.svg'],
})
