-- Ajustes apontados pelos Advisors do Supabase (performance): índices nas chaves estrangeiras e uma política permissiva
-- por ação (as políticas "for all" de administração viram insert/update/delete; a leitura fica só na política "ler").
-- Segurança: os avisos "SECURITY DEFINER executável por authenticated" são intencionais — cada RPC confere
-- privado.tem_permissao() antes de agir e anon não tem EXECUTE (ver 0700_rls.sql e docs/modulo-os/arquitetura.md).
create index if not exists acoes_realizadas_acao_id_idx on public.acoes_realizadas (acao_id);
create index if not exists cameras_equipamento_id_idx on public.cameras (equipamento_id);
create index if not exists convites_criado_por_idx on public.convites (criado_por);
create index if not exists convites_garagem_id_idx on public.convites (garagem_id);
create index if not exists convites_perfil_id_idx on public.convites (perfil_id);
create index if not exists estoque_garagem_id_idx on public.estoque (garagem_id);
create index if not exists historico_status_os_usuario_id_idx on public.historico_status_os (usuario_id);
create index if not exists imagens_criado_por_idx on public.imagens (criado_por);
create index if not exists itens_solicitacao_material_id_idx on public.itens_solicitacao (material_id);
create index if not exists movimentacoes_estoque_atendimento_id_idx on public.movimentacoes_estoque (atendimento_id);
create index if not exists movimentacoes_estoque_criado_por_idx on public.movimentacoes_estoque (criado_por);
create index if not exists movimentacoes_estoque_garagem_id_idx on public.movimentacoes_estoque (garagem_id);
create index if not exists movimentacoes_estoque_solicitacao_id_idx on public.movimentacoes_estoque (solicitacao_id);
create index if not exists ordens_servico_criado_por_idx on public.ordens_servico (criado_por);
create index if not exists pausas_atendimento_motivo_id_idx on public.pausas_atendimento (motivo_id);
create index if not exists permissoes_modulo_idx on public.permissoes (modulo);
create index if not exists permissoes_usuario_modulo_idx on public.permissoes_usuario (modulo);
create index if not exists problemas_detectados_problema_id_idx on public.problemas_detectados (problema_id);
create index if not exists respostas_manutencao_garagem_id_idx on public.respostas_manutencao (garagem_id);
create index if not exists respostas_manutencao_os_id_idx on public.respostas_manutencao (os_id);
create index if not exists respostas_manutencao_tecnologia_idx on public.respostas_manutencao (tecnologia);
create index if not exists solicitacoes_material_decidido_por_idx on public.solicitacoes_material (decidido_por);
create index if not exists solicitacoes_material_garagem_id_idx on public.solicitacoes_material (garagem_id);
create index if not exists solicitacoes_material_os_id_idx on public.solicitacoes_material (os_id);
create index if not exists usuarios_garagem_atual_id_idx on public.usuarios (garagem_atual_id);
create index if not exists validacoes_pos_manutencao_avaliado_por_idx on public.validacoes_pos_manutencao (avaliado_por);
create index if not exists validacoes_pos_manutencao_os_id_idx on public.validacoes_pos_manutencao (os_id);
create index if not exists veiculos_tecnologia_idx on public.veiculos (tecnologia);

-- Uma política por ação: administração = insert/update/delete (a leitura continua na política "ler")
do $$ declare r record; begin
  for r in select * from (values ('configuracoes', 'configuracoes'), ('perfis', 'permissoes'), ('permissoes', 'permissoes'),
                                 ('permissoes_usuario', 'permissoes')) as t(tabela, modulo) loop
    execute format('drop policy if exists administrar on public.%I', r.tabela);
    execute format($p$create policy administrar_criar on public.%I for insert to authenticated with check ((select privado.pode(%L, 'administrar')))$p$, r.tabela, r.modulo);
    execute format($p$create policy administrar_editar on public.%I for update to authenticated using ((select privado.pode(%L, 'administrar'))) with check ((select privado.pode(%L, 'administrar')))$p$, r.tabela, r.modulo, r.modulo);
    execute format($p$create policy administrar_excluir on public.%I for delete to authenticated using ((select privado.pode(%L, 'administrar')))$p$, r.tabela, r.modulo);
  end loop;
end $$;

-- itens_solicitacao: a leitura do solicitante já está em "ler"; a edição própria vira insert/update/delete
drop policy if exists editar_propria on public.itens_solicitacao;
create policy criar_propria on public.itens_solicitacao for insert to authenticated
  with check (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id and s.solicitante_id = (select auth.uid()) and s.status = 'pendente')
              and quantidade_atendida = 0);
create policy editar_propria on public.itens_solicitacao for update to authenticated
  using (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id and s.solicitante_id = (select auth.uid()) and s.status = 'pendente'))
  with check (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id and s.solicitante_id = (select auth.uid()) and s.status = 'pendente')
              and quantidade_atendida = 0);
create policy excluir_propria on public.itens_solicitacao for delete to authenticated
  using (exists (select 1 from public.solicitacoes_material s where s.id = solicitacao_id and s.solicitante_id = (select auth.uid()) and s.status = 'pendente'));

-- usuarios: uma política de update (o próprio usuário ou quem edita usuários; perfil/ativo/e-mail protegidos pelo gatilho)
drop policy if exists editar_proprio on public.usuarios;
drop policy if exists editar on public.usuarios;
create policy editar on public.usuarios for update to authenticated
  using (id = (select auth.uid()) or (select privado.pode('usuarios', 'editar')))
  with check (id = (select auth.uid()) or (select privado.pode('usuarios', 'editar')));
