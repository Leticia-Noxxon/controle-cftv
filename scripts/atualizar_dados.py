"""Script único de atualização: lê data/raw, processa e gera os JSON do site (site/public/data) e as tabelas de conferência
(data/processed). Uso:  /workspace/venv/bin/python scripts/atualizar_dados.py [--reusar]
--reusar  reaproveita as tabelas DuckDB já carregadas (desenvolvimento)."""
import datetime as dt
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import analise, config, manutencao, monitoramento, relatorio  # noqa: E402

BIT = config.BIT_CAMERA


def salvar(nome, obj):
    config.SITE_DATA.mkdir(parents=True, exist_ok=True)
    p = config.SITE_DATA / nome
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), default=str), encoding='utf-8')
    return p


def iso(x):
    return None if x is None or pd.isna(x) else pd.Timestamp(x).isoformat(timespec='minutes')


def main(reusar=False):
    con = monitoramento.conectar()
    tabelas = {r[0] for r in con.execute('SHOW TABLES').fetchall()}
    if not (reusar and {'reg3', 'camera_dia', 'veiculo_dia'} <= tabelas):
        print('carregando CSVs…', monitoramento.carregar(con))
        monitoramento.agregar(con)
    qual = monitoramento.qualidade(con)
    cob = con.execute('SELECT * FROM cobertura_dia').fetchdf()
    inicio, fim = con.execute('SELECT min(ts_local), max(ts_local) FROM reg3').fetchone()
    ultimo_dia = fim.date()
    ano, mes = config.MES
    dias_mes = [dt.date(ano, mes, d) for d in range(1, 32) if (dt.date(ano, mes, 1) + dt.timedelta(days=d - 1)).month == mes]

    # ---------------- formulário de manutenção ----------------
    respostas, info_form = manutencao.ler()
    prefs_mon = set(con.execute('SELECT DISTINCT prefixo FROM reg3').fetchdf().prefixo.astype(int))
    forms = manutencao.processar(respostas, prefs_mon)
    eventos = analise.eventos_manutencao(con, forms, fim)
    for i, e in enumerate(eventos):
        e['idx'] = i
    garagem_prefixo = {}
    for f in sorted([f for f in forms if f['duplicada_de'] is None and f['datahora']], key=lambda f: f['datahora']):
        if f['garagem']:
            garagem_prefixo[f['prefixo']] = str(f['garagem'])

    # ---------------- relatório diário (28/09) ----------------
    rels = relatorio.ler()
    rel = rels[-1] if rels else None

    # ---------------- frota (por prefixo) ----------------
    veic = con.execute('SELECT * FROM veiculo').fetchdf()
    vd = con.execute(f"SELECT * FROM veiculo_dia WHERE year(data)={ano} AND month(data)={mes}").fetchdf()
    mes_stats = con.execute(f"""SELECT prefixo, count(*) n, count(*) FILTER (WHERE estado='N') ok, count(*) FILTER (WHERE estado='F') f,
        count(*) FILTER (WHERE estado='O') o FROM reg3 WHERE year(data)={ano} AND month(data)={mes} GROUP BY 1""").fetchdf().set_index('prefixo')
    cam_mes = con.execute(f"""SELECT prefixo, camera, sum(n) n, sum(n_ok) ok, sum(n_falha) f, sum(n_off) o, sum(n_sd) sd, sum(transicoes) tr,
        count(*) FILTER (WHERE n_falha+n_off>0) dias_prob, count(*) dias FROM camera_dia WHERE year(data)={ano} AND month(data)={mes} GROUP BY 1,2""").fetchdf()
    ult = con.execute('SELECT * FROM ultimo_estado').fetchdf()
    empresas = sorted(veic.empresa.dropna().unique().tolist())
    emp_idx = {e: i for i, e in enumerate(empresas)}
    ev_por_pd = defaultdict(list)
    for e in eventos:
        ev_por_pd[(e['prefixo'], e['data'])].append(e['idx'])
    di = {d: i for i, d in enumerate(dias_mes)}
    frota = {}
    for r in veic.itertuples():
        p = int(r.prefixo)
        cams = [int(c) for c in r.cameras]
        frota[p] = {'p': p, 'e': emp_idx.get(r.empresa), 'es': [emp_idx[x] for x in r.empresas] if len(r.empresas) > 1 else None,
                    'g': garagem_prefixo.get(p), 'c': cams, 'd': [None] * len(dias_mes), 'm': None, 'u': {}, 'r': None, 'cm': {},
                    'mv': {}, 'ul': iso(r.ultimo)}
    for r in vd.itertuples():
        f = frota[int(r.prefixo)]
        i = di[pd.Timestamp(r.data).date()]
        if r.n_falha + r.n_off == 0:
            f['d'][i] = 100
            continue
        m = (1 if r.n_ok else 0) | (2 if r.n_falha else 0) | (4 if r.n_off else 0)
        g = lambda v: None if pd.isna(v) else int(v)
        f['d'][i] = [round(100 * r.n_ok / r.n, 1), m, g(r.cams_falha) or 0, g(r.cams_off) or 0, int(r.erro_bits),
                     g(r.off_h1), g(r.off_h2), g(r.falha_h1), g(r.falha_h2), round(100 * r.n_falha / r.n, 1), round(100 * r.n_off / r.n, 1)]
    for p, s in mes_stats.iterrows():
        frota[int(p)]['m'] = [int(s.n), int(s.ok), int(s.f), int(s.o)]
    for r in cam_mes.itertuples():
        frota[int(r.prefixo)]['cm'][int(r.camera)] = [int(r.n), int(r.ok), int(r.f), int(r.o), int(r.sd), int(r.tr), int(r.dias_prob), int(r.dias)]
    # estado de cada câmera em cada dia do mês: dígito = presença de estados (1 online, 2 falha, 4 offline; 0 = sem registro)
    cdm = con.execute(f"""SELECT prefixo, camera, data, (CASE WHEN n_ok>0 THEN 1 ELSE 0 END) + (CASE WHEN n_falha>0 THEN 2 ELSE 0 END)
        + (CASE WHEN n_off>0 THEN 4 ELSE 0 END) m FROM camera_dia WHERE year(data)={ano} AND month(data)={mes}""").fetchdf()
    for (p, c), g in cdm.groupby(['prefixo', 'camera']):
        k = ['0'] * len(dias_mes)
        for d, m in zip(g.data, g.m):
            k[di[pd.Timestamp(d).date()]] = str(int(m))
        frota[int(p)].setdefault('k', {})[int(c)] = ''.join(k)
    for r in ult.itertuples():
        frota[int(r.prefixo)]['u'][int(r.camera)] = [r.codigo, iso(r.ts)]
    for (p, d), idxs in ev_por_pd.items():
        if p in frota:
            dd = dt.date.fromisoformat(d)
            if dd in di:
                frota[p]['mv'][di[dd]] = idxs
    if rel:
        for p, x in rel['registros'].items():
            if p in frota:
                frota[p]['r'] = {c: v for c, v in x['cams'].items() if v not in ('.',)}
    # prefixos que estão no relatório 28/09 mas não no monitoramento
    rel_sem_mon = sorted(p for p in (rel['registros'] if rel else {}) if p not in frota)

    for e in eventos:   # retrato do relatório diário (sem horário) — só informativo
        f = frota.get(e['prefixo'])
        e['relatorio'] = f['r'] if f and f['r'] else None
    # ---------------- problemas em aberto ----------------
    seqs = analise.sequencias_problema(con, ultimo_dia)
    for s in seqs:
        f = frota.get(s['prefixo'])
        s['empresa'] = empresas[f['e']] if f and f['e'] is not None else None
        s['garagem'] = f['g'] if f else None
        s['relatorio_28'] = (f['r'] or {}).get(s['camera']) if f and f['r'] else None
        evs = [e for e in eventos if e['prefixo'] == s['prefixo']]
        s['ultima_manutencao'] = max((e['inicio'] for e in evs), default=None)
        s['manutencao_durante'] = [e['inicio'] for e in evs if e['inicio'] >= s['inicio']]

    # ---------------- detalhe horário (segmentos de estado, fatiado por prefixo % 64) ----------------
    seg = con.execute("""WITH a AS (SELECT prefixo, camera, data, ts_local, codigo,
            CASE WHEN codigo = lag(codigo) OVER w THEN 0 ELSE 1 END AS novo FROM reg3
            WINDOW w AS (PARTITION BY prefixo, camera, data ORDER BY ts_utc)),
          b AS (SELECT *, sum(novo) OVER (PARTITION BY prefixo, camera, data ORDER BY ts_local ROWS UNBOUNDED PRECEDING) grp FROM a)
        SELECT prefixo, camera, data, strftime(min(ts_local), '%H%M%S') i, strftime(max(ts_local), '%H%M%S') f, any_value(codigo) c, count(*) n
        FROM b GROUP BY prefixo, camera, data, grp ORDER BY prefixo, camera, data, i""").fetchdf()
    shards = defaultdict(dict)
    for (p, c, d), g in seg.groupby(['prefixo', 'camera', 'data'], sort=False):
        shards[int(p) % 64].setdefault(str(int(p)), {}).setdefault(str(int(c)), {})[pd.Timestamp(d).date().isoformat()] = [[a, b, x, int(n)] for a, b, x, n in zip(g.i, g.f, g.c, g.n)]
    for k, v in shards.items():
        salvar(f'detalhe/{k:02d}.json', v)

    # ---------------- manutenções (site) ----------------
    forms_site = [f for f in forms if f['duplicada_de'] is None]
    for f in forms_site:
        f['evento'] = next((e['idx'] for e in eventos if f['id'] in e['forms']), None)
    dup = [{'linha_excel': f['linha_excel'], 'duplicada_de': f['duplicada_de'], 'prefixo': f['prefixo'], 'datahora': f['datahora']}
           for f in forms if f['duplicada_de'] is not None]

    # ---------------- metadados ----------------
    meta = {
        'gerado_em': dt.datetime.now().isoformat(timespec='minutes'), 'fuso': config.TZ,
        'monitoramento': {'arquivos': [a.name for a in config.arquivos_monitoramento()], 'inicio': iso(inicio), 'fim': iso(fim),
                          'ultimo_dia': ultimo_dia.isoformat(), 'registros_validos': int(con.execute('SELECT count(*) FROM reg3').fetchone()[0]),
                          'registros_brutos': int(con.execute('SELECT count(*) FROM bruto').fetchone()[0]) if 'bruto' in tabelas or not reusar else None,
                          'prefixos': len(frota), 'cameras': int(len(ult))},
        'cobertura': [{'data': pd.Timestamp(r.data).date().isoformat(), 'registros': int(r.registros), 'prefixos': int(r.prefixos), 'inicio': iso(r.inicio),
                       'fim': iso(r.fim), 'horas': int(r.horas)} for r in cob.itertuples()],
        'dias_mes': [d.isoformat() for d in dias_mes], 'empresas': empresas,
        'formulario': {**{k: v for k, v in info_form.items() if k != 'colunas'}, 'colunas_publicadas': [c for c in info_form['colunas'] if c not in manutencao.COLUNAS_NAO_PUBLICADAS],
                       'formularios_validos': len(forms_site), 'eventos': len(eventos), 'duplicadas': dup},
        'relatorio': ({'arquivo': rel['arquivo'], 'aba': rel['aba'], 'abas': rel['abas'], 'data': rel['data'], 'prefixos': len(rel['registros']),
                       'prefixos_sem_monitoramento': len(rel_sem_mon),
                       'contagem': dict(Counter(v for x in rel['registros'].values() for v in x['cams'].values()))} if rel else None),
        'qualidade': {k: v for k, v in qual.items()},
        'janela_antes_h': config.JANELA_ANTES_H, 'posicoes': {str(k): v for k, v in config.POSICAO.items()},
    }
    salvar('meta.json', meta)
    salvar('frota.json', {'dias': meta['dias_mes'], 'empresas': empresas, 'veiculos': list(frota.values())})
    salvar('problemas.json', seqs)
    salvar('manutencoes.json', {'eventos': eventos, 'formularios': forms_site})

    # ---------------- tabelas de conferência (data/processed) ----------------
    pd.DataFrame(seqs).to_csv(config.PROCESSED / 'problemas_em_aberto.csv', index=False, encoding='utf-8-sig')
    pd.DataFrame([{k: (', '.join(map(str, v)) if isinstance(v, list) else v) for k, v in e.items() if k not in ('cameras', 'antes', 'depois')}
                  for e in eventos]).to_csv(config.PROCESSED / 'manutencoes_eventos.csv', index=False, encoding='utf-8-sig')
    con.execute(f"COPY (SELECT * FROM camera_dia ORDER BY prefixo, camera, data) TO '{config.PROCESSED / 'camera_dia.csv'}' (HEADER)")
    resumo = {
        'ultimo_estado': dict(Counter('Online' if v[0] == 'N' else 'Offline' if v[0] == 'O' else 'Falha' for f in frota.values() for v in f['u'].values())),
        'problemas_em_aberto': len(seqs), 'eventos': len(eventos),
        'resultado': dict(Counter(e['resultado'] for e in eventos)), 'precisava': dict(Counter(e['precisava'] for e in eventos)),
    }
    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    return resumo


if __name__ == '__main__':
    main(reusar='--reusar' in sys.argv)
