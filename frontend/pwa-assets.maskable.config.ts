import { defineConfig } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    transparent: { sizes: [] },
    maskable: {
      sizes: [512],
      resizeOptions: { background: '#EEF1F5', fit: 'contain' },
      padding: 0,
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: '#EEF1F5', fit: 'contain' },
      padding: 0,
    },
  },
  images: ['public/maskable.png'],
});
