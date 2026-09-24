-- 006: consumo por resposta (tokens e custo) e alertas de cota mensal.
create table usage_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid,
  assistant_id uuid,
  provider text not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_brl numeric(14, 6) not null,
  at timestamptz not null default now()
);
create index usage_events_tenant_at on usage_events (tenant_id, at);

-- Um alerta por limite (80, 100) por mês, por tenant.
create table quota_alerts (
  tenant_id uuid not null references tenants(id) on delete cascade,
  month date not null,
  threshold int not null check (threshold in (80, 100)),
  created_at timestamptz not null default now(),
  primary key (tenant_id, month, threshold)
);

alter table usage_events enable row level security;
alter table quota_alerts enable row level security;
create policy tenant_isolation on usage_events using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_isolation on quota_alerts using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());

grant select, insert on usage_events, quota_alerts to greenia_app;
grant usage on sequence usage_events_id_seq to greenia_app;
