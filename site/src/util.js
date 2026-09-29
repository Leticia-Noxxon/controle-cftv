// Utilidades: formatação, rótulos de câmera/estado e tabela ordenável reutilizável.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const POS = { 21: 'Frontal', 22: 'Frente', 23: 'Corredor 1', 24: 'Corredor 2', 25: 'Corredor 3', 26: 'Corredor 4' };
export const CAMS = [21, 22, 23, 24, 25, 26];
export const BIT = { 21: 1, 22: 2, 23: 4, 24: 8, 25: 16, 26: 32, 1007: 64 };
export const camNome = (n) => (POS[n] ? `Câm ${n} · ${POS[n]}` : `id ${n} (sem mapeamento)`);
export const camCurto = (n) => (POS[n] ? String(n) : `id${n}`);
export const camsDaMascara = (m) => Object.entries(BIT).filter(([, b]) => m & b).map(([c]) => Number(c));

const ERR = [[1, 'SD'], [2, 'Login'], [4, 'Gravação']];
export const errosTxt = (bits) => ERR.filter(([b]) => bits & b).map(([, n]) => n).join(' + ');
// código de estado de um registro -> categoria
export function cat(code) {
  if (code === 'N') return 'ok';
  if (code === 'O') return 'of';
  if (code >= '1' && code <= '7') return 'fa';
  if (code === '-') return 'sem';
  return 'nd';
}
export const CAT = {
  ok: { nome: 'Online', cls: 'c-ok', p: 'p-ok' },
  fa: { nome: 'Erro SD/gravação', cls: 'c-fa', p: 'p-fa' },
  of: { nome: 'Offline', cls: 'c-of', p: 'p-of' },
  nd: { nome: 'Sem dados', cls: 'c-nd', p: 'p-nd' },
  sem: { nome: 'Sem câmera', cls: 'c-nd', p: 'p-nd' },
};
export function codigoTxt(code) {
  const c = cat(code);
  if (c === 'fa') return `Online com erro (${errosTxt(Number(code))})`;
  return CAT[c].nome;
}
export const chip = (c, txt) => `<span class="chip ${CAT[c]?.cls || 'c-nd'}">${esc(txt ?? CAT[c]?.nome ?? c)}</span>`;

export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const dmyh = (iso) => (iso ? `${dmy(iso)} ${iso.slice(11, 16)}` : '—');
export const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
export const fmtP = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 })}%`);
export const pct = (a, b) => (b > 0 ? (100 * a) / b : null);
export const horas = (h) => (h == null ? '—' : h < 48 ? `${fmtN(Math.round(h * 10) / 10)} h` : `${fmtN(Math.round(h / 2.4) / 10)} dias`);
export const sem = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function barra(partes) {
  const tot = partes.reduce((a, p) => a + p[0], 0) || 1;
  return `<div class="barra" title="${partes.map((p) => `${p[2] || ''}: ${fmtN(p[0])}`).join(' · ')}">${partes.map(([v, cls]) => `<span class="${cls}" style="width:${(100 * v) / tot}%"></span>`).join('')}</div>`;
}

// Tabela ordenável com paginação. cols: [{k, t, v:(row)=>valor p/ ordenar, r:(row)=>html, num, w}]
export function tabela(el, { cols, linhas, ordem = null, porPagina = 150, aoClicar = null, vazio = 'Nenhum registro para os filtros.' }) {
  const st = { k: ordem?.k ?? null, dir: ordem?.dir ?? -1, pag: 0 };
  const colDe = (k) => cols.find((c) => c.k === k);
  function ordenadas() {
    if (!st.k) return linhas;
    const c = colDe(st.k);
    const f = c.v || ((r) => r[c.k]);
    return [...linhas].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * st.dir;
    });
  }
  function desenhar() {
    const ls = ordenadas();
    const np = Math.max(1, Math.ceil(ls.length / porPagina));
    st.pag = Math.min(st.pag, np - 1);
    const vis = ls.slice(st.pag * porPagina, (st.pag + 1) * porPagina);
    el.innerHTML = `<div class="tabela-wrap"><table class="tab"><thead><tr>${cols.map((c) => `<th class="${c.ord === false ? '' : 'ord'} ${c.num ? 'num' : ''}" data-k="${c.k}" ${c.w ? `style="min-width:${c.w}px"` : ''} title="${esc(c.dica || 'Clique para ordenar')}">${esc(c.t)}${st.k === c.k ? `<span class="seta">${st.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${vis.length ? vis.map((r, i) => `<tr data-i="${st.pag * porPagina + i}" class="${aoClicar ? 'clicavel' : ''}">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.r ? c.r(r) : esc(r[c.k] ?? '—')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="vazio">${esc(vazio)}</td></tr>`}</tbody></table></div>
      <div class="paginacao">${fmtN(ls.length)} linha(s)${np > 1 ? ` · página ${st.pag + 1} de ${np} <button class="btn peq" data-p="-1" ${st.pag ? '' : 'disabled'}>‹ anterior</button><button class="btn peq" data-p="1" ${st.pag < np - 1 ? '' : 'disabled'}>próxima ›</button>` : ''}</div>`;
    el.querySelectorAll('th.ord').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      st.dir = st.k === k ? -st.dir : (colDe(k).num ? -1 : 1);
      st.k = k; st.pag = 0; desenhar();
    }));
    el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { st.pag += Number(b.dataset.p); desenhar(); }));
    if (aoClicar) el.querySelectorAll('tbody tr[data-i]').forEach((tr) => tr.addEventListener('click', () => aoClicar(ls[Number(tr.dataset.i)])));
  }
  desenhar();
  return { linhasOrdenadas: ordenadas };
}

export function listaBarras(itens, { total = null, cls = 'b-prim', fmt = fmtN } = {}) {
  const max = Math.max(1, ...itens.map((i) => i[1]));
  return `<div class="lista-barras">${itens.map(([nome, v, extra]) => `<div class="lb"><span title="${esc(nome)}">${esc(nome)}</span><div class="barra"><span class="${cls}" style="width:${(100 * v) / max}%"></span></div><span class="num">${fmt(v)}${total ? ` <small>(${fmtP(pct(v, total), 0)})</small>` : ''}${extra ? ` ${extra}` : ''}</span></div>`).join('')}</div>`;
}
