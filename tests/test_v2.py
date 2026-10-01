"""Versão v2: tabela explícita de Garagem/Empresa cobre todos os nomes dos dados; os.json da OS é coerente com a frota."""
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
JS = (RAIZ / 'site' / 'v2' / 'src' / 'dados.js').read_text(encoding='utf-8')
META = json.loads((RAIZ / 'site' / 'public' / 'data' / 'meta.json').read_text(encoding='utf-8'))


def _mapa(nome):
    bloco = re.search(nome + r' = \{(.*?)\n\};', JS, re.S).group(1)
    pares = re.findall(r"""^\s*(?:'((?:[^'\\]|\\.)*)'|"([^"]*)"|(\w+)):\s*(?:'([^']*)'|"([^"]*)"),""", bloco, re.M)
    return {(a or b or c): (d or e) for a, b, c, d, e in pares}


def test_toda_empresa_tem_garagem():
    m = _mapa('MAPA_EMPRESA')
    assert set(META['empresas']) <= set(m), set(META['empresas']) - set(m)
    assert m['VIA SUDESTE'] == 'Via Sudeste'


def test_toda_garagem_do_formulario_mapeada_para_uma_empresa():
    mf, me = _mapa('MAPA_FORMULARIO'), _mapa('MAPA_EMPRESA')
    assert set(META['garagens']) <= set(mf), set(META['garagens']) - set(mf)
    assert set(mf.values()) <= set(me.values())
    assert mf['Via Sudeste Cursino'] == mf['Via Sudeste Sapopemba'] == 'Via Sudeste'


def test_os_json():
    arq = RAIZ / 'site' / 'public' / 'os.json'
    d = json.loads(arq.read_text(encoding='utf-8'))
    frota = json.loads((RAIZ / 'site' / 'public' / 'data' / 'frota.json').read_text(encoding='utf-8'))['veiculos']
    assert d['janela'][1] == META['dias'][-1] and d['janela_dias'] == 7
    assert set(d['v']) == {str(v['p']) for v in frota}
    for p, cams in list(d['v'].items())[:500]:
        for c, (u, m) in cams.items():
            assert re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d', u) and m >= 0
            assert u <= META['atualizacao']
