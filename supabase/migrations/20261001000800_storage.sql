-- 8/8: bucket privado de fotos da manutenção (só imagens, até 10 MB) e políticas por pasta os/<os_id>/<atendimento_id>/...
-- Executa só no Supabase (o Postgres local de teste não tem o schema storage).
do $outer$ begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'schema storage ausente: bucket não criado (ambiente local)'; return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('manutencao', 'manutencao', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$create policy "manutencao_ler" on storage.objects for select to authenticated using (
    bucket_id = 'manutencao' and ((select privado.pode('os', 'visualizar')) or owner_id = (select auth.uid())::text))$p$;
  execute $p$create policy "manutencao_enviar" on storage.objects for insert to authenticated with check (
    bucket_id = 'manutencao' and (storage.foldername(name))[1] = 'os'
    and exists (select 1 from public.atendimentos a where a.id::text = (storage.foldername(name))[3] and a.os_id::text = (storage.foldername(name))[2]
                and a.tecnico_id = (select auth.uid()) and a.status in ('em_andamento', 'pausado')))$p$;
  execute $p$create policy "manutencao_excluir" on storage.objects for delete to authenticated using (
    bucket_id = 'manutencao' and owner_id = (select auth.uid())::text
    and exists (select 1 from public.atendimentos a where a.id::text = (storage.foldername(name))[3] and a.status in ('em_andamento', 'pausado')))$p$;
end $outer$;
