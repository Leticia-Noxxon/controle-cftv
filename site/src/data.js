// Carregamento dos dados pré-processados (site/public/data) e estruturas derivadas.
import { cat, CAMS } from './util.js';

const base = import.meta.env.BASE_URL;
const obter = (arq) => fetch(`${base}data/${arq}`).then((r) => { if (!r.ok) throw new Error(`${arq}: HTTP ${r.status}`); return r.json(); });

export async function carregar() {
  const [meta, frota, problemas, manut] = await Promise.all([obter('meta.json'), obter('frota.json'), obter('problemas.json'), obter('manutencoes.json')]);
  const D = { meta, dias: frota.dias, empresas: frota.empresas, problemas, eventos: manut.eventos, formularios: manut.formularios };
  D.formPorId = new Map(D.formularios.map((f) => [f.id, f]));
  D.veiculos = frota.veiculos.map((v) => {
    const u = {};
    Object.entries(v.u).forEach(([c, [code, ts]]) => { u[c] = { code, ts, cat: cat(code), desatualizado: ts.slice(0, 10) < meta.monitoramento.ultimo_dia }; });
    return { ...v, empresa: v.e == null ? '—' : frota.empresas[v.e], empresasHist: v.es ? v.es.map((i) => frota.empresas[i]) : null, ult: u };
  });
  D.porPrefixo = new Map(D.veiculos.map((v) => [v.p, v]));
  D.garagens = [...new Set(D.veiculos.map((v) => v.g).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  D.eventos.forEach((e) => { const v = D.porPrefixo.get(e.prefixo); e.empresa = v ? v.empresa : '—'; e.garagem = e.garagens.join(', ') || v?.g || '—'; });
  D.camerasExtras = [...new Set(D.veiculos.flatMap((v) => v.c))].filter((c) => !CAMS.includes(c));
  D.tecnicos = [...new Set(D.eventos.flatMap((e) => e.tecnicos))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return D;
}

const cacheDet = new Map();
export function detalhe(prefixo) {
  const k = String(prefixo % 64).padStart(2, '0');
  if (!cacheDet.has(k)) cacheDet.set(k, obter(`detalhe/${k}.json`));
  return cacheDet.get(k).then((d) => d[String(prefixo)] || {});
}
