// Calendário leve em popover para o filtro Período: um dia (dois cliques no mesmo dia) ou intervalo (início e fim),
// nomes em pt-BR, atalhos (Último dia, Últimos 7 dias) e Limpar. Só os dias com dados podem ser escolhidos.
import { ICONE, dmy } from './dados.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SEMANA_T = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const somaDias = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

export function rotuloPeriodo(de, ate) {
  if (!de && !ate) return 'Todo o período';
  if (!ate || de === ate) return dmy(de || ate);
  return `${dmy(de).slice(0, 5)} – ${dmy(ate)}`;
}

export function calendario(host, { min, max, de, ate, dias }, aoMudar) {
  const st = { de, ate, ini: null, mes: (ate || max).slice(0, 7) };
  host.innerHTML = `<div class="cal-campo${de || ate ? ' com-valor' : ''}"><button type="button" class="cal-btn" id="f-periodo-btn" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="rot-periodo f-periodo-btn">${ICONE.cal}<span>${rotuloPeriodo(de, ate)}</span></button>${de || ate ? '<button type="button" class="cal-x" id="f-periodo-limpar" aria-label="Limpar período">×</button>' : ''}</div>`;
  const btn = host.querySelector('#f-periodo-btn');
  host.querySelector('#f-periodo-limpar')?.addEventListener('click', () => aoMudar('', ''));
  let pop = null;
  const fechar = () => { pop?.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  const fora = (e) => { if (pop && !pop.contains(e.target) && !host.contains(e.target)) fechar(); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  const escolher = (a, b) => { fechar(); aoMudar(a, b); };
  const desenhar = () => {
    const [y, m] = st.mes.split('-').map(Number);
    const prim = new Date(y, m - 1, 1), nDias = new Date(y, m, 0).getDate();
    const cel = [];
    for (let k = 0; k < prim.getDay(); k += 1) cel.push('<span></span>');
    for (let d = 1; d <= nDias; d += 1) {
      const s = `${st.mes}-${String(d).padStart(2, '0')}`;
      const ok = s >= min && s <= max && dias.has(s);
      const a = st.ini || st.de, b = st.ini ? null : st.ate || st.de;
      const cls = [s === a || s === b ? 'sel' : '', a && b && s > a && s < b ? 'meio' : '', s === max ? 'hoje' : ''].join(' ');
      cel.push(`<button type="button" class="cal-d ${cls}" data-d="${s}" ${ok ? '' : 'disabled'} aria-label="${SEMANA_T[new Date(`${s}T12:00:00`).getDay()]}, ${dmy(s)}">${d}</button>`);
    }
    pop.innerHTML = `<div class="cal-cab"><button type="button" class="cal-nav" data-n="-1" aria-label="Mês anterior" ${st.mes <= min.slice(0, 7) ? 'disabled' : ''}>${ICONE.esq}</button>
      <b>${MESES[m - 1]} de ${y}</b><button type="button" class="cal-nav" data-n="1" aria-label="Próximo mês" ${st.mes >= max.slice(0, 7) ? 'disabled' : ''}>${ICONE.dir}</button></div>
      <div class="cal-sem">${SEMANA.map((x, k) => `<span title="${SEMANA_T[k]}">${x}</span>`).join('')}</div><div class="cal-grade">${cel.join('')}</div>
      <div class="cal-dica">${st.ini ? `Início ${dmy(st.ini)} · escolha o fim (ou o mesmo dia para um dia só)` : 'Clique no dia inicial e depois no final'}</div>
      <div class="cal-rod"><button type="button" class="cal-at" data-q="1">Último dia</button><button type="button" class="cal-at" data-q="7">Últimos 7 dias</button><button type="button" class="cal-at limpar" data-q="0">Limpar</button></div>`;
    pop.querySelectorAll('.cal-nav').forEach((b) => b.addEventListener('click', () => {
      const d = new Date(y, m - 1 + Number(b.dataset.n), 1); st.mes = iso(d).slice(0, 7); desenhar();
    }));
    pop.querySelectorAll('.cal-d:not([disabled])').forEach((b) => b.addEventListener('click', () => {
      const d = b.dataset.d;
      if (!st.ini) { st.ini = d; desenhar(); return; }
      const [a, z] = d < st.ini ? [d, st.ini] : [st.ini, d];
      escolher(a, z);
    }));
    pop.querySelectorAll('.cal-at').forEach((b) => b.addEventListener('click', () => {
      const q = Number(b.dataset.q);
      if (!q) escolher('', ''); else escolher(q === 1 ? max : [...dias].filter((x) => x >= somaDias(max, -6)).sort()[0], max);
    }));
  };
  btn.addEventListener('click', () => {
    if (pop) { fechar(); return; }
    pop = document.createElement('div');
    pop.className = 'cal-pop'; pop.id = 'cal-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Escolher período');
    document.body.appendChild(pop);
    st.ini = null;
    desenhar();
    const r = btn.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8))}px`;
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => { document.addEventListener('mousedown', fora); document.addEventListener('keydown', tecla); });
    window.addEventListener('scroll', fechar, { once: true, capture: true, passive: true });
  });
}
