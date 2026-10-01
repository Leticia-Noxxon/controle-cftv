-- 7/8: Row Level Security em todas as tabelas, privilégios mínimos (anon sem acesso) e execução das RPCs só por usuários logados.
-- Padrão: leitura/escrita conforme privado.tem_permissao(módulo, ação). Fluxo do atendimento só por RPC (security definer).
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;

-- atalho legível
create or replace function privado.pode(p_modulo text, p_acao public.acao_permissao) returns boolean
language sql stable security definer set search_path = '' as $$ select privado.tem_permissao(p_modulo, p_acao) $$;
revoke execute on function privado.pode(text, public.acao_permissao) from public, anon;
grant execute on function privado.pode(text, public.acao_permissao) to authenticated;

-- ===== Catálogos e cadastros: leitura para usuários ativos; escrita para quem administra cadastros =====
do $$ declare t text; begin
  foreach t in array array['catalogo_problemas', 'catalogo_acoes', 'motivos_pausa', 'tecnologias', 'empresas', 'garagens',
                           'veiculos', 'equipamentos', 'cameras', 'materiais'] loop
    execute format('create policy ler on public.%I for select to authenticated using ((select privado.usuario_ativo()))', t);
    execute format($p$create policy criar on public.%I for insert to authenticated with check ((select privado.pode('cadastros', 'criar')))$p$, t);
    execute format($p$create policy editar on public.%I for update to authenticated using ((select privado.pode('cadastros', 'editar'))) with check ((select privado.pode('cadastros', 'editar')))$p$, t);
    execute format($p$create policy excluir on public.%I for delete to authenticated using ((select privado.pode('cadastros', 'excluir')))$p$, t);
  end loop;
end $$;

create policy ler on public.configuracoes for select to authenticated using ((select privado.usuario_ativo()));
create policy administrar on public.configuracoes for all to authenticated
  using ((select privado.pode('configuracoes', 'administrar'))) with check ((select privado.pode('configuracoes', 'administrar')));

-- ===== Perfis, módulos e permissões =====
create policy ler on public.perfis for select to authenticated using ((select privado.usuario_ativo()));
create policy administrar on public.perfis for all to authenticated
  using ((select privado.pode('permissoes', 'administrar'))) with check ((select privado.pode('permissoes', 'administrar')));
create policy ler on public.modulos for select to authenticated using ((select privado.usuario_ativo()));
create policy ler on public.permissoes for select to authenticated using ((select privado.pode('permissoes', 'visualizar')));
create policy administrar on public.permissoes for all to authenticated
  using ((select privado.pode('permissoes', 'administrar'))) with check ((select privado.pode('permissoes', 'administrar')));
create policy ler on public.permissoes_usuario for select to authenticated
  using (usuario_id = (select auth.uid()) or (select privado.pode('permissoes', 'visualizar')));
create policy administrar on public.permissoes_usuario for all to authenticated
  using ((select privado.pode('permissoes', 'administrar'))) with check ((select privado.pode('permissoes', 'administrar')));

-- ===== Usuários e convites =====
create policy ler on public.usuarios for select to authenticated
  using (id = (select auth.uid()) or (select privado.pode('usuarios', 'visualizar')));
create policy editar_proprio on public.usuarios for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));          -- perfil/ativo protegidos por gatilho
create policy editar on public.usuarios for update to authenticated
  using ((select privado.pode('usuarios', 'editar'))) with check ((select privado.pode('usuarios', 'editar')));
create policy excluir on public.usuarios for delete to authenticated using ((select privado.pode('usuarios', 'excluir')) and id <> (select auth.uid()));
create policy ler on public.convites for select to authenticated using ((select privado.pode('usuarios', 'visualizar')));
create policy criar on public.convites for insert to authenticated with check ((select privado.pode('usuarios', 'criar')));
create policy editar on public.convites for update to authenticated using ((select privado.pode('usuarios', 'editar'))) with check ((select privado.pode('usuarios', 'editar')));
create policy excluir on public.convites for delete to authenticated using ((select privado.pode('usuarios', 'excluir')));

-- ===== Monitoramento (só leitura; escrito pelo pipeline com a chave de serviço) =====
create policy ler on public.monitoramento_diario for select to authenticated using ((select privado.pode('os', 'visualizar')));

-- ===== OS =====
create policy ler on public.ordens_servico for select to authenticated
  using ((select privado.pode('os', 'visualizar')) or responsavel_id = (select auth.uid()));
create policy criar on public.ordens_servico for insert to authenticated with check ((select privado.pode('os', 'criar')));
create policy editar on public.ordens_servico for update to authenticated
  using ((select privado.pode('os', 'editar'))) with check ((select privado.pode('os', 'editar')));
create policy excluir on public.ordens_servico for delete to authenticated
  using ((select privado.pode('os', 'excluir')) and status = 'aguardando_manutencao');

create policy ler on public.historico_status_os for select to authenticated
  using ((select privado.pode('os', 'visualizar'))
         or exists (select 1 from public.ordens_servico o where o.id = os_id and o.responsavel_id = (select auth.uid())));
create policy ler on public.problemas_detectados for select to authenticated
  using ((select privado.pode('os', 'visualizar'))
         or exists (select 1 from public.ordens_servico o where o.id = os_id and o.responsavel_id = (select auth.uid())));

-- ===== Atendimentos (escrita só pelas RPCs) =====
create policy ler on public.atendimentos for select to authenticated
  using (tecnico_id = (select auth.uid()) or (select privado.pode('atendimentos', 'visualizar')));
create policy ler on public.pausas_atendimento for select to authenticated
  using (exists (select 1 from public.atendimentos a where a.id = atendimento_id
                 and (a.tecnico_id = (select auth.uid()) or (select privado.pode('atendimentos', 'visualizar')))));
create policy ler on public.respostas_manutencao for select to authenticated
  using (exists (select 1 from public.atendimentos a where a.id = atendimento_id
                 and (a.tecnico_id = (select auth.uid()) or (select privado.pode('atendimentos', 'visualizar')))));
create policy ler on public.acoes_realizadas for select to authenticated
  using (exists (select 1 from public.respostas_manutencao r join public.atendimentos a on a.id = r.atendimento_id where r.id = resposta_id
                 and (a.tecnico_id = (select auth.uid()) or (select privado.pode('atendimentos', 'visualizar')))));

-- ===== Imagens: o técnico envia fotos do próprio atendimento em andamento =====
create policy ler on public.imagens for select to authenticated
  using (criado_por = (select auth.uid()) or (select privado.pode('os', 'visualizar')));
create policy criar on public.imagens for insert to authenticated
  with check (criado_por = (select auth.uid()) and exists (select 1 from public.atendimentos a where a.id = atendimento_id and a.os_id = imagens.os_id
              and a.tecnico_id = (select auth.uid()) and a.status in ('em_andamento', 'pausado')));
create policy excluir on public.imagens for delete to authenticated
  using (criado_por = (select auth.uid()) and exists (select 1 from public.atendimentos a where a.id = atendimento_id and a.status in ('em_andamento', 'pausado')));

-- ===== Estoque e materiais =====
create policy ler on public.estoque for select to authenticated using ((select privado.pode('estoque', 'visualizar')));
create policy ler on public.movimentacoes_estoque for select to authenticated using ((select privado.pode('estoque', 'visualizar')));
create policy ler on public.solicitacoes_material for select to authenticated
  using (solicitante_id = (select auth.uid()) or (select privado.pode('materiais', 'visualizar')));
create policy criar on public.solicitacoes_material for insert to authenticated
  with check (solicitante_id = (select auth.uid()) and status = 'pendente' and decidido_por is null and (select privado.pode('materiais', 'criar')));
create policy cancelar_propria on public.solicitacoes_material for update to authenticated
  using (solicitante_id = (select auth.uid()) and status = 'pendente')
  with check (solicitante_id = (select auth.uid()) and status in ('pendente', 'cancelada') and decidido_por is null);
create policy ler on public.itens_solicitacao for select to authenticated
  using (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id
                 and (s.solicitante_id = (select auth.uid()) or (select privado.pode('materiais', 'visualizar')))));
create policy editar_propria on public.itens_solicitacao for all to authenticated
  using (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id and s.solicitante_id = (select auth.uid()) and s.status = 'pendente'))
  with check (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id and s.solicitante_id = (select auth.uid()) and s.status = 'pendente')
              and quantidade_atendida = 0);

-- ===== Validação, auditoria, fila offline =====
create policy ler on public.validacoes_pos_manutencao for select to authenticated
  using ((select privado.pode('validacoes', 'visualizar'))
         or exists (select 1 from public.atendimentos a where a.id = atendimento_id and a.tecnico_id = (select auth.uid())));
create policy ler on public.logs_auditoria for select to authenticated using ((select privado.pode('auditoria', 'visualizar')));
create policy proprias on public.operacoes_sync for select to authenticated using (usuario_id = (select auth.uid()));
create policy registrar on public.operacoes_sync for insert to authenticated with check (usuario_id = (select auth.uid()) and (select privado.usuario_ativo()));

-- Tabelas sem política de escrita para authenticated (atendimentos, pausas, respostas, problemas, ações, histórico, estoque,
-- movimentações, validações, logs, monitoramento) só mudam via RPC security definer ou pela chave de serviço.
