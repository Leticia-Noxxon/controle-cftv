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

    # paginação alcança todas as linhas
    total = int(pg.inner_text('#p1-pag').split(' de ')[1].split()[0].replace('.', ''))
    pg.select_option('#p1-por', '100'); pg.wait_for_timeout(300)
    ult = pg.query_selector_all('#p1-pag .pg[data-g]')[-2]
    ult.click(); pg.wait_for_timeout(300)
    info = pg.inner_text('#p1-pag').split('\n')[0]
    ok(info.replace('.', '').endswith(f'de {total}') and f'–{total:,}'.replace(',', '.') in info, f'última página: "{info}"')
    ok(total == len(frota['veiculos']), f'total de linhas = {total} prefixos')

    # filtros combinados
    g = meta['garagens'][0]
    pg.select_option('#f-garagem', g); pg.select_option('#f-camera', '21'); pg.click('#f-ok'); pg.wait_for_timeout(500)
    n = int(pg.inner_text('#p1-pag').split(' de ')[1].split()[0].replace('.', ''))
    esperado = sum(1 for v in frota['veiculos'] if v.get('g') == g and 21 in v['c'])
    ok(n == esperado, f'Garagem "{g}" + câmera 21: {n} linhas (esperado {esperado})')
    pg.select_option('#f-garagem', ''); pg.select_option('#f-camera', ''); pg.click('#f-ok'); pg.wait_for_timeout(300)

    # navegação -> página 2
    pg.click('#nav'); pg.wait_for_selector('.rk'); pg.wait_for_timeout(400)
    ok('#estatisticas' in pg.url and pg.query_selector('.donut svg') and pg.query_selector('#p2-linha svg path'), 'página 2 com ranking, rosca e linha')
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
