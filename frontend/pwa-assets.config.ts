import { defineConfig } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      resizeOptions: { background: '#ffffff', fit: 'contain' },
      padding: 0.1,
    },
    maskable: {
      sizes: [512],
      resizeOptions: { background: '#aa3bff', fit: 'contain' },
      padding: 0.1,
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: '#ffffff', fit: 'contain' },
      padding: 0.1,
    },
  },
  images: ['public/mascot.png'],
})
