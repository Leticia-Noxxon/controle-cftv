"""Testes das regras de classificação e das análises (dados sintéticos, sem depender dos arquivos brutos)."""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from pipeline import analise, manutencao, relatorio  # noqa: E402


def test_relatorio_interpretacao():
    assert relatorio.interpretar('-') == '-'
    assert relatorio.interpretar(None) == '.'
    assert relatorio.interpretar('OFFLINE') == 'O'
    assert relatorio.interpretar('ONLINE SD: ok | Login: ok | Gravação: ok') == 'N'
    assert relatorio.interpretar('ONLINE SD: error | Login: ok | Gravação: error') == '5'


def test_itens_multiplos_na_mesma_celula():
    cel = 'Sem gravação de imagens\nConfiguração incorreta da câmera\nCâmera mal reposicionada'
    assert len(manutencao.itens(cel)) == 3


def test_data_do_formulario():
    d = manutencao.parse_data('quarta-feira, setembro 16, 2026 03:11')
    assert (d.year, d.month, d.day, d.hour, d.minute) == (2026, 9, 16, 3, 11)


def _regs(linhas):
    return pd.DataFrame([{'prefixo': 1, 'camera': c, 'ts_local': pd.Timestamp(t), 'estado': e, 'erro_bits': 5 if e == 'F' else 0} for c, t, e in linhas])


EV = {'prefixo': 1, 'inicio': '2026-09-10T10:00', 'fim': '2026-09-10T10:00'}
FIM = pd.Timestamp('2026-09-24T20:59')


def test_resolvido():
    g = _regs([(21, '2026-09-10 08:00', 'O'), (21, '2026-09-10 11:00', 'N'), (21, '2026-09-10 12:00', 'N')])
    r = analise.avaliar(g, EV, None, FIM)
    assert (r['precisava'], r['resultado']) == ('Sim', 'Resolvido')


def test_recorrencia_e_nao_resolvido():
    g = _regs([(21, '2026-09-10 08:00', 'F'), (21, '2026-09-10 11:00', 'N'), (21, '2026-09-10 12:00', 'F')])
    assert analise.avaliar(g, EV, None, FIM)['resultado'] == 'Resolvido com recorrência'
    g = _regs([(21, '2026-09-10 08:00', 'O'), (21, '2026-09-10 11:00', 'O')])
    assert analise.avaliar(g, EV, None, FIM)['resultado'] == 'Não resolvido'


def test_parcial_e_sem_problema_antes():
    g = _regs([(21, '2026-09-10 08:00', 'O'), (22, '2026-09-10 08:00', 'O'), (21, '2026-09-10 11:00', 'N'), (22, '2026-09-10 11:00', 'O')])
    assert analise.avaliar(g, EV, None, FIM)['resultado'] == 'Parcialmente resolvido'
    g = _regs([(21, '2026-09-10 08:00', 'N'), (21, '2026-09-10 11:00', 'O')])
    r = analise.avaliar(g, EV, None, FIM)
    assert (r['precisava'], r['resultado'], r['novo_problema']) == ('Não', 'Sem problema antes', [21])


def test_janela_antes_24h_e_sem_dados():
    g = _regs([(21, '2026-09-08 23:00', 'O'), (21, '2026-09-10 11:00', 'N')])   # antes do dia anterior: fora da janela
    assert analise.avaliar(g, EV, None, FIM)['precisava'] == 'Sem dados'
    g = _regs([(21, '2026-09-09 01:00', 'O'), (21, '2026-09-10 11:00', 'N')])   # dia anterior (33 h antes): dentro da janela
    assert analise.avaliar(g, EV, None, FIM)['precisava'] == 'Sim'


def test_depois_limitado_pela_proxima_visita():
    g = _regs([(21, '2026-09-10 08:00', 'O'), (21, '2026-09-10 11:00', 'O'), (21, '2026-09-11 12:00', 'N')])
    prox = {'inicio': '2026-09-11T09:00'}
    assert analise.avaliar(g, EV, prox, FIM)['resultado'] == 'Não resolvido'


# ---------- normalização, deduplicação, intervalos, garagens e textos de manutenção ----------
import duckdb  # noqa: E402

from pipeline import config, garagens, monitoramento  # noqa: E402
import atualizar_dados  # noqa: E402

CAB = 'timestamp,id_veiculo,prefixo_veiculo,id_empresa,empresa,id_camera,serial_modulo,latitude,longitude,status,sdcard,login,recording\n'


def _con_com(tmp_path, monkeypatch, arquivos):
    paths = []
    for nome, txt in arquivos.items():
        p = tmp_path / nome
        p.write_text(txt, encoding='utf-8')
        paths.append(p)
    monkeypatch.setattr(config, 'arquivos_monitoramento', lambda: sorted(paths))
    con = duckdb.connect()
    con.execute(f"SET TimeZone='{config.TZ}'")
    return con


def test_deduplicacao_e_esquema_alternativo(tmp_path, monkeypatch):
    a = CAB + ('2026-09-25 10:00:00 UTC,1,100,9,  EMP   X ,1001,s,,,online,ok,ok,ok\n'
               '2026-09-25 11:00:00 UTC,1,100,9,EMP X,1001,s,,,online,error,ok,ok\n')
    # arquivo mais novo, com outro nome de coluna (prefixo / data_hora) e o mesmo registro das 11:00 repetido + um novo
    b = ('data_hora,id_veiculo,prefixo,id_empresa,empresa,id_camera,serial_modulo,latitude,longitude,status,sdcard,login,recording\n'
         '2026-09-25 11:00:00 UTC,1,100,9,EMP X,1001,s,,,online,error,ok,ok\n'
         '2026-09-25 12:00:00 UTC,1,100,9,N/A,1001,s,,,offline,,,\n')
    con = _con_com(tmp_path, monkeypatch, {'bq-results-20260901-000000-1.csv': a, 'bq-results-20260930-000000-2.csv': b})
    info = monitoramento.carregar(con)
    assert info['registros_brutos'] == 4 and info['registros_validos'] == 3 and info['removidos_na_deduplicacao'] == 1
    rows = con.execute('SELECT hora, camera, codigo, empresa, arquivo FROM registros ORDER BY ts_utc').fetchall()
    assert [r[2] for r in rows] == ['N', '1', 'O']
    assert rows[0][1] == 21 and rows[0][3] == 'EMP X' and rows[2][3] is None      # espaços colapsados; 'N/A' -> NULL
    assert rows[1][4].endswith('-2.csv')                                           # empate: fica o arquivo mais recente
    assert [r[0] for r in rows] == [7, 8, 9]                                        # UTC -> Brasília


def test_reparo_acentuacao_corrompida_e_xlsx(tmp_path, monkeypatch):
    # export do BigQuery aberto no Excel (UTF-8 lido como cp1252): 'TRANS UNIÃO' vira 'TRANS UNIÃƒO'; nomes corretos não mudam
    a = CAB + ('2026-10-01 10:00:00 UTC,1,100,9,TRANS UNIÃƒO,1001,s,,,online,ok,ok,ok\n'
               '2026-10-01 11:00:00 UTC,1,100,9,TRANS UNIÃO,1001,s,,,online,ok,ok,ok\n'
               '2026-10-01 12:00:00 UTC,2,200,9,SÃO PAULO,1001,s,,,online,ok,ok,ok\n')
    con = _con_com(tmp_path, monkeypatch, {'bq-results-20261005-000000-1.csv': a})
    monitoramento.carregar(con)
    assert [r[0] for r in con.execute('SELECT empresa FROM registros ORDER BY ts_utc').fetchall()] == ['TRANS UNIÃO', 'TRANS UNIÃO', 'SÃO PAULO']


def test_converter_xlsx_bq(tmp_path):
    import openpyxl
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
    import converter_xlsx_bq
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(CAB.strip().split(','))
    ws.append(['2026-10-01 10:00:00.1 UTC', 1770155060789, 100, 9, 'VIA SUDESTE ', 1001, 29070, None, None, 'online', 'ok', 'ok', 'ok'])
    ws.append(['2026-10-01 11:00:00 UTC', 1, 100, 9, 'EMP & <X>', 1002, 1, None, None, 'offline', None, None, None])
    wb.save(tmp_path / 'x.xlsx')
    assert converter_xlsx_bq.converter(tmp_path / 'x.xlsx', tmp_path / 'x.csv') == 3
    assert (tmp_path / 'x.csv').read_text(encoding='utf-8').splitlines()[1:] == [
        '2026-10-01 10:00:00.1 UTC,1770155060789,100,9,VIA SUDESTE ,1001,29070,,,online,ok,ok,ok',
        '2026-10-01 11:00:00 UTC,1,100,9,EMP & <X>,1002,1,,,offline,,,']


def test_converter_painel_cameras(tmp_path):
    import csv
    import openpyxl
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
    import converter_painel_cameras as cp
    def planilha(nome, linhas):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Manutenção Câmeras'
        ws.append(['Prefixo', 'Placa', 'Operadora', 'Câmera', 'Status', 'SD', 'Login', 'Gravação', 'Última Transmissão'])
        for l in linhas:
            ws.append(l)
        wb.save(tmp_path / nome)
        return tmp_path / nome
    a = planilha('a.xlsx', [['100', 'AAA1', 'EMP X ', 'FRONTAL', 'ONLINE', 'ok', 'ok', 'ok', '07/10/2026, 11:31:31'],
                            ['100', 'AAA1', 'EMP X ', 'CORREDOR ', 'OFFLINE', '-', '-', '-', '07/10/2026, 11:31:35'],
                            ['200', 'BBB2', 'EMP X ', 'CORREDOR 2', 'ONLINE', 'error', 'ok', 'error', '06/10/2026, 23:10:00'],   # 24 não existe no BigQuery
                            ['300', 'CCC3', 'EMP X ', 'FRENTE', 'ONLINE', 'ok', 'ok', 'ok', '07/10/2026, 10:00:00'],
                            ['300', 'CCC3', 'EMP X ', 'FRENTE ', 'OFFLINE', '-', '-', '-', '07/10/2026, 10:00:04'],           # posição repetida
                            ['400', 'DDD4', 'EMP X ', 'FRENTE', 'ONLINE', 'ok', 'ok', 'ok', '07/10/2026, 10:00:00'],
                            ['400', 'DDD4', 'EMP X ', 'CORREDOR', 'ONLINE', 'ok', 'ok', 'ok', '07/10/2026, 10:00:00'],          # 2 leituras × 1 câmera
                            ['500', 'EEE5', 'EMP X ', 'FRONTAL', 'ONLINE', 'ok', 'ok', 'ok', '07/10/2026, 10:00:00'],
                            ['500', 'EEE5', 'EMP X ', 'FRONTAL', 'ONLINE', 'ok', 'ok', 'ok', '07/10/2026, 10:00:01']])         # repetida, sem histórico
    b = planilha('b.xlsx', [])
    b2 = planilha('b2.xlsx', [])
    out = tmp_path / 'raw'
    r = cp.converter([a, b, b2], out, ref={100: {1001, 1002, 1003}, 200: {1001}, 300: {1001, 1002}, 400: {1001}})
    # decisão 07/10/2026: mesma quantidade -> posições ajustadas ao histórico; quantidade diferente/sem histórico -> pendente
    assert r[0]['registros'] == 5 and r[0]['remapeados'] == 3 and r[0]['veiculos_remapeados'] == 2
    assert r[0]['pendentes'] == 4 and r[0]['veiculos_pendentes'] == 2
    pend = list(csv.DictReader(open(out / 'painel_pendentes' / r[0]['csv'].replace('bq-results-', 'pendentes-'), encoding='utf-8')))
    assert {l['prefixo_veiculo']: l['motivo'][:25] for l in pend} == {'400': 'quantidade diferente do h', '500': 'mesma posição repetida no'}
    assert r[2] == {'arquivo': 'b2.xlsx', 'identico_a': 'b.xlsx'}
    linhas = list(csv.DictReader(open(out / r[0]['csv'], encoding='utf-8')))
    assert [(l['timestamp'], l['prefixo_veiculo'], l['id_camera'], l['status'], l['sdcard'], l['empresa'], l['linha_planilha'], l['id_camera_painel']) for l in linhas] == [
        ('2026-10-07 14:31:31 UTC', '100', '1001', 'ONLINE', 'ok', 'EMP X ', '2', '1001'),        # Brasília -> UTC; valores mantidos
        ('2026-10-07 14:31:35 UTC', '100', '1003', 'OFFLINE', '-', 'EMP X ', '3', '1003'),        # "CORREDOR" sozinho = CORREDOR 1 (23)
        ('2026-10-07 02:10:00 UTC', '200', '1001', 'ONLINE', 'error', 'EMP X ', '4', '1004'),     # CORREDOR 2 -> única câmera do histórico
        ('2026-10-07 13:00:00 UTC', '300', '1001', 'ONLINE', 'ok', 'EMP X ', '5', '1002'),        # FRENTE repetida -> 1001 e 1002, em ordem
        ('2026-10-07 13:00:04 UTC', '300', '1002', 'OFFLINE', '-', 'EMP X ', '6', '1002')]
    assert linhas[2]['camera_painel'] == 'CORREDOR 2' and '1004→1001' in linhas[2]['reconciliacao'] and linhas[0]['reconciliacao'] == ''
    assert r[0]['csv'].startswith('bq-results-20261007-113135-painel_')


def test_intervalos_lacuna_e_meia_noite(tmp_path, monkeypatch):
    # 22:30, 23:30 BRT (=01:30, 02:30 UTC) e 03:30 BRT do dia seguinte (lacuna de 4 h)
    a = CAB + ('2026-09-26 01:30:00 UTC,1,100,9,E,1001,s,,,online,ok,ok,ok\n'
               '2026-09-26 02:30:00 UTC,1,100,9,E,1001,s,,,offline,,,\n'
               '2026-09-26 06:30:00 UTC,1,100,9,E,1001,s,,,offline,,,\n'
               '2026-09-26 07:30:00 UTC,1,100,9,E,1001,s,,,offline,,,\n')
    con = _con_com(tmp_path, monkeypatch, {'bq-results-1.csv': a})
    monitoramento.carregar(con)
    monitoramento.agregar(con)
    t = con.execute("SELECT CAST(data AS VARCHAR), strftime(ini, '%H:%M'), strftime(fim, '%H:%M'), estado FROM trecho ORDER BY ini").fetchall()
    assert t == [('2026-09-25', '22:30', '23:30', 'N'),
                 ('2026-09-25', '23:30', '00:00', 'O'),       # dividido na meia-noite
                 ('2026-09-26', '00:00', '00:30', 'O'),       # lacuna > 65 min: o registro cobre só 60 min
                 ('2026-09-26', '03:30', '04:30', 'O')]       # 03:30 + 04:30 unidos; o último registro não passa do fim dos dados


def test_garagens_normalizacao_e_conflito():
    assert garagens.normalizar('  Viação   Grajaú ') == 'Viação Grajaú'
    for nulo in ('', '-', 'N/A', 'null', 'undefined', None):
        assert garagens.normalizar(nulo) is None
    mapa, conflitos, _ = garagens.resolver(
        [(1, 'Garagem A', '2026-09-01T10:00', 'formulario'), (1, 'Garagem B', '2026-09-20T10:00', 'formulario'),
         (2, '-', '2026-09-20T10:00', 'formulario'), (3, 'Garagem C', '', 'relatorio')])
    assert mapa == {1: 'Garagem B', 3: 'Garagem C'} and list(conflitos) == [1]


def test_linhas_texto_manutencao():
    txt = 'Nenhuma anomalia identificada<br>Câmera 21 sem imagem;  - Troca do cabo da câm 21 <br/>Câmera 21 sem imagem\nSD card da UCP substituído.'
    assert atualizar_dados.linhas_texto(txt) == ['Câmera 21 sem imagem', 'Troca do cabo da câm 21', 'SD card da UCP substituído']


def test_garagem_acentuacao_corrompida_e_datas_jotform():
    assert garagens.normalizar('ViaþÒo Metr¾pole Pinedo') == 'Viação Metrópole Pinedo'
    assert garagens.normalizar('ViaþÒo Graja·') == 'Viação Grajaú'
    assert garagens.normalizar('Via Sudeste Cursino') == 'Via Sudeste Cursino'
    assert garagens._data('{"day": "23", "month": "06", "year": "2026"}') == '2026-06-23'
    assert garagens._data('2026-06-30 12:33:00') == '2026-06-30'
    assert garagens._data('quarta-feira, setembro 16, 2026 03:11') == '2026-09-16T03:11'


# ---------- Relatório CFTV diário sem horário (REGRAS_PROJETO 19, decisão de 07/10/2026) ----------
from pipeline import relatorio_diario  # noqa: E402


def _reg_rel(prefixo, empresa, cams):
    return {'linha': 2, 'empresa': empresa, 'status': '', 'cams': cams, 'textos': {c: str(v) for c, v in cams.items()}}


def test_relatorio_diario_reconciliacao_e_precedencia(tmp_path, monkeypatch):
    con = duckdb.connect()
    # histórico com horário: 100 (câm 21), 200 (câm 22,23), 300 (câm 22), 400 (câm 21) com registro em 06/10 só na câm 21
    con.execute("""CREATE TABLE registros AS SELECT * FROM (VALUES
      (100, 21, DATE '2026-10-05', 10, TIMESTAMP '2026-10-05 13:00', 'EMP A', 'bq-results-1.csv'),
      (200, 22, DATE '2026-10-05', 10, TIMESTAMP '2026-10-05 13:00', 'EMP B', 'bq-results-1.csv'),
      (200, 23, DATE '2026-10-05', 10, TIMESTAMP '2026-10-05 13:00', 'EMP B', 'bq-results-1.csv'),
      (300, 22, DATE '2026-10-05', 10, TIMESTAMP '2026-10-05 13:00', 'EMP C', 'bq-results-1.csv'),
      (400, 21, DATE '2026-10-06', 9, TIMESTAMP '2026-10-06 12:00', 'EMP D', 'x-painel_06.csv'),
      (400, 22, DATE '2026-10-05', 9, TIMESTAMP '2026-10-05 12:00', 'EMP D', 'bq-results-1.csv')
    ) t(prefixo, camera, data, hora, ts_utc, empresa, arquivo)""")
    rel = {'arquivo': 'Relatório CFTV - 06.10.2026.xlsx', 'aba': 'x', 'abas': ['x'], 'data': '2026-10-06', 'registros': {
        100: _reg_rel(100, 'EMP A', {21: 'O', 22: '-'}),          # contida no histórico -> como está
        200: _reg_rel(200, 'EMP B', {21: 'N', 22: '1'}),          # mesma quantidade -> 21→22, 22→23 (regra 3-A)
        300: _reg_rel(300, 'EMP C', {21: 'N', 22: 'N'}),          # quantidade diferente -> pendente
        500: _reg_rel(500, ' emp  a ', {21: 'N'}),                # sem histórico, empresa conhecida -> novo
        600: _reg_rel(600, 'EMPRESA NOVA', {21: 'N'}),            # sem histórico, empresa desconhecida -> pendente
        400: _reg_rel(400, 'EMP D', {21: 'O', 22: 'N'}),          # câm 21 tem registro com horário no dia -> substituída
        700: _reg_rel(700, 'EMP A', {21: '-', 22: '.'}),          # sem câmeras
    }}
    monkeypatch.setattr(relatorio_diario.relatorio, 'ler', lambda: [rel])
    monkeypatch.setattr(config, 'PROCESSED', tmp_path)
    [r] = relatorio_diario.carregar(con)
    assert (r['remapeados'], r['novos'], r['pendentes'], r['sem_cameras']) == (1, 1, 2, 1)
    assert r['substituidas_mesma_camera'] == 1 and r['substituidas_dia_coberto'] == 0
    usadas = con.execute('SELECT prefixo, camera, codigo, estado, erro_bits, empresa, origem FROM leitura_dia ORDER BY ALL').fetchall()
    assert usadas == [(100, 21, 'O', 'O', 0, 'EMP A', 'relatorio_diario'), (200, 22, 'N', 'N', 0, 'EMP B', 'relatorio_diario'),
                      (200, 23, '1', 'F', 1, 'EMP B', 'relatorio_diario'), (400, 22, 'N', 'N', 0, 'EMP D', 'relatorio_diario'),
                      (500, 21, 'N', 'N', 0, 'EMP A', 'relatorio_diario')]
    pend = pd.read_csv(tmp_path / 'leituras_diarias_pendentes.csv')
    assert sorted(pend['prefixo']) == [300, 600]
    # exportação futura do BigQuery cobrindo o dia inteiro (24 horas) substitui todas as leituras do relatório
    con.execute("""INSERT INTO registros SELECT 999, 21, DATE '2026-10-06', h, TIMESTAMP '2026-10-06 03:00' + h * INTERVAL 1 HOUR, 'EMP A',
                   'bq-results-2.csv' FROM range(24) t(h)""")
    [r] = relatorio_diario.carregar(con)
    assert r['leituras_usadas'] == 0 and r['substituidas_dia_coberto'] == 6
    assert con.execute('SELECT count(*) FROM leitura_dia').fetchone()[0] == 0
