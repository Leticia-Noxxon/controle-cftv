"""Validação no navegador (site local ou publicado) + capturas de tela.
Uso: python tests/capturas.py URL PREFIXO_ARQUIVO   (ex.: http://localhost:4174/ local)"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

url = sys.argv[1].rstrip('/') + '/'
pref = sys.argv[2] if len(sys.argv) > 2 else 'local'
out = Path(__file__).resolve().parents[1] / 'docs' / 'screenshots'
out.mkdir(parents=True, exist_ok=True)
erros, falhas = [], []


def ok(cond, msg):
    print(('OK   ' if cond else 'FALHA') + ' ' + msg)
    if not cond:
        falhas.append(msg)


def larg(pg, sel):
    return pg.eval_on_selector(sel, 'e => e.getBoundingClientRect().width')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    pg = b.new_page(viewport={'width': 1440, 'height': 900}, locale='pt-BR')
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(url, wait_until='networkidle')
    pg.wait_for_selector('.st')
    meta = pg.evaluate("fetch('data/meta.json').then(r => r.json())")
    frota = pg.evaluate("fetch('data/frota.json').then(r => r.json())")
    dias = meta['dias']
    ok(dias == sorted(set(dias)), f'datas ordenadas e sem repetição ({len(dias)}: {dias[0]} … {dias[-1]})')
    cab = [e.inner_text().split('\n')[0] for e in pg.query_selector_all('.cel-h.dia-h')] or \
          [e.inner_text().split('\n')[0] for e in pg.query_selector_all('.cel-h')][3:]
    ok(len(cab) == len(dias), f'cabeçalho com {len(cab)} colunas de data')
    ok(pg.query_selector('svg circle, .donut, .grafico') is None, 'página 1 sem gráficos')
    pg.screenshot(path=str(out / f'{pref}_1_monitoramento_1440.png'))

    # sem espaço vazio depois da última data
    for w in (1920, 1440, 1366, 1024):
        pg.set_viewport_size({'width': w, 'height': 900}); pg.wait_for_timeout(250)
        folga = pg.evaluate("""() => { const t = document.getElementById('p1-tabela'), cs = t.querySelectorAll('.linha')[0].querySelectorAll('.cel');
                                 const u = cs[cs.length - 1].getBoundingClientRect(), r = t.getBoundingClientRect();
                                 return {folga: Math.round(r.right - 1 - u.right), dia: Math.round(u.width), rolagem: t.scrollWidth > t.clientWidth,
                                         doc: document.documentElement.scrollWidth > innerWidth}; }""")
        ok(folga['folga'] <= 1 and folga['dia'] >= 28 and not folga['doc'],
           f"{w}px: coluna de data {folga['dia']}px, folga após a última data {folga['folga']}px, rolagem da tabela={folga['rolagem']}")
        pg.screenshot(path=str(out / f'local_layout_{w}.png'))
    pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(250)

    # ponto azul apenas onde há manutenção
    pontos = pg.evaluate("""() => [...document.querySelectorAll('#p1-tabela .linha')].map(l => [l.dataset.p,
                              [...l.querySelectorAll('.st')].map(c => [c.dataset.i, !!c.querySelector('.man')])])""")
    mv = {str(x['p']): x.get('mv', {}) for x in frota['veiculos']}
    certo = all(tem == bool(mv[pp].get(i)) for pp, cs in pontos for i, tem in cs)
    ok(certo, f'ponto azul = dias com manutenção ({len(pg.query_selector_all(".st .man"))} pontos na página)')

    # clique numa célula com manutenção -> painel do prefixo/data certos
    alvo = pg.query_selector('.st.fa:has(.man), .st.off:has(.man)') or pg.query_selector('.st:has(.man)')
    p_alvo = alvo.evaluate("e => e.closest('.linha').dataset.p")
    i_alvo = int(alvo.get_attribute('data-i'))
    w0 = larg(pg, '#p1-tabela')
    alvo.click(); pg.wait_for_selector('.iv'); pg.wait_for_timeout(350)
    txt = pg.inner_text('#p1-painel')
    d = dias[i_alvo]
    ok(f'Prefixo {p_alvo}' in txt and f'{d[8:10]}/{d[5:7]}/{d[:4]}' in txt, f'painel abre prefixo {p_alvo} em {d}')
    ok('Manutenção' in txt and 'Ver registro completo' in txt, 'painel mostra manutenção')
    w1 = larg(pg, '#p1-tabela')
    ok(0.66 < w1 / (w1 + larg(pg, '#p1-painel') + 12) < 0.8, f'painel aberto: tabela {w1:.0f}px / painel {larg(pg, "#p1-painel"):.0f}px')
    pg.eval_on_selector('#p1-painel .painel', "e => { e.scrollTop = e.querySelector('.barra-tl').offsetTop - 170; }"); pg.wait_for_timeout(150)
    pg.screenshot(path=str(out / f'{pref}_2_painel_aberto.png'))
    pg.click('#pn-fechar'); pg.wait_for_timeout(300)
    ok(abs(larg(pg, '#p1-tabela') - w0) < 2, 'fechar o painel restaura a largura total')

    # sem paginação: rolagem virtual até o fim
    ok(pg.query_selector('#p1-pag, #p1-por, .paginacao') is None, 'sem controles de paginação')
    total = int(pg.inner_text('#p1-cont').split()[0].replace('.', ''))
    ok(total == len(frota['veiculos']), f'contagem "{pg.inner_text("#p1-cont")}" = {len(frota["veiculos"])} prefixos')
    nlin = len(pg.query_selector_all('#p1-tabela .linha'))
    ok(nlin < 120, f'rolagem virtual: {nlin} linhas desenhadas de {total}')
    pg.eval_on_selector('#p1-tabela', 'e => { e.scrollTop = e.scrollHeight; }'); pg.wait_for_timeout(300)
    ultima = pg.evaluate("() => { const ls = document.querySelectorAll('#p1-tabela .linha'); return ls[ls.length - 1].dataset.p; }")
    vis = pg.evaluate("""() => { const t = document.getElementById('p1-tabela').getBoundingClientRect(); const ls = document.querySelectorAll('#p1-tabela .linha');
                          const c = ls[ls.length - 1].querySelector('.fx2').getBoundingClientRect(); return c.bottom <= t.bottom + 1 && c.top >= t.top; }""")
    ok(vis, f'fim da tabela alcançado pela rolagem (último prefixo desenhado {ultima})')
    cab_top = pg.evaluate("() => document.querySelector('#p1-tabela .cel-h').getBoundingClientRect().top - document.getElementById('p1-tabela').getBoundingClientRect().top")
    ok(abs(cab_top) <= 2, f'cabeçalho fixo após rolar ({cab_top:.0f}px)')
    pg.eval_on_selector('#p1-tabela', 'e => { e.scrollTop = 0; }'); pg.wait_for_timeout(200)

    # filtros combinados
    ok(pg.query_selector('#f-garagem') is None, 'sem filtro de Garagem')
    emp = meta['empresas']
    metro = [i for i, e in enumerate(emp) if 'METROPOLE' in e.upper()]
    print('      METROPOLE agrupa:', [emp[i] for i in metro])
    pg.select_option('#f-empresa', '*METROPOLE'); pg.select_option('#f-camera', '21'); pg.click('#f-ok'); pg.wait_for_timeout(500)
    n = int(pg.inner_text('#p1-cont').split()[0].replace('.', ''))
    esperado = sum(1 for v in frota['veiculos'] if v.get('e') in metro and 21 in v['c'])
    ok(n == esperado, f'Empresa METROPOLE + câmera 21: {n} veículos (esperado {esperado})')
    print('      cards METROPOLE+21:', [c.inner_text().replace(chr(10), ' ') for c in pg.query_selector_all('.kpi')])
    pg.select_option('#f-empresa', ''); pg.select_option('#f-camera', ''); pg.click('#f-ok'); pg.wait_for_timeout(300)
    print('      cards:', [c.inner_text().replace(chr(10), ' ') for c in pg.query_selector_all('.kpi')])

    # navegação -> página 2
    pg.click('#nav'); pg.wait_for_selector('#p2-manut .rk'); pg.wait_for_timeout(400)
    ok('#estatisticas' in pg.url and pg.query_selector('#p2-conexao table') and pg.query_selector('#p2-manut table') and pg.query_selector('#estat svg, .estat svg') is None,
       'página 2 com ranking de conexão e ranking de manutenção, sem gráficos')
    ok(pg.query_selector('#f-garagem') is None, 'página 2 sem filtro de Garagem')
    pg.screenshot(path=str(out / f'{pref}_3_estatisticas.png'), full_page=True)
    pg.click('#nav'); pg.wait_for_selector('.st')
    ok(not pg.url.endswith('#estatisticas'), 'voltar ao monitoramento')
    pg.set_viewport_size({'width': 900, 'height': 900}); pg.wait_for_timeout(200)
    pg.query_selector('.st').click(); pg.wait_for_selector('.iv'); pg.wait_for_timeout(300)
    pos = pg.eval_on_selector('#p1-painel .painel, #p1-painel.painel', 'e => getComputedStyle(e).position')
    ok(pos == 'fixed', f'< 1024px: painel como gaveta sobreposta ({pos})')
    b.close()
print('ERROS DE CONSOLE:', erros or 'nenhum')
print('FALHAS:', falhas or 'nenhuma')
sys.exit(1 if falhas or erros else 0)
