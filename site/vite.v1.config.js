import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Backup da versão anterior (v1), compilado em dist/v1/ para poder ser restaurado.
// Lê os mesmos dados publicados na raiz (../data/); não tem pasta public própria.
export default defineConfig({
  root: resolve(__dirname, 'v1'),
  base: './',
  publicDir: false,
  build: { outDir: resolve(__dirname, 'dist/v1'), emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
