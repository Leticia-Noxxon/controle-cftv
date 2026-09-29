import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/montserrat/600.css';
import './style.css';
import { carregar } from './data.js';
import { esc, dmy, dmyh, fmtN, CAMS, camNome, sem } from './util.js';
import { viewSituacao } from './views/situacao.js';
import { viewMatriz } from './views/matriz.js';
import { viewProblemas } from './views/problemas.js';
import { viewManutencoes } from './views/manutencoes.js';
import { viewAnalises } from './views/analises.js';
import { viewQualidade } from './views/qualidade.js';
import { viewMetodologia } from './views/metodologia.js';
import { fecharPainel } from './painel.js';

const VIEWS = [
  ['situacao', 'Situação atual', viewSituacao],
  ['matriz', 'Matriz diária', viewMatriz],
  ['problemas', 'Problemas em aberto', viewProblemas],
  ['manutencoes', 'Manutenções', viewManutencoes],
  ['analises', 'Análises', viewAnalises],
  ['qualidade', 'Qualidade dos dados', viewQualidade],
  ['metodologia', 'Como ler', viewMetodologia],
];

export const F = { q: '', empresa: '', garagem: '', camera: '', de: '', ate: '', status: '' };
let D = null;
let atual = 'situacao';

// Prefixo: aceita lista separada por vírgula/espaço; empresa/garagem: seleção exata
export function veiculosFiltrados() {
  const lista = F.q.split(/[\s,;]+/).filter(Boolean);
  const cam = F.camera ? Number(F.camera) : null;
  return D.veiculos.filter((v) => (!lista.length || lista.some((x) => String(v.p).includes(x)))
    && (!F.empresa || v.empresa === F.empresa) && (!F.garagem || v.g === F.garagem) && (!cam || v.c.includes(cam)));
}
export const prefixoOk = (p) => {
  const lista = F.q.split(/[\s,;]+/).filter(Boolean);
  return !lista.length || lista.some((x) => String(p).includes(x));
};
export function descreverFiltros() {
  const p = [];
  if (F.q) p.push(`Prefixo: ${F.q}`);
  if (F.empresa) p.push(`Empresa: ${F.empresa}`);
  if (F.garagem) p.push(`Garagem: ${F.garagem}`);
  if (F.camera) p.push(`Câmera: ${camNome(Number(F.camera))}`);
  if (F.de || F.ate) p.push(`Período: ${F.de ? dmy(F.de) : 'início'} a ${F.ate ? dmy(F.ate) : 'fim'}`);
  if (F.status) p.push(`Status: ${F.status}`);
  return p.join(' · ') || 'Sem filtros';
}

function montarFiltros() {
  const diasComDado = D.meta.cobertura.map((c) => c.data);
  const cams = [...CAMS, ...D.camerasExtras];
  const el = document.getElementById('filtros');
  el.innerHTML = `
    <label>Prefixo<input type="search" id="f-q" placeholder="ex.: 10003 ou 10003, 20511" /></label>
    <label>Empresa<select id="f-empresa"><option value="">Todas</option>${D.empresas.map((e) => `<option>${esc(e)}</option>`).join('')}</select></label>
    <label>Garagem (formulário)<select id="f-garagem"><option value="">Todas</option>${D.garagens.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>
    <label>Câmera<select id="f-camera"><option value="">Todas</option>${cams.map((c) => `<option value="${c}">${esc(camNome(c))}</option>`).join('')}</select></label>
    <label>De<input type="date" id="f-de" min="${diasComDado[0]}" max="2026-09-30" /></label>
    <label>Até<input type="date" id="f-ate" min="${diasComDado[0]}" max="2026-09-30" /></label>
    <label>Status<select id="f-status"><option value="">Todos</option><option value="problema">Com problema</option><option value="fa">Erro SD/gravação</option><option value="of">Offline</option><option value="ok">Online (sem problema)</option></select></label>
    <button class="btn" id="f-limpar">Limpar filtros</button>
    <span class="sutil" id="f-desc" style="font-size:.76rem"></span>`;
  const ids = ['q', 'empresa', 'garagem', 'camera', 'de', 'ate', 'status'];
  let t = null;
  ids.forEach((k) => {
    const inp = document.getElementById(`f-${k}`);
    inp.addEventListener(k === 'q' ? 'input' : 'change', () => {
      F[k] = inp.value.trim();
      clearTimeout(t); t = setTimeout(render, k === 'q' ? 250 : 0);
    });
  });
  document.getElementById('f-limpar').addEventListener('click', () => { ids.forEach((k) => { F[k] = ''; document.getElementById(`f-${k}`).value = ''; }); render(); });
}

function montarMenu() {
  const nav = document.getElementById('menu');
  nav.innerHTML = VIEWS.map(([id, nome]) => `<button data-v="${id}">${esc(nome)}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.v; }));
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (VIEWS.some((v) => v[0] === h)) { atual = h; render(); } });
  const h = location.hash.slice(1);
  if (VIEWS.some((v) => v[0] === h)) atual = h;
}

export function render() {
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === atual));
  document.getElementById('f-desc').textContent = descreverFiltros() === 'Sem filtros' ? '' : `Filtros ativos — ${descreverFiltros()}`;
  const el = document.getElementById('conteudo');
  fecharPainel();
  const v = VIEWS.find((x) => x[0] === atual);
  el.innerHTML = '';
  v[2](el, D);
}

function tema() {
  const salvo = localStorage.getItem('tema-cftv');
  if (salvo) document.documentElement.dataset.tema = salvo;
  document.getElementById('btn-tema').addEventListener('click', () => {
    const t = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = t; localStorage.setItem('tema-cftv', t);
  });
  document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
}

async function iniciar() {
  tema();
  try {
    D = await carregar();
  } catch (e) {
    document.getElementById('conteudo').innerHTML = `<div class="aviso">Não foi possível carregar os dados: ${esc(e.message)}</div>`;
    return;
  }
  const m = D.meta.monitoramento;
  document.getElementById('subtitulo').textContent = `Monitoramento ${dmyh(m.inicio)} a ${dmyh(m.fim)} (Brasília)`;
  document.getElementById('rodape').innerHTML = `Fontes: ${m.arquivos.map(esc).join(', ')} · ${esc(D.meta.formulario.arquivo)} · ${esc(D.meta.relatorio?.arquivo || '')} — ${fmtN(m.registros_validos)} registros horários, ${fmtN(m.prefixos)} prefixos, ${fmtN(m.cameras)} câmeras. Dados gerados em ${dmyh(D.meta.gerado_em)}. Horários no fuso de Brasília.`;
  montarMenu();
  montarFiltros();
  document.getElementById('painel-fechar').addEventListener('click', fecharPainel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPainel(); });
  render();
}
export const dados = () => D;
export const buscaTexto = sem;
iniciar();
