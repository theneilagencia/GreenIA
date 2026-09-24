// Blocos 6, 7 e 8: consulta à base, busca e localização, resumo para análise.
import core from '../../../lib/greenia-core.js';
import { buscarParams, consultarParams, resumirParams, type PipelineStep } from './params.ts';
import type { ReviewFlag, RunContext, Section } from './types.ts';
import { normPt } from '../util/text.ts';

export interface Fonte { documentId: string; version: number; title: string }

// Bloco 6: perguntas sobre procedimentos internos, respondidas só com a base da
// área, citando documento e versão. Sem documento na base: a resposta diz isso
// e indica o key user, sem chamar o modelo.
export async function consultarBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = consultarParams.parse(step.params);
  const flags: ReviewFlag[] = [];
  const pergunta = ctx.text.trim();
  const base = { id: step.id, bloco: 'consultar', titulo: step.titulo || 'Resposta da base', kind: 'resposta' as const };
  if (!pergunta) return { ...base, data: { pergunta, resposta: '', fontes: [], coberto: false }, flags: [{ reason: 'nenhuma pergunta enviada' }] };
  const areas = p.areas ?? (ctx.def.inputs.knowledge.areas.length ? ctx.def.inputs.knowledge.areas : undefined);
  const hits = await ctx.env.searchKnowledge(pergunta, { areas, limit: 3 });
  const gap = gapFlag(ctx);
  if (gap) flags.push(gap);
  const naoCobre = `A base de conhecimento não cobre essa pergunta. ${ctx.env.keyUserContact ? `Fale com ${ctx.env.keyUserContact}.` : 'Fale com o key user da sua área.'}`;
  if (!hits.length) return { ...base, data: { pergunta, resposta: naoCobre, fontes: [], coberto: false }, flags };

  const fontes: Fonte[] = hits.map(h => ({ documentId: h.documentId, version: h.version, title: h.title }));
  const reply = await ctx.env.complete({
    purpose: 'consulta à base',
    system: [
      'Você responde perguntas sobre procedimentos internos usando só os documentos fornecidos.',
      'Cite a fonte de cada informação no formato [Título do documento, v N].',
      `Se os documentos não responderem à pergunta, responda exatamente: "${naoCobre}"`,
      'Frases curtas, sem inventar prazos, valores ou regras.',
      p.instrucoes,
    ].filter(Boolean).join('\n'),
    content: [{ type: 'text', text: hits.map(h => `### ${h.title} (v ${h.version})\n${h.text}`).join('\n\n') + `\n\nPergunta: ${pergunta}` }],
    maxOutputTokens: 1500,
  });
  if (reply.blocked?.length) {
    return { ...base, data: { pergunta, resposta: '', fontes, coberto: false }, flags: [{ reason: 'não enviado ao modelo: contém ' + reply.blocked.join(', ') }] };
  }
  const resposta = reply.text.trim();
  const coberto = !normPt(resposta).includes(normPt('A base de conhecimento não cobre'));
  const citadas = fontes.filter(f => normPt(resposta).includes(normPt(f.title)));
  if (coberto && !citadas.length) flags.push({ reason: 'resposta sem citação de documento da base' });
  return { ...base, data: { pergunta, resposta, fontes: coberto ? (citadas.length ? citadas : fontes) : [], coberto }, flags };
}

// Bloco 7: busca nos documentos indexados do tenant (respeitando as áreas, pela
// RLS) e, opcionalmente, nos arquivos enviados na execução.
export async function buscarBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = buscarParams.parse(step.params);
  const consulta = ctx.text.trim();
  const base = { id: step.id, bloco: 'buscar', titulo: step.titulo || 'Documentos encontrados', kind: 'busca' as const };
  if (!consulta) return { ...base, data: { consulta, resultados: [] }, flags: [{ reason: 'nenhum termo de busca enviado' }] };
  const areas = ctx.def.inputs.knowledge.areas.length ? ctx.def.inputs.knowledge.areas : undefined;
  const hits = await ctx.env.searchKnowledge(consulta, { areas, limit: p.limite });
  const gap = gapFlag(ctx);
  const resultados: { origem: 'base' | 'envio'; titulo: string; documentId?: string; version?: number; trecho: string }[] =
    hits.map(h => ({ origem: 'base', titulo: h.title, documentId: h.documentId, version: h.version, trecho: excerpt(h.text, consulta) }));
  if (p.incluirEntradas && ctx.docs.length) {
    const found = core.retrieve(ctx.docs.map(d => ({ title: d.name, text: d.text })), consulta);
    for (const d of found) resultados.push({ origem: 'envio', titulo: d.title, trecho: excerpt(d.text, consulta) });
  }
  return { ...base, data: { consulta, resultados: resultados.slice(0, p.limite) }, flags: gap ? [gap] : [] };
}

// Base vinculada ao assistente que a pessoa não pode ler: avisa, sem conteúdo.
function gapFlag(ctx: RunContext): ReviewFlag | null {
  const gaps = ctx.env.knowledgeGaps ?? [];
  return gaps.length ? { reason: `fonte não disponível para você: base de ${gaps.join(', ')}. A consulta usou só as bases que você pode ler.` } : null;
}

// Trecho em volta do primeiro termo encontrado.
export function excerpt(text: string, query: string, size = 240): string {
  const terms = core.tokenizePt(query);
  const n = normPt(text);
  const pos = terms.map(t => n.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, pos - size / 3);
  return (start > 0 ? '… ' : '') + text.slice(start, start + size).replace(/\s+/g, ' ').trim() + (start + size < text.length ? ' …' : '');
}

// Bloco 8: resumo para análise, com os tópicos fixos do assistente. Tópico que
// não vier na resposta vai para revisão; nada é preenchido pela plataforma.
export async function resumirBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = resumirParams.parse(step.params);
  const flags: ReviewFlag[] = [];
  const base = { id: step.id, bloco: 'resumir', titulo: step.titulo || 'Resumo para análise', kind: 'resumo' as const };
  const material = [ctx.text.trim() ? `### Texto enviado\n${ctx.text.trim()}` : '', ...ctx.docs.map(d => `### Documento: ${d.name}\n${d.text}`)].filter(Boolean).join('\n\n');
  if (!material) return { ...base, data: { topicos: p.topicos.map(t => ({ titulo: t, texto: '' })), fontes: [] }, flags: [{ reason: 'nada para resumir' }] };
  const reply = await ctx.env.complete({
    purpose: 'resumo',
    system: [
      'Você prepara resumos para análise. Use só o material fornecido; não estime números que não estejam nele.',
      `Escreva em até ${p.palavrasMax} palavras, com exatamente estes tópicos, nesta ordem, cada um começando por "## " e o nome do tópico:`,
      ...p.topicos.map(t => `## ${t}`),
      'Se o material não tiver informação para um tópico, escreva "Sem informação no material."',
      p.instrucoes,
    ].filter(Boolean).join('\n'),
    content: [{ type: 'text', text: material }],
    maxOutputTokens: Math.min(8000, Math.ceil(p.palavrasMax * 2.5) + 200),
  });
  const fontes = ctx.docs.map(d => d.name);
  if (reply.blocked?.length) return { ...base, data: { topicos: p.topicos.map(t => ({ titulo: t, texto: '' })), fontes }, flags: [{ reason: 'não enviado ao modelo: contém ' + reply.blocked.join(', ') }] };
  const parts = new Map<string, string>();
  const re = /^##\s+(.+)$/gm;
  const text = reply.text;
  const heads = [...text.matchAll(re)];
  heads.forEach((h, i) => parts.set(normPt(h[1]), text.slice(h.index! + h[0].length, heads[i + 1]?.index ?? text.length).trim()));
  const topicos = p.topicos.map(t => {
    const texto = parts.get(normPt(t));
    if (texto === undefined) flags.push({ reason: `tópico ausente no resumo: ${t}` });
    return { titulo: t, texto: texto ?? '' };
  });
  const words = topicos.reduce((n, t) => n + (t.texto.match(/\S+/g)?.length ?? 0), 0);
  if (words > p.palavrasMax * 1.1) flags.push({ reason: `resumo com ${words} palavras, acima do limite de ${p.palavrasMax}` });
  return { ...base, data: { topicos, fontes }, flags };
}
