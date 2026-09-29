"""Leitura e normalização do monitoramento horário (CSVs do BigQuery) com DuckDB.

Classificação de cada registro (nível 1):
  N  = ONLINE e SD, Login e Gravação 'ok'
  1-7 = FALHA TÉCNICA (câmera comunica, mas algum item != ok). Máscara: SD=1, Login=2, Gravação=4
  O  = OFFLINE (status = offline; SD/Login/Gravação vêm vazios nesses registros)
  ?  = combinação não prevista (não ocorre hoje; listada na qualidade dos dados)
"""
import duckdb

from . import config

SQL_CODIGO = """CASE
  WHEN lower(status) = 'offline' THEN 'O'
  WHEN lower(status) = 'online' AND sdcard = 'ok' AND login = 'ok' AND recording = 'ok' THEN 'N'
  WHEN lower(status) = 'online' AND sdcard IN ('ok','error') AND login IN ('ok','error') AND recording IN ('ok','error')
    THEN CAST((CASE WHEN sdcard='error' THEN 1 ELSE 0 END) + (CASE WHEN login='error' THEN 2 ELSE 0 END) + (CASE WHEN recording='error' THEN 4 ELSE 0 END) AS VARCHAR)
  ELSE '?' END"""


def conectar():
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(config.DUCKDB))
    con.execute(f"SET memory_limit='{config.MEMORY_LIMIT}'; SET threads=4; SET TimeZone='{config.TZ}'; SET preserve_insertion_order=true")
    return con


def carregar(con):
    arqs = [str(a) for a in config.arquivos_monitoramento()]
    if not arqs:
        raise FileNotFoundError('Nenhum bq-results-*.csv em data/raw')
    lista = ', '.join(f"'{a}'" for a in arqs)
    # linha_csv = número da linha no arquivo original (cabeçalho = linha 1), para rastreabilidade
    con.execute(f"""CREATE OR REPLACE TABLE bruto AS
      SELECT regexp_extract(filename, '[^/]+$') AS arquivo,
             row_number() OVER (PARTITION BY filename) + 1 AS linha_csv, * EXCLUDE (filename)
      FROM read_csv([{lista}], header=true, all_varchar=true, filename=true)""")
    mapa = ' '.join(f'WHEN {k} THEN {v}' for k, v in config.ID_CAMERA.items())
    con.execute(f"""CREATE OR REPLACE TABLE registros AS
      WITH t AS (
        SELECT *, strptime(replace(timestamp,' UTC','+00'), ['%Y-%m-%d %H:%M:%S.%f%z','%Y-%m-%d %H:%M:%S%z']) AS ts_utc,
               row_number() OVER (PARTITION BY timestamp, id_veiculo, prefixo_veiculo, id_empresa, empresa, id_camera, serial_modulo,
                                  latitude, longitude, status, sdcard, login, recording ORDER BY arquivo, linha_csv) AS ocorrencia
        FROM bruto)
      SELECT arquivo, linha_csv, timestamp AS timestamp_original, ts_utc,
             timezone('{config.TZ}', ts_utc) AS ts_local,
             CAST(timezone('{config.TZ}', ts_utc) AS DATE) AS data,
             EXTRACT(hour FROM timezone('{config.TZ}', ts_utc))::INT AS hora,
             TRY_CAST(prefixo_veiculo AS BIGINT) AS prefixo, id_veiculo, TRY_CAST(id_empresa AS INT) AS id_empresa, trim(empresa) AS empresa,
             TRY_CAST(id_camera AS INT) AS id_camera,
             CASE TRY_CAST(id_camera AS INT) {mapa} ELSE TRY_CAST(id_camera AS INT) END AS camera,
             serial_modulo, status, sdcard, login, recording,
             {SQL_CODIGO} AS codigo
      FROM t WHERE ocorrencia = 1""")
    info = con.execute("""SELECT (SELECT count(*) FROM bruto) brutos, (SELECT count(*) FROM registros) validos,
        (SELECT count(DISTINCT prefixo) FROM registros) prefixos, (SELECT min(ts_local) FROM registros) inicio,
        (SELECT max(ts_local) FROM registros) fim""").fetchone()
    return dict(zip(['registros_brutos', 'registros_validos', 'prefixos', 'inicio', 'fim'], info))


def agregar(con):
    """Tabelas derivadas: por câmera-dia, por veículo-dia, último estado, sequências de problema."""
    bits = ' '.join(f'WHEN {k} THEN {1 << v}' for k, v in config.BIT_CAMERA.items())
    con.execute(f"""CREATE OR REPLACE TABLE reg2 AS
      SELECT *, CASE WHEN codigo='N' THEN 'N' WHEN codigo='O' THEN 'O' WHEN codigo='?' THEN '?' ELSE 'F' END AS estado,
             CASE WHEN codigo BETWEEN '1' AND '7' THEN CAST(codigo AS INT) ELSE 0 END AS erro_bits,
             CASE camera {bits} ELSE 128 END AS cam_bit
      FROM registros""")
    # transições por câmera (mudança real de estado N/F/O; N->N não conta)
    con.execute("""CREATE OR REPLACE TABLE reg3 AS
      SELECT *, CASE WHEN lag(estado) OVER w IS NOT NULL AND lag(estado) OVER w <> estado THEN 1 ELSE 0 END AS transicao
      FROM reg2 WINDOW w AS (PARTITION BY prefixo, camera ORDER BY ts_utc)""")
    con.execute("""CREATE OR REPLACE TABLE camera_dia AS
      SELECT prefixo, camera, data, count(*) n,
        count(*) FILTER (WHERE estado='N') n_ok, count(*) FILTER (WHERE estado='F') n_falha, count(*) FILTER (WHERE estado='O') n_off,
        count(*) FILTER (WHERE erro_bits & 1 > 0) n_sd, count(*) FILTER (WHERE erro_bits & 2 > 0) n_login, count(*) FILTER (WHERE erro_bits & 4 > 0) n_grav,
        bit_or(erro_bits) erro_bits, sum(transicao) transicoes,
        min(ts_local) primeiro, max(ts_local) ultimo,
        min(ts_local) FILTER (WHERE estado<>'N') primeiro_problema, max(ts_local) FILTER (WHERE estado<>'N') ultimo_problema
      FROM reg3 GROUP BY ALL""")
    con.execute("""CREATE OR REPLACE TABLE veiculo_dia AS
      SELECT prefixo, data, count(*) n,
        count(*) FILTER (WHERE estado='N') n_ok, count(*) FILTER (WHERE estado='F') n_falha, count(*) FILTER (WHERE estado='O') n_off,
        bit_or(cam_bit) cams, bit_or(cam_bit) FILTER (WHERE estado='F') cams_falha, bit_or(cam_bit) FILTER (WHERE estado='O') cams_off,
        bit_or(erro_bits) erro_bits, sum(transicao) transicoes,
        min(hora) FILTER (WHERE estado='O') off_h1, max(hora) FILTER (WHERE estado='O') off_h2,
        min(hora) FILTER (WHERE estado='F') falha_h1, max(hora) FILTER (WHERE estado='F') falha_h2,
        min(hora) h_min, max(hora) h_max
      FROM reg3 GROUP BY ALL""")
    con.execute("""CREATE OR REPLACE TABLE ultimo_estado AS
      SELECT prefixo, camera, arg_max(codigo, ts_utc) codigo, max(ts_local) ts, arg_max(arquivo, ts_utc) arquivo, arg_max(linha_csv, ts_utc) linha_csv
      FROM reg3 GROUP BY ALL""")
    con.execute("""CREATE OR REPLACE TABLE veiculo AS
      SELECT prefixo, arg_max(empresa, ts_utc) empresa, list(DISTINCT empresa ORDER BY empresa) empresas,
             list(DISTINCT camera ORDER BY camera) cameras, list(DISTINCT serial_modulo ORDER BY serial_modulo) modulos,
             list(DISTINCT id_veiculo ORDER BY id_veiculo) ids_veiculo, count(*) n,
             count(*) FILTER (WHERE estado='N') n_ok, count(*) FILTER (WHERE estado='F') n_falha, count(*) FILTER (WHERE estado='O') n_off,
             min(ts_local) primeiro, max(ts_local) ultimo
      FROM reg3 GROUP BY ALL""")
    con.execute("""CREATE OR REPLACE TABLE cobertura_dia AS
      SELECT data, count(*) registros, count(DISTINCT prefixo) prefixos, min(ts_local) inicio, max(ts_local) fim,
             count(DISTINCT hora) horas FROM reg3 GROUP BY 1 ORDER BY 1""")


def qualidade(con):
    q = lambda s: con.execute(s).fetchone()[0]
    return {
        'duplicados_identicos_removidos': q('SELECT (SELECT count(*) FROM bruto) - (SELECT count(*) FROM registros)'),
        'timestamp_invalido': q('SELECT count(*) FROM registros WHERE ts_utc IS NULL'),
        'prefixo_ausente_ou_invalido': q('SELECT count(*) FROM registros WHERE prefixo IS NULL'),
        'camera_fora_do_mapeamento': con.execute("""SELECT id_camera, count(*) n, list(DISTINCT prefixo) prefixos, list(DISTINCT empresa) empresas
             FROM registros WHERE id_camera NOT IN (1001,1002,1003,1004,1005,1006) GROUP BY 1""").fetchall(),
        'combinacao_status_nao_prevista': q("SELECT count(*) FROM registros WHERE codigo='?'"),
        'combinacoes_status': con.execute("""SELECT status, sdcard, login, recording, codigo, count(*) FROM registros GROUP BY ALL ORDER BY 6 DESC""").fetchall(),
        'prefixos_com_mais_de_uma_empresa': con.execute("""SELECT prefixo, list(DISTINCT empresa) FROM registros GROUP BY 1 HAVING count(DISTINCT empresa) > 1 ORDER BY 1""").fetchall(),
        'latitude_longitude_preenchidas': q("SELECT count(*) FROM bruto WHERE coalesce(latitude,'') <> '' OR coalesce(longitude,'') <> ''"),
        'timestamp_fora_da_faixa': q("SELECT count(*) FROM registros WHERE ts_utc < TIMESTAMPTZ '2026-01-01' OR ts_utc > now()"),
    }
