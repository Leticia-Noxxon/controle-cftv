"""Fase 1 do módulo de OS em /v2/#usuarios (login + Usuários e Permissões), sem tocar no Supabase real:
as chamadas ao projeto são interceptadas (respostas simuladas) e nenhum e-mail é enviado.
Confere: tela de login (envio do link simulado), primeiro acesso com código, gestão (abas, matriz, exceções, edição de perfil),
temas claro/escuro em 1920x1080, 1366x768 e 390x844, sem erros de console. Uso: python tests/usuarios_v2.py URL_V2 PREFIXO"""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
pref = sys.argv[2] if len(sys.argv) > 2 else 'local'
out = Path(__file__).resolve().parents[1] / 'docs' / 'screenshots'
SB = 'https://baowdgzjmaxtkuugprmm.supabase.co'
falhas = []
VPS = [(1920, 1080), (1366, 768), (390, 844)]
EU = '11111111-1111-4111-8111-111111111111'
OUTRO = '22222222-2222-4222-8222-222222222222'
ACOES = ['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'administrar']
MODULOS = [{'codigo': c, 'nome': n, 'ordem': i} for i, (c, n) in enumerate([('usuarios', 'Usuários'), ('permissoes', 'Permissões'), ('cadastros', 'Cadastros'), ('os', 'Ordens de Serviço'),
           ('atendimentos', 'Atendimentos e formulário'), ('materiais', 'Solicitações de material'), ('estoque', 'Estoque'), ('validacoes', 'Validação pós-manutenção'),
           ('indicadores', 'Indicadores'), ('auditoria', 'Auditoria'), ('configuracoes', 'Configurações')])]
PERFIS = [{'id': 1, 'codigo': 'administrador', 'nome': 'Administrador', 'descricao': 'Acesso total'}, {'id': 2, 'codigo': 'operacional', 'nome': 'Operacional', 'descricao': 'Gestão de OS'},
          {'id': 3, 'codigo': 'manutencao', 'nome': 'Manutenção', 'descricao': 'Técnico de campo'}]
FIX = {
    'perfis': PERFIS, 'modulos': MODULOS,
    'garagens': [{'id': 1, 'nome': 'Viação Metrópole Itaim', 'ativo': True}, {'id': 2, 'nome': 'Santa Brigida', 'ativo': True}],
    'usuarios': [{'id': EU, 'nome': 'Letícia Pereira', 'email': 'leticia@exemplo.com', 'perfil_id': 1, 'garagem_atual_id': None, 'ativo': True, 'ultimo_acesso': '2026-10-01T12:00:00Z', 'criado_em': '2026-10-01T12:00:00Z'},
                 {'id': OUTRO, 'nome': 'Técnico Um', 'email': 'tecnico@exemplo.com', 'perfil_id': None, 'garagem_atual_id': None, 'ativo': False, 'ultimo_acesso': None, 'criado_em': '2026-10-01T12:00:00Z'}],
    'convites': [{'email': 'novo@exemplo.com', 'nome': 'Novo', 'perfil_id': 3, 'garagem_id': 1, 'criado_em': '2026-10-01T12:00:00Z', 'usado_em': None}],
    'permissoes': [{'perfil_id': 1, 'modulo': m['codigo'], 'acao': 'administrar'} for m in MODULOS] + [{'perfil_id': 3, 'modulo': 'os', 'acao': 'visualizar'}, {'perfil_id': 3, 'modulo': 'atendimentos', 'acao': 'criar'}],
    'permissoes_usuario': [{'usuario_id': OUTRO, 'modulo': 'estoque', 'acao': 'visualizar', 'permitido': True}],
}


def ok(c, m):
    print('OK   ' if c else 'FALHA', m)
    if not c:
        falhas.append(m)


def sessao():
    agora = int(time.time())
    user = {'id': EU, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'leticia@exemplo.com', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-01T12:00:00Z'}
    return json.dumps({'access_token': 'teste.teste.teste', 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': agora + 3600, 'user': user})


def simular(ctx, eu_ativo=True, chamadas=None):
    eu = {'id': EU, 'nome': 'Letícia Pereira', 'email': 'leticia@exemplo.com', 'perfil': 'administrador' if eu_ativo else None, 'perfil_nome': 'Administrador' if eu_ativo else None,
          'ativo': eu_ativo, 'garagem_atual_id': None, 'garagem_atual': None, 'existe_admin': eu_ativo, 'bootstrap_disponivel': not eu_ativo}

    def tratar(route):
        r = route.request
        u = r.url.split('?')[0]
        if chamadas is not None and r.method in ('POST', 'PATCH', 'DELETE') and '/rest/v1/' in u:
            chamadas.append((r.method, u.rsplit('/', 1)[-1], r.post_data))
        if u.endswith('/auth/v1/otp'):
            return route.fulfill(status=200, content_type='application/json', body='{}')
        if '/rpc/meu_usuario' in u:
            obj = 'vnd.pgrst.object' in (r.headers.get('accept') or '')
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(eu if obj else [eu]))
        if '/rpc/minhas_permissoes' in u:
            return route.fulfill(status=200, content_type='application/json', body=json.dumps([{'modulo': m['codigo'], 'acao': a} for m in MODULOS for a in ACOES] if eu_ativo else []))
        if '/rpc/registrar_acesso' in u:
            return route.fulfill(status=204, body='')
        if '/rpc/reivindicar_admin' in u:
            return route.fulfill(status=200, content_type='application/json', body='"codigo_invalido"')
        tabela = u.rsplit('/', 1)[-1]
        if r.method == 'GET' and tabela in FIX:
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(FIX[tabela]))
        if r.method in ('POST', 'PATCH', 'DELETE'):
            return route.fulfill(status=201 if r.method == 'POST' else 204, body='')
        return route.fulfill(status=404, body='{}')
    ctx.route(SB + '/**', tratar)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for tema in ('claro', 'escuro'):
        for w, h in VPS:
            # 1) Sem sessão: tela de login
            ctx = b.new_context(color_scheme='dark' if tema == 'escuro' else 'light', locale='pt-BR', viewport={'width': w, 'height': h})
            simular(ctx)
            pg = ctx.new_page(); erros = []
            pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.goto(base + '#usuarios', wait_until='networkidle'); pg.wait_for_selector('#us-login')
            ok(pg.query_selector('#nav-usuarios.ativo') is not None, f'{tema} {w}x{h}: item "Usuários e Permissões" ativo no menu')
            pg.fill('#us-email', 'nome@exemplo.com'); pg.click('#us-enviar'); pg.wait_for_selector('.us-msg.us-ok')
            ok('Enviamos o link' in pg.inner_text('#us-msg'), f'{tema} {w}x{h}: login envia link (simulado)')
            pg.screenshot(path=str(out / f'{pref}_v2_login_{tema}_{w}x{h}.png'))
            ok(not erros, f'{tema} {w}x{h}: login sem erros de console {erros[:3]}')
            ctx.close()
            # 2) Logado, sem perfil, com código de primeiro acesso disponível
            ctx = b.new_context(color_scheme='dark' if tema == 'escuro' else 'light', locale='pt-BR', viewport={'width': w, 'height': h})
            simular(ctx, eu_ativo=False)
            ctx.add_init_script(f"localStorage.setItem('cftv-os-auth', {json.dumps(sessao())}); localStorage.setItem('cftv-login-em', String(Date.now()));")
            pg = ctx.new_page(); erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.goto(base + '#usuarios', wait_until='networkidle'); pg.wait_for_selector('#us-boot')
            pg.fill('#us-cod', 'abcd-efgh'); pg.click('#us-boot-b'); pg.wait_for_selector('.us-msg.us-erro')
            ok('incorreto' in pg.inner_text('#us-msg'), f'{tema} {w}x{h}: primeiro acesso valida código (simulado)')
            if w == 1920:
                pg.screenshot(path=str(out / f'{pref}_v2_primeiro_acesso_{tema}_{w}x{h}.png'))
            ok(not erros, f'{tema} {w}x{h}: primeiro acesso sem erros {erros[:3]}')
            ctx.close()
            # 3) Administrador: gestão
            ctx = b.new_context(color_scheme='dark' if tema == 'escuro' else 'light', locale='pt-BR', viewport={'width': w, 'height': h})
            chamadas = []
            simular(ctx, chamadas=chamadas)
            ctx.add_init_script(f"localStorage.setItem('cftv-os-auth', {json.dumps(sessao())}); localStorage.setItem('cftv-login-em', String(Date.now()));")
            pg = ctx.new_page(); erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.goto(base + '#usuarios', wait_until='networkidle'); pg.wait_for_selector('.us-tab')
            ok(len(pg.query_selector_all('.us-tab tbody tr')) == 2 and 'Letícia Pereira' in pg.inner_text('.us-eu'), f'{tema} {w}x{h}: lista de usuários e usuário logado')
            pg.screenshot(path=str(out / f'{pref}_v2_usuarios_{tema}_{w}x{h}.png'), full_page=True)
            pg.select_option(f'tr[data-id="{OUTRO}"] select[data-c="perfil_id"]', '3'); pg.wait_for_timeout(400)
            ok(any(c[0] == 'PATCH' and c[1] == 'usuarios' and '"perfil_id":3' in (c[2] or '') for c in chamadas), f'{tema} {w}x{h}: mudar perfil grava (PATCH usuarios)')
            ok(pg.query_selector(f'tr[data-id="{EU}"] input[data-c="ativo"]') is None, f'{tema} {w}x{h}: não permite desativar o próprio acesso')
            pg.click('#us-abas button[data-s="convites"]'); pg.wait_for_selector('#us-conv')
            pg.fill('#cv-email', 'outro@exemplo.com'); pg.click('#us-conv button[type=submit]'); pg.wait_for_timeout(400)
            ok(any(c[0] == 'POST' and c[1] == 'convites' for c in chamadas), f'{tema} {w}x{h}: pré-autorização grava (POST convites)')
            pg.click('#us-abas button[data-s="perfis"]'); pg.wait_for_selector('.us-matriz')
            ok(len(pg.query_selector_all('.us-matriz tbody tr')) == 11 and len(pg.query_selector_all('.us-matriz input:checked')) == 0, f'{tema} {w}x{h}: matriz do perfil Operacional (11 módulos)')
            pg.click('#us-perfis button[data-p="1"]'); pg.wait_for_timeout(200)
            ok(pg.query_selector('.us-matriz input:not([disabled])') is None, f'{tema} {w}x{h}: perfil Administrador travado')
            pg.click('#us-perfis button[data-p="3"]'); pg.wait_for_timeout(200)
            pg.click('.us-matriz input[data-m="estoque"][data-a="visualizar"]'); pg.wait_for_timeout(400)
            ok(any(c[0] == 'POST' and c[1] == 'permissoes' for c in chamadas), f'{tema} {w}x{h}: marcar permissão grava (POST permissoes)')
            pg.screenshot(path=str(out / f'{pref}_v2_permissoes_{tema}_{w}x{h}.png'), full_page=True)
            pg.click('#us-abas button[data-s="excecoes"]'); pg.wait_for_selector('select.us-tri')
            ok(pg.query_selector('select.us-tri.us-sim') is not None, f'{tema} {w}x{h}: exceção "Permitir" exibida')
            pg.select_option('select.us-tri[data-m="os"][data-a="criar"]', 'nao'); pg.wait_for_timeout(400)
            ok(any(c[0] == 'POST' and c[1] == 'permissoes_usuario' for c in chamadas), f'{tema} {w}x{h}: exceção grava (upsert permissoes_usuario)')
            ok(not erros, f'{tema} {w}x{h}: gestão sem erros {erros[:3]}')
            ctx.close()
    b.close()
print('FALHAS:', falhas or 'nenhuma')
sys.exit(1 if falhas else 0)
