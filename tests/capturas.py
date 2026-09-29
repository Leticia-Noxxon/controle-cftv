"""Abre o site (local ou publicado), percorre as seções, verifica erros de console e salva capturas.
Uso: python tests/capturas.py URL PREFIXO_ARQUIVO"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

url = sys.argv[1]
pref = sys.argv[2] if len(sys.argv) > 2 else 'local'
out = Path(__file__).resolve().parents[1] / 'docs' / 'screenshots'
out.mkdir(parents=True, exist_ok=True)
erros = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    pg = b.new_page(viewport={'width': 1600, 'height': 1000})
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(url + '#situacao', wait_until='networkidle')
    pg.wait_for_selector('.kpi .val')
    print('KPIs:', [t.inner_text().replace('\n', ' | ') for t in pg.query_selector_all('.kpi')])
    pg.screenshot(path=str(out / f'{pref}_1_situacao.png'), full_page=False)
    pg.click('text=Matriz diária'); pg.wait_for_selector('.mx-linha')
    pg.hover('.mx-linha:nth-child(3) .cel[data-i="10"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(out / f'{pref}_2_matriz.png'))
    pg.click('.mx-linha:nth-child(3) .cel[data-i="10"]'); pg.wait_for_selector('.tl-lin'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(out / f'{pref}_3_matriz_dia.png'))
    pg.keyboard.press('Escape')
    pg.click('#menu >> text=Problemas em aberto'); pg.wait_for_selector('#t tbody tr')
    print('Problemas:', [t.inner_text().replace('\n', ' | ') for t in pg.query_selector_all('.kpi')])
    pg.screenshot(path=str(out / f'{pref}_4_problemas.png'))
    pg.click('#menu >> text=Manutenções'); pg.wait_for_selector('text=Visitas (prefixo + dia)')
    print('Manutenções:', [t.inner_text().replace('\n', ' | ') for t in pg.query_selector_all('.kpi')])
    pg.screenshot(path=str(out / f'{pref}_5_manutencoes.png'))
    pg.click('#t tbody tr:nth-child(1)'); pg.wait_for_selector('#tl-man .tl-lin, #tl-man:not(.sutil)'); pg.wait_for_timeout(400)
    pg.screenshot(path=str(out / f'{pref}_6_manutencao_detalhe.png'))
    pg.keyboard.press('Escape')
    for aba in ['Análises', 'Qualidade dos dados', 'Como ler']:
        pg.click(f'#menu >> text={aba}'); pg.wait_for_timeout(400)
    pg.screenshot(path=str(out / f'{pref}_7_como_ler.png'))
    # filtro por prefixo e câmera
    pg.click('#menu >> text=Situação atual'); pg.fill('#f-q', '10003'); pg.wait_for_timeout(500)
    print('Filtro 10003:', pg.inner_text('#t-pref tbody')[:200].replace('\n', ' | '))
    b.close()
print('ERROS DE CONSOLE:', erros or 'nenhum')
