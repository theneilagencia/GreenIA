// Etapa do chat: busca na base e junta os trechos à última pergunta; registra,
// ao final, quais documentos e versões a resposta usou.
// Com assistente, as bases consultadas são as vinculadas a ele (as áreas da
// definição; sem elas, a área dona) ∩ o que a pessoa pode ler, como nas
// execuções. Base vinculada que a pessoa não lê vira aviso na resposta ("fonte
// não disponível para você: base de X"), sem conteúdo, e vai para a auditoria:
// uma resposta incompleta sem aviso parece completa.
import { withTenant } from '../db/pool.ts';
import { tenantCtx } from '../auth/session.ts';
import { audit } from '../audit.ts';
import type { ChatStep } from '../chat/hooks.ts';
import type { AssistantDefinition } from '../assistants/schema.ts';
import type { KnowledgeHit } from './knowledge.ts';

export const avisoFonte = (base: string) => `fonte não disponível para você: base de ${base}`;

export const knowledgeStep: ChatStep = {
  name: 'base-de-conhecimento',
  async prepare({ app, auth, body }, state) {
    if (body.useKnowledge === false) return;
    const userIdx = state.messages.map((m, i) => (m.role === 'user' ? i : -1)).filter(i => i >= 0);
    const last = userIdx[userIdx.length - 1];
    const prev = userIdx.length > 1 ? state.messages[userIdx[userIdx.length - 2]].content : undefined;
    const question = state.messages[last].content;
    const assistant = state.assistant as { slug: string; version: number; areaId: string | null; definition: AssistantDefinition } | undefined;
    const { hits, gaps } = await withTenant(app.deps.db, tenantCtx(auth), async tx => {
      if (!assistant) return { hits: await app.deps.knowledge.search(tx, question, { previousUserText: prev, areaId: null }), gaps: [] as string[] };
      const slugs = assistant.definition.inputs.knowledge.areas;
      const linked = (slugs.length
        ? await tx.query(`select id, name, app_can_see_area(id) as ok from areas where slug = any($1) order by name`, [slugs])
        : await tx.query(`select id, name, app_can_see_area(id) as ok from areas where id = $1`, [assistant.areaId])).rows as { id: string; name: string; ok: boolean }[];
      const gaps = linked.filter(l => !l.ok).map(l => l.name);
      for (const g of gaps) {
        await audit(tx, { tenantId: auth.tenantId, actorUserId: auth.userId, action: 'fonte_indisponivel_para_a_pessoa', target: `assistente:${assistant.slug}@${assistant.version}`, details: { area: g, canal: 'chat' } });
      }
      const hits: KnowledgeHit[] = [];
      const areas = linked.length ? linked.filter(l => l.ok).map(l => l.id) : [assistant.areaId];
      for (const areaId of areas) {
        for (const h of await app.deps.knowledge.search(tx, question, { previousUserText: prev, areaId })) {
          if (!hits.some(x => x.documentId === h.documentId)) hits.push(h);
        }
      }
      return { hits, gaps };
    });
    state.kbHits = hits;
    if (gaps.length) {
      state.meta.avisos = gaps.map(avisoFonte);
      const nota = `Parte das fontes deste assistente não está disponível para esta pessoa (${gaps.map(g => 'base de ' + g).join(', ')}). Se a pergunta depender dessas fontes, diga que a fonte não está disponível para ela. Não invente o conteúdo.`;
      state.systemExtra = state.systemExtra ? `${state.systemExtra}\n\n${nota}` : nota;
    }
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
