"""Confere raiz (site oficial = redesign v2), /v1/ (backup) e /v2/ (redireciona para a raiz) em 1920x1080, 1366x768 e 390x844,
temas claro e escuro, sem erros de console nem requisições com falha. Ignora o cache (parâmetro aleatório + sem cache do navegador).
Uso: python tests/verificar_publicacao.py URL_RAIZ PREFIXO   (ex.: https://leticia-noxxon.github.io/controle-cftv/ pub)"""
import random
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

raiz = sys.argv[1].rstrip('/') + '/'
pref = sys.argv[2] if len(sys.argv) > 2 else 'local_pub'
out = Path(__file__).resolve().parents[1] / 'docs' / 'screenshots'
falhas = []
VPS = [(1920, 1080), (1366, 768), (390, 844)]


def ok(c, m):
    print('OK   ' if c else 'FALHA', m)
    if not c:
        falhas.append(m)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for tema in ('claro', 'escuro'):
        ctx = b.new_context(color_scheme='dark' if tema == 'escuro' else 'light', locale='pt-BR', bypass_csp=True)
        ctx.route('**/*', lambda r: r.continue_(headers={**r.request.headers, 'cache-control': 'no-cache', 'pragma': 'no-cache'}))
        pg = ctx.new_page()
        erros = []
        pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('response', lambda r: erros.append(f'HTTP {r.status} {r.url}') if r.status >= 400 else None)
        for w, h in VPS:
            pg.set_viewport_size({'width': w, 'height': h})
            q = f'?nc={random.randint(1, 10**9)}'
            for nome, url, sel in (('raiz', raiz + q, '#v-tabela .gt'), ('raiz_matriz', raiz + q + '#matriz', '.st'), ('v1', raiz + 'v1/' + q, '#app')):
                erros.clear()
                pg.goto(url, wait_until='networkidle'); pg.wait_for_selector(sel); pg.wait_for_timeout(500)
                info = pg.evaluate("() => [document.documentElement.dataset.tema || '', document.title, document.querySelector('link[rel=icon]')?.getAttribute('href') || '', document.documentElement.scrollHeight, innerHeight, document.body.innerText.length]")
                if nome.startswith('raiz'):
                    ok(info[0] == tema and 'OS' in info[1] and '2563eb' in info[2], f'{tema} {w}x{h} {nome}: tema {info[0]}, título "{info[1]}", favicon OS')
                    if w >= 1366:
                        ok(info[3] <= info[4], f'{tema} {w}x{h} {nome}: sem rolagem vertical ({info[3]} em {info[4]})')
                else:
                    ok(info[5] > 500, f'{tema} {w}x{h} v1: carregou com dados ({info[5]} caracteres)')
                ok(not erros, f'{tema} {w}x{h} {nome}: sem erros de console/rede {erros[:3]}')
                pg.screenshot(path=str(out / f'{pref}_{nome}_{tema}_{w}x{h}.png'))
            erros.clear()
            pg.goto(raiz + 'v2/' + q + '#matriz', wait_until='networkidle'); pg.wait_for_selector('.st')
            ok(pg.url.split('?')[0].rstrip('#matriz').rstrip('/') == raiz.rstrip('/') and pg.url.endswith('#matriz') and not erros, f'{tema} {w}x{h} /v2/#matriz redireciona para a raiz ({pg.url})')
        ctx.close()
    b.close()
print('FALHAS:', falhas or 'nenhuma')
sys.exit(1 if falhas else 0)
