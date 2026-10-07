"""Converte uma exportação do BigQuery salva como .xlsx (uma aba, mesmas 13 colunas dos bq-results-*.csv) em CSV
no mesmo layout, para entrar na carga normal (normalização + deduplicação de scripts/pipeline/monitoramento.py).

- O .xlsx original não é alterado (só lido).
- Nenhum valor é reinterpretado: textos e números saem como estão gravados na planilha.
- A linha N do CSV corresponde à linha N da planilha (cabeçalho = linha 1), mantendo a rastreabilidade (linha_csv).
- Avisa se a planilha tem 1.048.576 linhas (limite do Excel: a exportação provavelmente foi cortada ao abrir/salvar).

Uso: python scripts/converter_xlsx_bq.py ORIGEM.xlsx data/raw/bq-results-<AAAAMMDD-HHMMSS-...>.csv
"""
import csv
import html
import re
import sys
import zipfile

LIMITE_EXCEL = 1_048_576


def converter(origem, destino):
    with zipfile.ZipFile(origem) as z:
        nomes = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
        if len(nomes) != 1:
            raise SystemExit(f'esperada 1 aba, encontradas {len(nomes)}: {nomes}')
        sst = []
        if 'xl/sharedStrings.xml' in z.namelist():
            s = z.read('xl/sharedStrings.xml').decode('utf-8')
            for si in re.finditer(r'<si>(.*?)</si>', s, re.S):
                sst.append(html.unescape(''.join(re.findall(r'<t(?: [^>]*)?>(.*?)</t>', si.group(1), re.S))))
            del s
        dados = z.read(nomes[0]).decode('utf-8')
    row_re = re.compile(r'<row r="(\d+)"[^>]*>(.*?)</row>', re.S)
    cell_re = re.compile(r'<c r="([A-Z]+)\d+"((?: [a-z]+="[^"]*")*)(?:/>|>(?:<v>(.*?)</v>|<is>(.*?)</is>)?</c>)', re.S)
    col_idx = lambda c: sum((ord(ch) - 64) * 26 ** i for i, ch in enumerate(reversed(c))) - 1
    n, esperado, ncols = 0, 1, None
    with open(destino, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        for m in row_re.finditer(dados):
            r = int(m.group(1))
            if r != esperado:
                raise SystemExit(f'linha fora de sequência na planilha: {r} (esperada {esperado})')
            esperado += 1
            cel = {}
            for c in cell_re.finditer(m.group(2)):
                col, attrs, v, inline = c.groups()
                if 't="s"' in attrs and v is not None:
                    cel[col_idx(col)] = sst[int(v)]
                elif inline is not None:
                    cel[col_idx(col)] = html.unescape(''.join(re.findall(r'<t(?: [^>]*)?>(.*?)</t>', inline, re.S)))
                elif v is not None:
                    cel[col_idx(col)] = html.unescape(v)
            if ncols is None:
                ncols = max(cel) + 1   # largura definida pelo cabeçalho
            w.writerow([cel.get(i, '') for i in range(ncols)])
            n += 1
    print(f'{origem} -> {destino}: {n} linhas (com cabeçalho), {ncols} colunas')
    if n >= LIMITE_EXCEL:
        print(f'ATENÇÃO: a planilha tem {n} linhas = limite do Excel ({LIMITE_EXCEL}). A exportação original provavelmente '
              'tinha mais linhas e foi cortada; peça o CSV original do BigQuery para completar o período.')
    return n


if __name__ == '__main__':
    converter(sys.argv[1], sys.argv[2])
