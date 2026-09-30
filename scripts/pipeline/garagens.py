"""Garagem por prefixo, reunindo todas as fontes que trazem garagem.

Fontes verificadas (detecção pelo nome da coluna, sem depender de posição):
  - CSVs do monitoramento: coluna 'garagem' (ou alias) — se existir; hoje nenhum CSV do BigQuery tem essa coluna.
  - Relatório CFTV diário (xlsx): qualquer coluna cujo nome contenha 'garag' — hoje não existe.
  - Formulário de manutenção: coluna 'Garagem' (linhas do layout antigo já realinhadas; duplicadas descartadas).
Normalização: trim, espaços colapsados; '', '-', 'N/A', 'null', 'undefined', 'none' = vazio.
Conflito (mesmo prefixo com garagens diferentes entre fontes/datas): vence o valor mais recente (maior data de
referência); em empate de data, a ordem de prioridade da fonte (formulário > relatório > monitoramento).
A garagem NUNCA é deduzida da empresa. Sem nenhum valor válido -> 'Não informado' no site.
"""
import re
import unicodedata
from collections import defaultdict

import openpyxl

from . import config

NULOS = {'', '-', '--', 'n/a', 'na', 'null', 'none', 'undefined', 'nan', '—'}
PRIORIDADE = {'formulario': 3, 'relatorio': 2, 'monitoramento': 1}


def normalizar(v):
    if v is None:
        return None
    t = unicodedata.normalize('NFC', re.sub(r'\s+', ' ', str(v))).strip()
    return None if t.lower() in NULOS else t


def do_monitoramento(con):
    rows = con.execute("""SELECT prefixo, garagem, max(ts_local) FROM registros WHERE garagem IS NOT NULL GROUP BY 1, 2""").fetchall()
    return [(int(p), g, ts.isoformat(), 'monitoramento') for p, g, ts in rows]


def do_relatorio():
    out = []
    for path in config.arquivos_relatorio():
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True)
            cab = [str(c or '').strip() for c in next(it, [])]
            ig = [i for i, c in enumerate(cab) if 'garag' in c.lower()]
            if not ig or 'Prefixo' not in cab:
                continue
            ip, idt = cab.index('Prefixo'), (cab.index('Data') if 'Data' in cab else None)
            for r in it:
                try:
                    p = int(r[ip])
                except (TypeError, ValueError):
                    continue
                d = r[idt] if idt is not None else None
                out.append((p, r[ig[0]], d.isoformat() if hasattr(d, 'isoformat') else '', 'relatorio'))
        wb.close()
    return out


def do_formulario(forms):
    return [(f['prefixo'], f['garagem'], f['datahora'] or '', 'formulario') for f in forms
            if f['duplicada_de'] is None and f['prefixo'] is not None]


def resolver(*fontes):
    cand = defaultdict(list)
    lidos = defaultdict(int)
    for fonte in fontes:
        for p, g, ref, origem in fonte:
            lidos[origem] += 1
            g = normalizar(g)
            if g:
                cand[p].append((ref or '', PRIORIDADE[origem], g, origem))
    mapa, conflitos = {}, {}
    for p, vs in cand.items():
        vs.sort()
        mapa[p] = vs[-1][2]
        distintos = sorted({v[2] for v in vs})
        if len(distintos) > 1:
            conflitos[p] = {'valores': distintos, 'escolhido': vs[-1][2], 'origem': vs[-1][3]}
    stats = {'linhas_lidas_por_fonte': dict(lidos), 'prefixos_com_garagem': len(mapa), 'conflitos': len(conflitos),
             'valores_distintos': sorted(set(mapa.values()))}
    print(f"garagens: {len(mapa)} prefixos com garagem; {len(conflitos)} conflito(s) resolvido(s) pelo valor mais recente; lidos {dict(lidos)}")
    return mapa, conflitos, stats
