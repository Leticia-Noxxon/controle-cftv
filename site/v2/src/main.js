import './style.css';
import { D, carregar, carregarCamera, dmy, esc, ICONE, camNome, GRUPO_METROPOLE, nomeMes } from './dados.js';
import { paginaVisao } from './visao.js';
import { paginaMatriz } from './matriz.js';
import { calendario } from './calendario.js';
import { logoOS } from './logo.js';
import { OS_ATIVO, sb } from './supabase.js';
import { paginaUsuarios, registrarErroLink } from './usuarios.js';

// Filtros compartilhados entre as abas. Visão geral: empresa, câmera, prefixo, período. Matriz: empresa, câmera, mês.
export const F = { empresa: '', camera: '', prefixo: '', de: '', ate: '', mes: '' };
let carregado = false;
const ABAS = { visao: { titulo: 'Visão geral', icone: ICONE.painel }, matriz: { titulo: 'Matriz diária', icone: ICONE.calgrade } };
// Módulo de OS (só no ambiente de teste, atrás de feature flag): Fase 1 = login + Usuários e Permissões
const ICONE_USUARIOS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/></svg>';
if (OS_ATIVO) ABAS.usuarios = { titulo: 'Usuários e Permissões', icone: ICONE_USUARIOS, os: true };

// Tema claro/escuro: localStorage 'cftv-tema'; padrão = preferência do sistema (aplicado já no index.html)
const temaAtual = () => document.documentElement.dataset.tema || 'claro';
function alternarTema() {
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  document.documentElement.dataset.tema = novo;
  try { localStorage.setItem('cftv-tema', novo); } catch (e) { /* sem armazenamento */ }
  const b = document.getElementById('tema-btn');
  if (b) { b.innerHTML = novo === 'escuro' ? ICONE.solar : ICONE.lua; b.title = novo === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(novo === 'escuro')); }
  window.dispatchEvent(new Event('tema'));
}

// Cabeçalho em barra: marca (ícone de OS) + título à esquerda, filtros à direita, centralizados na vertical.
// Barra lateral com a marca OS e as abas com rótulo visível (sem depender de dica).
function cabecalho(aba) {
  document.getElementById('topo').innerHTML = `<div class="marca">${logoOS()}<h1 class="titulo">Controle de CFTV</h1><span class="migalha">${ABAS[aba].titulo}</span></div>
    <div class="topo-dir"><div class="topo-filtros" id="topo-filtros"></div><button class="btn-tema" id="tema-btn" type="button" title="${temaAtual() === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}" aria-label="${temaAtual() === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}" aria-pressed="${temaAtual() === 'escuro'}">${temaAtual() === 'escuro' ? ICONE.solar : ICONE.lua}</button></div>`;
  const upd = document.getElementById('upd');
  upd.className = `atualizacao${carregado ? ' ok' : ''}`;
  upd.innerHTML = carregado ? `<i class="pt"></i>Última atualização ${dmy(D.meta.atualizacao.slice(0, 10))} ${D.meta.atualizacao.slice(11, 16)}` : '<i class="pt"></i>Carregando…';
  upd.title = 'Horário do registro mais recente nos dados';
  document.getElementById('tema-btn').onclick = alternarTema;
  document.getElementById('lateral').innerHTML = `<div class="marca-lat">${logoOS()}<div class="marca-txt"><b>OS</b><span>Controle CFTV</span></div></div>
    <div class="nav-sec">Painéis</div><nav class="nav-pill" aria-label="Abas">${Object.entries(ABAS).map(([k, a]) => `${a.os ? '<div class="nav-sec nav-sec-os">Sistema de OS <span class="nav-teste">teste</span></div>' : ''}<button class="nav-b${k === aba ? ' ativo' : ''}" id="nav-${k}" data-tip="${a.titulo}" aria-label="${a.titulo}" ${k === aba ? 'aria-current="page"' : ''}>${a.icone}<span class="nav-rot">${a.titulo}</span></button>`).join('')}</nav>`;
  document.getElementById('nav-visao').onclick = () => { location.hash = ''; };
  document.getElementById('nav-matriz').onclick = () => { location.hash = 'matriz'; };
  const nu = document.getElementById('nav-usuarios');
  if (nu) nu.onclick = () => { location.hash = 'usuarios'; };
}

// Filtros aplicados automaticamente, na linha do título. campos: empresa, camera, prefixo, periodo, mes. extra: HTML à direita.
export function barraFiltros(campos, aoFiltrar, extra = '') {
  const el = document.getElementById('topo-filtros');
  const tem = (k) => campos.includes(k);
  el.innerHTML = `<div class="filtros">
    <div class="campo"><label for="f-empresa">Empresa</label><select id="f-empresa" class="w200"><option value="">Todas</option><option value="${GRUPO_METROPOLE}" ${F.empresa === GRUPO_METROPOLE ? 'selected' : ''} title="Todas as empresas Metrópole">METROPOLE (todas)</option>${D.garagens.map((e) => `<option ${F.empresa === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
    <div class="campo"><label for="f-camera">Câmera</label><select id="f-camera" class="w170"><option value="">Todas</option>${D.cameras.map((c) => `<option value="${c}" ${F.camera === String(c) ? 'selected' : ''}>${esc(camNome(c))}</option>`).join('')}</select></div>
    ${tem('prefixo') ? `<div class="campo"><label for="f-prefixo">Prefixo</label><input id="f-prefixo" class="w120" type="search" inputmode="numeric" placeholder="Ex.: 10003" value="${esc(F.prefixo)}" /></div>` : ''}
    ${tem('periodo') ? `<div class="campo"><span class="rot" id="rot-periodo">Período</span><div id="f-periodo"></div></div>` : ''}
    ${tem('mes') ? `<div class="campo"><label for="f-mes">Mês</label><select id="f-mes" class="w-mes">${D.meses.slice().reverse().map((m) => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select></div>` : ''}
    ${extra ? `<div class="campo campo-extra">${extra}</div>` : ''}</div>`;
  const aplicar = async () => {
    F.empresa = el.querySelector('#f-empresa').value;
    F.camera = el.querySelector('#f-camera').value;
    if (tem('prefixo')) F.prefixo = el.querySelector('#f-prefixo').value.trim();
    if (tem('mes')) F.mes = el.querySelector('#f-mes').value;
    if (F.camera) await carregarCamera(F.camera);
    aoFiltrar();
  };
  if (tem('periodo')) {
    const montarCal = () => calendario(el.querySelector('#f-periodo'), { min: D.dias[0], max: D.dias[D.nd - 1], de: F.de, ate: F.ate, dias: new Set(D.dias) },
      (de, ate) => { F.de = de; F.ate = ate; montarCal(); aplicar(); });
    montarCal();
  }
  let espera = 0;
  el.querySelectorAll('select').forEach((i) => i.addEventListener('change', aplicar));
  const pre = el.querySelector('#f-prefixo');
  if (pre) {
    pre.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 300); });
    pre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(espera); aplicar(); } });
  }
}

function rota() {
  const aba = location.hash === '#matriz' ? 'matriz' : location.hash === '#usuarios' && ABAS.usuarios ? 'usuarios' : 'visao';
  cabecalho(aba);
  document.getElementById('tip').style.display = 'none';
  document.getElementById('modal')?.remove();
  if (!carregado) return;
  if (!F.mes) F.mes = D.meses[D.meses.length - 1]; // Mês padrão: o mais recente dos dados
  const app = document.getElementById('app');
  app.dataset.aba = aba;
  document.body.dataset.aba = aba; // a Visão geral pode rolar verticalmente (tabela inteira visível); a Matriz não
  ({ matriz: paginaMatriz, usuarios: paginaUsuarios, visao: paginaVisao })[aba](app);
}

// Volta do link mágico (#access_token=... ou #error=...): o SDK lê a sessão da URL; depois abre Usuários e Permissões
async function retornoLogin() {
  const h = location.hash;
  if (!OS_ATIVO) return;
  if (/error_description=|error=/.test(h)) { registrarErroLink(h); history.replaceState(null, '', location.pathname + location.search + '#usuarios'); return; }
  if (/access_token=/.test(h)) {
    try { const c = await sb(); await c.auth.getSession(); } catch (e) { /* tratado na tela */ }
    history.replaceState(null, '', location.pathname + location.search + '#usuarios');
  } else if (h === '#usuarios') { sb().catch(() => {}); }
}

async function iniciar() {
  await retornoLogin();
  rota();
  try {
    await carregar();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="vazio">Não foi possível carregar os dados (${esc(e.message)}).</div>`;
    return;
  }
  carregado = true;
  window.addEventListener('hashchange', rota);
  rota();
}
iniciar();
