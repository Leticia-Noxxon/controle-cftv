// Carregamento dos dados pré-processados, decodificação e cálculos com memoização.
// Site oficial (raiz): dados publicados em ./data/ (site/public/data)
const base = import.meta.env.BASE_URL;
const obter = (a) => fetch(`${base}data/${a}`).then((r) => { if (!r.ok) throw new Error(`${a}: HTTP ${r.status}`); return r.json(); });

export const POS = { 21: 'Frontal', 22: 'Frente', 23: 'Corredor 1', 24: 'Corredor 2', 25: 'Corredor 3', 26: 'Corredor 4' };
export const camNome = (c) => (POS[c] ? `Câmera ${c} · ${POS[c]}` : `Câmera id ${c}`);
export const D = {};

// ---------------------------------------------------------------------------------------------------------------
// Garagem/Empresa normalizada. Regra: garagem e empresa são a mesma coisa escrita de formas diferentes. A garagem de
// cada veículo é a EMPRESA do registro mais recente do prefixo no monitoramento (nunca fica "Não informado").
// Tabela explícita: nome no monitoramento (empresa) -> Garagem/Empresa exibida.
export const MAPA_EMPRESA = {
  'A2 TRANSPORTES': 'A2 Transportes',
  'ALFA RODOBUS': 'Alfa Rodobus',
  'ALFA RODOBUS SPE': 'Alfa Rodobus SPE',
  'GATO PRETO': 'Gato Preto',
  'GATO PRETO A1': 'Gato Preto A1',
  'METROPOLE - AE CARVALHO': 'Metrópole AE Carvalho',
  'METROPOLE - EXPANDIR': 'Metrópole Expandir (Brás)',
  'METROPOLE - IGUATEMI': 'Metrópole Iguatemi',
  'METROPOLE - IMPERADOR': 'Metrópole Imperador',
  'METROPOLE - ITAIM': 'Metrópole Itaim',
  'METROPOLE - MBOI - MIRIM': "Metrópole M'Boi Mirim",
  'METROPOLE PAULISTA - DEPINEDO': 'Metrópole Pinedo',
  'NORTE BUSS A1': 'Norte Buss A1',
  'NORTE BUSS A2': 'Norte Buss A2',
  NOXXONSAT: 'Noxxonsat',
  'SANTA BRIGIDA': 'Santa Brígida',
  'TRANS UNIÃO': 'Trans União',
  'TRANSUNIAO TRANSPORTES D7': 'Transunião Transportes D7',
  'VIA SUDESTE': 'Via Sudeste',
  'VIACAO GRAJAU': 'Viação Grajaú',
};
// Nome da garagem no formulário de manutenção / relatórios -> Garagem/Empresa (usado só quando o prefixo não está no
// monitoramento; nos demais casos vale a empresa do veículo).
export const MAPA_FORMULARIO = {
  'A2 Transportes': 'A2 Transportes',
  'Alfa Rodobus': 'Alfa Rodobus',
  'Alfa Rodobus SPE': 'Alfa Rodobus SPE',
  'Gato Preto - Mackenzie': 'Gato Preto',
  'Gato Preto - Portinari': 'Gato Preto',
  'Norte Buss A1': 'Norte Buss A1',
  'Norte Buss A2': 'Norte Buss A2',
  'Santa Brigida': 'Santa Brígida',
  'Via Sudeste Cursino': 'Via Sudeste',
  'Via Sudeste Sapopemba': 'Via Sudeste',
  'Viação Grajaú': 'Viação Grajaú',
  'Viação Metrópole AE Carvalho': 'Metrópole AE Carvalho',
  'Viação Metrópole Brás': 'Metrópole Expandir (Brás)',
  'Viação Metrópole Iguatemi': 'Metrópole Iguatemi',
  'Viação Metrópole Imperador': 'Metrópole Imperador',
  'Viação Metrópole Itaim': 'Metrópole Itaim',
  "Viação Metrópole M'Boi Mirim": "Metrópole M'Boi Mirim",
  'Viação Metrópole Pinedo': 'Metrópole Pinedo',
};
const titulo = (t) => String(t).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
// Nomes novos que ainda não estão na tabela: aparecem com a grafia do monitoramento em formato de título
export const garagemDaEmpresa = (e) => (e == null ? 'Sem empresa' : MAPA_EMPRESA[e] || titulo(e));
export const garagemDoFormulario = (g) => (g ? MAPA_FORMULARIO[g] || g : 'Sem empresa');

// Rótulos oficiais dos status (matriz diária, legenda, dicas, gráfico)
export const ROTULO = { on: 'Funcional', off: '100% Offline', sd: 'Erro de SD', fa: '1+ câm. com problema', nd: 'Sem conexão' };
export const ROTULO_CURTO = ROTULO;
export const DEF_STATUS = {
  on: 'Todos os registros do dia funcionais, sem erro',
  off: 'Todos os registros do dia offline',
  sd: 'Câmera conectada (nenhum registro offline), mas com erro de SD card em algum registro',
  fa: 'Algum registro offline sem ser tudo offline (problema de conexão / variação)',
  nd: 'Nenhum registro no dia',
};
export const CAMS_POS = [21, 22, 23, 24, 25, 26];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1].replace(/^./, (c) => c.toUpperCase())} de ${ym.slice(0, 4)}`;
// Opção extra do filtro de Empresa: agrupa todas as empresas cujo nome contém METROPOLE (sem diferenciar maiúsculas/acentos)
export const GRUPO_METROPOLE = '*METROPOLE';
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export const ehMetropole = (nome) => semAcento(nome).includes('METROPOLE');
export const empresaPassa = (nome, filtro) => !filtro || (filtro === GRUPO_METROPOLE ? ehMetropole(nome) : nome === filtro);

export async function carregar() {
  const [meta, frota, manut] = await Promise.all([obter('meta.json'), obter('frota.json'), obter('manut.json')]);
  Object.assign(D, { meta, dias: meta.dias, nd: meta.dias.length, empresas: meta.empresas, garagens: meta.garagens, cameras: meta.cameras, cobertura: meta.cobertura });
  D.W = meta.codec.largura;
  D.manut = new Map(manut.map((m) => [m.i, m]));
  D.veiculos = frota.veiculos.map((v) => { const empresa = v.e == null ? null : meta.empresas[v.e]; return { ...v, empresa: empresa || '—', garagem: garagemDaEmpresa(empresa) }; });
  D.garagens = [...new Set(D.veiculos.map((v) => v.garagem))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  D.meses = [...new Set(meta.dias.map((d) => d.slice(0, 7)))];
  D.porPrefixo = new Map(D.veiculos.map((v) => [v.p, v]));
  // índices por empresa / garagem / câmera
  D.idx = { garagem: new Map(), camera: new Map() };
  D.veiculos.forEach((v) => {
    const add = (m, k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    add(D.idx.garagem, v.garagem);
    v.c.forEach((c) => add(D.idx.camera, String(c)));
  });
  return D;
}

// Tempos por dia (minutos): string base 36, 3 valores por dia (online, falha, offline), largura fixa
const cacheT = new Map();
export function decodT(s) {
  if (!s) return null;
  if (cacheT.has(s)) return cacheT.get(s);
  const n = D.nd, W = D.W, out = new Int32Array(n * 3);
  for (let i = 0; i < n * 3; i += 1) out[i] = parseInt(s.substr(i * W, W), 36);
  cacheT.set(s, out);
  return out;
}

const camFiles = new Map();
export function carregarCamera(c) {
  if (!c) return Promise.resolve(null);
  if (!camFiles.has(c)) camFiles.set(c, obter(`cam/${c}.json`));
  return camFiles.get(c);
}
export const tempoCamera = (c) => camFiles.get(c);

const detCache = new Map();
export function detalhe(p) {
  const k = String(p % 64).padStart(2, '0');
  if (!detCache.has(k)) detCache.set(k, obter(`detalhe/${k}.json`));
  return detCache.get(k).then((d) => d[String(p)] || { t: {}, m: {} });
}

// Veículos que passam pelos filtros de cadastro (empresa, câmera, prefixo) — memoizado
let memoKey = '', memoRes = [];
export function veiculosFiltrados(F, comPrefixo = true) {
  const key = [F.empresa, F.camera, comPrefixo ? F.prefixo : ''].join('|');
  if (key === memoKey) return memoRes;
  let base = D.veiculos;
  if (F.camera) base = D.idx.camera.get(F.camera) || [];
  if (F.empresa) base = base.filter((v) => empresaPassa(v.garagem, F.empresa));
  const q = comPrefixo ? F.prefixo.split(/[\s,;]+/).filter(Boolean) : [];
  if (q.length) base = base.filter((v) => q.some((x) => String(v.p).includes(x)));
  memoKey = key; memoRes = base;
  return base;
}

export function faixaDias(F) {
  let a = 0, b = D.nd - 1;
  if (F.mes) { a = D.dias.findIndex((d) => d.startsWith(F.mes)); b = D.dias.findLastIndex((d) => d.startsWith(F.mes)); if (a < 0) return []; }
  if (F.de) { const i = D.dias.findIndex((d) => d >= F.de); a = i < 0 ? D.nd : i; }
  if (F.ate) { let i = -1; D.dias.forEach((d, k) => { if (d <= F.ate) i = k; }); b = i; }
  const out = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

// Estado do dia a partir dos registros horários do dia (máscara por câmera: 1 = teve registro funcional,
// 2 = teve registro com erro de SD, 4 = teve registro offline). Consideram-se as câmeras com registro no dia.
// on  = todas as câmeras funcionais (sem erro) em todos os registros;
// off = todas offline em todos os registros;
// sd  = nenhum registro offline, mas algum com erro de SD (câmera conectada, só erro de SD);
// fa  = qualquer outra combinação: algum registro offline sem ser tudo offline (conexão/variação) = 1+ câm. com problema;
// nd  = sem registro (Sem conexão). Com filtro de uma câmera, a mesma regra vale só para essa câmera.
export function estadoDia(v, i, cam) {
  let com = 0, soOn = 0, soOff = 0, algumOff = 0, algumSd = 0;
  for (const c in v.k) {
    if (cam && c !== String(cam)) continue;
    const m = Number(v.k[c][i] || 0);
    if (!m) continue;
    com += 1;
    if (m === 1) soOn += 1; else if (m === 4) soOff += 1;
    if (m & 4) algumOff += 1;
    if (m & 2) algumSd += 1;
  }
  if (!com) return 'nd';
  if (soOn === com) return 'on';
  if (soOff === com) return 'off';
  return !algumOff && algumSd ? 'sd' : 'fa';
}

// Tempos do dia (min) do veículo ou da câmera: [online, falha, offline]
export function tempos(v, i, cam) {
  const s = cam ? tempoCamera(cam)?.[v.p] : v.t;
  const t = decodT(s);
  if (!t) return [0, 0, 0];
  return [t[i * 3], t[i * 3 + 1], t[i * 3 + 2]];
}
export function dispPeriodo(v, dias, cam) {
  let ok = 0, tot = 0;
  dias.forEach((i) => { const [a, b, c] = tempos(v, i, cam); ok += a; tot += a + b + c; });
  return tot ? (100 * ok) / tot : null;
}
// Último código de cada câmera dentro do período (N online, O offline, 1–7 erro) — base dos cards
export function ultimoCodigo(v, c, dias) {
  const l = v.l[c];
  if (!l) return null;
  for (let k = dias.length - 1; k >= 0; k -= 1) { const x = l[dias[k]]; if (x !== '.') return x; }
  return null;
}
export const catCodigo = (x) => (x === 'N' ? 'on' : x === 'O' ? 'off' : 'fa');

// Situação do veículo pelo último registro de cada câmera no período (mesma base dos cards).
// cams: {câmera: 'on' | 'fa' (erro de SD) | 'off'}; fa = nº de câmeras com erro de SD.
export function situacao(v, dias, cam) {
  const cams = {};
  let on = 0, fa = 0, off = 0;
  v.c.forEach((c) => {
    if (cam && String(c) !== String(cam)) return;
    const x = ultimoCodigo(v, c, dias);
    if (!x) return;
    const k = catCodigo(x);
    cams[c] = k;
    if (k === 'on') on += 1; else if (k === 'off') off += 1; else fa += 1;
  });
  const n = on + fa + off;
  // cat (partição): on = todas funcionais; off = todas offline; sd = só erro de SD (nenhuma offline);
  // fa = alguma offline sem ser todas (1+ câm. com falha de conexão); nd = sem registro
  const cat = !n ? 'nd' : on === n ? 'on' : off === n ? 'off' : !off ? 'sd' : 'fa';
  return { cams, on, fa, off, n, cat, falha: fa + off > 0 };
}
// Categorias do clique nos cards: on = tem câmera funcional; fa = tem câmera com erro de SD; off = tem câmera offline; veic = fa ou off
export const noCard = (s, card) => !card || (card === 'on' ? s.on > 0 : card === 'fa' ? s.fa > 0 : card === 'off' ? s.off > 0 : s.falha);

export function posicionarTip(tip, ev) {
  tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(ev.clientX + 12, innerWidth - w - 8))}px`;
  tip.style.top = `${ev.clientY + 14 + h > innerHeight ? Math.max(8, ev.clientY - h - 10) : ev.clientY + 14}px`;
}

// Manutenções do veículo no dia; com filtro de câmera, só as que citam a câmera (ou não informam câmera)
export function manutDia(v, i, cam) {
  const evs = (v.mv[i] || []).map((k) => D.manut.get(k)).filter(Boolean);
  return cam ? evs.filter((m) => !(m.cams || []).length || m.cams.map(String).includes(String(cam))) : evs;
}

// Formatação
export const fmtN = (n) => Number(n).toLocaleString('pt-BR');
export const fmtP = (v, d = 1) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d })}%`);
const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const diaSemana = (iso) => SEM[new Date(`${iso}T12:00:00`).getDay()];
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
// Leitura diária SEM horário (Relatório CFTV, decisão de 07/10/2026): a câmera c só tem, no dia i, a leitura do
// relatório (situação do dia, sem hora). Conta na cor do dia e na situação atual; não tem tempos nem linha do tempo.
export const semHorario = (v, c, i) => !!v.sh?.[c]?.includes(i);
// Último registro (os.json): 'AAAA-MM-DDTHH:MM' ou só 'AAAA-MM-DD' quando é uma leitura diária sem horário
export const dataHoraU = (u) => (!u ? '—' : u.length <= 10 ? `${dmy(u)} (sem horário)` : `${dmy(u.slice(0, 10))} ${u.slice(11, 16)}`);

// durações arredondadas a 5 min (a coleta é aproximadamente horária; não há precisão de minuto)
export function dur(min) {
  const m = Math.round(min / 5) * 5;
  if (m <= 0) return min > 0 ? '< 5 min' : '0 min';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}` : `${r} min`;
}
export const hhmm = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const svg = (d, w = 18) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONE = {
  grade: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  grafico: svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  ok: svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'),
  sd: svg('<path d="M7 3h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 7v3M12 7v3M15 8v2"/>'),
  off: svg('<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M19 12.9a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.7"/><path d="M22 8.8A15 15 0 0 0 11 5"/><circle cx="12" cy="20" r="0.6"/>'),
  alerta: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  sol: '<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><g stroke="#4B6B56" stroke-width="1.6" stroke-linecap="round">' + Array.from({ length: 24 }, (_, k) => { const a = (k * Math.PI) / 12; return `<line x1="${(20 + 5 * Math.cos(a)).toFixed(2)}" y1="${(20 + 5 * Math.sin(a)).toFixed(2)}" x2="${(20 + 18 * Math.cos(a)).toFixed(2)}" y2="${(20 + 18 * Math.sin(a)).toFixed(2)}"/>`; }).join('') + '</g></svg>',
  painel: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  calgrade: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>'),
  solar: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  lua: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'),
  tabela: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/>'),
  matriz: svg('<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="10" y="3" width="5" height="5" rx="1.2"/><rect x="17" y="3" width="4" height="5" rx="1.2"/><rect x="3" y="10" width="5" height="5" rx="1.2"/><rect x="10" y="10" width="5" height="5" rx="1.2"/><rect x="17" y="10" width="4" height="5" rx="1.2"/><rect x="3" y="17" width="5" height="4" rx="1.2"/><rect x="10" y="17" width="5" height="4" rx="1.2"/><rect x="17" y="17" width="4" height="4" rx="1.2"/>'),
  excel: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 12 4 5M13 12l-4 5"/>', 16),
  chave: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.3-.7-.7-2.3z"/>', 16),
  os: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v3h6V3M9 11h6M9 15h4"/>', 16),
  dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 15),
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};
