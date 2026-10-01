-- 6/8: validação pós-manutenção, auditoria imutável, envio do formulário, OS automática, indicadores, fila offline.
create table public.validacoes_pos_manutencao (
  id integer generated always as identity primary key,
  os_id integer not null references public.ordens_servico(id) on delete cascade,
  atendimento_id integer not null unique references public.atendimentos(id) on delete cascade,
  resultado public.resultado_validacao not null default 'pendente',
  janela_dias smallint not null default 7,
  detalhes jsonb not null default '{}'::jsonb,
  avaliado_em timestamptz,
  avaliado_por uuid references public.usuarios(id),       -- null = avaliação automática
  criado_em timestamptz not null default now()
);
create index on public.validacoes_pos_manutencao (resultado);

-- ===== Auditoria imutável =====
create table public.logs_auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);
create index on public.logs_auditoria (tabela, registro_id);
create index on public.logs_auditoria (criado_em desc);
create index on public.logs_auditoria (usuario_id);

create or replace function privado.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_antes jsonb; v_depois jsonb;
begin
  -- carga inicial em massa (seed/pipeline com chave de serviço) não gera log linha a linha
  if current_setting('app.sem_auditoria', true) = 'on' and (select auth.uid()) is null then return null; end if;
  v_antes := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  if tg_table_name = 'respostas_manutencao' then   -- rascunho é grande e muda a cada autosave: guarda só a versão
    v_antes := v_antes - 'rascunho'; v_depois := v_depois - 'rascunho';
    if tg_op = 'UPDATE' and v_antes - 'versao' - 'atualizado_em' = v_depois - 'versao' - 'atualizado_em' then return null; end if;
  end if;
  insert into public.logs_auditoria (tabela, registro_id, operacao, usuario_id, dados_antes, dados_depois)
  values (tg_table_name, coalesce(v_depois ->> 'id', v_antes ->> 'id', v_depois ->> 'chave', v_antes ->> 'chave'), tg_op, (select auth.uid()), v_antes, v_depois);
  return null;
end $$;

create or replace function privado.bloquear_alteracao() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Registro imutável (%).', tg_table_name using errcode = '42501'; end $$;
create trigger logs_imutavel before update or delete or truncate on public.logs_auditoria for each statement execute function privado.bloquear_alteracao();
create trigger movimentacoes_imutavel before update or delete or truncate on public.movimentacoes_estoque for each statement execute function privado.bloquear_alteracao();
create trigger historico_imutavel before update or delete or truncate on public.historico_status_os for each statement execute function privado.bloquear_alteracao();

do $$ declare t text; begin
  foreach t in array array['usuarios', 'perfis', 'permissoes', 'permissoes_usuario', 'convites', 'empresas', 'garagens', 'veiculos', 'equipamentos',
    'cameras', 'ordens_servico', 'atendimentos', 'pausas_atendimento', 'respostas_manutencao', 'acoes_realizadas', 'problemas_detectados', 'imagens',
    'materiais', 'estoque', 'solicitacoes_material', 'itens_solicitacao', 'validacoes_pos_manutencao', 'configuracoes',
    'catalogo_problemas', 'catalogo_acoes', 'motivos_pausa'] loop
    execute format('create trigger auditoria after insert or update or delete on public.%I for each row execute function privado.auditar()', t);
  end loop;
end $$;

-- ===== Envio do formulário nativo =====
-- p_dados: {"garagem_id","tecnologia","id_equipamento","qtd_camera","qtd_cartao","qtd_switch","observacoes",
--           "cameras": {"21": {"problemas": [ids], "acoes": [ids]}, ...}}
-- Regras do Jotform + regras novas: foto da frente obrigatória; cada câmera da tecnologia com ≥1 problema e ≥1 ação;
-- opções exclusivas ("Nenhuma anomalia"/"Nenhuma ação") não combinam; câmera com problema exige foto; troca de switch exige fotos antes/depois.
create or replace function public.enviar_formulario(p_atendimento_id integer, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.atendimentos%rowtype; r public.respostas_manutencao%rowtype; v_tec text; v_pos smallint; v_cam jsonb;
        v_prob smallint[]; v_acao smallint[]; v_mat record; v_erros text[] := '{}'; v_qtd smallint; v_gar smallint;
begin
  a := privado.meu_atendimento(p_atendimento_id);
  if a.status not in ('em_andamento', 'pausado') then raise exception 'Atendimento encerrado.' using errcode = 'P0409'; end if;
  select * into r from public.respostas_manutencao where atendimento_id = a.id for update;
  if r.enviado then raise exception 'Formulário já enviado.' using errcode = 'P0409'; end if;
  v_tec := coalesce(p_dados ->> 'tecnologia', r.tecnologia);
  if v_tec is null or not exists (select 1 from public.tecnologias where codigo = v_tec) then v_erros := v_erros || 'Tecnologia'::text; end if;
  if coalesce(btrim(p_dados ->> 'id_equipamento'), '') = '' then v_erros := v_erros || 'ID do equipamento'::text; end if;
  v_gar := coalesce((p_dados ->> 'garagem_id')::smallint, r.garagem_id);
  if v_gar is null then v_erros := v_erros || 'Garagem'::text; end if;
  if not exists (select 1 from public.imagens i where i.atendimento_id = a.id and i.campo = 'frente_onibus') then
    v_erros := v_erros || 'Imagem da frente do ônibus'::text;
  end if;
  if array_length(v_erros, 1) > 0 then raise exception 'Campos obrigatórios: %', array_to_string(v_erros, ', ') using errcode = '23502'; end if;

  delete from public.problemas_detectados where resposta_id = r.id;
  delete from public.acoes_realizadas where resposta_id = r.id;
  foreach v_pos in array (select posicoes from public.tecnologias where codigo = v_tec) loop
    v_cam := p_dados -> 'cameras' -> v_pos::text;
    v_prob := array(select (jsonb_array_elements_text(coalesce(v_cam -> 'problemas', '[]'::jsonb)))::smallint);
    v_acao := array(select (jsonb_array_elements_text(coalesce(v_cam -> 'acoes', '[]'::jsonb)))::smallint);
    if cardinality(v_prob) = 0 or cardinality(v_acao) = 0 then v_erros := v_erros || ('Câmera ' || v_pos || ': problema e ação'); continue; end if;
    if cardinality(v_prob) > 1 and exists (select 1 from public.catalogo_problemas where id = any(v_prob) and exclusivo) then
      v_erros := v_erros || ('Câmera ' || v_pos || ': "Nenhuma anomalia" não combina com outros problemas'); end if;
    if cardinality(v_acao) > 1 and exists (select 1 from public.catalogo_acoes where id = any(v_acao) and exclusivo) then
      v_erros := v_erros || ('Câmera ' || v_pos || ': "Nenhuma ação" não combina com outras ações'); end if;
    if exists (select 1 from public.catalogo_problemas where id = any(v_prob) and not exclusivo)
       and not exists (select 1 from public.imagens i where i.atendimento_id = a.id and i.campo = 'camera' and i.posicao = v_pos) then
      v_erros := v_erros || ('Câmera ' || v_pos || ': foto'); end if;
    insert into public.problemas_detectados (os_id, resposta_id, posicao, origem, problema_id)
    select a.os_id, r.id, v_pos, 'tecnico', x from unnest(v_prob) x;
    insert into public.acoes_realizadas (resposta_id, posicao, acao_id) select r.id, v_pos, x from unnest(v_acao) x;
  end loop;
  if exists (select 1 from public.acoes_realizadas ar join public.catalogo_acoes c on c.id = ar.acao_id
             where ar.resposta_id = r.id and c.material_codigo = 'SWITCH')
     and not (exists (select 1 from public.imagens where atendimento_id = a.id and campo = 'switch_antes')
              and exists (select 1 from public.imagens where atendimento_id = a.id and campo = 'switch_depois')) then
    v_erros := v_erros || 'Fotos do switch antes e depois da substituição'::text;
  end if;
  if array_length(v_erros, 1) > 0 then raise exception 'Revise: %', array_to_string(v_erros, '; ') using errcode = '23502'; end if;

  update public.respostas_manutencao set garagem_id = v_gar, tecnologia = v_tec, id_equipamento = btrim(p_dados ->> 'id_equipamento'),
    qtd_camera = coalesce((p_dados ->> 'qtd_camera')::smallint, 0), qtd_cartao = coalesce((p_dados ->> 'qtd_cartao')::smallint, 0),
    qtd_switch = coalesce((p_dados ->> 'qtd_switch')::smallint, 0), observacoes = nullif(btrim(p_dados ->> 'observacoes'), ''),
    rascunho = p_dados, enviado = true, enviado_em = now()
  where id = r.id;
  -- Materiais usados -> saída do estoque da garagem
  for v_mat in select * from (values ('CAMERA', 'qtd_camera'), ('CARTAO_SD', 'qtd_cartao'), ('SWITCH', 'qtd_switch')) as t(codigo, campo) loop
    v_qtd := coalesce((p_dados ->> v_mat.campo)::smallint, 0);
    if v_qtd > 0 then
      perform privado.movimentar((select id from public.materiais where codigo = v_mat.codigo), v_gar, 'saida', v_qtd,
                                 'Atendimento #' || a.id, a.id);
    end if;
  end loop;
end $$;

-- ===== OS automática a partir do monitoramento =====
-- Para cada veículo com câmera em falha (fa/off/sd) no dia p_data e sem OS aberta: cria OS com prioridade
-- Alta (100% offline ou 7+ dias), Média (3–6 dias) ou Baixa (< 3 dias) — mesma regra da exportação de OS atual.
create or replace function public.gerar_os_monitoramento(p_data date default (now() at time zone 'America/Sao_Paulo')::date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if (select auth.uid()) is not null and not privado.tem_permissao('os', 'criar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform set_config('app.rpc', 'on', true);
  with falha as (
    select m.veiculo_id, m.posicao, m.status,
           (select count(*) from public.monitoramento_diario x where x.veiculo_id = m.veiculo_id and x.posicao = m.posicao
              and x.data between p_data - 30 and p_data and x.status in ('fa', 'off', 'sd')
              and not exists (select 1 from public.monitoramento_diario y where y.veiculo_id = x.veiculo_id and y.posicao = x.posicao
                              and y.data > x.data and y.data <= p_data and y.status = 'on')) as dias
    from public.monitoramento_diario m where m.data = p_data and m.status in ('fa', 'off', 'sd')
  ), por_veiculo as (
    select veiculo_id, array_agg(posicao order by posicao) as cams, max(dias)::smallint as dias, bool_or(status = 'off') as tem_off
    from falha group by veiculo_id
  ), novas as (
    insert into public.ordens_servico (veiculo_id, garagem_id, origem, prioridade, cameras, dias_problema, chave_monitoramento, descricao)
    select p.veiculo_id, v.garagem_id, 'monitoramento',
           case when p.tem_off or p.dias >= 7 then 'alta'::public.prioridade_os when p.dias >= 3 then 'media'::public.prioridade_os else 'baixa'::public.prioridade_os end,
           p.cams, p.dias, p.veiculo_id || ':' || (p_data - (p.dias - 1)), 'Gerada pelo monitoramento em ' || to_char(p_data, 'DD/MM/YYYY')
    from por_veiculo p join public.veiculos v on v.id = p.veiculo_id
    where not exists (select 1 from public.ordens_servico o where o.veiculo_id = p.veiculo_id
                      and o.status in ('aguardando_manutencao', 'em_atendimento', 'pausada', 'aguardando_material'))
    on conflict do nothing
    returning id, veiculo_id, cameras
  )
  insert into public.problemas_detectados (os_id, posicao, origem, status_monitoramento)
  select n.id, f.posicao, 'monitoramento', f.status from novas n join falha f on f.veiculo_id = n.veiculo_id;
  get diagnostics v_n = row_count;
  perform set_config('app.rpc', 'off', true);
  return v_n;
end $$;

-- ===== Validação pós-manutenção =====
-- Após a janela de verificação (configuracoes.janela_validacao_dias, padrão 2), compara as câmeras da OS no monitoramento:
-- todas 'on' nos dias seguintes -> Resolvido; alguma em falha -> Não resolvido. Resolvidas que voltam a falhar dentro da
-- janela de reincidência (padrão 7 dias) -> Reincidente.
create or replace function public.avaliar_validacoes() returns integer
language plpgsql security definer set search_path = '' as $$
declare v record; v_dias smallint := coalesce((select (valor #>> '{}')::smallint from public.configuracoes where chave = 'janela_validacao_dias'), 2);
        v_res public.resultado_validacao; v_falhas integer; v_dias_ok integer; v_n integer := 0; v_fim date;
begin
  if (select auth.uid()) is not null and not privado.tem_permissao('validacoes', 'editar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  perform set_config('app.rpc', 'on', true);
  for v in select vp.*, a.finalizado_em, o.veiculo_id, o.cameras, o.status as status_os from public.validacoes_pos_manutencao vp
           join public.atendimentos a on a.id = vp.atendimento_id join public.ordens_servico o on o.id = vp.os_id
           where vp.resultado in ('pendente', 'resolvido') loop
    v_fim := (v.finalizado_em at time zone 'America/Sao_Paulo')::date;
    select count(*) filter (where m.status in ('fa', 'off', 'sd')), count(distinct m.data) filter (where m.status = 'on')
      into v_falhas, v_dias_ok
    from public.monitoramento_diario m
    where m.veiculo_id = v.veiculo_id and (cardinality(v.cameras) = 0 or m.posicao = any(v.cameras))
      and m.data > v_fim and m.data <= v_fim + case when v.resultado = 'pendente' then v_dias else v.janela_dias end;
    if v.resultado = 'pendente' then
      if v_falhas > 0 then v_res := 'nao_resolvido';
      elsif v_dias_ok >= v_dias then v_res := 'resolvido';
      else continue; end if;
    else
      if v_falhas = 0 then continue; end if;
      v_res := 'reincidente';
    end if;
    update public.validacoes_pos_manutencao set resultado = v_res, avaliado_em = now(),
      detalhes = jsonb_build_object('falhas', v_falhas, 'dias_ok', v_dias_ok) where id = v.id;
    update public.ordens_servico set status = case v_res when 'resolvido' then 'resolvida' when 'nao_resolvido' then 'nao_resolvida' else 'reincidente' end::public.status_os
    where id = v.os_id;
    v_n := v_n + 1;
  end loop;
  perform set_config('app.rpc', 'off', true);
  return v_n;
end $$;

-- ===== Indicadores (calculados no banco) =====
create or replace function public.indicadores_os(p_de date, p_ate date, p_garagem_id smallint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not privado.tem_permissao('indicadores', 'visualizar') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'por_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.ordens_servico
                   where (p_garagem_id is null or garagem_id = p_garagem_id) group by status) s),
    'abertas_por_prioridade', (select coalesce(jsonb_object_agg(prioridade, n), '{}') from (select prioridade, count(*) n from public.ordens_servico
                   where status in ('aguardando_manutencao', 'em_atendimento', 'pausada', 'aguardando_material') and (p_garagem_id is null or garagem_id = p_garagem_id) group by prioridade) s),
    'atendimentos', (select jsonb_build_object('concluidos', count(*), 'tempo_efetivo_medio_min', round(avg(t.segundos_efetivos) / 60.0, 1),
                   'tempo_pausado_medio_min', round(avg(t.segundos_pausados) / 60.0, 1))
                   from public.vw_tempos_atendimento t join public.ordens_servico o on o.id = t.os_id
                   where t.status = 'concluido' and t.finalizado_em >= p_de and t.finalizado_em < p_ate + 1 and (p_garagem_id is null or o.garagem_id = p_garagem_id)),
    'validacoes', (select coalesce(jsonb_object_agg(resultado, n), '{}') from (select vp.resultado, count(*) n from public.validacoes_pos_manutencao vp
                   join public.ordens_servico o on o.id = vp.os_id where vp.criado_em >= p_de and vp.criado_em < p_ate + 1
                   and (p_garagem_id is null or o.garagem_id = p_garagem_id) group by vp.resultado) s)
  ) into r;
  return r;
end $$;

-- Meu Desempenho: só os números do próprio técnico (sem ranking)
create or replace function public.meu_desempenho(p_de date, p_ate date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'atendimentos', count(*) filter (where t.status = 'concluido'),
    'tempo_efetivo_medio_min', round(avg(t.segundos_efetivos) filter (where t.status = 'concluido') / 60.0, 1),
    'tempo_pausado_total_min', round(sum(t.segundos_pausados) / 60.0, 1),
    'resolvidos', (select count(*) from public.validacoes_pos_manutencao vp join public.atendimentos a on a.id = vp.atendimento_id
                   where a.tecnico_id = (select auth.uid()) and vp.resultado = 'resolvido' and a.finalizado_em >= p_de and a.finalizado_em < p_ate + 1),
    'nao_resolvidos', (select count(*) from public.validacoes_pos_manutencao vp join public.atendimentos a on a.id = vp.atendimento_id
                   where a.tecnico_id = (select auth.uid()) and vp.resultado = 'nao_resolvido' and a.finalizado_em >= p_de and a.finalizado_em < p_ate + 1),
    'reincidentes', (select count(*) from public.validacoes_pos_manutencao vp join public.atendimentos a on a.id = vp.atendimento_id
                   where a.tecnico_id = (select auth.uid()) and vp.resultado = 'reincidente' and a.finalizado_em >= p_de and a.finalizado_em < p_ate + 1))
  from public.vw_tempos_atendimento t
  where t.tecnico_id = (select auth.uid()) and t.iniciado_em >= p_de and t.iniciado_em < p_ate + 1
$$;

-- Linha do tempo do veículo (OS, atendimentos, status)
create view public.vw_linha_tempo_veiculo with (security_invoker = true) as
select o.veiculo_id, o.id as os_id, o.numero, 'os_criada'::text as evento, o.criado_em as quando, null::uuid as usuario_id, o.status::text as detalhe
from public.ordens_servico o
union all
select o.veiculo_id, h.os_id, o.numero, 'status', h.criado_em, h.usuario_id, coalesce(h.status_anterior::text, '—') || ' → ' || h.status_novo::text
from public.historico_status_os h join public.ordens_servico o on o.id = h.os_id
union all
select o.veiculo_id, a.os_id, o.numero, 'atendimento_' || a.status::text, coalesce(a.finalizado_em, a.iniciado_em), a.tecnico_id, null
from public.atendimentos a join public.ordens_servico o on o.id = a.os_id;

-- ===== Fila offline: idempotência das operações reenviadas =====
create table public.operacoes_sync (
  id uuid primary key,                         -- gerado no aparelho
  usuario_id uuid not null default auth.uid() references public.usuarios(id),
  tipo text not null,
  recebido_em timestamptz not null default now(),
  resultado jsonb
);
create index on public.operacoes_sync (usuario_id, recebido_em desc);
