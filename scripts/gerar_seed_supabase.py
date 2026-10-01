"""Gera a migração de seed da frota para o Supabase (supabase/migrations/20261001001000_seed_frota.sql)
a partir dos dados publicados (site/public/data/meta.json e frota.json): 20 empresas, 20 garagens do formulário,
veículos (prefixo, empresa, garagem) e câmeras 21–26 de cada veículo. Idempotente (on conflict do nothing).
Uso: python scripts/gerar_seed_supabase.py"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DADOS = RAIZ / 'site' / 'public' / 'data'
SAIDA = RAIZ / 'supabase' / 'migrations' / '20261001001000_seed_frota.sql'

# Mesmas tabelas de site/v2/src/dados.js (MAPA_EMPRESA e MAPA_FORMULARIO) + as duas garagens da Trans União
MAPA_EMPRESA = {
    'A2 TRANSPORTES': 'A2 Transportes', 'ALFA RODOBUS': 'Alfa Rodobus', 'ALFA RODOBUS SPE': 'Alfa Rodobus SPE', 'GATO PRETO': 'Gato Preto',
    'GATO PRETO A1': 'Gato Preto A1', 'METROPOLE - AE CARVALHO': 'Metrópole AE Carvalho', 'METROPOLE - EXPANDIR': 'Metrópole Expandir (Brás)',
    'METROPOLE - IGUATEMI': 'Metrópole Iguatemi', 'METROPOLE - IMPERADOR': 'Metrópole Imperador', 'METROPOLE - ITAIM': 'Metrópole Itaim',
    'METROPOLE - MBOI - MIRIM': "Metrópole M'Boi Mirim", 'METROPOLE PAULISTA - DEPINEDO': 'Metrópole Pinedo', 'NORTE BUSS A1': 'Norte Buss A1',
    'NORTE BUSS A2': 'Norte Buss A2', 'NOXXONSAT': 'Noxxonsat', 'SANTA BRIGIDA': 'Santa Brígida', 'TRANS UNIÃO': 'Trans União',
    'TRANSUNIAO TRANSPORTES D7': 'Transunião Transportes D7', 'VIA SUDESTE': 'Via Sudeste', 'VIACAO GRAJAU': 'Viação Grajaú',
}
GARAGENS = {
    'A2 Transportes': 'A2 Transportes', 'Alfa Rodobus': 'Alfa Rodobus', 'Alfa Rodobus SPE': 'Alfa Rodobus SPE',
    'Gato Preto - Portinari': 'Gato Preto', 'Gato Preto - Mackenzie': 'Gato Preto', 'Norte Buss A1': 'Norte Buss A1', 'Norte Buss A2': 'Norte Buss A2',
    'Santa Brigida': 'Santa Brígida', 'Trans União D3': 'Trans União', 'Trans União D7': 'Transunião Transportes D7',
    'Via Sudeste Cursino': 'Via Sudeste', 'Via Sudeste Sapopemba': 'Via Sudeste', 'Viação Grajaú': 'Viação Grajaú',
    'Viação Metrópole AE Carvalho': 'Metrópole AE Carvalho', 'Viação Metrópole Brás': 'Metrópole Expandir (Brás)',
    'Viação Metrópole Iguatemi': 'Metrópole Iguatemi', 'Viação Metrópole Imperador': 'Metrópole Imperador', 'Viação Metrópole Itaim': 'Metrópole Itaim',
    "Viação Metrópole M'Boi Mirim": "Metrópole M'Boi Mirim", 'Viação Metrópole Pinedo': 'Metrópole Pinedo',
}
TECNOLOGIA = {(21,): 'mini', (21, 22, 23): 'padron', (21, 22, 23, 24, 25, 26): 'articulado'}  # 21–22 é ambíguo (Básico/Midi): fica em branco


def q(s):
    return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"


def main():
    meta = json.loads((DADOS / 'meta.json').read_text(encoding='utf-8'))
    frota = json.loads((DADOS / 'frota.json').read_text(encoding='utf-8'))['veiculos']
    linhas = ['-- Seeds 2/2 (gerado por scripts/gerar_seed_supabase.py a partir de site/public/data): empresas, garagens, veículos e câmeras.',
              "select set_config('app.sem_auditoria', 'on', true);",
              'insert into public.empresas (nome, codigo_monitoramento) values\n  ' +
              ',\n  '.join(f'({q(n)}, {q(c)})' for c, n in MAPA_EMPRESA.items()) + '\non conflict do nothing;',
              'insert into public.garagens (nome, empresa_id) values\n  ' +
              ',\n  '.join(f'({q(g)}, (select id from public.empresas where nome = {q(e)}))' for g, e in GARAGENS.items()) + '\non conflict do nothing;']
    # Formato compacto (cabe numa única migração pequena): registros separados por ';' =
    # empresa (1 char) + garagem (1 char) + câmeras (1 char) + diferença do prefixo anterior em base 36.
    emp_idx = {n: i for i, n in enumerate(MAPA_EMPRESA.values())}
    gar_idx = {n: i for i, n in enumerate(GARAGENS)}
    cam_idx = {(21,): 'a', (21, 22): 'b', (21, 22, 23): 'c', (21, 22, 23, 24, 25, 26): 'd'}
    b36 = lambda n: '0' if n == 0 else (b36(n // 36).lstrip('0') + '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36])
    alfa = '0123456789abcdefghijklmnopqrstuvwxyz'
    regs, ant, ncam = [], 0, 0
    for v in sorted(frota, key=lambda x: x['p']):
        emp = MAPA_EMPRESA.get(meta['empresas'][v['e']]) if v['e'] is not None else None
        cams = tuple(sorted(c for c in v['c'] if 21 <= c <= 26))
        ncam += len(cams)
        regs.append((alfa[emp_idx[emp]] if emp else '_') + (alfa[gar_idx[v['g']]] if v['g'] in gar_idx else '_') + cam_idx[cams] + b36(v['p'] - ant))
        ant = v['p']
    vals = regs
    emp_lista = ','.join(q(n) for n in MAPA_EMPRESA.values())
    gar_lista = ','.join(q(n) for n in GARAGENS)
    linhas.append(f"""create or replace function pg_temp.b36(t text) returns bigint language sql immutable as $$
  select coalesce(sum((strpos('0123456789abcdefghijklmnopqrstuvwxyz', substr(t, i, 1)) - 1) * power(36, length(t) - i))::bigint, 0)
  from generate_series(1, length(t)) i $$;
with r as (select x, n from regexp_split_to_table('{';'.join(regs)}', ';') with ordinality as t(x, n)),
d as (select n, substr(x, 1, 1) e, substr(x, 2, 1) g, substr(x, 3, 1) c, sum(pg_temp.b36(substr(x, 4))) over (order by n) as prefixo from r),
emp as (select nome, (n - 1)::int i from unnest(array[{emp_lista}]) with ordinality as t(nome, n)),
gar as (select nome, (n - 1)::int i from unnest(array[{gar_lista}]) with ordinality as t(nome, n)),
f as (select d.prefixo::int prefixo, emp.nome empresa, gar.nome garagem,
        case d.c when 'a' then 'mini' when 'c' then 'padron' when 'd' then 'articulado' end tecnologia,
        case d.c when 'a' then '{{21}}' when 'b' then '{{21,22}}' when 'c' then '{{21,22,23}}' else '{{21,22,23,24,25,26}}' end::smallint[] cams
      from d left join emp on emp.i = strpos('0123456789abcdefghijklmnopqrstuvwxyz', d.e) - 1
             left join gar on gar.i = strpos('0123456789abcdefghijklmnopqrstuvwxyz', d.g) - 1),
v as (insert into public.veiculos (prefixo, empresa_id, garagem_id, tecnologia)
      select f.prefixo, e.id, g.id, f.tecnologia from f left join public.empresas e on e.nome = f.empresa left join public.garagens g on g.nome = f.garagem
      on conflict (prefixo) do nothing returning id, prefixo)
insert into public.cameras (veiculo_id, posicao)
select v.id, unnest(f.cams) from v join f on f.prefixo = v.prefixo
on conflict do nothing;""")
    SAIDA.write_text('\n'.join(linhas) + '\n', encoding='utf-8')
    print(f'{SAIDA.relative_to(RAIZ)}: {len(vals)} veículos, {ncam} câmeras')


if __name__ == '__main__':
    main()
