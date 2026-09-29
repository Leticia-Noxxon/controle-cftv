// Análises por câmera, empresa, garagem e técnico (sem ranking de técnicos: ordem alfabética).
import { F, veiculosFiltrados } from '../main.js';
import { esc, camNome, fmtN, fmtP, pct, barra, tabela } from '../util.js';

export function viewAnalises(el, D) {
  const vs = veiculosFiltrados();
  const cam = F.camera ? Number(F.camera) : null;
  const porCam = {}; const porEmp = {}; const porGar = {};
  const soma = (o, k, m, v, probAtual) => {
    const x = (o[k] = o[k] || { k, n: 0, ok: 0, f: 0, o: 0, veic: new Set(), cams: 0, abertos: 0 });
    x.n += m[0]; x.ok += m[1]; x.f += m[2]; x.o += m[3]; x.veic.add(v.p); x.cams += 1; x.abertos += probAtual ? 1 : 0;
  };
  vs.forEach((v) => Object.entries(v.cm).forEach(([c, m]) => {
    c = Number(c); if (cam && c !== cam) return;
    const u = v.ult[c]; const prob = u && u.cat !== 'ok';
    soma(porCam, c, m, v, prob); soma(porEmp, v.empresa, m, v, prob); soma(porGar, v.g || '(sem formulário)', m, v, prob);
  }));
  el.innerHTML = `<section class="secao"><h2>Análises</h2><p class="nota">Disponibilidade = registros online sem erro ÷ todos os registros de setembro (${fmtN(D.dias.length)} dias do mês; dados até ${D.meta.monitoramento.ultimo_dia.slice(8)}/${D.meta.monitoramento.ultimo_dia.slice(5, 7)}). “Com problema agora” = último estado offline ou com erro. A garagem vem do formulário de manutenção (veículos sem formulário ficam em “sem formulário”).</p></section>
    <section class="secao"><h3>Por câmera</h3><div id="t-cam"></div></section>
    <section class="secao"><h3>Por empresa</h3><div id="t-emp"></div></section>
    <section class="secao"><h3>Por garagem</h3><div id="t-gar"></div></section>
    <section class="secao"><h3>Manutenções por técnico</h3><p class="nota">Apenas volume e distribuição de resultados, em ordem alfabética — não é um ranking: os resultados dependem do tipo de problema e do veículo atendido.</p><div id="t-tec"></div></section>`;
  const cols = (nome, fmtNome) => [
    { k: 'k', t: nome, r: (r) => esc(fmtNome(r.k)) },
    { k: 'nv', t: 'Veículos', num: true, v: (r) => r.veic.size, r: (r) => fmtN(r.veic.size) },
    { k: 'cams', t: 'Câmeras', num: true },
    { k: 'n', t: 'Registros', num: true, r: (r) => fmtN(r.n) },
    { k: 'disp', t: 'Disponibilidade', num: true, v: (r) => pct(r.ok, r.n), r: (r) => fmtP(pct(r.ok, r.n)) },
    { k: 'pf', t: '% erro SD', num: true, v: (r) => pct(r.f, r.n), r: (r) => fmtP(pct(r.f, r.n)) },
    { k: 'po', t: '% offline', num: true, v: (r) => pct(r.o, r.n), r: (r) => fmtP(pct(r.o, r.n)) },
    { k: 'b', t: 'Distribuição', ord: false, w: 140, r: (r) => barra([[r.ok, 'b-ok', 'Online'], [r.f, 'b-fa', 'Erro SD'], [r.o, 'b-of', 'Offline']]) },
    { k: 'abertos', t: 'Com problema agora', num: true, r: (r) => `${fmtN(r.abertos)} <small>(${fmtP(pct(r.abertos, r.cams), 0)})</small>` },
  ];
  tabela(el.querySelector('#t-cam'), { linhas: Object.values(porCam), cols: cols('Câmera', camNome), ordem: { k: 'k', dir: 1 } });
  tabela(el.querySelector('#t-emp'), { linhas: Object.values(porEmp), cols: cols('Empresa', String), ordem: { k: 'nv', dir: -1 } });
  tabela(el.querySelector('#t-gar'), { linhas: Object.values(porGar), cols: cols('Garagem', String), ordem: { k: 'nv', dir: -1 } });
  const tec = {};
  D.eventos.filter((e) => vs.some((v) => v.p === e.prefixo) || !D.porPrefixo.get(e.prefixo)).filter((e) => (!F.de || e.data >= F.de) && (!F.ate || e.data <= F.ate)).forEach((e) => e.tecnicos.forEach((t) => {
    const x = (tec[t] = tec[t] || { k: t, n: 0, sim: 0, res: 0, rec: 0, par: 0, nao: 0, sd: 0, ok: 0 });
    x.n += 1; if (e.precisava === 'Sim') x.sim += 1; if (e.precisava === 'Não') x.ok += 1;
    x.res += e.resultado === 'Resolvido' ? 1 : 0; x.rec += e.resultado === 'Resolvido com recorrência' ? 1 : 0; x.par += e.resultado === 'Parcialmente resolvido' ? 1 : 0;
    x.nao += e.resultado === 'Não resolvido' ? 1 : 0; x.sd += e.resultado === 'Sem dados para avaliar' ? 1 : 0;
  }));
  tabela(el.querySelector('#t-tec'), {
    linhas: Object.values(tec), ordem: { k: 'k', dir: 1 },
    cols: [{ k: 'k', t: 'Técnico' }, { k: 'n', t: 'Visitas', num: true }, { k: 'sim', t: 'Precisavam', num: true }, { k: 'ok', t: 'CFTV normal antes', num: true },
      { k: 'res', t: 'Resolvido', num: true }, { k: 'rec', t: 'Resolvido c/ recorrência', num: true }, { k: 'par', t: 'Parcial', num: true }, { k: 'nao', t: 'Não resolvido', num: true }, { k: 'sd', t: 'Sem dados', num: true }],
  });
}
