// Manutenções (formulário): precisava? resolveu? problemas relatados e ações realizadas.
import { F, prefixoOk } from '../main.js';
import { esc, camNome, dmy, dmyh, fmtN, fmtP, pct, tabela, listaBarras, horas } from '../util.js';
import { painelManutencao, precisaChip, resChip } from '../painel.js';
import { exportarXlsx } from '../exportar.js';

const O = { precisava: '', resultado: '', tecnico: '' };
const RESULTADOS = ['Resolvido', 'Resolvido com recorrência', 'Parcialmente resolvido', 'Não resolvido', 'Sem problema antes', 'Sem dados para avaliar'];

export function viewManutencoes(el, D) {
  const cam = F.camera ? Number(F.camera) : null;
  const E = D.eventos.filter((e) => {
    const v = D.porPrefixo.get(e.prefixo);
    if (!prefixoOk(e.prefixo) || (F.empresa && e.empresa !== F.empresa) || (F.garagem && !e.garagens.includes(F.garagem) && v?.g !== F.garagem)) return false;
    if (cam && !e.cameras_formulario.includes(cam) && !(e.cameras || []).some((c) => c.camera === cam && c.problema_antes)) return false;
    if (F.de && e.data < F.de) return false;
    if (F.ate && e.data > F.ate) return false;
    if (O.precisava && e.precisava !== O.precisava) return false;
    if (O.resultado && e.resultado !== O.resultado) return false;
    if (O.tecnico && !e.tecnicos.includes(O.tecnico)) return false;
    return true;
  });
  const forms = E.flatMap((e) => e.forms.map((id) => D.formPorId.get(id))).filter(Boolean);
  const cont = (arr) => { const c = {}; arr.forEach((x) => { c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  const itensProb = forms.flatMap((f) => f.posicoes.flatMap((p) => p.problemas.map((i) => i.item)));
  const itensAcao = forms.flatMap((f) => f.posicoes.flatMap((p) => p.acoes.map((i) => i.item)));
  const catProb = forms.flatMap((f) => f.posicoes.flatMap((p) => p.problemas.map((i) => i.categoria)));
  const precisa = cont(E.map((e) => e.precisava));
  const res = Object.fromEntries(cont(E.map((e) => e.resultado)));
  const sim = E.filter((e) => e.precisava === 'Sim');
  const avaliaveis = sim.filter((e) => e.resultado !== 'Sem dados para avaliar');
  const resolvidos = sim.filter((e) => e.resultado === 'Resolvido' || e.resultado === 'Resolvido com recorrência').length;
  const pm = D.meta.formulario;
  const probAntes = (e) => (e.cameras || []).filter((c) => c.problema_antes);
  el.innerHTML = `<section class="secao"><div class="cab-secao"><div><h2>Manutenções</h2><p>Visitas registradas no formulário (${esc(pm.arquivo)}), comparadas com o monitoramento horário. <strong>Precisava?</strong> = havia registro offline ou com erro nas ${D.meta.janela_antes_h} h anteriores ao horário da visita. <strong>Resolveu?</strong> = as câmeras com problema antes voltaram a ficar online sem erro depois da visita (até a visita seguinte do mesmo prefixo ou o fim dos dados, ${dmyh(D.meta.monitoramento.fim)}). Visitas de agosto são anteriores ao início do monitoramento (31/08 21h) e ficam “sem dados”.</p></div><button class="btn" id="exp">Exportar Excel</button></div>
    <div style="display:flex;gap:.8rem;flex-wrap:wrap;margin-bottom:.8rem">
      <label class="sutil">Precisava? <select class="ctl" id="o-prec"><option value="">Todos</option>${['Sim', 'Não', 'Sem dados'].map((x) => `<option ${O.precisava === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="sutil">Resultado <select class="ctl" id="o-res"><option value="">Todos</option>${RESULTADOS.map((x) => `<option ${O.resultado === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="sutil">Técnico <select class="ctl" id="o-tec"><option value="">Todos</option>${D.tecnicos.map((x) => `<option ${O.tecnico === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    </div>
    <div class="grade g4">
      <div class="card kpi"><div class="rot"><span class="ponto p-man"></span>Visitas (prefixo + dia)</div><div class="val">${fmtN(E.length)}</div><div class="det">${fmtN(forms.length)} formulários · ${fmtN(new Set(E.map((e) => e.prefixo)).size)} veículos</div></div>
      <div class="card kpi"><div class="rot">Precisavam de manutenção</div><div class="val">${fmtN(sim.length)}</div><div class="det">${fmtN(E.filter((e) => e.precisava === 'Não').length)} com CFTV normal antes · ${fmtN(E.filter((e) => e.precisava === 'Sem dados').length)} sem dados antes</div></div>
      <div class="card kpi"><div class="rot"><span class="ponto p-ok"></span>Normalizaram após a visita</div><div class="val">${fmtN(resolvidos)}</div><div class="det">${fmtP(pct(resolvidos, avaliaveis.length))} das ${fmtN(avaliaveis.length)} avaliáveis que precisavam · ${fmtN(res.Resolvido || 0)} sem voltar a falhar, ${fmtN(res['Resolvido com recorrência'] || 0)} voltaram a falhar</div></div>
      <div class="card kpi"><div class="rot"><span class="ponto p-of"></span>Não resolvidas / parciais</div><div class="val">${fmtN((res['Não resolvido'] || 0) + (res['Parcialmente resolvido'] || 0))}</div><div class="det">${fmtN(res['Não resolvido'] || 0)} não resolvidas · ${fmtN(res['Parcialmente resolvido'] || 0)} parciais</div></div>
    </div></section>
    <section class="secao grade g2">
      <div class="card"><h3>Resultado</h3>${listaBarras(RESULTADOS.map((r) => [r, res[r] || 0]), { total: E.length })}<p class="nota">Precisava? ${precisa.map(([k, v]) => `${esc(k)}: ${fmtN(v)}`).join(' · ')}. Das ${fmtN(sim.length)} visitas que precisavam, ${fmtN(sim.filter((e) => e.cameras_formulario.some((c) => probAntes(e).some((x) => x.camera === c))).length)} citam no formulário ao menos uma câmera que o monitoramento mostrava com problema. ${fmtN(E.filter((e) => e.precisava === 'Não' && e.problemas.length).length)} visitas com CFTV normal antes registraram problema no formulário (ex.: posicionamento/configuração, que o monitoramento não detecta).</p></div>
      <div class="card"><h3>Problemas relatados (por câmera/posição)</h3>${listaBarras(cont(itensProb).slice(0, 12), { cls: 'b-fa', total: itensProb.length })}<p class="nota">Cada problema citado em cada posição conta uma vez; uma célula com vários problemas é separada. Categorias: ${cont(catProb).map(([k, v]) => `${esc(k)} ${fmtN(v)}`).join(' · ')}</p></div>
      <div class="card"><h3>Ações realizadas</h3>${listaBarras(cont(itensAcao).slice(0, 12), { total: itensAcao.length })}</div>
      <div class="card"><h3>Posições citadas no formulário</h3>${listaBarras(cont(forms.flatMap((f) => f.posicoes.filter((p) => p.problemas.length || p.acoes.length).map((p) => (p.camera ? camNome(p.camera) : p.posicao)))), { total: forms.length })}<p class="nota">% = formulários que citam a posição.</p></div>
    </section>
    <section class="secao"><h3>Visitas</h3><p class="nota">Clique para ver antes × depois por câmera, linha do tempo e o texto original do formulário.</p><div id="t"></div></section>`;
  el.querySelector('#o-prec').addEventListener('change', (e) => { O.precisava = e.target.value; viewManutencoes(el, D); });
  el.querySelector('#o-res').addEventListener('change', (e) => { O.resultado = e.target.value; viewManutencoes(el, D); });
  el.querySelector('#o-tec').addEventListener('change', (e) => { O.tecnico = e.target.value; viewManutencoes(el, D); });
  const normalizou = (e) => probAntes(e).map((c) => c.depois?.horas_ate_normalizar).filter((x) => x != null);
  const t = tabela(el.querySelector('#t'), {
    linhas: E, ordem: { k: 'inicio', dir: -1 }, aoClicar: (e) => painelManutencao(D, e),
    cols: [
      { k: 'inicio', t: 'Data/hora', r: (e) => dmyh(e.inicio) },
      { k: 'prefixo', t: 'Prefixo', r: (e) => `<strong>${e.prefixo}</strong>` },
      { k: 'empresa', t: 'Empresa' }, { k: 'garagem', t: 'Garagem' },
      { k: 'tecnicos', t: 'Técnico(s)', v: (e) => e.tecnicos.join(', '), r: (e) => esc(e.tecnicos.join(', ')) },
      { k: 'cf', t: 'Câmeras no formulário', v: (e) => e.cameras_formulario.join(','), r: (e) => esc(e.cameras_formulario.join(', ') || '—') },
      { k: 'problemas', t: 'Problemas relatados', w: 180, v: (e) => e.problemas.join(', '), r: (e) => esc(e.problemas.join('; ') || '—') },
      { k: 'acoes', t: 'Ações', w: 180, v: (e) => e.acoes.join(', '), r: (e) => esc(e.acoes.join('; ') || '—') },
      { k: 'precisava', t: 'Precisava?', r: (e) => precisaChip(e.precisava) },
      { k: 'pa', t: 'Problema antes (CFTV)', v: (e) => probAntes(e).length, r: (e) => esc(probAntes(e).map((c) => `${c.camera} ${c.antes.tipo}`).join('; ') || '—') },
      { k: 'resultado', t: 'Resultado', r: (e) => resChip(e.resultado) },
      { k: 'hn', t: 'Tempo até normalizar', num: true, v: (e) => (normalizou(e).length ? Math.max(...normalizou(e)) : null), r: (e) => (normalizou(e).length ? horas(Math.max(...normalizou(e))) : '—') },
      { k: 'novo', t: 'Problema novo', v: (e) => e.novo_problema?.length || 0, r: (e) => (e.novo_problema?.length ? esc(e.novo_problema.join(', ')) : '—') },
      { k: 'pendencia', t: 'Pendência', v: (e) => (e.pendencia ? 1 : 0), r: (e) => (e.pendencia ? '<span class="chip c-fa">sim</span>' : '') },
    ],
  });
  el.querySelector('#exp').addEventListener('click', () => exportarXlsx('manutencoes', {
    Visitas: t.linhasOrdenadas().map((e) => ({
      'Data/hora': dmyh(e.inicio), Prefixo: e.prefixo, Empresa: e.empresa, Garagem: e.garagem, 'Técnico(s)': e.tecnicos.join(', '), Formulários: e.forms.length,
      'Câmeras no formulário': e.cameras_formulario.join(', '), 'Problemas relatados': e.problemas.join('; '), Ações: e.acoes.join('; '), 'Precisava?': e.precisava,
      'Câmeras com problema antes (CFTV)': probAntes(e).map((c) => `${c.camera} ${c.antes.tipo}`).join('; '), Resultado: e.resultado, Motivo: e.motivo,
      'Normalizou em': probAntes(e).map((c) => (c.depois?.normalizou_em ? `${c.camera}: ${dmyh(c.depois.normalizou_em)}` : '')).filter(Boolean).join('; '),
      'Voltou a falhar em': probAntes(e).map((c) => (c.depois?.voltou_em ? `${c.camera}: ${dmyh(c.depois.voltou_em)}` : '')).filter(Boolean).join('; '),
      'Problema novo (câmeras)': (e.novo_problema || []).join(', '), Pendência: e.pendencia ? 'sim' : '',
    })),
    'Itens por posição': forms.flatMap((f) => f.posicoes.flatMap((p) => [...p.problemas.map((i) => ['Problema', i]), ...p.acoes.map((i) => ['Ação', i])].map(([tipo, i]) => ({
      Prefixo: f.prefixo, 'Data/hora': dmyh(f.datahora), Técnico: f.tecnico, Posição: p.posicao, Câmera: p.camera || '', Tipo: tipo, Item: i.item, Categoria: i.categoria, 'Linha na planilha': f.linha_excel,
    })))),
  }, 'Manutenções × monitoramento'));
}
