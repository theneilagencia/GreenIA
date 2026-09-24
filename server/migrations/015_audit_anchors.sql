-- 015: âncoras da cadeia de auditoria.
-- Todo dia, o hash final da cadeia de cada tenant é publicado num bucket S3
-- com Object Lock em modo compliance, numa conta AWS separada da produção.
-- Nem o dono do banco nem a conta de produção conseguem apagar ou alterar a
-- âncora antes do fim da retenção. Esta tabela é só o índice local: a
-- verificação compara a cadeia com a âncora lida do bucket, não com esta cópia.
create table audit_anchors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  anchor_date date not null,                 -- dia (America/Sao_Paulo) a que a âncora se refere
  seq bigint not null,                       -- último registro da cadeia coberto
  hash text not null,                        -- hash desse registro
  records bigint not null,
  bucket text not null,
  object_key text not null,
  version_id text,
  retain_until timestamptz not null,
  published_at timestamptz not null default now(),
  unique (tenant_id, anchor_date)
);
create index audit_anchors_tenant on audit_anchors (tenant_id, anchor_date desc);
alter table audit_anchors enable row level security;
create policy tenant_isolation on audit_anchors using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert on audit_anchors to greenia_app;
