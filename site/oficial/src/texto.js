// Limpeza do texto da manutenção para a OS: corrige erros de digitação e caixa alta, remove ruído (prefixo repetido,
// "+N item(ns)", "ANOMALIAS") e monta um resumo curto "data – Problema: … Ação: …" sem mudar o sentido.
const CORRECOES = [
  [/\bcameras\b/gi, 'câmeras'], [/\bcamera\b/gi, 'câmera'], [/\bcam\s?(\d{2})\b/gi, 'câmera $1'],
  [/\bsw(icth|ith|itch)\b/gi, 'switch'], [/\bnescess[aá]rio\b/gi, 'necessário'], [/\bgrava[cç]ao\b/gi, 'gravação'],
  [/\breecrimpagem\b/gi, 'recrimpagem'], [/\best[aá]va\b/gi, 'estava'], [/\bindentificad/gi, 'identificad'],
  [/\binsirido\b/gi, 'inserido'], [/\banimalias\b/gi, 'anomalias'], [/\bfuncionan\b/gi, 'funcionando'],
  [/\bpoe\b/gi, 'PoE'], [/\bsd\b/gi, 'SD'], [/\bucp\b/gi, 'UCP'], [/\brj\s?45\b/gi, 'RJ45'], [/\bip\b/gi, 'IP'], [/\bhd\b/gi, 'HD'], [/\bwi-?fi\b/gi, 'Wi-Fi'],
  [/\bfoi feito a\b/gi, 'foi feita a'], [/\bfeito a (troca|substitui[cç][aã]o|formata[cç][aã]o|configura[cç][aã]o|fixa[cç][aã]o|limpeza|recrimpagem|crimpagem)/gi, 'feita a $1'],
  [/\b(foi )?realizado a\b/gi, (m, f) => `${f || ''}realizada a`], [/\bc(\d)\b/g, 'C$1'],
];
const SIGLAS = new Set(['RJ45', 'NVR', 'DVR', 'MDVR', 'UCP', 'GPS', 'WIFI', 'ANOMALIAS']);
const RUIDO = /^(\d{4,6}|anomalias?|\+\d+ item\(ns\) no registro completo|obs:?)$/i;

export function limpar(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[-–\s]*\d{4,6}(\s*[-–:]\s*|\s+(?=[A-Za-zÀ-ÿ]))/, '').replace(/^[-–\s]+/, ''); // prefixo digitado no início
  if (!s || RUIDO.test(s)) return '';
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length >= 5 && letras === letras.toUpperCase()) s = s.toLowerCase(); // texto todo em maiúsculas
  else s = s.replace(/\b[A-ZÀ-Ý]{4,}\b/g, (w) => (SIGLAS.has(w) ? w : w.toLowerCase())); // palavras em maiúsculas no meio do texto
  CORRECOES.forEach(([re, rep]) => { s = s.replace(re, rep); });
  s = s.replace(/(\d{2})\s+(?=\d{2}\b)/g, '$1, ') // "21 22 e 23" -> "21, 22 e 23"
    .replace(/\s*\/\s*$/, '').replace(/\s*\/\s*/g, '/').replace(/([a-zà-ÿ])\/(?=[a-zà-ÿ])/g, '$1 / ')
    .replace(/\s+([,.;!?])/g, '$1').replace(/[.;,\s]+$/, '').replace(/!+/g, '.');
  if (/\bC\d\b/.test(s) && s.includes('/')) s = porCodigoCamera(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "C2/C5 formatação de cartão/configuração atualizada/ C1/C6 câmera em curto" ->
// "C2/C5: formatação de cartão, configuração atualizada; C1/C6: câmera em curto"
function porCodigoCamera(s) {
  const toks = s.replace(/\s+(?=C\d\b)/g, '/').replace(/\b(C\d)\s+/g, '$1/').split(/\s*\/\s*/).map((x) => x.trim()).filter(Boolean);
  const seg = [];
  let cods = [], acts = [];
  const fecha = () => { if (cods.length || acts.length) seg.push(cods.length ? `${cods.join('/')}: ${acts.join(', ') || '—'}` : acts.join(', ')); cods = []; acts = []; };
  toks.forEach((t) => { if (/^C\d$/.test(t)) { if (acts.length) fecha(); cods.push(t); } else acts.push(t); });
  fecha();
  return seg.join('; ');
}

const cortar = (s, n) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n).replace(/[,;:\s]+$/, '')}…`);
// problema do formulário: "Câm 21: Câmera travada, Configuração incorreta" -> "Câm 21: câmera travada, configuração incorreta"
const minus = (x) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x);
const probItem = (t) => limpar(t).replace(/^(Câm \d+):\s*(.*)$/, (m, a, b) => `${a}: ${b.split(/,\s*/).map(minus).join(', ')}`);

export function resumoManutencao(m, dmy) {
  if (!m) return '—';
  const prob = (m.problema || []).map(probItem).filter(Boolean);
  const acao = (m.acao || []).map(probItem).filter(Boolean);
  const partes = [];
  const juntar = (xs) => xs.slice(0, 2).map((x, k) => (k && !/^Câm \d/.test(x) ? minus(x) : x)).join('; ');
  if (prob.length) partes.push(`Problema: ${cortar(juntar(prob), 110)}`);
  if (acao.length) partes.push(`Ação: ${cortar(juntar(acao), 150)}`);
  if (!partes.length) partes.push('Sem descrição');
  return `${dmy(m.d)} – ${partes.map((p) => `${p}.`).join(' ').replace(/…\./g, '…')}`;
}
