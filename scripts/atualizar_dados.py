"""Script único de atualização: lê data/raw, processa e gera os JSON do site (site/public/data) e as tabelas de conferência
(data/processed). Uso:  /workspace/venv/bin/python scripts/atualizar_dados.py [--reusar]
--reusar  reaproveita as tabelas DuckDB já carregadas (desenvolvimento)."""
import datetime as dt
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import analise, config, garagens, manutencao, monitoramento  # noqa: E402

BIT = config.BIT_CAMERA


def salvar(nome, obj):
    config.SITE_DATA.mkdir(parents=True, exist_ok=True)
    p = config.SITE_DATA / nome
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), default=str), encoding='utf-8')
    return p


def iso(x):
    return None if x is None or pd.isna(x) else pd.Timestamp(x).isoformat(timespec='minutes')


B36 = '0123456789abcdefghijklmnopqrstuvwxyz'
LARG = 3   # cada valor de minutos ocupa 3 caracteres em base 36 (até 46.655 min)


def b36(n):
    n = int(round(n or 0))
    out = ''
    for _ in range(LARG):
        out = B36[n % 36] + out
        n //= 36
    return out


BOILERPLATE = re.compile(r'^(nenhuma?\s+(anomalia|a[cç][aã]o|problema)\w*(\s+\w+)?\.?)$', re.IGNORECASE)


def linhas_texto(txt):
    """Quebra o texto em linhas (\n, <br>, ';'), remove marcadores, vazios, boilerplate e repetições (sem reinterpretar)."""
    if not txt:
        return []
    t = re.sub(r'<br\s*/?>', '\n', str(txt), flags=re.IGNORECASE)
    vistos, out = set(), []
    for l in re.split(r'[\n;]+', t):
        l = re.sub(r'^[\s\-•*·]+', '', l).strip().rstrip('.').strip()
        if not l or BOILERPLATE.match(l) or l.lower() in vistos:
            continue
        vistos.add(l.lower())
        out.append(l)
    return out


def curto(l, n=150):
    return l if len(l) <= n else l[:n - 1].rstrip() + '…'


def resumo_manutencao(forms):
    """Problema (até 3 linhas) e Ação (até 3 linhas) a partir das respostas do formulário.
    Problema: itens estruturados por posição/câmera. Ação: observação final do técnico (se houver); senão as ações
    estruturadas por câmera. Nada é reescrito além de separar, limpar e remover repetições."""
    prob, acao_estr, obs = [], [], []
    for f in forms:
        for pz in f['posicoes']:
            nome = f"Câm {pz['camera']}" if pz['camera'] else pz['posicao'].title()
            if pz['problemas']:
                prob.append(f"{nome}: {', '.join(dict.fromkeys(x['item'] for x in pz['problemas']))}")
            if pz['acoes']:
                acao_estr.append(f"{nome}: {', '.join(dict.fromkeys(x['item'] for x in pz['acoes']))}")
        obs += linhas_texto(f['observacoes'])
    prob, acao_estr, obs = list(dict.fromkeys(prob)), list(dict.fromkeys(acao_estr)), list(dict.fromkeys(obs))
    corta = lambda xs: [curto(x) for x in xs[:3]] + ([f'+{len(xs) - 3} item(ns) no registro completo'] if len(xs) > 3 else [])
    return {'problema': corta(prob), 'acao': corta(obs if obs else acao_estr), 'acao_fonte': 'observacao' if obs else 'formulario'}


def texto_completo(forms):
    partes = []
    for f in forms:
        partes.append(f"Formulário {f['data_texto'] or ''} · {f['tecnico']} (linha {f['linha_excel']} da planilha)")
        for r in f['respostas']:
            partes.append(f"{r['coluna']}: {r['valor']}")
        partes.append('')
    return '\n'.join(partes).strip()


def main(reusar=False):
    con = monitoramento.conectar()
    tabelas = {r[0] for r in con.execute('SHOW TABLES').fetchall()}
    carga = None
    arq_carga = config.PROCESSED / 'carga_monitoramento.json'
    if reusar and 'registros' in tabelas and arq_carga.exists():
        carga = json.loads(arq_carga.read_text(encoding='utf-8'))
    else:
        carga = monitoramento.carregar(con)
        print('carga:', json.dumps(carga, default=str, ensure_ascii=False))
        arq_carga.write_text(json.dumps(carga, default=str, ensure_ascii=False, indent=1), encoding='utf-8')
    if not (reusar and {'reg3', 'camera_dia', 'intervalo', 'trecho', 'tempo_camera_dia'} <= tabelas):
        monitoramento.agregar(con)
    qual = monitoramento.qualidade(con)
    cob = con.execute('SELECT * FROM cobertura_dia ORDER BY data').fetchdf()
    inicio, fim = con.execute('SELECT min(ts_local), max(ts_local) FROM reg3').fetchone()
    ultimo_dia = fim.date()
    # datas vêm dos dados (todas as datas com pelo menos um registro, em ordem cronológica) — nada fixo no código
    dias = [pd.Timestamp(d).date() for d in cob.data]
    assert dias == sorted(set(dias)), 'datas duplicadas ou fora de ordem'
    di = {d: i for i, d in enumerate(dias)}
    nd = len(dias)

    # ---------------- formulário de manutenção ----------------
    respostas, info_form = manutencao.ler()
    prefs_mon = set(con.execute('SELECT DISTINCT prefixo FROM reg3').fetchdf().prefixo.astype(int))
    forms = manutencao.processar(respostas, prefs_mon)
    eventos = analise.eventos_manutencao(con, forms, fim)
    for i, e in enumerate(eventos):
        e['idx'] = i
    form_por_id = {f['id']: f for f in forms}

    # ---------------- garagens (todas as fontes) ----------------
    mapa_gar, conflitos_gar, stats_gar = garagens.resolver(garagens.do_monitoramento(con), garagens.do_relatorio(), garagens.do_formulario(forms))
    (config.PROCESSED / 'garagens_conflitos.json').write_text(json.dumps(conflitos_gar, ensure_ascii=False, indent=1), encoding='utf-8')

    # ---------------- frota (índice leve, carregado na abertura) ----------------
    veic = con.execute('SELECT * FROM veiculo ORDER BY prefixo').fetchdf()
    empresas = sorted(veic.empresa.dropna().unique().tolist())
    emp_idx = {e: i for i, e in enumerate(empresas)}
    frota = {}
    for r in veic.itertuples():
        p = int(r.prefixo)
        frota[p] = {'p': p, 'e': emp_idx.get(r.empresa), 'g': mapa_gar.get(p), 'c': [int(c) for c in r.cameras], 'k': {}, 'l': {}, 't': None, 'mv': {}}
    tcd = con.execute("""SELECT t.prefixo, t.camera, t.data, coalesce(t.s_ok,0) s_ok, coalesce(t.s_falha,0) s_falha, coalesce(t.s_off,0) s_off, t.ultimo_codigo,
            (CASE WHEN c.n_ok>0 THEN 1 ELSE 0 END) + (CASE WHEN c.n_falha>0 THEN 2 ELSE 0 END) + (CASE WHEN c.n_off>0 THEN 4 ELSE 0 END) m
        FROM tempo_camera_dia t JOIN camera_dia c USING (prefixo, camera, data)""").fetchdf()
    tcd['i'] = [di[pd.Timestamp(d).date()] for d in tcd.data]
    zero = b36(0) * 3
    por_cam = defaultdict(dict)       # camera -> prefixo -> string de tempos
    tv = defaultdict(lambda: [[0, 0, 0] for _ in range(nd)])
    for (p, c), g in tcd.groupby(['prefixo', 'camera']):
        p, c = int(p), int(c)
        k, l, t = ['0'] * nd, ['.'] * nd, [zero] * nd
        for i, m, u, a, b, o in zip(g.i, g.m, g.ultimo_codigo, g.s_ok, g.s_falha, g.s_off):
            k[i], l[i] = str(int(m)), u
            t[i] = b36(a / 60) + b36(b / 60) + b36(o / 60)
            x = tv[p][i]
            x[0] += a / 60; x[1] += b / 60; x[2] += o / 60
        frota[p]['k'][c] = ''.join(k)
        frota[p]['l'][c] = ''.join(l)
        por_cam[c][p] = ''.join(t)
    for p, arr in tv.items():
        frota[p]['t'] = ''.join(b36(a) + b36(b) + b36(o) for a, b, o in arr)
    ev_por_pd = defaultdict(list)
    for e in eventos:
        dd = dt.date.fromisoformat(e['data'])
        if e['prefixo'] in frota and dd in di:
            frota[e['prefixo']]['mv'].setdefault(di[dd], []).append(e['idx'])

    # ---------------- manutenções: resumo leve + texto completo no detalhe ----------------
    man_site, man_texto = [], defaultdict(dict)
    for e in eventos:
        fs = [form_por_id[i] for i in e['forms']]
        man_site.append({'i': e['idx'], 'p': e['prefixo'], 'd': e['data'], 'h': e['inicio'][11:16], 'tec': e['tecnicos'],
                         'cams': e['cameras_formulario'], **resumo_manutencao(fs)})
        man_texto[e['prefixo']][e['idx']] = texto_completo(fs)

    # ---------------- detalhe: trechos da linha do tempo por câmera/dia (carregado sob demanda) ----------------
    import shutil
    shutil.rmtree(config.SITE_DATA / 'detalhe', ignore_errors=True)
    shutil.rmtree(config.SITE_DATA / 'cam', ignore_errors=True)
    for f in ['problemas.json', 'manutencoes.json']:
        (config.SITE_DATA / f).unlink(missing_ok=True)
    tr = con.execute("""SELECT prefixo, camera, data, CAST(epoch(ini - CAST(data AS TIMESTAMP)) AS INT) s, CAST(epoch(fim - CAST(data AS TIMESTAMP)) AS INT) e,
            codigo, n FROM trecho ORDER BY prefixo, camera, data, ini""").fetchdf()
    shards = defaultdict(dict)
    for (p, c, d), g in tr.groupby(['prefixo', 'camera', 'data'], sort=False):
        shards[int(p) % 64].setdefault(str(int(p)), {'t': {}, 'm': {}})['t'].setdefault(str(int(c)), {})[pd.Timestamp(d).date().isoformat()] = \
            [[int(a), int(b), x, int(n)] for a, b, x, n in zip(g.s, g.e, g.codigo, g.n)]
    for p, txts in man_texto.items():
        shards[int(p) % 64].setdefault(str(int(p)), {'t': {}, 'm': {}})['m'].update({str(k): v for k, v in txts.items()})
    for k, v in shards.items():
        salvar(f'detalhe/{k:02d}.json', v)
    for c, v in por_cam.items():
        salvar(f'cam/{c}.json', v)

    # ---------------- metadados ----------------
    meta = {
        'gerado_em': dt.datetime.now().isoformat(timespec='minutes'), 'fuso': config.TZ,
        'atualizacao': iso(fim), 'inicio': iso(inicio),
        'dias': [d.isoformat() for d in dias], 'empresas': empresas,
        'garagens': stats_gar['valores_distintos'], 'cameras': sorted(por_cam),
        'codec': {'base': 36, 'largura': LARG, 'valores': ['online_min', 'falha_min', 'offline_min']},
        'intervalo': {'nominal_s': config.INTERVALO_NOMINAL_S, 'lacuna_max_s': config.LACUNA_MAX_S},
        'cobertura': [{'data': pd.Timestamp(r.data).date().isoformat(), 'registros': int(r.registros), 'prefixos': int(r.prefixos),
                       'inicio': iso(r.inicio), 'fim': iso(r.fim), 'horas': int(r.horas)} for r in cob.itertuples()],
    }
    salvar('meta.json', meta)
    salvar('frota.json', {'veiculos': list(frota.values())})
    salvar('manut.json', man_site)

    # ---------------- análises completas (conferência; não carregadas pelo site) ----------------
    seqs = analise.sequencias_problema(con, ultimo_dia)
    for s_ in seqs:
        f = frota.get(s_['prefixo'])
        s_['empresa'] = empresas[f['e']] if f and f['e'] is not None else None
        s_['garagem'] = f['g'] if f else None
    (config.PROCESSED / 'problemas_em_aberto.json').write_text(json.dumps(seqs, ensure_ascii=False, default=str), encoding='utf-8')
    (config.PROCESSED / 'manutencoes_completo.json').write_text(json.dumps({'eventos': eventos, 'formularios': [f for f in forms if f['duplicada_de'] is None]},
                                                                            ensure_ascii=False, default=str), encoding='utf-8')
    pd.DataFrame(seqs).to_csv(config.PROCESSED / 'problemas_em_aberto.csv', index=False, encoding='utf-8-sig')
    pd.DataFrame([{k: (', '.join(map(str, v)) if isinstance(v, list) else v) for k, v in e.items() if k not in ('cameras', 'antes', 'depois')}
                  for e in eventos]).to_csv(config.PROCESSED / 'manutencoes_eventos.csv', index=False, encoding='utf-8-sig')
    con.execute(f"COPY (SELECT * FROM camera_dia ORDER BY prefixo, camera, data) TO '{config.PROCESSED / 'camera_dia.csv'}' (HEADER)")
    resumo = {
        'carga': {k: v for k, v in carga.items() if k != 'arquivos'}, 'dias': [dias[0].isoformat(), dias[-1].isoformat(), nd],
        'garagens': {k: v for k, v in stats_gar.items() if k != 'valores_distintos'}, 'qualidade_extra': {'camera_fora_do_mapeamento': qual['camera_fora_do_mapeamento'],
        'combinacoes': qual['combinacoes_status'], 'prefixos_multiempresa': len(qual['prefixos_com_mais_de_uma_empresa'])},
        'eventos': len(eventos), 'resultado': dict(Counter(e['resultado'] for e in eventos)),
    }
    (config.PROCESSED / 'resumo_atualizacao.json').write_text(json.dumps(resumo, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    print(json.dumps(resumo, ensure_ascii=False, indent=1, default=str))
    return resumo


if __name__ == '__main__':
    main(reusar='--reusar' in sys.argv)
