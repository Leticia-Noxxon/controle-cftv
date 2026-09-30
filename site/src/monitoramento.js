// Página 1 — Monitoramento: filtros, 4 cards, tabela (matriz por data), legenda, paginação e painel de detalhe.
import { F, barraFiltros } from './main.js';
import { D, veiculosFiltrados, faixaDias, estadoDia, tempos, dispPeriodo, ultimoCodigo, catCodigo, camNome, fmtN, fmtP, diaSemana, dmy, dur, esc, SEM_GARAGEM } from './dados.js';
import { abrirPainel, fecharPainel, painelAberto } from './painel.js';

const S = { pag: 1, porPag: 20, ord: { k: 'garagem', dir: 1 }, sel: null };
let memo = { key: '', linhas: [] };
const NOME = { on: 'Online', off: 'Offline', fa: 'Falha', nd: 'Sem dados' };

export function paginaMonitoramento(app) {
  app.innerHTML = `<section id="p1-filtros"></section><section class="cards" id="p1-cards"></section>
    <section class="area" id="p1-area"><div class="bloco-tabela"><div class="tabela" id="p1-tabela"></div>
      <div class="rodape-tab"><div class="legenda"><span><i style="background:var(--on)"></i>Online</span><span><i style="background:var(--off)"></i>Offline</span><span><i style="background:var(--fa)"></i>Falha</span><span><i style="background:var(--nd)"></i>Sem dados</span><span><i class="man"></i>Manutenção</span></div>
      <div class="paginacao" id="p1-pag"></div></div></div><div id="p1-painel" class="oculto"></div></section><div class="fundo-painel" id="p1-fundo"></div>`;
  barraFiltros(app.querySelector('#p1-filtros'), { prefixo: true }, () => { S.pag = 1; S.sel = null; fecharPainel(); atualizar(); });
  app.querySelector('#p1-fundo').onclick = () => fecharPainel();
  window.onresize = ajustarAltura;
  atualizar();
}

function linhasFiltradas() {
  const dias = faixaDias(F);
  const key = JSON.stringify([F, S.ord]);
  if (memo.key === key) return { linhas: memo.linhas, dias };
  const cam = F.camera || null;
  const linhas = veiculosFiltrados(F).map((v) => ({ v, disp: dispPeriodo(v, dias, cam) }));
  const semG = (r) => (r.v.garagem === SEM_GARAGEM ? '\uffff' : r.v.garagem);
  const val = { garagem: semG, prefixo: (r) => r.v.p, disp: (r) => (r.disp == null ? 1e9 * S.ord.dir : r.disp) };
  linhas.sort((a, b) => {
    const x = val[S.ord.k](a), y = val[S.ord.k](b);
    const c = typeof x === 'number' ? x - y : x.localeCompare(y, 'pt-BR');
    return c ? c * S.ord.dir : a.v.p - b.v.p;
  });
  memo = { key, linhas };
  return { linhas, dias };
}

function atualizar() {
  const { linhas, dias } = linhasFiltradas();
  cards(linhas.map((r) => r.v), dias);
  tabela(linhas, dias);
}

function cards(vs, dias) {
  let on = 0, fa = 0, off = 0, veic = 0;
  vs.forEach((v) => {
    let falha = false;
    v.c.forEach((c) => {
      if (F.camera && String(c) !== F.camera) return;
      const x = ultimoCodigo(v, c, dias);
      if (!x) return;
      const k = catCodigo(x);
      if (k === 'on') on += 1; else { falha = true; if (k === 'off') off += 1; else fa += 1; }
    });
    if (falha) veic += 1;
  });
  const tot = on + fa + off;
  const pc = (n, t) => (t ? `<small>${fmtP((100 * n) / t)}</small>` : '');
  const card = (cor, rot, val, extra) => `<div class="card kpi"><div class="rot"><i style="background:${cor}"></i>${rot}</div><div class="val">${fmtN(val)}${extra}</div></div>`;
  document.getElementById('p1-cards').innerHTML = card('var(--on)', 'Funcionais', on, pc(on, tot)) + card('var(--fa)', 'Erro de SD card', fa, pc(fa, tot))
    + card('var(--off)', '100% offline', off, pc(off, tot)) + card('var(--azul)', 'Veículos com falha', veic, pc(veic, vs.length));
}

function tabela(linhas, dias) {
  const el = document.getElementById('p1-tabela');
  const n = linhas.length;
  const np = Math.max(1, Math.ceil(n / S.porPag));
  S.pag = Math.min(S.pag, np);
  const vis = linhas.slice((S.pag - 1) * S.porPag, S.pag * S.porPag);
  const cam = F.camera || null;
  const cols = `190px 85px 105px repeat(${dias.length}, minmax(var(--col-dia), 1fr))`;
  const seta = (k) => `<span class="seta">${S.ord.k === k ? (S.ord.dir > 0 ? '↑' : '↓') : ''}</span>`;
  const cab = `<div class="cel-h fx fx1 ord" data-o="garagem">Garagem${seta('garagem')}</div><div class="cel-h fx fx2 ord" data-o="prefixo">Prefixo${seta('prefixo')}</div><div class="cel-h fx fx3 ord" data-o="disp">Disponibilidade${seta('disp')}</div>`
    + dias.map((i) => `<div class="cel-h dia-h"><b>${D.dias[i].slice(8, 10)}</b><span>${diaSemana(D.dias[i])}</span></div>`).join('');
  const corpo = vis.map((r) => {
    const v = r.v;
    return `<div class="linha" data-p="${v.p}"><div class="cel fx fx1 ${v.garagem === SEM_GARAGEM ? 'muted' : ''}" title="${esc(v.garagem)}">${esc(v.garagem)}</div><div class="cel fx fx2">${v.p}</div><div class="cel fx fx3 disp">${fmtP(r.disp)}</div>`
      + dias.map((i) => {
        const e = estadoDia(v, i, cam);
        const sel = S.sel && S.sel.p === v.p && S.sel.i === i ? ' sel' : '';
        return `<div class="cel dia-c"><div class="st ${e}${sel}" data-i="${i}">${v.mv[i] ? '<span class="man"></span>' : ''}</div></div>`;
      }).join('') + '</div>';
  }).join('');
  el.innerHTML = n ? `<div class="grade" style="grid-template-columns:${cols};min-width:calc(380px + ${dias.length} * var(--col-dia))">${cab}${corpo}</div>` : '<div class="vazio">Nenhum veículo para os filtros.</div>';
  el.querySelectorAll('.ord').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.o; S.ord = { k, dir: S.ord.k === k ? -S.ord.dir : (k === 'disp' ? 1 : 1) }; S.pag = 1; atualizar();
  }));
  eventos(el);
  paginacao(n, np);
  ajustarAltura();
}

function eventos(el) {
  const tip = document.getElementById('tip');
  el.onmousemove = (ev) => {
    const man = ev.target.closest('.man');
    const st = ev.target.closest('.st');
    if (!st) { tip.style.display = 'none'; return; }
    const v = D.porPrefixo.get(Number(st.closest('.linha').dataset.p));
    const i = Number(st.dataset.i);
    if (man) { tip.className = 'tip curto'; tip.innerHTML = 'Manutenção registrada'; } else { tip.className = 'tip'; tip.innerHTML = conteudoTip(v, i); }
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(ev.clientX + 12, innerWidth - w - 8)}px`;
    tip.style.top = `${ev.clientY + 14 + h > innerHeight ? ev.clientY - h - 10 : ev.clientY + 14}px`;
  };
  el.onmouseleave = () => { tip.style.display = 'none'; };
  el.onclick = (ev) => {
    const st = ev.target.closest('.st');
    if (!st) return;
    tip.style.display = 'none';
    const p = Number(st.closest('.linha').dataset.p), i = Number(st.dataset.i);
    el.querySelectorAll('.st.sel').forEach((x) => x.classList.remove('sel'));
    st.classList.add('sel');
    S.sel = { p, i };
    abrirPainel(p, i, F.camera || null, () => { S.sel = null; el.querySelectorAll('.st.sel').forEach((x) => x.classList.remove('sel')); ajustarAltura(); });
    ajustarAltura();
  };
}

function conteudoTip(v, i) {
  const cam = F.camera || null;
  const [ok, fa, off] = tempos(v, i, cam);
  const tot = ok + fa + off;
  const camsDia = Object.keys(v.k).filter((c) => (!cam || c === cam) && Number(v.k[c][i]));
  const prob = camsDia.filter((c) => Number(v.k[c][i]) & 6);
  const e = estadoDia(v, i, cam);
  const l = (a, b) => `<div class="l"><span>${a}</span><b>${b}</b></div>`;
  return `<div class="t1">${diaSemana(D.dias[i])}, ${dmy(D.dias[i])} · ${v.p}</div>`
    + l(cam ? 'Câmera' : 'Câmeras', cam ? camNome(cam).replace('Câmera ', '') : (camsDia.join(', ') || '—'))
    + (!cam && prob.length ? l('Com problema', prob.join(', ')) : '')
    + l('Status', NOME[e])
    + l('Disponibilidade', tot ? fmtP((100 * ok) / tot) : '—')
    + l('Online', dur(ok)) + l('Offline', dur(off)) + (fa ? l('Falha (SD)', dur(fa)) : '')
    + l('Manutenção', v.mv[i] ? 'Sim' : 'Não')
    + (!cam && camsDia.length > 1 ? `<div class="sub" style="margin-top:4px">Tempos somados de ${camsDia.length} câmeras</div>` : '');
}

function paginas(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, k) => k + 1);
  const s = new Set([1, total, atual, atual - 1, atual + 1]);
  if (atual <= 3) [2, 3, 4].forEach((x) => s.add(x));
  if (atual >= total - 2) [total - 1, total - 2, total - 3].forEach((x) => s.add(x));
  const arr = [...s].filter((x) => x >= 1 && x <= total).sort((a, b) => a - b);
  const out = [];
  arr.forEach((x, k) => { if (k && x - arr[k - 1] > 1) out.push('…'); out.push(x); });
  return out;
}

function paginacao(n, np) {
  const el = document.getElementById('p1-pag');
  const a = n ? (S.pag - 1) * S.porPag + 1 : 0, b = Math.min(n, S.pag * S.porPag);
  el.innerHTML = `<span>Mostrando ${fmtN(a)}–${fmtN(b)} de ${fmtN(n)}</span>
    <button class="pg" data-g="${S.pag - 1}" ${S.pag > 1 ? '' : 'disabled'} aria-label="Página anterior">‹</button>
    ${paginas(S.pag, np).map((x) => (x === '…' ? '<span class="muted">…</span>' : `<button class="pg ${x === S.pag ? 'atual' : ''}" data-g="${x}">${x}</button>`)).join('')}
    <button class="pg" data-g="${S.pag + 1}" ${S.pag < np ? '' : 'disabled'} aria-label="Próxima página">›</button>
    <select id="p1-por" aria-label="Linhas por página">${[20, 50, 100].map((x) => `<option value="${x}" ${x === S.porPag ? 'selected' : ''}>${x} / página</option>`).join('')}</select>`;
  el.querySelectorAll('[data-g]').forEach((bt) => bt.addEventListener('click', () => { S.pag = Number(bt.dataset.g); atualizar(); }));
  el.querySelector('#p1-por').onchange = (e) => { S.porPag = Number(e.target.value); S.pag = 1; atualizar(); };
}

function ajustarAltura() {
  const el = document.getElementById('p1-tabela');
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  el.style.maxHeight = `${Math.max(260, window.innerHeight - top - 64)}px`;
}
export { painelAberto };
