-- 4/8: ordens de serviço, atendimentos (trava atômica), pausas, formulário nativo, problemas/ações, imagens, histórico de status.
create table public.ordens_servico (
  id integer generated always as identity primary key,
  numero text generated always as ('OS-' || lpad(id::text, 6, '0')) stored unique,
  veiculo_id integer not null references public.veiculos(id),
  garagem_id smallint references public.garagens(id),
  origem public.origem_os not null default 'manual',
  prioridade public.prioridade_os not null default 'media',
  prioridade_ordem smallint generated always as (case prioridade when 'alta' then 0 when 'media' then 1 else 2 end) stored,
  status public.status_os not null default 'aguardando_manutencao',
  cameras smallint[] not null default '{}',          -- posições com problema
  descricao text check (char_length(descricao) <= 4000),
  dias_problema smallint,
  chave_monitoramento text unique,                   -- deduplica a criação automática (veículo + início do problema)
  responsavel_id uuid references public.usuarios(id),
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index ordens_servico_fila on public.ordens_servico (status, prioridade_ordem, criado_em);
create index on public.ordens_servico (veiculo_id);
create index on public.ordens_servico (garagem_id);
create index on public.ordens_servico (responsavel_id);
-- No máximo uma OS aberta por veículo
create unique index ordens_servico_uma_aberta on public.ordens_servico (veiculo_id)
  where status in ('aguardando_manutencao', 'em_atendimento', 'pausada', 'aguardando_material');
create trigger ordens_servico_atualizado before update on public.ordens_servico for each row execute function privado.tocar_atualizado_em();

create table public.atendimentos (
  id integer generated always as identity primary key,
  os_id integer not null references public.ordens_servico(id),
  tecnico_id uuid not null references public.usuarios(id),
  status public.status_atendimento not null default 'em_andamento',
  iniciado_em timestamptz not null default now(),     -- sempre horário do servidor
  finalizado_em timestamptz,
  segundos_pausados integer not null default 0,
  criado_em timestamptz not null default now()
);
-- Trava: um atendimento ativo por OS e um por técnico (garantido pelo banco, além da RPC)
create unique index atendimentos_um_ativo_por_os on public.atendimentos (os_id) where status in ('em_andamento', 'pausado');
create unique index atendimentos_um_ativo_por_tecnico on public.atendimentos (tecnico_id) where status in ('em_andamento', 'pausado');
create index on public.atendimentos (tecnico_id, iniciado_em desc);

create table public.pausas_atendimento (
  id integer generated always as identity primary key,
  atendimento_id integer not null references public.atendimentos(id) on delete cascade,
  motivo_id smallint not null references public.motivos_pausa(id),
  observacao text check (char_length(observacao) <= 1000),
  inicio timestamptz not null default now(),
  fim timestamptz,
  check (fim is null or fim >= inicio)
);
create unique index pausas_uma_aberta on public.pausas_atendimento (atendimento_id) where fim is null;

-- Formulário nativo (réplica do Jotform). rascunho = estado completo do formulário (autosave).
create table public.respostas_manutencao (
  id integer generated always as identity primary key,
  atendimento_id integer not null unique references public.atendimentos(id) on delete cascade,
  os_id integer not null references public.ordens_servico(id),
  garagem_id smallint references public.garagens(id),
  tecnologia text references public.tecnologias(codigo),
  id_equipamento text,
  qtd_camera smallint not null default 0 check (qtd_camera >= 0),
  qtd_cartao smallint not null default 0 check (qtd_cartao >= 0),
  qtd_switch smallint not null default 0 check (qtd_switch >= 0),
  observacoes text check (char_length(observacoes) <= 8000),
  rascunho jsonb not null default '{}'::jsonb,
  versao integer not null default 1,                 -- controle otimista do autosave
  enviado boolean not null default false,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger respostas_atualizado before update on public.respostas_manutencao for each row execute function privado.tocar_atualizado_em();

create table public.problemas_detectados (
  id integer generated always as identity primary key,
  os_id integer not null references public.ordens_servico(id) on delete cascade,
  resposta_id integer references public.respostas_manutencao(id) on delete cascade,
  posicao smallint,                                   -- câmera 21..26 (null = veículo)
  origem text not null check (origem in ('monitoramento', 'tecnico')),
  problema_id smallint references public.catalogo_problemas(id),
  status_monitoramento text check (status_monitoramento in ('fa', 'off', 'sd', 'nd')),
  descricao text,
  criado_em timestamptz not null default now()
);
create index on public.problemas_detectados (os_id);
create index on public.problemas_detectados (resposta_id);

create table public.acoes_realizadas (
  id integer generated always as identity primary key,
  resposta_id integer not null references public.respostas_manutencao(id) on delete cascade,
  posicao smallint,
  acao_id smallint not null references public.catalogo_acoes(id),
  criado_em timestamptz not null default now(),
  unique (resposta_id, posicao, acao_id)
);

create table public.imagens (
  id uuid primary key default gen_random_uuid(),
  os_id integer not null references public.ordens_servico(id) on delete cascade,
  atendimento_id integer references public.atendimentos(id) on delete cascade,
  campo public.campo_imagem not null,
  posicao smallint,
  storage_path text not null unique,                 -- bucket 'manutencao': os/<os>/<atendimento>/<campo>/<uuid>.jpg
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes > 0 and bytes <= 10485760),
  largura smallint, altura smallint,
  criado_por uuid not null default auth.uid() references public.usuarios(id),
  criado_em timestamptz not null default now()
);
create index on public.imagens (os_id);
create index on public.imagens (atendimento_id);

create table public.historico_status_os (
  id bigint generated always as identity primary key,
  os_id integer not null references public.ordens_servico(id) on delete cascade,
  status_anterior public.status_os,
  status_novo public.status_os not null,
  usuario_id uuid references public.usuarios(id),
  motivo text,
  criado_em timestamptz not null default now()
);
create index on public.historico_status_os (os_id, criado_em);

-- Histórico de status automático
create or replace function privado.registrar_status_os() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.historico_status_os (os_id, status_anterior, status_novo, usuario_id, motivo)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()), nullif(current_setting('app.motivo', true), ''));
  end if;
  return new;
end $$;
create trigger ordens_servico_status after insert or update of status on public.ordens_servico for each row execute function privado.registrar_status_os();

-- Status e responsável da OS só mudam pelas RPCs (iniciar/pausar/retomar/finalizar/validar) ou por quem administra OS
create or replace function privado.proteger_status_os() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.rpc', true) = 'on' or (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'aguardando_manutencao' or new.responsavel_id is not null then
      raise exception 'Nova OS começa em "Aguardando manutenção", sem responsável.' using errcode = '42501';
    end if;
    new.criado_por := (select auth.uid());
    return new;
  end if;
  if (new.status is distinct from old.status or new.responsavel_id is distinct from old.responsavel_id)
     and not privado.tem_permissao('os', 'administrar') then
    raise exception 'Status e responsável da OS mudam só pelo fluxo de atendimento.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger ordens_servico_proteger before insert or update on public.ordens_servico for each row execute function privado.proteger_status_os();

-- ===== RPCs do atendimento (horário sempre do servidor: now()) =====
-- Iniciar manutenção: trava a linha da OS (FOR UPDATE), confere status e cria o atendimento. Dois técnicos ao mesmo tempo:
-- o segundo espera a trava, encontra a OS já "Em atendimento" e recebe erro.
create or replace function public.iniciar_atendimento(p_os_id integer) returns public.atendimentos
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); o public.ordens_servico%rowtype; a public.atendimentos%rowtype; v_nome text;
begin
  if not privado.tem_permissao('atendimentos', 'criar') then raise exception 'Sem permissão para iniciar manutenção.' using errcode = '42501'; end if;
  perform privado.exigir_limite('iniciar:' || v_uid, 30, 60);
  select * into o from public.ordens_servico where id = p_os_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if o.status not in ('aguardando_manutencao', 'aguardando_material', 'nao_resolvida', 'reincidente') then
    select u.nome into v_nome from public.usuarios u where u.id = o.responsavel_id;
    raise exception 'Esta OS já está %.', case when o.status in ('em_atendimento', 'pausada') then 'em atendimento por ' || coalesce(v_nome, 'outro técnico') else 'com status ' || o.status end
      using errcode = 'P0409';
  end if;
  if exists (select 1 from public.atendimentos x where x.tecnico_id = v_uid and x.status in ('em_andamento', 'pausado')) then
    raise exception 'Você possui uma manutenção em andamento. Finalize ou pause antes de iniciar outra.' using errcode = 'P0409';
  end if;
  perform set_config('app.rpc', 'on', true);
  insert into public.atendimentos (os_id, tecnico_id) values (o.id, v_uid) returning * into a;
  update public.ordens_servico set status = 'em_atendimento', responsavel_id = v_uid where id = o.id;
  insert into public.respostas_manutencao (atendimento_id, os_id, garagem_id, tecnologia)
  select a.id, o.id, coalesce(o.garagem_id, v.garagem_id), v.tecnologia from public.veiculos v where v.id = o.veiculo_id;
  perform set_config('app.rpc', 'off', true);
  return a;
end $$;

create or replace function privado.meu_atendimento(p_atendimento_id integer) returns public.atendimentos
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype;
begin
  select * into a from public.atendimentos where id = p_atendimento_id for update;
  if not found then raise exception 'Atendimento não encontrado.' using errcode = 'P0002'; end if;
  if a.tecnico_id <> (select auth.uid()) and not privado.tem_permissao('atendimentos', 'administrar') then
    raise exception 'Este atendimento é de outro técnico.' using errcode = '42501';
  end if;
  return a;
end $$;

create or replace function public.pausar_atendimento(p_atendimento_id integer, p_motivo_id smallint, p_observacao text default null)
returns public.pausas_atendimento
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype; m public.motivos_pausa%rowtype; p public.pausas_atendimento%rowtype;
begin
  a := privado.meu_atendimento(p_atendimento_id);
  if a.status <> 'em_andamento' then raise exception 'Só é possível pausar um atendimento em andamento.' using errcode = 'P0409'; end if;
  select * into m from public.motivos_pausa where id = p_motivo_id and ativo;
  if not found then raise exception 'Motivo de pausa inválido.' using errcode = '22023'; end if;
  if m.exige_observacao and coalesce(btrim(p_observacao), '') = '' then raise exception 'Informe a observação da pausa.' using errcode = '22023'; end if;
  perform set_config('app.rpc', 'on', true);
  insert into public.pausas_atendimento (atendimento_id, motivo_id, observacao) values (a.id, m.id, nullif(btrim(p_observacao), '')) returning * into p;
  update public.atendimentos set status = 'pausado' where id = a.id;
  perform set_config('app.motivo', m.descricao, true);
  update public.ordens_servico set status = case when m.aguarda_material then 'aguardando_material'::public.status_os else 'pausada'::public.status_os end where id = a.os_id;
  perform set_config('app.rpc', 'off', true);
  return p;
end $$;

create or replace function privado.fechar_pausa(p_atendimento_id integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_seg integer;
begin
  update public.pausas_atendimento set fim = now() where atendimento_id = p_atendimento_id and fim is null
  returning extract(epoch from (fim - inicio))::integer into v_seg;
  if v_seg is not null then update public.atendimentos set segundos_pausados = segundos_pausados + v_seg where id = p_atendimento_id; end if;
end $$;

create or replace function public.retomar_atendimento(p_atendimento_id integer) returns public.atendimentos
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype;
begin
  a := privado.meu_atendimento(p_atendimento_id);
  if a.status <> 'pausado' then raise exception 'O atendimento não está pausado.' using errcode = 'P0409'; end if;
  perform set_config('app.rpc', 'on', true);
  perform privado.fechar_pausa(a.id);
  update public.atendimentos set status = 'em_andamento' where id = a.id returning * into a;
  update public.ordens_servico set status = 'em_atendimento' where id = a.os_id;
  perform set_config('app.rpc', 'off', true);
  return a;
end $$;

-- Finalizar: exige formulário enviado; fecha pausa aberta; OS vai para "Aguardando validação".
create or replace function public.finalizar_atendimento(p_atendimento_id integer) returns public.atendimentos
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype;
begin
  a := privado.meu_atendimento(p_atendimento_id);
  if a.status not in ('em_andamento', 'pausado') then raise exception 'Atendimento já encerrado.' using errcode = 'P0409'; end if;
  if not exists (select 1 from public.respostas_manutencao r where r.atendimento_id = a.id and r.enviado) then
    raise exception 'Envie o formulário de manutenção antes de finalizar.' using errcode = 'P0409';
  end if;
  perform set_config('app.rpc', 'on', true);
  perform privado.fechar_pausa(a.id);
  update public.atendimentos set status = 'concluido', finalizado_em = now() where id = a.id returning * into a;
  update public.ordens_servico set status = 'aguardando_validacao', concluida_em = now() where id = a.os_id;
  insert into public.validacoes_pos_manutencao (os_id, atendimento_id, janela_dias)
  values (a.os_id, a.id, coalesce((select (valor #>> '{}')::smallint from public.configuracoes where chave = 'janela_reincidencia_dias'), 7));
  perform set_config('app.rpc', 'off', true);
  return a;
end $$;

-- Cancelar (administração de atendimentos): libera a OS de volta para a fila
create or replace function public.cancelar_atendimento(p_atendimento_id integer, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype;
begin
  if not privado.tem_permissao('atendimentos', 'administrar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into a from public.atendimentos where id = p_atendimento_id for update;
  if a.status not in ('em_andamento', 'pausado') then raise exception 'Atendimento já encerrado.' using errcode = 'P0409'; end if;
  perform set_config('app.rpc', 'on', true);
  perform privado.fechar_pausa(a.id);
  update public.atendimentos set status = 'cancelado', finalizado_em = now() where id = a.id;
  perform set_config('app.motivo', coalesce(p_motivo, 'Atendimento cancelado'), true);
  update public.ordens_servico set status = 'aguardando_manutencao', responsavel_id = null where id = a.os_id;
  perform set_config('app.rpc', 'off', true);
end $$;

-- Tempos (total, efetivo, pausado) calculados no banco, com o relógio do servidor
create view public.vw_tempos_atendimento with (security_invoker = true) as
select a.id as atendimento_id, a.os_id, a.tecnico_id, a.status, a.iniciado_em, a.finalizado_em,
       extract(epoch from (coalesce(a.finalizado_em, now()) - a.iniciado_em))::integer as segundos_total,
       (a.segundos_pausados + coalesce((select extract(epoch from (now() - p.inicio))::integer from public.pausas_atendimento p
                                        where p.atendimento_id = a.id and p.fim is null), 0)) as segundos_pausados,
       extract(epoch from (coalesce(a.finalizado_em, now()) - a.iniciado_em))::integer
         - (a.segundos_pausados + coalesce((select extract(epoch from (now() - p.inicio))::integer from public.pausas_atendimento p
                                            where p.atendimento_id = a.id and p.fim is null), 0)) as segundos_efetivos,
       now() as agora_servidor
from public.atendimentos a;

-- Autosave do formulário com controle de versão (evita sobrescrever edição mais nova de outro aparelho)
create or replace function public.salvar_rascunho(p_atendimento_id integer, p_rascunho jsonb, p_versao integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype; v integer;
begin
  a := privado.meu_atendimento(p_atendimento_id);
  if a.status not in ('em_andamento', 'pausado') then raise exception 'Atendimento encerrado.' using errcode = 'P0409'; end if;
  if pg_column_size(p_rascunho) > 262144 then raise exception 'Rascunho muito grande.' using errcode = '22023'; end if;
  update public.respostas_manutencao set rascunho = p_rascunho, versao = versao + 1
  where atendimento_id = a.id and versao = p_versao and not enviado returning versao into v;
  if v is null then raise exception 'O rascunho foi alterado em outro aparelho. Recarregue.' using errcode = 'P0409'; end if;
  return v;
end $$;
