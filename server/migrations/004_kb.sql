-- 004: base de conhecimento. Documento com versões; o arquivo original fica no
-- armazenamento de objetos (S3), o texto indexado fica em trechos (kb_chunks).
-- Só a versão atual de cada documento é pesquisável. Área nula = todo o tenant.
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  area_id uuid,
  title text not null,
  current_version int not null default 0,  -- última versão indexada (0 = ainda nenhuma)
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, area_id) references areas(tenant_id, id)
);

create table kb_document_versions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null,
  version int not null,
  object_key text not null,
  sha256 text not null,
  mime text not null,
  bytes int not null,
  status text not null default 'pendente' check (status in ('pendente', 'indexado', 'erro')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (document_id, version),
  foreign key (tenant_id, document_id) references kb_documents(tenant_id, id) on delete cascade
);

create table kb_chunks (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null,
  version int not null,
  area_id uuid,                -- cópia da área do documento, para a política de RLS
  ord int not null,
  title text not null,
  text text not null,
  -- Termos já normalizados pelo servidor com a mesma função da Fase 1
  -- (lib/greenia-core.js: sem acento, sem stopwords, plural reduzido), para a
  -- busca casar palavra inteira do mesmo jeito que no navegador.
  search_terms text not null,
  tsv tsvector generated always as (to_tsvector('simple', search_terms)) stored,
  foreign key (tenant_id, document_id) references kb_documents(tenant_id, id) on delete cascade
);
create index kb_chunks_tsv on kb_chunks using gin (tsv);
create index kb_chunks_doc on kb_chunks (document_id, version);

do $$
declare t text;
begin
  foreach t in array array['kb_documents', 'kb_chunks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_area on %I using (tenant_id = app_tenant() and app_can_see_area(area_id)) with check (tenant_id = app_tenant())', t);
  end loop;
end $$;
alter table kb_document_versions enable row level security;
create policy tenant_area on kb_document_versions
  using (tenant_id = app_tenant() and exists (select 1 from kb_documents d where d.id = document_id))
  with check (tenant_id = app_tenant());

grant select, insert, update, delete on kb_documents, kb_document_versions, kb_chunks to greenia_app;
grant usage on sequence kb_chunks_id_seq to greenia_app;
