-- 014: acesso à descrição dos incidentes.
-- A descrição fica com o key user da área (e com quem reportou). A TheNeil vê
-- tipo, status, data e o identificador da execução ou saída afetada; a
-- descrição só chega a ela quando o key user escala o caso ou quando o tipo é
-- "problema técnico". Cada leitura da descrição vai para a auditoria.
alter table incidents drop constraint incidents_kind_check;
alter table incidents add constraint incidents_kind_check
  check (kind in ('dado_indevido', 'resposta_errada', 'resposta_inadequada', 'problema_tecnico', 'outro'));
alter table incidents add column output_id uuid;               -- saída de assistente afetada (chat com evidência)
alter table incidents add column escalated_at timestamptz;     -- key user levou o caso à TheNeil
alter table incidents add column escalated_by text;
