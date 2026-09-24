-- 011: tabela de preços configurável (substitui a tabela fixa da Fase 2).
-- Cada linha vale a partir de uma data; o consumo usa a linha vigente no dia e
-- guarda qual linha usou. Preço por página processada é opcional (cobrança de
-- processamento de documentos, se o contrato previr).

create table price_tables (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  input_per_mtok_usd numeric(12, 4) not null check (input_per_mtok_usd >= 0),
  output_per_mtok_usd numeric(12, 4) not null check (output_per_mtok_usd >= 0),
  per_page_brl numeric(12, 4) not null default 0 check (per_page_brl >= 0),
  usd_brl numeric(10, 4) not null check (usd_brl > 0),
  valid_from date not null,
  source text not null,                      -- de onde veio o preço (página do provedor, contrato)
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (provider, model, valid_from)
);

-- Tabela da plataforma (não é dado de cliente): leitura para o servidor,
-- escrita só pela operação da TheNeil (conexão do dono).
grant select on price_tables to greenia_app;

alter table usage_events add column price_id uuid references price_tables(id);

-- Preços de referência de 24/06/2026 (API da Anthropic), com o câmbio padrão.
-- Conferir na página de preços antes de faturar.
insert into price_tables (provider, model, input_per_mtok_usd, output_per_mtok_usd, usd_brl, valid_from, source, created_by) values
  ('anthropic', 'claude-haiku-4-5', 1, 5, 5.5, '2026-06-24', 'tabela de referência da API da Anthropic em 24/06/2026', 'migração 011'),
  ('anthropic', 'claude-sonnet-5', 2, 10, 5.5, '2026-06-24', 'tabela de referência da API da Anthropic em 24/06/2026', 'migração 011'),
  ('anthropic', 'claude-sonnet-4-6', 3, 15, 5.5, '2026-06-24', 'tabela de referência da API da Anthropic em 24/06/2026', 'migração 011'),
  ('anthropic', 'claude-opus-5', 5, 25, 5.5, '2026-06-24', 'tabela de referência da API da Anthropic em 24/06/2026', 'migração 011'),
  ('anthropic', 'claude-opus-5-5', 4, 20, 5.5, '2026-06-24', 'tabela de referência da API da Anthropic em 24/06/2026', 'migração 011');
