-- 018: catálogo de modelos mantido pela TheNeil, separado dos tenants.
-- Modelos versionados de assistente e de conjunto inicial de áreas. Um tenant
-- lê o catálogo e cria o seu assistente a partir de um modelo; depois disso o
-- assistente é do tenant e não muda quando o modelo muda (só aparece o aviso
-- de versão nova). O catálogo não tem dado de cliente: não há tenant_id.
create table catalog_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('assistente', 'areas')),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  version integer not null check (version >= 1),
  name text not null,
  description text not null default '',
  content jsonb not null,
  content_sha256 text not null,
  published_at timestamptz not null default now(),
  published_by text not null,
  unique (kind, slug, version)
);
create index catalog_templates_latest on catalog_templates (kind, slug, version desc);
grant select on catalog_templates to greenia_app;

-- Origem do assistente: modelo do catálogo (e versão usada) ou assistente duplicado.
alter table assistants add column template_slug text, add column template_version integer, add column duplicated_from text;
