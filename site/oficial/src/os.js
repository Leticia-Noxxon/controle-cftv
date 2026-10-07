// OS (Ordem de Serviço): modal de seleção + geração do .xlsx para o técnico de campo, no navegador.
// Base: último registro de cada câmera em TODO o período dos dados (mesma regra dos cards) + os.json (último registro
// com hora e nº de mudanças de estado nos últimos 7 dias, pré-calculados por scripts/gerar_v2_os.py).
import { D, ultimoCodigo, catCodigo, situacao, empresaPassa, camNome, dmy, esc, fmtN, ICONE, GRUPO_METROPOLE, CAMS_POS, dataHoraU } from './dados.js';
import { F } from './main.js';
import { abrirModal, fecharModal } from './garagem.js';
import { carregarExcel, baixar, agora, fill, COR_XL } from './xlsx.js';
import { resumoManutencao } from './texto.js';

// Problema (partição pelo último registro, mesma regra da tabela da Visão geral)
export const PROBLEMAS = [
  { k: 'on', rot: 'Funcional', tip: 'Todas as câmeras funcionais no último registro', teste: (s) => s.cat === 'on' },
  { k: 'prob', rot: '1+ câmera com problema', tip: 'Uma ou mais câmeras offline, mas não todas (problema de conexão)', teste: (s) => s.cat === 'fa' },
  { k: 'sd', rot: 'Erro de SD card', tip: 'Nenhuma câmera offline, mas uma ou mais com erro de SD card', teste: (s) => s.cat === 'sd' },
  { k: 'off', rot: '100% Offline', tip: 'Todas as câmeras offline no último registro', teste: (s) => s.cat === 'off' },
];
// Prioridade em faixas: Alta = 100% offline ou problema há 7+ dias; Média = 3 a 6 dias; Baixa = menos de 3 dias
export const faixa = (r) => (r.s.cat === 'off' || r.dias >= 7 ? 'Alta' : r.dias >= 3 ? 'Média' : 'Baixa');
const PESO_FAIXA = { Alta: 0, Média: 1, Baixa: 2 };
const JANELA = 7;
let aux = null;
export const carregarAux = () => { if (!aux) aux = fetch(`${import.meta.env.BASE_URL}os.json`).then((r) => (r.ok ? r.json() : { v: {} })).catch(() => ({ v: {} })); return aux; };

const juntar = (xs) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const dm = (i) => dmy(D.dias[i]).slice(0, 5);
const dataHora = dataHoraU;
let porVeic = null;
// última manutenção do veículo; com câmera escolhida, a última que cita a câmera (ou não informa câmera)
function ultimaManutencao(p, cam) {
  if (!porVeic) { porVeic = new Map(); D.manut.forEach((m) => { const k = Number(m.p); if (!porVeic.has(k)) porVeic.set(k, []); porVeic.get(k).push(m); }); }
  let best = null;
  (porVeic.get(p) || []).forEach((m) => {
    if (cam && (m.cams || []).length && !m.cams.map(String).includes(String(cam))) return;
    if (!best || (m.d + m.h) > (best.d + best.h)) best = m;
  });
  return best;
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
    if (!dentro(c)) return; // com uma câmera escolhida, só ela entra na OS
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
    // leitura diária sem horário (uc só com a data): dentro das 24 h se o dia não for anterior ao dia do limite
    const semCon = uc && (uc.length <= 10 ? uc < limIso.slice(0, 10) : uc < limIso);
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
  const man = ultimaManutencao(v.p, camSel);
  const resumo = resumoManutencao(man, dmy);
  return { v, s, cams, geral, prob: prob.length, dias: maior ? maior[1].n : 0, ini: maior ? maior[1].ini : null, mud, u, obs: `${obs.join('; ')}.`, man: resumo };
}

// Prioridade: maior duração do problema atual primeiro; empate -> 100% offline antes de parcial; depois mais câmeras afetadas
export const ordemPrioridade = (a, b) => PESO_FAIXA[faixa(a)] - PESO_FAIXA[faixa(b)] || b.dias - a.dias || (a.s.cat === 'off' ? 0 : 1) - (b.s.cat === 'off' ? 0 : 1) || b.prob - a.prob || a.v.p - b.v.p;

export function selecionar(sel, A) {
  const probs = PROBLEMAS.filter((p) => sel.problemas.includes(p.k));
  return D.veiculos
    .filter((v) => empresaPassa(v.garagem, sel.garagem) && (!sel.camera || v.c.map(String).includes(sel.camera)))
    .map((v) => analisar(v, sel.camera || null, A))
    .filter((r) => probs.some((p) => p.teste(r.s)))
    .sort(ordemPrioridade);
}

export function abrirOS() {
  const sel = { garagem: F.empresa, camera: F.camera && CAMS_POS.includes(Number(F.camera)) ? F.camera : '', problemas: ['prob', 'sd', 'off'] };
  const m = abrirModal(`<div class="modal-cab"><div><h2>Ordem de Serviço</h2><div class="sub">Planilha .xlsx para o técnico de campo, pelo último registro de cada câmera</div></div><button class="fechar md-fechar" aria-label="Fechar">${ICONE.x}</button></div>
    <div class="os-form">
      <div class="campo"><label for="os-g">Empresa</label><select id="os-g"><option value="">Todas</option><option value="${GRUPO_METROPOLE}">METROPOLE (todas)</option>${D.garagens.map((g) => `<option>${esc(g)}</option>`).join('')}</select></div>
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
    const nf = (f) => fmtN(lista.filter((r) => faixa(r) === f).length);
    m.querySelector('#os-res').innerHTML = sel.problemas.length ? `<b>${fmtN(lista.length)}</b> veículos na OS · prioridade Alta ${nf('Alta')} · Média ${nf('Média')} · Baixa ${nf('Baixa')}` : 'Escolha pelo menos um problema.';
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
  const ws = wb.addWorksheet('Ordem de Serviço', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  const cams = sel.camera ? [Number(sel.camera)] : CAMS_POS;
  const COLS = [['Prioridade', 11], ['Garagem/Empresa', 24], ['Prefixo', 10], ...cams.map((c) => [`Câm ${c}`, 12]), ['Observação técnica', 60], ['Última manutenção', 70]];
  const N = COLS.length;
  ws.columns = COLS.map(([, w]) => ({ width: w }));
  // Calibri 10, sem bordas; tudo centralizado, exceto Observação técnica e Última manutenção (à esquerda, com quebra)
  const fonte = { name: 'Calibri', size: 10 };
  const texto = (i) => i >= N - 2;
  const alinhar = (i) => (texto(i) ? { vertical: 'middle', horizontal: 'left', wrapText: true } : { vertical: 'middle', horizontal: 'center', wrapText: true });
  const cab = ws.getRow(1);
  COLS.forEach(([rot], i) => { const c = cab.getCell(i + 1); c.value = rot; c.font = { ...fonte, bold: true }; c.fill = fill('FFEDF1EE'); c.alignment = alinhar(i); });
  cab.height = 22;
  lista.forEach((r, k) => {
    const lin = ws.getRow(2 + k);
    const vals = [faixa(r), r.v.garagem, r.v.p, ...cams.map((c) => (r.cams[c] ? r.cams[c].st : '—')), r.obs, r.man];
    vals.forEach((x, i) => { const c = lin.getCell(i + 1); c.value = x; c.font = fonte; c.alignment = alinhar(i); });
    const linhasTxt = Math.max(Math.ceil(String(r.obs).length / 62), Math.ceil(String(r.man).length / 74), 1);
    lin.height = Math.max(16, 13 * linhasTxt + 4);
  });
  const fim = 1 + lista.length;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: fim, column: N } };
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', horizontalCentered: true, printArea: `A1:${ws.getColumn(N).letter}${fim}`,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.45, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: `&L&8Controle de CFTV — Ordem de Serviço (${t.txt})&R&8Página &P de &N` };
  const alvo = sel.garagem && sel.garagem !== GRUPO_METROPOLE ? sel.garagem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_') : sel.garagem ? 'METROPOLE' : 'todas';
  const nome = `OS_CFTV_${alvo}${sel.camera ? `_cam${sel.camera}` : ''}_${t.arq}.xlsx`;
  await baixar(wb, nome);
  return nome;
}
