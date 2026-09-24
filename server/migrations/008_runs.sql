-- 008: execuções de assistentes (pipeline de blocos) e seus arquivos de entrada.
-- Toda saída nasce como rascunho e passa por revisão (item 3.3). A execução
-- guarda a versão do assistente, os hashes das entradas e da saída, as fontes
-- da base usadas, provedor e modelo, tempos, páginas e consumo. O conteúdo
-- (texto enviado, resultado e arquivos) segue o prazo de retenção.

create table runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assistant_id uuid not null,
  assistant_version int not null,
  area_id uuid,
  user_id uuid not null,
  status text not null default 'processando'
    check (status in ('processando', 'rascunho', 'erro', 'aprovado', 'aprovado_com_edicao', 'rejeitado')),
  input_text text not null default '',
  input_sha256 text not null,                 -- hash do texto e dos arquivos de entrada
  confirmed_warnings text[] not null default '{}',
  result jsonb,                               -- seções geradas (a saída original, nunca alterada)
  flags int not null default 0,               -- pontos que a revisão precisa olhar
  divergences int not null default 0,
  pendings int not null default 0,
  sources jsonb not null default '[]'::jsonb, -- documentos e versões da base usados
  provider text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  pages int not null default 0,
  cost_brl numeric(14, 6) not null default 0,
  output_sha256 text,
  error text,
  -- Revisão humana (item 3.3): a saída editada e o diff ficam ao lado da original.
  edited_result jsonb,
  review_diff text,
  review_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  processing_ms int,
  expires_at timestamptz not null,
  unique (tenant_id, id),
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id),
  foreign key (assistant_id, assistant_version) references assistant_versions(assistant_id, version)
);
create index runs_tenant_created on runs (tenant_id, created_at desc);
create index runs_assistant on runs (assistant_id, created_at desc);
create index runs_expires on runs (expires_at);

create table run_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_id uuid not null,
  name text not null,
  mime text not null,
  bytes int not null,
  sha256 text not null,
  object_key text not null,
  kind text,
  pages int not null default 0,
  foreign key (tenant_id, run_id) references runs(tenant_id, id) on delete cascade
);
create index run_files_run on run_files (run_id);
create index run_files_sha on run_files (tenant_id, sha256);

alter table runs enable row level security;
alter table run_files enable row level security;
-- Quem executou vê a própria execução; quem é da área vê as da área (a rota
-- restringe a revisores e key users); admin do cliente vê todas.
create policy tenant_area on runs
  using (tenant_id = app_tenant() and (user_id = app_user() or app_can_see_area(area_id)))
  with check (tenant_id = app_tenant());
create policy tenant_isolation on run_files
  using (tenant_id = app_tenant() and exists (select 1 from runs r where r.id = run_id))
  with check (tenant_id = app_tenant());

grant select, insert, update on runs to greenia_app;
grant select, insert, update on run_files to greenia_app;

-- Consumo: páginas processadas e a execução de origem.
alter table usage_events add column pages int not null default 0, add column run_id uuid;
create index usage_events_run on usage_events (run_id);

-- Retenção das execuções: a tarefa periódica pega as vencidas, apaga os
-- arquivos no armazenamento e depois as linhas (com registro na auditoria).
create function expired_runs(p_limit int default 500)
returns table (tenant_id uuid, run_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.tenant_id, r.id from runs r where r.expires_at <= now() order by r.expires_at limit p_limit
$$;

create function purge_runs(p_ids uuid[])
returns table (tenant_id uuid, apagadas bigint)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  return query
  with gone as (
    delete from runs r where r.id = any(p_ids) and r.expires_at <= now() returning r.tenant_id
  ), per_tenant as (
    select g.tenant_id, count(*) as n from gone g group by g.tenant_id
  ), logged as (
    insert into audit_log (tenant_id, action, details)
    select p.tenant_id, 'retencao_expurgo_execucoes', jsonb_build_object('execucoesApagadas', p.n) from per_tenant p
    returning 1
  )
  select p.tenant_id, p.n from per_tenant p;
end $$;

revoke all on function expired_runs(int), purge_runs(uuid[]) from public;
grant execute on function expired_runs(int), purge_runs(uuid[]) to greenia_app;
