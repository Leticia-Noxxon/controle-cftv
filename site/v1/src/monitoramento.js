// Página 1 — Monitoramento: filtros, 4 cards, tabela (matriz por data, rolagem virtual), legenda e painel de detalhe.
import { F, barraFiltros } from './main.js';
import { D, veiculosFiltrados, faixaDias, estadoDia, tempos, dispPeriodo, ultimoCodigo, catCodigo, camNome, fmtN, fmtP, diaSemana, dmy, dur, esc, SEM_GARAGEM } from './dados.js';
import { abrirPainel, fecharPainel, painelAberto } from './painel.js';

const S = { ord: { k: 'garagem', dir: 1 }, sel: null, card: '' };
// Rolagem virtual: só as linhas visíveis + BUFFER acima/abaixo são desenhadas; espaçadores mantêm a altura total.
const BUFFER = 12;
const V = { linhas: [], dias: [], ini: -1, fim: -1, raf: 0 };
let memo = { key: '', linhas: [] };
const NOME = { on: 'Todo online', off: 'Todo offline', fa: 'Erro SD ou variação', nd: 'Sem dados' };

export function paginaMonitoramento(app) {
  app.innerHTML = `<section id="p1-filtros"></section><section class="cards" id="p1-cards"></section>
    <section class="area" id="p1-area"><div class="bloco-tabela"><div class="tabela" id="p1-tabela"></div>
      <div class="rodape-tab"><div class="legenda"><span><i style="background:var(--on)"></i>Todo online</span><span><i style="background:var(--off)"></i>Todo offline</span><span><i style="background:var(--fa)"></i>Erro SD ou variação</span><span><i style="background:var(--nd)"></i>Sem dados</span><span><i class="man"></i>Manutenção</span></div>
      <div class="contagem" id="p1-cont"></div></div></div><div id="p1-painel" class="oculto"></div></section><div class="fundo-painel" id="p1-fundo"></div>`;
  barraFiltros(app.querySelector('#p1-filtros'), { prefixo: true }, () => { S.sel = null; fecharPainel(); atualizar(); });
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

// Categoria de cada veículo pelo último registro de cada câmera (filtrada) no período — mesma base dos cards.
// on = tem ao menos uma câmera funcional; fa = tem câmera com erro de SD; off = tem câmera offline; veic = fa ou off.
function categorias(v, dias) {
  const c = { on: false, fa: false, off: false };
  v.c.forEach((cam) => {
    if (F.camera && String(cam) !== F.camera) return;
    const x = ultimoCodigo(v, cam, dias);
    if (x) c[catCodigo(x)] = true;
  });
  c.veic = c.fa || c.off;
  return c;
}

function atualizar() {
  const { linhas, dias } = linhasFiltradas();
  cards(linhas.map((r) => r.v), dias);
  // Clique no card filtra a tabela aos veículos daquele card (combina com os demais filtros; os números dos cards não mudam)
  tabela(S.card ? linhas.filter((r) => categorias(r.v, dias)[S.card]) : linhas, dias);
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
  const card = (cor, rot, val, extra, un, k) => `<div class="card kpi clic${S.card === k ? ' ativo' : ''}" data-card="${k}" role="button" tabindex="0" aria-pressed="${S.card === k}" title="${S.card === k ? 'Clique para limpar' : 'Filtrar a tabela por este card'}"><div class="rot"><i style="background:${cor}"></i>${rot}</div><div><div class="val">${fmtN(val)}${extra}</div><div class="un">${un}</div></div></div>`;
  document.getElementById('p1-cards').innerHTML = card('var(--on)', 'Câmeras funcionais', on, pc(on, tot), 'câmeras', 'on') + card('var(--fa)', 'Câmeras com erro de SD card', fa, pc(fa, tot), 'câmeras', 'fa')
    + card('var(--off)', 'Câmeras 100% offline', off, pc(off, tot), 'câmeras', 'off') + card('var(--azul)', 'Veículos com falha', veic, pc(veic, vs.length), 'veículos', 'veic');
  document.querySelectorAll('#p1-cards .clic').forEach((c) => {
    const alternar = () => { S.card = S.card === c.dataset.card ? '' : c.dataset.card; S.sel = null; fecharPainel(); atualizar(); };
    c.addEventListener('click', alternar);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
  });
}

function tabela(linhas, dias) {
  const el = document.getElementById('p1-tabela');
  const n = linhas.length;
  V.linhas = linhas; V.dias = dias; V.ini = -1; V.fim = -1;
  document.getElementById('p1-cont').textContent = `${fmtN(n)} ${n === 1 ? 'veículo' : 'veículos'}`;
  if (!n) { el.innerHTML = '<div class="vazio">Nenhum veículo para os filtros.</div>'; el.onscroll = null; ajustarAltura(); return; }
  const cols = `190px 85px 105px repeat(${dias.length}, minmax(var(--col-dia), 1fr))`;
  const seta = (k) => `<span class="seta">${S.ord.k === k ? (S.ord.dir > 0 ? '↑' : '↓') : ''}</span>`;
  const cab = `<div class="cel-h fx fx1 ord" data-o="garagem">Garagem${seta('garagem')}</div><div class="cel-h fx fx2 ord" data-o="prefixo">Prefixo${seta('prefixo')}</div><div class="cel-h fx fx3 ord" data-o="disp">Disponibilidade${seta('disp')}</div>`
    + dias.map((i) => `<div class="cel-h dia-h"><b>${D.dias[i].slice(8, 10)}</b><span>${diaSemana(D.dias[i])}</span></div>`).join('');
  el.innerHTML = `<div class="grade" style="grid-template-columns:${cols};min-width:calc(380px + ${dias.length} * var(--col-dia))">${cab}<div class="esp" id="p1-esp1"></div><div class="linhas-v" id="p1-corpo"></div><div class="esp" id="p1-esp2"></div></div>`;
  el.scrollTop = 0;
  el.querySelectorAll('.ord').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.o; S.ord = { k, dir: S.ord.k === k ? -S.ord.dir : 1 }; atualizar();
  }));
  el.onscroll = () => { if (!V.raf) V.raf = requestAnimationFrame(() => { V.raf = 0; desenharVisiveis(); }); };
  eventos(el);
  ajustarAltura();
  desenharVisiveis();
}

function alturaLinha() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lin')) || 30;
}

function desenharVisiveis(forcar = false) {
  const el = document.getElementById('p1-tabela');
  const corpo = document.getElementById('p1-corpo');
  if (!el || !corpo) return;
  const h = alturaLinha(), n = V.linhas.length;
  const topo = Math.max(0, el.scrollTop - 42);
  const ini = Math.max(0, Math.floor(topo / h) - BUFFER);
  const fim = Math.min(n, Math.ceil((topo + el.clientHeight) / h) + BUFFER);
  if (!forcar && ini === V.ini && fim === V.fim) return;
  V.ini = ini; V.fim = fim;
  const cam = F.camera || null;
  document.getElementById('p1-esp1').style.height = `${ini * h}px`;
  document.getElementById('p1-esp2').style.height = `${(n - fim) * h}px`;
  corpo.innerHTML = V.linhas.slice(ini, fim).map((r) => {
    const v = r.v;
    return `<div class="linha" data-p="${v.p}"><div class="cel fx fx1 ${v.garagem === SEM_GARAGEM ? 'muted' : ''}" title="${esc(v.garagem)}">${esc(v.garagem)}</div><div class="cel fx fx2">${v.p}</div><div class="cel fx fx3 disp">${fmtP(r.disp)}</div>`
      + V.dias.map((i) => {
        const e = estadoDia(v, i, cam);
        const sel = S.sel && S.sel.p === v.p && S.sel.i === i ? ' sel' : '';
        return `<div class="cel dia-c"><div class="st ${e}${sel}" data-i="${i}">${v.mv[i] ? '<span class="man"></span>' : ''}</div></div>`;
      }).join('') + '</div>';
  }).join('');
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

function ajustarAltura() {
  const el = document.getElementById('p1-tabela');
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  el.style.maxHeight = `${Math.max(260, window.innerHeight - top - 64)}px`;
  desenharVisiveis();
}
export { painelAberto };
