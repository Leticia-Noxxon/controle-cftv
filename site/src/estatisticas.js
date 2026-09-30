// Página 2 — Estatísticas: ranking de conexão das câmeras (monitoramento) e ranking de manutenção (formulário).
import { F, barraFiltros } from './main.js';
import { D, veiculosFiltrados, faixaDias, tempos, ultimoCodigo, empresaPassa, fmtN, fmtP, esc } from './dados.js';

export function paginaEstatisticas(app) {
  app.innerHTML = `<section id="p2-filtros"></section><section class="estat">
    <div class="card painel-e"><div class="ph"><div><h2>Ranking de conexão das câmeras</h2><div class="sub">Ordenado pela menor disponibilidade de conexão no período</div></div></div><div id="p2-conexao"></div></div>
    <div class="card painel-e"><div class="ph"><div><h2>Ranking de manutenção</h2><div class="sub">Visitas do formulário de manutenção, por garagem, ordenadas pelo número de visitas</div></div></div><div id="p2-manut"></div></div></section>`;
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

// Manutenção (formulário + análise antes/depois já calculada no pipeline), por garagem do formulário.
// % precisava = visitas com problema nas 24 h anteriores ÷ visitas avaliáveis (Sim + Não).
// % resolvido = (Resolvido + Resolvido com recorrência) ÷ visitas que precisavam e têm dados depois.
const AVALIADO = new Set(['Resolvido', 'Resolvido com recorrência', 'Parcialmente resolvido', 'Não resolvido']);
const RESOLVIDO = new Set(['Resolvido', 'Resolvido com recorrência']);
function manutencao() {
  const g = new Map();
  D.manut.forEach((m) => {
    if (F.de && m.d < F.de) return;
    if (F.ate && m.d > F.ate) return;
    if (F.camera && !(m.cams || []).map(String).includes(F.camera)) return;
    if (F.empresa) { const v = D.porPrefixo.get(Number(m.p)); if (!v || !empresaPassa(v.empresa, F.empresa)) return; }
    const nome = m.g || 'Não informado';
    const r = g.get(nome) || { nome, visitas: 0, veic: new Set(), sim: 0, aval: 0, resolv: 0, avalRes: 0 };
    r.visitas += 1; r.veic.add(m.p);
    if (m.pr === 'Sim' || m.pr === 'Não') { r.aval += 1; if (m.pr === 'Sim') r.sim += 1; }
    if (AVALIADO.has(m.rs)) { r.avalRes += 1; if (RESOLVIDO.has(m.rs)) r.resolv += 1; }
    g.set(nome, r);
  });
  const pc = (a, b) => (b ? fmtP((100 * a) / b) : '—');
  const rows = [...g.values()].sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome, 'pt-BR'));
  document.getElementById('p2-manut').innerHTML = rows.length ? `<table class="rk"><thead><tr><th>#</th><th>Garagem</th><th class="n">Visitas</th><th class="n">Veículos visitados</th>
      <th class="n" title="Visitas com câmera offline ou com erro nas 24 h anteriores ÷ visitas com dados de monitoramento antes">% precisava</th>
      <th class="n" title="Resolvido + Resolvido com recorrência ÷ visitas que precisavam e têm dados depois">% resolvido</th></tr></thead>
    <tbody>${rows.map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r.nome)}</td><td class="n">${fmtN(r.visitas)}</td><td class="n">${fmtN(r.veic.size)}</td>
      <td class="n" title="${r.sim} de ${r.aval}">${pc(r.sim, r.aval)}</td><td class="n" title="${r.resolv} de ${r.avalRes}">${pc(r.resolv, r.avalRes)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="vazio">Nenhuma visita para os filtros.</div>';
}
