// Problemas em aberto: há quanto tempo cada câmera está com problema (para a reunião de cronograma de correção).
import { F, prefixoOk } from '../main.js';
import { esc, camNome, cat, chip, codigoTxt, dmy, dmyh, dm, fmtN, fmtP, tabela, listaBarras } from '../util.js';
import { painelVeiculo } from '../painel.js';
import { exportarXlsx } from '../exportar.js';

const O = { soAtuais: true, minDias: 1, soContinuos: false, agrupar: 'camera' };

const tipoCat = (t) => (t.startsWith('Offline e') ? 'misto' : t.startsWith('Offline') ? 'of' : 'fa');
const tipoChip = (t) => chip(tipoCat(t) === 'of' ? 'of' : 'fa', t);

export function viewProblemas(el, D) {
  const m = D.meta.monitoramento;
  const ls = D.problemas.filter((s) => {
    const v = D.porPrefixo.get(s.prefixo);
    if (!prefixoOk(s.prefixo) || (F.empresa && s.empresa !== F.empresa) || (F.garagem && v?.g !== F.garagem) || (F.camera && s.camera !== Number(F.camera))) return false;
    if (F.de && s.ultimo_dia < F.de) return false;
    if (F.ate && s.inicio > F.ate) return false;
    if (F.status === 'of' && !s.n_off) return false;
    if (F.status === 'fa' && !s.n_falha) return false;
    if (F.status === 'ok') return false;
    if (O.soAtuais && !s.atual) return false;
    if (s.dias_corridos < O.minDias) return false;
    if (O.soContinuos && !s.continuo) return false;
    return true;
  });
  const veics = new Set(ls.map((s) => s.prefixo));
  const desdeInicio = ls.filter((s) => s.inicio_censurado).length;
  const porTipo = {}; ls.forEach((s) => { porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1; });
  const faixas = [['1–2 dias', 1, 2], ['3–6 dias', 3, 6], ['7–13 dias', 7, 13], ['14–20 dias', 14, 20], ['21+ dias', 21, 999]].map(([n, a, b]) => [n, ls.filter((s) => s.dias_corridos >= a && s.dias_corridos <= b).length]);
  el.innerHTML = `<section class="secao"><div class="cab-secao"><div><h2>Problemas em aberto</h2><p>Câmeras que estavam com problema no seu último dia com dados, e há quantos dias consecutivos isso vem acontecendo. Dia com problema = pelo menos um registro offline ou com erro de SD/gravação no dia. Dias sem nenhum registro no meio da sequência não a interrompem e aparecem em “dias sem dados”. Monitoramento disponível de ${dmyh(m.inicio)} a ${dmyh(m.fim)}: “desde 31/08” significa que o problema já existia no início dos dados.</p></div><button class="btn" id="exp">Exportar Excel</button></div>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:.8rem">
      <label class="sutil"><input type="checkbox" id="o-atuais" ${O.soAtuais ? 'checked' : ''}/> somente câmeras com registro no último dia (${dm(m.ultimo_dia)})</label>
      <label class="sutil"><input type="checkbox" id="o-cont" ${O.soContinuos ? 'checked' : ''}/> somente problema contínuo (nenhum registro online na sequência)</label>
      <label class="sutil">Mínimo de dias corridos <select class="ctl" id="o-min">${[1, 2, 3, 7, 14, 21].map((n) => `<option ${O.minDias === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="seg" id="o-agr"><button data-a="camera" class="${O.agrupar === 'camera' ? 'ativo' : ''}">Por câmera</button><button data-a="prefixo" class="${O.agrupar === 'prefixo' ? 'ativo' : ''}">Por prefixo</button></div>
    </div>
    <div class="grade g4">
      <div class="card kpi"><div class="rot">Câmeras com problema em aberto</div><div class="val">${fmtN(ls.length)}</div><div class="det">em ${fmtN(veics.size)} veículos</div></div>
      <div class="card kpi"><div class="rot"><span class="ponto p-of"></span>Há 7 dias ou mais</div><div class="val">${fmtN(ls.filter((s) => s.dias_corridos >= 7).length)}</div><div class="det">${fmtN(ls.filter((s) => s.dias_corridos >= 14).length)} há 14 dias ou mais</div></div>
      <div class="card kpi"><div class="rot">Desde o início dos dados</div><div class="val">${fmtN(desdeInicio)}</div><div class="det">já com problema em 31/08 — duração real pode ser maior</div></div>
      <div class="card kpi"><div class="rot">Normais no relatório ${dm(D.meta.relatorio?.data)}</div><div class="val">${fmtN(ls.filter((s) => s.relatorio_28 === 'N').length)}</div><div class="det">aparecem online sem erro no retrato de ${dmy(D.meta.relatorio?.data)} (verificar)</div></div>
    </div></section>
    <section class="secao grade g2"><div class="card"><h3>Tipo de problema</h3>${listaBarras(Object.entries(porTipo).sort((a, b) => b[1] - a[1]), { total: ls.length })}</div>
      <div class="card"><h3>Há quanto tempo (dias corridos)</h3>${listaBarras(faixas, { total: ls.length })}</div></section>
    <section class="secao"><div id="t"></div></section>`;
  el.querySelector('#o-atuais').addEventListener('change', (e) => { O.soAtuais = e.target.checked; viewProblemas(el, D); });
  el.querySelector('#o-cont').addEventListener('change', (e) => { O.soContinuos = e.target.checked; viewProblemas(el, D); });
  el.querySelector('#o-min').addEventListener('change', (e) => { O.minDias = Number(e.target.value); viewProblemas(el, D); });
  el.querySelectorAll('#o-agr button').forEach((b) => b.addEventListener('click', () => { O.agrupar = b.dataset.a; viewProblemas(el, D); }));
  const r28 = (s) => (s.relatorio_28 == null ? '<small>não consta</small>' : chip(cat(s.relatorio_28), s.relatorio_28 === '-' ? 'Sem câmera' : codigoTxt(s.relatorio_28)));
  let t;
  if (O.agrupar === 'camera') {
    t = tabela(el.querySelector('#t'), {
      linhas: ls, ordem: { k: 'dias_corridos', dir: -1 }, aoClicar: (s) => painelVeiculo(D, s.prefixo),
      cols: [
        { k: 'prefixo', t: 'Prefixo', r: (s) => `<strong>${s.prefixo}</strong>` },
        { k: 'empresa', t: 'Empresa' }, { k: 'garagem', t: 'Garagem', r: (s) => esc(s.garagem || '—') },
        { k: 'camera', t: 'Câmera', r: (s) => esc(camNome(s.camera)) },
        { k: 'tipo', t: 'Problema', r: (s) => tipoChip(s.tipo) },
        { k: 'desde', t: 'Desde', r: (s) => `${dmyh(s.desde)}${s.inicio_censurado ? ' <span class="chip c-nd" title="já estava com problema no primeiro dia disponível">início dos dados</span>' : ''}` },
        { k: 'dias_corridos', t: 'Dias corridos', num: true, dica: 'do primeiro ao último dia da sequência, contando o calendário' },
        { k: 'dias_com_problema', t: 'Dias c/ problema', num: true, dica: 'dias com pelo menos um registro com problema' },
        { k: 'dias_sem_dados', t: 'Dias sem dados', num: true },
        { k: 'pct_problema', t: '% registros c/ problema', num: true, r: (s) => fmtP(s.pct_problema) },
        { k: 'continuo', t: 'Contínuo', v: (s) => (s.continuo ? 1 : 0), r: (s) => (s.continuo ? 'sim' : '<small>intermitente</small>') },
        { k: 'ultimo_dia', t: 'Último dado', r: (s) => `${dmy(s.ultimo_dia)}${s.atual ? '' : ' <span class="chip c-nd">antigo</span>'}` },
        { k: 'relatorio_28', t: `Relatório ${dm(D.meta.relatorio?.data)}`, r: r28 },
        { k: 'ultima_manutencao', t: 'Última manutenção', r: (s) => (s.ultima_manutencao ? `${dmyh(s.ultima_manutencao)}${s.manutencao_durante.length ? ' <span class="chip c-man" title="houve manutenção depois do início do problema">durante</span>' : ''}` : '—') },
      ],
    });
  } else {
    const g = {};
    ls.forEach((s) => { (g[s.prefixo] = g[s.prefixo] || []).push(s); });
    const linhas = Object.entries(g).map(([p, xs]) => ({ prefixo: Number(p), empresa: xs[0].empresa, garagem: xs[0].garagem, n: xs.length, cams: xs.sort((a, b) => a.camera - b.camera),
      max: Math.max(...xs.map((x) => x.dias_corridos)), desde: xs.map((x) => x.desde).sort()[0], off: xs.filter((x) => x.n_off).length, fa: xs.filter((x) => x.n_falha).length,
      todas: (D.porPrefixo.get(Number(p))?.c.length || 0) === xs.length, ult: xs[0].ultima_manutencao }));
    t = tabela(el.querySelector('#t'), {
      linhas, ordem: { k: 'max', dir: -1 }, aoClicar: (s) => painelVeiculo(D, s.prefixo),
      cols: [
        { k: 'prefixo', t: 'Prefixo', r: (s) => `<strong>${s.prefixo}</strong>` }, { k: 'empresa', t: 'Empresa' }, { k: 'garagem', t: 'Garagem', r: (s) => esc(s.garagem || '—') },
        { k: 'n', t: 'Câmeras c/ problema', num: true, r: (s) => `${s.n}${s.todas ? ' <small>(todas)</small>' : ''}` },
        { k: 'cams', t: 'Câmeras e problema', ord: false, r: (s) => s.cams.map((x) => `<span class="chip ${tipoCat(x.tipo) === 'of' ? 'c-of' : 'c-fa'}" title="${esc(`${x.tipo} desde ${dmyh(x.desde)}`)}">${x.camera} · ${x.dias_corridos}d</span>`).join(' ') },
        { k: 'max', t: 'Maior duração (dias)', num: true }, { k: 'desde', t: 'Problema mais antigo desde', r: (s) => dmyh(s.desde) },
        { k: 'ult', t: 'Última manutenção', r: (s) => dmyh(s.ult) },
      ],
    });
  }
  el.querySelector('#exp').addEventListener('click', () => exportarXlsx('problemas_em_aberto', {
    'Problemas em aberto': (O.agrupar === 'camera' ? t.linhasOrdenadas() : ls).map((s) => ({
      Prefixo: s.prefixo, Empresa: s.empresa, Garagem: s.garagem || '', Câmera: camNome(s.camera), Problema: s.tipo, Desde: dmyh(s.desde), 'Início dos dados?': s.inicio_censurado ? 'sim' : '',
      'Dias corridos': s.dias_corridos, 'Dias com problema': s.dias_com_problema, 'Dias sem dados': s.dias_sem_dados, '% registros com problema': s.pct_problema, Contínuo: s.continuo ? 'sim' : 'intermitente',
      'Último dia com dado': dmy(s.ultimo_dia), [`Relatório ${dm(D.meta.relatorio?.data)}`]: s.relatorio_28 == null ? 'não consta' : codigoTxt(s.relatorio_28), 'Última manutenção': s.ultima_manutencao ? dmyh(s.ultima_manutencao) : '',
    })),
  }, 'Problemas em aberto (duração da sequência atual de dias com problema)'));
}
