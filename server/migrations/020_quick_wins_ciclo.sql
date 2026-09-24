-- 020: ciclo completo de oportunidades e quick wins.
--   oportunidade  registrada → avaliada → selecionada | roadmap | arquivada
--                 (roadmap e arquivada sempre com motivo)
--   quick win     em implantação → em medição → decisão → encerrado; na
--                 implantação pode voltar ao portfólio (oportunidade no roadmap)
--   patrocinador  papel novo (no tenant ou numa área): seleciona oportunidades
--                 e registra a decisão final do quick win
--   execução      pertence a no máximo um quick win (runs.quick_win_id)
--   janelas       de ponto de partida e de medição, com datas e volume
-- E move a medição por assistente (migração 009) para quick wins.

-- Papel patrocinador.
alter table memberships drop constraint if exists memberships_role_check;
alter table memberships add constraint memberships_role_check
  check (role in ('usuario', 'revisor', 'key_user', 'patrocinador', 'admin_cliente', 'admin_theneil'));

-- Patrocinador do tenant todo enxerga oportunidades e quick wins de todas as
-- áreas (só eles: a base e as execuções das áreas continuam restritas).
create function app_qw_all() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.qw_all', true), 'off') = 'on' $$;
grant execute on function app_qw_all() to greenia_app;

-- Oportunidade.
alter table opportunities drop constraint if exists opportunities_status_check;
update opportunities set status = 'registrada' where status = 'identificada';
alter table opportunities alter column status set default 'registrada';
alter table opportunities add constraint opportunities_status_check
  check (status in ('registrada', 'avaliada', 'selecionada', 'roadmap', 'arquivada'));
alter table opportunities add column status_reason text;       -- motivo de roadmap ou arquivamento
alter table opportunities add column status_by uuid;
alter table opportunities add column status_at timestamptz;
alter table opportunities add constraint opportunities_reason_check
  check (status not in ('roadmap', 'arquivada') or coalesce(status_reason, '') <> '');

drop policy tenant_area on opportunities;
create policy tenant_area on opportunities
  using (tenant_id = app_tenant() and (app_qw_all() or app_can_see_area(area_id))) with check (tenant_id = app_tenant());

-- Quick win.
alter table quick_wins drop constraint if exists quick_wins_stage_check;
update quick_wins set stage = 'em_implantacao' where stage = 'selecionada';
alter table quick_wins alter column stage set default 'em_implantacao';
alter table quick_wins add constraint quick_wins_stage_check
  check (stage in ('em_implantacao', 'em_medicao', 'decisao', 'encerrada', 'roadmap'));
alter table quick_wins add column baseline_start date;
alter table quick_wins add column baseline_end date;
alter table quick_wins add column baseline_volume numeric;     -- itens do processo na janela do ponto de partida (informado)
alter table quick_wins add column measure_start date;
alter table quick_wins add column measure_end date;
alter table quick_wins add column measure_volume numeric;      -- informado; sem valor, vem das execuções vinculadas
alter table quick_wins add column volume_unit text not null default '';   -- o que é um item (documento, nota, guia...)
alter table quick_wins add column replaces_id uuid;            -- quick win que voltou ao roadmap e este substitui
alter table quick_wins add column resources_mode text check (resources_mode in ('compartilhados', 'duplicados'));   -- na ampliação
alter table quick_wins add column migrated_from_assistant uuid; -- medição por assistente trazida para cá (Fase 3)
alter table quick_wins add constraint quick_wins_replaces_fk foreign key (tenant_id, replaces_id) references quick_wins(tenant_id, id);
alter table quick_wins add constraint quick_wins_windows_check check (
  (baseline_end is null or baseline_start is null or baseline_end >= baseline_start)
  and (measure_end is null or measure_start is null or measure_end >= measure_start));

drop policy tenant_area on quick_wins;
create policy tenant_area on quick_wins
  using (tenant_id = app_tenant() and (app_qw_all() or exists (select 1 from quick_win_areas qa where qa.quick_win_id = quick_wins.id and app_can_see_area(qa.area_id))))
  with check (tenant_id = app_tenant());

-- Unidade de comparação do indicador: o valor como está (já é uma taxa, ex.
-- minutos por nota), por mês (total dividido pelos meses da janela) ou por item
-- (total dividido pelo volume da janela).
alter table quick_win_indicators add column comparison text not null default 'valor'
  check (comparison in ('valor', 'por_mes', 'por_item'));
grant update on quick_wins to greenia_app;

create or replace function quick_wins_active_count() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from quick_wins where tenant_id = app_tenant() and stage not in ('encerrada', 'roadmap')
$$;

-- Execução: no máximo um quick win.
alter table runs add column quick_win_id uuid;
alter table runs add constraint runs_quick_win_fk foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete set null (quick_win_id);
create index runs_quick_win on runs (quick_win_id, created_at) where quick_win_id is not null;

-- Números das execuções de um quick win (sem conteúdo), para quem enxerga o
-- quick win, inclusive execuções de áreas que a pessoa não enxerga.
create function quick_win_runs(p_qw uuid, p_de date, p_ate date)
returns table (user_id uuid, status text, assistant_version int, processing_ms int, finished_at timestamptz, reviewed_at timestamptz,
               divergences int, pendings int, cost_brl numeric, pages int, input_tokens int, output_tokens int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not exists (select 1 from quick_wins q where q.id = p_qw and q.tenant_id = app_tenant()
                 and (app_qw_all() or exists (select 1 from quick_win_areas qa where qa.quick_win_id = q.id and app_can_see_area(qa.area_id)))) then
    return;
  end if;
  return query
    select r.user_id, r.status, r.assistant_version, r.processing_ms, r.finished_at, r.reviewed_at, r.divergences, r.pendings,
           r.cost_brl, r.pages, r.input_tokens, r.output_tokens, r.created_at
    from runs r where r.quick_win_id = p_qw and r.tenant_id = app_tenant()
      and r.created_at >= p_de and r.created_at < p_ate + 1;
end $$;
grant execute on function quick_win_runs(uuid, date, date) to greenia_app;

-- Medição por assistente (tabelas da migração 009) vira quick win: uma
-- oportunidade selecionada e um quick win por assistente com valores ou
-- decisões, com os indicadores da definição, os valores com origem, a última
-- decisão e as execuções do assistente. Roda uma vez por assistente.
create function migrate_assistant_metrics() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a record; ind jsonb; opp uuid; qw uuid; area uuid; actor uuid; dec record; n integer := 0; pos integer;
begin
  for a in
    select s.id, s.tenant_id, s.name, s.area_id, s.current_version from assistants s
    where (exists (select 1 from metric_values m where m.assistant_id = s.id) or exists (select 1 from assistant_decisions d where d.assistant_id = s.id))
      and not exists (select 1 from quick_wins q where q.migrated_from_assistant = s.id)
  loop
    area := coalesce(a.area_id, (select id from areas where tenant_id = a.tenant_id order by position, name limit 1));
    if area is null then continue; end if;                     -- tenant sem nenhuma área: fica para depois
    actor := coalesce((select recorded_by from metric_values where assistant_id = a.id order by created_at limit 1),
                      (select recorded_by from assistant_decisions where assistant_id = a.id order by created_at limit 1));
    select * into dec from assistant_decisions where assistant_id = a.id order by created_at desc limit 1;
    opp := gen_random_uuid();
    insert into opportunities (id, tenant_id, area_id, title, process, problem, evidence, status, created_by, status_by, status_at)
    values (opp, a.tenant_id, area, 'Medição do assistente ' || a.name, a.name,
            'Trazido da medição por assistente (Fase 3), sem avaliação por critérios.',
            case when exists (select 1 from metric_values where assistant_id = a.id and phase = 'antes' and origin = 'medido') then 'comprovado' else 'hipotese' end,
            'selecionada', actor, actor, now());
    qw := gen_random_uuid();
    insert into quick_wins (id, tenant_id, opportunity_id, title, objective, owner_email, stage, decision, decision_note, decided_by, decided_at, created_by, migrated_from_assistant)
    values (qw, a.tenant_id, opp, 'Medição do assistente ' || a.name, 'Medição trazida do assistente, antes dos quick wins.',
            coalesce((select email from users where id = actor), ''),
            case when dec.id is not null then 'decisao' else 'em_medicao' end,
            dec.decision, case when dec.id is not null then dec.justification || ' (responsável: ' || dec.responsible || ', ' || dec.decided_on || ')' end,
            dec.recorded_by, dec.created_at, actor, a.id);
    insert into quick_win_areas (tenant_id, quick_win_id, area_id) values (a.tenant_id, qw, area);
    insert into quick_win_resources (tenant_id, quick_win_id, assistant_id) values (a.tenant_id, qw, a.id);
    pos := 0;
    for ind in select jsonb_array_elements(coalesce((select definition->'metrics'->'indicators' from assistant_versions
                                                     where assistant_id = a.id and version = a.current_version), '[]'::jsonb)) loop
      if coalesce(ind->>'key', '') ~ '^[a-z0-9_]{1,60}$' then
        insert into quick_win_indicators (tenant_id, quick_win_id, key, label, unit, direction, auto, position)
        values (a.tenant_id, qw, ind->>'key', coalesce(ind->>'label', ind->>'key'), coalesce(ind->>'unit', ''),
                case when ind->>'direction' = 'maior_melhor' then 'maior_melhor' else 'menor_melhor' end, ind->>'auto', pos)
        on conflict do nothing;
        pos := pos + 1;
      end if;
    end loop;
    -- Indicador com valor e sem definição: entra com o nome da chave.
    insert into quick_win_indicators (tenant_id, quick_win_id, key, label, unit, position)
    select distinct a.tenant_id, qw, m.indicator, m.indicator, m.unit, 100 from metric_values m
    where m.assistant_id = a.id and not exists (select 1 from quick_win_indicators i where i.quick_win_id = qw and i.key = m.indicator)
    on conflict do nothing;
    insert into quick_win_values (tenant_id, quick_win_id, indicator, phase, value, unit, origin, period_start, period_end, method, informed_by, notes, recorded_by, created_at)
    select a.tenant_id, qw, indicator, phase, value, unit, origin, period_start, period_end, method, informed_by, notes, recorded_by, created_at
    from metric_values where assistant_id = a.id;
    update runs set quick_win_id = qw where assistant_id = a.id and quick_win_id is null;
    insert into quick_win_events (tenant_id, opportunity_id, quick_win_id, actor, stage_from, stage_to, note)
    values (a.tenant_id, opp, null, 'migração', null, 'selecionada', 'Trazida da medição por assistente (Fase 3).'),
           (a.tenant_id, null, qw, 'migração', null, case when dec.id is not null then 'decisao' else 'em_medicao' end,
            'Medição do assistente trazida para o quick win: indicadores, valores com origem, decisão e execuções.');
    insert into audit_log (tenant_id, action, target, details)
    values (a.tenant_id, 'medicao_migrada_para_quick_win', 'quick_win:' || qw, jsonb_build_object('assistente', a.name, 'quickWin', qw));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function migrate_assistant_metrics() from public;

select migrate_assistant_metrics();

-- Recursos de um quick win para quem o enxerga: nomes, área dona e, do
-- assistente, a definição (para duplicar na ampliação). Documento: só o título
-- e a área; o conteúdo continua restrito a quem enxerga o documento.
create function quick_win_resource_info(p_qw uuid)
returns table (assistant_id uuid, document_id uuid, assistant_slug text, assistant_name text, assistant_status text, assistant_definition jsonb,
               template_slug text, template_version int, document_title text, area_id uuid, company_wide boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not exists (select 1 from quick_wins q where q.id = p_qw and q.tenant_id = app_tenant()
                 and (app_qw_all() or exists (select 1 from quick_win_areas qa where qa.quick_win_id = q.id and app_can_see_area(qa.area_id)))) then
    return;
  end if;
  return query
    select r.assistant_id, r.document_id, s.slug, s.name, s.status, v.definition, s.template_slug, s.template_version, d.title,
           coalesce(s.area_id, d.area_id), coalesce(s.company_wide, d.company_wide)
    from quick_win_resources r
    left join assistants s on s.id = r.assistant_id
    left join assistant_versions v on v.assistant_id = s.id and v.version = s.current_version
    left join kb_documents d on d.id = r.document_id
    where r.quick_win_id = p_qw and r.tenant_id = app_tenant()
    order by s.slug nulls last, d.title;
end $$;
grant execute on function quick_win_resource_info(uuid) to greenia_app;

-- Vincular recursos ao quick win: quem seleciona (patrocinador do tenant, por
-- exemplo) pode não enxergar a área dona. A busca devolve só os ids, no tenant.
create function quick_win_lookup_resources(p_slugs text[], p_docs uuid[])
returns table (kind text, id uuid, ref text)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'assistente', a.id, a.slug from assistants a where a.tenant_id = app_tenant() and a.slug = any(p_slugs)
  union all
  select 'documento', d.id, d.id::text from kb_documents d where d.tenant_id = app_tenant() and d.id = any(p_docs)
$$;
grant execute on function quick_win_lookup_resources(text[], uuid[]) to greenia_app;
