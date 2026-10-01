-- Módulo de OS / manutenção CFTV · 1/8: extensões, tipos, schema privado, configurações e catálogos.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Funções internas (não expostas pela API REST: o PostgREST só publica o schema public)
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

create type public.acao_permissao as enum ('visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'administrar');
create type public.prioridade_os as enum ('alta', 'media', 'baixa');
create type public.status_os as enum (
  'aguardando_manutencao', 'em_atendimento', 'pausada', 'aguardando_material', 'concluida',
  'aguardando_validacao', 'resolvida', 'nao_resolvida', 'reincidente');
create type public.status_atendimento as enum ('em_andamento', 'pausado', 'concluido', 'cancelado');
create type public.origem_os as enum ('monitoramento', 'manual');
create type public.resultado_validacao as enum ('pendente', 'resolvido', 'nao_resolvido', 'reincidente');
create type public.campo_imagem as enum ('frente_onibus', 'pre_servico', 'pos_servico', 'camera', 'switch_antes', 'switch_depois', 'material', 'outro');
create type public.tipo_movimentacao as enum ('entrada', 'saida', 'ajuste', 'transferencia_saida', 'transferencia_entrada');
create type public.status_solicitacao as enum ('pendente', 'aprovada', 'recusada', 'atendida', 'cancelada');
create type public.tipo_equipamento as enum ('ucp', 'camera', 'cartao_sd', 'switch', 'tdm', 'antena', 'outro');

-- Atualiza atualizado_em
create or replace function privado.tocar_atualizado_em() returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;

-- Configurações gerais (janelas de validação etc.)
create table public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);

-- Catálogos do formulário (replicam o Jotform "Revisão CFTV")
create table public.catalogo_problemas (
  id smallint generated always as identity primary key,
  descricao text not null unique,
  categoria text not null default 'camera',
  exclusivo boolean not null default false,   -- "Nenhuma anomalia identificada" não combina com outros
  ordem smallint not null default 0,
  ativo boolean not null default true
);
create table public.catalogo_acoes (
  id smallint generated always as identity primary key,
  descricao text not null unique,
  categoria text not null default 'camera',
  exclusivo boolean not null default false,   -- "Nenhuma ação realizada"
  material_codigo text,                        -- ação que consome material (ex.: substituição do switch -> SWITCH)
  ordem smallint not null default 0,
  ativo boolean not null default true
);
create table public.motivos_pausa (
  id smallint generated always as identity primary key,
  descricao text not null unique,
  aguarda_material boolean not null default false,  -- pausa por material: OS vai para "Aguardando material"
  exige_observacao boolean not null default false,
  ativo boolean not null default true
);
-- Tecnologia do veículo -> posições de câmera (lógica condicional do formulário)
create table public.tecnologias (
  codigo text primary key,
  nome text not null unique,
  posicoes smallint[] not null,
  ordem smallint not null default 0
);
