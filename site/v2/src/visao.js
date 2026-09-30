// Aba 1 — Visão geral: 4 cards, tabela por Garagem/Empresa (Veículo | Câmera, colunas de Manutenção, exportação
// Excel, detalhe da garagem) e gráfico "Evolução diária".
import { F, barraFiltros } from './main.js';
import { ICONE, D, veiculosFiltrados, faixaDias, situacao, noCard, estadoDia, empresaPassa, garagemDoFormulario, camNome, dmy, fmtN, fmtP, esc, CAMS_POS, GRUPO_METROPOLE } from './dados.js';
import { graficoLinhas } from './grafico.js';
import { abrirGaragem } from './garagem.js';
import { exportarTabela } from './xlsx.js';

export const S1 = { card: '', modo: 'veic', manut: false, ord: { k: 'g', dir: 1 }, pane: 'tabela' };
let ultimo = null; // última visão calculada (tabela, gráfico, exportação)

// Definições das colunas. val(r) = valor da linha agregada; tip = definição exibida no cabeçalho.
const COLS_VEIC = [
  { k: 'vt', rot: 'Veículos', tip: 'Veículos nos filtros' },
  { k: 'vf', rot: 'Veículos funcionais', tip: 'Todas as câmeras funcionais no último registro de cada câmera no período' },
  { k: 'vp', rot: 'Veículos com 1+ câmera com falha', tip: 'Pelo menos uma câmera com erro de SD card ou offline no último registro (mesma regra do card Veículos com falha)' },
  { k: 'vo', rot: 'Veículos 100% offline', tip: 'Todas as câmeras com registro estão offline no último registro' },
  { k: 'vs', rot: 'Veículos com erro de SD card', tip: 'Pelo menos uma câmera com erro de SD card no último registro' },
];
const COLS_CAM = [
  { k: 'ct', rot: 'Câmeras', tip: 'Câmeras com registro no período' },
  { k: 'cf', rot: 'Câmeras funcionais', tip: 'Câmeras cujo último registro no período é funcional' },
  { k: 'cs', rot: 'Câmeras com erro de SD card', tip: 'Câmeras cujo último registro no período é erro de SD card' },
  { k: 'co', rot: 'Câmeras 100% offline', tip: 'Câmeras cujo último registro no período é offline' },
];
const COLS_MANUT = [
  { k: 'ma', rot: 'Veículos atendidos', tip: 'Veículos (prefixos distintos) com ao menos uma manutenção registrada no período' },
  { k: 'mr', rot: 'Reincidências', tip: 'Veículos atendidos em 2 ou mais dias diferentes no período' },
  { k: 'mp', rot: 'Atendimentos procedentes', tip: 'Veículos com ao menos uma visita necessária: câmera offline ou com erro de SD no dia da visita (antes do horário) ou no dia anterior' },
  { k: 'ms', rot: 'Ocorrências solucionadas', tip: "Dos procedentes: a última visita necessária resolveu (câmeras normalizadas depois, sem nova falha; 'resolvido com recorrência' não conta)" },
  { k: 'mi', rot: 'Atendimentos improcedentes', tip: 'Veículos atendidos sem nenhuma visita necessária (câmeras funcionais no dia da visita e no anterior); visitas sem dados para avaliar não entram' },
];

export function paginaVisao(app) {
  app.innerHTML = `<div class="pagina pag-visao"><section id="v-filtros"></section><section class="cards" id="v-cards"></section>
    <div class="seg seg-mob" role="tablist" aria-label="Conteúdo"><button data-pane="tabela" role="tab">Tabela</button><button data-pane="grafico" role="tab">Gráfico</button></div>
    <section class="vg-area" id="v-area" data-pane="${S1.pane}">
      <div class="card vg-tab"><div class="vg-bar"><div class="vg-tit"><h2>Situação por Garagem/Empresa</h2><div class="sub" id="v-sub"></div></div>
        <div class="acoes"><div class="seg" id="v-modo" role="group" aria-label="Contagem por"><button data-m="veic">Veículo</button><button data-m="cam">Câmera</button></div>
        <button class="btn-mini" id="v-manut" aria-pressed="false" title="Adicionar as colunas de manutenção à tabela">${ICONE.chave}<span>Manutenção</span></button>
        <button class="btn-mini" id="v-xlsx" title="Exportar a visão atual (com filtros) para Excel">${ICONE.excel}<span>Excel</span></button></div></div>
        <div class="tb-scroll" id="v-tabela"></div></div>
      <div class="card vg-graf"><div class="vg-bar"><div class="vg-tit"><h2>Evolução diária</h2><div class="sub" id="v-gsub"></div></div></div>
        <div class="leg-graf" id="v-gleg"></div><div class="graf" id="v-graf"></div></div>
    </section></div>`;
  barraFiltros(app.querySelector('#v-filtros'), ['empresa', 'camera', 'prefixo', 'periodo'], atualizar);
  app.querySelectorAll('#v-modo button').forEach((b) => { b.onclick = () => { S1.modo = b.dataset.m; if (!['g', ...colunas().map((c) => c.k)].includes(S1.ord.k)) S1.ord = { k: 'g', dir: 1 }; atualizar(); }; });
  app.querySelector('#v-manut').onclick = () => { S1.manut = !S1.manut; atualizar(); };
  app.querySelector('#v-xlsx').onclick = exportar;
  app.querySelectorAll('.seg-mob button').forEach((b) => { b.onclick = () => { S1.pane = b.dataset.pane; app.querySelector('#v-area').dataset.pane = S1.pane; marcarSeg(); desenharGrafico(); }; });
  window.onresize = () => desenharGrafico();
  atualizar();
}

function marcarSeg() {
  document.querySelectorAll('#v-modo button').forEach((b) => b.classList.toggle('ativo', b.dataset.m === S1.modo));
  document.querySelectorAll('.seg-mob button').forEach((b) => { b.classList.toggle('ativo', b.dataset.pane === S1.pane); b.setAttribute('aria-selected', b.dataset.pane === S1.pane); });
  const m = document.getElementById('v-manut');
  m.classList.toggle('ativo', S1.manut); m.setAttribute('aria-pressed', S1.manut);
}

const camsVisiveis = () => (F.camera ? CAMS_POS.filter((c) => String(c) === F.camera) : CAMS_POS);
function colunas() {
  const base = S1.modo === 'veic' ? COLS_VEIC : COLS_CAM;
  const cams = camsVisiveis().map((c) => ({ k: `c${c}`, rot: `Câm ${c}`, tip: S1.modo === 'veic' ? `Veículos com erro de SD card ou offline na ${camNome(c)} (último registro)` : `Câmeras ${c} com erro de SD card ou offline (último registro)`, cam: true }));
  return [...base, ...cams, ...(S1.manut ? COLS_MANUT.map((c) => ({ ...c, man: true })) : [])];
}

function calcular() {
  const dias = faixaDias({ de: F.de, ate: F.ate });
  const cam = F.camera || null;
  const todos = veiculosFiltrados(F).map((v) => ({ v, s: situacao(v, dias, cam) }));
  const lista = S1.card ? todos.filter((x) => noCard(x.s, S1.card)) : todos;
  const g = new Map();
  const novo = (nome) => ({ g: nome, vt: 0, vf: 0, vp: 0, vo: 0, vs: 0, ct: 0, cf: 0, cs: 0, co: 0, ma: 0, mr: 0, mp: 0, ms: 0, mi: 0, ...Object.fromEntries(CAMS_POS.map((c) => [`c${c}`, 0])) });
  const linha = (nome) => { if (!g.has(nome)) g.set(nome, novo(nome)); return g.get(nome); };
  lista.forEach(({ v, s }) => {
    const r = linha(v.garagem);
    r.vt += 1; if (s.cat === 'on') r.vf += 1; if (s.falha) r.vp += 1; if (s.cat === 'off') r.vo += 1; if (s.fa) r.vs += 1;
    r.ct += s.n; r.cf += s.on; r.cs += s.fa; r.co += s.off;
    Object.entries(s.cams).forEach(([c, k]) => { if (k !== 'on' && r[`c${c}`] !== undefined) r[`c${c}`] += 1; });
  });
  manutencao(lista, dias, linha);
  const linhas = [...g.values()];
  const total = novo('Total');
  linhas.forEach((r) => Object.keys(total).forEach((k) => { if (k !== 'g') total[k] += r[k]; }));
  return { dias, todos, lista, linhas, total };
}

// Manutenção (formulário + análise antes/depois do pipeline), contagem de VEÍCULOS por Garagem/Empresa normalizada.
function manutencao(lista, dias, linha) {
  // sem período escolhido: todas as visitas do formulário (inclusive as anteriores ao 1º dia do monitoramento)
  const de = F.de || '', ate = F.ate || '9999';
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
  cards(ultimo.todos);
  tabela();
  desenharGrafico();
  marcarSeg();
}

function cards(todos) {
  let on = 0, fa = 0, off = 0, veic = 0;
  todos.forEach(({ s }) => { on += s.on; fa += s.fa; off += s.off; if (s.falha) veic += 1; });
  const tot = on + fa + off;
  const pc = (n, t, cls) => (t ? `<span class="pill ${cls}">${fmtP((100 * n) / t)}</span>` : '');
  const card = (ic, cls, rot, val, extra, un, k) => `<div class="card kpi clic${S1.card === k ? ' ativo' : ''}" data-card="${k}" role="button" tabindex="0" aria-pressed="${S1.card === k}" title="${S1.card === k ? 'Clique para limpar' : 'Filtrar a tabela e o gráfico por este card'}"><div class="rot"><span class="ic ${cls}">${ic}</span><span class="rot-t">${rot}</span></div><div class="val-l"><span class="val">${fmtN(val)}</span>${extra}<span class="un">${un}</span></div></div>`;
  document.getElementById('v-cards').innerHTML = card(ICONE.ok, 'c-on', 'Câmeras funcionais', on, pc(on, tot, 'p-on'), 'câmeras', 'on') + card(ICONE.sd, 'c-fa', 'Câmeras com erro de SD card', fa, pc(fa, tot, 'p-fa'), 'câmeras', 'fa')
    + card(ICONE.off, 'c-off', 'Câmeras 100% offline', off, pc(off, tot, 'p-off'), 'câmeras', 'off') + card(ICONE.alerta, 'c-veic', 'Veículos com falha', veic, pc(veic, todos.length, 'p-veic'), 'veículos', 'veic');
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

const NOME_CARD = { on: 'com câmera funcional', fa: 'com erro de SD card', off: 'com câmera offline', veic: 'com falha' };
function descricao() {
  const { lista, dias } = ultimo;
  const per = dias.length ? `${dmy(D.dias[dias[0]])} a ${dmy(D.dias[dias[dias.length - 1]])}` : 'sem datas';
  return `${fmtN(lista.length)} veículos${S1.card ? ` ${NOME_CARD[S1.card]}` : ''} · ${S1.modo === 'veic' ? 'contagem de veículos' : 'contagem de câmeras'} · último registro de ${per}`;
}

function tabela() {
  const el = document.getElementById('v-tabela');
  document.getElementById('v-sub').textContent = descricao();
  const cols = colunas();
  if (!ultimo.linhas.length) { el.innerHTML = '<div class="vazio">Nenhum veículo para os filtros.</div>'; return; }
  const seta = (k) => (S1.ord.k === k ? `<span class="seta">${S1.ord.dir > 0 ? '↑' : '↓'}</span>` : '');
  const th = (c) => `<th class="n ord${c.man ? ' th-man' : ''}${c.cam ? ' th-cam' : ''}" data-o="${c.k}" data-tip="${esc(c.tip)}" aria-sort="${S1.ord.k === c.k ? (S1.ord.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.rot}${seta(c.k)}</th>`;
  const td = (r, c) => `<td class="n${r[c.k] ? '' : ' z'}${c.man ? ' td-man' : ''}">${fmtN(r[c.k])}</td>`;
  el.innerHTML = `<table class="gt"><thead><tr><th class="ord fx-g" data-o="g" aria-sort="${S1.ord.k === 'g' ? (S1.ord.dir > 0 ? 'ascending' : 'descending') : 'none'}">Garagem${seta('g')}</th>${cols.map(th).join('')}</tr></thead>
    <tbody>${ordenadas().map((r) => `<tr class="clic-g" data-g="${esc(r.g)}" tabindex="0" title="Ver veículos de ${esc(r.g)}"><td class="fx-g">${esc(r.g)}</td>${cols.map((c) => td(r, c)).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr class="total"><td class="fx-g">Total</td>${cols.map((c) => td(ultimo.total, c)).join('')}</tr></tfoot></table>`;
  el.querySelectorAll('th.ord').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.o; S1.ord = { k, dir: S1.ord.k === k ? -S1.ord.dir : (k === 'g' ? 1 : -1) }; tabela();
  }));
  const tip = document.getElementById('tip');
  el.querySelectorAll('th[data-tip]').forEach((h) => {
    h.addEventListener('mouseenter', () => { tip.className = 'tip'; tip.innerHTML = `<div class="t1">${h.childNodes[0].textContent}</div><div class="sub">${h.dataset.tip}</div>`; const r = h.getBoundingClientRect(); tip.style.display = 'block'; tip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8))}px`; tip.style.top = `${r.bottom + 6}px`; });
    h.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
  el.querySelectorAll('tr.clic-g').forEach((tr) => {
    const abrir = () => { tip.style.display = 'none'; abrirGaragem(tr.dataset.g, ultimo.lista.filter((x) => x.v.garagem === tr.dataset.g), ultimo.dias); };
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
  });
}

// Séries diárias (regra da matriz): por veículo = estado do dia; por câmera = máscara do dia de cada câmera
function series() {
  const { lista, dias } = ultimo;
  const cam = F.camera || null;
  const on = dias.map(() => 0), fa = dias.map(() => 0), off = dias.map(() => 0);
  lista.forEach(({ v }) => {
    dias.forEach((i, j) => {
      if (S1.modo === 'veic') {
        const e = estadoDia(v, i, cam);
        if (e === 'on') on[j] += 1; else if (e === 'fa') fa[j] += 1; else if (e === 'off') off[j] += 1;
      } else {
        for (const c in v.k) {
          if (cam && c !== cam) continue;
          const m = Number(v.k[c][i] || 0);
          if (!m) continue;
          if (m === 1) on[j] += 1; else if (m === 4) off[j] += 1; else fa[j] += 1;
        }
      }
    });
  });
  return [
    { nome: 'Funcional', cor: 'var(--l-on)', vals: on },
    { nome: '1+ câmera com problema', cor: 'var(--l-fa)', vals: fa, tip: 'Inclui erro de SD card e variação no dia' },
    { nome: '100% Offline', cor: 'var(--l-off)', vals: off },
  ];
}

function desenharGrafico() {
  if (!ultimo) return;
  const el = document.getElementById('v-graf');
  if (!el || !el.clientWidth) return;
  const ss = series();
  document.getElementById('v-gsub').textContent = `${S1.modo === 'veic' ? 'Veículos' : 'Câmeras'} por dia · mesma regra da matriz`;
  document.getElementById('v-gleg').innerHTML = ss.map((s) => `<span title="${s.tip || ''}"><i style="background:${s.cor}"></i>${s.nome}</span>`).join('');
  graficoLinhas(el, ultimo.dias.map((i) => D.dias[i]), ss, S1.modo === 'veic' ? 'veículos' : 'câmeras');
}

function exportar() {
  const cols = colunas();
  const emp = F.empresa === GRUPO_METROPOLE ? 'METROPOLE (todas)' : F.empresa || 'Todas';
  const filtros = [['Empresa/Garagem', emp], ['Câmera', F.camera ? camNome(F.camera) : 'Todas'], ['Prefixo', F.prefixo || 'Todos'],
    ['Período', ultimo.dias.length ? `${dmy(D.dias[ultimo.dias[0]])} a ${dmy(D.dias[ultimo.dias[ultimo.dias.length - 1]])}` : '—'],
    ['Card', S1.card ? `Veículos ${NOME_CARD[S1.card]}` : 'Nenhum'], ['Contagem', S1.modo === 'veic' ? 'Veículos' : 'Câmeras'], ['Manutenção', S1.manut ? 'Colunas incluídas' : 'Não incluída']];
  exportarTabela({
    titulo: 'Controle de CFTV — Situação por Garagem/Empresa', aba: 'Garagens', filtros,
    colunas: [{ rot: 'Garagem/Empresa', larg: 30 }, ...cols.map((c) => ({ rot: c.rot, larg: Math.max(10, Math.min(24, c.rot.length + 2)), nota: c.tip }))],
    linhas: ordenadas().map((r) => [r.g, ...cols.map((c) => r[c.k])]),
    total: ['Total', ...cols.map((c) => ultimo.total[c.k])],
    arquivo: 'cftv_garagens',
  });
}
