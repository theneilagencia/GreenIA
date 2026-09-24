-- 010: Política de Uso de IA do cliente (versionada, com ciência de cada
-- pessoa) e incidentes ("Reportar incidente"), com histórico de status.

create table usage_policies (
  tenant_id uuid not null references tenants(id) on delete cascade,
  version int not null,
  title text not null,
  body text not null,                      -- Markdown publicado na plataforma
  body_sha256 text not null,
  rules jsonb not null default '{}'::jsonb, -- piso da política de dados, informações restritas, classes permitidas
  published_by uuid not null,
  published_at timestamptz not null default now(),
  primary key (tenant_id, version)
);

create table policy_acks (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  version int not null,
  acked_at timestamptz not null default now(),
  primary key (tenant_id, user_id, version),
  foreign key (tenant_id, version) references usage_policies(tenant_id, version) on delete cascade
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('dado_indevido', 'resposta_errada', 'resposta_inadequada', 'outro')),
  description text not null,
  area_id uuid,
  reporter_id uuid not null,
  run_id uuid,
  screen text,
  status text not null default 'aberto' check (status in ('aberto', 'em_analise', 'resolvido', 'encerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index incidents_tenant on incidents (tenant_id, created_at desc);

create table incident_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  incident_id uuid not null,
  at timestamptz not null default now(),
  actor text not null,                     -- email de quem agiu (ou "TheNeil")
  status_from text,
  status_to text not null,
  note text,
  foreign key (tenant_id, incident_id) references incidents(tenant_id, id) on delete cascade
);

alter table usage_policies enable row level security;
alter table policy_acks enable row level security;
alter table incidents enable row level security;
alter table incident_events enable row level security;
create policy tenant_isolation on usage_policies using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_isolation on policy_acks using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
-- Incidente: quem reportou vê o seu; quem é da área vê os da área (a rota
-- restringe a key users); admin vê todos.
create policy tenant_area on incidents
  using (tenant_id = app_tenant() and (reporter_id = app_user() or app_can_see_area(area_id)))
  with check (tenant_id = app_tenant());
create policy tenant_isolation on incident_events
  using (tenant_id = app_tenant() and exists (select 1 from incidents i where i.id = incident_id))
  with check (tenant_id = app_tenant());

grant select, insert on usage_policies, policy_acks, incident_events to greenia_app;
grant select, insert, update on incidents to greenia_app;
grant usage on sequence incident_events_id_seq to greenia_app;
