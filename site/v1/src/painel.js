// Painel de detalhe: prefixo + data, câmeras, métricas do dia, linha do tempo e manutenção.
import { D, detalhe, estadoDia, camNome, diaSemana, dmy, dur, hhmm, fmtP, esc, ICONE } from './dados.js';

const COR = { N: 'var(--on)', F: 'var(--fa)', O: 'var(--off)', S: 'var(--nd)' };
const NOME = { N: 'Online', F: 'Falha', O: 'Offline', S: 'Sem dados' };
const BADGE = { on: ['b-on', 'Online'], off: ['b-off', 'Offline'], fa: ['b-fa', 'Falha'], nd: ['b-nd', 'Sem dados'] };
const estadoCod = (x) => (x === 'N' ? 'N' : x === 'O' ? 'O' : 'F');
let atual = null;

export const painelAberto = () => !!atual;

export function fecharPainel() {
  const box = document.getElementById('p1-painel');
  if (!box) { atual = null; return; }
  box.classList.add('oculto'); box.innerHTML = '';
  document.getElementById('p1-area')?.classList.remove('com-painel');
  document.getElementById('p1-fundo')?.classList.remove('ativo');
  const cb = atual?.aoFechar; atual = null;
  if (cb) cb();
}

export function abrirPainel(p, i, camFiltro, aoFechar) {
  const v = D.porPrefixo.get(p);
  const camPadrao = camFiltro ? Number(camFiltro)
    : (v.c.find((c) => ['off', 'fa'].includes(estadoDia(v, i, String(c)))) ?? v.c[0]);
  atual = { p, i, cam: camPadrao, aoFechar };
  const box = document.getElementById('p1-painel');
  box.classList.remove('oculto');
  document.getElementById('p1-area').classList.add('com-painel');
  if (window.innerWidth < 1024) document.getElementById('p1-fundo').classList.add('ativo');
  desenhar();
}

async function desenhar() {
  const { p, i, cam } = atual;
  const v = D.porPrefixo.get(p);
  const dia = D.dias[i];
  const box = document.getElementById('p1-painel');
  const cams = v.c.map((c) => {
    const [cls, txt] = BADGE[estadoDia(v, i, String(c))];
    return `<button class="cam-b ${c === cam ? 'sel' : ''}" data-c="${c}"><span>${esc(camNome(c))}</span><span class="badge ${cls}">${txt}</span></button>`;
  }).join('');
  const evs = (v.mv[i] || []).map((k) => D.manut.get(k)).filter(Boolean);
  box.innerHTML = `<div class="painel" role="dialog" aria-label="Detalhe do prefixo ${p}">
    <div class="cab-p"><div><h2>Prefixo ${p}</h2><div class="sub">${diaSemana(dia)}, ${dmy(dia)} · ${esc(v.empresa)} · ${esc(v.garagem)}</div></div><button class="fechar" id="pn-fechar" aria-label="Fechar">${ICONE.x}</button></div>
    <div class="sec"><h3>Câmeras</h3><div class="cams">${cams}</div></div>
    <div class="sec" id="pn-dia"><h3>${esc(camNome(cam))}</h3><div class="sub">Carregando registros…</div></div>
    <div class="sec"><h3>Manutenção</h3>${evs.length ? evs.map(blocoManut).join('') : '<div class="sub">Sem manutenção registrada nesta data.</div>'}</div></div>`;
  box.querySelector('#pn-fechar').onclick = fecharPainel;
  box.querySelectorAll('.cam-b').forEach((b) => b.addEventListener('click', () => { atual.cam = Number(b.dataset.c); desenhar(); }));
  const det = await detalhe(p);
  if (!atual || atual.p !== p || atual.i !== i || atual.cam !== cam) return;
  box.querySelector('#pn-dia').innerHTML = `<h3>${esc(camNome(cam))}</h3>${blocoDia(det.t?.[cam]?.[dia] || [])}${notaCobertura(i)}`;
  box.querySelectorAll('[data-bruto]').forEach((b) => b.addEventListener('click', () => {
    const alvo = box.querySelector(`#bruto-${b.dataset.bruto}`);
    if (alvo.classList.toggle('oculto')) { b.textContent = 'Ver registro completo'; return; }
    alvo.textContent = det.m?.[b.dataset.bruto] || 'Registro completo indisponível.';
    b.textContent = 'Ocultar registro completo';
  }));
}

// Intervalos do dia a partir dos trechos [início s, fim s, código, nº registros]; lacunas = Sem dados
function intervalosDia(trechos) {
  const out = [];
  let t = 0;
  trechos.forEach(([a, b, c, n]) => {
    if (a > t) out.push({ a: t, b: a, e: 'S', n: 0 });
    const e = estadoCod(c);
    const ult = out[out.length - 1];
    if (ult && ult.e === e && ult.b === a) { ult.b = b; ult.n += n; } else out.push({ a, b, e, n });
    t = Math.max(t, b);
  });
  if (t < 86400) out.push({ a: t, b: 86400, e: 'S', n: 0 });
  return out;
}

function notaCobertura(i) {
  const c = D.cobertura?.[i];
  return c && c.horas < 24 ? `<div class="sub" style="margin-top:8px">Dia parcial na extração: dados de ${c.inicio.slice(11, 16)} a ${c.fim.slice(11, 16)}. O restante aparece como Sem dados.</div>` : '';
}

function blocoDia(trechos) {
  const iv = intervalosDia(trechos);
  const tot = { N: 0, F: 0, O: 0, S: 0 };
  iv.forEach((x) => { tot[x.e] += (x.b - x.a) / 60; });
  const mon = tot.N + tot.F + tot.O;
  const m = (r, val, cls = '') => `<div class="${cls}"><div class="m-r">${r}</div><div class="m-v">${val}</div></div>`;
  return `<div class="metricas">${m('Disponibilidade do dia', mon ? fmtP((100 * tot.N) / mon) : '—', 'larga')}${m('Online', dur(tot.N))}${m('Offline', dur(tot.O))}${m('Falha (SD)', dur(tot.F))}${m('Sem dados', dur(tot.S))}</div>
    <div class="barra-tl" style="margin-top:12px">${iv.map((x) => `<i style="left:${(100 * x.a) / 86400}%;width:${(100 * (x.b - x.a)) / 86400}%;background:${COR[x.e]}" title="${hhmm(x.a)}–${hhmm(x.b)} · ${NOME[x.e]}"></i>`).join('')}</div>
    <div class="eixo"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
    <div class="intervalos">${iv.map((x) => `<div class="iv" title="${x.n ? `${x.n} registro(s)` : 'Sem registros'}"><i style="background:${COR[x.e]}"></i><span>${hhmm(x.a)}–${x.b >= 86400 ? '24:00' : hhmm(x.b)}</span><span>${NOME[x.e]}</span><span class="dur">${dur((x.b - x.a) / 60)}</span></div>`).join('')}</div>`;
}

function blocoManut(e) {
  const lista = (xs) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="sub">—</div>');
  return `<div class="manut"><div class="mh">${dmy(e.d)} ${e.h} · ${esc(e.tec.join(', '))}</div>
    <div class="mr">Problema</div>${lista(e.problema)}
    <div class="mr">Ação</div>${lista(e.acao)}
    <button class="link" data-bruto="${e.i}">Ver registro completo</button><pre class="bruto oculto" id="bruto-${e.i}"></pre></div>`;
}
