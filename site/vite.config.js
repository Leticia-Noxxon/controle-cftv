import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Site oficial (raiz do GitHub Pages): código em site/v2/ (redesign "OS · Controle CFTV").
// site/public/ é copiado para dist/: data/ (JSON gerados por scripts/atualizar_dados.py), os.json (OS) e v2/index.html
// (redireciona o endereço antigo /v2/ para a raiz). Base relativa ('./') funciona em qualquer subcaminho.
export default defineConfig({
  root: resolve(__dirname, 'v2'),
  base: process.env.BASE_PATH || './',
  publicDir: resolve(__dirname, 'public'),
  build: { outDir: resolve(__dirname, 'dist'), emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
