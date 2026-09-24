-- 009: medição antes e depois. O contrato proíbe estimar resultado para
-- preencher lacuna: todo valor guarda a origem ("medido", com período e
-- método, ou "informado", com quem informou). "antes" é o ponto de partida
-- (processo manual, levantado no Discovery); "depois" é uma medição manual
-- com a GreenIA (o painel também mostra as medições automáticas das execuções).

create table metric_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assistant_id uuid not null,
  indicator text not null check (indicator ~ '^[a-z0-9_]{1,60}$'),
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
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id) on delete cascade,
  check (origin <> 'medido' or (period_start is not null and period_end is not null and period_end >= period_start and coalesce(method, '') <> '')),
  check (origin <> 'informado' or coalesce(informed_by, '') <> '')
);
create index metric_values_assistant on metric_values (assistant_id, indicator, phase, created_at desc);

-- Decisão sobre a melhoria: manter, descartar ou ampliar (somente inclusão).
create table assistant_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assistant_id uuid not null,
  decision text not null check (decision in ('manter', 'descartar', 'ampliar')),
  decided_on date not null,
  responsible text not null,
  justification text not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id) on delete cascade
);
create index assistant_decisions_assistant on assistant_decisions (assistant_id, created_at desc);

alter table metric_values enable row level security;
alter table assistant_decisions enable row level security;
-- Visíveis para quem enxerga o assistente (tenant e área).
create policy tenant_assistant on metric_values
  using (tenant_id = app_tenant() and exists (select 1 from assistants a where a.id = assistant_id))
  with check (tenant_id = app_tenant());
create policy tenant_assistant on assistant_decisions
  using (tenant_id = app_tenant() and exists (select 1 from assistants a where a.id = assistant_id))
  with check (tenant_id = app_tenant());

-- Valores e decisões não se alteram: corrige-se registrando um novo.
grant select, insert on metric_values, assistant_decisions to greenia_app;
