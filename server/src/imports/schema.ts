// Mapeamento de importação: como um arquivo exportado de qualquer sistema vira
// registros normalizados. É configuração do tenant, criada e testada pela tela;
// o núcleo não conhece nenhum sistema de origem. Cada campo diz de onde vem
// (coluna, posição ou caminho), o tipo e as transformações simples a aplicar.
import { z } from 'zod';

export const CAMPO_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/;
export const tipoCampoSchema = z.enum(['texto', 'numero', 'inteiro', 'data']);
export type TipoCampo = z.infer<typeof tipoCampoSchema>;

export const FORMATOS_DATA = ['dd/mm/aaaa', 'dd-mm-aaaa', 'dd.mm.aaaa', 'aaaa-mm-dd', 'aaaa/mm/dd', 'aaaammdd', 'ddmmaaaa', 'dd/mm/aa'] as const;

export const transformacaoSchema = z.discriminatedUnion('tipo', [
  // "000123 - PARAFUSO" → parte 0 = "000123", parte 1 = "PARAFUSO"
  z.object({ tipo: z.literal('dividir'), separador: z.string().min(1).max(10), parte: z.number().int().min(-5).max(20) }),
  z.object({ tipo: z.literal('substituir'), de: z.string().min(1).max(100), para: z.string().max(100) }),
  z.object({ tipo: z.literal('mapear'), valores: z.record(z.string().max(100), z.string().max(100)) }),   // valor inteiro → outro valor
  z.object({ tipo: z.literal('aparar') }),
  z.object({ tipo: z.literal('maiusculas') }),
  z.object({ tipo: z.literal('minusculas') }),
  z.object({ tipo: z.literal('somenteDigitos') }),
  // Conversão de unidade: multiplica por um fator fixo ou pelo valor de outra coluna.
  z.object({ tipo: z.literal('multiplicar'), fator: z.number().optional(), porOrigem: z.string().max(200).optional() })
    .refine(t => (t.fator === undefined) !== (t.porOrigem === undefined), 'informe fator ou porOrigem'),
  z.object({ tipo: z.literal('dividirPor'), fator: z.number().refine(n => n !== 0, 'fator zero') }),
]);
export type Transformacao = z.infer<typeof transformacaoSchema>;

export const campoMapeadoSchema = z.object({
  campo: z.string().regex(CAMPO_RE, 'use letras, números e _ (começando por letra)'),
  origem: z.string().max(200).optional(),                   // nome da coluna, número da coluna (1, 2...) ou caminho (JSON/XML)
  posicao: z.object({ inicio: z.number().int().min(1), tamanho: z.number().int().min(1).max(1000) }).optional(), // largura fixa
  // Campo que está fora das linhas de dados (título acima do cabeçalho, outra
  // planilha em campo | valor): o valor vale para todos os registros do arquivo.
  doTopo: z.object({ padrao: z.string().min(1).max(300) }).optional(),                    // expressão com um grupo, nas linhas ignoradas do início
  daPlanilha: z.object({ planilha: z.string().max(100), chave: z.string().max(200) }).optional(), // planilha de duas colunas (campo | valor)
  tipo: tipoCampoSchema.default('texto'),
  obrigatorio: z.boolean().default(false),
  transformacoes: z.array(transformacaoSchema).max(10).default([]),
}).refine(c => [c.origem, c.posicao, c.doTopo, c.daPlanilha].filter(x => x !== undefined).length === 1,
  'cada campo vem de um só lugar: origem, posição, doTopo ou daPlanilha');
export type CampoMapeado = z.infer<typeof campoMapeadoSchema>;

export const mapeamentoConfigSchema = z.object({
  formato: z.enum(['csv', 'xlsx', 'txt_largura_fixa', 'json', 'xml']),
  codificacao: z.enum(['utf-8', 'latin1']).default('utf-8'),
  separador: z.string().min(1).max(3).default(';'),        // CSV; "\t" para tabulação
  aspas: z.string().max(1).default('"'),
  planilha: z.string().max(100).optional(),                 // XLSX: padrão é a primeira com dados
  ignorarLinhasInicio: z.number().int().min(0).max(200).default(0),
  ignorarLinhasFim: z.number().int().min(0).max(200).default(0),
  ignorarLinhasQue: z.array(z.string().min(1).max(200)).max(10).default([]),  // expressões: linha de total, subtotal, página
  linhaCabecalho: z.boolean().default(true),                // CSV, XLSX: a primeira linha depois das ignoradas é o cabeçalho
  caminhoRegistros: z.string().max(200).optional(),         // JSON, XML: onde está a lista de registros (a.b.c)
  numero: z.object({ decimal: z.enum([',', '.']).default(','), milhar: z.enum(['.', ',', ' ', '']).default('.') }).prefault({}),
  data: z.enum(FORMATOS_DATA).default('dd/mm/aaaa'),
  campos: z.array(campoMapeadoSchema).min(1).max(100),
}).superRefine((m, ctx) => {
  const seen = new Set<string>();
  m.campos.forEach((c, i) => {
    if (seen.has(c.campo)) ctx.addIssue({ code: 'custom', path: ['campos', i, 'campo'], message: `campo repetido: ${c.campo}` });
    seen.add(c.campo);
    if (m.formato === 'txt_largura_fixa' && c.origem !== undefined) ctx.addIssue({ code: 'custom', path: ['campos', i], message: 'largura fixa: use posição' });
    if (m.formato !== 'txt_largura_fixa' && c.posicao) ctx.addIssue({ code: 'custom', path: ['campos', i], message: 'posição só vale para largura fixa' });
    if (c.daPlanilha && m.formato !== 'xlsx') ctx.addIssue({ code: 'custom', path: ['campos', i], message: 'daPlanilha só vale para XLSX' });
    if (c.doTopo) { try { new RegExp(c.doTopo.padrao); } catch { ctx.addIssue({ code: 'custom', path: ['campos', i, 'doTopo'], message: 'expressão inválida' }); } }
  });
  m.ignorarLinhasQue.forEach((p, i) => { try { new RegExp(p); } catch { ctx.addIssue({ code: 'custom', path: ['ignorarLinhasQue', i], message: 'expressão inválida' }); } });
  if ((m.formato === 'json' || m.formato === 'xml') && m.campos.some(c => c.origem === undefined && !c.doTopo)) {
    ctx.addIssue({ code: 'custom', path: ['campos'], message: 'JSON e XML: cada campo precisa de origem (caminho)' });
  }
});
export type MapeamentoConfig = z.infer<typeof mapeamentoConfigSchema>;

// Conjunto de dados normalizado que um assistente espera: nomes e tipos dos
// campos, nunca o sistema de origem. Os mapeamentos do tenant que entregam os
// campos obrigatórios servem; o assistente pode limitar a alguns (por slug).
export const conjuntoDadosSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,60}$/),
  nome: z.string().min(1).max(120),
  arquivo: z.string().max(200).optional(),                  // quais arquivos tentar (padrão: todos os de dados)
  mapeamentos: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/)).max(50).default([]),
  campos: z.array(z.object({
    campo: z.string().regex(CAMPO_RE),
    nome: z.string().max(120).optional(),
    tipo: tipoCampoSchema.default('texto'),
    obrigatorio: z.boolean().default(true),
  })).min(1).max(100),
});
export type ConjuntoDados = z.infer<typeof conjuntoDadosSchema>;

export interface MapeamentoAtivo { id: string; slug: string; nome: string; versao: number; config: MapeamentoConfig }
