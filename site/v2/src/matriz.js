// Aba 2 — Matriz: filtros (Empresa, Câmera, Mês) na linha do título, filtro de status (chips = legenda), matriz
// painel de detalhe (clique na célula) e botão OS (Ordem de Serviço).
import { F, barraFiltros } from './main.js';
import { ICONE, D, veiculosFiltrados, faixaDias, estadoDia, manutDia, tempos, dispPeriodo, camNome, fmtN, fmtP, diaSemana, dmy, dur, esc, ROTULO, DEF_STATUS, posicionarTip } from './dados.js';
import { abrirPainel, fecharPainel } from './painel.js';
import { abrirOS } from './os.js';

const S = { ord: { k: 'garagem', dir: 1 }, sel: null, status: new Set() };
// Filtro de status (múltiplo): mantém os veículos com pelo menos um dia no mês com algum dos status marcados
const STATUS = [
  { k: 'on', rot: ROTULO.on, cor: 'var(--on)', tip: DEF_STATUS.on },
  { k: 'off', rot: ROTULO.off, cor: 'var(--off)', tip: DEF_STATUS.off },
  { k: 'sd', rot: ROTULO.sd, cor: 'var(--sd)', tip: DEF_STATUS.sd },
  { k: 'fa', rot: ROTULO.fa, cor: 'var(--fa)', tip: DEF_STATUS.fa },
  { k: 'nd', rot: ROTULO.nd, cor: 'var(--nd)', tip: DEF_STATUS.nd },
  { k: 'man', rot: 'Manutenção', man: true, tip: 'Dia com manutenção registrada (ponto azul)' },
];
// Rolagem virtual: só as linhas visíveis + BUFFER acima/abaixo são desenhadas; espaçadores mantêm a altura total.
const BUFFER = 12;
const V = { linhas: [], dias: [], cols: [], ini: -1, fim: -1, raf: 0 };
let memo = { key: '', linhas: [] };
let host = null;
const filtroM = () => ({ empresa: F.empresa, camera: F.camera, prefixo: '', mes: F.mes });

export function paginaMatriz(app) {
  app.innerHTML = `<div class="pagina pag-matriz">
    <section class="area" id="m-area"><div class="bloco-tabela card">
      <div class="m-bar"><div class="chips-st" id="m-status" role="group" aria-label="Filtrar por status no mês (legenda)"><span class="rot-st">Status no mês</span>${STATUS.map((x) => `<label class="chip-st" title="${esc(x.tip)} — clique para filtrar"><input type="checkbox" value="${x.k}" ${S.status.has(x.k) ? 'checked' : ''}/><span>${x.man ? '<i class="man"></i>' : `<i style="background:${x.cor}"></i>`}${x.rot}</span></label>`).join('')}
        <button class="link" id="m-status-limpar" ${S.status.size ? '' : 'hidden'}>Limpar</button></div><div class="contagem" id="m-cont"></div></div>
      <div class="tabela" id="m-tabela"></div></div><div id="m-painel" class="lado oculto"></div></section><div class="fundo-painel" id="m-fundo"></div></div>`;
  host = { box: app.querySelector('#m-painel'), area: app.querySelector('#m-area'), fundo: app.querySelector('#m-fundo') };
  barraFiltros(['empresa', 'camera', 'mes'], () => { S.sel = null; fecharPainel(); atualizar(); },
    `<button class="btn-pri" id="btn-os" title="Gerar Ordem de Serviço (.xlsx) para o técnico">${ICONE.os}<span>OS</span></button>`);
  document.getElementById('btn-os').onclick = () => abrirOS();
  app.querySelectorAll('#m-status input').forEach((i) => i.addEventListener('change', () => {
    if (i.checked) S.status.add(i.value); else S.status.delete(i.value);
    app.querySelector('#m-status-limpar').hidden = !S.status.size;
    S.sel = null; fecharPainel(); atualizar();
  }));
  app.querySelector('#m-status-limpar').onclick = () => { S.status.clear(); app.querySelectorAll('#m-status input').forEach((i) => { i.checked = false; }); app.querySelector('#m-status-limpar').hidden = true; fecharPainel(); atualizar(); };
  app.querySelector('#m-fundo').onclick = () => fecharPainel();
  window.onresize = () => desenharVisiveis(true);
  atualizar();
}

function linhasFiltradas() {
  const FM = filtroM();
  const dias = faixaDias(FM);
  const key = JSON.stringify([FM, S.ord, [...S.status]]);
  if (memo.key === key) return { linhas: memo.linhas, dias };
  const cam = F.camera || null;
  let vs = veiculosFiltrados(FM, false);
  if (S.status.size) {
    vs = vs.filter((v) => dias.some((i) => S.status.has(estadoDia(v, i, cam)) || (S.status.has('man') && manutDia(v, i, cam).length)));
  }
  const linhas = vs.map((v) => ({ v, disp: dispPeriodo(v, dias, cam) }));
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

// Colunas da grade: com um mês escolhido, sempre todos os dias do mês (mesmo tamanho de um mês completo).
// Dia com dados = índice em D.dias; dia sem dados (futuro ou sem extração) = data 'AAAA-MM-DD' → coluna vazia,
// neutra (sem cor, sem clique), que não entra em filtro, disponibilidade nem OS.
function colunasMes(dias) {
  if (!F.mes || !dias.length) return dias;
  const [a, m] = F.mes.split('-').map(Number);
  const n = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const idx = new Map(dias.map((i) => [D.dias[i], i]));
  const out = [];
  for (let d = 1; d <= n; d += 1) {
    const iso = `${F.mes}-${String(d).padStart(2, '0')}`;
    out.push(idx.has(iso) ? idx.get(iso) : iso);
  }
  return out;
}
const vazia = (c) => typeof c === 'string';
const TIP_VAZIO = 'Sem arquivo de dados para este dia (dia futuro ou sem extração)';

function tabela(linhas, dias) {
  const el = document.getElementById('m-tabela');
  const n = linhas.length;
  const colsD = colunasMes(dias);
  V.linhas = linhas; V.dias = dias; V.cols = colsD; V.ini = -1; V.fim = -1;
  document.getElementById('m-cont').textContent = `${fmtN(n)} ${n === 1 ? 'veículo' : 'veículos'}`;
  if (!n || !dias.length) { el.innerHTML = '<div class="vazio">Nenhum veículo para os filtros.</div>'; el.onscroll = null; return; }
  const cols = `var(--w1) var(--w2) var(--w3) repeat(${colsD.length}, minmax(var(--col-dia), 1fr))`;
  const seta = (k) => `<span class="seta">${S.ord.k === k ? (S.ord.dir > 0 ? '↑' : '↓') : ''}</span>`;
  const cab = `<div class="cel-h fx fx1 ord" data-o="garagem">Empresa${seta('garagem')}</div><div class="cel-h fx fx2 ord" data-o="prefixo">Prefixo${seta('prefixo')}</div><div class="cel-h fx fx3 ord" data-o="disp" title="Disponibilidade no mês: tempo funcional ÷ tempo monitorado">Disp.${seta('disp')}</div>`
    + colsD.map((c) => (vazia(c)
      ? `<div class="cel-h dia-h dia-vazio" title="${TIP_VAZIO}"><b>${c.slice(8, 10)}</b><span>${diaSemana(c)}</span></div>`
      : `<div class="cel-h dia-h"><b>${D.dias[c].slice(8, 10)}</b><span>${diaSemana(D.dias[c])}</span></div>`)).join('');
  el.innerHTML = `<div class="grade" style="grid-template-columns:${cols};min-width:calc(var(--w1) + var(--w2) + var(--w3) + ${colsD.length} * var(--col-dia))">${cab}<div class="esp" id="m-esp1"></div><div class="linhas-v" id="m-corpo"></div><div class="esp" id="m-esp2"></div></div>`;
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
      + V.cols.map((i) => {
        if (vazia(i)) return '<div class="cel dia-c"><div class="st-vazio" aria-hidden="true"></div></div>';
        const e = estadoDia(v, i, cam);
        const sel = S.sel && S.sel.p === v.p && S.sel.i === i ? ' sel' : '';
        return `<div class="cel dia-c"><div class="st ${e}${sel}" data-i="${i}">${manutDia(v, i, cam).length ? '<span class="man"></span>' : ''}</div></div>`;
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
    + l('Empresa', esc(v.garagem))
    + l(cam ? 'Câmera' : 'Câmeras', cam ? camNome(cam).replace('Câmera ', '') : (camsDia.join(', ') || '—'))
    + (!cam && prob.length ? l('Com problema', prob.join(', ')) : '')
    + l('Status', ROTULO[e])
    + l('Disponibilidade', tot ? fmtP((100 * ok) / tot) : '—')
    + l('Funcional', dur(ok)) + l('Offline', dur(off)) + (fa ? l('Erro de SD card', dur(fa)) : '')
    + l('Manutenção', manutDia(v, i, cam).length ? 'Sim' : 'Não')
    + (!cam && camsDia.length > 1 ? `<div class="sub" style="margin-top:4px">Tempos somados de ${camsDia.length} câmeras</div>` : '');
}
