// Pacote portátil de um assistente: instruções, exemplos, schema da saída e
// checklist de revisão em Markdown, para rodar a melhoria em outra plataforma
// (ChatGPT, Claude, Gemini). A definição da melhoria não fica presa à GreenIA.
// O que a GreenIA faz em código (conferência, checklist por regras, leitores
// especializados por parser) vira instrução explícita, com o aviso de que ali depende do
// modelo e precisa de conferência humana.
import JSZip from 'jszip';
import type { AssistantDefinition } from './schema.ts';
import type { PipelineStep } from '../blocks/params.ts';
import { readerById, readerKinds, readersUsedBy } from '../readers/registry.ts';

export interface PackageMeta { slug: string; name: string; area: string | null; status: string; version: number; tenantName: string }

const KIND_LABEL: Record<string, string> = {
  pdf: 'PDF', imagem: 'imagem (JPG, PNG, TIFF, HEIC)', docx: 'Word (DOCX, DOC, ODT)', xlsx: 'Excel (XLSX, XLS, ODS)', csv: 'CSV', texto: 'texto (TXT, MD)',
};
// Tipos acrescentados por leitores especializados usam o rótulo do leitor.
const kindLabel = (k: string) => KIND_LABEL[k] ?? readerKinds().find(x => x.id === k)?.label ?? k;

const list = (items: string[]) => items.map(i => `- ${i}`).join('\n');
const json = (v: unknown) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';

function refLabel(r: { de: string; leitor?: string; arquivo?: string; planilha?: string; bloco?: string; caminho?: string }) {
  const parts = [r.de === 'leitor' ? (readerById(r.leitor ?? '')?.label ?? 'leitor ' + r.leitor) : r.de === 'tabela' ? 'planilha' : 'dados extraídos'];
  if (r.arquivo) parts.push(`arquivo "${r.arquivo}"`);
  if (r.planilha) parts.push(`aba "${r.planilha}"`);
  if (r.bloco) parts.push(`da etapa "${r.bloco}"`);
  if (r.caminho) parts.push(`campo "${r.caminho}"`);
  return parts.join(', ');
}

// Cada bloco descrito como passo de instrução.
export function describeStep(s: PipelineStep, n: number, readerIds: string[] = []): string {
  const p = s.params as Record<string, any>;
  const head = `### Etapa ${n}: ${s.titulo || s.bloco}`;
  switch (s.bloco) {
    case 'ler':
      return `${head}\nLeia todos os arquivos enviados. Em PDF escaneado ou imagem, leia o conteúdo visível.${readerIds.map(id => readerById(id)?.instruction).filter(Boolean).map(t => ' ' + t).join('')}`;
    case 'extrair':
      return `${head}\nExtraia ${p.por === 'conjunto' ? 'do conjunto de documentos' : 'de cada documento'} os campos do schema abaixo. Para cada campo, indique a página ou o trecho de origem. Se um campo não aparecer no documento, deixe vazio e diga que não foi encontrado: nunca complete por suposição.${p.instrucoes ? '\n\n' + p.instrucoes : ''}\n\n${json(p.schema)}`;
    case 'conferir': {
      const rules = (p.regras as any[]).map(r => {
        const extra = r.tipo === 'numero' && r.tolerancia ? ` (tolerância ${[r.tolerancia.absoluta !== undefined ? r.tolerancia.absoluta : null, r.tolerancia.percentual !== undefined ? r.tolerancia.percentual + '%' : null].filter(x => x !== null).join(' ou ')})`
          : r.tipo === 'data' && r.prazoDias !== undefined ? ` (até ${r.prazoDias} dias depois da data ${r.referencia === 'direita' ? 'da direita' : 'da esquerda'})` : r.tipo === 'texto' ? ' (sem diferenciar maiúsculas, acentos e espaços)' : '';
        return `| ${r.campo} | ${r.esquerda} | ${r.direita} | ${r.tipo}${extra} |`;
      }).join('\n');
      return `${head}\nCompare ${p.rotulos?.esquerda ?? 'Documento'} (${refLabel(p.esquerda)}) com ${p.rotulos?.direita ?? 'Referência'} (${refLabel(p.direita)})${p.chave ? `, casando os registros por ${p.chave.esquerda} = ${p.chave.direita}` : ''}. Liste cada divergência com os dois valores e onde cada um aparece.${p.semPar === 'divergencia' ? ' Registro sem par do outro lado também é divergência.' : ''}\n\n| Campo | ${p.rotulos?.esquerda ?? 'Documento'} | ${p.rotulos?.direita ?? 'Referência'} | Regra |\n|---|---|---|---|\n${rules}\n\n> Na GreenIA esta comparação é feita em código. Em outra plataforma, depende do modelo: confira as divergências antes de usar.`;
    }
    case 'checklist':
      return `${head}\nPara cada item abaixo, marque **presente**, **ausente** ou **duvidoso**, a partir dos arquivos enviados. Duvidoso sempre vai para revisão humana.\n\n${list((p.itens as any[]).map(i => `${i.nome}${i.obrigatorio ? ' (obrigatório)' : ''}${i.sinonimos.length ? ` — também aparece como: ${i.sinonimos.join(', ')}` : ''}`))}`;
    case 'classificar':
      return `${head}\nClassifique cada documento numa das categorias abaixo, identifique o período (mês/ano) e sugira um nome no padrão \`${p.padraoNome}\`. Gere um índice com documento, categoria, período e nome sugerido.\n\n${list((p.taxonomia as any[]).map(t => `${t.nome}${t.sinonimos.length ? ` (${t.sinonimos.join(', ')})` : ''}`))}`;
    case 'consultar':
      return `${head}\nResponda só com base nos documentos de procedimento anexados, citando o documento e a versão. Se os documentos não cobrirem a pergunta, diga isso e indique o key user da área.${p.instrucoes ? '\n\n' + p.instrucoes : ''}`;
    case 'buscar':
      return `${head}\nLocalize nos documentos anexados os que respondem ao pedido e liste até ${p.limite}, com o trecho relevante.`;
    case 'resumir':
      return `${head}\nResuma em até ${p.palavrasMax} palavras, sempre com estes tópicos, nesta ordem:\n\n${list(p.topicos)}${p.instrucoes ? '\n\n' + p.instrucoes : ''}`;
    case 'exportar':
      return `${head}\nEntregue o resultado revisado nos formatos: ${(p.formatos as string[]).join(', ').toUpperCase()}.`;
  }
}

export function buildPackageFiles(def: AssistantDefinition, meta: PackageMeta): Record<string, string> {
  const inputs: string[] = [];
  if (def.inputs.text.enabled) inputs.push(`${def.inputs.text.label}${def.inputs.text.required ? ' (obrigatório)' : ''}`);
  if (def.inputs.files.enabled) inputs.push(`Arquivos: ${def.inputs.files.accept.map(kindLabel).join(', ')}; até ${def.inputs.files.maxFiles} arquivos de ${def.inputs.files.maxFileMb} MB`);
  if (def.inputs.knowledge.enabled) inputs.push('Documentos de procedimento da área (anexe à base do projeto na outra plataforma)');

  const instrucoes = [
    `# ${meta.name}: instruções`,
    def.objective ? `## Objetivo\n${def.objective}` : '',
    def.instructions ? `## Instruções\n${def.instructions}` : '',
    inputs.length ? `## O que a pessoa envia\n${list(inputs)}` : '',
    def.pipeline.length ? `## Como trabalhar\n\n${def.pipeline.map((s, i) => describeStep(s, i + 1, readersUsedBy(def))).join('\n\n')}` : '',
    `## Saída\nFormato: ${def.output.format}.${def.output.schema ? ' A saída segue o schema em `schema-saida.json`.' : ''}${def.output.files.length ? ` Arquivos: ${def.output.files.join(', ').toUpperCase()}.` : ''}`,
    `## Regras de dados\nClasses de dado aceitas: ${def.dataClasses.join(', ')}. Não envie senhas, tokens ou chaves. Siga a Política de Uso de IA da empresa.`,
    def.review.required ? '## Revisão humana\nToda saída é um rascunho até uma pessoa revisar, conforme `checklist-revisao.md`.' : '',
  ].filter(Boolean).join('\n\n');

  const exemplos = [`# ${meta.name}: exemplos`, ...def.examples.map((e, i) => `## Exemplo ${i + 1}${e.nota ? `: ${e.nota}` : ''}\n\n**Entrada**\n\n${e.entrada}\n\n**Saída esperada**\n\n${e.saida}`)]
    .join('\n\n') + (def.examples.length ? '' : '\n\nSem exemplos cadastrados.');

  const reviewItems = [...def.review.checklist];
  for (const s of def.pipeline) {
    const p = s.params as Record<string, any>;
    if (s.bloco === 'conferir') reviewItems.push('Cada divergência listada confere com os dois documentos de origem.');
    if (s.bloco === 'checklist') reviewItems.push('Cada item marcado como duvidoso foi verificado no arquivo.');
    if (s.bloco === 'extrair') reviewItems.push('Campos vazios ou sem origem foram conferidos no documento; nada foi preenchido por suposição.');
    if (s.bloco === 'resumir') reviewItems.push(`O resumo tem os tópicos: ${(p.topicos as string[]).join(', ')}.`);
    if (s.bloco === 'consultar') reviewItems.push('A resposta cita o documento e a versão usados.');
  }
  const checklist = `# ${meta.name}: checklist de revisão\n\nQuem revisa: ${def.review.reviewers.join(', ')}.\n\n${[...new Set(reviewItems)].map(i => `- [ ] ${i}`).join('\n') || '- [ ] A saída responde ao pedido e não contém dado sensível indevido.'}\n\nResultado: aprovado, aprovado com edição (guarde a versão editada) ou rejeitado (com motivo).`;

  const schemas: Record<string, unknown> = {};
  if (def.output.schema) schemas.saida = def.output.schema;
  for (const s of def.pipeline) if (s.bloco === 'extrair') schemas[`extracao_${s.id}`] = (s.params as { schema: unknown }).schema;

  const readme = [
    `# ${meta.name}`,
    `Melhoria de ${meta.tenantName}${meta.area ? `, área ${meta.area}` : ''}. Versão ${meta.version} (${meta.status}).${def.description ? '\n\n' + def.description : ''}`,
    '## Como usar em outra plataforma',
    list([
      'ChatGPT: crie um GPT (ou Projeto) e cole `instrucoes.md` nas instruções. Anexe os documentos de procedimento, se houver.',
      'Claude: crie um Projeto, cole `instrucoes.md` nas instruções do projeto e adicione os documentos ao conhecimento do projeto.',
      'Gemini: crie um Gem e cole `instrucoes.md` nas instruções.',
      'Use `exemplos.md` como exemplos de entrada e saída, e `schema-saida.json` quando a plataforma aceitar saída estruturada.',
      'Revise cada saída com `checklist-revisao.md` antes de usar.',
    ]),
    '## Arquivos',
    list(['`instrucoes.md`', '`exemplos.md`', '`schema-saida.json`', '`checklist-revisao.md`', '`definicao.json` (definição completa, para reimportar na GreenIA)']),
  ].join('\n\n');

  return {
    'README.md': readme + '\n',
    'instrucoes.md': instrucoes + '\n',
    'exemplos.md': exemplos + '\n',
    'schema-saida.json': JSON.stringify(schemas, null, 2) + '\n',
    'checklist-revisao.md': checklist + '\n',
    'definicao.json': JSON.stringify({ ...meta, definition: def }, null, 2) + '\n',
  };
}

export async function buildPackageZip(def: AssistantDefinition, meta: PackageMeta): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder(meta.slug)!;
  for (const [name, content] of Object.entries(buildPackageFiles(def, meta))) folder.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Versão em um único Markdown (para colar direto).
export function buildPackageMarkdown(def: AssistantDefinition, meta: PackageMeta): string {
  const f = buildPackageFiles(def, meta);
  return [f['README.md'], f['instrucoes.md'], f['exemplos.md'], f['checklist-revisao.md'], '# Schema da saída\n\n' + json(JSON.parse(f['schema-saida.json']))].join('\n---\n\n');
}
