-- 016: áreas definidas pelo cliente.
-- O código não conhece nenhuma área pelo nome: cada tenant cria as suas, com
-- descrição, subáreas (área mãe), ordem e desativação. Permissão de uma área
-- vale nas subáreas (herança), a menos que a subárea não herde ou que a pessoa
-- tenha papel próprio nela (que sobrescreve o herdado). O cálculo fica no
-- servidor (loadMembership); a RLS continua a olhar a lista de áreas da sessão.
-- Assistentes e documentos têm uma área dona e podem ser compartilhados com
-- outras áreas ou marcados como de toda a empresa.

alter table areas
  add column description text not null default '',
  add column parent_id uuid,
  add column position integer not null default 0,
  add column active boolean not null default true,
  add column inherit_permissions boolean not null default true,
  add constraint areas_parent_fk foreign key (tenant_id, parent_id) references areas(tenant_id, id) on delete restrict,
  add constraint areas_not_self check (parent_id is null or parent_id <> id);
create index areas_parent on areas (tenant_id, parent_id, position);

-- Sem ciclo: a área mãe não pode ser a própria área nem uma subárea dela.
create function areas_no_cycle() returns trigger language plpgsql as $$
declare cur uuid := new.parent_id; steps int := 0;
begin
  while cur is not null loop
    if cur = new.id then raise exception 'área mãe cria um ciclo'; end if;
    select parent_id into cur from areas where id = cur;
    steps := steps + 1;
    if steps > 50 then raise exception 'hierarquia de áreas profunda demais'; end if;
  end loop;
  return new;
end $$;
create trigger areas_no_cycle before insert or update of parent_id on areas for each row execute function areas_no_cycle();

-- A área e as que estão abaixo dela (busca da base por área). A permissão desce
-- da área mãe para as subáreas, nunca sobe: quem é só da subárea não lê a base
-- da área mãe, a menos que ela compartilhe o documento.
create function area_subtree(p_area uuid) returns uuid[] language sql stable as $$
  with recursive down as (
    select id from areas where id = p_area
    union all
    select a.id from areas a join down on a.parent_id = down.id
  ) select coalesce(array_agg(id), '{}') from down
$$;
grant execute on function area_subtree(uuid) to greenia_app;

alter table assistants add column company_wide boolean not null default false;
alter table kb_documents add column company_wide boolean not null default false;

create table assistant_shares (
  tenant_id uuid not null references tenants(id) on delete cascade,
  assistant_id uuid not null,
  area_id uuid not null,
  primary key (assistant_id, area_id),
  foreign key (tenant_id, assistant_id) references assistants(tenant_id, id) on delete cascade,
  foreign key (tenant_id, area_id) references areas(tenant_id, id) on delete cascade
);
create table kb_document_shares (
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null,
  area_id uuid not null,
  primary key (document_id, area_id),
  foreign key (tenant_id, document_id) references kb_documents(tenant_id, id) on delete cascade,
  foreign key (tenant_id, area_id) references areas(tenant_id, id) on delete cascade
);
alter table assistant_shares enable row level security;
alter table kb_document_shares enable row level security;
create policy tenant_isolation on assistant_shares using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_isolation on kb_document_shares using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
grant select, insert, delete on assistant_shares, kb_document_shares to greenia_app;

-- Visibilidade: área dona, compartilhamento com uma área da pessoa, ou toda a empresa.
drop policy tenant_area on assistants;
create policy tenant_area on assistants
  using (tenant_id = app_tenant() and (company_wide or app_can_see_area(area_id)
         or exists (select 1 from assistant_shares s where s.assistant_id = assistants.id and app_can_see_area(s.area_id))))
  with check (tenant_id = app_tenant());
drop policy tenant_area on kb_documents;
create policy tenant_area on kb_documents
  using (tenant_id = app_tenant() and (company_wide or app_can_see_area(area_id)
         or exists (select 1 from kb_document_shares s where s.document_id = kb_documents.id and app_can_see_area(s.area_id))))
  with check (tenant_id = app_tenant());
-- Trecho da base: visível se o documento é visível.
drop policy tenant_area on kb_chunks;
create policy tenant_area on kb_chunks
  using (tenant_id = app_tenant() and exists (select 1 from kb_documents d where d.id = kb_chunks.document_id))
  with check (tenant_id = app_tenant());
