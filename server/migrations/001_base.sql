-- 001: base multi-cliente. Tenants, pessoas, áreas, sessões, autenticação e
-- auditoria, com isolamento por Row-Level Security.
--
-- Modelo de isolamento:
-- - As migrações rodam com o papel dono das tabelas (owner).
-- - O servidor conecta com um papel membro de greenia_app, que não é dono e
--   não tem BYPASSRLS: toda linha que ele lê ou grava passa pelas políticas.
-- - Cada requisição abre uma transação e define app.tenant_id, app.user_id,
--   app.area_ids e app.all_areas com SET LOCAL (set_config(..., true)).
-- - Sem app.tenant_id definido, as políticas não devolvem nenhuma linha.

create extension if not exists pgcrypto;

do $$ begin
  create role greenia_app nologin; -- sem BYPASSRLS (padrão)
exception when duplicate_object then null; end $$;

grant usage on schema public to greenia_app;

-- Contexto da requisição -------------------------------------------------------

create function app_tenant() returns uuid language sql stable as
  $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create function app_user() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app_area_ids() returns uuid[] language sql stable as
  $$ select coalesce(nullif(current_setting('app.area_ids', true), '')::uuid[], '{}'::uuid[]) $$;

create function app_all_areas() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.all_areas', true), '') = 'on' $$;

-- Tenants ------------------------------------------------------------------------

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'encerrado')),
  is_platform boolean not null default false, -- tenant interno da TheNeil
  config jsonb not null default '{}'::jsonb,   -- validado por Zod no servidor
  created_at timestamptz not null default now()
);

create table tenant_hosts (
  host text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade
);

create table tenant_domains (
  tenant_id uuid not null references tenants(id) on delete cascade,
  domain text not null unique check (domain = lower(domain)),
  primary key (tenant_id, domain)
);

create table auth_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('entra', 'google', 'email_code', 'oidc')),
  label text not null,
  config jsonb not null default '{}'::jsonb, -- issuer, client_id, tid/hd esperado, nome do segredo
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Pessoas e áreas -------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null check (email = lower(email)),
  name text not null default '',
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  unique (tenant_id, email),
  unique (tenant_id, id)
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);

-- Papel por área (area_id preenchido) ou no tenant todo (area_id nulo).
create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  area_id uuid,
  role text not null check (role in ('usuario', 'revisor', 'key_user', 'admin_cliente', 'admin_theneil')),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, user_id) references users(tenant_id, id) on delete cascade,
  foreign key (tenant_id, area_id) references areas(tenant_id, id) on delete cascade
);
create unique index memberships_uniq on memberships (user_id, coalesce(area_id, '00000000-0000-0000-0000-000000000000'::uuid), role);

-- Sessões e autenticação ---------------------------------------------------------------

create table sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  token_hash bytea not null unique,   -- sha256 do token do cookie; o token em si não é guardado
  csrf_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  foreign key (tenant_id, user_id) references users(tenant_id, id) on delete cascade
);

create table login_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  code_hash bytea not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_lookup on login_codes (tenant_id, email, created_at desc);

-- Estado temporário do login OIDC (state, nonce, PKCE). Apagado ao usar.
create table auth_flows (
  state text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_id uuid not null references auth_providers(id) on delete cascade,
  code_verifier text not null,
  nonce text not null,
  return_to text not null default '/',
  expires_at timestamptz not null
);

-- Auditoria (somente inclusão) -----------------------------------------------------------

create table audit_log (
  id bigserial primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb   -- nunca conteúdo de mensagens nem valores de dados sensíveis
);
create index audit_log_tenant_at on audit_log (tenant_id, at desc);

-- UPDATE nunca. DELETE só na exclusão total de um tenant (fim de contrato), com
-- greenia.purge_tenant definido para aquele tenant pela rotina da plataforma.
-- O papel do servidor (greenia_app) nem tem permissão de DELETE nesta tabela.
create function audit_log_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.tenant_id is not null
     and coalesce(current_setting('greenia.purge_tenant', true), '') = old.tenant_id::text then
    return old;
  end if;
  raise exception 'audit_log é somente inclusão';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- Políticas de isolamento --------------------------------------------------------------------

alter table tenants enable row level security;
create policy tenant_self on tenants using (id = app_tenant());

do $$
declare t text;
begin
  foreach t in array array['tenant_hosts', 'tenant_domains', 'auth_providers', 'users', 'areas',
                           'memberships', 'sessions', 'login_codes', 'auth_flows', 'audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = app_tenant()) with check (tenant_id = app_tenant())', t);
  end loop;
end $$;

grant select on tenants to greenia_app;
grant select, insert, update, delete on tenant_hosts, tenant_domains, auth_providers, users, areas,
  memberships, sessions, login_codes, auth_flows to greenia_app;
grant select, insert on audit_log to greenia_app;
grant usage on sequence audit_log_id_seq to greenia_app;

-- Consultas antes do login (SECURITY DEFINER) ------------------------------------------------------
-- Rodam com o dono das tabelas e devolvem só o necessário.

-- Configuração pública do tenant (marca, textos, provedores de login), por host ou slug.
create function public_tenant(p_host text, p_slug text)
returns table (id uuid, slug text, name text, status text, config jsonb, providers jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.slug, t.name, t.status, t.config,
    coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'label', p.label) order by p.created_at)
              from auth_providers p where p.tenant_id = t.id and p.enabled), '[]'::jsonb)
  from tenants t
  where t.status = 'ativo'
    and (t.slug = p_slug or t.id = (select h.tenant_id from tenant_hosts h where h.host = lower(p_host)))
  limit 1
$$;

-- Sessão válida a partir do hash do token do cookie.
create function session_lookup(p_hash bytea)
returns table (session_id uuid, tenant_id uuid, user_id uuid, csrf_token text, expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.tenant_id, s.user_id, s.csrf_token, s.expires_at
  from sessions s
  join users u on u.id = s.user_id and u.status = 'ativo'
  join tenants t on t.id = s.tenant_id and t.status = 'ativo'
  where s.token_hash = p_hash and s.expires_at > now()
$$;

-- Retoma (e apaga) o fluxo OIDC pelo parâmetro state do callback.
create function auth_flow_take(p_state text)
returns table (tenant_id uuid, provider_id uuid, code_verifier text, nonce text, return_to text)
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from auth_flows f where f.state = p_state and f.expires_at > now()
  returning f.tenant_id, f.provider_id, f.code_verifier, f.nonce, f.return_to
$$;

revoke all on function public_tenant(text, text), session_lookup(bytea), auth_flow_take(text) from public;
grant execute on function public_tenant(text, text), session_lookup(bytea), auth_flow_take(text) to greenia_app;
grant execute on function app_tenant(), app_user(), app_area_ids(), app_all_areas() to greenia_app;
