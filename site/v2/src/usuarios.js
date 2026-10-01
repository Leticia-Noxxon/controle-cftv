// Módulo de OS · Fase 1: login (link mágico por e-mail), primeiro administrador (código de uso único) e
// "Usuários e Permissões" (usuários, pré-autorização por e-mail, matriz de permissões por perfil e exceções por usuário).
// Toda regra de acesso é garantida no banco (RLS + gatilhos); a tela só esconde o que o usuário não pode fazer.
import { esc } from './dados.js';
import { sb, sessaoAtual, enviarLink, sair, msgErro } from './supabase.js';

const ACOES = ['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'administrar'];
const ROT_ACAO = { visualizar: 'Ver', criar: 'Criar', editar: 'Editar', excluir: 'Excluir', aprovar: 'Aprovar', exportar: 'Exportar', administrar: 'Administrar' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let sub = 'usuarios';           // sub-aba: usuarios | convites | perfis | excecoes
let perfilSel = null;           // perfil escolhido na matriz
let usuarioSel = null;          // usuário escolhido nas exceções
let erroUrl = '';               // erro devolvido pelo link mágico (ex.: link expirado)

export function registrarErroLink(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const d = p.get('error_description') || p.get('error');
  if (d) erroUrl = /expired|invalid/i.test(d) ? 'O link de acesso expirou ou já foi usado. Peça um novo abaixo.' : d.replace(/\+/g, ' ');
}

const dataHora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' PT';
};

function aviso(txt, tipo = 'ok') {
  let el = document.getElementById('us-aviso');
  if (!el) { el = document.createElement('div'); el.id = 'us-aviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = `us-aviso ${tipo}`;
  el.textContent = txt;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => el.classList.add('sumir'), 3800);
}

function caixaUsuario(eu) {
  const el = document.getElementById('topo-filtros');
  if (!el) return;
  el.innerHTML = eu ? `<div class="us-eu"><div class="us-eu-txt"><b>${esc(eu.nome || eu.email)}</b><span>${esc(eu.perfil_nome || 'Sem perfil')}${eu.ativo ? '' : ' · aguardando liberação'}</span></div>
    <button class="btn-mini" id="us-sair" type="button">Sair</button></div>` : '';
  const b = el.querySelector('#us-sair');
  if (b) b.onclick = async () => { await sair(); paginaUsuarios(document.getElementById('app')); };
}

export async function paginaUsuarios(app) {
  app.innerHTML = '<div class="pagina us-pag"><div class="vazio">Carregando…</div></div>';
  const pag = app.firstElementChild;
  let sessao;
  try { sessao = await sessaoAtual(); } catch (e) { pag.innerHTML = `<div class="vazio">${esc(msgErro(e))}</div>`; return; }
  if (!sessao) { caixaUsuario(null); telaLogin(pag); return; }
  const c = await sb();
  const { data: eu, error } = await c.rpc('meu_usuario').maybeSingle();
  if (error || !eu) { pag.innerHTML = `<div class="vazio">${esc(error ? msgErro(error) : 'Usuário não encontrado.')}</div>`; return; }
  caixaUsuario(eu);
  c.rpc('registrar_acesso').then(() => {}, () => {});
  if (!eu.ativo) { telaAguardando(pag, eu); return; }
  const { data: perms } = await c.rpc('minhas_permissoes');
  const pode = new Set((perms || []).map((p) => `${p.modulo}.${p.acao}`));
  if (!pode.has('usuarios.visualizar') && !pode.has('permissoes.visualizar')) {
    pag.innerHTML = `<section class="card us-card us-centro"><h2>Usuários e Permissões</h2><p class="sub">Seu perfil (${esc(eu.perfil_nome || 'sem perfil')}) não tem acesso a esta tela. Fale com um administrador.</p></section>`;
    return;
  }
  await telaGestao(pag, eu, pode);
}

// ---------- Login ----------
function telaLogin(pag) {
  pag.innerHTML = `<section class="card us-card us-centro" aria-labelledby="us-login-t">
    <h2 id="us-login-t">Entrar no Sistema de OS</h2>
    <p class="sub">Ambiente de teste. Informe seu e-mail: enviamos um link de acesso (sem senha). Abra o link e você volta para esta página já conectado.</p>
    ${erroUrl ? `<p class="us-erro" role="alert">${esc(erroUrl)}</p>` : ''}
    <form id="us-login" class="us-form" novalidate>
      <div class="campo us-campo"><label for="us-email">E-mail</label><input id="us-email" type="email" autocomplete="email" inputmode="email" required placeholder="nome@empresa.com.br" /></div>
      <button class="btn-pri" type="submit" id="us-enviar">Enviar link de acesso</button>
    </form>
    <p class="us-msg" id="us-msg" aria-live="polite"></p>
  </section>`;
  erroUrl = '';
  const f = pag.querySelector('#us-login'); const msg = pag.querySelector('#us-msg'); const btn = pag.querySelector('#us-enviar');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const email = pag.querySelector('#us-email').value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { msg.className = 'us-msg us-erro'; msg.textContent = 'Informe um e-mail válido.'; return; }
    btn.disabled = true; msg.className = 'us-msg'; msg.textContent = 'Enviando…';
    try {
      await enviarLink(email);
      msg.className = 'us-msg us-ok';
      msg.textContent = `Pronto. Enviamos o link para ${email}. Ele vale por 1 hora; confira também a caixa de spam.`;
    } catch (err) { msg.className = 'us-msg us-erro'; msg.textContent = msgErro(err); }
    finally { setTimeout(() => { btn.disabled = false; }, 30000); }
  };
}

// ---------- Conta criada, ainda sem acesso (sem convite) / primeiro administrador ----------
function telaAguardando(pag, eu) {
  const primeiro = eu.bootstrap_disponivel && !eu.existe_admin;
  pag.innerHTML = `<section class="card us-card us-centro">
    <h2>${primeiro ? 'Primeiro acesso: administrador' : 'Acesso aguardando liberação'}</h2>
    <p class="sub">Você entrou como <b>${esc(eu.email)}</b>. ${primeiro
      ? 'Ainda não há administrador no sistema. Se você recebeu o código de primeiro acesso, digite-o abaixo para virar Administradora/Administrador.'
      : 'Um administrador precisa liberar seu acesso e definir seu perfil (ou pré-autorizar seu e-mail antes do primeiro login).'}</p>
    ${primeiro ? `<form id="us-boot" class="us-form" novalidate autocomplete="off">
      <div class="campo us-campo"><label for="us-cod">Código de primeiro acesso</label><input id="us-cod" type="text" required placeholder="XXXX-XXXX-XXXX-XXXX" spellcheck="false" autocapitalize="characters" /></div>
      <button class="btn-pri" type="submit" id="us-boot-b">Confirmar código</button></form><p class="us-msg" id="us-msg" aria-live="polite"></p>` : ''}
  </section>`;
  const f = pag.querySelector('#us-boot');
  if (!f) return;
  const msg = pag.querySelector('#us-msg');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const cod = pag.querySelector('#us-cod').value.trim().toUpperCase().replace(/\s+/g, '');
    if (!cod) return;
    const b = pag.querySelector('#us-boot-b'); b.disabled = true;
    try {
      const c = await sb();
      const { data, error } = await c.rpc('reivindicar_admin', { p_codigo: cod });
      if (error) throw error;
      const txt = { ok: 'Pronto! Você agora é Administrador(a).', codigo_invalido: 'Código incorreto. Confira e tente de novo.', ja_existe_admin: 'Já existe um administrador. Peça a ele para liberar seu acesso.',
        indisponivel: 'O código expirou ou foi bloqueado após muitas tentativas. Peça um novo.', muitas_tentativas: 'Muitas tentativas. Aguarde 15 minutos.' }[data] || data;
      msg.className = `us-msg ${data === 'ok' ? 'us-ok' : 'us-erro'}`; msg.textContent = txt;
      if (data === 'ok') setTimeout(() => paginaUsuarios(document.getElementById('app')), 900);
    } catch (err) { msg.className = 'us-msg us-erro'; msg.textContent = msgErro(err); }
    finally { b.disabled = false; }
  };
}

// ---------- Gestão ----------
async function carregarTudo(c, pode) {
  const q = (t, sel, ord) => c.from(t).select(sel).order(ord);
  const [perfis, modulos, garagens, usuarios, convites, permissoes, excecoes] = await Promise.all([
    q('perfis', 'id,codigo,nome,descricao', 'id'), q('modulos', 'codigo,nome,ordem', 'ordem'), q('garagens', 'id,nome,ativo', 'nome'),
    pode.has('usuarios.visualizar') ? q('usuarios', 'id,nome,email,perfil_id,garagem_atual_id,ativo,ultimo_acesso,criado_em', 'nome') : { data: [] },
    pode.has('usuarios.visualizar') ? q('convites', 'email,nome,perfil_id,garagem_id,criado_em,usado_em', 'criado_em') : { data: [] },
    pode.has('permissoes.visualizar') ? c.from('permissoes').select('perfil_id,modulo,acao') : { data: [] },
    pode.has('permissoes.visualizar') ? c.from('permissoes_usuario').select('usuario_id,modulo,acao,permitido') : { data: [] },
  ]);
  for (const r of [perfis, modulos, garagens, usuarios, convites, permissoes, excecoes]) if (r.error) throw r.error;
  return { perfis: perfis.data, modulos: modulos.data, garagens: garagens.data, usuarios: usuarios.data, convites: convites.data, permissoes: permissoes.data, excecoes: excecoes.data };
}

async function telaGestao(pag, eu, pode) {
  const c = await sb();
  let B;
  try { B = await carregarTudo(c, pode); } catch (e) { pag.innerHTML = `<div class="vazio">${esc(msgErro(e))}</div>`; return; }
  const abas = [];
  if (pode.has('usuarios.visualizar')) abas.push(['usuarios', 'Usuários'], ['convites', 'Pré-autorizações']);
  if (pode.has('permissoes.visualizar')) abas.push(['perfis', 'Permissões por perfil'], ['excecoes', 'Exceções por usuário']);
  if (!abas.some(([k]) => k === sub)) sub = abas[0][0];
  const nomePerfil = (id) => B.perfis.find((p) => p.id === id)?.nome || '—';
  const nomeGaragem = (id) => B.garagens.find((g) => g.id === id)?.nome || '—';
  const optPerfis = (sel, vazio) => (vazio ? `<option value="">${vazio}</option>` : '') + B.perfis.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  const optGaragens = (sel) => `<option value="">—</option>` + B.garagens.filter((g) => g.ativo || g.id === sel).map((g) => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.nome)}</option>`).join('');

  const recarregar = async () => { try { B = await carregarTudo(c, pode); desenhar(); } catch (e) { aviso(msgErro(e), 'erro'); } };

  function desenhar() {
    pag.innerHTML = `<section class="card us-card us-gestao">
      <div class="vg-bar us-bar"><h2>Usuários e Permissões</h2><div class="seg" role="tablist" id="us-abas">${abas.map(([k, t]) => `<button role="tab" data-s="${k}" class="${k === sub ? 'ativo' : ''}" aria-selected="${k === sub}">${t}</button>`).join('')}</div></div>
      <div class="us-corpo" id="us-corpo"></div></section>`;
    pag.querySelectorAll('#us-abas button').forEach((b) => { b.onclick = () => { sub = b.dataset.s; desenhar(); }; });
    const corpo = pag.querySelector('#us-corpo');
    ({ usuarios: abaUsuarios, convites: abaConvites, perfis: abaPerfis, excecoes: abaExcecoes })[sub](corpo);
  }

  // Usuários: perfil e status (usuarios.administrar), garagem atual (usuarios.editar)
  function abaUsuarios(el) {
    const adm = pode.has('usuarios.administrar'); const ed = pode.has('usuarios.editar');
    el.innerHTML = `<p class="sub us-dica">Quem entra pela primeira vez sem pré-autorização aparece aqui como <b>inativo</b>, sem perfil. Defina o perfil e ative o acesso.</p>
      <div class="tb-larga"><table class="gt us-tab"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Garagem atual</th><th>Acesso</th><th>Último acesso</th></tr></thead><tbody>
      ${B.usuarios.map((u) => `<tr data-id="${u.id}"><td>${esc(u.nome)}${u.id === eu.id ? ' <span class="badge b-nd">você</span>' : ''}</td><td>${esc(u.email)}</td>
        <td>${adm && u.id !== eu.id ? `<select class="us-sel" data-c="perfil_id" aria-label="Perfil de ${esc(u.nome)}">${optPerfis(u.perfil_id, 'Sem perfil')}</select>` : esc(nomePerfil(u.perfil_id))}</td>
        <td>${ed || u.id === eu.id ? `<select class="us-sel" data-c="garagem_atual_id" aria-label="Garagem atual de ${esc(u.nome)}">${optGaragens(u.garagem_atual_id)}</select>` : esc(nomeGaragem(u.garagem_atual_id))}</td>
        <td>${adm && u.id !== eu.id ? `<label class="switch"><input type="checkbox" data-c="ativo" ${u.ativo ? 'checked' : ''} /><span class="trilho"></span><span>${u.ativo ? 'Ativo' : 'Inativo'}</span></label>` : `<span class="badge ${u.ativo ? 'b-on' : 'b-off'}">${u.ativo ? 'Ativo' : 'Inativo'}</span>`}</td>
        <td class="muted">${dataHora(u.ultimo_acesso)}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum usuário.</td></tr>'}
      </tbody></table></div>`;
    el.querySelectorAll('[data-c]').forEach((i) => {
      i.onchange = async () => {
        const id = i.closest('tr').dataset.id; const campo = i.dataset.c;
        const valor = campo === 'ativo' ? i.checked : (i.value ? Number(i.value) : null);
        if (campo === 'ativo' && valor && !B.usuarios.find((u) => u.id === id).perfil_id) { aviso('Defina o perfil antes de ativar.', 'erro'); i.checked = false; return; }
        const { error } = await c.from('usuarios').update({ [campo]: valor }).eq('id', id);
        if (error) { aviso(msgErro(error), 'erro'); } else aviso('Alteração salva.');
        recarregar();
      };
    });
  }

  // Pré-autorização: e-mail + perfil; no primeiro login o usuário já entra ativo com esse perfil
  function abaConvites(el) {
    const cria = pode.has('usuarios.criar'); const exc = pode.has('usuarios.excluir');
    el.innerHTML = `<p class="sub us-dica">Pré-autorize o e-mail de quem vai usar o sistema. A pessoa entra em <b>/v2/</b> → Usuários com o próprio e-mail (link de acesso) e já recebe o perfil escolhido.</p>
      ${cria ? `<form class="us-linha" id="us-conv" novalidate>
        <div class="campo"><label for="cv-email">E-mail</label><input id="cv-email" type="email" required placeholder="nome@empresa.com.br" class="w200" /></div>
        <div class="campo"><label for="cv-nome">Nome</label><input id="cv-nome" type="text" maxlength="120" class="w170" /></div>
        <div class="campo"><label for="cv-perfil">Perfil</label><select id="cv-perfil">${optPerfis(B.perfis.find((p) => p.codigo === 'manutencao')?.id)}</select></div>
        <div class="campo"><label for="cv-gar">Garagem</label><select id="cv-gar" class="w200">${optGaragens(null)}</select></div>
        <button class="btn-pri" type="submit">Pré-autorizar</button></form>` : ''}
      <div class="tb-larga"><table class="gt us-tab"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Garagem</th><th>Criado em</th><th>Situação</th><th></th></tr></thead><tbody>
      ${B.convites.map((v) => `<tr data-e="${esc(v.email)}"><td>${esc(v.email)}</td><td>${esc(v.nome || '—')}</td><td>${esc(nomePerfil(v.perfil_id))}</td><td>${esc(nomeGaragem(v.garagem_id))}</td>
        <td class="muted">${dataHora(v.criado_em)}</td><td>${v.usado_em ? `<span class="badge b-on">Usado em ${dataHora(v.usado_em)}</span>` : '<span class="badge b-fa">Pendente</span>'}</td>
        <td>${exc && !v.usado_em ? '<button class="btn-mini us-del" type="button">Remover</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhuma pré-autorização.</td></tr>'}
      </tbody></table></div>`;
    const f = el.querySelector('#us-conv');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const email = el.querySelector('#cv-email').value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { aviso('Informe um e-mail válido.', 'erro'); return; }
      const reg = { email, nome: el.querySelector('#cv-nome').value.trim() || null, perfil_id: Number(el.querySelector('#cv-perfil').value),
        garagem_id: el.querySelector('#cv-gar').value ? Number(el.querySelector('#cv-gar').value) : null, criado_por: eu.id };
      const { error } = await c.from('convites').insert(reg);
      if (error) aviso(msgErro(error), 'erro'); else { aviso(`${email} pré-autorizado.`); recarregar(); }
    };
    el.querySelectorAll('.us-del').forEach((b) => {
      b.onclick = async () => {
        const email = b.closest('tr').dataset.e;
        if (!confirm(`Remover a pré-autorização de ${email}?`)) return;
        const { error } = await c.from('convites').delete().eq('email', email);
        if (error) aviso(msgErro(error), 'erro'); else { aviso('Pré-autorização removida.'); recarregar(); }
      };
    });
  }

  // Matriz por perfil. O perfil Administrador fica travado (evita perder o acesso por engano).
  function abaPerfis(el) {
    const adm = pode.has('permissoes.administrar');
    if (!perfilSel || !B.perfis.some((p) => p.id === perfilSel)) perfilSel = (B.perfis.find((p) => p.codigo !== 'administrador') || B.perfis[0]).id;
    const perfil = B.perfis.find((p) => p.id === perfilSel);
    const travado = !adm || perfil.codigo === 'administrador';
    const tem = (m, a) => B.permissoes.some((p) => p.perfil_id === perfilSel && p.modulo === m && p.acao === a);
    el.innerHTML = `<div class="us-linha"><div class="seg" id="us-perfis">${B.perfis.map((p) => `<button type="button" data-p="${p.id}" class="${p.id === perfilSel ? 'ativo' : ''}">${esc(p.nome)}</button>`).join('')}</div>
      <span class="sub">${esc(perfil.descricao || '')}${perfil.codigo === 'administrador' ? ' · travado: Administrador tem acesso total' : ''}</span></div>
      <p class="sub us-dica">"Administrar" em um módulo libera todas as ações dele. Alterações valem na hora para todos os usuários do perfil.</p>
      ${matriz((m, a) => `<input type="checkbox" data-m="${m}" data-a="${a}" ${tem(m, a) ? 'checked' : ''} ${travado ? 'disabled' : ''} aria-label="${esc(perfil.nome)}: ${ROT_ACAO[a]} em ${esc(B.modulos.find((x) => x.codigo === m).nome)}" />`)}`;
    el.querySelectorAll('#us-perfis button').forEach((b) => { b.onclick = () => { perfilSel = Number(b.dataset.p); desenhar(); }; });
    el.querySelectorAll('input[data-m]').forEach((i) => {
      i.onchange = async () => {
        const reg = { perfil_id: perfilSel, modulo: i.dataset.m, acao: i.dataset.a };
        const { error } = i.checked ? await c.from('permissoes').insert(reg)
          : await c.from('permissoes').delete().match(reg);
        if (error) { aviso(msgErro(error), 'erro'); i.checked = !i.checked; } else { aviso('Permissão atualizada.'); recarregar(); }
      };
    });
  }

  // Exceções: conceder ou retirar uma ação de um usuário específico, além do perfil
  function abaExcecoes(el) {
    const adm = pode.has('permissoes.administrar');
    const lista = B.usuarios.length ? B.usuarios : [{ id: eu.id, nome: eu.nome, email: eu.email, perfil_id: null }];
    if (!usuarioSel || !lista.some((u) => u.id === usuarioSel)) usuarioSel = (lista.find((u) => u.id !== eu.id) || lista[0]).id;
    const u = lista.find((x) => x.id === usuarioSel);
    const travado = !adm || u.id === eu.id;
    const herda = (m, a) => B.permissoes.some((p) => p.perfil_id === u.perfil_id && p.modulo === m && (p.acao === a || p.acao === 'administrar'));
    const exc = (m, a) => B.excecoes.find((x) => x.usuario_id === u.id && x.modulo === m && x.acao === a);
    el.innerHTML = `<div class="us-linha"><div class="campo"><label for="us-user">Usuário</label><select id="us-user" class="w200">${lista.map((x) => `<option value="${x.id}" ${x.id === usuarioSel ? 'selected' : ''}>${esc(x.nome || x.email)}</option>`).join('')}</select></div>
      <span class="sub">Perfil: <b>${esc(nomePerfil(u.perfil_id))}</b>${u.id === eu.id ? ' · você não pode alterar as próprias exceções' : ''}</span></div>
      <p class="sub us-dica">"Perfil" segue a matriz do perfil (✓ = permitido pelo perfil). "Permitir" ou "Negar" vale só para este usuário; negar tem prioridade.</p>
      ${matriz((m, a) => { const x = exc(m, a); const v = x ? (x.permitido ? 'sim' : 'nao') : '';
        return `<select class="us-tri ${v ? `us-${v}` : ''}" data-m="${m}" data-a="${a}" ${travado ? 'disabled' : ''} aria-label="${ROT_ACAO[a]} em ${esc(B.modulos.find((y) => y.codigo === m).nome)}">
          <option value="" ${!v ? 'selected' : ''}>Perfil ${herda(m, a) ? '✓' : '–'}</option><option value="sim" ${v === 'sim' ? 'selected' : ''}>Permitir</option><option value="nao" ${v === 'nao' ? 'selected' : ''}>Negar</option></select>`; })}`;
    el.querySelector('#us-user').onchange = (e) => { usuarioSel = e.target.value; desenhar(); };
    el.querySelectorAll('select.us-tri').forEach((s) => {
      s.onchange = async () => {
        const chave = { usuario_id: u.id, modulo: s.dataset.m, acao: s.dataset.a };
        const { error } = s.value ? await c.from('permissoes_usuario').upsert({ ...chave, permitido: s.value === 'sim' })
          : await c.from('permissoes_usuario').delete().match(chave);
        if (error) aviso(msgErro(error), 'erro'); else aviso('Exceção atualizada.');
        recarregar();
      };
    });
  }

  function matriz(celula) {
    return `<div class="tb-larga"><table class="gt us-tab us-matriz"><thead><tr><th>Módulo</th>${ACOES.map((a) => `<th class="us-c">${ROT_ACAO[a]}</th>`).join('')}</tr></thead><tbody>
      ${B.modulos.map((m) => `<tr><td>${esc(m.nome)}</td>${ACOES.map((a) => `<td class="us-c">${celula(m.codigo, a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  desenhar();
}
