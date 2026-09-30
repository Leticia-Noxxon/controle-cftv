import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Versão visual alternativa (v2), compilada separadamente em dist/v2/ para não alterar a versão principal.
// Os dados são lidos da pasta compartilhada ../data/ publicada pela versão principal.
export default defineConfig({
  root: resolve(__dirname, 'v2'),
  base: './',
  build: { outDir: resolve(__dirname, 'dist/v2'), emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
