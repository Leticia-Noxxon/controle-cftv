// Detalhe da garagem (modal): lista de veículos com situação por câmera (ordenável); clique no veículo abre o painel
// de detalhe (linha do tempo e manutenção) ao lado, com setas para trocar o dia.
import { D, estadoDia, dispPeriodo, fmtN, fmtP, dmy, esc, ICONE, ROTULO_CURTO, CAMS_POS } from './dados.js';
import { F } from './main.js';
import { abrirPainel, fecharPainel } from './painel.js';

const CAT = { on: 'Funcional', fa: 'Erro de SD card', off: 'Offline' };
const G = { ord: { k: 'sit', dir: 1 }, sel: null };
const PESO = { off: 0, fa: 1, on: 2, nd: 3 };

export function fecharModal() {
  if (document.querySelector('#modal .lado:not(.oculto)')) fecharPainel();
  document.getElementById('modal')?.remove();
  document.removeEventListener('keydown', esc_);
}
function esc_(e) { if (e.key === 'Escape') fecharModal(); }

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

// ultimoDia: último dia do período com registro do veículo (para abrir o painel)
function ultimoDia(v, dias, cam) {
  for (let k = dias.length - 1; k >= 0; k -= 1) if (estadoDia(v, dias[k], cam) !== 'nd') return dias[k];
  return dias[dias.length - 1];
}

export function abrirGaragem(nome, lista, dias) {
  const cam = F.camera || null;
  G.sel = null;
  const linhas = lista.map(({ v, s }) => {
    const u = ultimoDia(v, dias, cam);
    return { v, s, disp: dispPeriodo(v, dias, cam), u, prob: s.fa + s.off };
  });
  const falha = linhas.filter((r) => r.s.falha).length;
  const m = abrirModal(`<div class="modal-cab"><div><h2>${esc(nome)}</h2><div class="sub">${fmtN(linhas.length)} veículos · ${fmtN(falha)} com 1+ câmera com falha · último registro de cada câmera no período</div></div><button class="fechar md-fechar" aria-label="Fechar">${ICONE.x}</button></div>
    <div class="modal-corpo" id="g-area"><div class="g-lista"><div class="tb-scroll" id="g-tab"></div></div><div id="g-painel" class="lado oculto"></div></div>`, 'modal-g');
  const host = { box: m.querySelector('#g-painel'), area: m.querySelector('#g-area'), navDia: true };
  const cols = [
    { k: 'p', rot: 'Prefixo', val: (r) => r.v.p },
    { k: 'sit', rot: 'Situação', val: (r) => PESO[r.s.cat] * 10 - r.prob },
    ...CAMS_POS.filter((c) => !cam || String(c) === cam).map((c) => ({ k: `c${c}`, rot: `Câm ${c}`, cam: c, val: (r) => (r.s.cams[c] ? PESO[r.s.cams[c]] : 9) })),
    { k: 'disp', rot: 'Disp.', val: (r) => (r.disp == null ? -1 : r.disp) },
    { k: 'u', rot: 'Último dia', val: (r) => r.u },
  ];
  const desenhar = () => {
    const c = cols.find((x) => x.k === G.ord.k) || cols[1];
    const ord = linhas.slice().sort((a, b) => (c.val(a) - c.val(b)) * G.ord.dir || a.v.p - b.v.p);
    const seta = (k) => (G.ord.k === k ? `<span class="seta">${G.ord.dir > 0 ? '↑' : '↓'}</span>` : '');
    const cel = (r, x) => {
      if (x.k === 'p') return `<td class="fx-g"><b>${r.v.p}</b></td>`;
      if (x.k === 'sit') return `<td><span class="badge b-${r.s.cat}">${ROTULO_CURTO[r.s.cat]}</span></td>`;
      if (x.cam) { const k = r.s.cams[x.cam]; return `<td class="n">${k ? `<i class="dot d-${k}" title="Câm ${x.cam}: ${CAT[k]}"></i>` : '<span class="muted">—</span>'}</td>`; }
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
}
