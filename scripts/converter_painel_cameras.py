"""Converte as planilhas exportadas do painel "Manutenção Câmeras" (manutencao-cameras-cftv*.xlsx, uma por operadora)
para o layout dos bq-results-*.csv, para entrarem na carga normal (normalização + deduplicação).

O painel mostra, para cada câmera, o registro mais recente do mesmo monitoramento do BigQuery, escrito de outra forma:
  Prefixo -> prefixo_veiculo · Operadora -> empresa · Câmera (posição) -> id_camera · Status/SD/Login/Gravação -> status/
  sdcard/login/recording (valores mantidos; '-' vira vazio na normalização, como no BigQuery) · Última Transmissão
  (horário de Brasília, 'DD/MM/AAAA, HH:MM:SS') -> timestamp em UTC.
Posição -> câmera (mapeamento confirmado, REGRAS_PROJETO 3): FRONTAL 1001 (21), FRENTE 1002 (22), CORREDOR 1 1003 (23),
"CORREDOR" sozinho = CORREDOR 1, CORREDOR 2 1004 (24), CORREDOR 3 1005 (25), CORREDOR 4 1006 (26).
Sem id_veiculo, id_empresa e serial_modulo (o painel não traz). Placa, posição e horário originais vão em colunas extras
(placa, camera_painel, ultima_transmissao_painel, linha_planilha), que a carga ignora.

Conflito com o histórico do BigQuery (posição que não existe entre as câmeras do veículo no BigQuery, ou a mesma posição
repetida) — decisão da Letícia em 07/10/2026 (REGRAS_PROJETO 3-A): vale o histórico. Regra determinística:
- histórico = câmeras (id_camera) do veículo nas exportações do BigQuery;
- mesma quantidade de leituras no painel e de câmeras no histórico -> mapeamento posicional, em ordem: as leituras
  ordenadas por posição (FRONTAL, FRENTE, CORREDOR 1…4) e, em empate, pela linha da planilha, vão para as câmeras do
  histórico em ordem crescente (ex.: 'CORREDOR' com histórico só 1001 -> 1001; 'FRONTAL' duas vezes com histórico
  1001 e 1002 -> 1001 e 1002). A posição original fica em camera_painel e o id dela em id_camera_painel;
- quantidade diferente, ou veículo sem histórico no BigQuery -> ambíguo: as linhas do veículo NÃO entram na carga e vão
  para data/raw/painel_pendentes/<arquivo>.csv com o motivo.
Planilhas com conteúdo idêntico a outra já convertida são puladas. O .xlsx original não é alterado.

Uso: python scripts/converter_painel_cameras.py ARQ1.xlsx [ARQ2.xlsx ...]   (grava em data/raw/)
"""
import csv
import datetime as dt
import hashlib
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import config  # noqa: E402

POSICAO_ID = {'FRONTAL': 1001, 'FRENTE': 1002, 'CORREDOR': 1003, 'CORREDOR 1': 1003, 'CORREDOR 2': 1004, 'CORREDOR 3': 1005, 'CORREDOR 4': 1006}
COLUNAS = ['Prefixo', 'Placa', 'Operadora', 'Câmera', 'Status', 'SD', 'Login', 'Gravação', 'Última Transmissão']
SAIDA = ['timestamp', 'id_veiculo', 'prefixo_veiculo', 'id_empresa', 'empresa', 'id_camera', 'serial_modulo', 'latitude', 'longitude',
         'status', 'sdcard', 'login', 'recording', 'placa', 'camera_painel', 'ultima_transmissao_painel', 'linha_planilha',
         'id_camera_painel', 'reconciliacao']
TZ = ZoneInfo(config.TZ)
MARCA = '-painel_'   # identifica no nome do CSV os arquivos vindos do painel


def cameras_bigquery():
    """prefixo -> conjunto de id_camera já vistos nas exportações do BigQuery (sem os CSVs convertidos do painel)."""
    import duckdb
    arqs = [str(a) for a in config.arquivos_monitoramento() if MARCA not in a.name]
    if not arqs:
        return {}
    con = duckdb.connect()
    sql = ' UNION '.join(f"SELECT DISTINCT TRY_CAST(prefixo_veiculo AS BIGINT) p, TRY_CAST(id_camera AS INT) c FROM read_csv('{a}', header=true, all_varchar=true)" for a in arqs)
    out = {}
    for p, c in con.execute(sql).fetchall():
        if p is not None and c is not None:
            out.setdefault(p, set()).add(c)
    return out


def ler(origem):
    ws = openpyxl.load_workbook(origem, read_only=True, data_only=True).worksheets[0]
    it = ws.iter_rows(values_only=True)
    cab = [str(c).strip() if c is not None else '' for c in next(it)]
    falta = [c for c in COLUNAS if c not in cab]
    if falta:
        raise SystemExit(f'{origem}: colunas ausentes {falta} (cabeçalho: {cab})')
    idx = {c: cab.index(c) for c in COLUNAS}
    linhas = []
    for n, r in enumerate(it, start=2):
        if all(v is None or str(v).strip() == '' for v in r):
            continue
        linhas.append((n, {c: ('' if r[i] is None else str(r[i])) for c, i in idx.items()}))
    return linhas


def converter(origens, destino=config.RAW, ref=None):
    ref = cameras_bigquery() if ref is None else ref
    destino = Path(destino)
    (destino / 'painel_pendentes').mkdir(parents=True, exist_ok=True)
    vistos, resumo = {}, []
    for origem in origens:
        origem = Path(origem)
        linhas = ler(origem)
        h = hashlib.sha256(repr([r for _, r in linhas]).encode()).hexdigest()
        if h in vistos:
            print(f'{origem.name}: conteúdo idêntico a {vistos[h]} -> pulado')
            resumo.append({'arquivo': origem.name, 'identico_a': vistos[h]})
            continue
        vistos[h] = origem.name
        regs, por_veic = [], {}
        for n, r in linhas:
            pos = ' '.join(r['Câmera'].split()).upper()
            if pos not in POSICAO_ID:
                raise SystemExit(f'{origem.name} linha {n}: posição de câmera não prevista {r["Câmera"]!r}')
            p = int(r['Prefixo'].strip())
            local = dt.datetime.strptime(r['Última Transmissão'].strip(), '%d/%m/%Y, %H:%M:%S').replace(tzinfo=TZ)
            utc = local.astimezone(dt.timezone.utc)
            regs.append((n, p, POSICAO_ID[pos], utc, r))
            por_veic.setdefault(p, []).append((POSICAO_ID[pos], n))
        motivo, mapa = {}, {}
        for p, cams in por_veic.items():
            ids = [c for c, _ in cams]
            if len(ids) == len(set(ids)) and (p not in ref or set(ids) <= ref[p]):
                continue   # sem conflito: entra como está
            if p not in ref:
                motivo[p] = f'mesma posição repetida no painel {sorted(ids)} e veículo sem histórico no BigQuery'
                continue
            hist = sorted(ref[p])
            if len(cams) != len(hist):
                motivo[p] = f'quantidade diferente do histórico (painel {len(cams)} leitura(s) {sorted(ids)}, BigQuery {len(hist)} câmera(s) {hist})'
                continue
            for (c, n), h in zip(sorted(cams), hist):
                mapa[n] = h
        if not regs:
            print(f'{origem.name}: sem registros -> nada a converter')
            resumo.append({'arquivo': origem.name, 'registros': 0})
            continue
        fim = max(u for _, _, _, u, _ in regs)
        nome = f'bq-results-{fim.astimezone(TZ):%Y%m%d-%H%M%S}{MARCA}{origem.stem.replace(" ", "")}.csv'
        ok = pend = remap = 0
        with open(destino / nome, 'w', newline='', encoding='utf-8') as f, \
             open(destino / 'painel_pendentes' / nome.replace('bq-results-', 'pendentes-'), 'w', newline='', encoding='utf-8') as fp:
            w, wp = csv.writer(f, lineterminator='\n'), csv.writer(fp, lineterminator='\n')
            w.writerow(SAIDA)
            wp.writerow(SAIDA + ['motivo'])
            for n, p, cid, utc, r in regs:
                final = mapa.get(n, cid)
                nota = '' if n not in mapa else (f'posição ajustada ao histórico do BigQuery: {cid}→{final} (decisão 07/10/2026)' if final != cid
                                                 else f'reconciliada com o histórico do BigQuery: câmera {cid} mantida (decisão 07/10/2026)')
                lin = [utc.strftime('%Y-%m-%d %H:%M:%S UTC'), '', r['Prefixo'].strip(), '', r['Operadora'], final, '', '', '',
                       r['Status'], r['SD'], r['Login'], r['Gravação'], r['Placa'], r['Câmera'], r['Última Transmissão'], n, cid, nota]
                if p in motivo:
                    wp.writerow(lin + [motivo[p]]); pend += 1
                else:
                    w.writerow(lin); ok += 1; remap += n in mapa
        veic_remap = len({p for _, p, _, _, _ in regs if p not in motivo and any(ln in mapa for _, ln in por_veic[p])})
        print(f'{origem.name} -> {nome}: {ok} registros ({remap} remapeados pelo histórico, {veic_remap} veículo(s)); '
              f'{pend} pendentes de {len(motivo)} veículo(s)')
        resumo.append({'arquivo': origem.name, 'csv': nome, 'registros': ok, 'remapeados': remap, 'veiculos_remapeados': veic_remap,
                       'pendentes': pend, 'veiculos_pendentes': len(motivo)})
    return resumo


if __name__ == '__main__':
    converter(sys.argv[1:])
