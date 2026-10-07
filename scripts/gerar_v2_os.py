"""Dados auxiliares da Ordem de Serviço da versão v2 (site/public/os.json).

Lê a base de trabalho do pipeline (data/processed/_trabalho.duckdb, tabela camera_dia) e grava, por prefixo e câmera:
  - u: data/hora local do último registro da câmera em todo o período dos dados ("AAAA-MM-DDTHH:MM"). Se a informação
       mais recente da câmera for uma leitura diária SEM horário (Relatório CFTV, decisão de 07/10/2026) de um dia
       posterior ao do último registro com horário, u é só a data ("AAAA-MM-DD"); o site mostra "DD/MM (sem horário)"
       e, na regra de 24 h, considera a câmera dentro do prazo se esse dia não for anterior ao dia do limite;
  - m: nº de mudanças de estado (Funcional ↔ Erro ↔ Offline) nos últimos 7 dias com dados (inclui o último dia).
A transição é contada no registro em que o estado muda em relação ao registro anterior da mesma câmera (coluna
transicao de reg3, somada por dia em camera_dia.transicoes). A sequência de dias com problema (início e duração) é
calculada no navegador a partir das máscaras diárias de frota.json (ver site/v2/src/os.js).
Usado pelo site oficial (raiz). É chamado ao final de scripts/atualizar_dados.py e pode rodar sozinho.
"""
import json
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import config  # noqa: E402

SAIDA = config.ROOT / 'site' / 'public' / 'os.json'
JANELA_DIAS = 7


def gerar(con=None):
    fechar = con is None
    if con is None:
        con = duckdb.connect(str(config.DUCKDB), read_only=True)
    ultimo_dia = con.execute('SELECT max(data) FROM camera_dia').fetchone()[0]
    dias = [r[0] for r in con.execute('SELECT DISTINCT data FROM camera_dia ORDER BY data DESC LIMIT ?', [JANELA_DIAS]).fetchall()]
    ini = min(dias)
    df = con.execute("""SELECT prefixo, camera, strftime(max(ultimo), '%Y-%m-%dT%H:%M') u_hora,
                               strftime(max(data) FILTER (WHERE sem_horario), '%Y-%m-%d') u_dia,
                               CAST(coalesce(sum(transicoes) FILTER (WHERE data >= ?), 0) AS INT) m
                        FROM camera_dia GROUP BY 1, 2 ORDER BY 1, 2""", [ini]).fetchdf()
    df['u'] = [d if isinstance(d, str) and (not isinstance(h, str) or d > h[:10]) else h for h, d in zip(df.u_hora, df.u_dia)]
    v = {}
    for r in df.itertuples():
        v.setdefault(str(int(r.prefixo)), {})[str(int(r.camera))] = [r.u if isinstance(r.u, str) else None, int(r.m)]
    out = {'janela': [str(ini)[:10], str(ultimo_dia)[:10]], 'janela_dias': JANELA_DIAS, 'v': v}
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if fechar:
        con.close()
    return {'arquivo': str(SAIDA), 'prefixos': len(v), 'janela': out['janela']}


if __name__ == '__main__':
    print(gerar())
