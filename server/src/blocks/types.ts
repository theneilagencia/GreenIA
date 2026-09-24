// Tipos comuns dos blocos de capacidade. Uma execução passa um contexto de bloco
// em bloco; cada bloco acrescenta uma seção ao resultado. Tudo que vai para a
// revisão humana carrega a origem (arquivo, página, linha ou trecho).
import type { FileKind, PipelineStep } from './params.ts';
import type { AssistantDefinition } from '../assistants/schema.ts';
import type { ContentPart, LlmCompletion } from '../llm/provider.ts';
import type { KnowledgeHit } from '../kb/knowledge.ts';
import type { NFe } from './nfe.ts';
import type { Converter } from '../convert/converter.ts';

export interface InputFile { id: string; name: string; mime: string; bytes: Uint8Array; sha256: string }

export interface Sheet {
  name: string;
  header: string[];
  rows: Record<string, string | number | null>[];   // chave = coluna do cabeçalho
  rowNumbers: number[];                             // linha de cada registro na planilha (origem)
}

export interface ReadDoc {
  fileId: string;
  name: string;
  kind: FileKind;
  sha256: string;
  via: 'texto' | 'parser' | 'ocr' | 'visao';       // o mais "caro" usado no arquivo
  pages: { n: number; text: string; via?: 'texto' | 'ocr' | 'visao'; confianca?: number }[];
  convertedFrom?: string;                           // DOC, XLS, ODT, ODS, TIFF, HEIC: formato original
  text: string;
  pageCount: number;                                // páginas processadas (consumo)
  sheets?: Sheet[];
  nfe?: NFe;
  danfe?: { chave: string };                        // PDF de DANFE: chave de acesso de 44 dígitos
  warnings: string[];
}

export interface ReviewFlag { reason: string; ref?: string }

export type SectionKind = 'documentos' | 'campos' | 'divergencias' | 'checklist' | 'classificacao' | 'resposta' | 'busca' | 'resumo' | 'exportacao';

export interface Section {
  id: string;
  bloco: string;
  titulo: string;
  kind: SectionKind;
  data: unknown;
  flags: ReviewFlag[];                              // motivos para a revisão olhar com atenção
  counts?: { divergencias?: number; pendencias?: number };
}

export interface GeneratedFile { name: string; mime: string; bytes: Uint8Array }

// O que os blocos podem usar do ambiente. A chamada ao modelo passa pela
// política de dados e pela contagem de consumo no executor, nunca direto.
export interface BlockEnv {
  complete(req: { system: string; content: ContentPart[]; maxOutputTokens?: number; jsonSchema?: Record<string, unknown>; purpose: string }): Promise<LlmCompletion & { blocked?: string[] }>;
  searchKnowledge(query: string, opts: { areas?: string[]; limit: number }): Promise<KnowledgeHit[]>;
  keyUserContact: string;
  now: () => Date;
  converter?: Converter;                            // OCR e conversões; ausente: indisponível
  visionAllowedByPolicy?: boolean;                  // Política de Uso do cliente (padrão: permite)
  // Confere textos contra a política sem enviar nada; devolve os tipos que impedem
  // enviar a imagem correspondente (bloqueio, aviso não confirmado ou mascaramento).
  screen?(texts: string[]): Promise<string[]>;
  record?(action: string, details: Record<string, unknown>): Promise<void>;
}

export interface RunContext {
  def: AssistantDefinition;
  text: string;
  files: InputFile[];
  docs: ReadDoc[];
  sections: Section[];
  env: BlockEnv;
}

export type Block = (ctx: RunContext, step: PipelineStep) => Promise<Section>;

export class BlockError extends Error {
  constructor(message: string) { super(message); this.name = 'BlockError'; }
}
