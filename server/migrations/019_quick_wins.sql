-- 019: quick wins como objeto próprio, separado do assistente.
-- Um quick win é uma melhoria num processo de uma área (ou de várias). Nasce
-- de uma oportunidade avaliada por critérios do tenant e pode usar um ou mais
-- assistentes e documentos da base. A medição (ponto de partida, depois e
-- decisão) é do processo, não da ferramenta. As tabelas metric_values e
-- assistant_decisions (medição por assistente, migração 009) deixam de ser
-- usadas; ficam no banco até a confirmação de que podem ser removidas.

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  area_id uuid not null,
  title text not null,
  process text not null,                       -- processo afetado
  problem text not null,                       -- problema observado
  current_executor text not null default '',   -- quem executa hoje
  volume text not null default '',             -- volume (texto livre: "300 notas por mês")
  evidence text not null check (evidence in ('comprovado', 'hipotese')),
  evidence_note text not null default '',
  status text not null default 'identificada' check (status in ('identificada', 'avaliada', 'selecionada')),
  scores jsonb,                                -- nota por critério
  score numeric,                               -- nota ponderada (0 a 100)
  criteria_snapshot jsonb,                     -- critérios, pesos e escala usados na avaliação
  evaluated_by uuid,
  evaluated_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, area_id) references areas(tenant_id, id)
);

create table quick_wins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  opportunity_id uuid,
  origin_id uuid,                              -- quick win de origem (ampliação)
  title text not null,
  objective text not null,
  owner_email text not null,                   -- responsável
  deadline date,
  stage text not null default 'selecionada' check (stage in ('selecionada', 'em_implantacao', 'em_medicao', 'decisao', 'encerrada')),
  decision text check (decision in ('manter', 'descartar', 'ampliar')),
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, opportunity_id) references opportunities(tenant_id, id),
  foreign key (tenant_id, origin_id) references quick_wins(tenant_id, id)
);

create table quick_win_areas (
  tenant_id uuid not null references tenants(id) on delete cascade,
  quick_win_id uuid not null,
  area_id uuid not null,
  primary key (quick_win_id, area_id),
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade,
  foreign key (tenant_id, area_id) references areas(tenant_id, id)
);

create table quick_win_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quick_win_id uuid not null,
  assistant_id uuid,
  document_id uuid,
  check ((assistant_id is null) <> (document_id is null)),
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade,
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id),
  foreign key (tenant_id, document_id) references kb_documents(tenant_id, id)
);

create table quick_win_reviewers (
  tenant_id uuid not null references tenants(id) on delete cascade,
  quick_win_id uuid not null,
  user_id uuid not null,
  primary key (quick_win_id, user_id),
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references users(tenant_id, id)
);

-- Indicadores do processo, escolhidos pelo cliente. "auto" liga o indicador a
-- uma medição automática das execuções dos assistentes vinculados.
create table quick_win_indicators (
  tenant_id uuid not null references tenants(id) on delete cascade,
  quick_win_id uuid not null,
  key text not null check (key ~ '^[a-z0-9_]{1,60}$'),
  label text not null,
  unit text not null default '',
  direction text not null default 'menor_melhor' check (direction in ('menor_melhor', 'maior_melhor')),
  auto text,
  position integer not null default 0,
  primary key (quick_win_id, key),
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade
);

-- Valores com origem (medido: período e método; informado: quem informou).
create table quick_win_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quick_win_id uuid not null,
  indicator text not null,
  phase text not null check (phase in ('antes', 'depois')),
  value numeric not null,
  unit text not null default '',
  origin text not null check (origin in ('medido', 'informado')),
  period_start date,
  period_end date,
  method text,
  informed_by text,
  notes text,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade,
  check (origin <> 'medido' or (period_start is not null and period_end is not null and period_end >= period_start and coalesce(method, '') <> '')),
  check (origin <> 'informado' or coalesce(informed_by, '') <> '')
);
create index quick_win_values_qw on quick_win_values (quick_win_id, indicator, phase, created_at desc);

-- Histórico de etapas (oportunidade e quick win), com quem decidiu e por quê.
create table quick_win_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  opportunity_id uuid,
  quick_win_id uuid,
  at timestamptz not null default now(),
  actor text not null,
  stage_from text,
  stage_to text not null,
  note text not null,
  foreign key (tenant_id, opportunity_id) references opportunities(tenant_id, id) on delete cascade,
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade
);

alter table opportunities enable row level security;
alter table quick_wins enable row level security;
alter table quick_win_areas enable row level security;
alter table quick_win_resources enable row level security;
alter table quick_win_reviewers enable row level security;
alter table quick_win_indicators enable row level security;
alter table quick_win_values enable row level security;
alter table quick_win_events enable row level security;
-- Oportunidade: quem enxerga a área. Quick win: quem enxerga alguma das áreas dele.
create policy tenant_area on opportunities using (tenant_id = app_tenant() and app_can_see_area(area_id)) with check (tenant_id = app_tenant());
create policy tenant_isolation on quick_win_areas using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_area on quick_wins
  using (tenant_id = app_tenant() and exists (select 1 from quick_win_areas qa where qa.quick_win_id = quick_wins.id and app_can_see_area(qa.area_id)))
  with check (tenant_id = app_tenant());
do $$
declare t text;
begin
  foreach t in array array['quick_win_resources', 'quick_win_reviewers', 'quick_win_indicators', 'quick_win_values'] loop
    execute format('create policy tenant_qw on %I using (tenant_id = app_tenant() and exists (select 1 from quick_wins q where q.id = quick_win_id)) with check (tenant_id = app_tenant())', t);
  end loop;
end $$;
create policy tenant_qw on quick_win_events
  using (tenant_id = app_tenant() and (exists (select 1 from quick_wins q where q.id = quick_win_id) or exists (select 1 from opportunities o where o.id = opportunity_id)))
  with check (tenant_id = app_tenant());

grant select, insert, update on opportunities, quick_wins to greenia_app;
grant select, insert, delete on quick_win_areas, quick_win_resources, quick_win_reviewers, quick_win_indicators to greenia_app;
grant select, insert on quick_win_values, quick_win_events to greenia_app;
grant usage on sequence quick_win_events_id_seq to greenia_app;

-- Critérios de avaliação: o admin do cliente altera pela função da migração 017.
create or replace function tenant_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_key not in ('detectors', 'readers', 'dataPolicy', 'qwCriteria') then raise exception 'chave de configuração não permitida: %', p_key; end if;
  if app_tenant() is null then raise exception 'sem tenant na sessão'; end if;
  update tenants set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = app_tenant();
end $$;

-- Cota do plano: conta todos os quick wins em andamento do tenant, inclusive
-- os de áreas que quem cria não enxerga.
create function quick_wins_active_count() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from quick_wins where tenant_id = app_tenant() and stage <> 'encerrada'
$$;
grant execute on function quick_wins_active_count() to greenia_app;

-- Trajetória: título e áreas dos quick wins de origem e das ampliações, mesmo
-- de áreas que quem consulta não enxerga (só título e nomes das áreas, nada
-- mais), e só para um quick win que a pessoa enxerga.
create function quick_win_lineage(p_id uuid)
returns table (id uuid, title text, areas text, direcao text, nivel integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not exists (select 1 from quick_wins q where q.id = p_id and q.tenant_id = app_tenant()
                 and exists (select 1 from quick_win_areas qa where qa.quick_win_id = q.id and app_can_see_area(qa.area_id))) then
    return;
  end if;
  return query
    with recursive up as (
      select q.id, q.title, q.origin_id, 1 as n from quick_wins q where q.id = (select origin_id from quick_wins where id = p_id) and q.tenant_id = app_tenant()
      union all
      select q.id, q.title, q.origin_id, up.n + 1 from quick_wins q join up on q.id = up.origin_id where up.n < 20
    ), down as (
      select q.id, q.title, 1 as n from quick_wins q where q.origin_id = p_id and q.tenant_id = app_tenant()
      union all
      select q.id, q.title, down.n + 1 from quick_wins q join down on q.origin_id = down.id where down.n < 20
    )
    select x.id, x.title, (select string_agg(a.name, ', ' order by a.name) from quick_win_areas qa join areas a on a.id = qa.area_id where qa.quick_win_id = x.id), x.direcao, x.n
    from (select up.id, up.title, 'origem'::text as direcao, up.n from up union all select down.id, down.title, 'ampliacao', down.n from down) x;
end $$;
grant execute on function quick_win_lineage(uuid) to greenia_app;
