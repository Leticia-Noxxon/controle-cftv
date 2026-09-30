// Aba 1 — Visão geral: 4 cards (com variação em relação ao dia anterior) e tabela "Conexão por Empresa" em largura
// total, sem rolagem interna (a aba pode rolar). Veículo | Câmera, chave Manutenção, exportação Excel.
// Clique no NOME da empresa: modal com a evolução diária; clique no resto da linha: lista de veículos.
import { F, barraFiltros } from './main.js';
import { ICONE, D, veiculosFiltrados, faixaDias, situacao, noCard, empresaPassa, garagemDoFormulario, camNome, dmy, fmtN, fmtP, esc, CAMS_POS, GRUPO_METROPOLE } from './dados.js';
import { abrirGaragem, abrirModal } from './garagem.js';
import { analisar, carregarAux } from './os.js';
import { exportarTabela } from './xlsx.js';
import { rotuloPeriodo } from './calendario.js';

// blocos da tabela (chaves): sit = Situação atual, pos = Falha por posição, manut = Manutenção
export const S1 = { card: '', modo: 'veic', sit: true, pos: true, manut: false, ord: { k: 'g', dir: 1 } };
let ultimo = null;

// Colunas: rot = cabeçalho curto; tip = definição completa (dica do cabeçalho e nota no Excel); grupo = bloco
// Situação atual: mesmos nomes nos modos Veículo e Câmera (a coluna de total fica sempre visível ao lado da Empresa)
const COLS_VEIC = [
  { k: 'vf', rot: 'Funcionais', tip: 'Veículos com todas as câmeras funcionais no último registro de cada câmera no período' },
  { k: 'vp', rot: '1+ câm. c/ falha', tip: 'Veículos com uma ou mais câmeras offline, mas não todas (problema de conexão), no último registro' },
  { k: 'vo', rot: '100% offline', tip: 'Veículos com todas as câmeras offline no último registro' },
  { k: 'vs', rot: 'Erro SD', tip: 'Veículos sem câmera offline, mas com uma ou mais câmeras com erro de SD card no último registro' },
  { k: 'vn', rot: 'Sem conexão', tip: 'Veículos sem nenhum registro no período', opcional: true },
];
const COLS_CAM = [
  { k: 'cf', rot: 'Funcionais', tip: 'Câmeras cujo último registro no período é funcional' },
  { k: 'cp', rot: '1+ câm. c/ falha', tip: 'Câmeras offline em veículos com parte das câmeras offline (problema de conexão), no último registro' },
  { k: 'co', rot: '100% offline', tip: 'Câmeras de veículos com todas as câmeras offline, no último registro' },
  { k: 'cs', rot: 'Erro SD', tip: 'Câmeras cujo último registro no período é erro de SD card' },
];
const TOTAL = { veic: { k: 'vt', rot: 'Veículos', tip: 'Veículos nos filtros' }, cam: { k: 'ct', rot: 'Câmeras', tip: 'Câmeras com registro no período' } };
const COLS_MANUT = [
  { k: 'ma', rot: 'Atendidos', tip: 'Veículos atendidos: prefixos distintos com ao menos uma manutenção registrada no período' },
  { k: 'mr', rot: 'Reincidências', tip: 'Veículos atendidos em 2 ou mais dias diferentes no período' },
  { k: 'mp', rot: 'Procedentes', tip: 'Atendimentos procedentes: veículos com ao menos uma visita necessária (câmera offline ou com erro de SD no dia da visita, antes do horário, ou no dia anterior)' },
  { k: 'ms', rot: 'Solucionados', tip: "Ocorrências solucionadas: dos procedentes, a última visita necessária resolveu (câmeras normalizadas depois e sem nova falha; 'resolvido com recorrência' não conta)" },
  { k: 'mi', rot: 'Improcedentes', tip: 'Atendimentos improcedentes: veículos atendidos sem nenhuma visita necessária (câmeras funcionais no dia da visita e no anterior); visitas sem dados para avaliar não entram' },
];

export function paginaVisao(app) {
  app.innerHTML = `<div class="pagina pag-visao"><section class="cards" id="v-cards"></section>
    <section class="card vg-tab"><div class="vg-bar"><h2 class="sr">Conexão por Empresa</h2>
      <div class="acoes"><div class="seg" id="v-modo" role="group" aria-label="Contagem por"><button data-m="veic">Veículo</button><button data-m="cam">Câmera</button></div>
      <div class="blocos" role="group" aria-label="Blocos de colunas">${[['v-sit', 'sit', 'Situação atual', 'Funcionais, 1+ câm. c/ falha, 100% offline e Erro SD'], ['v-pos', 'pos', 'Falha por posição', 'Falhas em cada posição de câmera (21 a 26)'], ['v-manut', 'manut', 'Manutenção', 'Atendidos, Reincidências, Procedentes, Solucionados e Improcedentes']]
        .map(([id, k, rot, tip]) => `<label class="switch sw-${k}" title="Mostrar/ocultar: ${tip}"><input type="checkbox" id="${id}" data-b="${k}" ${S1[k] ? 'checked' : ''}/><span class="trilho" aria-hidden="true"></span><span>${rot}</span></label>`).join('')}</div>
      <button class="btn-mini" id="v-xlsx" title="Exportar a visão atual (com filtros) para Excel">${ICONE.excel}<span>Excel</span></button></div></div>
      <div class="tb-larga" id="v-tabela"></div></section></div>`;
  barraFiltros(['empresa', 'camera', 'prefixo', 'periodo'], () => atualizar());
  app.querySelectorAll('#v-modo button').forEach((b) => { b.onclick = () => { S1.modo = b.dataset.m; if (!['g', ...colunas().map((c) => c.k)].includes(S1.ord.k)) S1.ord = { k: 'g', dir: 1 }; atualizar(); }; });
  app.querySelectorAll('.blocos input').forEach((i) => { i.onchange = () => { S1[i.dataset.b] = i.checked; if (!['g', ...colunas().map((c) => c.k)].includes(S1.ord.k)) S1.ord = { k: 'g', dir: 1 }; tabela(); }; });
  app.querySelector('#v-xlsx').onclick = exportar;
  window.onresize = null;
  atualizar();
}

const camsVisiveis = () => (F.camera ? CAMS_POS.filter((c) => String(c) === F.camera) : CAMS_POS);
function colunas() {
  const tot = { ...TOTAL[S1.modo], grupo: 't' };
  const base = S1.sit ? (S1.modo === 'veic' ? COLS_VEIC : COLS_CAM).filter((c) => !c.opcional || (ultimo && ultimo.total[c.k] > 0)).map((c, i) => ({ ...c, grupo: 's', ini: i === 0 })) : [];
  const cams = camsVisiveis().map((c, i) => ({ k: `c${c}`, rot: String(c), grupo: 'c', ini: i === 0,
    tip: S1.modo === 'veic' ? `Veículos com erro de SD card ou offline na ${camNome(c)} (último registro)` : `Câmeras ${c} (${camNome(c).split('· ')[1] || ''}) com erro de SD card ou offline (último registro)` }));
  return [tot, ...base, ...(S1.pos ? cams : []), ...(S1.manut ? COLS_MANUT.map((c, i) => ({ ...c, grupo: 'm', ini: i === 0 })) : [])];
}

function agregar(lista) {
  const g = new Map();
  const novo = (nome) => ({ g: nome, vt: 0, vf: 0, vp: 0, vo: 0, vs: 0, vn: 0, ct: 0, cf: 0, cp: 0, cs: 0, co: 0, ma: 0, mr: 0, mp: 0, ms: 0, mi: 0, ...Object.fromEntries(CAMS_POS.map((c) => [`c${c}`, 0])) });
  const linha = (nome) => { if (!g.has(nome)) g.set(nome, novo(nome)); return g.get(nome); };
  lista.forEach(({ v, s }) => {
    const r = linha(v.garagem);
    r.vt += 1;
    r[{ on: 'vf', fa: 'vp', off: 'vo', sd: 'vs', nd: 'vn' }[s.cat]] += 1;
    r.ct += s.n; r.cf += s.on; r.cs += s.fa;
    if (s.cat === 'off') r.co += s.off; else r.cp += s.off; // offline: veículo 100% offline x parcial
    Object.entries(s.cams).forEach(([c, k]) => { if (k !== 'on' && r[`c${c}`] !== undefined) r[`c${c}`] += 1; });
  });
  return { linha, g, novo };
}

function calcular() {
  const dias = faixaDias({ de: F.de, ate: F.ate });
  const cam = F.camera || null;
  const vs = veiculosFiltrados(F);
  const todos = vs.map((v) => ({ v, s: situacao(v, dias, cam) }));
  // base de comparação dos cards: fechamento do dia anterior ao último dia do período
  const antes = dias.length > 1 ? vs.map((v) => ({ v, s: situacao(v, dias.slice(0, -1), cam) })) : null;
  const lista = S1.card ? todos.filter((x) => noCard(x.s, S1.card)) : todos;
  const { linha, g, novo } = agregar(lista);
  manutencao(lista, linha);
  const linhas = [...g.values()];
  const total = novo('Total');
  linhas.forEach((r) => Object.keys(total).forEach((k) => { if (k !== 'g') total[k] += r[k]; }));
  return { dias, todos, antes, lista, linhas, total };
}

// Manutenção (formulário + análise antes/depois do pipeline), contagem de VEÍCULOS por Empresa normalizada.
function manutencao(lista, linha) {
  const de = F.de || '', ate = F.ate || '9999'; // sem período: todas as visitas do formulário
  const noFiltro = new Set(lista.map((x) => x.v.p));
  const porP = new Map();
  D.manut.forEach((m) => {
    if (m.d < de || m.d > ate) return;
    if (F.camera && !(m.cams || []).map(String).includes(F.camera)) return;
    const v = D.porPrefixo.get(Number(m.p));
    if (v ? !noFiltro.has(v.p) : (F.prefixo || S1.card || F.camera || !empresaPassa(garagemDoFormulario(m.g), F.empresa))) return;
    if (!porP.has(m.p)) porP.set(m.p, []);
    porP.get(m.p).push(m);
  });
  porP.forEach((vs, p) => {
    vs.sort((a, b) => (a.d + a.h).localeCompare(b.d + b.h));
    const v = D.porPrefixo.get(Number(p));
    const r = linha(v ? v.garagem : garagemDoFormulario(vs[vs.length - 1].g));
    const precisou = vs.filter((m) => m.pr === 'Sim');
    r.ma += 1;
    if (new Set(vs.map((m) => m.d)).size > 1) r.mr += 1;
    if (precisou.length) { r.mp += 1; if (precisou[precisou.length - 1].rs === 'Resolvido') r.ms += 1; } else if (vs.some((m) => m.pr === 'Não')) r.mi += 1;
  });
}

function atualizar() {
  ultimo = calcular();
  cards();
  tabela();
  document.querySelectorAll('#v-modo button').forEach((b) => b.classList.toggle('ativo', b.dataset.m === S1.modo));
}

function contar(xs) {
  let on = 0, fa = 0, off = 0, veic = 0;
  xs.forEach(({ s }) => { on += s.on; fa += s.fa; off += s.off; if (s.falha) veic += 1; });
  return { on, fa, off, veic, tot: on + fa + off, n: xs.length };
}

function cards() {
  const a = contar(ultimo.todos), b = ultimo.antes ? contar(ultimo.antes) : null;
  const { dias } = ultimo;
  const dUlt = dias.length ? dmy(D.dias[dias[dias.length - 1]]) : '', dAnt = dias.length > 1 ? dmy(D.dias[dias[dias.length - 2]]) : '';
  const base = b ? `Variação em relação ao dia anterior: último registro de cada câmera até ${dAnt} (fechamento do dia anterior) comparado com até ${dUlt} (último dia do ${F.de || F.ate ? 'período escolhido' : 'período dos dados'}).` : 'Sem dia anterior no período para comparar.';
  // variação no canto superior direito, com cor semântica: verde = melhora, vermelho = piora (a base fica na dica)
  const delta = (k, bomSobe) => {
    if (!b) return '';
    const d = a[k] - b[k];
    const cls = !d ? 'neutro' : (d > 0) === bomSobe ? 'bom' : 'ruim';
    return `<span class="delta ${cls}" title="${base}" aria-label="${d ? `${d > 0 ? 'aumento' : 'queda'} de ${fmtN(Math.abs(d))}` : 'sem variação'} em relação ao dia anterior">${d > 0 ? '↑' : d < 0 ? '↓' : '='} ${fmtN(Math.abs(d))}</span>`;
  };
  const pc = (n, t) => (t ? `<span class="pc" title="Participação no total">${fmtP((100 * n) / t)}</span>` : '');
  const card = (ic, cls, rot, val, extra, k, dl) => `<div class="card kpi clic${S1.card === k ? ' ativo' : ''}" data-card="${k}" role="button" tabindex="0" aria-pressed="${S1.card === k}" title="${S1.card === k ? 'Clique para limpar' : 'Filtrar a tabela por este card'}"><div class="rot"><span class="ic ${cls}">${ic}</span><span class="rot-t">${rot}</span>${dl}</div><div class="val-l"><span class="val">${fmtN(val)}</span>${extra}</div></div>`;
  document.getElementById('v-cards').innerHTML = card(ICONE.ok, 'c-on', 'Câmeras funcionais', a.on, pc(a.on, a.tot), 'on', delta('on', true))
    + card(ICONE.sd, 'c-sd', 'Câmeras com erro de SD card', a.fa, pc(a.fa, a.tot), 'fa', delta('fa', false))
    + card(ICONE.off, 'c-off', 'Câmeras 100% offline', a.off, pc(a.off, a.tot), 'off', delta('off', false))
    + card(ICONE.alerta, 'c-veic', 'Veículos com falha', a.veic, pc(a.veic, a.n), 'veic', delta('veic', false));
  document.querySelectorAll('#v-cards .clic').forEach((c) => {
    const alternar = () => { S1.card = S1.card === c.dataset.card ? '' : c.dataset.card; atualizar(); };
    c.addEventListener('click', alternar);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
  });
}

function ordenadas() {
  const { k, dir } = S1.ord;
  return ultimo.linhas.slice().sort((a, b) => {
    const c = k === 'g' ? a.g.localeCompare(b.g, 'pt-BR') : a[k] - b[k];
    return c ? c * dir : a.g.localeCompare(b.g, 'pt-BR');
  });
}

function tabela() {
  const el = document.getElementById('v-tabela');
  const cols = colunas();
  if (!ultimo.linhas.length) { el.innerHTML = '<div class="vazio">Nenhum veículo para os filtros.</div>'; return; }
  const seta = (k) => (S1.ord.k === k ? `<span class="seta">${S1.ord.dir > 0 ? '↑' : '↓'}</span>` : '');
  const aria = (k) => (S1.ord.k === k ? (S1.ord.dir > 0 ? 'ascending' : 'descending') : 'none');
  const cls = (c) => `${c.ini ? ' g-ini' : ''} g-${c.grupo}`;
  const n = (g) => cols.filter((c) => c.grupo === g).length;
  const tot = cols[0];
  const veic = S1.modo === 'veic';
  const grupos = `<tr class="tr-grupo"><th rowspan="2" class="ord th-emp" data-o="g" aria-sort="${aria('g')}">Empresa${seta('g')}</th>
    <th rowspan="2" class="n ord g-t th-tot" data-o="${tot.k}" data-tip="${esc(tot.tip)}" aria-sort="${aria(tot.k)}">${tot.rot}${seta(tot.k)}</th>
    ${n('s') ? `<th colspan="${n('s')}" class="gh g-ini g-s" aria-label="Situação atual"></th>` : ''}
    ${n('c') ? `<th colspan="${n('c')}" class="gh g-ini g-c" data-tip="${veic ? 'Nº de veículos com erro de SD card ou offline em cada posição de câmera (último registro). Clique num número para ver os veículos.' : 'Nº de câmeras com erro de SD card ou offline em cada posição (último registro). Clique num número para ver os veículos.'}">Falha por posição</th>` : ''}
    ${n('m') ? `<th colspan="${n('m')}" class="gh g-ini g-m">Manutenção</th>` : ''}</tr>`;
  const th = (c) => `<th class="n ord${cls(c)}" data-o="${c.k}" data-tip="${esc(c.tip)}" aria-sort="${aria(c.k)}">${c.rot}${seta(c.k)}</th>`;
  const td = (r, c) => {
    const v = r[c.k];
    if (c.grupo === 'c' && v) return `<td class="n${cls(c)}"><button class="num-pos" data-cam="${c.k.slice(1)}" title="Ver os ${fmtN(v)} ${veic ? 'veículos' : 'veículos com a câmera'} com falha na câmera ${c.rot}">${fmtN(v)}</button></td>`;
    return `<td class="n${v ? '' : ' z'}${cls(c)}">${fmtN(v)}</td>`;
  };
  el.innerHTML = `<table class="gt gt-emp"><thead>${grupos}<tr>${cols.slice(1).map(th).join('')}</tr></thead>
    <tbody>${ordenadas().map((r) => `<tr class="clic-g" data-g="${esc(r.g)}" tabindex="0" title="Clique no nome para ver a evolução diária; no resto da linha, os veículos"><td class="td-emp"><button class="lnk-g" data-g="${esc(r.g)}" title="Evolução diária de ${esc(r.g)}">${esc(r.g)}</button></td>${cols.map((c) => td(r, c)).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr class="total" data-g=""><td class="td-emp">Total</td>${cols.map((c) => td(ultimo.total, c)).join('')}</tr></tfoot></table>`;
  el.querySelectorAll('th.ord').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.o; S1.ord = { k, dir: S1.ord.k === k ? -S1.ord.dir : (k === 'g' ? 1 : -1) }; tabela();
  }));
  const tip = document.getElementById('tip');
  el.querySelectorAll('th[data-tip]').forEach((h) => {
    h.addEventListener('mouseenter', () => { tip.className = 'tip'; tip.innerHTML = `<div class="t1">${h.childNodes[0].textContent}</div><div class="sub">${h.dataset.tip}</div>`; const r = h.getBoundingClientRect(); tip.style.display = 'block'; tip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8))}px`; tip.style.top = `${r.bottom + 6}px`; });
    h.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
  const abrir = (g, aba) => { tip.style.display = 'none'; abrirGaragem(g, ultimo.lista.filter((x) => x.v.garagem === g), ultimo.dias, aba, S1.modo); };
  el.querySelectorAll('.lnk-g').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); abrir(b.dataset.g, 'grafico'); }));
  el.querySelectorAll('.num-pos').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); tip.style.display = 'none'; abrirPosicao(b.closest('tr').dataset.g, Number(b.dataset.cam)); }));
  el.querySelectorAll('tbody tr.clic-g').forEach((tr) => {
    tr.addEventListener('click', () => abrir(tr.dataset.g, 'veiculos'));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) abrir(tr.dataset.g, 'veiculos'); });
  });
}

// Modal "Falha por posição": só os veículos da empresa (ou de todas, na linha Total) com a câmera `cam` com falha
const ROT_CAM = { fa: 'Erro SD', off: 'Offline' };
async function abrirPosicao(g, cam) {
  const A = await carregarAux();
  const lista = ultimo.lista.filter((x) => (!g || x.v.garagem === g) && x.s.cams[cam] && x.s.cams[cam] !== 'on');
  const linhas = lista.map(({ v, s }) => {
    const r = analisar(v, String(cam), A);
    const c = r.cams[cam] || {};
    const man = r.man && r.man !== '—' ? r.man : '—';
    return { p: v.p, g: v.garagem, st: ROT_CAM[s.cams[cam]], dias: c.n || 0, u: c.uc ? `${dmy(c.uc.slice(0, 10))} ${c.uc.slice(11, 16)}` : '—', man };
  }).sort((a, b) => b.dias - a.dias || a.p - b.p);
  const curto = (t) => (t.length > 70 ? `${t.slice(0, t.lastIndexOf(' ', 70) > 40 ? t.lastIndexOf(' ', 70) : 70)}…` : t);
  const per = rotuloPeriodo(F.de, F.ate);
  const m = abrirModal(`<div class="modal-cab"><div><h2>${esc(camNome(cam))} · ${esc(g || 'Todas as empresas')}</h2><div class="sub">${fmtN(linhas.length)} ${linhas.length === 1 ? 'veículo' : 'veículos'} com a câmera ${cam} em falha no último registro · ${per}</div></div>
      <div class="cab-acoes"><button class="btn-mini btn-sutil" id="pos-xlsx" title="Exportar esta lista para Excel">${ICONE.excel}<span>Exportar Excel</span></button><button class="fechar md-fechar" aria-label="Fechar">${ICONE.x}</button></div></div>
    <div class="tb-scroll"><table class="gt gt-pos"><thead><tr>${g ? '' : '<th>Empresa</th>'}<th>Prefixo</th><th>Status</th><th class="n" title="Sequência atual de dias com problema desta câmera">Dias c/ problema</th><th>Último registro</th><th>Última manutenção</th></tr></thead>
    <tbody>${linhas.map((r) => `<tr>${g ? '' : `<td>${esc(r.g)}</td>`}<td><b>${r.p}</b></td><td><span class="badge ${r.st === 'Offline' ? 'b-off' : 'b-sd'}">${r.st}</span></td><td class="n">${fmtN(r.dias)}</td><td>${r.u}</td><td class="man-c" title="${esc(r.man)}">${esc(curto(r.man))}</td></tr>`).join('')}</tbody></table></div>`, 'modal-pos');
  m.querySelector('#pos-xlsx').onclick = () => exportarTabela({
    titulo: `Controle de CFTV — ${camNome(cam)} com falha · ${g || 'Todas as empresas'}`, aba: `Câmera ${cam}`,
    filtros: [['Empresa', g || 'Todas'], ['Câmera', camNome(cam)], ['Período', per]],
    colunas: [...(g ? [] : [{ rot: 'Empresa', larg: 26 }]), { rot: 'Prefixo', larg: 10 }, { rot: 'Status', larg: 11 }, { rot: 'Dias com problema', larg: 12 }, { rot: 'Último registro', larg: 17 }, { rot: 'Última manutenção', larg: 90 }],
    linhas: linhas.map((r) => [...(g ? [] : [r.g]), r.p, r.st, r.dias, r.u, r.man]),
    arquivo: `cftv_cam${cam}_${(g || 'todas').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_')}`,
  });
}

const NOME_CARD = { on: 'com câmera funcional', fa: 'com erro de SD card', off: 'com câmera offline', veic: 'com falha' };
function exportar() {
  const cols = colunas();
  const emp = F.empresa === GRUPO_METROPOLE ? 'METROPOLE (todas)' : F.empresa || 'Todas';
  const filtros = [['Empresa', emp], ['Câmera', F.camera ? camNome(F.camera) : 'Todas'], ['Prefixo', F.prefixo || 'Todos'], ['Período', rotuloPeriodo(F.de, F.ate)],
    ['Card', S1.card ? `Veículos ${NOME_CARD[S1.card]}` : 'Nenhum'], ['Contagem', S1.modo === 'veic' ? 'Veículos' : 'Câmeras'], ['Blocos', [S1.sit && 'Situação atual', S1.pos && 'Falha por posição', S1.manut && 'Manutenção'].filter(Boolean).join(', ') || 'Só totais']];
  const nomeCol = (c) => (c.grupo === 'c' ? `Câm ${c.rot}` : c.grupo === 'm' ? `Manut. ${c.rot}` : c.rot);
  exportarTabela({
    titulo: 'Controle de CFTV — Conexão por Empresa', aba: 'Conexão por Empresa', filtros,
    colunas: [{ rot: 'Empresa', larg: 30 }, ...cols.map((c) => ({ rot: nomeCol(c), larg: Math.max(10, Math.min(18, nomeCol(c).length + 3)), nota: c.tip }))],
    linhas: ordenadas().map((r) => [r.g, ...cols.map((c) => r[c.k])]),
    total: ['Total', ...cols.map((c) => ultimo.total[c.k])],
    arquivo: 'cftv_conexao_por_empresa',
  });
}
