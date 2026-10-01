// Conexão com o Supabase (só no ambiente de teste /v2/). Usa a URL do projeto e a chave PUBLICÁVEL (segura no navegador:
// todo acesso passa pelas políticas RLS do banco). A chave de serviço nunca vai para o frontend.
// O SDK é carregado sob demanda (import dinâmico), então os painéis atuais não ficam mais pesados.
const URL_SB = import.meta.env.VITE_SUPABASE_URL || '';
const CHAVE_SB = import.meta.env.VITE_SUPABASE_KEY || '';
export const OS_ATIVO = !!(URL_SB && CHAVE_SB && import.meta.env.VITE_AMBIENTE === 'teste');

const SESSAO_MAX_H = 12;               // sessão máxima no aplicativo (configuracoes.sessao_expira_horas)
const CHAVE_LOGIN = 'cftv-login-em';   // horário do login neste aparelho
let cliente = null;
let carregando = null;

export async function sb() {
  if (!OS_ATIVO) throw new Error('Módulo de OS desativado neste ambiente.');
  if (cliente) return cliente;
  if (!carregando) {
    carregando = import('@supabase/supabase-js').then(({ createClient }) => {
      cliente = createClient(URL_SB, CHAVE_SB, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'cftv-os-auth' },
      });
      cliente.auth.onAuthStateChange((ev) => {
        if (ev === 'SIGNED_IN' && !lerLogin()) gravarLogin();
        if (ev === 'SIGNED_OUT') limparLogin();
        window.dispatchEvent(new CustomEvent('sessao', { detail: ev }));
      });
      return cliente;
    });
  }
  return carregando;
}

function lerLogin() { try { return Number(localStorage.getItem(CHAVE_LOGIN)) || 0; } catch (e) { return 0; } }
function gravarLogin() { try { localStorage.setItem(CHAVE_LOGIN, String(Date.now())); } catch (e) { /* sem armazenamento */ } }
function limparLogin() { try { localStorage.removeItem(CHAVE_LOGIN); } catch (e) { /* sem armazenamento */ } }

// Sessão atual (null se não logado ou se passou de 12 h desde o login: encerra e pede novo link)
export async function sessaoAtual() {
  const c = await sb();
  const { data } = await c.auth.getSession();
  const s = data.session;
  if (!s) return null;
  const em = lerLogin();
  if (!em) gravarLogin();
  else if (Date.now() - em > SESSAO_MAX_H * 3600e3) { await sair(); return null; }
  return s;
}

// Link mágico por e-mail (sem senha). O link volta para esta mesma página (/v2/).
export async function enviarLink(email) {
  const c = await sb();
  const destino = location.origin + location.pathname;
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: destino, shouldCreateUser: true } });
  if (error) throw error;
}

export async function sair() {
  const c = await sb();
  limparLogin();
  await c.auth.signOut();
}

// Mensagens de erro do banco/Auth em português
export function msgErro(e) {
  const m = (e && (e.message || e.error_description)) || String(e || 'Erro');
  if (/rate limit|too many|security purposes/i.test(m)) return 'Muitos pedidos seguidos. Aguarde um minuto e tente de novo.';
  if (/row-level security|permission denied|42501/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/duplicate key|already exists|23505/i.test(m)) return 'Já existe um registro com esses dados.';
  if (/invalid email|email address .* invalid/i.test(m)) return 'E-mail inválido.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}
