// Gráfico de linhas em SVG (Evolução diária), redimensionado ao tamanho do contêiner, com dica ao passar o mouse/tocar.
import { fmtN, dmy, diaSemana, posicionarTip } from './dados.js';

const passoBom = (max) => {
  if (max <= 4) return 1;
  const bruto = max / 4, p = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto);
};
const curto = (n) => (n >= 10000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtN(n));

export function graficoLinhas(el, datas, series, unidade, eixoY = '') {
  const W = el.clientWidth, H = el.clientHeight;
  if (!datas.length) { el.innerHTML = '<div class="vazio">Sem datas no período.</div>'; return; }
  const m = { l: (W < 360 ? 38 : 50) + (eixoY ? 14 : 0), r: 18, t: 12, b: 26 };
  const w = Math.max(10, W - m.l - m.r), h = Math.max(10, H - m.t - m.b);
  const max = Math.max(1, ...series.flatMap((s) => s.vals));
  const passo = passoBom(max), topo = Math.ceil(max / passo) * passo;
  const n = datas.length;
  const x = (j) => m.l + (n === 1 ? w / 2 : (j * w) / (n - 1));
  const y = (v) => m.t + h - (v / topo) * h;
  const grades = [];
  for (let v = 0; v <= topo + 1e-9; v += passo) grades.push(v);
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 46))));
  const rotX = datas.map((d, j) => ((n - 1 - j) % cada === 0 ? `<text x="${x(j)}" y="${H - 6}" text-anchor="${j === n - 1 && n > 1 ? 'end' : 'middle'}">${d.slice(8, 10)}/${d.slice(5, 7)}</text>` : '')).join('');
  const uid = Math.random().toString(36).slice(2, 7);
  const caminho = (s) => s.vals.map((v, j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const defs = `<defs>${series.map((s, k) => `<linearGradient id="ga-${uid}-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.cor}" stop-opacity=".22"/><stop offset="1" stop-color="${s.cor}" stop-opacity="0"/></linearGradient>`).join('')}
    <filter id="sb-${uid}" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".18"/></filter></defs>`;
  const areas = series.map((s, k) => `<path d="${caminho(s)}L${x(n - 1).toFixed(1)},${(m.t + h).toFixed(1)}L${x(0).toFixed(1)},${(m.t + h).toFixed(1)}Z" fill="url(#ga-${uid}-${k})" class="area-g"/>`).join('');
  const linhas = defs + areas + series.map((s) => `<path d="${caminho(s)}" style="stroke:${s.cor}" class="ln" filter="url(#sb-${uid})"/>`).join('');
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução diária: ${series.map((s) => s.nome).join(', ')}">
    <g class="grade-g">${grades.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 3.5}" text-anchor="end">${curto(v)}</text>`).join('')}${datas.map((d, j) => ((n - 1 - j) % cada === 0 ? `<line class="gv" x1="${x(j)}" x2="${x(j)}" y1="${m.t}" y2="${m.t + h}"/>` : '')).join('')}</g>
    ${eixoY ? `<text class="eixo-t" transform="translate(12 ${m.t + h / 2}) rotate(-90)" text-anchor="middle">${eixoY}</text>` : ''}
    <g class="eixo-x">${rotX}</g>${linhas}
    <g class="guia" style="display:none"><line y1="${m.t}" y2="${m.t + h}"/>${series.map((s) => `<circle r="4" style="fill:#fff;stroke:${s.cor}"/>`).join('')}</g>
    <rect class="capta" x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent"/></svg>`;
  const svg = el.querySelector('svg'), guia = svg.querySelector('.guia'), tip = document.getElementById('tip');
  const mover = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const j = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((px - m.l) / w) * (n - 1))));
    guia.style.display = '';
    guia.querySelector('line').setAttribute('x1', x(j)); guia.querySelector('line').setAttribute('x2', x(j));
    guia.querySelectorAll('circle').forEach((c, k) => { c.setAttribute('cx', x(j)); c.setAttribute('cy', y(series[k].vals[j])); });
    tip.className = 'tip';
    tip.innerHTML = `<div class="t1">${diaSemana(datas[j])}, ${dmy(datas[j])}</div>${series.map((s) => `<div class="l"><span><i class="bol" style="background:${s.cor}"></i>${s.nome}</span><b>${fmtN(s.vals[j])}</b></div>`).join('')}<div class="sub" style="margin-top:4px">${unidade}</div>`;
    posicionarTip(tip, ev.touches ? ev.touches[0] : ev);
  };
  const sair = () => { guia.style.display = 'none'; tip.style.display = 'none'; };
  const cap = svg.querySelector('.capta');
  cap.addEventListener('mousemove', mover); cap.addEventListener('mouseleave', sair);
  cap.addEventListener('touchstart', mover, { passive: true }); cap.addEventListener('touchmove', mover, { passive: true }); cap.addEventListener('touchend', () => setTimeout(sair, 1500));
}
