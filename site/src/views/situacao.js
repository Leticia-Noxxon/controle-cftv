// Situação atual: câmeras online / erro SD / offline — geral, por câmera e por prefixo.
import { F, veiculosFiltrados } from '../main.js';
import { esc, CAMS, camNome, cat, chip, codigoTxt, dmy, dmyh, dm, fmtN, fmtP, pct, barra, tabela } from '../util.js';
import { painelVeiculo } from '../painel.js';
import { exportarXlsx } from '../exportar.js';

let fonte = 'mon';
let incluirDesatualizadas = true;

function estadosVeiculo(D, v) {
  const cams = v.c.filter((c) => !F.camera || c === Number(F.camera));
  const out = [];
  cams.forEach((c) => {
    if (fonte === 'mon') {
      const u = v.ult[c];
      if (!u || (!incluirDesatualizadas && u.desatualizado)) return;
      out.push({ c, cat: u.cat, code: u.code, ts: u.ts, velho: u.desatualizado });
    }
  });
  if (fonte === 'rel' && v.r) {
    Object.entries(v.r).forEach(([c, code]) => {
      c = Number(c);
      if (code === '-' || (F.camera && c !== Number(F.camera))) return;
      out.push({ c, cat: cat(code), code });
    });
  }
  return out;
}

export function viewSituacao(el, D) {
  const m = D.meta.monitoramento; const rel = D.meta.relatorio;
  const vs = veiculosFiltrados();
  const linhas = [];
  const porCam = {}; const tot = { ok: 0, fa: 0, of: 0, nd: 0 }; let velhas = 0;
  const veicCat = { ok: 0, parcial: 0, of: 0 };
  vs.forEach((v) => {
    const est = estadosVeiculo(D, v);
    if (!est.length) return;
    const n = { ok: 0, fa: 0, of: 0, nd: 0 };
    est.forEach((e) => {
      n[e.cat] = (n[e.cat] || 0) + 1;
      porCam[e.c] = porCam[e.c] || { ok: 0, fa: 0, of: 0, nd: 0, velho: 0 };
      porCam[e.c][e.cat] += 1;
      if (e.velho) { porCam[e.c].velho += 1; velhas += 1; }
    });
    const k = n.fa + n.of === 0 ? 'ok' : n.ok + n.fa === 0 ? 'of' : 'parcial';
    const st = F.status;
    if (st && !((st === 'problema' && k !== 'ok') || (st === 'ok' && k === 'ok') || (st === 'fa' && n.fa) || (st === 'of' && n.of))) return;
    Object.keys(tot).forEach((x) => { tot[x] += n[x] || 0; });
    veicCat[k] += 1;
    linhas.push({ p: v.p, empresa: v.empresa, g: v.g || '', est, ok: n.ok, fa: n.fa, of: n.of, total: est.length, sit: k, ul: fonte === 'mon' ? v.ul : null, velho: est.some((e) => e.velho) });
  });
  const totCam = tot.ok + tot.fa + tot.of;
  const titulo = fonte === 'mon' ? `Último registro de cada câmera no monitoramento horário (até ${dmyh(m.fim)})` : `Relatório CFTV de ${dmy(rel?.data)} (retrato do dia)`;
  el.innerHTML = `<section class="secao"><div class="cab-secao"><div><h2>Situação atual das câmeras</h2><p>${esc(titulo)}. Cada câmera entra com o seu estado mais recente. ${fonte === 'mon' ? 'O filtro de datas não se aplica aqui.' : `“-” no relatório = câmera não instalada (não conta). Só entram prefixos que também estão no monitoramento (${D.meta.relatorio?.prefixos_sem_monitoramento ?? 0} prefixos do relatório ficam de fora).`}</p></div>
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap"><div class="seg" id="fonte"><button data-f="mon" class="${fonte === 'mon' ? 'ativo' : ''}">Monitoramento (até ${dm(m.ultimo_dia)})</button>${rel ? `<button data-f="rel" class="${fonte === 'rel' ? 'ativo' : ''}">Relatório ${dm(rel.data)}</button>` : ''}</div>
      ${fonte === 'mon' ? `<label class="sutil" style="font-size:.8rem"><input type="checkbox" id="chk-velhas" ${incluirDesatualizadas ? 'checked' : ''}/> incluir câmeras sem registro em ${dm(m.ultimo_dia)}</label>` : ''}</div></div>
    <div class="grade g4">
      ${kpi('p-ok', 'Câmeras online', tot.ok, totCam, 'online, com SD e gravação ok')}
      ${kpi('p-fa', 'Erro de cartão SD', tot.fa, totCam, 'online, mas com SD e gravação em erro')}
      ${kpi('p-of', 'Câmeras offline', tot.of, totCam, fonte === 'mon' ? 'sem comunicação no último registro' : 'OFFLINE no relatório')}
      <div class="card kpi"><div class="rot">Câmeras / veículos</div><div class="val">${fmtN(totCam)}</div><div class="det">${fmtN(linhas.length)} veículos: ${fmtN(veicCat.ok)} com todas OK · ${fmtN(veicCat.parcial)} com alguma câmera com problema · ${fmtN(veicCat.of)} com todas offline</div></div>
    </div>
    ${fonte === 'mon' && velhas ? `<p class="nota">${fmtN(velhas)} câmera(s) não têm registro em ${dmy(m.ultimo_dia)}; para elas vale o último estado conhecido (data mostrada na tabela).</p>` : ''}
    </section>
    <section class="secao grade g2">
      <div class="card"><h3>Por câmera</h3><div id="t-cam"></div></div>
      <div class="card"><h3>Situação dos veículos</h3>${barra([[veicCat.ok, 'b-ok', 'Todas OK'], [veicCat.parcial, 'b-fa', 'Alguma câmera com problema'], [veicCat.of, 'b-of', 'Todas offline']])}
        <div class="legenda" style="margin-top:.5rem"><span><span class="ponto p-ok"></span> Todas as câmeras OK: ${fmtN(veicCat.ok)} (${fmtP(pct(veicCat.ok, linhas.length))})</span><span><span class="ponto p-fa"></span> Alguma câmera com problema: ${fmtN(veicCat.parcial)} (${fmtP(pct(veicCat.parcial, linhas.length))})</span><span><span class="ponto p-of"></span> Todas offline: ${fmtN(veicCat.of)} (${fmtP(pct(veicCat.of, linhas.length))})</span></div>
        <p class="nota">“Todas offline” = todas as câmeras do veículo offline no estado mais recente. Veículo com câmeras offline e outras online/erro entra em “alguma câmera com problema”.</p></div>
    </section>
    <section class="secao"><div class="cab-secao"><div><h3>Por prefixo</h3><p>Clique em uma linha para ver o veículo. Ordene clicando nos títulos.</p></div><button class="btn" id="exp">Exportar Excel</button></div><div id="t-pref"></div></section>`;
  el.querySelectorAll('#fonte button').forEach((b) => b.addEventListener('click', () => { fonte = b.dataset.f; viewSituacao(el, D); }));
  el.querySelector('#chk-velhas')?.addEventListener('change', (e) => { incluirDesatualizadas = e.target.checked; viewSituacao(el, D); });
  const camRows = Object.entries(porCam).map(([c, x]) => ({ c: Number(c), ...x, total: x.ok + x.fa + x.of })).sort((a, b) => a.c - b.c);
  tabela(el.querySelector('#t-cam'), {
    linhas: camRows, porPagina: 20,
    cols: [
      { k: 'c', t: 'Câmera', r: (r) => esc(camNome(r.c)), v: (r) => r.c },
      { k: 'total', t: 'Total', num: true, r: (r) => fmtN(r.total) },
      { k: 'ok', t: 'Online', num: true, r: (r) => fmtN(r.ok) },
      { k: 'fa', t: 'Erro SD', num: true, r: (r) => fmtN(r.fa) },
      { k: 'of', t: 'Offline', num: true, r: (r) => fmtN(r.of) },
      { k: 'pok', t: '% online', num: true, v: (r) => pct(r.ok, r.total), r: (r) => fmtP(pct(r.ok, r.total)) },
      { k: 'b', t: 'Distribuição', ord: false, r: (r) => barra([[r.ok, 'b-ok', 'Online'], [r.fa, 'b-fa', 'Erro SD'], [r.of, 'b-of', 'Offline']]) },
    ],
  });
  const SIT = { ok: chip('ok', 'Todas OK'), parcial: chip('fa', 'Alguma com problema'), of: chip('of', 'Todas offline') };
  const cols = [
    { k: 'p', t: 'Prefixo', num: false, v: (r) => r.p, r: (r) => `<strong>${r.p}</strong>` },
    { k: 'empresa', t: 'Empresa' },
    { k: 'g', t: 'Garagem', r: (r) => esc(r.g || '—') },
    { k: 'sit', t: 'Situação', v: (r) => ({ of: 0, parcial: 1, ok: 2 }[r.sit]), r: (r) => SIT[r.sit] },
    { k: 'cams', t: 'Câmeras', ord: false, r: (r) => `<span class="cams">${r.est.map((e) => `<span class="cam ${e.cat === 'ok' ? 'c-ok' : e.cat === 'fa' ? 'c-fa' : e.cat === 'of' ? 'c-of' : 'c-nd'}" title="${esc(`${camNome(e.c)}: ${codigoTxt(e.code)}${e.ts ? ` · ${dmyh(e.ts)}` : ''}`)}">${e.c > 26 ? 'id' : e.c}</span>`).join('')}</span>` },
    { k: 'ok', t: 'Online', num: true }, { k: 'fa', t: 'Erro SD', num: true }, { k: 'of', t: 'Offline', num: true },
  ];
  if (fonte === 'mon') cols.push({ k: 'ul', t: 'Último registro', r: (r) => `${dmyh(r.ul)}${r.velho ? ' <span class="chip c-nd" title="alguma câmera sem registro no último dia">antigo</span>' : ''}` });
  const t = tabela(el.querySelector('#t-pref'), { linhas, cols, ordem: { k: 'of', dir: -1 }, aoClicar: (r) => painelVeiculo(D, r.p) });
  el.querySelector('#exp').addEventListener('click', () => exportarXlsx(`situacao_atual_${fonte}`, {
    'Por prefixo': t.linhasOrdenadas().map((r) => ({ Prefixo: r.p, Empresa: r.empresa, Garagem: r.g, Situação: { ok: 'Todas OK', parcial: 'Alguma câmera com problema', of: 'Todas offline' }[r.sit], Online: r.ok, 'Erro SD': r.fa, Offline: r.of,
      ...Object.fromEntries(CAMS.map((c) => { const e = r.est.find((x) => x.c === c); return [`Câm ${c}`, e ? codigoTxt(e.code) : '']; })), 'Último registro': r.ul || '' })),
    'Por câmera': camRows.map((r) => ({ Câmera: camNome(r.c), Total: r.total, Online: r.ok, 'Erro SD': r.fa, Offline: r.of })),
  }, titulo));
}

function kpi(p, rot, v, tot, det) {
  return `<div class="card kpi"><div class="rot"><span class="ponto ${p}"></span>${esc(rot)}</div><div class="val">${fmtN(v)}</div><div class="det">${fmtP(pct(v, tot))} das câmeras · ${esc(det)}</div></div>`;
}
