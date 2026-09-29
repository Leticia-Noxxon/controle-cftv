// Painel lateral: detalhe do veículo, do dia (linha do tempo horária) e da manutenção (antes/depois).
import { detalhe } from './data.js';
import { esc, dmy, dm, dmyh, fmtN, fmtP, pct, camNome, CAMS, cat, chip, codigoTxt, camsDaMascara, errosTxt, horas, BIT } from './util.js';

const painel = () => document.getElementById('painel');
export function abrirPainel(html) {
  document.getElementById('painel-corpo').innerHTML = html;
  painel().classList.add('aberto');
  painel().setAttribute('aria-hidden', 'false');
  painel().scrollTop = 0;
}
export function fecharPainel() { painel().classList.remove('aberto'); painel().setAttribute('aria-hidden', 'true'); }

const hms = (s) => `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
const seg2min = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4)) + Number(s.slice(4, 6)) / 60;
const estadoSeg = (code) => ({ ok: 'N', fa: 'F', of: 'O' }[cat(code)] || 'N');
const addDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Converte segmentos de vários dias em intervalos [ini, fim) em minutos desde o início do 1º dia.
// Cada registro representa o intervalo até o próximo registro, limitado a 90 min (a coleta é ~horária); lacunas maiores ficam cinza.
function intervalos(porDia, dias) {
  const pts = [];
  dias.forEach((d, i) => (porDia[d] || []).forEach(([a, b, code, n]) => pts.push({ ini: i * 1440 + seg2min(a), fim: i * 1440 + seg2min(b), code, n, d, a, b })));
  pts.sort((x, y) => x.ini - y.ini);
  return pts.map((p, i) => {
    const prox = pts[i + 1];
    const fimVis = prox ? Math.min(prox.ini, p.fim + 90) : p.fim + 60;
    return { ...p, fimVis: Math.min(fimVis, dias.length * 1440) };
  });
}

function linhaTempo(det, cams, dias, marcas) {
  const total = dias.length * 1440;
  const eixo = dias.length === 1 ? ['00h', '06h', '12h', '18h', '24h'] : dias.map((d) => dm(d));
  const linhas = cams.map((c) => {
    const iv = intervalos(det[c] || {}, dias);
    const segs = iv.map((p) => `<div class="tl-seg ${estadoSeg(p.code)}" style="left:${(100 * p.ini) / total}%;width:${(100 * (p.fimVis - p.ini)) / total}%" title="${esc(`${dmy(p.d)} ${hms(p.a)}–${hms(p.b)} · ${codigoTxt(p.code)} · ${p.n} registro(s)`)}"></div>`).join('');
    const mk = marcas.map((m) => `<div class="tl-man" style="left:${(100 * m.min) / total}%" title="${esc(m.txt)}"></div>`).join('');
    return `<div class="tl-lin"><span>${esc(camNome(c))}</span><div class="tl-barra">${segs}${mk}</div></div>`;
  }).join('');
  return `<div class="tl">${linhas}<div class="tl-eixo"><div></div><div>${eixo.map((e) => `<span>${e}</span>`).join('')}</div></div></div>
    <div class="legenda" style="margin-top:.3rem"><span><span class="ponto p-ok"></span> Online</span><span><span class="ponto p-fa"></span> Erro SD/gravação</span><span><span class="ponto p-of"></span> Offline</span><span><span class="ponto p-nd"></span> Sem registro</span><span><span class="ponto p-man"></span> Manutenção (horário do formulário)</span></div>`;
}

function marcasManut(D, prefixo, dias) {
  return D.eventos.filter((e) => e.prefixo === prefixo).flatMap((e) => e.forms.map((id) => D.formPorId.get(id))).filter((f) => f && dias.includes(f.data))
    .map((f) => ({ min: dias.indexOf(f.data) * 1440 + Number(f.hora.slice(0, 2)) * 60 + Number(f.hora.slice(3, 5)), txt: `Manutenção ${dmyh(f.datahora)} · ${f.tecnico}` }));
}

function tabelaSegmentos(det, cams, dias) {
  const rows = [];
  cams.forEach((c) => dias.forEach((d) => (det[c]?.[d] || []).forEach(([a, b, code, n]) => rows.push(`<tr><td>${esc(camNome(c))}</td><td>${dmy(d)}</td><td>${hms(a)}</td><td>${hms(b)}</td><td>${chip(cat(code), codigoTxt(code))}</td><td class="num">${n}</td></tr>`))));
  return `<details><summary class="sutil">Horários originais dos registros (${rows.length} trechos de estado)</summary><div class="tabela-wrap" style="max-height:320px;margin-top:.4rem"><table class="tab"><thead><tr><th>Câmera</th><th>Data</th><th>Primeiro registro</th><th>Último registro</th><th>Estado</th><th class="num">Registros</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="nota">Cada linha agrupa registros consecutivos com o mesmo estado. Horários convertidos de UTC para Brasília.</p></details>`;
}

export async function painelDia(D, p, i) {
  const v = D.porPrefixo.get(p);
  const dia = D.dias[i];
  const cob = D.meta.cobertura.find((c) => c.data === dia);
  const x = v.d[i];
  const evs = (v.mv[i] || []).map((k) => D.eventos[k]);
  const cabec = `<h2>Prefixo ${p} · ${dmy(dia)}</h2><p class="sutil">${esc(v.empresa)}${v.g ? ` · Garagem ${esc(v.g)}` : ''}</p>
    <div style="display:flex;gap:.4rem;margin:.4rem 0"><button class="btn peq" id="dia-ant" ${i ? '' : 'disabled'}>‹ dia anterior</button><button class="btn peq" id="dia-prox" ${i < D.dias.length - 1 ? '' : 'disabled'}>próximo dia ›</button></div>`;
  let resumo;
  if (x == null) resumo = '<div class="aviso">Sem registros do monitoramento para este prefixo nesta data.</div>';
  else {
    const a = x === 100 ? { d: 100, f: 0, o: 0 } : { d: x[0], f: x[9], o: x[10] };
    resumo = `<dl class="pares"><dt>Disponibilidade do dia</dt><dd>${fmtP(a.d)} dos registros online sem erro</dd><dt>Erro SD/gravação</dt><dd>${fmtP(a.f)} dos registros</dd><dt>Offline</dt><dd>${fmtP(a.o)} dos registros</dd>
      ${x !== 100 && x[5] != null ? `<dt>Período offline</dt><dd>${x[5]}h–${x[6]}h</dd>` : ''}${x !== 100 && x[7] != null ? `<dt>Período com erro</dt><dd>${x[7]}h–${x[8]}h</dd>` : ''}</dl>`;
  }
  if (cob && cob.horas < 24) resumo += `<p class="nota">Dia parcial na base: registros de ${cob.inicio.slice(11, 16)} a ${cob.fim.slice(11, 16)} (${cob.horas} h com dados).</p>`;
  const manut = evs.map((e) => `<div class="bloco"><h3><span class="ponto p-man"></span> Manutenção ${dmyh(e.inicio)} — ${esc(e.tecnicos.join(', '))}</h3><p>${esc(e.problemas.join('; ') || 'Sem problema estruturado no formulário')}</p><p class="sutil">Resultado: ${esc(e.resultado)} · <a href="#" data-ev="${e.idx}">ver manutenção</a></p></div>`).join('');
  abrirPainel(`${cabec}${resumo}${manut}<div class="bloco"><h3>Linha do tempo por câmera</h3><div id="tl-dia" class="sutil">carregando registros…</div></div>`);
  const liga = () => {
    document.getElementById('dia-ant')?.addEventListener('click', () => painelDia(D, p, i - 1));
    document.getElementById('dia-prox')?.addEventListener('click', () => painelDia(D, p, i + 1));
    document.querySelectorAll('[data-ev]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); painelManutencao(D, D.eventos[Number(a.dataset.ev)]); }));
  };
  liga();
  const det = await detalhe(p);
  const alvo = document.getElementById('tl-dia');
  if (!alvo) return;
  alvo.classList.remove('sutil');
  alvo.innerHTML = linhaTempo(det, v.c, [dia], marcasManut(D, p, [dia])) + tabelaSegmentos(det, v.c, [dia]);
}

export function painelVeiculo(D, p) {
  const v = D.porPrefixo.get(p);
  if (!v) return;
  const probs = D.problemas.filter((s) => s.prefixo === p);
  const evs = D.eventos.filter((e) => e.prefixo === p);
  const linhasCam = v.c.map((c) => {
    const m = v.cm[c]; const u = v.ult[c]; const r = v.r ? v.r[c] : undefined;
    return `<tr><td>${esc(camNome(c))}</td><td>${u ? chip(u.cat, codigoTxt(u.code)) : '—'}<br><small>${u ? dmyh(u.ts) : ''}${u?.desatualizado ? ' · sem registro no último dia' : ''}</small></td>
      <td>${r ? chip(cat(r), r === '-' ? 'Sem câmera' : codigoTxt(r)) : '<small>não consta</small>'}</td>
      <td class="num">${m ? fmtP(pct(m[1], m[0])) : '—'}</td><td class="num">${m ? `${m[6]} de ${m[7]}` : '—'}</td><td class="num">${m ? fmtN(m[5]) : '—'}</td></tr>`;
  }).join('');
  abrirPainel(`<h2>Prefixo ${p}</h2><p class="sutil">${esc(v.empresa)}${v.empresasHist ? ` (no período também: ${esc(v.empresasHist.filter((e) => e !== v.empresa).join(', '))})` : ''}${v.g ? ` · Garagem ${esc(v.g)}` : ''} · último registro ${dmyh(v.ul)}</p>
    <div class="bloco"><h3>Câmeras</h3><div class="tabela-wrap"><table class="tab"><thead><tr><th>Câmera</th><th>Último estado (monitoramento)</th><th>Relatório ${esc(dm(D.meta.relatorio?.data))}</th><th class="num">Disponib. no mês</th><th class="num">Dias c/ problema</th><th class="num">Transições</th></tr></thead><tbody>${linhasCam}</tbody></table></div>
    <p class="nota">Disponibilidade = registros online sem erro ÷ todos os registros da câmera em setembro. Transições = mudanças de estado (online/erro/offline) entre registros consecutivos.</p></div>
    <div class="bloco"><h3>Problemas em aberto</h3>${probs.length ? `<ul>${probs.map((s) => `<li>${esc(camNome(s.camera))}: ${esc(s.tipo)} desde ${dmyh(s.desde)} — ${s.dias_corridos} dia(s) corridos${s.inicio_censurado ? ' (já no início dos dados)' : ''}${s.atual ? '' : ` · último dado em ${dmy(s.ultimo_dia)}`}</li>`).join('')}</ul>` : '<p class="sutil">Nenhuma câmera com problema no último dia com dados.</p>'}</div>
    <div class="bloco"><h3>Manutenções</h3>${evs.length ? `<ul>${evs.map((e) => `<li><a href="#" data-ev="${e.idx}">${dmyh(e.inicio)}</a> — ${esc(e.tecnicos.join(', '))} · ${esc(e.resultado)}</li>`).join('')}</ul>` : '<p class="sutil">Sem formulário de manutenção para este prefixo.</p>'}</div>`);
  document.querySelectorAll('[data-ev]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); painelManutencao(D, D.eventos[Number(a.dataset.ev)]); }));
}

const PREC = { Sim: 'c-fa', Não: 'c-ok', 'Sem dados': 'c-nd' };
export const RES_CLS = { Resolvido: 'c-ok', 'Resolvido com recorrência': 'c-fa', 'Parcialmente resolvido': 'c-fa', 'Não resolvido': 'c-of', 'Sem problema antes': 'c-prim', 'Sem dados para avaliar': 'c-nd' };
export const precisaChip = (s) => `<span class="chip ${PREC[s] || 'c-nd'}">${esc(s)}</span>`;
export const resChip = (s) => `<span class="chip ${RES_CLS[s] || 'c-nd'}">${esc(s)}</span>`;

export async function painelManutencao(D, e) {
  const forms = e.forms.map((id) => D.formPorId.get(id)).filter(Boolean);
  const camsLinhas = (e.cameras || []).map((c) => {
    const a = c.antes, d = c.depois;
    return `<tr><td>${esc(camNome(c.camera))}${e.cameras_formulario.includes(c.camera) ? ' <span class="chip c-man" title="Posição com problema/ação no formulário">no formulário</span>' : ''}</td>
      <td>${a ? `${a.problema ? chip(a.problema === a.registros ? (a.tipo.startsWith('Offline') ? 'of' : 'fa') : 'fa', a.tipo) : chip('ok', 'Normal')} <small>${a.problema}/${a.registros} reg.</small>` : '<small>sem registro</small>'}</td>
      <td>${d ? `${d.problema ? `<small>${d.problema}/${d.registros} reg. com problema (${fmtP(d.pct_problema)})</small>` : chip('ok', 'Normal')}` : '<small>sem registro</small>'}</td>
      <td>${d?.normalizou_em ? `${dmyh(d.normalizou_em)}<br><small>${horas(d.horas_ate_normalizar)} após a visita</small>` : (d ? (c.problema_antes ? chip('of', 'Não normalizou') : '—') : '—')}</td>
      <td>${d?.voltou_em ? `${dmyh(d.voltou_em)} <small>(${esc(d.voltou_tipo)}, ${horas(d.horas_ate_voltar)} depois)</small>` : '—'}</td></tr>`;
  }).join('');
  const formsHtml = forms.map((f) => `<div class="bloco"><h3>Formulário · ${dmyh(f.datahora)} · ${esc(f.tecnico)}</h3>
    <dl class="pares"><dt>Garagem</dt><dd>${esc(f.garagem || '—')}</dd><dt>Tecnologia</dt><dd>${esc(f.tecnologia || '—')}</dd><dt>ID</dt><dd>${esc(f.id_formulario ?? '—')}</dd><dt>Enviado em</dt><dd>${esc(f.data_envio || '—')}</dd><dt>Linha na planilha</dt><dd>${f.linha_excel}</dd>
    ${Object.entries(f.quantidades).filter(([, q]) => q).map(([k, q]) => `<dt>${esc(k)}</dt><dd>${esc(q)}</dd>`).join('')}</dl>
    ${f.posicoes.filter((x) => x.problemas.length || x.acoes.length || x.outros.length).map((x) => `<p><strong>${esc(x.posicao)}</strong>${x.camera ? ` <small>(câm ${x.camera})</small>` : ''}<br>Problemas: ${x.problemas.map((i) => `<span class="chip c-fa">${esc(i.item)}</span>`).join(' ') || '—'}<br>Ações: ${x.acoes.map((i) => `<span class="chip c-prim">${esc(i.item)}</span>`).join(' ') || '—'}${x.outros.length ? `<br><small>Outros: ${esc(x.outros.map((o) => o.texto).join('; '))}</small>` : ''}</p>`).join('') || '<p class="sutil">Nenhum problema/ação estruturado nas colunas por posição.</p>'}
    ${f.texto.pendencias.length ? `<div class="aviso">Possível pendência: ${f.texto.pendencias.map((t) => `“${esc(t.trecho)}”`).join(' ')}</div>` : ''}
    ${f.alertas.length ? `<p class="nota">Alertas: ${esc(f.alertas.join(' · '))}</p>` : ''}
    ${f.observacoes ? `<p class="sutil" style="margin-bottom:0">Observações (texto original)</p><pre class="original">${esc(f.observacoes)}</pre>` : ''}
    <details><summary class="sutil">Todas as respostas do formulário</summary><dl class="pares" style="margin-top:.4rem">${f.respostas.map((r) => `<dt>${esc(r.coluna)}</dt><dd style="white-space:pre-wrap">${esc(r.valor)}</dd>`).join('')}</dl></details></div>`).join('');
  const d0 = e.data; const dias = [addDias(d0, -1), d0, addDias(d0, 1), addDias(d0, 2)];
  abrirPainel(`<h2>Manutenção · prefixo ${e.prefixo}</h2><p class="sutil">${dmyh(e.inicio)}${e.fim !== e.inicio ? ` a ${e.fim.slice(11, 16)}` : ''} · ${esc(e.tecnicos.join(', '))} · ${esc(e.empresa)}</p>
    <div class="bloco"><dl class="pares"><dt>Precisava?</dt><dd>${precisaChip(e.precisava)} <small>(CFTV nas ${e.janela_antes_h} h anteriores)</small></dd><dt>Resultado</dt><dd>${resChip(e.resultado)} <small>${esc(e.motivo || '')}</small></dd>
      <dt>Janela antes</dt><dd>${e.antes ? `${dmyh(e.antes.de)} a ${dmyh(e.antes.ate)} · ${e.antes.registros} reg. (${e.antes.falha} erro, ${e.antes.off} offline)` : 'sem registros'}</dd>
      <dt>Janela depois</dt><dd>${e.depois ? `${dmyh(e.depois.de)} a ${dmyh(e.depois.ate)} · ${e.depois.registros} reg. (${e.depois.falha} erro, ${e.depois.off} offline)` : 'sem registros'}${e.depois_limitado_por_nova_manutencao ? ' · limitada pela manutenção seguinte' : ''}</dd>
      ${e.novo_problema?.length ? `<dt>Problema novo</dt><dd>${esc(e.novo_problema.map(camNome).join(', '))} (normais antes, com problema depois)</dd>` : ''}
      ${e.relatorio && e.precisava === 'Sem dados' ? `<dt>Relatório ${dm(D.meta.relatorio?.data)}</dt><dd>${Object.entries(e.relatorio).filter(([, c]) => c !== '-').map(([c, x]) => `${c}: ${chip(cat(x), codigoTxt(x))}`).join(' ')} <small>(retrato do dia, sem horário — apenas informativo)</small></dd>` : ''}
      <dt>Câmeras no formulário</dt><dd>${esc(e.cameras_formulario.map(camNome).join(', ') || '—')}</dd>
      ${e.cameras_texto.length ? `<dt>Câmeras citadas nas observações</dt><dd>${esc(e.cameras_texto.join(', '))}</dd>` : ''}</dl></div>
    ${camsLinhas ? `<div class="bloco"><h3>Antes × depois por câmera</h3><div class="tabela-wrap"><table class="tab"><thead><tr><th>Câmera</th><th>Antes (24 h)</th><th>Depois</th><th>Normalizou em</th><th>Voltou a falhar</th></tr></thead><tbody>${camsLinhas}</tbody></table></div></div>` : ''}
    <div class="bloco"><h3>Linha do tempo (${dm(dias[0])} a ${dm(dias[3])})</h3><div id="tl-man" class="sutil">carregando registros…</div></div>${formsHtml}`);
  const det = await detalhe(e.prefixo);
  const v = D.porPrefixo.get(e.prefixo);
  const alvo = document.getElementById('tl-man');
  if (alvo && v) { alvo.classList.remove('sutil'); alvo.innerHTML = linhaTempo(det, v.c, dias, marcasManut(D, e.prefixo, dias)); } else if (alvo) alvo.textContent = 'Prefixo sem registros no monitoramento.';
}
export { CAMS, camsDaMascara, errosTxt, BIT };
