// Matriz data × prefixo: cor = estados que ocorreram no dia (presença, não proporção); texto = disponibilidade do dia.
import { F, veiculosFiltrados } from '../main.js';
import { esc, dm, dmy, fmtN, fmtP, pct, camNome, camsDaMascara, errosTxt, BIT } from '../util.js';
import { painelDia, painelVeiculo } from '../painel.js';
import { exportarXlsx } from '../exportar.js';

let modo = 'pct';
let ordem = 'pior';
const ALT = 26;
const NOME_MASC = { 1: 'Todas as câmeras OK', 2: 'Somente erro SD/gravação', 3: 'Online + erro SD/gravação', 4: 'Todos os registros offline', 5: 'Online + offline', 6: 'Erro SD/gravação + offline', 7: 'Online + erro + offline' };

// Estado do dia para o veículo (ou só para a câmera filtrada): máscara 1=online 2=erro 4=offline
function celula(v, i) {
  const x = v.d[i];
  if (F.camera) {
    const k = v.k?.[F.camera]; const m = k ? Number(k[i]) : 0;
    return m ? { m, a: null } : null;
  }
  if (x == null) return null;
  if (x === 100) return { m: 1, a: 100 };
  return { m: x[1], a: x[0], x };
}

function problemasDoDia(v, i) {
  const x = v.d[i];
  if (x == null || x === 100) return [];
  const [, , cf, co, bits] = x;
  return Object.keys(BIT).map(Number).filter((c) => (cf | co) & BIT[c]).map((c) => {
    const k = v.k?.[c]; const m = k ? Number(k[i]) : 0;
    const tipos = [(co & BIT[c]) && 'offline', (cf & BIT[c]) && `erro ${errosTxt(bits)}`].filter(Boolean);
    return { c, tipos, parcial: !!(m & 1) };
  });
}

export function viewMatriz(el, D) {
  const dias = D.dias;
  const cob = Object.fromEntries(D.meta.cobertura.map((c) => [c.data, c]));
  const ini = F.de ? Math.max(0, dias.indexOf(F.de)) : 0;
  const fimIdx = F.ate && dias.includes(F.ate) ? dias.indexOf(F.ate) : dias.length - 1;
  const idx = dias.map((_, i) => i).filter((i) => i >= ini && i <= fimIdx);
  let vs = veiculosFiltrados().map((v) => {
    const cels = idx.map((i) => celula(v, i));
    const probDias = cels.filter((c) => c && c.m !== 1).length;
    const offDias = cels.filter((c) => c && c.m & 4).length;
    const faDias = cels.filter((c) => c && c.m & 2).length;
    let n = 0, ok = 0;
    idx.forEach((i) => { const x = v.d[i]; if (x == null) return; n += 1; ok += x === 100 ? 100 : x[0]; });
    return { v, probDias, offDias, faDias, disp: n ? ok / n : null, comDado: cels.filter(Boolean).length };
  }).filter((r) => r.comDado);
  const st = F.status;
  if (st === 'problema') vs = vs.filter((r) => r.probDias);
  if (st === 'of') vs = vs.filter((r) => r.offDias);
  if (st === 'fa') vs = vs.filter((r) => r.faDias);
  if (st === 'ok') vs = vs.filter((r) => !r.probDias);
  const ORD = { pior: (a, b) => b.probDias - a.probDias || (a.disp ?? 101) - (b.disp ?? 101) || a.v.p - b.v.p, prefixo: (a, b) => a.v.p - b.v.p, disp: (a, b) => (a.disp ?? 101) - (b.disp ?? 101) || a.v.p - b.v.p };
  vs.sort(ORD[ordem]);
  const cols = `90px 62px repeat(${idx.length}, minmax(${modo === 'pct' ? 40 : 46}px, 1fr))`;
  el.innerHTML = `<section class="secao"><div class="cab-secao"><div><h2>Matriz diária por prefixo</h2><p>${F.camera ? `Somente ${esc(camNome(Number(F.camera)))}: a cor mostra os estados que essa câmera teve no dia.` : 'Cada célula é um veículo em um dia. A cor mostra quais estados ocorreram no dia (não a proporção); o número é a disponibilidade do dia (registros online sem erro ÷ todos os registros das câmeras).'} Passe o mouse para detalhes; clique para a linha do tempo horária.</p></div>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center">
      ${F.camera ? '' : `<div class="seg" id="modo"><button data-m="pct" class="${modo === 'pct' ? 'ativo' : ''}">% disponibilidade</button><button data-m="cam" class="${modo === 'cam' ? 'ativo' : ''}">Câmeras com problema</button></div>`}
      <label class="sutil" style="font-size:.8rem">Ordenar <select class="ctl" id="ordem"><option value="pior">Mais dias com problema</option><option value="disp">Menor disponibilidade</option><option value="prefixo">Prefixo</option></select></label>
      <button class="btn" id="exp">Exportar Excel</button></div></div>
    <div class="legenda" style="margin-bottom:.5rem">
      <span><span class="amostra s-1"></span>Todas OK</span><span><span class="amostra s-3"></span>Alguma câmera com erro SD/gravação</span><span><span class="amostra s-5"></span>Alguma câmera offline</span>
      <span><span class="amostra s-7"></span>Online + erro + offline</span><span><span class="amostra s-6"></span>Erro + offline (sem online)</span><span><span class="amostra s-2"></span>Só erro SD</span><span><span class="amostra s-4"></span>Todas offline</span><span><span class="amostra s-nd"></span>Sem dados</span><span><span class="amostra s-1 cel man" style="position:relative"></span>Manutenção no dia (faixa azul)</span>
    </div>
    <p class="nota">${fmtN(vs.length)} veículos · dias em itálico são parciais na base (ex.: 15/09 só tem registros a partir das 21h; 25/09 em diante ainda não há dados).</p>
    <div class="matriz-wrap" id="mw"><div class="mx-cab" style="grid-template-columns:${cols}"><div class="mx-pref">Prefixo</div><div title="Disponibilidade no período filtrado (média diária)">Período</div>${idx.map((i) => { const c = cob[dias[i]]; return `<div class="${!c || c.horas < 24 ? 'parcial' : ''}" title="${c ? `${dmy(dias[i])}: ${c.horas} h com dados (${c.inicio.slice(11, 16)}–${c.fim.slice(11, 16)})` : `${dmy(dias[i])}: sem dados`}">${dias[i].slice(8)}</div>`; }).join('')}</div>
    <div id="corpo" style="position:relative;height:${vs.length * ALT}px"></div></div></section>`;
  el.querySelector('#ordem').value = ordem;
  el.querySelector('#ordem').addEventListener('change', (e) => { ordem = e.target.value; viewMatriz(el, D); });
  el.querySelectorAll('#modo button').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.m; viewMatriz(el, D); }));
  const mw = el.querySelector('#mw'); const corpo = el.querySelector('#corpo');
  const txtCel = (r, i, c) => {
    if (!c) return '';
    if (F.camera) return '';
    if (modo === 'cam') {
      if (c.m === 1) return '';
      const ps = problemasDoDia(r.v, i);
      if (ps.length === r.v.c.length && ps.length > 1) return 'todas';
      return ps.length > 2 ? `${ps.length} câm` : ps.map((p) => (p.c > 26 ? 'id' : p.c)).join('·');
    }
    return c.a == null ? '' : c.a === 100 ? '100' : Math.floor(c.a) === c.a ? c.a : c.a.toFixed(0);
  };
  function desenhar() {
    const topo = Math.max(0, Math.floor(mw.scrollTop / ALT) - 10);
    const n = Math.ceil(mw.clientHeight / ALT) + 20;
    corpo.innerHTML = vs.slice(topo, topo + n).map((r, j) => `<div class="mx-linha" style="grid-template-columns:${cols};position:absolute;left:0;right:0;top:${(topo + j) * ALT}px" data-p="${r.v.p}">
      <div class="mx-pref" data-vp="${r.v.p}" title="${esc(r.v.empresa)}">${r.v.p}</div><div class="mx-mes" title="Dias com problema: ${r.probDias}">${r.disp == null ? '—' : fmtP(r.disp, 0)}</div>
      ${idx.map((i) => { const c = celula(r.v, i); return `<div class="cel ${c ? `s-${c.m}` : 's-nd'} ${r.v.mv[i] ? 'man' : ''}" data-i="${i}">${txtCel(r, i, c)}</div>`; }).join('')}</div>`).join('');
  }
  desenhar();
  mw.addEventListener('scroll', () => requestAnimationFrame(desenhar));
  const tip = document.getElementById('tooltip');
  corpo.addEventListener('mousemove', (ev) => {
    const cel = ev.target.closest('.cel'); if (!cel) { tip.style.display = 'none'; return; }
    const v = D.porPrefixo.get(Number(cel.parentElement.dataset.p)); const i = Number(cel.dataset.i);
    tip.innerHTML = tooltip(D, v, i, cob[dias[i]]);
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(ev.clientX + 14, innerWidth - w - 8)}px`; tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - h - 8)}px`;
  });
  corpo.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  corpo.addEventListener('click', (ev) => {
    const vp = ev.target.closest('[data-vp]'); if (vp) { tip.style.display = 'none'; painelVeiculo(D, Number(vp.dataset.vp)); return; }
    const cel = ev.target.closest('.cel'); if (!cel) return;
    tip.style.display = 'none'; painelDia(D, Number(cel.parentElement.dataset.p), Number(cel.dataset.i));
  });
  el.querySelector('#exp').addEventListener('click', () => {
    const rows = vs.map((r) => {
      const o = { Prefixo: r.v.p, Empresa: r.v.empresa, Garagem: r.v.g || '', 'Disponibilidade no período (%)': r.disp == null ? '' : Number(r.disp.toFixed(1)), 'Dias com problema': r.probDias };
      idx.forEach((i) => {
        const c = celula(r.v, i);
        o[dm(dias[i])] = !c ? 'sem dados' : F.camera ? NOME_MASC[c.m] : c.m === 1 ? '100% OK' : `${c.a}% · ${problemasDoDia(r.v, i).map((p) => `câm ${p.c} ${p.tipos.join('+')}`).join('; ')}`;
      });
      return o;
    });
    exportarXlsx('matriz_diaria', { Matriz: rows }, 'Matriz data × prefixo (disponibilidade diária e câmeras com problema)');
  });
}

function tooltip(D, v, i, cob) {
  const dia = D.dias[i]; const x = v.d[i];
  let h = `<h4>Prefixo ${v.p} · ${dmy(dia)}</h4><div class="sutil" style="margin-bottom:.3rem">${esc(v.empresa)}</div>`;
  if (x == null) h += '<div>Sem registros neste dia.</div>';
  else if (x === 100) h += '<div class="lin"><span>Disponibilidade</span><strong>100%</strong></div><div>Todas as câmeras online, sem erro.</div>';
  else {
    const [a, m, , , , oh1, oh2, fh1, fh2, pf, po] = x;
    h += `<div class="lin"><span>Disponibilidade</span><strong>${fmtP(a)}</strong></div><div class="lin"><span>Online / erro / offline</span><span>${fmtP(a)} / ${fmtP(pf)} / ${fmtP(po)}</span></div>
      <div style="margin:.3rem 0 .1rem"><strong>${esc(NOME_MASC[m])}</strong></div>
      ${problemasDoDia(v, i).map((p) => `<div>• ${esc(camNome(p.c))}: ${esc(p.tipos.join(' e '))}${p.parcial ? ' (parte do dia)' : ''}</div>`).join('')}
      ${oh1 != null ? `<div class="lin"><span>Período offline</span><span>${oh1}h–${oh2 + 1}h</span></div>` : ''}${fh1 != null ? `<div class="lin"><span>Período com erro</span><span>${fh1}h–${fh2 + 1}h</span></div>` : ''}`;
  }
  (v.mv[i] || []).forEach((k) => { const e = D.eventos[k]; h += `<div style="margin-top:.3rem"><span class="ponto p-man"></span> Manutenção ${e.inicio.slice(11, 16)} — ${esc(e.tecnicos.join(', '))}</div>`; });
  if (cob && cob.horas < 24) h += `<div class="sutil" style="margin-top:.3rem">Dia parcial na base (${cob.horas} h com dados).</div>`;
  return h;
}
