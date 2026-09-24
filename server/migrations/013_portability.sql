-- 013: saída e portabilidade. Exportação completa do tenant (gerada na fila,
-- guardada no armazenamento do próprio tenant) e comprovante de exclusão total
-- ao fim do contrato. O comprovante fica fora das tabelas do tenant: sobrevive
-- à exclusão.

create table tenant_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  requested_by uuid not null,
  status text not null default 'processando' check (status in ('processando', 'pronta', 'erro')),
  object_key text,
  bytes bigint,
  sha256 text,
  manifest jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table tenant_exports enable row level security;
create policy tenant_isolation on tenant_exports using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert, update on tenant_exports to greenia_app;

create table tenant_deletions (
  id uuid primary key default gen_random_uuid(),
  former_tenant_id uuid not null,           -- sem chave estrangeira: o tenant deixou de existir
  tenant_slug text not null,
  tenant_name text not null,
  requested_by text not null,
  reason text not null,
  counts jsonb not null,                    -- registros por tabela antes da exclusão
  objects_deleted int not null,
  audit_records int not null,
  audit_head_hash text,                     -- último hash da cadeia de auditoria do tenant
  verification jsonb not null,              -- o que sobrou (deve ser zero em tudo)
  receipt_sha256 text not null,
  deleted_at timestamptz not null default now()
);
-- Só a operação da plataforma (conexão do dono) lê e grava comprovantes.
