// Modal da empresa: aba "Evolução diária" (gráfico profissional com Veículo | Câmera) e aba "Veículos" (lista
// ordenável; clique no veículo abre o detalhe com linha do tempo e manutenção, com setas para trocar o dia).
import { D, estadoDia, dispPeriodo, fmtN, fmtP, dmy, esc, ICONE, ROTULO, DEF_STATUS, CAMS_POS } from './dados.js';
import { F } from './main.js';
import { abrirPainel, fecharPainel } from './painel.js';
import { graficoLinhas } from './grafico.js';

// status da câmera pelo último registro: 'fa' = erro de SD (código 1–7)
const CAT_CAM = { on: ['d-on', 'Funcional'], fa: ['d-sd', 'Erro de SD'], off: ['d-off', 'Offline'] };
const G = { ord: { k: 'sit', dir: 1 }, sel: null, aba: 'grafico', modo: 'veic' };
const PESO = { off: 0, fa: 1, sd: 2, on: 3, nd: 4 };
// cores do gráfico (saturadas o bastante para distinguir; mesma ordem de gravidade)
// Cores das séries lidas do tema atual (claro/escuro): --c-on, --c-fa, --c-sd, --c-off
const corTema = (k) => getComputedStyle(document.documentElement).getPropertyValue(`--c-${k}`).trim();
export const COR_SERIE = { get on() { return corTema('on'); }, get fa() { return corTema('fa'); }, get sd() { return corTema('sd'); }, get off() { return corTema('off'); } };

export function fecharModal() {
  if (document.querySelector('#modal .lado:not(.oculto)')) fecharPainel();
  document.getElementById('modal')?.remove();
  document.getElementById('tip').style.display = 'none';
  document.removeEventListener('keydown', esc_);
  window.removeEventListener('resize', redesenhar);
}
function esc_(e) { if (e.key === 'Escape' && !document.getElementById('cal-pop')) fecharModal(); }
let redesenhar = () => {};

export function abrirModal(html, cls = '') {
  document.getElementById('modal')?.remove();
  const m = document.createElement('div');
  m.id = 'modal'; m.className = 'modal-fundo';
  m.innerHTML = `<div class="modal card ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(m);
  m.addEventListener('mousedown', (e) => { if (e.target === m) fecharModal(); });
  document.addEventListener('keydown', esc_);
  m.querySelector('.md-fechar')?.addEventListener('click', fecharModal);
  return m;
}

function ultimoDia(v, dias, cam) {
  for (let k = dias.length - 1; k >= 0; k -= 1) if (estadoDia(v, dias[k], cam) !== 'nd') return dias[k];
  return dias[dias.length - 1];
}

// Séries diárias pela regra da matriz. Veículo: estado do dia. Câmera: máscara do dia de cada câmera
// (1 = funcional; 4 = offline; 2/3 = erro de SD sem offline; demais = 1+ câm. com problema/conexão).
export function seriesDiarias(lista, dias, modo, cam) {
  const z = () => dias.map(() => 0);
  const c = { on: z(), fa: z(), sd: z(), off: z() };
  lista.forEach(({ v }) => dias.forEach((i, j) => {
    if (modo === 'veic') { const e = estadoDia(v, i, cam); if (c[e]) c[e][j] += 1; return; }
    for (const k in v.k) {
      if (cam && k !== String(cam)) continue;
      const m = Number(v.k[k][i] || 0);
      if (!m) continue;
      const e = m === 1 ? 'on' : m === 4 ? 'off' : !(m & 4) ? 'sd' : 'fa';
      c[e][j] += 1;
    }
  }));
  return ['on', 'fa', 'sd', 'off'].map((k) => ({ k, nome: ROTULO[k], cor: COR_SERIE[k], vals: c[k], tip: DEF_STATUS[k] }));
}

export function abrirGaragem(nome, lista, dias, aba = 'grafico', modo = 'veic') {
  const cam = F.camera || null;
  G.sel = null; G.aba = aba; G.modo = modo;
  const linhas = lista.map(({ v, s }) => ({ v, s, disp: dispPeriodo(v, dias, cam), u: ultimoDia(v, dias, cam), prob: s.fa + s.off }));
  const falha = linhas.filter((r) => r.s.falha).length;
  const per = dias.length ? `${dmy(D.dias[dias[0]])} a ${dmy(D.dias[dias[dias.length - 1]])}` : '';
  const m = abrirModal(`<div class="modal-cab"><div><h2>${esc(nome)}</h2><div class="sub">${fmtN(linhas.length)} veículos · ${fmtN(falha)} com falha no último registro · ${per}${cam ? ` · só a câmera ${cam}` : ''}</div></div>
      <div class="cab-acoes"><div class="seg" id="g-abas" role="tablist"><button data-a="grafico" role="tab">Evolução diária</button><button data-a="veiculos" role="tab">Veículos</button></div><button class="fechar md-fechar" aria-label="Fechar">${ICONE.x}</button></div></div>
    <div class="g-sec" id="g-sec-grafico"><div class="g-graf-bar"><div class="leg-graf" id="g-leg"></div><div class="seg" id="g-modo" role="group" aria-label="Contagem por"><button data-m="veic">Veículo</button><button data-m="cam">Câmera</button></div></div>
      <div class="graf graf-g" id="g-graf"></div></div>
    <div class="modal-corpo g-sec" id="g-area"><div class="g-lista"><div class="tb-scroll" id="g-tab"></div></div><div id="g-painel" class="lado oculto"></div></div>`, 'modal-g');
  const host = { box: m.querySelector('#g-painel'), area: m.querySelector('#g-area'), navDia: true };
  const grafico = () => {
    const ss = seriesDiarias(linhas, dias, G.modo, cam);
    m.querySelector('#g-leg').innerHTML = ss.map((s) => `<span title="${s.tip}"><i style="background:${s.cor}"></i>${s.nome}</span>`).join('');
    m.querySelectorAll('#g-modo button').forEach((b) => b.classList.toggle('ativo', b.dataset.m === G.modo));
    graficoLinhas(m.querySelector('#g-graf'), dias.map((i) => D.dias[i]), ss, G.modo === 'veic' ? 'veículos por dia' : 'câmeras por dia', G.modo === 'veic' ? 'Veículos' : 'Câmeras');
  };
  const mostrarAba = () => {
    m.querySelectorAll('#g-abas button').forEach((b) => { b.classList.toggle('ativo', b.dataset.a === G.aba); b.setAttribute('aria-selected', b.dataset.a === G.aba); });
    m.querySelector('#g-sec-grafico').classList.toggle('oculto', G.aba !== 'grafico');
    m.querySelector('#g-area').classList.toggle('oculto', G.aba !== 'veiculos');
    if (G.aba === 'grafico') requestAnimationFrame(grafico);
  };
  m.querySelectorAll('#g-abas button').forEach((b) => b.addEventListener('click', () => { G.aba = b.dataset.a; mostrarAba(); }));
  m.querySelectorAll('#g-modo button').forEach((b) => b.addEventListener('click', () => { G.modo = b.dataset.m; grafico(); }));
  redesenhar = () => { if (G.aba === 'grafico' && document.getElementById('g-graf')) grafico(); };
  window.addEventListener('resize', redesenhar);
  const cols = [
    { k: 'p', rot: 'Prefixo', val: (r) => r.v.p },
    { k: 'sit', rot: 'Situação', val: (r) => PESO[r.s.cat] * 10 - r.prob },
    ...CAMS_POS.filter((c) => !cam || String(c) === cam).map((c) => ({ k: `c${c}`, rot: `Câm ${c}`, cam: c, val: (r) => (r.s.cams[c] ? PESO[r.s.cams[c]] : 9) })),
    { k: 'disp', rot: 'Disp.', val: (r) => (r.disp == null ? -1 : r.disp) },
    { k: 'u', rot: 'Último dia', val: (r) => r.u },
  ];
  const SIT = { on: 'Funcional', fa: '1+ câm. c/ falha', off: '100% offline', sd: 'Erro SD', nd: 'Sem conexão' };
  const desenhar = () => {
    const c = cols.find((x) => x.k === G.ord.k) || cols[1];
    const ord = linhas.slice().sort((a, b) => (c.val(a) - c.val(b)) * G.ord.dir || a.v.p - b.v.p);
    const seta = (k) => (G.ord.k === k ? `<span class="seta">${G.ord.dir > 0 ? '↑' : '↓'}</span>` : '');
    const cel = (r, x) => {
      if (x.k === 'p') return `<td class="fx-g"><b>${r.v.p}</b></td>`;
      if (x.k === 'sit') return `<td><span class="badge b-${r.s.cat}">${SIT[r.s.cat]}</span></td>`;
      if (x.cam) { const k = r.s.cams[x.cam]; return `<td class="n">${k ? `<i class="dot ${CAT_CAM[k][0]}" title="Câm ${x.cam}: ${CAT_CAM[k][1]}"></i>` : '<span class="muted">—</span>'}</td>`; }
      if (x.k === 'disp') return `<td class="n">${fmtP(r.disp)}</td>`;
      return `<td class="n">${dmy(D.dias[r.u]).slice(0, 5)}</td>`;
    };
    m.querySelector('#g-tab').innerHTML = `<table class="gt gt-v"><thead><tr>${cols.map((x) => `<th class="ord${x.k === 'p' ? ' fx-g' : x.k === 'sit' ? '' : ' n'}" data-o="${x.k}">${x.rot}${seta(x.k)}</th>`).join('')}</tr></thead>
      <tbody>${ord.map((r) => `<tr class="clic-g${G.sel === r.v.p ? ' sel' : ''}" data-p="${r.v.p}" tabindex="0">${cols.map((x) => cel(r, x)).join('')}</tr>`).join('')}</tbody></table>`;
    m.querySelectorAll('#g-tab th.ord').forEach((h) => h.addEventListener('click', () => { const k = h.dataset.o; G.ord = { k, dir: G.ord.k === k ? -G.ord.dir : 1 }; desenhar(); }));
    m.querySelectorAll('#g-tab tr.clic-g').forEach((tr) => {
      const abrir = () => {
        const r = linhas.find((x) => x.v.p === Number(tr.dataset.p));
        G.sel = r.v.p;
        m.querySelectorAll('#g-tab tr.sel').forEach((x) => x.classList.remove('sel')); tr.classList.add('sel');
        abrirPainel(host, r.v.p, r.u, cam, () => { G.sel = null; m.querySelectorAll('#g-tab tr.sel').forEach((x) => x.classList.remove('sel')); });
      };
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  };
  desenhar();
  mostrarAba();
}
