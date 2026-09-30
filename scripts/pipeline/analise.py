"""Análises derivadas: sequências de problema (duração) e manutenção × monitoramento (antes/depois)."""
import datetime as dt
from collections import defaultdict

import pandas as pd

from . import config

ROTULO_ESTADO = {'N': 'Online', 'F': 'Falha técnica', 'O': 'Offline'}


def tipo_problema(n_off, n_falha, bits):
    partes = []
    if n_off:
        partes.append('Offline')
    if n_falha:
        nomes = [n for b, n in ((1, 'SD'), (2, 'Login'), (4, 'Gravação')) if bits & b]
        partes.append('Erro ' + ' + '.join(nomes) if nomes else 'Falha técnica')
    return ' e '.join(partes)


def sequencias_problema(con, ultimo_dia):
    """Para cada câmera: sequência ATUAL de dias com problema (terminando no último dia com dado da câmera).

    Dia com problema = ao menos um registro OFFLINE ou com falha técnica naquele dia (percentual exibido junto).
    Dias sem nenhum registro da câmera dentro da sequência não a interrompem (não se sabe o que houve), mas não
    contam como 'dias com problema' e são informados à parte ('dias sem dados')."""
    df = con.execute("""SELECT prefixo, camera, data, n, n_ok, n_falha, n_off, n_sd, erro_bits, transicoes, primeiro_problema
                        FROM camera_dia ORDER BY prefixo, camera, data""").fetchdf()
    df['data'] = pd.to_datetime(df['data']).dt.date
    df['problema'] = (df.n_falha + df.n_off) > 0
    out = []
    for (p, c), g in df.groupby(['prefixo', 'camera'], sort=False):
        g = g.reset_index(drop=True)
        if not g.problema.iloc[-1]:
            continue
        i = len(g) - 1
        while i > 0 and g.problema.iloc[i - 1]:
            i -= 1
        s = g.iloc[i:]
        inicio, fim = s.data.iloc[0], s.data.iloc[-1]
        corridos = (fim - inicio).days + 1
        n, prob = int(s.n.sum()), int((s.n_falha + s.n_off).sum())
        # desde quando: primeiro registro com problema no 1º dia da sequência
        desde = s.primeiro_problema.iloc[0]
        out.append({
            'prefixo': int(p), 'camera': int(c), 'desde': desde.isoformat(timespec='minutes') if pd.notna(desde) else None,
            'inicio': inicio.isoformat(), 'ultimo_dia': fim.isoformat(), 'dias_corridos': corridos,
            'dias_com_problema': int(len(s)), 'dias_sem_dados': corridos - int(len(s)),
            'registros': n, 'registros_problema': prob, 'pct_problema': round(100 * prob / n, 1) if n else None,
            'n_off': int(s.n_off.sum()), 'n_falha': int(s.n_falha.sum()), 'erro_bits': int(s.erro_bits.max()),
            'tipo': tipo_problema(int(s.n_off.sum()), int(s.n_falha.sum()), int(s.erro_bits.max())),
            'continuo': bool((s.n_ok == 0).all()),
            'inicio_censurado': bool(i == 0),     # já estava com problema no 1º dia disponível da câmera
            'atual': fim == ultimo_dia,            # a câmera tem registro no último dia do monitoramento
        })
    return out


def eventos_manutencao(con, forms, fim_dados):
    """Agrupa formulários do mesmo prefixo no mesmo dia (um evento) e compara ANTES × DEPOIS no monitoramento."""
    validos = [f for f in forms if f['duplicada_de'] is None and f['prefixo'] is not None and f['datahora']]
    por_chave = defaultdict(list)
    for f in validos:
        por_chave[(f['prefixo'], f['data'])].append(f)
    eventos = []
    for (p, d), fs in por_chave.items():
        fs.sort(key=lambda f: f['datahora'])
        eventos.append({'prefixo': p, 'data': d, 'forms': [f['id'] for f in fs],
                        'inicio': fs[0]['datahora'], 'fim': fs[-1]['datahora'],
                        'tecnicos': sorted({f['tecnico'] for f in fs}), 'garagens': sorted({str(f['garagem']) for f in fs if f['garagem']}),
                        'cameras_formulario': sorted({c for f in fs for c in f['cameras_formulario']}),
                        'cameras_texto': sorted({c for f in fs for c in f['cameras_texto']}),
                        'problemas': sorted({x for f in fs for x in f['problemas']}),
                        'acoes': sorted({x for f in fs for x in f['acoes']}),
                        'pendencia': any(f['texto']['pendencias'] for f in fs)})
    eventos.sort(key=lambda e: (e['prefixo'], e['inicio']))
    prefixos = sorted({e['prefixo'] for e in eventos})
    con.register('pref_manut', pd.DataFrame({'prefixo': prefixos}))
    regs = con.execute("""SELECT r.prefixo, r.camera, r.ts_local, r.estado, r.erro_bits FROM reg3 r
                          JOIN pref_manut m USING (prefixo) ORDER BY r.prefixo, r.ts_local""").fetchdf()
    por_p = {p: g for p, g in regs.groupby('prefixo')}
    for i, e in enumerate(eventos):
        prox = eventos[i + 1] if i + 1 < len(eventos) and eventos[i + 1]['prefixo'] == e['prefixo'] else None
        e.update(avaliar(por_p.get(e['prefixo']), e, prox, fim_dados))
    return eventos


def _fmt(ts):
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts).isoformat(timespec='minutes')


def avaliar(g, e, prox, fim_dados):
    t0 = pd.Timestamp(e['inicio'])
    t1 = pd.Timestamp(e['fim'])
    limite = pd.Timestamp(prox['inicio']) if prox else None
    ini_janela = t0.normalize() - pd.Timedelta(days=config.JANELA_ANTES_DIAS)
    r = {'janela_antes_desde': _fmt(ini_janela), 'depois_ate': _fmt(limite) if limite is not None else _fmt(fim_dados),
         'depois_limitado_por_nova_manutencao': limite is not None}
    if g is None or g.empty:
        r.update({'precisava': 'Sem dados', 'resultado': 'Sem dados para avaliar', 'motivo': 'Prefixo sem registros no monitoramento',
                  'cameras': [], 'antes': None, 'depois': None, 'novo_problema': []})
        return r
    antes = g[(g.ts_local >= ini_janela) & (g.ts_local < t0)]
    depois = g[g.ts_local > t1]
    if limite is not None:
        depois = depois[depois.ts_local < limite]
    resumo = lambda x: None if x.empty else {'de': _fmt(x.ts_local.min()), 'ate': _fmt(x.ts_local.max()), 'registros': int(len(x)),
                                             'ok': int((x.estado == 'N').sum()), 'falha': int((x.estado == 'F').sum()), 'off': int((x.estado == 'O').sum())}
    r['antes'], r['depois'] = resumo(antes), resumo(depois)
    cams = []
    prob_antes = sorted(antes[antes.estado != 'N'].camera.unique().tolist())
    for c in sorted(set(antes.camera) | set(depois.camera)):
        a, dp = antes[antes.camera == c], depois[depois.camera == c]
        item = {'camera': int(c), 'antes': None, 'depois': None, 'problema_antes': c in prob_antes}
        if not a.empty:
            item['antes'] = {'estado_predominante': ROTULO_ESTADO[a.estado.mode().iloc[0]], 'registros': int(len(a)),
                             'problema': int((a.estado != 'N').sum()),
                             'tipo': tipo_problema(int((a.estado == 'O').sum()), int((a.estado == 'F').sum()), int(a.erro_bits.max())),
                             'ultimo_estado': ROTULO_ESTADO[a.estado.iloc[-1]]}
        if not dp.empty:
            ok = dp[dp.estado == 'N']
            norm = ok.ts_local.min() if not ok.empty else None
            rec = None
            if norm is not None:
                apos = dp[(dp.ts_local > norm) & (dp.estado != 'N')]
                rec = apos.iloc[0] if not apos.empty else None
            prob_dp = dp[dp.estado != 'N']
            item['depois'] = {'registros': int(len(dp)), 'problema': int(len(prob_dp)),
                              'pct_problema': round(100 * len(prob_dp) / len(dp), 1),
                              'primeiro': _fmt(dp.ts_local.min()), 'primeiro_estado': ROTULO_ESTADO[dp.estado.iloc[0]],
                              'normalizou_em': _fmt(norm), 'horas_ate_normalizar': round((norm - t1).total_seconds() / 3600, 1) if norm is not None else None,
                              'voltou_em': _fmt(rec.ts_local) if rec is not None else None,
                              'voltou_tipo': tipo_problema(int(rec.estado == 'O'), int(rec.estado == 'F'), int(rec.erro_bits)) if rec is not None else None,
                              'horas_ate_voltar': round((rec.ts_local - norm).total_seconds() / 3600, 1) if rec is not None else None,
                              'registros_problema_apos_normalizar': int(len(dp[(dp.ts_local > norm) & (dp.estado != 'N')])) if norm is not None else None,
                              'tipo': tipo_problema(int((dp.estado == 'O').sum()), int((dp.estado == 'F').sum()), int(dp.erro_bits.max()))}
        cams.append(item)
    r['cameras'] = cams
    r['novo_problema'] = [c['camera'] for c in cams if not c['problema_antes'] and c['depois'] and c['depois']['problema'] > 0 and c['antes']]
    if antes.empty:
        ini, fim = g.ts_local.min(), g.ts_local.max()
        if t0 <= ini:
            mot = f'visita anterior ao início do monitoramento deste prefixo ({ini:%d/%m/%Y %H:%M})'
        elif ini_janela > fim:
            mot = f'visita posterior ao fim do monitoramento deste prefixo ({fim:%d/%m/%Y %H:%M})'
        else:
            mot = "sem registros do monitoramento no dia da visita (antes do horário) nem no dia anterior"
        r.update({'precisava': 'Sem dados', 'resultado': 'Sem dados para avaliar', 'motivo': mot})
        return r
    if not prob_antes:
        r['precisava'] = 'Não'
        if depois.empty:
            r.update({'resultado': 'Sem problema antes', 'motivo': 'CFTV normal antes da visita; sem registros depois'})
        else:
            r.update({'resultado': 'Sem problema antes',
                      'motivo': 'CFTV normal nas 24 h anteriores à visita' + ('; surgiu problema depois' if r['novo_problema'] else '; continuou normal depois')})
        return r
    r['precisava'] = 'Sim'
    alvo = [c for c in cams if c['problema_antes']]
    com_depois = [c for c in alvo if c['depois']]
    if not com_depois:
        r.update({'resultado': 'Sem dados para avaliar', 'motivo': 'sem registros depois da visita para as câmeras com problema'})
        return r
    norm = [c for c in com_depois if c['depois']['normalizou_em']]
    volt = [c for c in norm if c['depois']['voltou_em']]
    if len(norm) == len(com_depois) and not volt:
        res, mot = 'Resolvido', 'todas as câmeras com problema antes normalizaram e não voltaram a falhar'
    elif len(norm) == len(com_depois):
        res, mot = 'Resolvido com recorrência', 'normalizaram, mas voltaram a apresentar problema depois'
    elif norm:
        res, mot = 'Parcialmente resolvido', 'parte das câmeras com problema normalizou e parte não'
    else:
        res, mot = 'Não resolvido', 'nenhuma câmera com problema antes voltou ao normal depois da visita'
    if len(com_depois) < len(alvo):
        mot += f' ({len(alvo) - len(com_depois)} câmera(s) sem registro depois)'
    r.update({'resultado': res, 'motivo': mot})
    return r
