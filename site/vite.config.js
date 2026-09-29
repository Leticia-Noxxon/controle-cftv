import { defineConfig } from 'vite';

// Base relativa ('./') funciona em qualquer subcaminho do GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
