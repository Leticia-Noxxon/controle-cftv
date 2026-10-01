-- 3/8: frota (veículos, equipamentos, câmeras) e status diário do monitoramento (base da OS automática e da validação).
create table public.veiculos (
  id integer generated always as identity primary key,
  prefixo integer not null unique check (prefixo > 0),
  empresa_id smallint references public.empresas(id),
  garagem_id smallint references public.garagens(id),
  tecnologia text references public.tecnologias(codigo),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.veiculos (empresa_id);
create index on public.veiculos (garagem_id);
create trigger veiculos_atualizado before update on public.veiculos for each row execute function privado.tocar_atualizado_em();

create table public.equipamentos (
  id integer generated always as identity primary key,
  tipo public.tipo_equipamento not null,
  identificador text not null,               -- ID da UCP / nº de série / MAC
  veiculo_id integer references public.veiculos(id) on delete set null,
  ativo boolean not null default true,
  instalado_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now(),
  unique (tipo, identificador)
);
create index on public.equipamentos (veiculo_id);

create table public.cameras (
  id integer generated always as identity primary key,
  veiculo_id integer not null references public.veiculos(id) on delete cascade,
  posicao smallint not null check (posicao between 1 and 9999),   -- 21..26 (posições padrão)
  equipamento_id integer references public.equipamentos(id) on delete set null,
  ativo boolean not null default true,
  unique (veiculo_id, posicao)
);

-- Status diário por câmera vindo do pipeline (scripts/atualizar_dados.py): on | fa | off | sd | nd
create table public.monitoramento_diario (
  veiculo_id integer not null references public.veiculos(id) on delete cascade,
  posicao smallint not null,
  data date not null,
  status text not null check (status in ('on', 'fa', 'off', 'sd', 'nd')),
  minutos_online smallint,
  primary key (veiculo_id, posicao, data)
);
create index on public.monitoramento_diario (data);
