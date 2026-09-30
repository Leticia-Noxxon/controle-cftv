// Carregamento dos dados pré-processados, decodificação e cálculos com memoização.
const base = import.meta.env.BASE_URL;
const obter = (a) => fetch(`${base}data/${a}`).then((r) => { if (!r.ok) throw new Error(`${a}: HTTP ${r.status}`); return r.json(); });

export const POS = { 21: 'Frontal', 22: 'Frente', 23: 'Corredor 1', 24: 'Corredor 2', 25: 'Corredor 3', 26: 'Corredor 4' };
export const camNome = (c) => (POS[c] ? `Câmera ${c} · ${POS[c]}` : `Câmera id ${c}`);
export const SEM_GARAGEM = 'Não informado';
export const D = {};
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
  D.veiculos = frota.veiculos.map((v) => ({ ...v, empresa: v.e == null ? '—' : meta.empresas[v.e], garagem: v.g || SEM_GARAGEM }));
  D.porPrefixo = new Map(D.veiculos.map((v) => [v.p, v]));
  // índices por empresa / garagem / câmera
  D.idx = { empresa: new Map(), garagem: new Map(), camera: new Map() };
  D.veiculos.forEach((v) => {
    const add = (m, k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    add(D.idx.empresa, v.empresa); add(D.idx.garagem, v.garagem);
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
  if (F.empresa) base = base.filter((v) => empresaPassa(v.empresa, F.empresa));
  const q = comPrefixo ? F.prefixo.split(/[\s,;]+/).filter(Boolean) : [];
  if (q.length) base = base.filter((v) => q.some((x) => String(v.p).includes(x)));
  memoKey = key; memoRes = base;
  return base;
}

export function faixaDias(F) {
  let a = 0, b = D.nd - 1;
  if (F.de) { const i = D.dias.findIndex((d) => d >= F.de); a = i < 0 ? D.nd : i; }
  if (F.ate) { let i = -1; D.dias.forEach((d, k) => { if (d <= F.ate) i = k; }); b = i; }
  const out = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

// Estado do dia a partir dos registros horários do dia (máscara por câmera: 1 = teve registro online ok,
// 2 = teve registro com erro de SD, 4 = teve registro offline). Consideram-se as câmeras com registro no dia.
// on = todas as câmeras online (sem erro) em todos os registros; off = todas offline em todos os registros;
// fa = qualquer outra combinação com dados (erro de SD, offline em parte dos registros ou variação); nd = sem registro.
// Com filtro de uma câmera, a mesma regra vale para essa câmera.
export function estadoDia(v, i, cam) {
  let com = 0, soOn = 0, soOff = 0;
  for (const c in v.k) {
    if (cam && c !== String(cam)) continue;
    const m = Number(v.k[c][i] || 0);
    if (!m) continue;
    com += 1;
    if (m === 1) soOn += 1; else if (m === 4) soOff += 1;
  }
  if (!com) return 'nd';
  return soOn === com ? 'on' : soOff === com ? 'off' : 'fa';
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

// Formatação
export const fmtN = (n) => Number(n).toLocaleString('pt-BR');
export const fmtP = (v, d = 1) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d })}%`);
const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const diaSemana = (iso) => SEM[new Date(`${iso}T12:00:00`).getDay()];
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
// durações arredondadas a 5 min (a coleta é aproximadamente horária; não há precisão de minuto)
export function dur(min) {
  const m = Math.round(min / 5) * 5;
  if (m <= 0) return min > 0 ? '< 5 min' : '0 min';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}` : `${r} min`;
}
export const hhmm = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ICONE = {
  dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};
