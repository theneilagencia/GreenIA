-- 023: mapeamentos de importação. Arquivos exportados de qualquer sistema (CSV,
-- XLSX, texto de largura fixa, JSON, XML) viram registros normalizados por uma
-- configuração do tenant, criada e testada pela tela. Cada alteração é uma
-- versão nova; as versões antigas ficam para a auditoria e para refazer uma
-- execução antiga com o mapeamento da época.

create table import_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
  name text not null,
  description text not null default '',
  current_version int not null default 1,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);
alter table import_mappings enable row level security;
create policy tenant_isolation on import_mappings using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert, update on import_mappings to greenia_app;

create table import_mapping_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mapping_id uuid not null,
  version int not null check (version >= 1),
  config jsonb not null,
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (mapping_id, version),
  foreign key (tenant_id, mapping_id) references import_mappings(tenant_id, id) on delete cascade
);
alter table import_mapping_versions enable row level security;
create policy tenant_isolation on import_mapping_versions using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert on import_mapping_versions to greenia_app;
