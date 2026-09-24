-- 022: remove a medição por assistente (tabelas da migração 009). Os dados
-- foram trazidos para quick wins pela migração 020, e o teste de reconciliação
-- (test/legacy-reconciliation.test.ts) confere os totais antes e depois.
-- Volta: migrations/down/022_remove_medicao_por_assistente.sql recria as tabelas, vazias.
drop function if exists migrate_assistant_metrics();
drop table if exists metric_values;
drop table if exists assistant_decisions;
