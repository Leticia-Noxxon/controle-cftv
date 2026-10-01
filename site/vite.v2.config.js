import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Ambiente de TESTE (/v2/): código em site/v2/, compilado em dist/v2/. Lê os dados publicados na raiz (../data/, ../os.json).
// VITE_DADOS = prefixo relativo dos dados; VITE_AMBIENTE = 'teste' (usado pelos módulos em preparação, atrás de feature flag).
// Módulo de OS (Fase 1: login + Usuários e Permissões): URL do projeto Supabase e chave PUBLICÁVEL (feita para o navegador;
// o acesso real é decidido pelas políticas RLS). Nunca colocar aqui a chave de serviço (service_role / sb_secret_...).
const SUPABASE_URL = 'https://baowdgzjmaxtkuugprmm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z7HFJ1mwSqpVgmqIiQ_Bsw_UU9CYzug';
export default defineConfig({
  root: resolve(__dirname, 'v2'),
  base: './',
  publicDir: false,
  define: { 'import.meta.env.VITE_DADOS': JSON.stringify('../'), 'import.meta.env.VITE_AMBIENTE': JSON.stringify('teste'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL), 'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify(SUPABASE_KEY) },
  build: { outDir: resolve(__dirname, 'dist/v2'), emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200 },
});
