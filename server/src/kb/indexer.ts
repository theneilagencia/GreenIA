// Indexação de uma versão de documento (tarefa da fila 'kb:index'). Lê o
// original no armazenamento com o bloco de leitura (PDF com texto, DOCX, XLSX,
// CSV, NF-e, texto), quebra em trechos e troca os trechos do documento pelos da
// nova versão. Na base de conhecimento nada vai para o modelo: PDF escaneado e
// DOC, XLS, ODT e ODS passam pelo OCR e pelas conversões locais; se o OCR não
// puder ser feito, o erro é explicado (envie a versão com texto).
import type { Db } from '../db/pool.ts';
import { withTenant } from '../db/pool.ts';
import type { ObjectStore } from '../storage/object-store.ts';
import { chunkText, searchTerms } from './knowledge.ts';
import { readFile } from '../blocks/ler.ts';
import type { BlockEnv } from '../blocks/types.ts';
import type { Converter } from '../convert/converter.ts';

// Tipos aceitos na base (pelo tipo declarado; o conteúdo é conferido na leitura).
export const KB_TYPES: Record<string, string> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/xml': 'xml',
  'text/xml': 'xml',
  // Convertidos no servidor (LibreOffice) antes da leitura.
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
};
export const KB_TEXT_TYPES = Object.keys(KB_TYPES);

// Extensão → tipo, para a importação em lote (nome do arquivo).
export const KB_EXT_MIME: Record<string, string> = Object.fromEntries(Object.entries(KB_TYPES).filter(([m]) => m !== 'text/xml').map(([m, e]) => [e, m]));

const noModel: BlockEnv = {
  async complete() { throw new Error('a base de conhecimento não usa o modelo'); },
  async searchKnowledge() { return []; },
  keyUserContact: '',
  now: () => new Date(),
};

export async function extractForKb(name: string, bytes: Uint8Array, converter?: Converter): Promise<{ text: string; warnings: string[] }> {
  const d = await readFile({ id: 'kb', name, mime: '', sha256: '', bytes }, { paginasMax: 500, ocrMinConfidence: 0, visionFallback: false }, { ...noModel, converter });
  if (d.warnings.some(w => /^OCR não foi feito/.test(w))) throw new Error('arquivo digitalizado e o OCR não pôde ser feito: envie a versão com texto');
  if (d.warnings.some(w => /conversão indisponível|não pôde ser convertido/.test(w))) throw new Error(d.warnings[0]);
  if ((d.via === 'ocr' || d.kind === 'imagem') && !d.text.trim()) throw new Error('arquivo digitalizado sem texto legível pelo OCR: envie a versão com texto');
  if (d.warnings.some(w => /não reconhecido|não pôde ser aberto|inválido|não é uma NF-e/.test(w))) throw new Error(d.warnings[0]);
  return { text: d.text, warnings: d.warnings };
}

export function makeIndexer(db: Db, objects: ObjectStore, converter?: Converter) {
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
        const ext = KB_TYPES[v.mime];
        if (!ext) throw new Error('tipo de arquivo não suportado: ' + v.mime);
        const { text } = await extractForKb(`${v.title}.${ext}`, await objects.get(v.object_key), converter);
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
