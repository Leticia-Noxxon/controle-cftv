"""Leituras diárias (sem horário) do 'Relatório CFTV - DD.MM.AAAA.xlsx' — decisão da Letícia em 07/10/2026
(REGRAS_PROJETO 19): "mesmo que não tenha horário, coloque as informações do dia".

O relatório tem 1 linha por veículo por dia, com o texto de cada câmera (Câmera 21…26) e SEM horário. Cada câmera com
valor vira UMA leitura diária (tabela leitura_dia: prefixo, câmera, data, código, origem='relatorio_diario',
sem_horario=TRUE). Nenhum horário é inventado: a leitura entra só na cor do dia (Matriz diária), no último código do
dia (situação atual, quando é a informação mais recente) e nas contagens por dia; não entra nos tempos (minutos),
na disponibilidade nem na linha do tempo horária.

Regras:
- texto da câmera: mesmas regras do relatório ('-' = sem câmera, vazio = fora da grade, OFFLINE, ONLINE com SD/Login/
  Gravação; texto não previsto -> '?' e listado);
- câmeras: reconciliadas com o histórico do veículo (mesma regra 3-A do painel). Histórico = câmeras do veículo nos
  registros com horário (BigQuery + painel). Câmeras do relatório contidas no histórico -> como estão; mesma
  quantidade e números diferentes -> mapeamento posicional em ordem crescente; quantidade diferente -> pendente
  (o veículo não recebe leitura diária naquele dia);
- garagem/empresa: o relatório não tem garagem; vale o histórico do veículo no projeto (nada muda). Veículo sem
  histórico: entra com a empresa do relatório se ela for exatamente uma empresa já conhecida; senão fica pendente;
- precedência: leitura com horário (BigQuery ou painel) vence. A leitura diária de (prefixo, câmera, dia) é descartada
  ('substituída') se existir qualquer registro com horário da mesma câmera no mesmo dia; e TODAS as leituras diárias
  de um dia são descartadas quando as exportações do BigQuery cobrem o dia inteiro (registros em 24 horas
  distintas). Assim, uma exportação futura do BigQuery que cubra 06/10 substitui essas linhas sem nenhuma ação manual.
"""
import json
import unicodedata

import pandas as pd

from . import config, relatorio

ORIGEM = 'relatorio_diario'
MARCA_PAINEL = '-painel_'


def _norm(t):
    t = unicodedata.normalize('NFKD', str(t or '')).encode('ascii', 'ignore').decode()
    return ' '.join(t.upper().split())


def _estado(c):
    return 'N' if c == 'N' else 'O' if c == 'O' else '?' if c == '?' else 'F'


def carregar(con):
    """Cria as tabelas leitura_dia (leituras usadas) e leitura_dia_todas (todas, com a situação) e devolve o resumo."""
    rels = [r for r in relatorio.ler() if r['data']]
    hist = {int(p): sorted(int(c) for c in cs) for p, cs in con.execute('SELECT prefixo, list(DISTINCT camera) FROM registros GROUP BY 1').fetchall()}
    emp_hist = {int(p): e for p, e in con.execute('SELECT prefixo, arg_max(empresa, ts_utc) FROM registros GROUP BY 1').fetchall()}
    conhecidas = {_norm(e): e for (e,) in con.execute('SELECT DISTINCT empresa FROM registros WHERE empresa IS NOT NULL').fetchall()}
    horas_bq = {str(d): int(h) for d, h in con.execute(
        f"SELECT data, count(DISTINCT hora) FROM registros WHERE arquivo NOT LIKE '%{MARCA_PAINEL}%' GROUP BY 1").fetchall()}
    linhas, pend, resumo = [], [], []
    for r in rels:
        data = r['data']
        cont = {'arquivo': r['arquivo'], 'data': data, 'veiculos_no_relatorio': len(r['registros']), 'sem_cameras': 0,
                'remapeados': 0, 'novos': 0, 'pendentes': 0}
        for p, x in r['registros'].items():
            agora = [c for c in config.CAMERAS if x['cams'].get(c, '.') not in ('-', '.')]
            if not agora:
                cont['sem_cameras'] += 1
                continue
            h = hist.get(p)
            mapa, nota, motivo = {c: c for c in agora}, '', None
            empresa = emp_hist.get(p)
            if h is None:
                empresa = conhecidas.get(_norm(x['empresa']))
                if empresa is None:
                    motivo = f"veículo sem histórico e empresa do relatório não reconhecida ({x['empresa']!r})"
                else:
                    cont['novos'] += 1
            elif not set(agora) <= set(h):
                if len(agora) == len(h):
                    mapa = dict(zip(agora, h))
                    nota = '; '.join(f'Câmera {a}→{b}' for a, b in mapa.items() if a != b)
                    cont['remapeados'] += 1
                else:
                    motivo = f'quantidade diferente do histórico (relatório {len(agora)} câmera(s) {agora}, histórico {len(h)} {h})'
            if motivo:
                cont['pendentes'] += 1
                pend.append({'arquivo': r['arquivo'], 'data': data, 'linha': x['linha'], 'prefixo': p, 'empresa_relatorio': x['empresa'],
                             'cameras_relatorio': ', '.join(map(str, agora)), 'cameras_historico': ', '.join(map(str, h or [])), 'motivo': motivo})
                continue
            for c in agora:
                cod = x['cams'][c]
                linhas.append({'arquivo': r['arquivo'], 'linha_excel': x['linha'], 'data': data, 'prefixo': p, 'camera': mapa[c],
                               'camera_relatorio': c, 'codigo': cod, 'estado': _estado(cod),
                               'erro_bits': int(cod) if cod.isdigit() else 0, 'texto_original': str(x['textos'].get(c)),
                               'empresa': empresa, 'empresa_relatorio': x['empresa'], 'reconciliacao': nota,
                               'status_relatorio': x['status'], 'origem': ORIGEM})
        resumo.append(cont)
    cols = ['arquivo', 'linha_excel', 'data', 'prefixo', 'camera', 'camera_relatorio', 'codigo', 'estado', 'erro_bits', 'texto_original',
            'empresa', 'empresa_relatorio', 'reconciliacao', 'status_relatorio', 'origem']
    df = pd.DataFrame(linhas, columns=cols)
    df['data'] = pd.to_datetime(df['data']).dt.date
    con.register('_ld', df)
    con.execute(f"""CREATE OR REPLACE TABLE leitura_dia_todas AS
      WITH chaves AS (SELECT DISTINCT prefixo, camera, data FROM registros WHERE data IN (SELECT DISTINCT data FROM _ld)),
      cob AS (SELECT data, count(DISTINCT hora) horas FROM registros WHERE arquivo NOT LIKE '%{MARCA_PAINEL}%' GROUP BY 1)
      SELECT l.*, CASE WHEN coalesce(cob.horas, 0) >= 24 THEN 'substituida: dia inteiro coberto pelo BigQuery'
                       WHEN k.prefixo IS NOT NULL THEN 'substituida: há registro com horário da mesma câmera no dia'
                       ELSE 'usada' END AS situacao
      FROM _ld l LEFT JOIN cob USING (data)
      LEFT JOIN chaves k ON k.prefixo = l.prefixo AND k.camera = l.camera AND k.data = l.data""")
    con.unregister('_ld')
    con.execute("""CREATE OR REPLACE TABLE leitura_dia AS
      SELECT arquivo, linha_excel, data, CAST(prefixo AS BIGINT) prefixo, CAST(camera AS INT) camera, codigo, estado, erro_bits, empresa, origem
      FROM leitura_dia_todas WHERE situacao = 'usada'""")
    sit = {(str(d), s): n for d, s, n in con.execute('SELECT data, situacao, count(*) FROM leitura_dia_todas GROUP BY ALL').fetchall()}
    for c in resumo:
        u = con.execute('SELECT count(*), count(DISTINCT prefixo) FROM leitura_dia WHERE data = ?', [c['data']]).fetchone()
        c.update({'horas_bigquery_no_dia': horas_bq.get(c['data'], 0), 'leituras_usadas': int(u[0]), 'veiculos_com_leitura': int(u[1]),
                  'substituidas_mesma_camera': int(sit.get((c['data'], 'substituida: há registro com horário da mesma câmera no dia'), 0)),
                  'substituidas_dia_coberto': int(sit.get((c['data'], 'substituida: dia inteiro coberto pelo BigQuery'), 0))})
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY (SELECT * FROM leitura_dia_todas ORDER BY data, prefixo, camera) TO '{config.PROCESSED / 'leituras_diarias.csv'}' (HEADER)")
    pd.DataFrame(pend, columns=['arquivo', 'data', 'linha', 'prefixo', 'empresa_relatorio', 'cameras_relatorio', 'cameras_historico', 'motivo']) \
        .to_csv(config.PROCESSED / 'leituras_diarias_pendentes.csv', index=False, encoding='utf-8-sig')
    (config.PROCESSED / 'leituras_diarias_resumo.json').write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding='utf-8')
    return resumo
