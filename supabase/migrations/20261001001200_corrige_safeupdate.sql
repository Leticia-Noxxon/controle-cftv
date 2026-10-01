-- Supabase ativa pg_safeupdate para os papéis da API: DELETE/UPDATE sem WHERE falham
-- ("DELETE requires a WHERE clause"). reivindicar_admin tinha dois comandos sem WHERE.
-- Recria a função com WHERE explícito (a tabela tem uma única linha, id = true).
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
    update privado.bootstrap_admin set tentativas = tentativas + 1 where id = b.id;
    return 'codigo_invalido';
  end if;
  perform set_config('app.rpc', 'on', true);
  update public.usuarios set perfil_id = (select id from public.perfis where codigo = 'administrador'), ativo = true where id = v_uid;
  delete from privado.bootstrap_admin where id = b.id;
  return 'ok';
end $$;
