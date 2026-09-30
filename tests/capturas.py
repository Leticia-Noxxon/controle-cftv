"""Abre o site (local ou publicado) em tela de notebook, verifica erros de console e salva capturas.
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
    pg = b.new_page(viewport={'width': 1366, 'height': 768}, locale='pt-BR')
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(url, wait_until='networkidle')
    pg.wait_for_selector('.q')
    print('Cards:', [c.inner_text().replace('\n', ': ') for c in pg.query_selector_all('.card')])
    pg.screenshot(path=str(out / f'{pref}_1_pagina.png'))
    dot = pg.query_selector('.dot')
    dot.hover(); pg.wait_for_timeout(300)
    print('Pop:', pg.inner_text('#pop')[:250].replace('\n', ' | '))
    pg.screenshot(path=str(out / f'{pref}_2_hover_manutencao.png'))
    pg.mouse.move(5, 5); pg.wait_for_timeout(200)
    pg.click('.corpo .linha:nth-child(4) .q.r, .corpo .linha:nth-child(4) .q.l, .corpo .linha:nth-child(4) .q.v >> nth=5')
    pg.wait_for_function("!document.querySelector('#painel-corpo').innerText.includes('…')"); pg.wait_for_timeout(300)
    print('Painel:', pg.inner_text('#painel-corpo')[:300].replace('\n', ' | '))
    pg.screenshot(path=str(out / f'{pref}_3_clique_quadrado.png'))
    pg.keyboard.press('Escape')
    pg.select_option('#f-empresa', index=3); pg.select_option('#f-camera', '21'); pg.wait_for_timeout(300)
    print('Filtro empresa+câm21:', [c.inner_text().replace('\n', ': ') for c in pg.query_selector_all('.card')])
    pg.select_option('#f-empresa', ''); pg.select_option('#f-camera', ''); pg.fill('#f-prefixo', '10003'); pg.wait_for_timeout(400)
    print('Filtro 10003:', [c.inner_text().replace('\n', ': ') for c in pg.query_selector_all('.card')])
    pg.fill('#f-prefixo', '')
    pg.eval_on_selector('#mw', 'e => e.scrollLeft = 400'); pg.wait_for_timeout(200)
    print('sticky f2 left:', pg.eval_on_selector('.corpo .f2', 'e => e.getBoundingClientRect().left'))
    b.close()
print('ERROS DE CONSOLE:', erros or 'nenhum')
