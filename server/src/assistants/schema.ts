// Definição de um assistente (uma versão): a melhoria prática empacotada, criada
// e editada no painel, sem deploy. Toda alteração gera nova versão, e cada
// execução registra a versão usada.
//
// v1 (Fase 2): persona, política de dados e retenção. Continua aceita e é
// promovida para v2 na leitura.
// v2 (Fase 3): + objetivo, exemplos, entradas, pipeline de blocos, saída,
// revisão humana e medição.
import { z } from 'zod';
import { Ajv } from 'ajv';
import { dataPolicySchema } from '../tenants/config.ts';
import { checkPolicyAgainstClasses } from '../policy/data-policy.ts';
import { fileKindSchema, pipelineStepSchema } from '../blocks/params.ts';
import { conjuntoDadosSchema } from '../imports/schema.ts';

const ajv = new Ajv({ allErrors: true, strict: false });

// Confere se um JSON Schema compila (o schema da saída e os da extração).
export function jsonSchemaProblem(schema: unknown): string | null {
  try { ajv.compile(schema as object); return null; } catch (e) { return (e as Error).message; }
}

// Indicadores automáticos que a plataforma sabe medir por execução (item 3.4).

const exampleSchema = z.object({
  entrada: z.string().max(20000),
  saida: z.string().max(20000),
  nota: z.string().max(500).optional(),
});

export const assistantDefinitionSchema = z.preprocess(upgrade, z.object({
  schemaVersion: z.literal(2),
  // Identificação (nome, área e status ficam no registro do assistente).
  description: z.string().max(500).default(''),
  owner: z.email().optional(),                              // key user dono da melhoria
  // Instruções.
  objective: z.string().max(2000).default(''),
  instructions: z.string().max(20000).default(''),
  examples: z.array(exampleSchema).max(20).default([]),
  // Entradas.
  inputs: z.object({
    text: z.object({ enabled: z.boolean().default(true), required: z.boolean().default(false), label: z.string().max(120).default('Texto') }).prefault({}),
    files: z.object({
      enabled: z.boolean().default(false),
      required: z.boolean().default(false),
      accept: z.array(fileKindSchema).default(['pdf', 'docx', 'xlsx', 'csv', 'texto']),
      maxFileMb: z.number().int().min(1).max(200).default(20),
      maxFiles: z.number().int().min(1).max(500).default(20),
    }).prefault({}),
    knowledge: z.object({
      enabled: z.boolean().default(false),
      areas: z.array(z.string()).default([]),               // vazio: a área do assistente (mais os documentos gerais)
    }).prefault({}),
  }).prefault({}),
  // Conjuntos de dados normalizados que o assistente espera (ex.: itens de um
  // pedido). Arquivos exportados de qualquer sistema chegam neles pelos
  // mapeamentos de importação do tenant; o assistente nunca cita o sistema de origem.
  dados: z.array(conjuntoDadosSchema).max(10).default([]),
  // Política de dados e retenção das saídas.
  dataClasses: z.array(z.enum(['verde', 'amarela', 'vermelha'])).min(1).default(['verde']),
  dataPolicy: dataPolicySchema.default({}),
  retention: z.object({
    keepOutputs: z.boolean().default(false),                // chat: grava a resposta como evidência?
    days: z.number().int().min(1).max(3650).optional(),     // sem valor: o padrão do tenant (vale também para as execuções)
  }).prefault({}),
  // Leitura de PDF escaneado e foto: OCR local (Tesseract). A visão do modelo
  // só entra como fallback, página a página, quando a confiança do OCR fica
  // abaixo do limiar e esta política permite (e a Política de Uso do cliente
  // não proíbe). Cada uso do fallback vai para a auditoria.
  reading: z.object({
    ocrMinConfidence: z.number().min(0).max(100).default(70),
    visionFallback: z.boolean().default(false),
  }).prefault({}),
  // Sequência de blocos. Vazio: assistente de conversa (Fase 2).
  pipeline: z.array(pipelineStepSchema).max(20).default([]),
  // Saída.
  output: z.object({
    format: z.enum(['texto', 'tabela', 'checklist', 'json', 'arquivo']).default('texto'),
    schema: z.record(z.string(), z.unknown()).optional(),   // JSON Schema da saída (formato json)
    files: z.array(z.enum(['xlsx', 'csv', 'pdf', 'docx', 'zip'])).default([]),
  }).prefault({}),
  // Revisão humana: obrigatória por padrão.
  review: z.object({
    required: z.boolean().default(true),
    reviewers: z.array(z.enum(['revisor', 'key_user', 'admin_cliente'])).min(1).default(['revisor', 'key_user']),
    checklist: z.array(z.string().min(1).max(200)).max(30).default([]), // o que o revisor confere
  }).prefault({}),
  // A medição não é do assistente: é do quick win que o usa (src/quickwins). O
  // campo "metrics" de definições antigas é ignorado na leitura.
})).superRefine((d, ctx) => {
  for (const p of checkPolicyAgainstClasses(d.dataPolicy, d.dataClasses)) {
    ctx.addIssue({ code: 'custom', path: ['dataPolicy', p.type], message: `${p.action}: ${p.reason}` });
  }
  if (d.output.format === 'json') {
    if (!d.output.schema) ctx.addIssue({ code: 'custom', path: ['output', 'schema'], message: 'saída em JSON precisa de schema' });
    else { const e = jsonSchemaProblem(d.output.schema); if (e) ctx.addIssue({ code: 'custom', path: ['output', 'schema'], message: e }); }
  }
  const ids = new Set<string>();
  d.pipeline.forEach((s, i) => {
    if (ids.has(s.id)) ctx.addIssue({ code: 'custom', path: ['pipeline', i, 'id'], message: `id repetido: ${s.id}` });
    ids.add(s.id);
    if (s.bloco === 'extrair') {
      const e = jsonSchemaProblem(s.params.schema);
      if (e) ctx.addIssue({ code: 'custom', path: ['pipeline', i, 'params', 'schema'], message: e });
    }
  });
  // Conjuntos de dados: ids únicos; a conferência só usa conjuntos e campos declarados.
  const conjuntos = new Map(d.dados.map(c => [c.id, new Set(c.campos.map(f => f.campo))]));
  if (conjuntos.size !== d.dados.length) ctx.addIssue({ code: 'custom', path: ['dados'], message: 'id de conjunto repetido' });
  d.pipeline.forEach((s, i) => {
    if (s.bloco !== 'conferir') return;
    const p = s.params as { esquerda: { de: string; conjunto?: string; somar?: { em: string }[] }; direita: { de: string; conjunto?: string; somar?: { em: string }[] }; chave?: { esquerda: string; direita: string }; regras: { esquerda: string; direita: string }[] };
    for (const lado of ['esquerda', 'direita'] as const) {
      const ref = p[lado];
      if (ref.de !== 'importacao') continue;
      const campos = conjuntos.get(ref.conjunto!);
      if (!campos) { ctx.addIssue({ code: 'custom', path: ['pipeline', i, 'params', lado, 'conjunto'], message: `conjunto ${ref.conjunto} não declarado em dados` }); continue; }
      const ok = new Set([...campos, ...(ref.somar ?? []).map(x => x.em)]);
      const usados = [...p.regras.map(r => r[lado]), ...(p.chave ? [p.chave[lado]] : [])];
      for (const u of usados) if (!ok.has(u)) ctx.addIssue({ code: 'custom', path: ['pipeline', i, 'params'], message: `campo ${u} não existe no conjunto ${ref.conjunto}` });
    }
  });
  const needsFiles = d.pipeline.some(s => ['ler', 'extrair', 'checklist', 'classificar'].includes(s.bloco));
  if (needsFiles && !d.inputs.files.enabled) {
    ctx.addIssue({ code: 'custom', path: ['inputs', 'files', 'enabled'], message: 'o pipeline lê arquivos: habilite a entrada de arquivos' });
  }
});

// v1 → v2: os campos da Fase 2 têm o mesmo nome; o resto recebe os padrões.
function upgrade(raw: unknown) {
  if (!raw || typeof raw !== 'object') return { schemaVersion: 2 };
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion === undefined || r.schemaVersion === 1) return { ...r, schemaVersion: 2 };
  return r;
}

export type AssistantDefinition = z.infer<typeof assistantDefinitionSchema>;
