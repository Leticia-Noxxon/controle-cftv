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


# Camada de normalização: nomes de coluna aceitos em cada CSV -> nome canônico. Um CSV com esquema diferente
# (ex.: 'prefixo' em vez de 'prefixo_veiculo', 'data_hora' em vez de 'timestamp') é lido pelo mesmo caminho.
ALIASES = {
    'timestamp': ['timestamp', 'data_hora', 'datahora', 'ts', 'horario'],
    'id_veiculo': ['id_veiculo', 'veiculo_id'],
    'prefixo_veiculo': ['prefixo_veiculo', 'prefixo', 'veiculo_prefixo'],
    'id_empresa': ['id_empresa', 'empresa_id'],
    'empresa': ['empresa', 'nome_empresa', 'company'],
    'garagem': ['garagem', 'nome_garagem', 'garage'],
    'id_camera': ['id_camera', 'camera', 'camera_id'],
    'serial_modulo': ['serial_modulo', 'serial'],
    'latitude': ['latitude', 'lat'], 'longitude': ['longitude', 'lon', 'lng'],
    'status': ['status'], 'sdcard': ['sdcard', 'sd_card', 'sd'], 'login': ['login'], 'recording': ['recording', 'gravacao'],
}


def _norm_txt(col):
    """trim + espaços colapsados; '', '-', 'N/A', 'null', 'undefined' viram NULL."""
    return (f"CASE WHEN lower(trim(regexp_replace(CAST({col} AS VARCHAR), '\\s+', ' ', 'g'))) IN ('', '-', 'n/a', 'na', 'null', 'none', 'undefined') "
            f"THEN NULL ELSE trim(regexp_replace(CAST({col} AS VARCHAR), '\\s+', ' ', 'g')) END")


def reparar_utf8(t):
    """'TRANS UNIÃƒO' -> 'TRANS UNIÃO': texto UTF-8 que foi lido como cp1252 (ex.: CSV do BigQuery aberto no Excel e salvo
    como .xlsx). Só aplica se o reparo for exato (o texto volta a ser UTF-8 válido); senão devolve o texto como está."""
    if t is None:
        return None
    try:
        return t.encode('cp1252').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return t


# só os textos livres (empresa/garagem) passam pelo reparo; o filtro evita chamar o Python nos demais registros
SUSPEITO_MOJIBAKE = r'[ÃÂ][\x{0080}-\x{00BF}\x{0152}\x{0153}\x{0160}\x{0161}\x{0178}\x{017D}\x{017E}\x{0192}\x{02C6}\x{02DC}\x{2013}-\x{203A}\x{20AC}\x{2122}]'  # sintaxe RE2 (DuckDB)


def _reparado(expr):
    return f"CASE WHEN regexp_matches({expr}, '{SUSPEITO_MOJIBAKE}') THEN reparar_utf8({expr}) ELSE {expr} END"


def esquema(con, arq):
    return [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_csv('{arq}', header=true, all_varchar=true)").fetchall()]


def carregar(con):
    arqs = [str(a) for a in config.arquivos_monitoramento()]
    if not arqs:
        raise FileNotFoundError('Nenhum bq-results-*.csv em data/raw')
    partes, esquemas = [], {}
    try:
        con.create_function('reparar_utf8', reparar_utf8, ['VARCHAR'], 'VARCHAR', side_effects=False)
    except duckdb.CatalogException:
        pass  # já registrada nesta conexão
    for a in arqs:
        cols = esquema(con, a)
        low = {c.lower().strip(): c for c in cols}
        esquemas[a.split('/')[-1]] = cols
        sel = []
        for can, alts in ALIASES.items():
            orig = next((low[x] for x in alts if x in low), None)
            expr = _norm_txt(chr(34) + orig + chr(34)) if orig else None
            if expr and can in ('empresa', 'garagem'):
                expr = _reparado(expr)
            sel.append(f'{expr} AS {can}' if expr else f'NULL::VARCHAR AS {can}')
        # linha_csv = número da linha no arquivo original (cabeçalho = linha 1), para rastreabilidade
        partes.append(f"""SELECT '{a.split('/')[-1]}' AS arquivo, row_number() OVER () + 1 AS linha_csv, {', '.join(sel)}
                          FROM read_csv('{a}', header=true, all_varchar=true)""")
    con.execute('CREATE OR REPLACE TABLE bruto AS ' + ' UNION ALL '.join(partes))
    mapa = ' '.join(f'WHEN {k} THEN {v}' for k, v in config.ID_CAMERA.items())
    # Deduplicação por prefixo + câmera + data/hora (timestamp completo). Entre registros com a mesma chave fica o
    # válido (status reconhecido), depois o mais completo (mais campos preenchidos) e, por fim, o do arquivo mais
    # recente (os nomes bq-results-AAAAMMDD-HHMMSS ordenam pela data da exportação).
    con.execute(f"""CREATE OR REPLACE TABLE registros AS
      WITH n AS (
        SELECT *, strptime(replace(timestamp,' UTC','+00'), ['%Y-%m-%d %H:%M:%S.%f%z','%Y-%m-%d %H:%M:%S%z']) AS ts_utc,
               TRY_CAST(prefixo_veiculo AS BIGINT) AS prefixo, TRY_CAST(id_camera AS INT) AS id_camera_i,
               lower(status) AS st, lower(sdcard) AS sd, lower(login) AS lg, lower(recording) AS rc
        FROM bruto),
      c AS (SELECT *, CASE
          WHEN st = 'offline' THEN 'O'
          WHEN st = 'online' AND sd = 'ok' AND lg = 'ok' AND rc = 'ok' THEN 'N'
          WHEN st = 'online' AND sd IN ('ok','error') AND lg IN ('ok','error') AND rc IN ('ok','error')
            THEN CAST((CASE WHEN sd='error' THEN 1 ELSE 0 END) + (CASE WHEN lg='error' THEN 2 ELSE 0 END) + (CASE WHEN rc='error' THEN 4 ELSE 0 END) AS VARCHAR)
          ELSE '?' END AS codigo,
          (CASE WHEN id_veiculo IS NULL THEN 0 ELSE 1 END + CASE WHEN empresa IS NULL THEN 0 ELSE 1 END + CASE WHEN serial_modulo IS NULL THEN 0 ELSE 1 END
           + CASE WHEN st IS NULL THEN 0 ELSE 1 END + CASE WHEN sd IS NULL THEN 0 ELSE 1 END + CASE WHEN lg IS NULL THEN 0 ELSE 1 END
           + CASE WHEN rc IS NULL THEN 0 ELSE 1 END + CASE WHEN garagem IS NULL THEN 0 ELSE 1 END) AS completude
        FROM n),
      r AS (SELECT *, row_number() OVER (PARTITION BY prefixo, id_camera_i, ts_utc
                ORDER BY (codigo <> '?') DESC, completude DESC, arquivo DESC, linha_csv DESC) AS ordem,
              count(*) OVER (PARTITION BY prefixo, id_camera_i, ts_utc) AS n_chave
            FROM c WHERE ts_utc IS NOT NULL AND prefixo IS NOT NULL AND id_camera_i IS NOT NULL)
      SELECT arquivo, linha_csv, timestamp AS timestamp_original, ts_utc,
             timezone('{config.TZ}', ts_utc) AS ts_local,
             CAST(timezone('{config.TZ}', ts_utc) AS DATE) AS data,
             EXTRACT(hour FROM timezone('{config.TZ}', ts_utc))::INT AS hora,
             prefixo, id_veiculo, TRY_CAST(id_empresa AS INT) AS id_empresa, empresa, garagem,
             id_camera_i AS id_camera, CASE id_camera_i {mapa} ELSE id_camera_i END AS camera,
             serial_modulo, st AS status, sd AS sdcard, lg AS login, rc AS recording, codigo, n_chave
      FROM r WHERE ordem = 1 ORDER BY ts_utc, prefixo, camera""")
    q = lambda x: con.execute(x).fetchone()[0]
    info = {
        'arquivos': esquemas,
        'registros_brutos': q('SELECT count(*) FROM bruto'),
        'registros_por_arquivo': dict(con.execute('SELECT arquivo, count(*) FROM bruto GROUP BY 1 ORDER BY 1').fetchall()),
        'duplicados_identicos': q("""SELECT count(*) - count(DISTINCT (timestamp, id_veiculo, prefixo_veiculo, id_empresa, empresa, garagem, id_camera,
                                     serial_modulo, latitude, longitude, status, sdcard, login, recording)) FROM bruto"""),
        'descartados_sem_chave': q("""SELECT count(*) FROM bruto WHERE TRY_CAST(prefixo_veiculo AS BIGINT) IS NULL OR TRY_CAST(id_camera AS INT) IS NULL
                                      OR timestamp IS NULL"""),
        'registros_validos': q('SELECT count(*) FROM registros'),
        'chaves_com_mais_de_um_registro': q('SELECT count(*) FROM registros WHERE n_chave > 1'),
        'chaves_conflitantes': q("""SELECT count(*) FROM (SELECT 1 FROM (SELECT DISTINCT TRY_CAST(prefixo_veiculo AS BIGINT) p, id_camera, timestamp,
                                    status, sdcard, login, recording FROM bruto) GROUP BY p, id_camera, timestamp HAVING count(*) > 1)"""),
    }
    info['removidos_na_deduplicacao'] = info['registros_brutos'] - info['descartados_sem_chave'] - info['registros_validos']
    info.update(dict(zip(['prefixos', 'inicio', 'fim'], con.execute(
        'SELECT count(DISTINCT prefixo), min(ts_local), max(ts_local) FROM registros').fetchone())))
    return info


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
    # Intervalo coberto por cada registro (resolução da coleta ≈ 1 h): do registro até o próximo registro da mesma câmera,
    # se ele vier em até LACUNA_MAX_S; senão o registro cobre só INTERVALO_NOMINAL_S e o resto vira "sem dados".
    # O último registro de cada câmera cobre até INTERVALO_NOMINAL_S, sem passar do fim dos dados. Intervalos que
    # atravessam a meia-noite são divididos entre os dois dias.
    con.execute(f"""CREATE OR REPLACE TABLE intervalo AS
      WITH a AS (SELECT prefixo, camera, ts_utc, ts_local, estado, codigo,
               epoch(lead(ts_utc) OVER (PARTITION BY prefixo, camera ORDER BY ts_utc) - ts_utc) AS ate_prox FROM reg3),
      b AS (SELECT *, CASE WHEN ate_prox IS NULL THEN least({config.INTERVALO_NOMINAL_S}, epoch((SELECT max(ts_utc) FROM reg3) - ts_utc))
                            WHEN ate_prox <= {config.LACUNA_MAX_S} THEN ate_prox ELSE {config.INTERVALO_NOMINAL_S} END AS dur FROM a),
      c AS (SELECT *, ts_local + to_seconds(dur) AS fim_local, CAST(ts_local AS DATE) + INTERVAL 1 DAY AS meia_noite FROM b)
      SELECT prefixo, camera, CAST(ts_local AS DATE) AS data, ts_local AS ini, least(fim_local, meia_noite) AS fim, estado, codigo, ts_utc FROM c
      UNION ALL
      SELECT prefixo, camera, CAST(meia_noite AS DATE), meia_noite, fim_local, estado, codigo, ts_utc FROM c WHERE fim_local > meia_noite""")
    con.execute("""CREATE OR REPLACE TABLE tempo_camera_dia AS
      SELECT prefixo, camera, data, sum(epoch(fim - ini)) FILTER (WHERE estado='N') AS s_ok, sum(epoch(fim - ini)) FILTER (WHERE estado='F') AS s_falha,
             sum(epoch(fim - ini)) FILTER (WHERE estado='O') AS s_off, arg_max(codigo, ts_utc) AS ultimo_codigo, FALSE AS sem_horario
      FROM intervalo GROUP BY ALL""")
    # Linha do tempo: intervalos consecutivos com o mesmo estado e sem lacuna entre eles são unidos em um trecho.
    con.execute("""CREATE OR REPLACE TABLE trecho AS
      WITH a AS (SELECT *, CASE WHEN estado = lag(estado) OVER w AND ini = lag(fim) OVER w THEN 0 ELSE 1 END AS novo
                 FROM intervalo WINDOW w AS (PARTITION BY prefixo, camera, data ORDER BY ini)),
      b AS (SELECT *, sum(novo) OVER (PARTITION BY prefixo, camera, data ORDER BY ini ROWS UNBOUNDED PRECEDING) AS grp FROM a)
      SELECT prefixo, camera, data, min(ini) AS ini, max(fim) AS fim, any_value(estado) AS estado, max(codigo) AS codigo, count(*) AS n
      FROM b GROUP BY prefixo, camera, data, grp""")
    con.execute("""CREATE OR REPLACE TABLE camera_dia AS
      SELECT prefixo, camera, data, count(*) n,
        count(*) FILTER (WHERE estado='N') n_ok, count(*) FILTER (WHERE estado='F') n_falha, count(*) FILTER (WHERE estado='O') n_off,
        count(*) FILTER (WHERE erro_bits & 1 > 0) n_sd, count(*) FILTER (WHERE erro_bits & 2 > 0) n_login, count(*) FILTER (WHERE erro_bits & 4 > 0) n_grav,
        bit_or(erro_bits) erro_bits, sum(transicao) transicoes,
        min(ts_local) primeiro, max(ts_local) ultimo,
        min(ts_local) FILTER (WHERE estado<>'N') primeiro_problema, max(ts_local) FILTER (WHERE estado<>'N') ultimo_problema,
        FALSE AS sem_horario
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
    adicionar_leituras_diarias(con)
    con.execute("""CREATE OR REPLACE TABLE cobertura_dia AS
      SELECT data, count(*) registros, count(DISTINCT prefixo) prefixos, min(ts_local) inicio, max(ts_local) fim,
             count(DISTINCT hora) horas FROM reg3 GROUP BY 1 ORDER BY 1""")


def adicionar_leituras_diarias(con):
    """Leituras diárias SEM horário (Relatório CFTV; tabela leitura_dia de pipeline/relatorio_diario.py, decisão de
    07/10/2026): entram em camera_dia (contagem do dia -> cor da Matriz) e em tempo_camera_dia (último código do dia ->
    situação atual) com sem_horario = TRUE, sem tempos (minutos) e sem horários; não entram em reg3/intervalo/trecho
    (linha do tempo horária) nem em cobertura_dia. Veículos sem histórico entram em 'veiculo' com a empresa do relatório.
    A precedência (registro com horário vence) já foi aplicada ao montar leitura_dia."""
    if not con.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = 'leitura_dia'").fetchone()[0]:
        return
    con.execute("""INSERT INTO camera_dia BY NAME
      SELECT prefixo, camera, data, 1 AS n, CAST(estado='N' AS INT) n_ok, CAST(estado='F' AS INT) n_falha, CAST(estado='O' AS INT) n_off,
             CAST(erro_bits & 1 > 0 AS INT) n_sd, CAST(erro_bits & 2 > 0 AS INT) n_login, CAST(erro_bits & 4 > 0 AS INT) n_grav,
             erro_bits, 0 AS transicoes, TRUE AS sem_horario
      FROM leitura_dia""")
    con.execute("""INSERT INTO tempo_camera_dia BY NAME
      SELECT prefixo, camera, data, codigo AS ultimo_codigo, TRUE AS sem_horario FROM leitura_dia""")
    con.execute("""INSERT INTO veiculo BY NAME
      SELECT prefixo, any_value(empresa) empresa, list(DISTINCT empresa) empresas, list(DISTINCT camera ORDER BY camera) cameras,
             count(*) n, count(*) FILTER (WHERE estado='N') n_ok, count(*) FILTER (WHERE estado='F') n_falha, count(*) FILTER (WHERE estado='O') n_off
      FROM leitura_dia WHERE prefixo NOT IN (SELECT prefixo FROM veiculo) GROUP BY prefixo""")


def qualidade(con):
    q = lambda s: con.execute(s).fetchone()[0]
    return {
        'duplicados_removidos': q('SELECT (SELECT count(*) FROM bruto) - (SELECT count(*) FROM registros)'),
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
