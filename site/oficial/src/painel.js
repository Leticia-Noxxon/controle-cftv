// Painel de detalhe do veículo: prefixo + data, câmeras, métricas do dia, linha do tempo e manutenção.
// Pode ser aberto na Matriz (ao lado da tabela) ou no detalhe da garagem (dentro do modal).
import { D, manutDia, detalhe, estadoDia, camNome, diaSemana, dmy, dur, hhmm, fmtP, esc, ICONE, ROTULO_CURTO, semHorario } from './dados.js';

const COR = { N: 'var(--on)', F: 'var(--fa)', O: 'var(--off)', S: 'var(--nd)' };
const NOME = { N: 'Funcional', F: 'Erro de SD card', O: 'Offline', S: 'Sem conexão' };
const BADGE = { on: ['b-on', ROTULO_CURTO.on], off: ['b-off', ROTULO_CURTO.off], sd: ['b-sd', ROTULO_CURTO.sd], fa: ['b-fa', ROTULO_CURTO.fa], nd: ['b-nd', ROTULO_CURTO.nd] };
const estadoCod = (x) => (x === 'N' ? 'N' : x === 'O' ? 'O' : 'F');
let atual = null;

export const painelAberto = () => !!atual;

// host = { box, area (recebe .com-painel), fundo (gaveta < 1024 px), navDia (setas de dia anterior/próximo) }
export function fecharPainel() {
  if (!atual) return;
  const { host } = atual;
  host.box.classList.add('oculto'); host.box.innerHTML = '';
  host.area?.classList.remove('com-painel');
  host.fundo?.classList.remove('ativo');
  const cb = atual.aoFechar; atual = null;
  if (cb) cb();
}

const camPadrao = (v, i, camFiltro) => (camFiltro ? Number(camFiltro) : (v.c.find((c) => ['off', 'fa', 'sd'].includes(estadoDia(v, i, String(c)))) ?? v.c[0]));

export function abrirPainel(host, p, i, camFiltro, aoFechar) {
  const v = D.porPrefixo.get(p);
  atual = { host, p, i, cam: camPadrao(v, i, camFiltro), camFiltro, aoFechar };
  host.box.classList.remove('oculto');
  host.area?.classList.add('com-painel');
  if (window.innerWidth < 1024) host.fundo?.classList.add('ativo');
  desenhar();
}

async function desenhar() {
  const { p, i, cam, host } = atual;
  const v = D.porPrefixo.get(p);
  const dia = D.dias[i];
  const box = host.box;
  const nav = host.navDia ? `<div class="nav-dia"><button class="fechar" id="pn-ant" aria-label="Dia anterior" ${i <= 0 ? 'disabled' : ''}>${ICONE.esq}</button><button class="fechar" id="pn-prox" aria-label="Próximo dia" ${i >= D.nd - 1 ? 'disabled' : ''}>${ICONE.dir}</button></div>` : '';
  // com filtro de câmera, o painel mostra só essa câmera
  const cams = v.c.filter((c) => !atual.camFiltro || String(c) === String(atual.camFiltro)).map((c) => {
    const [cls, txt] = BADGE[estadoDia(v, i, String(c))];
    return `<button class="cam-b ${c === cam ? 'sel' : ''}" data-c="${c}"><span>${esc(camNome(c))}</span><span class="badge ${cls}">${txt}</span></button>`;
  }).join('');
  const evs = manutDia(v, i, atual.camFiltro);
  box.innerHTML = `<div class="painel" role="dialog" aria-label="Detalhe do prefixo ${p}">
    <div class="cab-p"><div><h2>Prefixo ${p}</h2><div class="sub">${diaSemana(dia)}, ${dmy(dia)} · ${esc(v.garagem)}${v.empresa !== v.garagem ? ` <span class="muted">(${esc(v.empresa)})</span>` : ''}</div></div><div class="cab-acoes">${nav}<button class="fechar" id="pn-fechar" aria-label="Fechar">${ICONE.x}</button></div></div>
    <div class="sec"><h3>${atual.camFiltro ? 'Câmera' : 'Câmeras'}</h3><div class="cams">${cams}</div></div>
    <div class="sec" id="pn-dia"><h3>${esc(camNome(cam))}</h3><div class="sub">Carregando registros…</div></div>
    <div class="sec"><h3>Manutenção</h3>${evs.length ? evs.map(blocoManut).join('') : '<div class="sub">Sem manutenção registrada nesta data.</div>'}</div></div>`;
  box.querySelector('#pn-fechar').onclick = fecharPainel;
  const mudaDia = (d) => { atual.i = Math.max(0, Math.min(D.nd - 1, atual.i + d)); atual.cam = camPadrao(v, atual.i, atual.camFiltro); desenhar(); };
  box.querySelector('#pn-ant')?.addEventListener('click', () => mudaDia(-1));
  box.querySelector('#pn-prox')?.addEventListener('click', () => mudaDia(1));
  box.querySelectorAll('.cam-b').forEach((b) => b.addEventListener('click', () => { atual.cam = Number(b.dataset.c); desenhar(); }));
  const det = await detalhe(p);
  if (!atual || atual.p !== p || atual.i !== i || atual.cam !== cam) return;
  box.querySelector('#pn-dia').innerHTML = `<h3>${esc(camNome(cam))}</h3>${semHorario(v, cam, i) ? blocoDiario(v, cam, i) : `${blocoDia(det.t?.[cam]?.[dia] || [])}${notaCobertura(i)}`}`;
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


// Leitura diária SEM horário (Relatório CFTV): só a situação do dia; sem linha do tempo, tempos ou disponibilidade
function blocoDiario(v, cam, i) {
  const x = v.l?.[cam]?.[i] || '';
  const e = estadoCod(x);
  const erros = /^[1-7]$/.test(x) ? [[1, 'SD'], [2, 'Login'], [4, 'Gravação']].filter(([b]) => Number(x) & b).map(([, n]) => n).join(', ') : '';
  const nome = e === 'F' ? `Online com erro${erros ? ` (${erros})` : ''}` : NOME[e];
  return `<div class="intervalos"><div class="iv" title="Leitura do Relatório CFTV diário"><i style="background:${COR[e]}"></i><span>${dmy(D.dias[i]).slice(0, 5)} (sem horário)</span><span>${nome}</span><span class="dur">—</span></div></div>
    <div class="sub" style="margin-top:8px">Leitura do Relatório CFTV diário: o relatório informa a situação da câmera no dia, sem horário. Por isso não há linha do tempo, tempos nem disponibilidade neste dia.</div>`;
}

function notaCobertura(i) {
  const c = D.cobertura?.[i];
  if (c && !c.inicio) return '<div class="sub" style="margin-top:8px">Sem registros com horário neste dia.</div>';
  return c && c.horas < 24 ? `<div class="sub" style="margin-top:8px">Dia parcial na extração: dados de ${c.inicio.slice(11, 16)} a ${c.fim.slice(11, 16)}. O restante aparece como Sem conexão.</div>` : '';
}

function blocoDia(trechos) {
  const iv = intervalosDia(trechos);
  const tot = { N: 0, F: 0, O: 0, S: 0 };
  iv.forEach((x) => { tot[x.e] += (x.b - x.a) / 60; });
  const mon = tot.N + tot.F + tot.O;
  const m = (r, val, cls = '') => `<div class="${cls}"><div class="m-r">${r}</div><div class="m-v">${val}</div></div>`;
  return `<div class="metricas">${m('Disponibilidade do dia', mon ? fmtP((100 * tot.N) / mon) : '—', 'larga')}${m('Funcional', dur(tot.N))}${m('Offline', dur(tot.O))}${m('Erro de SD card', dur(tot.F))}${m('Sem conexão', dur(tot.S))}</div>
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
