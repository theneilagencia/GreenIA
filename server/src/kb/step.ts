// Etapa do chat: busca na base (áreas da pessoa, e só a área do assistente se
// ele tiver uma), junta os trechos à última pergunta e registra, ao final, quais
// documentos e versões a resposta usou.
import { withTenant } from '../db/pool.ts';
import { tenantCtx } from '../auth/session.ts';
import { audit } from '../audit.ts';
import type { ChatStep } from '../chat/hooks.ts';
import type { KnowledgeHit } from './knowledge.ts';

export const knowledgeStep: ChatStep = {
  name: 'base-de-conhecimento',
  async prepare({ app, auth, body }, state) {
    if (body.useKnowledge === false) return;
    const userIdx = state.messages.map((m, i) => (m.role === 'user' ? i : -1)).filter(i => i >= 0);
    const last = userIdx[userIdx.length - 1];
    const prev = userIdx.length > 1 ? state.messages[userIdx[userIdx.length - 2]].content : undefined;
    const question = state.messages[last].content;
    const hits = await withTenant(app.deps.db, tenantCtx(auth), tx =>
      app.deps.knowledge.search(tx, question, { previousUserText: prev, areaId: state.assistant?.areaId ?? null }));
    state.kbHits = hits;
    if (!hits.length) return;
    const ctx = hits.map((h, i) => `[${i + 1}] ${h.title} (versão ${h.version}): ${h.text}`).join('\n');
    state.messages[last] = {
      role: 'user',
      content: 'Trechos da base de conhecimento (use quando ajudarem na resposta e cite a fonte pelo título; se a base não cobrir o pedido, diga com calma que não encontrou na base):\n' + ctx + '\n\nPergunta: ' + question,
    };
    state.meta.sources = hits.map(h => ({ title: h.title, documentId: h.documentId, version: h.version }));
  },
  async completed({ app, auth, model, usage }, state) {
    const hits = (state.kbHits as KnowledgeHit[] | undefined) || [];
    await withTenant(app.deps.db, tenantCtx(auth), tx => audit(tx, {
      tenantId: auth.tenantId, actorUserId: auth.userId, action: 'resposta_gerada',
      target: state.assistant ? `assistente:${state.assistant.slug}@${state.assistant.version}` : 'chat',
      details: {
        modelo: model,
        tokens: { entrada: usage.inputTokens, saida: usage.outputTokens },
        fontes: hits.map(h => ({ documento: h.documentId, versao: h.version })),
      },
    }));
  },
};
