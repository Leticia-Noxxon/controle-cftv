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
