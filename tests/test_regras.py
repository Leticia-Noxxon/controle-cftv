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
    g = _regs([(21, '2026-09-09 09:00', 'O'), (21, '2026-09-10 11:00', 'N')])   # 25 h antes: fora da janela
    assert analise.avaliar(g, EV, None, FIM)['precisava'] == 'Sem dados'


def test_depois_limitado_pela_proxima_visita():
    g = _regs([(21, '2026-09-10 08:00', 'O'), (21, '2026-09-10 11:00', 'O'), (21, '2026-09-11 12:00', 'N')])
    prox = {'inicio': '2026-09-11T09:00'}
    assert analise.avaliar(g, EV, prox, FIM)['resultado'] == 'Não resolvido'
