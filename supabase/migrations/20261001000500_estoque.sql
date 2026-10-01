-- 5/8: materiais, estoque por local (garagem; null = central), movimentações imutáveis e solicitações de material.
create table public.materiais (
  id smallint generated always as identity primary key,
  codigo text not null unique,               -- CAMERA | CARTAO_SD | SWITCH | ...
  nome text not null,
  unidade text not null default 'un',
  estoque_minimo numeric(12, 2) not null default 0,
  ativo boolean not null default true
);
create table public.estoque (
  id integer generated always as identity primary key,
  material_id smallint not null references public.materiais(id),
  garagem_id smallint references public.garagens(id),     -- null = estoque central
  quantidade numeric(12, 2) not null default 0,
  atualizado_em timestamptz not null default now()
);
create unique index estoque_local on public.estoque (material_id, coalesce(garagem_id, 0));

create table public.solicitacoes_material (
  id integer generated always as identity primary key,
  solicitante_id uuid not null default auth.uid() references public.usuarios(id),
  garagem_id smallint references public.garagens(id),
  os_id integer references public.ordens_servico(id),
  status public.status_solicitacao not null default 'pendente',
  observacao text check (char_length(observacao) <= 2000),
  decidido_por uuid references public.usuarios(id),
  decidido_em timestamptz,
  motivo_decisao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.solicitacoes_material (solicitante_id, criado_em desc);
create index on public.solicitacoes_material (status);
create trigger solicitacoes_atualizado before update on public.solicitacoes_material for each row execute function privado.tocar_atualizado_em();

create table public.itens_solicitacao (
  id integer generated always as identity primary key,
  solicitacao_id integer not null references public.solicitacoes_material(id) on delete cascade,
  material_id smallint not null references public.materiais(id),
  quantidade numeric(12, 2) not null check (quantidade > 0),
  quantidade_atendida numeric(12, 2) not null default 0 check (quantidade_atendida >= 0),
  unique (solicitacao_id, material_id)
);

create table public.movimentacoes_estoque (
  id bigint generated always as identity primary key,
  material_id smallint not null references public.materiais(id),
  garagem_id smallint references public.garagens(id),
  tipo public.tipo_movimentacao not null,
  quantidade numeric(12, 2) not null check (quantidade <> 0),   -- com sinal: entrada +, saída -
  saldo_apos numeric(12, 2) not null,
  atendimento_id integer references public.atendimentos(id),
  solicitacao_id integer references public.solicitacoes_material(id),
  motivo text,
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now()
);
create index on public.movimentacoes_estoque (material_id, criado_em desc);

-- Única forma de alterar saldo: trava a linha do estoque; saldo negativo só com 'estoque.administrar'.
create or replace function privado.movimentar(p_material_id smallint, p_garagem_id smallint, p_tipo public.tipo_movimentacao,
  p_quantidade numeric, p_motivo text, p_atendimento_id integer default null, p_solicitacao_id integer default null)
returns public.movimentacoes_estoque
language plpgsql security definer set search_path = '' as $$
declare e public.estoque%rowtype; v_delta numeric; m public.movimentacoes_estoque%rowtype;
begin
  if p_quantidade is null or p_quantidade = 0 then raise exception 'Quantidade inválida.' using errcode = '22023'; end if;
  v_delta := case when p_tipo in ('saida', 'transferencia_saida') then -abs(p_quantidade)
                  when p_tipo in ('entrada', 'transferencia_entrada') then abs(p_quantidade) else p_quantidade end;
  insert into public.estoque (material_id, garagem_id) values (p_material_id, p_garagem_id) on conflict do nothing;
  select * into e from public.estoque where material_id = p_material_id and coalesce(garagem_id, 0) = coalesce(p_garagem_id, 0) for update;
  if e.quantidade + v_delta < 0 and not privado.tem_permissao('estoque', 'administrar') then
    raise exception 'Estoque insuficiente (saldo %). Saldo negativo só com autorização de administrador.', e.quantidade using errcode = 'P0409';
  end if;
  update public.estoque set quantidade = quantidade + v_delta, atualizado_em = now() where id = e.id;
  insert into public.movimentacoes_estoque (material_id, garagem_id, tipo, quantidade, saldo_apos, atendimento_id, solicitacao_id, motivo, criado_por)
  values (p_material_id, p_garagem_id, p_tipo, v_delta, e.quantidade + v_delta, p_atendimento_id, p_solicitacao_id, p_motivo, (select auth.uid()))
  returning * into m;
  return m;
end $$;

create or replace function public.registrar_movimentacao(p_material_id smallint, p_garagem_id smallint, p_tipo public.tipo_movimentacao,
  p_quantidade numeric, p_motivo text) returns public.movimentacoes_estoque
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.tem_permissao('estoque', 'editar') then raise exception 'Sem permissão para movimentar estoque.' using errcode = '42501'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.' using errcode = '22023'; end if;
  return privado.movimentar(p_material_id, p_garagem_id, p_tipo, p_quantidade, p_motivo);
end $$;

create or replace function public.transferir_estoque(p_material_id smallint, p_de smallint, p_para smallint, p_quantidade numeric, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.tem_permissao('estoque', 'editar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform privado.movimentar(p_material_id, p_de, 'transferencia_saida', p_quantidade, p_motivo);
  perform privado.movimentar(p_material_id, p_para, 'transferencia_entrada', p_quantidade, p_motivo);
end $$;

-- Aprovar/recusar/atender solicitação. Atender = saída do estoque de origem (central) para a garagem da solicitação.
create or replace function public.decidir_solicitacao(p_id integer, p_aprovar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.solicitacoes_material%rowtype;
begin
  if not privado.tem_permissao('materiais', 'aprovar') then raise exception 'Sem permissão para aprovar solicitações.' using errcode = '42501'; end if;
  select * into s from public.solicitacoes_material where id = p_id for update;
  if s.status <> 'pendente' then raise exception 'Solicitação já decidida.' using errcode = 'P0409'; end if;
  update public.solicitacoes_material set status = case when p_aprovar then 'aprovada'::public.status_solicitacao else 'recusada'::public.status_solicitacao end,
         decidido_por = (select auth.uid()), decidido_em = now(), motivo_decisao = p_motivo where id = p_id;
end $$;

create or replace function public.atender_solicitacao(p_id integer) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.solicitacoes_material%rowtype; i record;
begin
  if not privado.tem_permissao('estoque', 'editar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into s from public.solicitacoes_material where id = p_id for update;
  if s.status <> 'aprovada' then raise exception 'Só solicitações aprovadas podem ser atendidas.' using errcode = 'P0409'; end if;
  for i in select * from public.itens_solicitacao where solicitacao_id = p_id loop
    perform privado.movimentar(i.material_id, null, 'transferencia_saida', i.quantidade, 'Solicitação #' || p_id, null, p_id);
    perform privado.movimentar(i.material_id, s.garagem_id, 'transferencia_entrada', i.quantidade, 'Solicitação #' || p_id, null, p_id);
    update public.itens_solicitacao set quantidade_atendida = i.quantidade where id = i.id;
  end loop;
  update public.solicitacoes_material set status = 'atendida' where id = p_id;
end $$;
