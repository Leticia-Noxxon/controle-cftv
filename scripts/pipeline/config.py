"""Configurações centrais (caminhos, fuso, mapeamentos). Alterar aqui, não no código."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data' / 'raw'
PROCESSED = ROOT / 'data' / 'processed'
SITE_DATA = ROOT / 'site' / 'public' / 'data'
DUCKDB = PROCESSED / '_trabalho.duckdb'

TZ = 'America/Sao_Paulo'          # timestamps do BigQuery vêm em UTC; tudo é exibido no horário de Brasília
MEMORY_LIMIT = '1500MB'

# id_camera do monitoramento -> número da câmera (confirmado pela usuária: 1001 = 21, 1002 = 22, ...)
ID_CAMERA = {1001: 21, 1002: 22, 1003: 23, 1004: 24, 1005: 25, 1006: 26}
CAMERAS = [21, 22, 23, 24, 25, 26]
# posição (formulário) <-> número (mapeamento confirmado no projeto anterior, REGRAS_PROJETO Q3)
POSICAO = {21: 'FRONTAL', 22: 'FRENTE', 23: 'CORREDOR 1', 24: 'CORREDOR 2', 25: 'CORREDOR 3', 26: 'CORREDOR 4'}
POSICAO_PARA_CAMERA = {v: k for k, v in POSICAO.items()}
# bit de cada câmera nas máscaras compactas do site (1007 = câmera fora do mapeamento)
BIT_CAMERA = {21: 0, 22: 1, 23: 2, 24: 3, 25: 4, 26: 5, 1007: 6}

# Resolução da coleta (≈ 1 registro por câmera por hora). Um registro cobre o intervalo até o próximo registro,
# se vier em até LACUNA_MAX_S (60 min + 5 min de tolerância); senão cobre INTERVALO_NOMINAL_S e o resto é "sem dados".
INTERVALO_NOMINAL_S = 3600
LACUNA_MAX_S = 3900

# Janela "antes" da manutenção: do início (00:00) do dia anterior à visita até o horário da visita
# (cobre o dia da visita antes do horário e o dia anterior inteiro; sempre ≥ 24 h)
JANELA_ANTES_DIAS = 1


def rotulo_camera(n):
    if n in POSICAO:
        return f'Câmera {n} ({POSICAO[n].title()})'
    return f'Câmera id {n} (sem mapeamento)'


def arquivos_monitoramento():
    return sorted(RAW.glob('bq-results-*.csv'))


def arquivo_manutencao():
    import unicodedata
    fs = sorted(p for p in RAW.glob('*.xlsx') if unicodedata.normalize('NFC', p.name).startswith('Revisão_CFTV'))
    if not fs:
        raise FileNotFoundError('Formulário Revisão_CFTV*.xlsx não encontrado em data/raw')
    return fs[-1]


def arquivos_relatorio():
    import unicodedata
    return sorted(p for p in RAW.glob('*.xlsx') if unicodedata.normalize('NFC', p.name).startswith('Relatório CFTV'))
