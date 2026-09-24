-- 017: o admin do cliente altera partes da configuração do próprio tenant
-- (detectores próprios e leitores ligados) sem acesso de escrita à tabela
-- tenants. A função só mexe na chave pedida e só no tenant da sessão; a
-- validação do conteúdo fica no servidor (zod) antes da chamada.
create function tenant_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_key not in ('detectors', 'readers', 'dataPolicy') then raise exception 'chave de configuração não permitida: %', p_key; end if;
  if app_tenant() is null then raise exception 'sem tenant na sessão'; end if;
  update tenants set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = app_tenant();
end $$;
revoke all on function tenant_set_setting(text, jsonb) from public;
grant execute on function tenant_set_setting(text, jsonb) to greenia_app;
