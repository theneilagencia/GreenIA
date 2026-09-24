// Indexação de uma versão de documento (tarefa da fila 'kb:index'). Lê o
// original no armazenamento, quebra em trechos e troca os trechos do documento
// pelos da nova versão. A Fase 3 acrescenta leitura de PDF, DOCX, XLSX etc.
import type { Db } from '../db/pool.ts';
import { withTenant } from '../db/pool.ts';
import type { ObjectStore } from '../storage/object-store.ts';
import { chunkText, searchTerms } from './knowledge.ts';

export const KB_TEXT_TYPES = ['text/plain', 'text/markdown'];

export function makeIndexer(db: Db, objects: ObjectStore) {
  return async (data: Record<string, unknown>) => {
    const tenantId = String(data.tenantId);
    const documentId = String(data.documentId);
    const version = Number(data.version);
    // Tarefa do sistema: vê todas as áreas do tenant, e só dele.
    await withTenant(db, { tenantId, allAreas: true }, async tx => {
      const v = (await tx.query(
        `select v.object_key, v.mime, d.title, d.area_id from kb_document_versions v join kb_documents d on d.id = v.document_id
         where v.document_id = $1 and v.version = $2`, [documentId, version])).rows[0];
      if (!v) return;
      try {
        if (!KB_TEXT_TYPES.includes(v.mime)) throw new Error('tipo de arquivo ainda não suportado: ' + v.mime);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await objects.get(v.object_key));
        const chunks = chunkText(text);
        if (!chunks.length) throw new Error('documento sem texto');
        await tx.query(`delete from kb_chunks where document_id = $1`, [documentId]);
        for (const [i, c] of chunks.entries()) {
          await tx.query(
            `insert into kb_chunks (tenant_id, document_id, version, area_id, ord, title, text, search_terms) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [tenantId, documentId, version, v.area_id, i, v.title, c, searchTerms(v.title + ' ' + c)]);
        }
        await tx.query(`update kb_document_versions set status = 'indexado', error = null where document_id = $1 and version = $2`, [documentId, version]);
        await tx.query(`update kb_documents set current_version = $1 where id = $2 and current_version < $1`, [version, documentId]);
      } catch (e) {
        await tx.query(`update kb_document_versions set status = 'erro', error = $3 where document_id = $1 and version = $2`,
          [documentId, version, (e as Error).message.slice(0, 500)]);
      }
    });
  };
}
