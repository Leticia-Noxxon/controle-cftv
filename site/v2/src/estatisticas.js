// Página 2 — Estatísticas: ranking de conexão das câmeras (monitoramento) e ranking de manutenção (formulário).
import { F, barraFiltros } from './main.js';
import { D, veiculosFiltrados, faixaDias, tempos, ultimoCodigo, empresaPassa, fmtN, fmtP, esc } from './dados.js';

export function paginaEstatisticas(app) {
  app.innerHTML = `<section id="p2-filtros"></section><section class="estat">
    <div class="card painel-e"><div class="ph"><div><h2>Ranking de conexão das câmeras</h2><div class="sub">Ordenado pela menor disponibilidade de conexão no período</div></div></div><div id="p2-conexao"></div></div>
    <div class="card painel-e"><div class="ph"><div><h2>Ranking de manutenção</h2><div class="sub">Nº de veículos · reincidência = 2+ dias · precisavam = falha no dia da visita ou no anterior · resolvidos = sem recorrência</div></div></div><div id="p2-manut"></div></div></section>`;
  barraFiltros(app.querySelector('#p2-filtros'), { prefixo: false }, atualizar);
  window.onresize = null;
  atualizar();
}

function atualizar() {
  conexao();
  manutencao();
}

// Conexão (somente monitoramento): por empresa real. Disponibilidade = tempo online ÷ tempo monitorado (sem "Sem dados").
// Câmeras/veículos com falha = mesma definição dos cards (último registro da câmera no período com erro de SD ou offline).
function conexao() {
  const vs = veiculosFiltrados(F, false);
  const dias = faixaDias(F);
  const cam = F.camera || null;
  const g = new Map();
  vs.forEach((v) => {
    let ok = 0, mon = 0, camsFalha = 0;
    dias.forEach((i) => { const [a, b, c] = tempos(v, i, cam); ok += a; mon += a + b + c; });
    (cam ? [Number(cam)] : v.c).forEach((c) => { const x = ultimoCodigo(v, c, dias); if (x && x !== 'N') camsFalha += 1; });
    const r = g.get(v.empresa) || { nome: v.empresa, ok: 0, mon: 0, camsFalha: 0, veicFalha: 0, veic: 0 };
    r.ok += ok; r.mon += mon; r.camsFalha += camsFalha; r.veicFalha += camsFalha ? 1 : 0; r.veic += 1;
    g.set(v.empresa, r);
  });
  const disp = (r) => (r.mon ? (100 * r.ok) / r.mon : null);
  const rows = [...g.values()].sort((a, b) => (disp(a) ?? 101) - (disp(b) ?? 101) || a.nome.localeCompare(b.nome, 'pt-BR'));
  document.getElementById('p2-conexao').innerHTML = rows.length ? `<table class="rk"><thead><tr><th>#</th><th>Empresa</th>
      <th title="Tempo online ÷ tempo monitorado no período (sem contar Sem dados)">Disponibilidade</th>
      <th class="n" title="Câmeras cujo último registro no período é offline ou com erro de SD">Câmeras com falha</th>
      <th class="n" title="Veículos com pelo menos uma câmera com falha no último registro do período">Veículos com falha</th></tr></thead>
    <tbody>${rows.map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r.nome)}</td><td><div class="bar"><span><i style="width:${disp(r) ?? 0}%"></i></span><em>${fmtP(disp(r))}</em></div></td>
      <td class="n">${fmtN(r.camsFalha)}</td><td class="n">${fmtN(r.veicFalha)} <span class="sub">de ${fmtN(r.veic)}</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="vazio">Sem dados para os filtros.</div>';
}

// Manutenção (formulário + análise antes/depois do pipeline), contagem de VEÍCULOS (prefixos distintos) por garagem.
// Cada veículo entra na garagem do seu formulário mais recente no período (a linha Total é a soma, sem duplicar).
// Com manutenção = ao menos uma visita; Com reincidência = visitas em 2+ dias diferentes (visita = prefixo + dia);
// Precisavam = ao menos uma visita com precisava = 'Sim' (câmera offline/erro de SD do início do dia anterior até a visita);
// Resolvidos = dos que precisavam, a última visita com precisava = 'Sim' teve resultado 'Resolvido'
// ('Resolvido com recorrência' NÃO conta).
function manutencao() {
  const porP = new Map();
  D.manut.forEach((m) => {
    if (F.de && m.d < F.de) return;
    if (F.ate && m.d > F.ate) return;
    if (F.camera && !(m.cams || []).map(String).includes(F.camera)) return;
    if (F.empresa) { const v = D.porPrefixo.get(Number(m.p)); if (!v || !empresaPassa(v.empresa, F.empresa)) return; }
    if (!porP.has(m.p)) porP.set(m.p, []);
    porP.get(m.p).push(m);
  });
  const g = new Map();
  const tot = { nome: 'Total', com: 0, reinc: 0, prec: 0, resolv: 0 };
  porP.forEach((vs) => {
    vs.sort((a, b) => (a.d + a.h).localeCompare(b.d + b.h));
    const nome = vs[vs.length - 1].g || 'Não informado';
    const r = g.get(nome) || { nome, com: 0, reinc: 0, prec: 0, resolv: 0 };
    const dias = new Set(vs.map((m) => m.d));
    const precisou = vs.filter((m) => m.pr === 'Sim');
    const x = { com: 1, reinc: dias.size > 1 ? 1 : 0, prec: precisou.length ? 1 : 0, resolv: precisou.length && precisou[precisou.length - 1].rs === 'Resolvido' ? 1 : 0 };
    Object.keys(x).forEach((k) => { r[k] += x[k]; tot[k] += x[k]; });
    g.set(nome, r);
  });
  const rows = [...g.values()].sort((a, b) => b.com - a.com || a.nome.localeCompare(b.nome, 'pt-BR'));
  const td = (r) => `<td class="n">${fmtN(r.com)}</td><td class="n">${fmtN(r.reinc)}</td><td class="n">${fmtN(r.prec)}</td><td class="n">${fmtN(r.resolv)}</td>`;
  document.getElementById('p2-manut').innerHTML = rows.length ? `<table class="rk"><thead><tr><th>Garagem</th>
      <th class="n" title="Veículos (prefixos distintos) com ao menos uma manutenção no período">Com manutenção</th>
      <th class="n" title="Veículos com manutenção em dois ou mais dias diferentes no período">Reincidentes</th>
      <th class="n" title="Veículos com câmera offline ou com erro de SD no dia da visita (antes do horário) ou no dia anterior">Precisavam</th>
      <th class="n" title="Dos que precisavam: última visita necessária com todas as câmeras normalizadas depois e sem nova falha ('Resolvido com recorrência' não conta)">Resolvidos</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.nome)}</td>${td(r)}</tr>`).join('')}<tr class="total"><td>Total</td>${td(tot)}</tr></tbody></table>`
    : '<div class="vazio">Nenhuma visita para os filtros.</div>';
}
