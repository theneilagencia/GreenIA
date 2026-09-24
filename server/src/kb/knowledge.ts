// Busca na base de conhecimento, atrás de uma interface para trocar ou combinar
// implementações (palavra-chave hoje; embeddings no pgvector depois da medição)
// sem mexer no resto.
import core from '../../../lib/greenia-core.js';
import type { Tx } from '../db/pool.ts';

export interface KnowledgeHit {
  documentId: string;
  version: number;
  title: string;
  text: string;
}

export interface SearchOptions {
  previousUserText?: string; // pergunta de seguimento: soma a mensagem anterior se a última não achar nada
  areaId?: string | null;    // restringe à área (mais os documentos gerais)
  limit?: number;
}

// A transação já vem com o contexto do tenant e das áreas da pessoa (RLS).
export interface KnowledgeSource {
  readonly id: string;
  search(tx: Tx, query: string, opts?: SearchOptions): Promise<KnowledgeHit[]>;
}

// Termos normalizados de um texto, iguais aos da busca da Fase 1.
export const searchTerms = (text: string) => core.tokenizePt(text).join(' ');

// Palavra-chave: o Postgres traz candidatos que tenham algum termo da pergunta
// (índice GIN), e a pontuação da Fase 1 (título pesa mais, mínimo 2) decide.
export class KeywordKnowledgeSource implements KnowledgeSource {
  readonly id = 'palavra-chave';

  async search(tx: Tx, query: string, opts: SearchOptions = {}) {
    const hits = await this.once(tx, query, opts);
    if (hits.length || !opts.previousUserText) return hits;
    return this.once(tx, opts.previousUserText + ' ' + query, opts);
  }

  private async once(tx: Tx, query: string, opts: SearchOptions): Promise<KnowledgeHit[]> {
    const terms = [...new Set(core.tokenizePt(query))].filter(t => /^[a-z0-9]+$/.test(t));
    if (!terms.length) return [];
    const rows = (await tx.query(
      `select c.document_id, c.version, c.title, c.text
       from kb_chunks c join kb_documents d on d.id = c.document_id and d.current_version = c.version
       where c.tsv @@ to_tsquery('simple', $1)
         and ($2::uuid is null or c.area_id is null or c.area_id = $2::uuid)
       limit 200`,
      [terms.join(' | '), opts.areaId ?? null])).rows;
    const docs = rows.map(r => ({ documentId: r.document_id as string, version: r.version as number, title: r.title as string, text: r.text as string }));
    return core.retrieve(docs, query).slice(0, opts.limit ?? 3);
  }
}

// Quebra o texto em trechos de até ~1200 caracteres, por parágrafo.
export function chunkText(text: string, max = 1200): string[] {
  const paras = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > max) {
      push();
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((cur + ' ' + s).length > max) push();
        cur += (cur ? ' ' : '') + s;
      }
      push();
    } else if ((cur + '\n\n' + p).length > max) {
      push();
      cur = p;
    } else {
      cur += (cur ? '\n\n' : '') + p;
    }
  }
  push();
  return out;
}
