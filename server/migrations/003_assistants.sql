-- 003: assistentes (melhorias práticas empacotadas), versionados. Cada versão
-- guarda a definição completa (JSON validado por Zod no servidor): classes de
-- dado aceitas, ação por tipo detectado, retenção, instruções. A Fase 3 amplia a
-- definição (pipeline, saída, revisão, medição) sem mudar estas tabelas.
create table assistants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name text not null,
  area_id uuid,
  status text not null default 'rascunho' check (status in ('rascunho', 'piloto', 'ativo', 'pausado', 'descartado')),
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id),
  foreign key (tenant_id, area_id) references areas(tenant_id, id)
);

create table assistant_versions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  assistant_id uuid not null,
  version int not null,
  definition jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (assistant_id, version),
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id) on delete cascade
);

alter table assistants enable row level security;
alter table assistant_versions enable row level security;
-- Tenant e área: assistente de uma área só aparece para quem é da área.
create policy tenant_area on assistants
  using (tenant_id = app_tenant() and app_can_see_area(area_id))
  with check (tenant_id = app_tenant());
create policy tenant_isolation on assistant_versions
  using (tenant_id = app_tenant() and exists (select 1 from assistants a where a.id = assistant_id))
  with check (tenant_id = app_tenant());

grant select, insert, update on assistants, assistant_versions to greenia_app;
