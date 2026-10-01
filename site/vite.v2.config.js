import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Ambiente de TESTE (/v2/): código em site/v2/, compilado em dist/v2/. Lê os dados publicados na raiz (../data/, ../os.json).
// VITE_DADOS = prefixo relativo dos dados; VITE_AMBIENTE = 'teste' (usado pelos módulos em preparação, atrás de feature flag).
export default defineConfig({
  root: resolve(__dirname, 'v2'),
  base: './',
  publicDir: false,
  define: { 'import.meta.env.VITE_DADOS': JSON.stringify('../'), 'import.meta.env.VITE_AMBIENTE': JSON.stringify('teste') },
  build: { outDir: resolve(__dirname, 'dist/v2'), emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
