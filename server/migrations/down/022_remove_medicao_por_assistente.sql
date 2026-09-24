-- Volta da 022: recria as tabelas da medição por assistente (migração 009),
-- vazias, com as mesmas políticas. Os dados continuam nos quick wins; para
-- restaurar o conteúdo antigo, use o backup anterior à 022.
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
create policy tenant_assistant on metric_values
  using (tenant_id = app_tenant() and exists (select 1 from assistants a where a.id = assistant_id))
  with check (tenant_id = app_tenant());
create policy tenant_assistant on assistant_decisions
  using (tenant_id = app_tenant() and exists (select 1 from assistants a where a.id = assistant_id))
  with check (tenant_id = app_tenant());
grant select, insert on metric_values, assistant_decisions to greenia_app;
