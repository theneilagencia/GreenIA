// Parâmetros de cada bloco de capacidade, validados na definição do assistente.
// Um assistente é uma sequência desses blocos; nada de código por melhoria.
import { z } from 'zod';
import { LEGACY_DATASET_SOURCES, readerById, readerKinds } from '../readers/registry.ts';

// Tipos de arquivo genéricos que o bloco de leitura entende. Leitores
// especializados (src/readers/) acrescentam os seus (ex.: nfe_xml).
export const FILE_KINDS = ['pdf', 'imagem', 'docx', 'xlsx', 'csv', 'texto'] as const;
export type FileKind = string;
export const fileKindSchema = z.string().max(40).refine(k => (FILE_KINDS as readonly string[]).includes(k) || readerKinds().some(r => r.id === k), { message: 'tipo de arquivo desconhecido' });

// Seleção de um conjunto de dados produzido por blocos anteriores:
//   leitor    dados de um leitor especializado (leitor: id do registro; caminho dentro dos dados)
//   tabela    planilha XLSX/CSV (arquivo: padrão do nome, ex. '*pedido*'; planilha opcional;
//             orientacao 'chave_valor' para planilha de duas colunas Campo | Valor,
//             como o cabeçalho de um pedido: vira um único registro)
//   extraido  saída do bloco de extração (bloco: id do bloco; caminho opcional dentro do JSON)
//   importacao registros normalizados de um conjunto de dados do assistente, vindos
//             de arquivos exportados de qualquer sistema pelos mapeamentos do tenant
export const datasetRefSchema = z.preprocess(
  // Definições anteriores escreviam o leitor em "de": vira { de: 'leitor', leitor }.
  v => v && typeof v === 'object' && LEGACY_DATASET_SOURCES.includes((v as { de?: string }).de ?? '') ? { ...v, de: 'leitor', leitor: (v as { de: string }).de } : v,
  z.object({
  de: z.enum(['leitor', 'tabela', 'extraido', 'importacao']),
  leitor: z.string().max(40).optional(),
  conjunto: z.string().max(60).optional(),                 // importacao: id do conjunto de dados declarado no assistente
  // importacao: 'primeiro' junta os registros de cada arquivo em um (cabeçalho
  // repetido nas linhas), com as somas pedidas.
  registro: z.enum(['cada', 'primeiro']).default('cada'),
  somar: z.array(z.object({ campo: z.string().max(60), em: z.string().max(60) })).max(10).default([]),
  arquivo: z.string().max(200).optional(),
  planilha: z.string().max(100).optional(),
  bloco: z.string().max(60).optional(),
  caminho: z.string().max(200).optional(),
  orientacao: z.enum(['linhas', 'chave_valor']).default('linhas'),
}).refine(r => r.de !== 'leitor' || (!!r.leitor && !!readerById(r.leitor)), { message: 'informe um leitor registrado (leitor)' })
  .refine(r => r.de !== 'importacao' || !!r.conjunto, { message: 'informe o conjunto de dados (conjunto)' }));
export type DatasetRef = z.infer<typeof datasetRefSchema>;

const jsonSchemaObject = z.record(z.string(), z.unknown()).refine(s => s.type === 'object', 'o schema precisa ser do tipo object');

export const lerParams = z.object({
  tipos: z.array(fileKindSchema).optional(),          // restringe o que o bloco aceita (padrão: as entradas do assistente)
  // 'nunca' desliga o fallback de visão nesta etapa, mesmo que o assistente permita.
  // 'sempre' (definições antigas) vale como 'auto': a visão agora só entra como fallback do OCR.
  visao: z.preprocess(v => v === 'sempre' ? 'auto' : v, z.enum(['auto', 'nunca'])).default('auto'),
  paginasMax: z.number().int().min(1).max(500).default(50),
}).prefault({});

export const extrairParams = z.object({
  schema: jsonSchemaObject,                                 // JSON Schema dos campos
  instrucoes: z.string().max(4000).default(''),
  por: z.enum(['documento', 'conjunto']).default('documento'),
  tipos: z.array(fileKindSchema).optional(),            // de quais documentos extrair
});

const regraSchema = z.object({
  campo: z.string().min(1).max(80),                         // nome mostrado na divergência
  esquerda: z.string().min(1).max(200),                     // caminho no item da esquerda
  direita: z.string().min(1).max(200),
  tipo: z.enum(['igual', 'texto', 'numero', 'data']).default('igual'),
  tolerancia: z.object({ absoluta: z.number().min(0).optional(), percentual: z.number().min(0).max(100).optional() }).optional(),
  prazoDias: z.number().int().min(0).optional(),            // até N dias depois da data de referência
  referencia: z.enum(['esquerda', 'direita']).default('esquerda'), // de que lado começa o prazo
});

export const conferirParams = z.object({
  esquerda: datasetRefSchema,
  direita: datasetRefSchema,
  rotulos: z.object({ esquerda: z.string().max(60).default('Documento'), direita: z.string().max(60).default('Referência') }).prefault({}),
  chave: z.object({ esquerda: z.string().max(200), direita: z.string().max(200) }).optional(), // sem chave: compara um registro com um registro
  regras: z.array(regraSchema).min(1).max(100),
  semPar: z.enum(['divergencia', 'ignorar']).default('divergencia'),
});

// O que satisfaz um item do checklist:
//   documento            o próprio documento (título da página ou nome do arquivo)
//   mencao               o dado mencionado em qualquer documento
//   documento_ou_mencao  um dos dois
//   documento_e_mencao   os dois (ex.: a ART anexada e citada no contrato)
// Menção em outro documento não satisfaz item que exige documento: aparece na
// saída como "mencionado em [arquivo], documento não encontrado".
export const EVIDENCIAS_ITEM = ['documento', 'mencao', 'documento_ou_mencao', 'documento_e_mencao'] as const;
export const checklistParams = z.object({
  itens: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,60}$/),
    nome: z.string().min(1).max(120),
    sinonimos: z.array(z.string().min(2).max(80)).max(30).default([]),
    obrigatorio: z.boolean().default(true),
    evidencia: z.enum(EVIDENCIAS_ITEM).default('documento'),
    mencoes: z.array(z.string().min(2).max(80)).max(30).default([]),   // termos que contam como menção do dado (além do nome e dos sinônimos)
  })).min(1).max(200),
  metodo: z.enum(['regras', 'modelo']).default('regras'),
});

export const classificarParams = z.object({
  taxonomia: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,60}$/),
    nome: z.string().min(1).max(120),
    sinonimos: z.array(z.string().min(2).max(80)).max(30).default([]),
  })).min(1).max(200),
  metodo: z.enum(['regras', 'modelo']).default('regras'),
  padraoNome: z.string().max(200).default('{categoria}_{periodo}_{nome}'),
  pacoteZip: z.boolean().default(true),
});

export const consultarParams = z.object({
  areas: z.array(z.string()).optional(),                    // padrão: a área do assistente
  instrucoes: z.string().max(4000).default(''),
}).prefault({});

export const buscarParams = z.object({
  limite: z.number().int().min(1).max(50).default(10),
  incluirEntradas: z.boolean().default(true),               // procura também nos arquivos enviados na execução
}).prefault({});

export const resumirParams = z.object({
  topicos: z.array(z.string().min(1).max(80)).min(1).max(20),
  instrucoes: z.string().max(4000).default(''),
  palavrasMax: z.number().int().min(50).max(5000).default(600),
});

export const exportarParams = z.object({
  formatos: z.array(z.enum(['xlsx', 'csv', 'pdf', 'docx', 'zip'])).min(1),
}).prefault({ formatos: ['xlsx', 'pdf'] });

export const BLOCK_PARAMS = {
  ler: lerParams,
  extrair: extrairParams,
  conferir: conferirParams,
  checklist: checklistParams,
  classificar: classificarParams,
  consultar: consultarParams,
  buscar: buscarParams,
  resumir: resumirParams,
  exportar: exportarParams,
} as const;

export type BlockName = keyof typeof BLOCK_PARAMS;
export const BLOCK_NAMES = Object.keys(BLOCK_PARAMS) as BlockName[];

export const pipelineStepSchema = z.object({
  bloco: z.enum(BLOCK_NAMES as [BlockName, ...BlockName[]]),
  id: z.string().regex(/^[a-z0-9_-]{1,60}$/).optional(),
  titulo: z.string().max(120).optional(),
  params: z.unknown().optional(),
}).transform((s, ctx) => {
  const r = BLOCK_PARAMS[s.bloco].safeParse(s.params ?? undefined);
  if (!r.success) {
    for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: ['params', ...i.path.map(String)], message: i.message });
    return z.NEVER;
  }
  return { bloco: s.bloco, id: s.id ?? s.bloco, titulo: s.titulo, params: r.data as Record<string, unknown> };
});
export type PipelineStep = z.infer<typeof pipelineStepSchema>;
