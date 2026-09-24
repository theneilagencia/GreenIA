-- 007: auditoria com hash encadeado. Cada registro guarda o hash do anterior do
-- mesmo tenant (prev_hash) e o próprio hash, calculado no banco sobre prev_hash e
-- os campos do registro. Alterar ou apagar um registro antigo quebra a cadeia, e
-- audit_verify() aponta onde. A cadeia é por tenant (e uma para os registros sem
-- tenant), para que exportar ou excluir um tenant não afete os outros.

alter table audit_log add column seq bigint, add column prev_hash text, add column hash text;

-- Forma canônica do registro para o hash: campos fixos, data em UTC com
-- microssegundos e details como jsonb::text (o Postgres normaliza a ordem das chaves).
create function audit_canonical(p_tenant uuid, p_seq bigint, p_at timestamptz, p_actor uuid,
                                p_action text, p_target text, p_details jsonb, p_prev text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select concat_ws('|', coalesce(p_tenant::text, '-'), p_seq::text,
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_actor::text, '-'), p_action, coalesce(p_target, '-'), p_details::text, p_prev)
$$;

create function audit_hash(p_canonical text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_canonical, 'UTF8')), 'hex') $$;

-- Encadeia o novo registro. SECURITY DEFINER para enxergar o último registro do
-- tenant mesmo quando quem insere está sujeito a RLS; a trava transacional por
-- tenant serializa as inclusões e evita dois registros com o mesmo anterior.
create function audit_log_chain() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare last record;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit:' || coalesce(new.tenant_id::text, '-'), 0));
  select a.seq, a.hash into last from audit_log a
   where a.tenant_id is not distinct from new.tenant_id
   order by a.seq desc limit 1;
  new.at := now(); -- a data não é escolhida por quem insere
  new.seq := coalesce(last.seq, 0) + 1;
  new.prev_hash := coalesce(last.hash, repeat('0', 64));
  new.hash := audit_hash(audit_canonical(new.tenant_id, new.seq, new.at, new.actor_user_id,
                                         new.action, new.target, new.details, new.prev_hash));
  return new;
end $$;

-- Registros já existentes: encadeados na ordem de inclusão (id), por tenant.
alter table audit_log disable trigger audit_log_no_update;
do $$
declare r record; prev_t uuid; first boolean := true; s bigint; h text;
begin
  for r in select * from audit_log order by tenant_id nulls first, id loop
    if first or r.tenant_id is distinct from prev_t then s := 0; h := repeat('0', 64); first := false; end if;
    s := s + 1;
    update audit_log set seq = s, prev_hash = h,
      hash = audit_hash(audit_canonical(r.tenant_id, s, r.at, r.actor_user_id, r.action, r.target, r.details, h))
      where id = r.id
      returning audit_log.hash into h;
    prev_t := r.tenant_id;
  end loop;
end $$;
alter table audit_log enable trigger audit_log_no_update;

alter table audit_log alter column seq set not null, alter column prev_hash set not null, alter column hash set not null;
create unique index audit_log_chain_seq on audit_log (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), seq);

create trigger audit_log_chain before insert on audit_log for each row execute function audit_log_chain();

-- Verifica a cadeia do tenant atual (RLS: só enxerga o próprio tenant).
-- ok = false aponta o primeiro registro quebrado e o motivo.
create function audit_verify()
returns table (ok boolean, registros bigint, primeiro_quebrado bigint, motivo text, hash_final text)
language plpgsql stable set search_path = public, pg_temp as $$
declare r record; expected_prev text := repeat('0', 64); n bigint := 0;
begin
  for r in select * from audit_log where tenant_id = app_tenant() order by seq loop
    n := n + 1;
    if r.seq <> n then
      return query select false, n, r.seq, 'registro faltando antes deste (seq ' || n || ' esperado)', null::text; return;
    end if;
    if r.prev_hash <> expected_prev then
      return query select false, n, r.seq, 'hash do anterior não confere', null::text; return;
    end if;
    if r.hash <> audit_hash(audit_canonical(r.tenant_id, r.seq, r.at, r.actor_user_id, r.action, r.target, r.details, r.prev_hash)) then
      return query select false, n, r.seq, 'conteúdo alterado', null::text; return;
    end if;
    expected_prev := r.hash;
  end loop;
  return query select true, n, null::bigint, null::text, case when n > 0 then expected_prev end;
end $$;

grant execute on function audit_verify() to greenia_app;
