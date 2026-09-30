// Aba 2 — Matriz: filtros (Empresa/Garagem, Câmera, Mês), matriz colorida por dia com rolagem virtual, legenda,
// painel de detalhe (clique na célula) e botão OS (Ordem de Serviço).
import { F, barraFiltros } from './main.js';
import { ICONE, D, veiculosFiltrados, faixaDias, estadoDia, tempos, dispPeriodo, camNome, fmtN, fmtP, diaSemana, dmy, dur, esc, ROTULO, posicionarTip } from './dados.js';
import { abrirPainel, fecharPainel } from './painel.js';
import { abrirOS } from './os.js';

const S = { ord: { k: 'garagem', dir: 1 }, sel: null };
// Rolagem virtual: só as linhas visíveis + BUFFER acima/abaixo são desenhadas; espaçadores mantêm a altura total.
const BUFFER = 12;
const V = { linhas: [], dias: [], ini: -1, fim: -1, raf: 0 };
let memo = { key: '', linhas: [] };
let host = null;
const filtroM = () => ({ empresa: F.empresa, camera: F.camera, prefixo: '', mes: F.mes });

export function paginaMatriz(app) {
  app.innerHTML = `<div class="pagina pag-matriz"><section id="m-filtros"></section>
    <section class="area" id="m-area"><div class="bloco-tabela card"><div class="tabela" id="m-tabela"></div>
      <div class="rodape-tab"><div class="legenda"><span><i style="background:var(--on)"></i>${ROTULO.on}</span><span><i style="background:var(--off)"></i>${ROTULO.off}</span><span><i style="background:var(--fa)"></i>${ROTULO.fa}</span><span><i style="background:var(--nd)"></i>${ROTULO.nd}</span><span><i class="man"></i>Manutenção</span></div>
      <div class="contagem" id="m-cont"></div></div></div><div id="m-painel" class="lado oculto"></div></section><div class="fundo-painel" id="m-fundo"></div></div>`;
  host = { box: app.querySelector('#m-painel'), area: app.querySelector('#m-area'), fundo: app.querySelector('#m-fundo') };
  barraFiltros(app.querySelector('#m-filtros'), ['empresa', 'camera', 'mes'], () => { S.sel = null; fecharPainel(); atualizar(); },
    `<button class="btn-pri" id="btn-os" title="Gerar Ordem de Serviço (.xlsx) para o técnico">${ICONE.os}<span>OS</span></button>`);
  app.querySelector('#btn-os').onclick = () => abrirOS();
  app.querySelector('#m-fundo').onclick = () => fecharPainel();
  window.onresize = () => desenharVisiveis(true);
  atualizar();
}

function linhasFiltradas() {
  const FM = filtroM();
  const dias = faixaDias(FM);
  const key = JSON.stringify([FM, S.ord]);
  if (memo.key === key) return { linhas: memo.linhas, dias };
  const cam = F.camera || null;
  const linhas = veiculosFiltrados(FM, false).map((v) => ({ v, disp: dispPeriodo(v, dias, cam) }));
  const val = { garagem: (r) => r.v.garagem, prefixo: (r) => r.v.p, disp: (r) => (r.disp == null ? 1e9 * S.ord.dir : r.disp) };
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
  tabela(linhas, dias);
}

function tabela(linhas, dias) {
  const el = document.getElementById('m-tabela');
  const n = linhas.length;
  V.linhas = linhas; V.dias = dias; V.ini = -1; V.fim = -1;
  document.getElementById('m-cont').textContent = `${fmtN(n)} ${n === 1 ? 'veículo' : 'veículos'}`;
  if (!n || !dias.length) { el.innerHTML = '<div class="vazio">Nenhum veículo para os filtros.</div>'; el.onscroll = null; return; }
  const cols = `var(--w1) var(--w2) var(--w3) repeat(${dias.length}, minmax(var(--col-dia), 1fr))`;
  const seta = (k) => `<span class="seta">${S.ord.k === k ? (S.ord.dir > 0 ? '↑' : '↓') : ''}</span>`;
  const cab = `<div class="cel-h fx fx1 ord" data-o="garagem">Garagem${seta('garagem')}</div><div class="cel-h fx fx2 ord" data-o="prefixo">Prefixo${seta('prefixo')}</div><div class="cel-h fx fx3 ord" data-o="disp" title="Disponibilidade no mês: tempo funcional ÷ tempo monitorado">Disp.${seta('disp')}</div>`
    + dias.map((i) => `<div class="cel-h dia-h"><b>${D.dias[i].slice(8, 10)}</b><span>${diaSemana(D.dias[i])}</span></div>`).join('');
  el.innerHTML = `<div class="grade" style="grid-template-columns:${cols};min-width:calc(var(--w1) + var(--w2) + var(--w3) + ${dias.length} * var(--col-dia))">${cab}<div class="esp" id="m-esp1"></div><div class="linhas-v" id="m-corpo"></div><div class="esp" id="m-esp2"></div></div>`;
  el.scrollTop = 0;
  el.querySelectorAll('.ord').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.o; S.ord = { k, dir: S.ord.k === k ? -S.ord.dir : 1 }; atualizar();
  }));
  el.onscroll = () => { if (!V.raf) V.raf = requestAnimationFrame(() => { V.raf = 0; desenharVisiveis(); }); };
  eventos(el);
  desenharVisiveis(true);
}

const alturaLinha = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lin')) || 30;

function desenharVisiveis(forcar = false) {
  const el = document.getElementById('m-tabela');
  const corpo = document.getElementById('m-corpo');
  if (!el || !corpo) return;
  const h = alturaLinha(), n = V.linhas.length;
  const topo = Math.max(0, el.scrollTop - 44);
  const ini = Math.max(0, Math.floor(topo / h) - BUFFER);
  const fim = Math.min(n, Math.ceil((topo + el.clientHeight) / h) + BUFFER);
  if (!forcar && ini === V.ini && fim === V.fim) return;
  V.ini = ini; V.fim = fim;
  const cam = F.camera || null;
  document.getElementById('m-esp1').style.height = `${ini * h}px`;
  document.getElementById('m-esp2').style.height = `${(n - fim) * h}px`;
  corpo.innerHTML = V.linhas.slice(ini, fim).map((r) => {
    const v = r.v;
    return `<div class="linha" data-p="${v.p}"><div class="cel fx fx1" title="${esc(v.garagem)}">${esc(v.garagem)}</div><div class="cel fx fx2">${v.p}</div><div class="cel fx fx3 disp">${fmtP(r.disp)}</div>`
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
    posicionarTip(tip, ev);
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
    abrirPainel(host, p, i, F.camera || null, () => { S.sel = null; el.querySelectorAll('.st.sel').forEach((x) => x.classList.remove('sel')); requestAnimationFrame(() => desenharVisiveis(true)); });
    requestAnimationFrame(() => desenharVisiveis(true));
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
    + l('Garagem', esc(v.garagem))
    + l(cam ? 'Câmera' : 'Câmeras', cam ? camNome(cam).replace('Câmera ', '') : (camsDia.join(', ') || '—'))
    + (!cam && prob.length ? l('Com problema', prob.join(', ')) : '')
    + l('Status', ROTULO[e])
    + l('Disponibilidade', tot ? fmtP((100 * ok) / tot) : '—')
    + l('Funcional', dur(ok)) + l('Offline', dur(off)) + (fa ? l('Erro de SD card', dur(fa)) : '')
    + l('Manutenção', v.mv[i] ? 'Sim' : 'Não')
    + (!cam && camsDia.length > 1 ? `<div class="sub" style="margin-top:4px">Tempos somados de ${camsDia.length} câmeras</div>` : '');
}
