import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Site oficial (raiz do GitHub Pages): código CONGELADO em site/oficial/ (redesign "OS · Controle CFTV").
// site/v2/ é o ambiente de TESTE (/v2/); mudanças lá não afetam a raiz.
// site/public/ é copiado para dist/: data/ (JSON gerados por scripts/atualizar_dados.py) e os.json (OS). Base relativa ('./') funciona em qualquer subcaminho.
export default defineConfig({
  root: resolve(__dirname, 'oficial'),
  base: process.env.BASE_PATH || './',
  publicDir: resolve(__dirname, 'public'),
  build: { outDir: resolve(__dirname, 'dist'), emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
