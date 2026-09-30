"""Validação da versão v2 no navegador (local ou publicada) + capturas de tela + OS de exemplo.
Uso: python tests/capturas_v2.py URL_V2 PREFIXO   (ex.: http://localhost:4174/v2/ local_v2)"""
import sys
from pathlib import Path

import openpyxl
from playwright.sync_api import sync_playwright

url = sys.argv[1].rstrip('/') + '/'
pref = sys.argv[2] if len(sys.argv) > 2 else 'local_v2'
raiz = Path(__file__).resolve().parents[1]
out = raiz / 'docs' / 'screenshots'
out.mkdir(parents=True, exist_ok=True)
erros, falhas = [], []
VIEWPORTS = [(1920, 1080), (1366, 768), (390, 844)]
CAMS = [f'Câm {c}' for c in range(21, 27)]
FAIXAS = ['Alta', 'Média', 'Baixa']


def ok(cond, msg):
    print(('OK   ' if cond else 'FALHA') + ' ' + msg)
    if not cond:
        falhas.append(msg)


def num(t):
    return int(str(t).strip().split()[0].replace('.', '') or 0)


def rolagem(pg):
    return pg.evaluate("""() => ({h: document.documentElement.scrollHeight, H: innerHeight, w: document.documentElement.scrollWidth, W: innerWidth})""")


def sem_rolagem(pg, onde):
    r = rolagem(pg)
    ok(r['h'] <= r['H'] and r['w'] <= r['W'], f"{onde}: sem rolagem da página ({r['w']}x{r['h']} em {r['W']}x{r['H']})")


def sem_rolagem_horizontal(pg, onde):
    r = rolagem(pg)
    ok(r['w'] <= r['W'], f"{onde}: sem rolagem horizontal da página ({r['w']} em {r['W']}; altura {r['h']})")


def cabecalhos(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#v-tabela thead tr:nth-child(2) th')].map((t) => t.childNodes[0].textContent.trim())")


def total(pg, chave):
    """valor da linha Total na coluna data-o=chave"""
    return pg.evaluate("""(k) => { const ths = [...document.querySelectorAll('#v-tabela thead tr:nth-child(2) th')];
        const i = ths.findIndex((t) => t.dataset.o === k); if (i < 0) return null;
        return document.querySelectorAll('#v-tabela tfoot td')[i + 1].textContent; }""", chave)


def verificar_os(arq, cams, nome):
    wb = openpyxl.load_workbook(arq)
    ws = wb.active
    cab = [c.value for c in ws[1]]
    dados = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[0] is not None]
    print(f'      {nome}:', wb.sheetnames, cab, len(dados), 'linhas')
    ok(wb.sheetnames == ['Ordem de Serviço'], f'{nome}: só a aba Ordem de Serviço (sem legenda)')
    ok(cab == ['Prioridade', 'Garagem/Empresa', 'Prefixo', *cams, 'Observação técnica', 'Última manutenção'], f'{nome}: tabela começa na linha 1 com as colunas pedidas')
    ok(all(r[0] in FAIXAS for r in dados), f'{nome}: prioridade Alta/Média/Baixa')
    pos = [FAIXAS.index(r[0]) for r in dados]
    ok(pos == sorted(pos), f'{nome}: ordenada por prioridade ({", ".join(f"{f} {pos.count(k)}" for k, f in enumerate(FAIXAS))})')
    ic = [cab.index(c) + 1 for c in cams]
    fills = {ws.cell(row=r, column=c).fill.patternType for r in range(2, min(ws.max_row, 300) + 1) for c in ic}
    ok(fills <= {None}, f'{nome}: status das câmeras em texto, sem preenchimento')
    if len(cams) == 1:
        obs = [r[cab.index('Observação técnica')] for r in dados]
        ok(not any(f'Câm {c}' in o for o in obs for c in range(21, 27) if f'Câm {c}' != cams[0]), f'{nome}: observação só da câmera escolhida')
    man = [r[-1] for r in dados if r[-1] and r[-1] != '—']
    ok(all(len(m) > 12 and m[2] == '/' and not any(x in m for x in ('Ã£', 'Ã§', 'Ã©', 'Ã¡', '�')) for m in man), f'{nome}: Última manutenção com data e resumo limpo ({len(man)} preenchidas)')
    ok(ws.freeze_panes == 'D2' and ws.auto_filter.ref and ws.page_setup.orientation == 'landscape' and str(ws.page_setup.paperSize) == '9' and ws.sheet_properties.pageSetUpPr.fitToPage,
       f'{nome}: cabeçalho congelado, filtros, A4 paisagem ajustada à largura')
    return dados


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = b.new_context(viewport={'width': 1920, 'height': 1080}, locale='pt-BR', accept_downloads=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(url, wait_until='networkidle')
    pg.wait_for_selector('#v-tabela .gt')
    frota = pg.evaluate("fetch('../data/frota.json').then(r => r.json())")
    meta = pg.evaluate("fetch('../data/meta.json').then(r => r.json())")
    nveic = len(frota['veiculos'])

    # ---------------- Cabeçalho ----------------
    topo = pg.evaluate("""() => { const t = document.querySelector('.titulo').getBoundingClientRect(), f = document.querySelector('#topo-filtros').getBoundingClientRect();
        return {tt: t.top, tb: t.bottom, ft: f.top, fb: f.bottom, fr: f.right, fl: f.left, tr: t.right, W: document.querySelector('.topo').getBoundingClientRect().right}; }""")
    ok(topo['fl'] > topo['tr'] and topo['ft'] < topo['tb'] and abs(topo['W'] - topo['fr']) < 2, 'filtros na mesma linha do título, alinhados à direita')
    ok(pg.query_selector('.subtitulo') is None, 'sem subtítulo')
    ok(pg.inner_text('label[for="f-empresa"]') == 'Empresa', 'rótulo do filtro = Empresa')
    upd = pg.evaluate("() => { const e = document.getElementById('upd'), r = e.getBoundingClientRect(); return [getComputedStyle(e).position, innerWidth - r.right, innerHeight - r.bottom, e.textContent]; }")
    ok(upd[0] == 'fixed' and upd[1] < 40 and upd[2] < 40 and 'Última atualização' in upd[3], f'Última atualização fixa no canto inferior direito ({upd[3]})')

    # ---------------- Aba 1: Visão geral ----------------
    cards = {c.get_attribute('data-card'): num(c.query_selector('.val').inner_text()) for c in pg.query_selector_all('.kpi')}
    print('      cards:', cards)
    ok(len(cards) == 4 and pg.query_selector('.kpi .un') is None, '4 cards sem palavra de unidade')
    deltas = pg.evaluate("() => [...document.querySelectorAll('.kpi')].map((c) => { const d = c.querySelector('.delta'); return d ? [c.dataset.card, d.className, d.textContent, d.title] : null; })")
    print('      variações:', [d[:3] for d in deltas if d])
    ok(all(d and 'anterior' in d[3].lower() for d in deltas), 'variação vs dia anterior em todos os cards, com base na dica')
    coer = True
    for card, cls, txt, _ in deltas:
        if '▲' in txt:
            coer &= ('bom' in cls) == (card == 'on')
        elif '▼' in txt:
            coer &= ('ruim' in cls) == (card == 'on')
    ok(coer, 'cores das setas: funcionais sobe = verde; demais sobe = vermelho')
    ok(pg.query_selector('#v-graf') is None and pg.query_selector('.vg-graf') is None, 'gráfico Evolução diária removido da página')
    ok(pg.inner_text('.vg-bar h2') == 'Conexão por Empresa' and pg.query_selector('.vg-bar .sub') is None, 'título "Conexão por Empresa", sem legenda de contagem')
    heads = cabecalhos(pg)
    print('      colunas:', heads)
    ok(heads[:5] == ['Veículos', 'Funcionais', '1+ câm. c/ falha', '100% offline', 'Erro SD'] and heads[-6:] == [str(c) for c in range(21, 27)], 'cabeçalhos curtos (Funcionais … Erro SD, 21 … 26)')
    ok('Veículos com falha por câmera' in pg.inner_text('#v-tabela .tr-grupo'), 'grupo "Veículos com falha por câmera"')
    ok(all(pg.get_attribute(f'#v-tabela th[data-o="{k}"]', 'data-tip') for k in ['vf', 'vp', 'vo', 'vs']), 'definições nas dicas dos cabeçalhos')
    garagens = [t.inner_text() for t in pg.query_selector_all('#v-tabela tbody .lnk-g')]
    ok('Não informado' not in garagens and sum(1 for g in garagens if 'Sudeste' in g) == 1, f'{len(garagens)} empresas, Via Sudeste unificada')
    t = {k: num(total(pg, k) or 0) for k in ['vt', 'vf', 'vp', 'vo', 'vs', 'vn']}
    print('      totais:', t)
    ok(t['vt'] == nveic, f'Total de veículos = {nveic}')
    ok(t['vf'] + t['vp'] + t['vo'] + t['vs'] + t['vn'] == t['vt'], 'Funcionais + 1+ câm. c/ falha + 100% offline + Erro SD (+ sem conexão) = Veículos')
    ok(t['vp'] + t['vo'] + t['vs'] == cards['veic'], 'card Veículos com falha = 1+ câm. c/ falha + 100% offline + Erro SD')
    est = pg.evaluate("""() => { const tb = document.getElementById('v-tabela'), td = tb.querySelector('tbody td.n'), tr = tb.querySelector('tbody tr:nth-child(2) td');
        return {oh: getComputedStyle(tb).overflowY, sh: tb.scrollHeight, ch: tb.clientHeight, al: getComputedStyle(td).textAlign, num: getComputedStyle(td).fontVariantNumeric, pad: parseFloat(getComputedStyle(td).paddingLeft), zebra: getComputedStyle(tr).backgroundColor,
                 sep: getComputedStyle(tb.querySelector('tbody td.g-ini')).borderLeftWidth}; }""")
    ok(est['sh'] <= est['ch'] + 1, f'tabela inteira sem rolagem interna ({est["sh"]} ≤ {est["ch"]})')
    ok(est['al'] == 'right' and 'tabular-nums' in est['num'] and est['pad'] >= 12 and est['sep'] == '1px' and est['zebra'] != 'rgb(255, 255, 255)', f'números à direita tabulares, espaçamento {est["pad"]}px, separadores de grupo e zebra')
    pg.click('#v-tabela th[data-o="vt"]'); pg.wait_for_timeout(150)
    vals = [num(x.inner_text()) for x in pg.query_selector_all('#v-tabela tbody tr td:nth-child(2)')]
    ok(vals == sorted(vals, reverse=True), 'ordenar por Veículos')
    pg.click('#v-tabela th.th-emp'); pg.wait_for_timeout(150)
    for w, h in VIEWPORTS:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(350)
        sem_rolagem_horizontal(pg, f'Visão geral {w}x{h}')
        pg.screenshot(path=str(out / f'{pref}_vp_{w}x{h}_visao.png'), full_page=True)
    pg.set_viewport_size({'width': 1920, 'height': 1080}); pg.wait_for_timeout(300)
    pg.screenshot(path=str(out / f'{pref}_1_visao_geral.png'), full_page=True)

    # manutenção (switch)
    ok(pg.get_attribute('#v-manut', 'type') == 'checkbox' and pg.query_selector('label.switch .trilho'), 'Manutenção é um switch')
    pg.check('#v-manut', force=True); pg.wait_for_timeout(300)
    m = {k: num(total(pg, k)) for k in ['ma', 'mr', 'mp', 'ms', 'mi']}
    print('      manutenção (total):', m)
    ok(cabecalhos(pg)[-5:] == ['Atendidos', 'Reincidências', 'Procedentes', 'Solucionados', 'Improcedentes'], 'cabeçalhos curtos de manutenção')
    ok((m['ma'], m['mr'], m['mp'], m['ms']) == (595, 64, 282, 71), 'totais de manutenção 595 / 64 / 282 / 71')
    ok(0 < m['mi'] <= m['ma'] - m['mp'], f'Improcedentes coerente ({m["mi"]})')
    ok(all(pg.get_attribute(f'#v-tabela th[data-o="{k}"]', 'data-tip') for k in ['ma', 'mr', 'mp', 'ms', 'mi']), 'dicas nos cabeçalhos de manutenção')
    sem_rolagem_horizontal(pg, 'Visão geral com manutenção 1920x1080')
    pg.screenshot(path=str(out / f'{pref}_2_visao_manutencao.png'), full_page=True)
    pg.set_viewport_size({'width': 1366, 'height': 768}); pg.wait_for_timeout(300)
    sem_rolagem_horizontal(pg, 'Visão geral com manutenção 1366x768')
    pg.set_viewport_size({'width': 1920, 'height': 1080}); pg.wait_for_timeout(300)
    pg.uncheck('#v-manut', force=True); pg.wait_for_timeout(200)
    ok(pg.query_selector('#v-tabela th[data-o="ma"]') is None, 'desligar Manutenção remove as colunas')

    # Veículo | Câmera
    pg.click('#v-modo button[data-m="cam"]'); pg.wait_for_timeout(250)
    ok(num(total(pg, 'cf')) == cards['on'] and num(total(pg, 'cs')) == cards['fa'] and num(total(pg, 'co')) == cards['off'], 'modo Câmera: totais = cards de câmeras')
    pg.click('#v-modo button[data-m="veic"]'); pg.wait_for_timeout(250)

    # exportação Excel
    with pg.expect_download() as dl:
        pg.click('#v-xlsx')
    arq = out.parent / f'{pref}_garagens.xlsx'
    dl.value.save_as(str(arq))
    linhas = list(openpyxl.load_workbook(arq).active.iter_rows(values_only=True))
    ok(any(r[0] == 'Total' and r[1] == nveic for r in linhas), f'Excel exportado ({dl.value.suggested_filename}) com linha Total')
    arq.unlink()

    # calendário
    pg.click('#f-periodo-btn'); pg.wait_for_selector('#cal-pop')
    ok('Setembro de 2026' in pg.inner_text('#cal-pop .cal-cab') and pg.inner_text('#cal-pop .cal-sem').replace('\n', '') == 'DSTQQSS', 'calendário em pt-BR')
    livres = pg.query_selector_all('#cal-pop .cal-d:not([disabled])')
    livres[-7].click(); pg.wait_for_timeout(150)
    ok('escolha o fim' in pg.inner_text('#cal-pop .cal-dica'), 'primeiro clique marca o início')
    pg.hover('#cal-pop .cal-d:not([disabled]) >> nth=-3')
    pg.screenshot(path=str(out / f'{pref}_4_calendario.png'))
    pg.query_selector_all('#cal-pop .cal-d:not([disabled])')[-3].click(); pg.wait_for_timeout(500)
    rot = pg.inner_text('#f-periodo-btn')
    ok(pg.query_selector('#cal-pop') is None and '–' in rot and pg.query_selector('#f-periodo-limpar'), f'intervalo aplicado ({rot})')
    dl_txt = pg.get_attribute('.kpi .delta', 'title')
    ok(dl_txt and rot.split('–')[1].strip()[:5] in dl_txt, 'variação dos cards segue o período escolhido')
    pg.click('#f-periodo-btn'); pg.wait_for_selector('#cal-pop')
    livres = pg.query_selector_all('#cal-pop .cal-d:not([disabled])')
    livres[-2].click(); pg.query_selector_all('#cal-pop .cal-d:not([disabled])')[-2].click(); pg.wait_for_timeout(400)
    ok('–' not in pg.inner_text('#f-periodo-btn'), f'dia único ({pg.inner_text("#f-periodo-btn")})')
    pg.click('#f-periodo-limpar'); pg.wait_for_timeout(400)
    ok(pg.inner_text('#f-periodo-btn') == 'Todo o período' and num(total(pg, 'vt')) == nveic, 'limpar período')

    # filtros
    pg.select_option('#f-empresa', '*METROPOLE'); pg.select_option('#f-camera', '21'); pg.wait_for_timeout(500)
    esperado = sum(1 for v in frota['veiculos'] if v.get('e') is not None and 'METROPOLE' in meta['empresas'][v['e']].upper() and 21 in v['c'])
    ok(num(total(pg, 'vt')) == esperado and len(pg.query_selector_all('#v-tabela thead th.g-c:not(.gh)')) == 1, f'METROPOLE + câmera 21: {esperado} veículos, só a coluna 21')
    pg.select_option('#f-empresa', ''); pg.select_option('#f-camera', ''); pg.wait_for_timeout(400)
    pg.type('#f-prefixo', '6800', delay=40); pg.wait_for_timeout(600)
    esp = sum(1 for v in frota['veiculos'] if '6800' in str(v['p']))
    ok(num(total(pg, 'vt')) == esp, f'prefixo "6800": {esp}')
    pg.fill('#f-prefixo', ''); pg.wait_for_timeout(500)
    pg.click('.kpi[data-card="veic"]'); pg.wait_for_timeout(300)
    ok(num(total(pg, 'vt')) == cards['veic'], 'card Veículos com falha filtra a tabela')
    pg.click('.kpi[data-card="veic"]'); pg.wait_for_timeout(300)

    # modal da garagem: gráfico (clique no nome)
    nv = num(pg.query_selector('#v-tabela tbody tr[data-g="Via Sudeste"] td:nth-child(2)').inner_text())
    pg.click('#v-tabela .lnk-g[data-g="Via Sudeste"]'); pg.wait_for_selector('#g-graf svg path.ln'); pg.wait_for_timeout(300)
    cores = pg.evaluate("() => [...document.querySelectorAll('#g-graf path.ln')].map((p) => p.style.stroke)")
    ok(sorted(cores) == sorted(['rgb(47, 158, 98)', 'rgb(224, 138, 0)', 'rgb(124, 92, 214)', 'rgb(214, 69, 69)']), f'gráfico da garagem com 4 séries ({cores})')
    ok(len(pg.query_selector_all('#g-graf .grade-g line')) > 3 and pg.query_selector('#g-graf path.area-g') is not None, 'grade, eixos e área sombreada')
    leg = pg.inner_text('#g-leg')
    ok(all(x in leg for x in ['Funcional', '1+ câm', 'Erro de SD', '100% Offline']), 'legenda do gráfico')
    bx = pg.query_selector('#g-graf svg').bounding_box()
    pg.mouse.move(bx['x'] + bx['width'] * .6, bx['y'] + bx['height'] * .5); pg.wait_for_timeout(200)
    ok(pg.is_visible('#tip') and 'Funcional' in pg.inner_text('#tip'), 'tooltip com os valores do dia')
    pg.screenshot(path=str(out / f'{pref}_3_modal_grafico.png'))
    pg.click('#g-modo button[data-m="cam"]'); pg.wait_for_timeout(300)
    ok(len(pg.query_selector_all('#g-graf path.ln')) == 4 and 'câmeras' in pg.inner_text('#g-graf').lower(), 'alternância Veículo/Câmera no gráfico')
    pg.screenshot(path=str(out / f'{pref}_3b_modal_grafico_camera.png'))
    pg.click('#g-abas button[data-a="veiculos"]'); pg.wait_for_selector('#modal .gt-v')
    ok(len(pg.query_selector_all('#modal .gt-v tbody tr')) == nv, f'aba Veículos do modal: {nv} veículos')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok(pg.query_selector('#modal') is None, 'Esc fecha o modal')
    for w, h in VIEWPORTS[1:]:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(300)
        pg.click('#v-tabela .lnk-g[data-g="Via Sudeste"]'); pg.wait_for_selector('#g-graf svg path.ln'); pg.wait_for_timeout(300)
        g = pg.query_selector('#g-graf').bounding_box()
        ok(g['height'] >= 200 and g['width'] > 300, f'modal do gráfico {w}x{h} ({g["width"]:.0f}x{g["height"]:.0f})')
        pg.screenshot(path=str(out / f'{pref}_vp_{w}x{h}_modal_grafico.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.set_viewport_size({'width': 1920, 'height': 1080}); pg.wait_for_timeout(300)
    # clique no resto da linha: lista de veículos
    pg.click('#v-tabela tbody tr[data-g="Via Sudeste"] td:nth-child(3)'); pg.wait_for_selector('#modal .gt-v')
    alvo = pg.query_selector('#modal .gt-v tbody tr')
    p_alvo = alvo.get_attribute('data-p'); alvo.click(); pg.wait_for_selector('#modal .iv'); pg.wait_for_timeout(300)
    ok(f'Prefixo {p_alvo}' in pg.inner_text('#g-painel'), f'resto da linha abre a lista de veículos; detalhe do {p_alvo}')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # ---------------- Aba 2: Matriz ----------------
    pg.click('#nav-matriz'); pg.wait_for_selector('.st'); pg.wait_for_timeout(300)
    ok('#matriz' in pg.url and pg.query_selector('#topo-filtros #f-mes') and pg.query_selector('#topo-filtros #btn-os'), 'Matriz: filtros e OS na linha do título')
    ok(pg.evaluate("getComputedStyle(document.getElementById('upd')).position") == 'fixed', 'Matriz: última atualização fixa')
    meses = sorted({d[:7] for d in meta['dias']})
    ok(pg.input_value('#f-mes') == meses[-1], f'Mês padrão = {meses[-1]}')
    chips = pg.inner_text('#m-status')
    ok(all(x in chips for x in ['Funcional', '100% Offline', 'Erro de SD', '1+ câm. com problema', 'Sem conexão', 'Manutenção']), 'filtro de status com os 6 itens')
    cores_st = pg.evaluate("() => Object.fromEntries(['on','off','sd','fa','nd'].map((k) => { const e = document.querySelector('#m-tabela .st.' + k); return [k, e ? getComputedStyle(e).backgroundColor : null]; }))")
    print('      cores:', cores_st)
    ok(cores_st['sd'] and cores_st['fa'] and cores_st['sd'] != cores_st['fa'] and len({v for v in cores_st.values() if v}) == len([v for v in cores_st.values() if v]), 'Erro de SD e 1+ câm. com problema com cores distintas')
    total_m = num(pg.inner_text('#m-cont'))
    ok(total_m == nveic, f'{total_m} veículos na matriz')
    pg.click('#m-status label:has(input[value="off"]) span'); pg.wait_for_timeout(400)
    n_off = num(pg.inner_text('#m-cont'))
    ok(0 < n_off < total_m and all(l.query_selector('.st.off') for l in pg.query_selector_all('#m-tabela .linha')[:40]), f'status 100% Offline: {n_off} veículos (todos com dia offline)')
    pg.click('#m-status label:has(input[value="sd"]) span'); pg.wait_for_timeout(400)
    n2 = num(pg.inner_text('#m-cont'))
    ok(n2 >= n_off, f'+ Erro de SD (união): {n2}')
    pg.screenshot(path=str(out / f'{pref}_5_matriz_status.png'))
    for w, h in VIEWPORTS:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(300)
        sem_rolagem(pg, f'Matriz {w}x{h}')
        pg.screenshot(path=str(out / f'{pref}_vp_{w}x{h}_matriz.png'))
    pg.set_viewport_size({'width': 1920, 'height': 1080}); pg.wait_for_timeout(300)
    pg.click('#m-status-limpar'); pg.wait_for_timeout(300)
    ok(num(pg.inner_text('#m-cont')) == total_m, 'limpar filtro de status')
    pg.click('#m-status label:has(input[value="man"]) span'); pg.wait_for_timeout(400)
    ok(all(l.query_selector('.man') for l in pg.query_selector_all('#m-tabela .linha')[:40]), 'status Manutenção: só veículos com manutenção no mês')
    pg.click('#m-status-limpar'); pg.wait_for_timeout(300)
    # câmera selecionada: só a câmera
    pg.select_option('#f-camera', '21'); pg.wait_for_timeout(700)
    alvo = pg.query_selector('#m-tabela .st.off, #m-tabela .st.sd')
    alvo.hover(); pg.wait_for_timeout(200)
    tip = pg.inner_text('#tip')
    ok('Câm 22' not in tip and 'câmeras' not in tip.lower().replace('câmeras somados', ''), 'tooltip só da câmera 21')
    alvo.click(); pg.wait_for_selector('#m-painel .iv'); pg.wait_for_timeout(350)
    ok(len(pg.query_selector_all('#m-painel .cam-b')) == 1 and pg.inner_text('#m-painel .sec h3') == 'Câmera', 'painel só da câmera 21')
    pg.screenshot(path=str(out / f'{pref}_5b_matriz_camera21.png'))
    pg.click('#pn-fechar'); pg.wait_for_timeout(200)

    # OS: câmera 21 e todas as câmeras (todas as empresas, problemas padrão)
    def gerar_os(camera, destino):
        pg.click('#btn-os'); pg.wait_for_selector('#modal .os-form'); pg.wait_for_function("!document.querySelector('#os-res').textContent.includes('Calculando')")
        pg.select_option('#os-g', ''); pg.select_option('#os-c', camera); pg.wait_for_timeout(900)
        ok(all(pg.is_checked(f'#os-p input[value="{k}"]') for k in ['prob', 'sd', 'off']) and not pg.is_checked('#os-p input[value="on"]'), 'OS: problemas padrão (1+ câmera, SD, 100% offline)')
        n = num(pg.inner_text('#os-res b'))
        if camera == '':
            pg.screenshot(path=str(out / f'{pref}_6_modal_os.png'))
        with pg.expect_download(timeout=120000) as dl:
            pg.click('#os-gerar')
        dl.value.save_as(str(destino))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        return n, dl.value.suggested_filename
    n21, nome21 = gerar_os('21', raiz / 'docs' / 'OS_exemplo_cam21.xlsx')
    d21 = verificar_os(raiz / 'docs' / 'OS_exemplo_cam21.xlsx', ['Câm 21'], f'OS câmera 21 ({nome21})')
    ok(len(d21) == n21, f'OS câmera 21: {n21} veículos')
    pg.select_option('#f-camera', ''); pg.wait_for_timeout(500)
    nt, nomet = gerar_os('', raiz / 'docs' / 'OS_exemplo_todas.xlsx')
    dt = verificar_os(raiz / 'docs' / 'OS_exemplo_todas.xlsx', CAMS, f'OS todas as câmeras ({nomet})')
    ok(len(dt) == nt, f'OS todas: {nt} veículos')
    # celular: painel como gaveta
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
    pg.query_selector('#m-tabela .st:not(.nd)').click(); pg.wait_for_selector('#m-painel .iv'); pg.wait_for_timeout(300)
    ok(pg.eval_on_selector('#m-painel .painel', 'e => getComputedStyle(e).position') == 'fixed', 'celular: painel como gaveta')
    sem_rolagem(pg, 'celular com painel')
    b.close()
print('ERROS DE CONSOLE:', erros or 'nenhum')
print('FALHAS:', falhas or 'nenhuma')
sys.exit(1 if falhas or erros else 0)
