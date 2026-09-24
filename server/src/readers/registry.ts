// Registro de leitores especializados. O núcleo lê formatos genéricos (PDF,
// imagem, Word, Excel, CSV, texto); um leitor acrescenta a leitura de um
// formato de um setor (hoje: XML de NF-e e a chave de acesso de uma DANFE).
// Cada leitor declara o que reconhece e os campos que entrega. O tenant liga
// os leitores que usa (configuração `readers`); quem não lida com nota fiscal
// nunca vê os leitores fiscais, e o núcleo não depende de nenhum deles.
//
// Um leitor pode:
//   kind + matches + read  reconhecer um arquivo inteiro (ex.: XML de NF-e) e
//                          devolver texto e dados estruturados
//   enrich                 acrescentar dados a um documento já lido (ex.: a
//                          chave de acesso no texto de um PDF de DANFE)
//   link                   relacionar documentos da mesma execução (ex.: DANFE
//                          com o XML de mesma chave) e apontar pendências
//   summary                resumo curto dos dados para a lista de documentos
import type { ReadDoc } from '../blocks/types.ts';
import { nfeReader } from './nfe.ts';
import { danfeReader } from './danfe.ts';

export interface ReaderField { caminho: string; descricao: string }

export interface ReaderOutput {
  text: string;
  dados: unknown;
  periodo?: string | null;          // AAAA-MM, quando o formato traz a data do documento
}

export interface Enrichment {
  dados: unknown;
  semExtracao?: string;             // a extração pelo modelo pula este documento, com este motivo
  periodo?: string | null;
}

export interface Link { fileId: string; situacao: string; pendencia?: string }

export interface Reader {
  id: string;
  label: string;
  description: string;
  kind?: { id: string; label: string };         // tipo de arquivo que o leitor acrescenta ao "aceita"
  fields: ReaderField[];
  instruction: string;                          // como tratar o formato em outra plataforma (pacote portátil)
  matches?(text: string, fileName: string): boolean;
  read?(text: string): ReaderOutput;
  enrich?(doc: ReadDoc): Enrichment | null;
  link?(read: ReadDoc[], all: ReadDoc[]): Link[];
  summary?(dados: unknown, doc: ReadDoc): Record<string, unknown>;
}

export const READERS: Reader[] = [nfeReader, danfeReader];

// Definições antigas escreviam o leitor direto em "de" (ex.: { de: 'nfe' }).
export const LEGACY_DATASET_SOURCES: readonly string[] = [nfeReader.id];

export const readerById = (id: string) => READERS.find(r => r.id === id);
export const readerKinds = () => READERS.filter(r => r.kind).map(r => r.kind!);
export const enabledReaders = (ids: readonly string[] | undefined) => READERS.filter(r => (ids ?? []).includes(r.id));

// Leitores que uma definição de assistente usa (pelos tipos aceitos e pelas fontes da conferência).
export function readersUsedBy(def: { inputs: { files: { accept: string[] } }; pipeline: { bloco: string; params: unknown }[] }): string[] {
  const out = new Set<string>();
  for (const r of READERS) if (r.kind && def.inputs.files.accept.includes(r.kind.id)) out.add(r.id);
  for (const s of def.pipeline) {
    if (s.bloco !== 'conferir') continue;
    const p = s.params as { esquerda?: { de?: string; leitor?: string }; direita?: { de?: string; leitor?: string } };
    for (const ref of [p.esquerda, p.direita]) if (ref?.de === 'leitor' && ref.leitor) out.add(ref.leitor);
  }
  return [...out];
}
