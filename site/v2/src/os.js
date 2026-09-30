// OS (Ordem de Serviço): modal de seleção + geração do .xlsx para o técnico de campo, no navegador.
// Base: último registro de cada câmera em TODO o período dos dados (mesma regra dos cards) + os.json (último registro
// com hora e nº de mudanças de estado nos últimos 7 dias, pré-calculados por scripts/gerar_v2_os.py).
import { D, ultimoCodigo, catCodigo, situacao, empresaPassa, camNome, dmy, esc, fmtN, ICONE, GRUPO_METROPOLE, CAMS_POS } from './dados.js';
import { F } from './main.js';
import { abrirModal, fecharModal } from './garagem.js';
import { carregarExcel, baixar, agora, fill, COR_XL } from './xlsx.js';

export const PROBLEMAS = [
  { k: 'on', rot: 'Funcional', tip: 'Todas as câmeras funcionais no último registro', teste: (s) => s.cat === 'on' },
  { k: 'prob', rot: '1+ câmera com problema', tip: 'Pelo menos uma câmera com erro de SD card ou offline no último registro', teste: (s) => s.falha },
  { k: 'sd', rot: 'Erro de SD card', tip: 'Pelo menos uma câmera com erro de SD card no último registro', teste: (s) => s.fa > 0 },
  { k: 'off', rot: '100% Offline', tip: 'Todas as câmeras offline no último registro', teste: (s) => s.cat === 'off' },
];
// Status por câmera na OS e cores de preenchimento (paleta suave do painel)
export const ST = {
  Funcional: { cor: 'FFDCE6DF', txt: 'FF3F6B4E', def: 'Último registro da câmera funcional e sem erro/offline nos últimos 7 dias.' },
  'Erro SD': { cor: 'FFF1E7D6', txt: 'FF8A6420', def: 'Último registro da câmera com erro de SD card (ou falha de gravação/login informada pelo equipamento).' },
  Offline: { cor: 'FFF7E0DC', txt: 'FFA6423A', def: 'Último registro da câmera offline.' },
  Variação: { cor: 'FFFFF3C4', txt: 'FF7A5A00', def: 'Último registro funcional, mas com erro de SD ou offline em algum dia dos últimos 7 dias (instável).' },
  'Sem conexão': { cor: 'FFEFEFEC', txt: 'FF6B6B6B', def: 'Câmera sem nenhum registro nas últimas 24 h antes da última atualização (o último estado conhecido aparece na observação).' },
  '—': { cor: 'FFFFFFFF', txt: 'FFA3A3A0', def: 'Câmera não instalada ou sem registro no período.' },
};
const JANELA = 7;
let aux = null;
const carregarAux = () => { if (!aux) aux = fetch(`${import.meta.env.BASE_URL}os.json`).then((r) => (r.ok ? r.json() : { v: {} })).catch(() => ({ v: {} })); return aux; };

const juntar = (xs) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const dm = (i) => dmy(D.dias[i]).slice(0, 5);
const dataHora = (iso) => (iso ? `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '—');
let ultManut = null;
function ultimaManutencao(p) {
  if (!ultManut) {
    ultManut = new Map();
    D.manut.forEach((m) => { const a = ultManut.get(Number(m.p)); if (!a || (m.d + m.h) > (a.d + a.h)) ultManut.set(Number(m.p), m); });
  }
  return ultManut.get(p);
}

// Análise de um veículo para a OS. camSel = câmera escolhida no modal (ou null = todas).
export function analisar(v, camSel, A) {
  const todos = D.dias.map((_, i) => i);
  const lim = new Date(new Date(D.meta.atualizacao).getTime() - 24 * 3600 * 1000);
  const limIso = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}T${String(lim.getHours()).padStart(2, '0')}:${String(lim.getMinutes()).padStart(2, '0')}`;
  const s = situacao(v, todos, camSel);
  const cams = {};
  let u = null, mud = 0;
  const dentro = (c) => !camSel || String(c) === String(camSel);
  v.c.forEach((c) => {
    const x = ultimoCodigo(v, c, todos);
    if (!x) return;
    const k = catCodigo(x), mask = v.k[c] || '';
    const [uc, mc] = A?.v?.[v.p]?.[c] || [null, 0];
    if (uc && (!u || uc > u)) u = uc;
    mud += mc;
    // sequência atual de dias com problema: do último dia com registro para trás; dia sem registro não interrompe
    // nem conta; dia 100% funcional interrompe
    let ini = null, n = 0;
    if (k !== 'on') {
      for (let i = D.nd - 1; i >= 0; i -= 1) { const m = Number(mask[i] || 0); if (!m) continue; if (m & 6) { n += 1; ini = i; } else break; }
    }
    let var7 = false;
    if (k === 'on') for (let i = Math.max(0, D.nd - JANELA); i < D.nd; i += 1) if (Number(mask[i] || 0) & 6) var7 = true;
    const semCon = uc && uc < limIso;
    const st = semCon ? 'Sem conexão' : k === 'off' ? 'Offline' : k === 'fa' ? 'Erro SD' : var7 ? 'Variação' : 'Funcional';
    cams[c] = { k, st, ini, n, uc, mc, semCon };
  });
  const prob = Object.entries(cams).filter(([c, x]) => dentro(c) && x.k !== 'on');
  const maior = prob.slice().sort((a, b) => b[1].n - a[1].n || (a[1].ini ?? 1e9) - (b[1].ini ?? 1e9))[0];
  const temOff = prob.some(([, x]) => x.k === 'off'), temSd = prob.some(([, x]) => x.k === 'fa');
  const todasSem = Object.keys(cams).length && Object.values(cams).every((x) => x.semCon);
  let geral = s.cat === 'on' ? (Object.entries(cams).some(([c, x]) => dentro(c) && x.st === 'Variação') ? 'Funcional com variação' : 'Funcional')
    : s.cat === 'off' ? '100% Offline' : temOff ? (temSd ? 'Offline parcial + erro de SD' : 'Offline parcial') : s.cat === 'fa' ? 'Erro de SD card' : 'Sem conexão';
  if (todasSem && s.cat !== 'nd') geral += ' (sem conexão)';
  // observação técnica automática
  const obs = [];
  const grupos = new Map();
  prob.forEach(([c, x]) => { const key = `${x.k}|${x.n}|${x.ini}`; if (!grupos.has(key)) grupos.set(key, { ...x, cams: [] }); grupos.get(key).cams.push(c); });
  [...grupos.values()].sort((a, b) => b.n - a.n).forEach((g) => {
    const quem = `Câm ${juntar(g.cams)}`;
    const oque = g.k === 'off' ? 'offline' : 'com erro de SD';
    const desde = g.ini === 0 ? `desde o início dos dados, ${dm(0)}` : `desde ${dm(g.ini ?? D.nd - 1)}`;
    obs.push(g.n > 1 ? `${quem} ${oque} há ${g.n} dias (${desde})` : `${quem} ${oque} ${desde}`);
  });
  const vari = Object.entries(cams).filter(([, x]) => x.st === 'Variação');
  if (vari.length) obs.push(`Câm ${juntar(vari.map(([c]) => c))} com variação nos últimos ${JANELA} dias`);
  const sem = Object.entries(cams).filter(([, x]) => x.semCon);
  if (sem.length) obs.push(todasSem ? `Sem registro desde ${dataHora(u)}` : `Câm ${juntar(sem.map(([c]) => c))} sem registro há mais de 24 h`);
  if (!obs.length) obs.push('Sem problema no último registro');
  const man = ultimaManutencao(v.p);
  const resumo = man ? `${dmy(man.d)} ${man.h} – ${String(man.problema?.[0] || man.acao?.[0] || 'Sem descrição').slice(0, 90)}` : '—';
  return { v, s, cams, geral, prob: prob.length, dias: maior ? maior[1].n : 0, ini: maior ? maior[1].ini : null, mud, u, obs: `${obs.join('; ')}.`, man: resumo };
}

// Prioridade: maior duração do problema atual primeiro; empate -> 100% offline antes de parcial; depois mais câmeras afetadas
export const ordemPrioridade = (a, b) => b.dias - a.dias || (a.s.cat === 'off' ? 0 : 1) - (b.s.cat === 'off' ? 0 : 1) || b.prob - a.prob || a.v.p - b.v.p;

export function selecionar(sel, A) {
  const probs = PROBLEMAS.filter((p) => sel.problemas.includes(p.k));
  return D.veiculos
    .filter((v) => empresaPassa(v.garagem, sel.garagem) && (!sel.camera || v.c.map(String).includes(sel.camera)))
    .map((v) => analisar(v, sel.camera || null, A))
    .filter((r) => probs.some((p) => p.teste(r.s)))
    .sort(ordemPrioridade);
}

export function abrirOS() {
  const sel = { garagem: F.empresa, camera: F.camera && CAMS_POS.includes(Number(F.camera)) ? F.camera : '', problemas: ['prob'] };
  const m = abrirModal(`<div class="modal-cab"><div><h2>Ordem de Serviço</h2><div class="sub">Planilha .xlsx para o técnico de campo, pelo último registro de cada câmera</div></div><button class="fechar md-fechar" aria-label="Fechar">${ICONE.x}</button></div>
    <div class="os-form">
      <div class="campo"><label for="os-g">Garagem</label><select id="os-g"><option value="">Todas</option><option value="${GRUPO_METROPOLE}">METROPOLE (todas)</option>${D.garagens.map((g) => `<option>${esc(g)}</option>`).join('')}</select></div>
      <div class="campo"><label for="os-c">Câmera</label><select id="os-c"><option value="">Todas</option>${CAMS_POS.map((c) => `<option value="${c}">${esc(camNome(c))}</option>`).join('')}</select></div>
      <div class="campo"><span class="rot">Problema <span class="muted">(um ou mais)</span></span><div class="chips" id="os-p">${PROBLEMAS.map((p) => `<label class="chip" title="${p.tip}"><input type="checkbox" value="${p.k}" ${sel.problemas.includes(p.k) ? 'checked' : ''}/><span>${p.rot}</span></label>`).join('')}</div></div>
      <div class="os-resumo" id="os-res">Calculando…</div>
      <div class="os-acoes"><button class="btn-sec md-cancelar">Cancelar</button><button class="btn-pri" id="os-gerar">${ICONE.excel}<span>Gerar OS</span></button></div>
    </div>`, 'modal-os');
  m.querySelector('#os-g').value = sel.garagem;
  m.querySelector('#os-c').value = sel.camera;
  m.querySelector('.md-cancelar').onclick = fecharModal;
  let lista = [];
  const recalcular = async () => {
    sel.garagem = m.querySelector('#os-g').value; sel.camera = m.querySelector('#os-c').value;
    sel.problemas = [...m.querySelectorAll('#os-p input:checked')].map((i) => i.value);
    const A = await carregarAux();
    lista = sel.problemas.length ? selecionar(sel, A) : [];
    const off = lista.filter((r) => r.s.cat === 'off').length;
    m.querySelector('#os-res').innerHTML = sel.problemas.length ? `<b>${fmtN(lista.length)}</b> veículos na OS · ${fmtN(off)} 100% offline · ${fmtN(lista.filter((r) => r.dias >= 7).length)} com problema há 7+ dias` : 'Escolha pelo menos um problema.';
    m.querySelector('#os-gerar').disabled = !lista.length;
  };
  m.querySelectorAll('select, input').forEach((i) => i.addEventListener('change', recalcular));
  m.querySelector('#os-gerar').onclick = async () => {
    const b = m.querySelector('#os-gerar'); b.disabled = true; b.querySelector('span').textContent = 'Gerando…';
    await gerarOS(lista, sel);
    b.disabled = false; b.querySelector('span').textContent = 'Gerar OS';
  };
  recalcular();
}

export async function gerarOS(lista, sel) {
  const ExcelJS = await carregarExcel();
  const t = agora();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Controle de CFTV'; wb.created = new Date(); wb.title = 'Ordem de Serviço';
  const ws = wb.addWorksheet('Ordem de Serviço', { properties: { defaultRowHeight: 30 }, views: [{ state: 'frozen', xSplit: 3, ySplit: 7, showGridLines: false }] });
  const COLS = [['Prioridade', 9], ['Garagem', 22], ['Prefixo', 9], ...CAMS_POS.map((c) => [`Câm ${c}`, 11]), ['Situação geral', 20], ['Início do problema', 12], ['Dias com problema', 10],
    ['Variação (7 dias)', 15], ['Último registro', 16], ['Última manutenção', 34], ['Observação técnica', 52], ['Ação realizada', 32], ['Data do atendimento', 13], ['Técnico', 18], ['Assinatura', 18]];
  const N = COLS.length;
  ws.columns = COLS.map(([, w]) => ({ width: w }));
  const garagem = sel.garagem === GRUPO_METROPOLE ? 'METROPOLE (todas)' : sel.garagem || 'Todas';
  const probs = PROBLEMAS.filter((p) => sel.problemas.includes(p.k)).map((p) => p.rot).join(', ');
  const faixa = (r, txt, estilo = {}) => { ws.mergeCells(r, 1, r, N); const c = ws.getCell(r, 1); c.value = txt; Object.assign(c, estilo); ws.getRow(r).height = estilo.altura || 18; };
  faixa(1, 'ORDEM DE SERVIÇO — MANUTENÇÃO DE CFTV', { font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }, fill: fill(COR_XL.verde), alignment: { vertical: 'middle', indent: 1 }, altura: 30 });
  faixa(2, `Gerada em: ${t.txt}     ·     Período dos dados: ${dmy(D.dias[0])} a ${dmy(D.dias[D.nd - 1])} (última atualização ${dataHora(D.meta.atualizacao)})`, { font: { size: 10 } });
  faixa(3, `Filtros: Garagem: ${garagem}  ·  Câmera: ${sel.camera ? camNome(sel.camera) : 'Todas'}  ·  Problema: ${probs}`, { font: { size: 10 } });
  const off = lista.filter((r) => r.s.cat === 'off').length;
  faixa(4, `Total de veículos: ${lista.length}  ·  100% Offline: ${off}  ·  Com problema há 7+ dias: ${lista.filter((r) => r.dias >= 7).length}  ·  Câmeras com problema: ${lista.reduce((a, r) => a + r.prob, 0)}`, { font: { bold: true, size: 10 } });
  faixa(5, 'Prioridade: maior nº de dias com problema primeiro; empate → 100% offline antes de parcial → mais câmeras afetadas. Definições na aba "Legenda e instruções".', { font: { italic: true, size: 9, color: { argb: COR_XL.txt2 } } });
  ws.getRow(6).height = 6;
  const cab = ws.getRow(7);
  COLS.forEach(([rot], i) => { const c = cab.getCell(i + 1); c.value = rot; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = fill(i >= N - 4 ? 'FF6B6B6B' : COR_XL.verde); c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  cab.height = 34;
  const borda = { style: 'thin', color: { argb: 'FFD9D9D6' } };
  const GER = { '100% Offline': ST.Offline, 'Offline parcial': ST.Offline, 'Offline parcial + erro de SD': ST.Offline, 'Erro de SD card': ST['Erro SD'], Funcional: ST.Funcional, 'Funcional com variação': ST.Variação };
  lista.forEach((r, k) => {
    const lin = ws.getRow(8 + k);
    const vals = [k + 1, r.v.garagem, r.v.p, ...CAMS_POS.map((c) => (r.cams[c] ? r.cams[c].st : '—')), r.geral, r.ini != null ? D.dias[r.ini].split('-').reverse().join('/') : '—', r.dias || 0,
      r.mud ? `Sim (${r.mud} mudança${r.mud > 1 ? 's' : ''})` : 'Não', dataHora(r.u), r.man, r.obs, '', '', '', ''];
    vals.forEach((x, i) => {
      const c = lin.getCell(i + 1);
      c.value = x;
      c.border = { top: borda, left: borda, bottom: borda, right: borda };
      c.alignment = { vertical: 'middle', horizontal: [1, 14, 15, 16, 18].includes(i) ? 'left' : 'center', wrapText: true };
      c.font = { size: 10 };
      if (i >= 3 && i < 9) { const st = ST[x]; c.fill = fill(st.cor); c.font = { size: 10, color: { argb: st.txt }, bold: x !== 'Funcional' && x !== '—' }; }
      if (i === 9) { const st = GER[String(x).replace(' (sem conexão)', '')] || ST['Sem conexão']; c.fill = fill(st.cor); c.font = { size: 10, bold: true, color: { argb: st.txt } }; }
      if (i >= N - 4) c.fill = fill('FFFBFBF8');
    });
    lin.getCell(1).font = { bold: true, size: 11 };
    lin.getCell(3).font = { bold: true, size: 11 };
    lin.height = Math.max(32, 15 * Math.ceil(String(r.obs).length / 58) + 6);
  });
  const fim = 7 + lista.length;
  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: fim, column: N } };
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '7:7', horizontalCentered: true, printArea: `A1:${ws.getColumn(N).letter}${fim}`,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.45, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: '&L&8Controle de CFTV — Ordem de Serviço&C&8Gerada em ' + t.txt + '&R&8Página &P de &N' };
  legenda(wb, t);
  const nome = `OS_CFTV_${sel.garagem && sel.garagem !== GRUPO_METROPOLE ? sel.garagem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_') : sel.garagem ? 'METROPOLE' : 'todas'}_${t.arq}.xlsx`;
  await baixar(wb, nome);
  return nome;
}

function legenda(wb, t) {
  const ws = wb.addWorksheet('Legenda e instruções', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 110 }];
  const tit = (txt) => { const r = ws.addRow([txt]); r.font = { bold: true, size: 12, color: { argb: COR_XL.verde } }; r.height = 22; };
  const lin = (a, b, cor) => { const r = ws.addRow([a, b]); r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; r.getCell(1).alignment = { vertical: 'top' }; r.getCell(1).font = { bold: true }; if (cor) { r.getCell(1).fill = fill(cor.cor); r.getCell(1).font = { bold: true, color: { argb: cor.txt } }; } r.height = Math.max(18, 15 * Math.ceil(String(b).length / 105)); };
  const r1 = ws.addRow(['ORDEM DE SERVIÇO — LEGENDA E INSTRUÇÕES']); r1.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }; ws.mergeCells(1, 1, 1, 2); r1.getCell(1).fill = fill(COR_XL.verde); r1.height = 28;
  ws.addRow([`Gerada em ${t.txt}. Dados de ${dmy(D.dias[0])} a ${dmy(D.dias[D.nd - 1])}; última atualização ${dataHora(D.meta.atualizacao)}.`]);
  ws.addRow([]);
  tit('Status de cada câmera (colunas Câm 21 a Câm 26)');
  Object.entries(ST).forEach(([k, x]) => lin(k, x.def, x));
  ws.addRow([]);
  tit('Situação geral do veículo');
  lin('100% Offline', 'Todas as câmeras com registro estão offline no último registro.', ST.Offline);
  lin('Offline parcial', 'Uma ou mais câmeras offline, mas não todas (pode vir acompanhado de erro de SD).', ST.Offline);
  lin('Erro de SD card', 'Uma ou mais câmeras com erro de SD card e nenhuma offline.', ST['Erro SD']);
  lin('Funcional', 'Todas as câmeras funcionais no último registro ("com variação" = houve problema nos últimos 7 dias).', ST.Funcional);
  lin('(sem conexão)', 'Acrescentado quando nenhuma câmera do veículo tem registro nas últimas 24 h; a situação é a do último registro conhecido.', ST['Sem conexão']);
  ws.addRow([]);
  tit('Critério de prioridade (coluna Prioridade: 1 = atender primeiro)');
  lin('1º', 'Maior nº de dias com problema: sequência atual de dias com offline/erro de SD da câmera com o problema mais longo, contada do último dia com registro para trás. Dia sem registro não interrompe nem conta; um dia 100% funcional encerra a sequência.');
  lin('2º (empate)', 'Veículo 100% offline antes de veículo com problema parcial.');
  lin('3º (empate)', 'Mais câmeras afetadas (offline ou erro de SD) primeiro. Persistindo o empate, menor prefixo.');
  ws.addRow([]);
  tit('Colunas');
  lin('Início do problema', 'Primeiro dia da sequência atual de dias com problema (câmera com o problema mais longo).');
  lin('Dias com problema', 'Nº de dias com registro de offline/erro de SD na sequência atual (ver critério 1º).');
  lin('Variação (7 dias)', 'Sim quando houve mudança de estado (funcional ↔ erro de SD ↔ offline) nos últimos 7 dias com dados, com o nº total de mudanças somando as câmeras.');
  lin('Último registro', 'Data e hora do registro mais recente de qualquer câmera do veículo.');
  lin('Última manutenção', 'Visita mais recente registrada no formulário de manutenção (data, hora e primeiro problema/ação informados).');
  lin('Observação técnica', 'Texto automático com as câmeras afetadas, há quantos dias e desde quando.');
  ws.addRow([]);
  tit('Como preencher (técnico)');
  lin('Ação realizada', 'Descreva o que foi feito (troca de câmera, cabo, SD card, switch, configuração etc.) ou o motivo de não ter sido possível atender.');
  lin('Data do atendimento', 'Data da visita (dd/mm/aaaa).');
  lin('Técnico / Assinatura', 'Nome legível e assinatura do técnico responsável.');
  ws.addRow([]);
  tit('Observações');
  lin('Base dos dados', 'Status pelo último registro de cada câmera em todo o período dos dados (mesma regra dos cards do painel). Com filtro de câmera, a situação considera apenas a câmera escolhida; as colunas continuam mostrando todas as câmeras.');
  lin('Impressão', 'Configurada para A4 paisagem, ajustada à largura da página, com o cabeçalho da tabela repetido em todas as páginas.');
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}
