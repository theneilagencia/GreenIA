-- 021: compartilhar não amplia acesso sem aprovação, e alterações na medição
-- ficam registradas.
--   pedido de compartilhamento  assistente ou documento com outra área (ou com a
--                               empresa toda) só vale depois de aprovado pelo key
--                               user da área dona (sem key user: admin do cliente)
--   alteração de quick win      indicador, ponto de partida ou janela mudados depois
--                               de iniciada a medição, com motivo

create table share_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('assistente', 'documento')),
  assistant_id uuid,
  document_id uuid,
  owner_area_id uuid,                          -- área dona no momento do pedido
  target_area_id uuid,                         -- área de destino; nula com company_wide
  company_wide boolean not null default false, -- pedido para a empresa toda
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  origin text not null default 'painel',       -- painel, ampliação de quick win, criação
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  check ((kind = 'assistente') = (assistant_id is not null) and (kind = 'documento') = (document_id is not null)),
  check (company_wide or target_area_id is not null),
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id) on delete cascade,
  foreign key (tenant_id, document_id) references kb_documents(tenant_id, id) on delete cascade,
  foreign key (tenant_id, target_area_id) references areas(tenant_id, id) on delete cascade
);
create unique index share_requests_pending on share_requests (coalesce(assistant_id, document_id), coalesce(target_area_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'pendente';
alter table share_requests enable row level security;
create policy tenant_isolation on share_requests using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert, update on share_requests to greenia_app;

-- Dono de um assistente ou documento, para quem pede ou aprova o compartilhamento
-- sem enxergar a área dona (patrocinador, por exemplo). Só ids e nome.
create function share_target(p_kind text, p_ref text)
returns table (id uuid, area_id uuid, company_wide boolean, label text)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.area_id, a.company_wide, a.name from assistants a where p_kind = 'assistente' and a.tenant_id = app_tenant() and a.slug = p_ref
  union all
  select d.id, d.area_id, d.company_wide, d.title from kb_documents d where p_kind = 'documento' and d.tenant_id = app_tenant() and d.id::text = p_ref
$$;
grant execute on function share_target(text, text) to greenia_app;

-- Key users de uma área: com papel nela ou numa área acima, enquanto a herança valer.
create function area_key_users(p_area uuid) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive up as (
    select a.id, a.parent_id, a.inherit_permissions from areas a where a.id = p_area and a.tenant_id = app_tenant()
    union all
    select p.id, p.parent_id, p.inherit_permissions from areas p join up on p.id = up.parent_id where up.inherit_permissions
  )
  select distinct m.user_id from memberships m where m.role = 'key_user' and m.area_id in (select id from up) and m.tenant_id = app_tenant()
$$;
grant execute on function area_key_users(uuid) to greenia_app;

-- Aplica um pedido aprovado (grava o compartilhamento). Quem aprova pode não
-- enxergar a área de destino; a função confere o tenant.
create function share_apply(p_request uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  select * into r from share_requests where id = p_request and tenant_id = app_tenant() and status = 'aprovado';
  if r.id is null then raise exception 'pedido não aprovado'; end if;
  if r.company_wide then
    if r.kind = 'assistente' then update assistants set company_wide = true where id = r.assistant_id;
    else update kb_documents set company_wide = true where id = r.document_id; end if;
  elsif r.kind = 'assistente' then
    insert into assistant_shares (tenant_id, assistant_id, area_id) values (r.tenant_id, r.assistant_id, r.target_area_id) on conflict do nothing;
  else
    insert into kb_document_shares (tenant_id, document_id, area_id) values (r.tenant_id, r.document_id, r.target_area_id) on conflict do nothing;
  end if;
end $$;
grant execute on function share_apply(uuid) to greenia_app;

-- Alterações de um quick win depois de iniciada a medição.
create table quick_win_changes (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  quick_win_id uuid not null,
  at timestamptz not null default now(),
  actor text not null,
  stage text not null,
  what text not null,                          -- o que mudou (indicadores, ponto de partida, janela)
  reason text not null check (length(reason) >= 3),
  foreign key (tenant_id, quick_win_id) references quick_wins(tenant_id, id) on delete cascade
);
alter table quick_win_changes enable row level security;
create policy tenant_qw on quick_win_changes using (tenant_id = app_tenant() and exists (select 1 from quick_wins q where q.id = quick_win_id)) with check (tenant_id = app_tenant());
grant select, insert on quick_win_changes to greenia_app;
grant usage on sequence quick_win_changes_id_seq to greenia_app;
