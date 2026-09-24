// Bloco 4: checklist de pendências. O assistente declara os itens obrigatórios
// (ex.: documentos de admissão); a partir dos arquivos enviados, cada item fica
// presente, ausente ou duvidoso. Duvidoso sempre vai para revisão.
//
// Método "regras" (sem modelo):
//   presente  nome do arquivo contém o nome ou um sinônimo do item, ou o
//             conteúdo o traz no começo do documento (título, cabeçalho);
//   duvidoso  só aparece no meio do texto, ou o mesmo arquivo casa com mais de
//             um item só pelo conteúdo;
//   ausente   nada encontrado.
// Método "modelo": o modelo indica, por arquivo, o item e a confiança; confiança
// baixa ou média, ou trecho que não está no arquivo, fica duvidoso.
import { checklistParams, type PipelineStep } from './params.ts';
import type { ReadDoc, ReviewFlag, RunContext, Section } from './types.ts';
import { containsPhrase } from './values.ts';
import { normPt } from '../util/text.ts';
import { parseJsonReply } from './extrair.ts';

export type StatusItem = 'presente' | 'ausente' | 'duvidoso';

export interface Evidencia { arquivo: string; como: string }
export interface ItemChecklist { id: string; nome: string; obrigatorio: boolean; status: StatusItem; evidencias: Evidencia[]; motivo: string }
export interface ResultadoChecklist { itens: ItemChecklist[]; naoIdentificados: string[]; resumo: Record<StatusItem, number> }

const HEAD_CHARS = 300;
type Item = ReturnType<typeof checklistParams.parse>['itens'][number];

const fileBase = (name: string) => normPt(name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' '));

function byRules(items: Item[], docs: ReadDoc[]) {
  const hits = new Map<string, { strong: Evidencia[]; weak: Evidencia[] }>(items.map(i => [i.id, { strong: [], weak: [] }]));
  const contentOnly = new Map<string, string[]>();                      // arquivo → itens casados só pelo conteúdo
  for (const d of docs) {
    const nameN = fileBase(d.name);
    const head = normPt(d.text.slice(0, HEAD_CHARS));
    const body = normPt(d.text);
    for (const it of items) {
      const terms = [it.nome, ...it.sinonimos];
      const h = hits.get(it.id)!;
      if (terms.some(t => containsPhrase(nameN, t))) { h.strong.push({ arquivo: d.name, como: 'nome do arquivo' }); continue; }
      const term = terms.find(t => containsPhrase(head, t));
      if (term) {
        h.strong.push({ arquivo: d.name, como: `conteúdo, no início ("${term}")` });
        contentOnly.set(d.name, [...(contentOnly.get(d.name) || []), it.id]);
        continue;
      }
      const deep = terms.find(t => containsPhrase(body, t));
      if (deep) h.weak.push({ arquivo: d.name, como: `conteúdo, no meio do texto ("${deep}")` });
    }
  }
  return items.map((it): ItemChecklist => {
    const h = hits.get(it.id)!;
    const ambiguous = h.strong.filter(e => e.como.startsWith('conteúdo') && (contentOnly.get(e.arquivo)?.length ?? 0) > 1);
    const clear = h.strong.filter(e => !ambiguous.includes(e));
    if (clear.length) return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'presente', evidencias: clear, motivo: '' };
    if (ambiguous.length) return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'duvidoso', evidencias: ambiguous, motivo: 'o mesmo arquivo parece conter mais de um item' };
    if (h.weak.length) return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'duvidoso', evidencias: h.weak, motivo: 'citado no texto, mas não parece ser o próprio documento' };
    return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'ausente', evidencias: [], motivo: '' };
  });
}

async function byModel(ctx: RunContext, items: Item[], docs: ReadDoc[], flags: ReviewFlag[]): Promise<ItemChecklist[]> {
  const reply = await ctx.env.complete({
    purpose: 'checklist',
    system: 'Você identifica documentos. Para cada arquivo, diga a qual item da lista ele corresponde (ou null), com confiança "alta", "media" ou "baixa" e um trecho copiado do arquivo que justifique. Responda só com JSON: {"arquivos": [{"arquivo": "...", "item": "id ou null", "confianca": "...", "trecho": "..."}]}.',
    content: [{ type: 'text', text: `Itens:\n${items.map(i => `- ${i.id}: ${i.nome}${i.sinonimos.length ? ` (${i.sinonimos.join(', ')})` : ''}`).join('\n')}\n\n${docs.map(d => `### Arquivo: ${d.name}\n${d.text.slice(0, 3000)}`).join('\n\n')}` }],
    jsonSchema: { type: 'object', properties: { arquivos: { type: 'array', items: { type: 'object', properties: { arquivo: { type: 'string' }, item: { type: ['string', 'null'] }, confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] }, trecho: { type: 'string' } }, required: ['arquivo', 'item', 'confianca', 'trecho'] } } }, required: ['arquivos'] },
    maxOutputTokens: 3000,
  });
  let answers: { arquivo: string; item: string | null; confianca: string; trecho: string }[] = [];
  try {
    if (reply.blocked?.length) throw new Error('não enviado ao modelo: contém ' + reply.blocked.join(', '));
    answers = (parseJsonReply(reply.text) as { arquivos: typeof answers }).arquivos;
    if (!Array.isArray(answers)) throw new Error('resposta fora do formato');
  } catch (e) {
    flags.push({ reason: 'checklist pelo modelo falhou: ' + (e as Error).message + '; todos os itens ficam duvidosos' });
    return items.map(it => ({ id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'duvidoso', evidencias: [], motivo: 'modelo não respondeu no formato esperado' }));
  }
  return items.map((it): ItemChecklist => {
    const mine = answers.filter(a => a.item === it.id);
    const ev = (a: typeof mine[number]) => {
      const doc = docs.find(d => d.name === a.arquivo);
      const confere = !!doc && !!a.trecho && normPt(doc.text).includes(normPt(a.trecho));
      return { a, confere, e: { arquivo: a.arquivo, como: `modelo, confiança ${a.confianca}${confere ? '' : ', trecho não encontrado no arquivo'}` } };
    };
    const all = mine.map(ev);
    const sure = all.filter(x => x.a.confianca === 'alta' && x.confere);
    if (sure.length) return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'presente', evidencias: sure.map(x => x.e), motivo: '' };
    if (all.length) return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'duvidoso', evidencias: all.map(x => x.e), motivo: 'identificação com baixa confiança ou sem trecho que confira' };
    return { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio, status: 'ausente', evidencias: [], motivo: '' };
  });
}

export async function checklistBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = checklistParams.parse(step.params);
  const flags: ReviewFlag[] = [];
  const docs = ctx.docs;
  if (!docs.length) flags.push({ reason: 'nenhum arquivo lido para conferir o checklist' });
  const itens = p.metodo === 'modelo' && docs.length ? await byModel(ctx, p.itens, docs, flags) : byRules(p.itens, docs);
  const used = new Set(itens.flatMap(i => i.evidencias.map(e => e.arquivo)));
  const naoIdentificados = docs.map(d => d.name).filter(n => !used.has(n));
  for (const i of itens.filter(x => x.status === 'duvidoso')) flags.push({ reason: `item duvidoso: ${i.nome}${i.motivo ? ` (${i.motivo})` : ''}` });
  for (const n of naoIdentificados) flags.push({ reason: 'arquivo não corresponde a nenhum item', ref: n });
  const resumo = { presente: 0, ausente: 0, duvidoso: 0 } as Record<StatusItem, number>;
  for (const i of itens) resumo[i.status]++;
  const pendencias = itens.filter(i => i.status === 'duvidoso' || (i.status === 'ausente' && i.obrigatorio)).length;
  const data: ResultadoChecklist = { itens, naoIdentificados, resumo };
  return { id: step.id, bloco: 'checklist', titulo: step.titulo || 'Checklist', kind: 'checklist', data, flags, counts: { pendencias } };
}
