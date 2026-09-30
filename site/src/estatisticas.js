// Página 2 — Estatísticas: ranking de garagens, distribuição dos status e evolução da disponibilidade.
import { F, barraFiltros } from './main.js';
import { D, veiculosFiltrados, faixaDias, tempos, ultimoCodigo, fmtN, fmtP, dmy, esc, SEM_GARAGEM } from './dados.js';

let garagemGrafico = '';

export function paginaEstatisticas(app) {
  app.innerHTML = `<section id="p2-filtros"></section><section class="estat">
    <div class="card painel-e"><div class="ph"><div><h2>Ranking de garagens com maiores problemas</h2><div class="sub">Ordenado pela menor disponibilidade no período</div></div></div><div id="p2-rank"></div></div>
    <div class="card painel-e"><div class="ph"><h2>Distribuição dos status</h2></div><div id="p2-donut"></div></div>
    <div class="card painel-e larga"><div class="ph"><h2>Evolução da disponibilidade</h2><select id="p2-gar" class="btn-sec" aria-label="Garagem do gráfico"></select></div><div class="grafico" id="p2-linha"></div></div></section>`;
  barraFiltros(app.querySelector('#p2-filtros'), { prefixo: false }, atualizar);
  app.querySelector('#p2-gar').onchange = (e) => { garagemGrafico = e.target.value; linha(); };
  window.onresize = () => linha();
  atualizar();
}

let ctx = null;
function atualizar() {
  const vs = veiculosFiltrados(F, false);
  const dias = faixaDias(F);
  const cam = F.camera || null;
  const g = new Map();
  let on = 0, fa = 0, off = 0, esperado = 0;
  vs.forEach((v) => {
    const nc = cam ? 1 : v.c.length;
    let ok = 0, mon = 0;
    dias.forEach((i) => { const [a, b, c] = tempos(v, i, cam); ok += a; mon += a + b + c; on += a; fa += b; off += c; });
    dias.forEach((i) => { esperado += nc * 60 * (D.cobertura?.[i]?.horas ?? 24); });
    let camsFalha = 0;
    (cam ? [Number(cam)] : v.c).forEach((c) => { const x = ultimoCodigo(v, c, dias); if (x && x !== 'N') camsFalha += 1; });
    const r = g.get(v.garagem) || { nome: v.garagem, ok: 0, mon: 0, camsFalha: 0, veicFalha: 0, veic: 0 };
    r.ok += ok; r.mon += mon; r.camsFalha += camsFalha; r.veicFalha += camsFalha ? 1 : 0; r.veic += 1;
    g.set(v.garagem, r);
  });
  ctx = { vs, dias, cam };
  ranking([...g.values()]);
  donut({ on, fa, off, nd: Math.max(0, esperado - on - fa - off) });
  const sel = document.getElementById('p2-gar');
  const gars = [...g.keys()].sort((a, b) => (a === SEM_GARAGEM) - (b === SEM_GARAGEM) || a.localeCompare(b, 'pt-BR'));
  if (garagemGrafico && !gars.includes(garagemGrafico)) garagemGrafico = '';
  sel.innerHTML = `<option value="">Todas as garagens</option>${gars.map((x) => `<option ${x === garagemGrafico ? 'selected' : ''}>${esc(x)}</option>`).join('')}`;
  linha();
}

function ranking(rows) {
  const el = document.getElementById('p2-rank');
  const disp = (r) => (r.mon ? (100 * r.ok) / r.mon : null);
  const gar = rows.filter((r) => r.nome !== SEM_GARAGEM).sort((a, b) => (disp(a) ?? 101) - (disp(b) ?? 101));
  const sem = rows.find((r) => r.nome === SEM_GARAGEM);
  const tr = (r, pos) => `<tr${pos ? '' : ' class="muted"'}><td>${pos || '—'}</td><td>${esc(r.nome)}</td><td><div class="bar"><span><i style="width:${disp(r) ?? 0}%"></i></span><em>${fmtP(disp(r))}</em></div></td><td class="n">${fmtN(r.camsFalha)}</td><td class="n">${fmtN(r.veicFalha)} <span class="sub">de ${fmtN(r.veic)}</span></td></tr>`;
  el.innerHTML = rows.length ? `<table class="rk"><thead><tr><th>#</th><th>Garagem</th><th>Disponibilidade</th><th class="n">Câmeras com falha</th><th class="n">Veículos com falha</th></tr></thead>
    <tbody>${gar.map((r, k) => tr(r, k + 1)).join('')}${sem ? tr(sem, 0) : ''}</tbody></table>` : '<div class="vazio">Sem dados para os filtros.</div>';
}

function donut({ on, fa, off, nd }) {
  const itens = [['Online', on, 'var(--on)'], ['Offline', off, 'var(--off)'], ['Erro SD/Falha', fa, 'var(--fa)'], ['Sem dados', nd, 'var(--nd)']];
  const tot = on + fa + off + nd;
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  const arcos = tot ? itens.map(([, v, cor]) => {
    const l = (C * v) / tot;
    const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${cor}" stroke-width="26" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)"/>`;
    acc += l; return s;
  }).join('') : '';
  const h = (m) => `${fmtN(Math.round(m / 60))} h`;
  document.getElementById('p2-donut').innerHTML = tot ? `<div class="donut"><svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Distribuição dos status">${arcos}
      <text x="90" y="86" text-anchor="middle" font-size="20" font-weight="700" fill="#172033">${fmtP((100 * on) / tot, 0)}</text><text x="90" y="104" text-anchor="middle" font-size="11" fill="#64748B">online</text></svg>
    <ul>${itens.map(([n, v, cor]) => `<li><i style="background:${cor}"></i><span>${n}</span><span class="q">${h(v)}</span><span class="p">${fmtP((100 * v) / tot)}</span></li>`).join('')}</ul></div>
    <div class="sub" style="margin-top:8px">Horas-câmera no período (Sem dados = horas cobertas pela extração sem registro da câmera)</div>` : '<div class="vazio">Sem dados para os filtros.</div>';
}

function linha() {
  const el = document.getElementById('p2-linha');
  if (!el || !ctx) return;
  const vs = garagemGrafico ? ctx.vs.filter((v) => v.garagem === garagemGrafico) : ctx.vs;
  const pts = ctx.dias.map((i) => {
    let ok = 0, mon = 0;
    vs.forEach((v) => { const [a, b, c] = tempos(v, i, ctx.cam); ok += a; mon += a + b + c; });
    return { d: D.dias[i], y: mon ? (100 * ok) / mon : null };
  });
  const W = Math.max(320, el.clientWidth), H = 280, m = { l: 44, r: 16, t: 12, b: 34 };
  const x = (k) => m.l + (pts.length > 1 ? (k * (W - m.l - m.r)) / (pts.length - 1) : (W - m.l - m.r) / 2);
  const y = (v) => m.t + ((100 - v) * (H - m.t - m.b)) / 100;
  const grade = [0, 25, 50, 75, 100].map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748B">${v}%</text>`).join('');
  const passo = Math.ceil(pts.length / Math.max(1, Math.floor((W - m.l - m.r) / 48)));
  const rot = pts.map((p, k) => (k % passo === 0 || k === pts.length - 1 ? `<text x="${x(k)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#64748B">${p.d.slice(8, 10)}/${p.d.slice(5, 7)}</text>` : '')).join('');
  let path = '', abre = true;
  pts.forEach((p, k) => { if (p.y == null) { abre = true; return; } path += `${abre ? 'M' : 'L'}${x(k).toFixed(1)},${y(p.y).toFixed(1)}`; abre = false; });
  const pontos = pts.map((p, k) => (p.y == null ? '' : `<circle cx="${x(k)}" cy="${y(p.y)}" r="3" fill="#2563EB"><title>${dmy(p.d)}: ${fmtP(p.y)}</title></circle>`)).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolução da disponibilidade">${grade}${rot}<path d="${path}" fill="none" stroke="#2563EB" stroke-width="2"/>${pontos}</svg>`;
}
