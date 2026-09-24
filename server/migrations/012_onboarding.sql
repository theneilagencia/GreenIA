-- 012: implantação. Lote de importação de documentos (relatório de erros por
-- lote) e marca de roteiro de primeiro acesso concluído.
alter table kb_documents add column import_batch uuid;
create index kb_documents_batch on kb_documents (import_batch) where import_batch is not null;

alter table users add column onboarding_done_at timestamptz;
