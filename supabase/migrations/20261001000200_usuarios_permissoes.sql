-- 2/8: cadastro básico (empresas, garagens), usuários, perfis, permissões por módulo/ação, convites e limite de tentativas.
create table public.empresas (
  id smallint generated always as identity primary key,
  nome text not null unique,
  codigo_monitoramento text unique,   -- nome como vem do monitoramento (ex.: 'METROPOLE - ITAIM')
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table public.garagens (
  id smallint generated always as identity primary key,
  nome text not null unique,           -- como no formulário (ex.: 'Viação Metrópole Itaim')
  empresa_id smallint not null references public.empresas(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.garagens (empresa_id);

create table public.perfis (
  id smallint generated always as identity primary key,
  codigo text not null unique,         -- administrador | operacional | manutencao
  nome text not null unique,
  descricao text
);
create table public.modulos (
  codigo text primary key,
  nome text not null,
  ordem smallint not null default 0
);
-- Permissão do perfil: (perfil, módulo, ação). 'administrar' no módulo implica todas as ações do módulo.
create table public.permissoes (
  perfil_id smallint not null references public.perfis(id) on delete cascade,
  modulo text not null references public.modulos(codigo) on delete cascade,
  acao public.acao_permissao not null,
  primary key (perfil_id, modulo, acao)
);

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email extensions.citext not null unique,
  perfil_id smallint references public.perfis(id),
  garagem_atual_id smallint references public.garagens(id),
  telefone text,
  ativo boolean not null default false,          -- sem convite: fica inativo até um administrador liberar
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_nome_tam check (char_length(nome) <= 120)
);
create index on public.usuarios (perfil_id);
create trigger usuarios_atualizado before update on public.usuarios for each row execute function privado.tocar_atualizado_em();

-- Exceções por usuário (concede ou retira uma ação de um módulo, além do perfil)
create table public.permissoes_usuario (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  modulo text not null references public.modulos(codigo) on delete cascade,
  acao public.acao_permissao not null,
  permitido boolean not null,
  primary key (usuario_id, modulo, acao)
);

-- Convites: e-mail pré-autorizado com perfil. No primeiro login (link mágico) o usuário recebe o perfil e fica ativo.
create table public.convites (
  email extensions.citext primary key,
  nome text,
  perfil_id smallint not null references public.perfis(id),
  garagem_id smallint references public.garagens(id),
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);

-- Primeiro administrador: código de uso único (hash bcrypt), válido só enquanto não houver administrador ativo.
create table privado.bootstrap_admin (
  id boolean primary key default true check (id),
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas smallint not null default 0
);

-- Limite de tentativas por chave (rate limiting nas RPCs sensíveis)
create table privado.limites (
  chave text not null,
  janela timestamptz not null,
  contagem integer not null default 0,
  primary key (chave, janela)
);
-- Devolve false quando a chave passou do limite na janela (sem lançar erro, para o contador não ser desfeito)
create or replace function privado.limitar(p_chave text, p_max integer, p_janela_seg integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / p_janela_seg) * p_janela_seg);
        v_cont integer;
begin
  delete from privado.limites where janela < now() - interval '1 day';
  insert into privado.limites (chave, janela, contagem) values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update set contagem = privado.limites.contagem + 1
  returning contagem into v_cont;
  return v_cont <= p_max;
end $$;
create or replace function privado.exigir_limite(p_chave text, p_max integer, p_janela_seg integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.limitar(p_chave, p_max, p_janela_seg) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' using errcode = 'P0429';
  end if;
end $$;

-- ===== Funções de autorização (usadas nas políticas RLS e no frontend) =====
create or replace function privado.usuario_ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.ativo from public.usuarios u where u.id = (select auth.uid())), false)
$$;

create or replace function privado.tem_permissao(p_modulo text, p_acao public.acao_permissao) returns boolean
language sql stable security definer set search_path = '' as $$
  with u as (select id, perfil_id from public.usuarios where id = (select auth.uid()) and ativo)
  select case
    when not exists (select 1 from u) then false
    -- exceção do usuário tem prioridade: retirar a ação vence; conceder a ação (ou 'administrar' do módulo) libera
    when exists (select 1 from public.permissoes_usuario pu, u where pu.usuario_id = u.id and pu.modulo = p_modulo
                 and pu.acao = p_acao and not pu.permitido) then false
    when exists (select 1 from public.permissoes_usuario pu, u where pu.usuario_id = u.id and pu.modulo = p_modulo
                 and pu.acao in (p_acao, 'administrar') and pu.permitido) then true
    else exists (select 1 from public.permissoes p, u where p.perfil_id = u.perfil_id and p.modulo = p_modulo
                 and p.acao in (p_acao, 'administrar'))
  end
$$;

create or replace function privado.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u join public.perfis p on p.id = u.perfil_id
                 where u.id = (select auth.uid()) and u.ativo and p.codigo = 'administrador')
$$;

-- Para o frontend: permissões efetivas do usuário logado
create or replace function public.minhas_permissoes() returns table (modulo text, acao public.acao_permissao)
language sql stable security definer set search_path = '' as $$
  select m.codigo, a.acao
  from public.modulos m cross join unnest(enum_range(null::public.acao_permissao)) as a(acao)
  where privado.tem_permissao(m.codigo, a.acao)
$$;

create or replace function public.tem_permissao(p_modulo text, p_acao public.acao_permissao) returns boolean
language sql stable security definer set search_path = '' as $$ select privado.tem_permissao(p_modulo, p_acao) $$;

-- Perfil do usuário logado (uma linha), com nome do perfil e garagem atual
create or replace function public.meu_usuario() returns table (
  id uuid, nome text, email text, perfil text, perfil_nome text, ativo boolean, garagem_atual_id smallint, garagem_atual text,
  existe_admin boolean, bootstrap_disponivel boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select u.id, u.nome, u.email::text, p.codigo, p.nome, u.ativo, u.garagem_atual_id, g.nome,
         exists (select 1 from public.usuarios x join public.perfis px on px.id = x.perfil_id where x.ativo and px.codigo = 'administrador'),
         exists (select 1 from privado.bootstrap_admin b where b.expira_em > now())
  from public.usuarios u left join public.perfis p on p.id = u.perfil_id left join public.garagens g on g.id = u.garagem_atual_id
  where u.id = (select auth.uid());
end $$;

-- Novo usuário do Auth -> linha em public.usuarios (perfil vem do convite; sem convite fica inativo)
create or replace function privado.ao_criar_usuario_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.convites%rowtype;
begin
  select * into c from public.convites where email = new.email::extensions.citext and usado_em is null;
  insert into public.usuarios (id, nome, email, perfil_id, garagem_atual_id, ativo)
  values (new.id, coalesce(c.nome, new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), new.email,
          c.perfil_id, c.garagem_id, c.perfil_id is not null)
  on conflict (id) do nothing;
  if found and c.email is not null then update public.convites set usado_em = now() where email = c.email; end if;
  return new;
end $$;
create trigger ao_criar_usuario_auth after insert on auth.users for each row execute function privado.ao_criar_usuario_auth();

-- Primeiro administrador: quem tiver o código de uso único vira Administrador (só se ainda não houver nenhum).
-- Retorna: 'ok' | 'codigo_invalido' | 'ja_existe_admin' | 'indisponivel' | 'muitas_tentativas' (sem lançar erro, para o
-- limite de tentativas valer: 5 por usuário a cada 15 min e 10 erros no total invalidam o código).
create or replace function public.reivindicar_admin(p_codigo text) returns text
language plpgsql security definer set search_path = '' as $$
declare b privado.bootstrap_admin%rowtype; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return 'indisponivel'; end if;
  if not privado.limitar('bootstrap:' || v_uid, 5, 900) then return 'muitas_tentativas'; end if;
  if exists (select 1 from public.usuarios x join public.perfis px on px.id = x.perfil_id where x.ativo and px.codigo = 'administrador') then
    return 'ja_existe_admin';
  end if;
  select * into b from privado.bootstrap_admin for update;
  if not found or b.expira_em < now() or b.tentativas >= 10 then return 'indisponivel'; end if;
  if extensions.crypt(p_codigo, b.codigo_hash) <> b.codigo_hash then
    update privado.bootstrap_admin set tentativas = tentativas + 1;
    return 'codigo_invalido';
  end if;
  perform set_config('app.rpc', 'on', true);
  update public.usuarios set perfil_id = (select id from public.perfis where codigo = 'administrador'), ativo = true where id = v_uid;
  delete from privado.bootstrap_admin;
  return 'ok';
end $$;

-- Técnico: define a própria Garagem atual (persistida por usuário)
create or replace function public.definir_garagem_atual(p_garagem_id smallint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.usuario_ativo() then raise exception 'Usuário sem acesso.' using errcode = '42501'; end if;
  if p_garagem_id is not null and not exists (select 1 from public.garagens where id = p_garagem_id and ativo) then
    raise exception 'Garagem inválida.' using errcode = '22023';
  end if;
  perform set_config('app.rpc', 'on', true);
  update public.usuarios set garagem_atual_id = p_garagem_id where id = (select auth.uid());
end $$;

-- Registra o último acesso (chamado no login)
create or replace function public.registrar_acesso() returns void
language sql security definer set search_path = '' as $$
  update public.usuarios set ultimo_acesso = now() where id = (select auth.uid())
$$;

-- Impede que alguém sem 'usuarios.administrar' mude perfil/ativo (inclusive o próprio)
create or replace function privado.proteger_usuarios() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.rpc', true) = 'on' or (select auth.uid()) is null then return new; end if;  -- RPC interna ou service_role
  if (new.perfil_id is distinct from old.perfil_id or new.ativo is distinct from old.ativo or new.email is distinct from old.email)
     and not privado.tem_permissao('usuarios', 'administrar') then
    raise exception 'Sem permissão para alterar perfil, e-mail ou status.' using errcode = '42501';
  end if;
  if new.id = (select auth.uid()) and old.ativo and not new.ativo then
    raise exception 'Você não pode desativar o próprio acesso.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger usuarios_proteger before update on public.usuarios for each row execute function privado.proteger_usuarios();
