-- 005: saídas retidas. Conversa livre não é gravada. Saída de assistente que
-- exige evidência é gravada com prazo (expires_at) e apagada ao fim dele.
create table outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid,
  assistant_id uuid,
  assistant_version int,
  area_id uuid,
  content text not null,
  sources jsonb not null default '[]'::jsonb,  -- documentos e versões da base usados
  input_sha256 text not null,                  -- hash do que foi enviado ao modelo (não o texto)
  output_sha256 text not null,
  model text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id)
);
create index outputs_expires on outputs (expires_at);
create index outputs_tenant on outputs (tenant_id, created_at desc);

alter table outputs enable row level security;
-- Quem gerou vê a própria saída; revisor e key user veem as da área; admin, todas.
create policy tenant_area on outputs
  using (tenant_id = app_tenant() and (user_id = app_user() or app_can_see_area(area_id)))
  with check (tenant_id = app_tenant());

grant select, insert on outputs to greenia_app;

-- Expurgo das saídas vencidas, em todos os tenants, com registro na auditoria de
-- cada tenant (só a contagem). Chamado pela tarefa periódica da fila.
create function purge_expired_outputs(p_limit int default 5000)
returns table (tenant_id uuid, apagadas bigint)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  return query
  with gone as (
    delete from outputs o
    where o.id in (select id from outputs where expires_at <= now() order by expires_at limit p_limit)
    returning o.tenant_id
  ), per_tenant as (
    select g.tenant_id, count(*) as n from gone g group by g.tenant_id
  ), logged as (
    insert into audit_log (tenant_id, action, details)
    select p.tenant_id, 'retencao_expurgo', jsonb_build_object('saidasApagadas', p.n) from per_tenant p
    returning 1
  )
  select p.tenant_id, p.n from per_tenant p;
end $$;

revoke all on function purge_expired_outputs(int) from public;
grant execute on function purge_expired_outputs(int) to greenia_app;
