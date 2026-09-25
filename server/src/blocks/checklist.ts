// Bloco 4: checklist de pendências. O assistente declara os itens obrigatórios
// (ex.: documentos de admissão); a partir dos arquivos enviados, cada item fica
// presente, ausente ou duvidoso. Duvidoso sempre vai para revisão.
//
// Método "regras" (sem modelo), página por página: um arquivo pode trazer vários
// documentos (RG e CPF no mesmo PDF), e a saída diz a página de cada item.
//   documento  o título da página (primeira linha útil ou linha de título) traz o
//              nome ou um sinônimo do item; ou o nome do arquivo traz;
//   menção     o item aparece no corpo de uma página de outro documento (ficha,
//              atestado, comprovante, contrato);
// O item declara o que o satisfaz (evidencia): documento (padrão), menção, um dos
// dois ou os dois. Menção não satisfaz item que exige documento: o item fica
// duvidoso, com "mencionado em [arquivo], documento não encontrado".
// Linhas que se repetem em muitas páginas (marca d'água, rodapé) não contam como título.
// Método "modelo": o modelo indica, por arquivo, o item e a confiança; confiança
// baixa ou média, ou trecho que não está no arquivo, fica duvidoso.
import { checklistParams, type PipelineStep } from './params.ts';
import type { ReadDoc, ReviewFlag, RunContext, Section } from './types.ts';
import { normPt, stripAccents } from '../util/text.ts';
import { parseJsonReply } from './extrair.ts';

export type StatusItem = 'presente' | 'ausente' | 'duvidoso';

export interface Evidencia { arquivo: string; pagina?: number; como: string }
export interface ItemChecklist { id: string; nome: string; obrigatorio: boolean; status: StatusItem; evidencias: Evidencia[]; motivo: string; mencoes?: Evidencia[] }
export interface ResultadoChecklist { itens: ItemChecklist[]; naoIdentificados: string[]; resumo: Record<StatusItem, number>; leitura?: string }

type Item = ReturnType<typeof checklistParams.parse>['itens'][number];
interface Pagina { doc: ReadDoc; n: number; titulos: string[]; corpo: string }

const fileBase = (name: string) => normPt(name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' '));
const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');

// Texto sem acento e com espaços simples, mantendo maiúsculas (para as siglas).
const semAcento = (t: string) => stripAccents(t).replace(/\s+/g, ' ').trim();
// Sigla escrita em maiúsculas na configuração (RG, CPF, ART) só casa com maiúsculas
// no conteúdo: "ART" não casa com "art." de artigo de lei.
const sigla = (term: string) => /^[A-Z0-9]{2,5}$/.test(stripAccents(term).trim());

// Posições em que a frase aparece inteira no texto (sem acento).
function spans(text: string, phrase: string): [number, number][] {
  const cs = sigla(phrase);
  const p = cs ? stripAccents(phrase).trim() : normPt(phrase);
  if (!p) return [];
  const alvo = cs ? text : text.toLowerCase();
  const re = new RegExp(`(^|[^A-Za-z0-9])(${escape(p)})(?=[^A-Za-z0-9]|$)`, 'g');
  const out: [number, number][] = [];
  for (let m = re.exec(alvo); m; m = re.exec(alvo)) { const i = m.index + m[1].length; out.push([i, i + m[2].length]); re.lastIndex = i + 1; }
  return out;
}

// "Rótulo: valor com número" é dado de formulário, não título.
const linhaDeDado = (l: string) => /^[^:]{1,40}:\s*\S/.test(l) && /\d/.test(l.split(':').slice(1).join(':'));
function pareceTitulo(l: string) {
  const letras = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (l.length < 3 || l.length > 120 || letras.length < 3 || linhaDeDado(l)) return false;
  const maiusc = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  return maiusc / letras.length >= 0.8 && (l.match(/\d/g)?.length ?? 0) <= 4;
}

function paginas(docs: ReadDoc[]): Pagina[] {
  const brutas = docs.flatMap(d => (d.pages.length ? d.pages : [{ n: 1, text: d.text }]).map(pg => ({ doc: d, n: pg.n,
    linhas: pg.text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean) })));
  // Linha repetida em muitas páginas (marca d'água, cabeçalho de sistema, rodapé).
  const vezes = new Map<string, number>();
  for (const p of brutas) for (const l of new Set(p.linhas.map(normPt))) vezes.set(l, (vezes.get(l) ?? 0) + 1);
  const limite = Math.max(3, Math.ceil(brutas.length / 2));
  return brutas.map(p => {
    const uteis = p.linhas.filter(l => (vezes.get(normPt(l)) ?? 0) < limite);
    const primeira = uteis[0] && !linhaDeDado(uteis[0]) ? (uteis[0].length > 150 ? uteis[0].slice(0, 100) : uteis[0]) : null;
    const titulos = [...new Set([...(primeira ? [primeira] : []), ...uteis.filter(pareceTitulo)])].map(semAcento);
    return { doc: p.doc, n: p.n, titulos, corpo: semAcento(uteis.join('\n')) };
  });
}

// Itens cujo nome ou sinônimo está num título. Quando termos de itens diferentes se
// sobrepõem ("título" e "título de eleitor"), vale o mais longo.
function itensNoTexto(texto: string, items: Item[], comMencoes = false) {
  const hits: { id: string; term: string; s: number; e: number }[] = [];
  for (const it of items) for (const term of [it.nome, ...it.sinonimos, ...(comMencoes ? it.mencoes : [])]) for (const [s, e] of spans(texto, term)) hits.push({ id: it.id, term, s, e });
  return hits.filter(h => !hits.some(o => o.id !== h.id && o.s <= h.s && o.e >= h.e && o.e - o.s > h.e - h.s));
}

function byRules(items: Item[], docs: ReadDoc[]) {
  const pgs = paginas(docs);
  const doc = new Map<string, Evidencia[]>(items.map(i => [i.id, []]));
  const ambiguo = new Map<string, Evidencia[]>(items.map(i => [i.id, []]));
  const mencao = new Map<string, Evidencia[]>(items.map(i => [i.id, []]));
  const docPages = new Map<string, Set<string>>(items.map(i => [i.id, new Set()]));  // "arquivo#página" onde o item é o documento
  for (const p of pgs) {
    const naPagina = new Map<string, string>();
    for (const t of p.titulos) for (const h of itensNoTexto(t, items)) if (!naPagina.has(h.id)) naPagina.set(h.id, h.term);
    const ev = (id: string): Evidencia => ({ arquivo: p.doc.name, pagina: p.n, como: `título da página ${p.n} ("${naPagina.get(id)}")` });
    if (naPagina.size > 1) for (const id of naPagina.keys()) { ambiguo.get(id)!.push({ ...ev(id), como: `título da página ${p.n} traz mais de um item` }); docPages.get(id)!.add(`${p.doc.name}#${p.n}`); }
    else for (const id of naPagina.keys()) { doc.get(id)!.push(ev(id)); docPages.get(id)!.add(`${p.doc.name}#${p.n}`); }
  }
  // Nome do arquivo: vale como documento; a página é a primeira em que o título traz o item (ou a 1).
  for (const d of docs) {
    const nameN = fileBase(d.name);
    for (const it of items) {
      const term = [it.nome, ...it.sinonimos].find(t => spans(nameN, t.toLowerCase()).length);   // nome de arquivo: sem diferenciar maiúsculas
      if (!term || doc.get(it.id)!.some(e => e.arquivo === d.name)) continue;
      const pg = [...docPages.get(it.id)!].find(k => k.startsWith(d.name + '#'));
      const n = pg ? Number(pg.split('#').pop()) : (d.pages[0]?.n ?? 1);
      doc.get(it.id)!.push({ arquivo: d.name, pagina: n, como: `nome do arquivo ("${term}")` });
      docPages.get(it.id)!.add(`${d.name}#${n}`);
    }
  }
  // Menções: o item no corpo de uma página que não é o próprio documento dele.
  for (const p of pgs) {
    const achados = new Map<string, string>();
    for (const h of itensNoTexto(p.corpo, items, true)) if (!achados.has(h.id)) achados.set(h.id, h.term);
    for (const [id, term] of achados) {
      if (docPages.get(id)!.has(`${p.doc.name}#${p.n}`)) continue;
      mencao.get(id)!.push({ arquivo: p.doc.name, pagina: p.n, como: `mencionado na página ${p.n} ("${term}")` });
    }
  }
  return items.map((it): ItemChecklist => {
    const base = { id: it.id, nome: it.nome, obrigatorio: it.obrigatorio };
    const d = doc.get(it.id)!, a = ambiguo.get(it.id)!;
    const m = mencao.get(it.id)!.filter(x => !d.some(y => y.arquivo === x.arquivo && y.pagina === x.pagina));
    const onde = (xs: Evidencia[]) => [...new Set(xs.map(x => x.arquivo))].join(', ');
    const semDoc = `mencionado em ${onde(m)}, documento não encontrado`;
    const pede = it.evidencia;
    if (pede === 'mencao') {
      if (m.length || d.length) return { ...base, status: 'presente', evidencias: m.length ? m : d, motivo: '' };
      return { ...base, status: 'ausente', evidencias: [], motivo: '' };
    }
    if (pede === 'documento_ou_mencao' && (d.length || m.length)) return { ...base, status: 'presente', evidencias: d.length ? d : m, motivo: '', mencoes: d.length && m.length ? m : undefined };
    if (pede === 'documento_e_mencao') {
      if (d.length && m.length) return { ...base, status: 'presente', evidencias: d, mencoes: m, motivo: '' };
      if (d.length) return { ...base, status: 'duvidoso', evidencias: d, motivo: 'documento encontrado, sem a menção pedida' };
      if (m.length) return { ...base, status: 'duvidoso', evidencias: m, motivo: semDoc };
      if (a.length) return { ...base, status: 'duvidoso', evidencias: a, motivo: 'a mesma página parece conter mais de um item' };
      return { ...base, status: 'ausente', evidencias: [], motivo: '' };
    }
    if (d.length) return { ...base, status: 'presente', evidencias: d, motivo: '', mencoes: m.length ? m : undefined };
    if (a.length) return { ...base, status: 'duvidoso', evidencias: a, motivo: 'a mesma página parece conter mais de um item' };
    if (m.length) return { ...base, status: 'duvidoso', evidencias: m, motivo: semDoc };
    return { ...base, status: 'ausente', evidencias: [], motivo: '' };
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
  // Arquivo só citado (menção) não conta como identificado.
  const used = new Set(itens.flatMap(i => i.evidencias.filter(e => !e.como.startsWith('mencionado')).map(e => e.arquivo)));
  const naoIdentificados = docs.map(d => d.name).filter(n => !used.has(n));
  for (const i of itens.filter(x => x.status === 'duvidoso')) flags.push({ reason: `item duvidoso: ${i.nome}${i.motivo ? ` (${i.motivo})` : ''}` });
  for (const n of naoIdentificados) flags.push({ reason: 'arquivo não corresponde a nenhum item', ref: n });
  const resumo = { presente: 0, ausente: 0, duvidoso: 0 } as Record<StatusItem, number>;
  for (const i of itens) resumo[i.status]++;
  const pendencias = itens.filter(i => i.status === 'duvidoso' || (i.status === 'ausente' && i.obrigatorio)).length;
  const data: ResultadoChecklist = { itens, naoIdentificados, resumo, ...(p.metodo === 'modelo' ? { leitura: 'identificação pelo início de cada documento (primeiros 3.000 caracteres)' } : {}) };
  return { id: step.id, bloco: 'checklist', titulo: step.titulo || 'Checklist', kind: 'checklist', data, flags, counts: { pendencias } };
}
