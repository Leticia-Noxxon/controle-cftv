"""Testes do banco do módulo de OS num Postgres local (após tests/rodar_local.sh).
Simula as requisições do Supabase: papel authenticated/anon + request.jwt.claims com o id do usuário.
Uso: python supabase/tests/test_banco.py   (variável PGDATABASE=cftv_os; conexão local por socket)"""
import json
import os
import threading
import time
import uuid

import psycopg

DSN = os.environ.get('PG_DSN', 'dbname=cftv_os')
falhas = []
# Supabase carrega pg_safeupdate para os papéis da API (DELETE/UPDATE sem WHERE falham)
SAFEUPDATE = os.environ.get('SAFEUPDATE', '1') == '1'


def ok(cond, msg):
    print('OK   ' if cond else 'FALHA', msg)
    if not cond:
        falhas.append(msg)


def conn():
    return psycopg.connect(DSN, autocommit=False)


def como(c, uid, papel='authenticated'):
    """Inicia uma 'requisição' (transação) como o usuário, com pg_safeupdate como na API do Supabase."""
    if SAFEUPDATE:
        c.execute("load 'safeupdate'")
    c.execute(f"set local role {papel}")
    c.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': str(uid), 'role': papel}) if uid else '',))


def req(uid, sql, args=None, papel='authenticated', um=False):
    """Executa SQL como o usuário numa transação própria; devolve linhas ou a exceção."""
    with conn() as c:
        try:
            como(c, uid, papel)
            cur = c.execute(sql, args)
            r = cur.fetchall() if cur.description else None
            c.commit()
            return (r[0][0] if r else None) if um else r
        except Exception as e:  # noqa: BLE001
            c.rollback()
            return e


def adm(sql, args=None):
    with conn() as c:
        cur = c.execute(sql, args)
        r = cur.fetchall() if cur.description else None
        c.commit()
        return r


def erro(r, trecho=''):
    return isinstance(r, Exception) and trecho.lower() in str(r).lower()


# ---------- usuários (o Auth cria auth.users; o gatilho cria public.usuarios) ----------
adm("insert into public.convites (email, nome, perfil_id) values ('op@teste.local', 'Operacional Teste', (select id from perfis where codigo = 'operacional')), "
    "('tec1@teste.local', 'Técnico Um', (select id from perfis where codigo = 'manutencao')), ('tec2@teste.local', 'Técnico Dois', (select id from perfis where codigo = 'manutencao'))")
U = {}
for nome in ['leticia', 'op', 'tec1', 'tec2', 'estranho']:
    U[nome] = adm("insert into auth.users (email) values (%s) returning id", (f'{nome}@teste.local',))[0][0]
est = adm("select u.email::text, p.codigo, u.ativo from usuarios u left join perfis p on p.id = u.perfil_id order by u.email")
print('      usuários:', est)
ok(('op@teste.local', 'operacional', True) in est and ('estranho@teste.local', None, False) in est, 'convite define perfil e ativa; sem convite fica inativo e sem perfil')
ok(adm("select count(*) from convites where usado_em is not null")[0][0] == 3, 'convites marcados como usados')

# ---------- anon e usuário inativo não acessam nada ----------
ok(erro(req(None, 'select * from usuarios', papel='anon'), 'permission denied'), 'anon: sem permissão nas tabelas')
ok(erro(req(None, 'select public.minhas_permissoes()', papel='anon'), 'permission denied'), 'anon: sem execução das RPCs')
ok(req(U['estranho'], 'select count(*) from veiculos', um=True) == 0 and req(U['estranho'], 'select count(*) from minhas_permissoes()', um=True) == 0,
   'usuário sem convite (inativo): não vê veículos nem tem permissões')

# ---------- primeiro administrador por código de uso único ----------
adm("insert into privado.bootstrap_admin (codigo_hash, expira_em) values (extensions.crypt('codigo-certo-123', extensions.gen_salt('bf', 10)), now() + interval '1 day')")
ok(req(U['leticia'], "select reivindicar_admin('errado')", um=True) == 'codigo_invalido', 'código errado não vira admin')
ok(adm("select tentativas from privado.bootstrap_admin")[0][0] == 1, 'código errado conta 1 tentativa (UPDATE com WHERE, passa no safeupdate)')
ok(req(U['leticia'], "select reivindicar_admin('codigo-certo-123')", um=True) == 'ok', 'código certo: Letícia vira Administrador')
ok(req(U['estranho'], "select reivindicar_admin('codigo-certo-123')", um=True) == 'ja_existe_admin', 'código não serve de novo (já existe administrador)')
for _ in range(6):
    r = req(U['estranho'], "select reivindicar_admin('x')", um=True)
ok(r == 'muitas_tentativas', f'limite de tentativas no código ({r})')
perm_adm = req(U['leticia'], 'select count(*) from minhas_permissoes()', um=True)
ok(perm_adm == 11 * 7, f'administrador: todas as ações de todos os módulos ({perm_adm})')
perm_tec = sorted(f'{m}.{a}' for m, a in req(U['tec1'], 'select * from minhas_permissoes()'))
ok(perm_tec == ['atendimentos.criar', 'atendimentos.editar', 'materiais.criar', 'os.visualizar'], f'técnico: só as permissões do perfil ({perm_tec})')

# ---------- proteção de perfil, garagem atual, exceções por usuário ----------
ok(erro(req(U['tec1'], "update usuarios set perfil_id = (select id from perfis where codigo = 'administrador') where id = auth.uid()"), 'sem permissão'),
   'técnico não consegue se promover')
ok(req(U['tec1'], "update usuarios set ativo = true where id = %s returning id", (U['estranho'],)) == [], 'técnico não ativa outro usuário (RLS)')
gar = adm("select id from garagens where nome = 'Viação Metrópole Itaim'")[0][0]
req(U['tec1'], 'select definir_garagem_atual(%s::smallint)', (gar,))
ok(adm("select garagem_atual_id from usuarios where id = %s", (U['tec1'],))[0][0] == gar, 'Garagem atual persistida por usuário')
ok(req(U['tec1'], 'select count(*) from logs_auditoria', um=True) == 0, 'técnico não lê auditoria')
r = req(U['leticia'], "insert into permissoes_usuario values (%s, 'estoque', 'visualizar', true), (%s, 'os', 'visualizar', false)", (U['tec2'], U['tec2']))
ok(not isinstance(r, Exception) and req(U['tec2'], "select tem_permissao('estoque', 'visualizar')", um=True) is True
   and req(U['tec2'], "select tem_permissao('os', 'visualizar')", um=True) is False, 'exceções por usuário (conceder/retirar) no banco')
req(U['leticia'], "delete from permissoes_usuario where usuario_id = %s", (U['tec2'],))
ok(erro(req(U['op'], "insert into permissoes values ((select id from perfis where codigo = 'manutencao'), 'auditoria', 'visualizar')"), 'row-level security'),
   'operacional não altera a matriz de permissões')

# ---------- OS automática pelo monitoramento ----------
veic = [r[0] for r in adm("select v.id from veiculos v where v.garagem_id = %s and v.tecnologia = 'padron' order by v.prefixo limit 30", (gar,))]
adm("""insert into monitoramento_diario (veiculo_id, posicao, data, status)
       select v, 21, d::date, case when v = %s then 'off' when d::date >= current_date - 1 then 'fa' else 'on' end
       from unnest(%s::int[]) v, generate_series(current_date - 9, current_date, interval '1 day') d""", (veic[0], veic))
n = req(U['op'], 'select gerar_os_monitoramento(current_date)', um=True)
os_ = adm("select id, prioridade, status, cameras, dias_problema from ordens_servico order by prioridade_ordem, id")
ok(n == 30 and len(os_) == 30, f'OS automáticas criadas ({n} problemas, {len(os_)} OS)')
ok(os_[0][1] == 'alta' and os_[0][4] == 10 and all(o[1] == 'baixa' and o[4] == 2 for o in os_[1:]), 'prioridade: 100% offline/7+ dias = Alta; < 3 dias = Baixa')
ok(req(U['op'], 'select gerar_os_monitoramento(current_date)', um=True) == 0, 'sem OS duplicada para veículo com OS aberta')
ok(erro(req(U['tec1'], 'select gerar_os_monitoramento(current_date)'), 'sem permissão'), 'técnico não gera OS em lote')
ok(erro(req(U['op'], "insert into ordens_servico (veiculo_id, status) values (%s, 'resolvida')", (veic[1],)), 'aguardando manutenção'), 'OS manual não nasce com status avançado')
manual = req(U['op'], "insert into ordens_servico (veiculo_id, garagem_id, prioridade, descricao) values ((select id from veiculos where prefixo = (select min(prefixo) from veiculos where tecnologia = 'mini')), %s, 'media', 'Manual') returning id", (gar,), um=True)
ok(isinstance(manual, int), 'OS manual criada pelo Operacional')
ok(req(U['tec1'], "update ordens_servico set status = 'resolvida' where id = %s returning id", (os_[0][0],)) == [], 'técnico não altera OS direto (RLS)')
ok(erro(req(U['op'], "update ordens_servico set status = 'resolvida' where id = %s", (os_[0][0],)), 'fluxo de atendimento'), 'operacional não pula o fluxo de status')
fila = req(U['tec1'], 'select id, prioridade from ordens_servico order by prioridade_ordem, criado_em limit 3')
ok(fila[0][1] == 'alta', 'fila do técnico ordenada por prioridade (Alta primeiro)')

# ---------- CONCORRÊNCIA: dois técnicos iniciam a mesma OS ao mesmo tempo ----------
def corrida(os_id):
    barreira = threading.Barrier(2)
    res = {}

    def tentar(nome):
        with conn() as c:
            try:
                como(c, U[nome])
                barreira.wait()
                c.execute('select id from iniciar_atendimento(%s)', (os_id,))
                time.sleep(0.15)  # segura a transação aberta para a outra sessão esperar a trava
                c.commit()
                res[nome] = 'ok'
            except Exception as e:  # noqa: BLE001
                c.rollback()
                res[nome] = str(e).split('\n')[0]
    ts = [threading.Thread(target=tentar, args=(n,)) for n in ('tec1', 'tec2')]
    [t.start() for t in ts]
    [t.join() for t in ts]
    return res

vencedores = []
for o in [x[0] for x in os_[1:21]]:
    r = corrida(o)
    vencedores.append([k for k, v in r.items() if v == 'ok'])
    perdedor = [v for v in r.values() if v != 'ok']
    ativos = adm("select count(*) from atendimentos where os_id = %s and status in ('em_andamento', 'pausado')", (o,))[0][0]
    if len(vencedores[-1]) != 1 or ativos != 1 or not perdedor or 'em atendimento' not in perdedor[0]:
        ok(False, f'corrida OS {o}: {r}, ativos {ativos}')
    # libera para a próxima rodada
    at = adm("select id from atendimentos where os_id = %s and status = 'em_andamento'", (o,))[0][0]
    req(U['leticia'], "select cancelar_atendimento(%s, 'teste de concorrência')", (at,))
ok(all(len(v) == 1 for v in vencedores), f'20 corridas simultâneas: sempre exatamente 1 técnico inicia (tec1 {sum(v == ["tec1"] for v in vencedores)}x, tec2 {sum(v == ["tec2"] for v in vencedores)}x); o outro recebe "já está em atendimento por …"')
print('      exemplo de erro do perdedor:', corrida(os_[22][0]))
at22 = adm("select id from atendimentos where os_id = %s and status = 'em_andamento'", (os_[22][0],))[0][0]
req(U['leticia'], "select cancelar_atendimento(%s, 'teste')", (at22,))

# ---------- fluxo completo: iniciar, pausar, retomar, formulário, materiais, finalizar ----------
alvo = os_[0][0]
a = req(U['tec1'], 'select id from iniciar_atendimento(%s)', (alvo,), um=True)
ok(isinstance(a, int), 'técnico 1 inicia a OS Alta')
ok(erro(req(U['tec1'], 'select iniciar_atendimento(%s)', (os_[25][0],)), 'manutenção em andamento'), 'técnico com manutenção em andamento não inicia outra')
ok(adm("select status from ordens_servico where id = %s", (alvo,))[0][0] == 'em_atendimento', 'OS em atendimento')
mot = adm("select id from motivos_pausa where aguarda_material")[0][0]
outro = adm("select id from motivos_pausa where exige_observacao")[0][0]
ok(erro(req(U['tec1'], 'select pausar_atendimento(%s, %s::smallint, null)', (a, outro)), 'observação'), 'motivo "Outro" exige observação')
ok(erro(req(U['tec2'], 'select pausar_atendimento(%s, %s::smallint)', (a, mot)), 'outro técnico'), 'outro técnico não pausa o atendimento')
req(U['tec1'], 'select pausar_atendimento(%s, %s::smallint)', (a, mot))
ok(adm("select status from ordens_servico where id = %s", (alvo,))[0][0] == 'aguardando_material', 'pausa por material: OS "Aguardando material"')
time.sleep(1.2)
req(U['tec1'], 'select retomar_atendimento(%s)', (a,))
t = req(U['tec1'], 'select segundos_total, segundos_pausados, segundos_efetivos from vw_tempos_atendimento where atendimento_id = %s', (a,))[0]
ok(t[1] >= 1 and t[0] >= t[1] and t[2] == t[0] - t[1], f'tempos do servidor: total {t[0]}s, pausado {t[1]}s, efetivo {t[2]}s')
ok(erro(req(U['tec1'], 'select finalizar_atendimento(%s)', (a,)), 'envie o formulário'), 'não finaliza sem enviar o formulário')
v = req(U['tec1'], 'select versao from respostas_manutencao where atendimento_id = %s', (a,), um=True)
v2 = req(U['tec1'], "select salvar_rascunho(%s, '{\"observacoes\": \"rascunho\"}', %s)", (a, v), um=True)
ok(v2 == v + 1 and erro(req(U['tec1'], "select salvar_rascunho(%s, '{}', %s)", (a, v)), 'outro aparelho'), 'autosave com versão (conflito detectado)')
nada_p = adm("select id from catalogo_problemas where exclusivo")[0][0]
p_sem = adm("select id from catalogo_problemas where descricao = 'Sem gravação de imagens'")[0][0]
nada_a = adm("select id from catalogo_acoes where exclusivo")[0][0]
a_sw = adm("select id from catalogo_acoes where material_codigo = 'SWITCH'")[0][0]
a_norm = adm("select id from catalogo_acoes where descricao = 'Normalização da gravação de imagens'")[0][0]
dados = {'tecnologia': 'padron', 'id_equipamento': '35067', 'qtd_switch': 1, 'observacoes': 'Troca de switch',
         'cameras': {'21': {'problemas': [p_sem], 'acoes': [a_norm, a_sw]}, '22': {'problemas': [nada_p, p_sem], 'acoes': [nada_a]}, '23': {'problemas': [], 'acoes': []}}}
r = req(U['tec1'], 'select enviar_formulario(%s, %s)', (a, json.dumps(dados)))
ok(erro(r, 'frente do ônibus'), 'formulário: foto da frente obrigatória')
os_atual = alvo
def foto(uid, campo, pos=None, at=a, o=os_atual):
    return req(uid, "insert into imagens (os_id, atendimento_id, campo, posicao, storage_path, mime, bytes) values (%s, %s, %s, %s, %s, 'image/jpeg', 200000) returning id",
               (o, at, campo, pos, f'os/{o}/{at}/{campo}/{uuid.uuid4()}.jpg'))
ok(erro(foto(U['tec2'], 'frente_onibus'), 'row-level security'), 'outro técnico não envia foto neste atendimento')
ok(erro(req(U['tec1'], "insert into imagens (os_id, atendimento_id, campo, storage_path, mime, bytes) values (%s, %s, 'outro', 'x.exe', 'application/x-msdownload', 10)", (os_atual, a)), 'check'),
   'upload: só imagens (tipo validado no banco)')
foto(U['tec1'], 'frente_onibus')
r = req(U['tec1'], 'select enviar_formulario(%s, %s)', (a, json.dumps(dados)))
print('      validação:', str(r).split('\n')[0])
ok(erro(r, 'Câmera 21: foto') and erro(r, '"Nenhuma anomalia" não combina') and erro(r, 'Câmera 23: problema e ação') and erro(r, 'switch antes e depois'),
   'formulário: regras por câmera (foto, exclusivos, câmeras da tecnologia) e fotos do switch')
for c in ('21', '22'):
    foto(U['tec1'], 'camera', int(c))
foto(U['tec1'], 'switch_antes'); foto(U['tec1'], 'switch_depois')
dados['cameras'] = {'21': {'problemas': [p_sem], 'acoes': [a_norm, a_sw]}, '22': {'problemas': [nada_p], 'acoes': [nada_a]}, '23': {'problemas': [nada_p], 'acoes': [nada_a]}}
r = req(U['tec1'], 'select enviar_formulario(%s, %s)', (a, json.dumps(dados)))
ok(erro(r, 'estoque insuficiente'), 'sem estoque: técnico não deixa saldo negativo')
sw = adm("select id from materiais where codigo = 'SWITCH'")[0][0]
ok(erro(req(U['tec1'], "select registrar_movimentacao(%s::smallint, %s::smallint, 'entrada', 5, 'compra')", (sw, gar)), 'sem permissão'), 'técnico não movimenta estoque')
req(U['op'], "select registrar_movimentacao(%s::smallint, %s::smallint, 'entrada', 2, 'compra')", (sw, gar))
r = req(U['tec1'], 'select enviar_formulario(%s, %s)', (a, json.dumps(dados)))
ok(not isinstance(r, Exception), f'formulário enviado {"" if not isinstance(r, Exception) else r}')
ok(adm("select quantidade from estoque where material_id = %s and garagem_id = %s", (sw, gar))[0][0] == 1, 'switch usado baixa do estoque da garagem (2 → 1)')
ok(adm("select count(*) from problemas_detectados where resposta_id is not null")[0][0] == 3 and adm("select count(*) from acoes_realizadas")[0][0] == 4, 'problemas e ações gravados normalizados')
req(U['tec1'], 'select finalizar_atendimento(%s)', (a,))
ok(adm("select o.status, v.resultado from ordens_servico o join validacoes_pos_manutencao v on v.os_id = o.id where o.id = %s", (alvo,))[0] == ('aguardando_validacao', 'pendente'),
   'finalizado: OS "Aguardando validação" e validação pendente')
ok(erro(req(U['op'], "select registrar_movimentacao(%s::smallint, %s::smallint, 'saida', 5, 'teste')", (sw, gar)), 'insuficiente'), 'operacional não deixa saldo negativo')
ok(not isinstance(req(U['leticia'], "select registrar_movimentacao(%s::smallint, %s::smallint, 'saida', 5, 'ajuste autorizado')", (sw, gar)), Exception), 'administrador autoriza saldo negativo')

# ---------- validação pós-manutenção ----------
vid = veic[0]
adm("delete from monitoramento_diario where veiculo_id = %s and data > current_date", (vid,))
adm("insert into monitoramento_diario select %s, 21, d::date, 'on' from generate_series(current_date + 1, current_date + 2, interval '1 day') d", (vid,))
n = req(U['op'], 'select avaliar_validacoes()', um=True)
ok(n == 1 and adm("select status from ordens_servico where id = %s", (alvo,))[0][0] == 'resolvida', 'monitoramento OK após a manutenção: Resolvida')
adm("insert into monitoramento_diario values (%s, 21, current_date + 5, 'off', 0)", (vid,))
req(U['op'], 'select avaliar_validacoes()')
ok(adm("select o.status, v.resultado from ordens_servico o join validacoes_pos_manutencao v on v.os_id = o.id where o.id = %s", (alvo,))[0] == ('reincidente', 'reincidente'),
   'nova falha dentro da janela (7 dias): Reincidente')
ok(req(U['tec1'], 'select id from iniciar_atendimento(%s)', (alvo,), um=True) is not None, 'OS reincidente volta para a fila e pode ser atendida')

# ---------- indicadores, desempenho, auditoria ----------
ind = req(U['op'], 'select indicadores_os(current_date - 1, current_date + 1)', um=True)
ok(isinstance(ind, dict) and ind['atendimentos']['concluidos'] == 1, f'indicadores calculados no banco ({ind["por_status"] if isinstance(ind, dict) else ind})')
ok(erro(req(U['tec1'], 'select indicadores_os(current_date, current_date)'), 'sem permissão'), 'técnico não vê indicadores gerais')
des = req(U['tec1'], 'select meu_desempenho(current_date - 1, current_date + 1)', um=True)
ok(des['atendimentos'] == 1 and des['reincidentes'] == 1, f'Meu Desempenho (só do próprio técnico): {des}')
logs = adm("select tabela, count(*) from logs_auditoria group by 1 order by 2 desc")
ok(any(t == 'ordens_servico' for t, _ in logs) and any(t == 'atendimentos' for t, _ in logs), f'auditoria registrada ({dict(logs)})')
ok(erro(req(U['leticia'], 'delete from logs_auditoria where true'), 'imutável') or req(U['leticia'], 'delete from logs_auditoria where true returning id') == [], 'admin não apaga logs')
try:
    adm('update logs_auditoria set tabela = tabela'); ok(False, 'logs imutáveis até para o superusuário')
except Exception as e:  # noqa: BLE001
    ok('imutável' in str(e), 'logs imutáveis até para o superusuário (gatilho)')
hist = adm("select status_novo from historico_status_os where os_id = %s order by id", (alvo,))
ok([h[0] for h in hist][:3] == ['aguardando_manutencao', 'em_atendimento', 'aguardando_material'], f'histórico de status da OS ({[h[0] for h in hist]})')
tl = req(U['op'], 'select count(*) from vw_linha_tempo_veiculo where veiculo_id = %s', (vid,), um=True)
ok(tl >= 5, f'linha do tempo do veículo ({tl} eventos)')
print('FALHAS:', falhas or 'nenhuma')
raise SystemExit(1 if falhas else 0)
